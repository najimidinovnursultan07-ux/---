from django.db.models import Count, Q
from django.utils import timezone
from django.utils.dateparse import parse_date
from rest_framework.response import Response
from rest_framework.views import APIView

from authentication.permissions import IsAccountantOrAdmin

from attendance.models import Attendance


ATTENDANCE_RATE = 150


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
                lessons_count=Count('date', distinct=True),
                attendance_count=Count('id', filter=Q(is_present=True)),
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
                'salary_amount': attendance_count * ATTENDANCE_RATE,
            })

        return Response({
            'start_date': start_date,
            'end_date': end_date,
            'rate': ATTENDANCE_RATE,
            'rows': rows,
        })
