"""
fix_attendance_types — одноразовый скрипт миграции данных.

ПРОБЛЕМА:
  Старый журнал (AttendanceTable с чекбоксами) сохранял is_present=True
  с дефолтным attendance_type='OFFLINE', не требуя явного выбора формата.
  Из-за этого в расчёт зарплаты попадают записи, где ментор/студент
  фактически не выбирал "Оффлайн" или "Онлайн".

  Новый журнал (DailyJournal с двумя кнопками) требует явного выбора:
  OFFLINE или ONLINE. Если ничего не выбрано → is_present=False.

ИСПРАВЛЕНИЕ:
  По умолчанию считаем, что все старые записи с is_present=True
  и attendance_type='OFFLINE' (дефолт) созданы старым кодом и
  НЕ являются явным выбором, поэтому сбрасываем их в is_present=False.

  Исключение: если ментор явно пересохранил запись через новый журнал
  после деплоя (дата >= NEW_UI_DATE), она остаётся нетронутой.

ИСПОЛЬЗОВАНИЕ:
  python manage.py fix_attendance_types --dry-run   # показать что будет
  python manage.py fix_attendance_types --yes        # применить
  python manage.py fix_attendance_types --mentor-email нурсултан@email.com --yes
  python manage.py fix_attendance_types --reset-month 2026-09 --yes
"""

from datetime import date
import calendar

from django.core.management.base import BaseCommand, CommandError
from django.db import transaction
from django.utils import timezone

from attendance.models import Attendance


# Дата деплоя нового журнала — записи ПОСЛЕ этой даты считаются "явными"
# и трогаться не будут.
NEW_UI_DATE = date(2026, 9, 12)  # дата последнего деплоя DailyJournal


class Command(BaseCommand):
    help = (
        'Сброс записей посещаемости, созданных старым кодом (is_present=True '
        'с дефолтным attendance_type=OFFLINE без явного выбора ментора). '
        'Эти записи будут помечены как is_present=False.'
    )

    def add_arguments(self, parser):
        parser.add_argument(
            '--yes',
            action='store_true',
            help='Подтвердить выполнение (без интерактивного запроса).',
        )
        parser.add_argument(
            '--dry-run',
            action='store_true',
            help='Показать что будет изменено, без реального изменения.',
        )
        parser.add_argument(
            '--mentor-email',
            type=str,
            default=None,
            help='Ограничить сброс одним ментором (по email).',
        )
        parser.add_argument(
            '--reset-month',
            type=str,
            default=None,
            help='Ограничить сброс конкретным месяцем в формате YYYY-MM (например: 2026-09).',
        )
        parser.add_argument(
            '--before-date',
            type=str,
            default=None,
            help=(
                'Трогать только записи ДО указанной даты (YYYY-MM-DD). '
                f'По умолчанию: {NEW_UI_DATE} (дата деплоя нового журнала).'
            ),
        )

    def handle(self, *args, **options):
        from django.contrib.auth import get_user_model
        User = get_user_model()

        # ── Определяем "before date" ────────────────────────────────────────
        before_date_str = options.get('before_date')
        if before_date_str:
            try:
                before_date = date.fromisoformat(before_date_str)
            except ValueError:
                raise CommandError(f'Неверный формат даты: {before_date_str}. Ожидается YYYY-MM-DD.')
        else:
            before_date = NEW_UI_DATE

        # ── Базовый queryset: только записи с дефолтным типом ───────────────
        # "Подозрительные" записи: is_present=True, attendance_type='OFFLINE',
        # дата СТРОГО ДО before_date (созданы старым кодом).
        qs = Attendance.objects.filter(
            is_present=True,
            attendance_type='OFFLINE',
            date__lt=before_date,
        ).select_related('student__group__mentor')

        # ── Фильтр по ментору ────────────────────────────────────────────────
        mentor_email = options.get('mentor_email')
        if mentor_email:
            try:
                mentor = User.objects.get(email__iexact=mentor_email)
            except User.DoesNotExist:
                raise CommandError(f'Пользователь с email "{mentor_email}" не найден.')
            qs = qs.filter(student__group__mentor=mentor)
            self.stdout.write(f'Фильтр ментора: {mentor.get_full_name() or mentor.email}')

        # ── Фильтр по месяцу ─────────────────────────────────────────────────
        reset_month = options.get('reset_month')
        if reset_month:
            try:
                year, month_num = map(int, reset_month.split('-'))
                _, last_day = calendar.monthrange(year, month_num)
                month_start = date(year, month_num, 1)
                month_end = date(year, month_num, last_day)
            except (ValueError, TypeError):
                raise CommandError(f'Неверный формат месяца: {reset_month}. Ожидается YYYY-MM.')
            qs = qs.filter(date__range=(month_start, month_end))
            self.stdout.write(f'Фильтр месяца: {month_start} – {month_end}')

        count = qs.count()

        self.stdout.write(
            f'Найдено {count} записей is_present=True с дефолтным OFFLINE до {before_date}.'
        )

        if count == 0:
            self.stdout.write(self.style.SUCCESS('Нечего исправлять. Готово.'))
            return

        if options['dry_run']:
            # Показать первые 20 для проверки
            for rec in qs[:20]:
                mentor_name = (
                    rec.student.group.mentor.get_full_name()
                    if rec.student.group_id else '—'
                )
                self.stdout.write(
                    f'  [{rec.date}] {rec.student.full_name} | ментор: {mentor_name}'
                )
            if count > 20:
                self.stdout.write(f'  ... и ещё {count - 20} записей.')
            self.stdout.write(self.style.WARNING('Dry run завершён. Данные не изменены.'))
            return

        if not options['yes']:
            confirm = input(
                f'\nСбросить {count} записей (is_present → False)? Введите YES для подтверждения: '
            ).strip()
            if confirm != 'YES':
                raise CommandError('Отменено. Данные не изменены.')

        with transaction.atomic():
            updated = qs.update(is_present=False, is_locked=False)

        self.stdout.write(
            self.style.SUCCESS(f'Готово. Сброшено {updated} записей → is_present=False.')
        )
        self.stdout.write(
            'Теперь в бухгалтерии будут учитываться только явно выбранные Оффлайн/Онлайн статусы.'
        )
