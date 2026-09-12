from datetime import date as date_type
import calendar

from django.db.models import Count, Q
from django.utils import timezone
from django.utils.dateparse import parse_date
from rest_framework.response import Response
from rest_framework.views import APIView
from rest_framework import status as http_status

from authentication.permissions import IsAccountantOrAdmin, IsAdminUserRole

from attendance.models import Attendance


ATTENDANCE_RATE = 150

# Дата деплоя нового DailyJournal (двухкнопочный журнал без кнопки "Келген жок").
# Записи ДО этой даты с дефолтным OFFLINE могут быть артефактами старого кода.
NEW_UI_DATE = date_type(2026, 9, 12)


def _period_from_request(request):
    today = timezone.localdate()
    start_date = parse_date(request.query_params.get('start_date', ''))
    end_date = parse_date(request.query_params.get('end_date', ''))

    if not start_date and not end_date:
        start_date = today.replace(day=1)
        end_date = today
    elif not start_date or not end_date:
        return None, None, 'start_date и end_date должны быть указаны вместе.'
    elif start_date > end_date:
        return None, None, 'start_date не может быть позже end_date.'

    return start_date, end_date, None


class SalaryListView(APIView):
    permission_classes = [IsAccountantOrAdmin]

    def get(self, request):
        start_date, end_date, error = _period_from_request(request)
        if error:
            return Response({'detail': error}, status=400)

        grouped_rows = (
            Attendance.objects
            .filter(date__range=(start_date, end_date), student__group__mentor__role_profile__role='MENTOR')
            .values(
                'student__group__mentor_id',
                'student__group__mentor__first_name',
                'student__group__mentor__last_name',
                'student__group__mentor__username',
                'student__group_id',
                'student__group__name',
            )
            .annotate(
                lessons_count=Count(
                    'date',
                    distinct=True,
                    filter=Q(is_present=True, attendance_type__in=['OFFLINE', 'ONLINE']),
                ),
                offline_count=Count('id', filter=Q(is_present=True, attendance_type='OFFLINE')),
                online_count=Count('id', filter=Q(is_present=True, attendance_type='ONLINE')),
                attendance_count=Count(
                    'id',
                    filter=Q(is_present=True, attendance_type__in=['OFFLINE', 'ONLINE']),
                ),
                absent_count=Count('id', filter=Q(is_present=False)),
            )
            .order_by('student__group__mentor__first_name', 'student__group__mentor__last_name', 'student__group__name')
        )

        rows = []
        for row in grouped_rows:
            mentor_name = ' '.join(
                part for part in (
                    row['student__group__mentor__first_name'],
                    row['student__group__mentor__last_name'],
                ) if part
            ) or row['student__group__mentor__username']
            attendance_count = row['attendance_count']
            rows.append({
                'mentor_id': row['student__group__mentor_id'],
                'mentor_name': mentor_name,
                'group_id': row['student__group_id'],
                'group_name': row['student__group__name'],
                'lessons_count': row['lessons_count'],
                'attendance_count': attendance_count,
                'offline_count': row['offline_count'],
                'online_count': row['online_count'],
                'absent_count': row['absent_count'],
                'salary_amount': attendance_count * ATTENDANCE_RATE,
            })

        return Response({
            'start_date': start_date,
            'end_date': end_date,
            'rate': ATTENDANCE_RATE,
            'rows': rows,
        })


class ResetAttendanceView(APIView):
    """
    POST /api/finance/reset-attendance/

    Сбрасывает записи посещаемости, созданные старым кодом — то есть записи
    где is_present=True но attendance_type='OFFLINE' (дефолт), поставленные
    ДО даты деплоя нового журнала (NEW_UI_DATE).

    Тело запроса (все поля опциональны):
      {
        "mentor_id": 42,          // ограничить одним ментором
        "month": "2026-09",       // ограничить месяцем YYYY-MM
        "before_date": "2026-09-12"  // переопределить граничную дату
      }

    Возвращает количество сброшенных записей.
    """
    permission_classes = [IsAdminUserRole]

    def post(self, request):
        from django.contrib.auth import get_user_model
        User = get_user_model()

        # Определяем граничную дату
        before_date_str = request.data.get('before_date')
        if before_date_str:
            before_date = parse_date(before_date_str)
            if not before_date:
                return Response({'detail': 'Неверный формат before_date. Ожидается YYYY-MM-DD.'}, status=400)
        else:
            before_date = NEW_UI_DATE

        # Базовый queryset: старые "случайные" OFFLINE записи
        qs = Attendance.objects.filter(
            is_present=True,
            attendance_type='OFFLINE',
            date__lt=before_date,
        )

        # Фильтр по ментору
        mentor_id = request.data.get('mentor_id')
        if mentor_id:
            qs = qs.filter(student__group__mentor_id=mentor_id)

        # Фильтр по месяцу
        month_str = request.data.get('month')  # "2026-09"
        if month_str:
            try:
                year, month_num = map(int, month_str.split('-'))
                _, last_day = calendar.monthrange(year, month_num)
                qs = qs.filter(
                    date__range=(
                        date_type(year, month_num, 1),
                        date_type(year, month_num, last_day),
                    )
                )
            except (ValueError, TypeError):
                return Response({'detail': 'Неверный формат month. Ожидается YYYY-MM.'}, status=400)

        count = qs.count()
        qs.update(is_present=False, is_locked=False)

        return Response({
            'reset_count': count,
            'before_date': str(before_date),
            'mentor_id': mentor_id,
            'month': month_str,
            'detail': f'Сброшено {count} записей. Зарплата теперь считается только по явным Оффлайн/Онлайн отметкам.',
        })
