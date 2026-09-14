from django.contrib import admin
from django.shortcuts import redirect
from django.urls import path
from django.utils.html import format_html

from .models import Attendance, Student, StudentGroup


class FullAccessMixin:
    """Mixin that grants all staff users full delete/add/change permissions."""

    def has_delete_permission(self, request, obj=None):
        return request.user.is_staff

    def has_add_permission(self, request):
        return request.user.is_staff

    def has_change_permission(self, request, obj=None):
        return request.user.is_staff


# ─── StudentGroup ─────────────────────────────────────────────────────────────

@admin.register(StudentGroup)
class StudentGroupAdmin(FullAccessMixin, admin.ModelAdmin):
    list_display    = ('name', 'mentor_display', 'student_count', 'created_at')
    list_filter     = ('mentor',)
    search_fields   = ('name', 'mentor__first_name', 'mentor__last_name', 'mentor__email')
    ordering        = ('name',)
    readonly_fields = ('created_at',)

    def mentor_display(self, obj):
        return obj.mentor.get_full_name() or obj.mentor.username
    mentor_display.short_description = 'Ментор'

    def student_count(self, obj):
        return obj.students.filter(is_active=True).count()
    student_count.short_description = 'Студентов'


# ─── Student ──────────────────────────────────────────────────────────────────

@admin.register(Student)
class StudentAdmin(FullAccessMixin, admin.ModelAdmin):
    list_display    = ('full_name', 'group', 'phone', 'is_active', 'created_at')
    list_filter     = ('is_active', 'group')
    search_fields   = ('full_name', 'phone', 'group__name')
    ordering        = ('full_name',)
    list_editable   = ('is_active',)
    readonly_fields = ('created_at',)

    # ── Extra URL for PDF upload ──────────────────────────────────────────────

    def get_urls(self):
        urls = super().get_urls()
        custom = [
            path(
                'import-pdf/',
                self.admin_site.admin_view(self.pdf_import_view),
                name='attendance_student_import_pdf',
            ),
        ]
        return custom + urls

    def pdf_import_view(self, request):
        """
        GET  → show an inline HTML upload form.
        POST → parse uploaded PDF and bulk-create students.
        """
        from django.contrib import messages
        from django.http import HttpResponse

        if request.method == 'GET':
            groups = StudentGroup.objects.order_by('name')
            options = ''.join(
                f'<option value="{g.pk}">{g.name}</option>'
                for g in groups
            )
            html = f"""
<!DOCTYPE html>
<html>
<head>
  <title>PDF-ден студенттерди импорттоо</title>
  <link rel="stylesheet" href="/static/admin/css/base.css">
  <style>
    body {{ padding: 2rem; }}
    .import-form {{ max-width: 540px; }}
    .import-form label {{ display: block; margin-top: 1rem; font-weight: bold; }}
    .import-form select,
    .import-form input[type=file] {{ margin-top: .4rem; width: 100%; padding: .5rem; border: 1px solid #ccc; border-radius: 4px; }}
    .import-form button {{ margin-top: 1.5rem; background: #FF6B00; color: white; border: none;
                           padding: .7rem 2rem; border-radius: 4px; font-size: 1rem; cursor: pointer; }}
    .import-form button:hover {{ background: #e55f00; }}
    .back {{ margin-bottom: 1rem; }}
  </style>
</head>
<body>
  <div id="content-main">
    <p class="back"><a href="../">← Студенттер тизмесине кайтуу</a></p>
    <h1>📄 PDF-ден студенттерди импорттоо</h1>
    <p>PDF файлда ФИО тизмеси же таблица болушу керек.</p>
    <form class="import-form" enctype="multipart/form-data" method="post">
      <input type="hidden" name="csrfmiddlewaretoken" value="{request.META.get('CSRF_COOKIE', '')}">
      <label for="pdf_file">PDF файлды тандаңыз:</label>
      <input type="file" id="pdf_file" name="file" accept=".pdf" required>
      <label for="group_id">Тайпа (группа):</label>
      <select id="group_id" name="group_id">
        <option value="">— Тайпасыз —</option>
        {options}
      </select>
      <button type="submit">Импорттоо</button>
    </form>
  </div>
</body>
</html>"""
            return HttpResponse(html)

        # POST — process the uploaded PDF
        if request.method != 'POST':
            return redirect('..')

        pdf_file = request.FILES.get('file')
        if not pdf_file:
            messages.error(request, 'PDF файл жөнөтүлгөн жок.')
            return redirect('.')

        group = None
        group_id = request.POST.get('group_id')
        if group_id:
            try:
                group = StudentGroup.objects.get(pk=int(group_id))
            except (StudentGroup.DoesNotExist, ValueError):
                messages.error(request, f'Группа #{group_id} табылган жок.')
                return redirect('.')

        # Parse PDF using shared utility
        try:
            from .pdf_import import extract_students_from_pdf
            parsed = extract_students_from_pdf(pdf_file.read())
        except Exception as exc:
            messages.error(request, f'PDF файлды окуу мүмкүн болгон жок: {exc}')
            return redirect('.')

        if not parsed:
            messages.warning(request, 'PDF файлда студент аттары табылган жок.')
            return redirect('.')

        created_count = 0
        skipped_count = 0
        for item in parsed:
            full_name = item['full_name']
            phone     = item.get('phone', '')
            qs = Student.objects.filter(full_name__iexact=full_name, is_active=True)
            if group:
                qs = qs.filter(group=group)
            if qs.exists():
                skipped_count += 1
                continue
            Student.objects.create(
                full_name=full_name,
                phone=phone,
                group=group,
                group_name=group.name if group else '',
                is_active=True,
            )
            created_count += 1

        messages.success(
            request,
            f'Студенттер ийгиликтүү импорттолду! '
            f'Кошулду: {created_count}, өткөрүлдү (дубликат): {skipped_count}.'
        )
        return redirect('..')

    # ── Changelist: add "Import from PDF" link ────────────────────────────────

    def changelist_view(self, request, extra_context=None):
        extra_context = extra_context or {}
        extra_context['pdf_import_url'] = 'import-pdf/'
        return super().changelist_view(request, extra_context=extra_context)

    def get_queryset(self, request):
        return super().get_queryset(request).select_related('group', 'group__mentor')


# ─── Attendance ───────────────────────────────────────────────────────────────

@admin.register(Attendance)
class AttendanceAdmin(FullAccessMixin, admin.ModelAdmin):
    list_display   = ('student', 'group_display', 'date', 'is_present', 'attendance_type', 'is_locked')
    list_filter    = ('is_present', 'attendance_type', 'is_locked', 'date')
    search_fields  = ('student__full_name', 'student__group__name')
    ordering       = ('-date', 'student__full_name')
    list_editable  = ('is_present', 'attendance_type', 'is_locked')
    date_hierarchy = 'date'

    actions = ['wipe_all_attendance']

    def wipe_all_attendance(self, request, queryset):
        total, _ = Attendance.objects.all().delete()
        self.message_user(request, f'✓ Удалено {total} записей посещаемости. Зарплата = 0.')
    wipe_all_attendance.short_description = '⚠️ УДАЛИТЬ ВСЕ записи посещаемости (зарплата → 0)'

    def group_display(self, obj):
        return obj.student.group.name if obj.student.group_id else obj.student.group_name
    group_display.short_description = 'Группа'

    def get_queryset(self, request):
        return super().get_queryset(request).select_related(
            'student', 'student__group', 'student__group__mentor',
        )
