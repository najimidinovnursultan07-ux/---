"""
Payroll calculation service.

Single source of truth for all mentor salary logic.

Formula:
  total_salary = (offline_count + online_count) * base_rate
               + online_count  * online_bonus
               + offline_count * offline_bonus

Only attendance records with is_present=True AND
attendance_type IN ('OFFLINE', 'ONLINE') are counted.
Records with is_present=False are NEVER included.

Global defaults (override per-mentor via MentorRate model):
  DEFAULT_BASE_RATE    = 150 KGS / присутствие
  DEFAULT_ONLINE_BONUS = 0
  DEFAULT_OFFLINE_BONUS= 0
"""

from decimal import Decimal

from django.db.models import Count, Q

from attendance.models import Attendance

DEFAULT_BASE_RATE: Decimal     = Decimal('150')
DEFAULT_ONLINE_BONUS: Decimal  = Decimal('0')
DEFAULT_OFFLINE_BONUS: Decimal = Decimal('0')


# ── Rate helpers ──────────────────────────────────────────────────────────────

def _get_rate(mentor) -> dict:
    """Return effective rate for mentor (custom or global default)."""
    try:
        r = mentor.mentor_rate
        return {
            'base_rate':     Decimal(str(r.base_rate)),
            'online_bonus':  Decimal(str(r.online_bonus)),
            'offline_bonus': Decimal(str(r.offline_bonus)),
            'notes':         r.notes,
        }
    except Exception:
        return {
            'base_rate':     DEFAULT_BASE_RATE,
            'online_bonus':  DEFAULT_ONLINE_BONUS,
            'offline_bonus': DEFAULT_OFFLINE_BONUS,
            'notes':         '',
        }


def _calc(offline: int, online: int, rate: dict) -> dict:
    """
    Return salary breakdown for given counts and rate.
    Absent students are NOT passed in — only offline + online counts.
    """
    base   = rate['base_rate']
    ob     = rate['online_bonus']
    fb     = rate['offline_bonus']

    offline_earn = Decimal(str(offline)) * (base + fb)
    online_earn  = Decimal(str(online))  * (base + ob)
    total        = offline_earn + online_earn

    return {
        'offline_count':   offline,
        'online_count':    online,
        'lessons_count':   offline + online,   # total paid lessons
        'base_rate':       float(base),
        'online_bonus':    float(ob),
        'offline_bonus':   float(fb),
        'offline_earnings': float(offline_earn),
        'online_earnings':  float(online_earn),
        'total_salary':    float(total),
    }


# ── Public API ────────────────────────────────────────────────────────────────

def calculate_payroll(start_date, end_date, mentor_id=None) -> dict:
    """
    Calculate payroll for all active mentors over the given date range.

    Returns only counts for OFFLINE and ONLINE attendance (is_present=True).
    Absent records are completely ignored.

    Response shape:
    {
      'start_date': date,
      'end_date':   date,
      'mentors': [{
        'mentor_id':   int,
        'mentor_name': str,
        'base_rate':   float,
        'online_bonus':  float,
        'offline_bonus': float,
        'notes': str,
        'groups': [{
          'group_id':        int,
          'group_name':      str,
          'lessons_count':   int,   # offline + online
          'offline_count':   int,
          'online_count':    int,
          'offline_earnings': float,
          'online_earnings':  float,
          'total_salary':    float,
        }],
        'totals': { ...same fields summed across groups },
      }],
      'grand_total': float,
    }
    """
    from django.contrib.auth import get_user_model
    User = get_user_model()

    mentors_qs = (
        User.objects
        .filter(role_profile__role='MENTOR', is_active=True)
        .select_related('mentor_rate', 'role_profile')
        .order_by('first_name', 'last_name', 'username')
    )
    if mentor_id:
        mentors_qs = mentors_qs.filter(pk=mentor_id)

    # One query: only present (OFFLINE/ONLINE) attendance per group
    att_qs = (
        Attendance.objects
        .filter(
            date__range=(start_date, end_date),
            is_present=True,
            attendance_type__in=['OFFLINE', 'ONLINE'],
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
            offline_count=Count('id', filter=Q(attendance_type='OFFLINE')),
            online_count=Count('id',  filter=Q(attendance_type='ONLINE')),
        )
        .order_by('student__group__name')
    )
    if mentor_id:
        att_qs = att_qs.filter(student__group__mentor_id=mentor_id)

    # Index by mentor_id
    groups_by_mentor: dict[int, list] = {}
    for row in att_qs:
        groups_by_mentor.setdefault(row['student__group__mentor_id'], []).append(row)

    mentors_out = []
    grand_total: Decimal = Decimal('0')

    for mentor in mentors_qs:
        rate         = _get_rate(mentor)
        mentor_name  = mentor.get_full_name() or mentor.username
        groups_out   = []
        tot_offline  = 0
        tot_online   = 0

        for g in groups_by_mentor.get(mentor.id, []):
            offline = g['offline_count'] or 0
            online  = g['online_count']  or 0
            bd      = _calc(offline, online, rate)
            bd['group_id']   = g['student__group_id']
            bd['group_name'] = g['student__group__name']
            groups_out.append(bd)
            tot_offline += offline
            tot_online  += online

        totals = _calc(tot_offline, tot_online, rate)
        grand_total += Decimal(str(totals['total_salary']))

        mentors_out.append({
            'mentor_id':     mentor.id,
            'mentor_name':   mentor_name,
            'base_rate':     float(rate['base_rate']),
            'online_bonus':  float(rate['online_bonus']),
            'offline_bonus': float(rate['offline_bonus']),
            'notes':         rate['notes'],
            'groups':        groups_out,
            'totals':        totals,
        })

    return {
        'start_date':  start_date,
        'end_date':    end_date,
        'mentors':     mentors_out,
        'grand_total': float(grand_total),
    }
