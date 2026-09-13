from django.contrib import admin

from .models import Attendance, Student, StudentGroup


class FullAccessMixin:
    """Mixin that grants all staff users full delete/add/change permissions."""

    def has_delete_permission(self, request, obj=None):
        return request.user.is_staff

    def has_add_permission(self, request):
        return request.user.is_staff

    def has_change_permission(self, request, obj=None):
        return request.user.is_staff


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


@admin.register(Student)
class StudentAdmin(FullAccessMixin, admin.ModelAdmin):
    list_display    = ('full_name', 'group', 'phone', 'is_active', 'created_at')
    list_filter     = ('is_active', 'group')
    search_fields   = ('full_name', 'phone', 'group__name')
    ordering        = ('full_name',)
    list_editable   = ('is_active',)
    readonly_fields = ('created_at',)

    def get_queryset(self, request):
        return super().get_queryset(request).select_related('group', 'group__mentor')


@admin.register(Attendance)
class AttendanceAdmin(FullAccessMixin, admin.ModelAdmin):
    list_display   = ('student', 'group_display', 'date', 'is_present', 'attendance_type', 'is_locked')
    list_filter    = ('is_present', 'attendance_type', 'is_locked', 'date')
    search_fields  = ('student__full_name', 'student__group__name')
    ordering       = ('-date', 'student__full_name')
    list_editable  = ('is_present', 'attendance_type', 'is_locked')
    date_hierarchy = 'date'

    # Custom action: wipe all attendance records
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
