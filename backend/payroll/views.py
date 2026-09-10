"""
Payroll API views.

Endpoints
---------
GET /api/payroll/                        → full payroll for all mentors
GET /api/payroll/?mentor_id=X            → payroll for one mentor
GET /api/payroll/rates/                  → list all MentorRate configs
POST/PUT /api/payroll/rates/<mentor_id>/ → upsert a MentorRate config
"""

from decimal import Decimal, InvalidOperation

from django.contrib.auth import get_user_model
from rest_framework.response import Response
from rest_framework.views import APIView

from authentication.permissions import IsAccountantOrAdmin
from .models import MentorRate
from .service import calculate_payroll, DEFAULT_BASE_RATE, DEFAULT_ONLINE_BONUS, DEFAULT_OFFLINE_BONUS

from django.utils import timezone
from django.utils.dateparse import parse_date


User = get_user_model()


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


class PayrollListView(APIView):
    """
    GET /api/payroll/
    GET /api/payroll/?mentor_id=<id>
    GET /api/payroll/?start_date=YYYY-MM-DD&end_date=YYYY-MM-DD
    """
    permission_classes = [IsAccountantOrAdmin]

    def get(self, request):
        start_date, end_date, error = _period_from_request(request)
        if error:
            return Response({'detail': error}, status=400)

        mentor_id = request.query_params.get('mentor_id') or None

        result = calculate_payroll(start_date, end_date, mentor_id=mentor_id)
        return Response(result)


class MentorRateListView(APIView):
    """
    GET /api/payroll/rates/   → list all mentor rate configs with defaults shown
    """
    permission_classes = [IsAccountantOrAdmin]

    def get(self, request):
        mentors = (
            User.objects
            .filter(role_profile__role='MENTOR', is_active=True)
            .select_related('mentor_rate')
            .order_by('first_name', 'last_name', 'username')
        )
        data = []
        for mentor in mentors:
            try:
                rate = mentor.mentor_rate
                data.append({
                    'mentor_id': mentor.id,
                    'mentor_name': mentor.get_full_name() or mentor.username,
                    'base_rate': float(rate.base_rate),
                    'online_bonus': float(rate.online_bonus),
                    'offline_bonus': float(rate.offline_bonus),
                    'notes': rate.notes,
                    'is_custom': True,
                })
            except MentorRate.DoesNotExist:
                data.append({
                    'mentor_id': mentor.id,
                    'mentor_name': mentor.get_full_name() or mentor.username,
                    'base_rate': float(DEFAULT_BASE_RATE),
                    'online_bonus': float(DEFAULT_ONLINE_BONUS),
                    'offline_bonus': float(DEFAULT_OFFLINE_BONUS),
                    'notes': '',
                    'is_custom': False,
                })
        return Response({'rates': data, 'defaults': {
            'base_rate': float(DEFAULT_BASE_RATE),
            'online_bonus': float(DEFAULT_ONLINE_BONUS),
            'offline_bonus': float(DEFAULT_OFFLINE_BONUS),
        }})


class MentorRateDetailView(APIView):
    """
    PUT /api/payroll/rates/<mentor_id>/   → upsert rate config for one mentor
    DELETE /api/payroll/rates/<mentor_id>/→ reset to global defaults
    """
    permission_classes = [IsAccountantOrAdmin]

    def _parse_decimal(self, value, field_name):
        try:
            d = Decimal(str(value))
            if d < 0:
                raise ValueError
            return d, None
        except (InvalidOperation, ValueError, TypeError):
            return None, f'{field_name} должно быть неотрицательным числом.'

    def put(self, request, mentor_id):
        try:
            mentor = User.objects.get(pk=mentor_id, is_active=True, role_profile__role='MENTOR')
        except User.DoesNotExist:
            return Response({'detail': 'Ментор не найден.'}, status=404)

        base_rate, err = self._parse_decimal(request.data.get('base_rate', DEFAULT_BASE_RATE), 'base_rate')
        if err:
            return Response({'detail': err}, status=400)
        online_bonus, err = self._parse_decimal(request.data.get('online_bonus', DEFAULT_ONLINE_BONUS), 'online_bonus')
        if err:
            return Response({'detail': err}, status=400)
        offline_bonus, err = self._parse_decimal(request.data.get('offline_bonus', DEFAULT_OFFLINE_BONUS), 'offline_bonus')
        if err:
            return Response({'detail': err}, status=400)

        rate, _ = MentorRate.objects.update_or_create(
            mentor=mentor,
            defaults={
                'base_rate': base_rate,
                'online_bonus': online_bonus,
                'offline_bonus': offline_bonus,
                'notes': request.data.get('notes', ''),
            },
        )
        return Response({
            'mentor_id': mentor.id,
            'mentor_name': mentor.get_full_name() or mentor.username,
            'base_rate': float(rate.base_rate),
            'online_bonus': float(rate.online_bonus),
            'offline_bonus': float(rate.offline_bonus),
            'notes': rate.notes,
            'is_custom': True,
        })

    def delete(self, request, mentor_id):
        try:
            mentor = User.objects.get(pk=mentor_id, is_active=True)
        except User.DoesNotExist:
            return Response({'detail': 'Ментор не найден.'}, status=404)
        MentorRate.objects.filter(mentor=mentor).delete()
        return Response(status=204)
