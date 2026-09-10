"""
Payroll models.

MentorRate stores the per-mentor salary configuration.
All monetary amounts are in KGS (Kyrgyz Som).
"""

from django.conf import settings
from django.core.validators import MinValueValidator
from django.db import models


class MentorRate(models.Model):
    """
    Per-mentor salary configuration.

    When a MentorRate row exists for a mentor, its values override the
    global defaults defined in payroll/service.py.  If no row exists,
    the service falls back to the global defaults.

    Fields
    ------
    mentor          : 1-to-1 link to the Django auth User (must have MENTOR role).
    base_rate       : KGS earned per student attendance mark.
    online_bonus    : Additional KGS per ONLINE attendance mark on top of base_rate.
    offline_bonus   : Additional KGS per OFFLINE attendance mark on top of base_rate.
    notes           : Free-text notes for the accountant (e.g. contract details).
    updated_at      : Auto-updated timestamp.
    """

    mentor = models.OneToOneField(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name='mentor_rate',
        verbose_name='Ментор',
    )
    base_rate = models.DecimalField(
        max_digits=10,
        decimal_places=2,
        default=150,
        validators=[MinValueValidator(0)],
        verbose_name='Базовая ставка (сом / посещение)',
    )
    online_bonus = models.DecimalField(
        max_digits=10,
        decimal_places=2,
        default=0,
        validators=[MinValueValidator(0)],
        verbose_name='Онлайн-бонус (сом / посещение)',
    )
    offline_bonus = models.DecimalField(
        max_digits=10,
        decimal_places=2,
        default=0,
        validators=[MinValueValidator(0)],
        verbose_name='Оффлайн-бонус (сом / посещение)',
    )
    notes = models.TextField(
        blank=True,
        default='',
        verbose_name='Примечание',
    )
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        verbose_name = 'Ставка ментора'
        verbose_name_plural = 'Ставки менторов'
        ordering = ['mentor__first_name', 'mentor__last_name']

    def __str__(self):
        name = self.mentor.get_full_name() or self.mentor.username
        return f'{name} — {self.base_rate} KGS/посещение'
