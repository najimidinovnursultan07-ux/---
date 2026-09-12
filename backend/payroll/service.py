"""
Payroll calculation service.

This is the single source of truth for all salary logic.
Views and management commands should import from here — never calculate
salary amounts directly in views.

Salary formula per group (for a given period):
  base_earnings   = offline_count * (base_rate + offline_bonus)
                  + online_count  * (base_rate + online_bonus)
  total_salary    = base_earnings   (deductions can be added later)

Global defaults (used when no MentorRate row exists for a mentor):
  DEFAULT_BASE_RATE    = 150 KGS per attendance
  DEFAULT_ONLINE_BONUS = 0
  DEFAULT_OFFLINE_BONUS= 0
"""

from decimal import Decimal

from django.db.models import Count, Q

from attendance.models import Attendance, StudentGroup

# ── Global defaults ───────────────────────────────────────────────────────────
DEFAULT_BASE_RATE: Decimal = Decimal('150')
DEFAULT_ONLINE_BONUS: Decimal = Decimal('0')
DEFAULT_OFFLINE_BONUS: Decimal = Decimal('0')


# ── Internal helpers ──────────────────────────────────────────────────────────

def _get_rate(mentor) -> dict:
    """
    Return the effective rate config for *mentor*.
    Tries mentor.mentor_rate (MentorRate), falls back to global defaults.
    """
    try:
        rate = mentor.mentor_rate
        return {
            'base_rate': Decimal(str(rate.base_rate)),
            'online_bonus': Decimal(str(rate.online_bonus)),
            'offline_bonus': Decimal(str(rate.offline_bonus)),
            'notes': rate.notes,
        }
    except Exception:
        return {
            'base_rate': DEFAULT_BASE_RATE,
            'online_bonus': DEFAULT_ONLINE_BONUS,
            'offline_bonus': DEFAULT_OFFLINE_BONUS,
            'notes': '',
        }


def _calc_breakdown(offline_count: int, online_count: int, rate: dict) -> dict:
    """
    Return a structured breakdown dict given attendance counts and a rate config.
    """
    base_rate = rate['base_rate']
    online_bonus = rate['online_bonus']
    offline_bonus = rate['offline_bonus']

    offline_earnings = Decimal(str(offline_count)) * (base_rate + offline_bonus)
    online_earnings = Decimal(str(online_count)) * (base_rate + online_bonus)
    base_earnings = offline_earnings + online_earnings

    # Placeholder for future deductions (tax, advances, etc.)
    deductions: Decimal = Decimal('0')

    total = base_earnings - deductions

    return {
        'offline_count': offline_count,
        'online_count': online_count,
        'present_count': offline_count + online_count,
        'base_rate': float(base_rate),
        'online_bonus': float(online_bonus),
        'offline_bonus': float(offline_bonus),
        'offline_earnings': float(offline_earnings),
        'online_earnings': float(online_earnings),
        'base_earnings': float(base_earnings),
        'deductions': float(deductions),
        'total_salary': float(total),
    }


# ── Public API ────────────────────────────────────────────────────────────────

def calculate_payroll(start_date, end_date, mentor_id=None) -> dict:
    """
    Calculate payroll for all mentors (or a single mentor if mentor_id is given)
    over the specified date range.

    Returns
    -------
    {
        'start_date': date,
        'end_date': date,
        'mentors': [
            {
                'mentor_id': int,
                'mentor_name': str,
                'base_rate': float,
                'online_bonus': float,
                'offline_bonus': float,
                'notes': str,
                'groups': [
                    {
                        'group_id': int,
                        'group_name': str,
                        'lessons_count': int,
                        'offline_count': int,
                        'online_count': int,
                        'present_count': int,
                        'offline_earnings': float,
                        'online_earnings': float,
                        'base_earnings': float,
                        'deductions': float,
                        'total_salary': float,
                    }, ...
                ],
                'totals': {breakdown summed across all groups},
            }, ...
        ],
        'grand_total': float,
    }
    """
    from django.contrib.auth import get_user_model
    User = get_user_model()

    # Build mentor queryset
    mentors_qs = (
        User.objects
        .filter(role_profile__role='MENTOR', is_active=True)
        .select_related('mentor_rate', 'role_profile')
        .order_by('first_name', 'last_name', 'username')
    )
    if mentor_id:
        mentors_qs = mentors_qs.filter(pk=mentor_id)

    # Fetch all relevant attendance stats in one query per group
    att_qs = (
        Attendance.objects
        .filter(
            date__range=(start_date, end_date),
            student__group__mentor__role_profile__role='MENTOR',
            student__group__mentor__is_active=True,
            student__is_active=True,
        )
        .values(
            'student__group__mentor_id',
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
            absent_count=Count('id', filter=Q(is_present=False)),
        )
        .order_by('student__group__name')
    )
    if mentor_id:
        att_qs = att_qs.filter(student__group__mentor_id=mentor_id)

    # Index by mentor_id → list of group rows
    groups_by_mentor: dict[int, list] = {}
    for row in att_qs:
        mid = row['student__group__mentor_id']
        groups_by_mentor.setdefault(mid, []).append(row)

    mentors_out = []
    grand_total: Decimal = Decimal('0')

    for mentor in mentors_qs:
        rate = _get_rate(mentor)
        mentor_name = mentor.get_full_name() or mentor.username

        groups_out = []
        mentor_offline = 0
        mentor_online = 0
        mentor_lessons = 0

        for grow in groups_by_mentor.get(mentor.id, []):
            offline = grow['offline_count'] or 0
            online = grow['online_count'] or 0
            lessons = grow['lessons_count'] or 0
            absent = grow['absent_count'] or 0
            bd = _calc_breakdown(offline, online, rate)
            bd['group_id'] = grow['student__group_id']
            bd['group_name'] = grow['student__group__name']
            bd['lessons_count'] = lessons
            bd['absent_count'] = absent
            groups_out.append(bd)
            mentor_offline += offline
            mentor_online += online
            mentor_lessons += lessons

        mentor_totals = _calc_breakdown(mentor_offline, mentor_online, rate)
        mentor_totals['lessons_count'] = mentor_lessons

        grand_total += Decimal(str(mentor_totals['total_salary']))

        mentors_out.append({
            'mentor_id': mentor.id,
            'mentor_name': mentor_name,
            'base_rate': rate['base_rate'],
            'online_bonus': rate['online_bonus'],
            'offline_bonus': rate['offline_bonus'],
            'notes': rate['notes'],
            'groups': groups_out,
            'totals': mentor_totals,
        })

    return {
        'start_date': start_date,
        'end_date': end_date,
        'mentors': mentors_out,
        'grand_total': float(grand_total),
    }
