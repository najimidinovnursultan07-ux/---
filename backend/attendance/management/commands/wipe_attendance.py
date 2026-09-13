"""
wipe_attendance — удаляет ВСЕ записи посещаемости из базы данных.

После выполнения зарплата всех менторов становится строго 0 сом.
Менторы должны заново отметить занятия через журнал (Оффлайн / Онлайн).

Использование:
  python manage.py wipe_attendance --yes
  python manage.py wipe_attendance --dry-run
"""

from django.core.management.base import BaseCommand, CommandError
from django.db import transaction

from attendance.models import Attendance
from payroll.models import MentorRate


class Command(BaseCommand):
    help = 'Wipe ALL attendance records (salary → 0). Irreversible.'

    def add_arguments(self, parser):
        parser.add_argument('--yes', action='store_true', help='Confirm without prompt.')
        parser.add_argument('--dry-run', action='store_true', help='Show counts without deleting.')
        parser.add_argument('--wipe-rates', action='store_true', help='Also reset all MentorRate overrides.')

    def handle(self, *args, **options):
        att_count  = Attendance.objects.count()
        rate_count = MentorRate.objects.count() if options['wipe_rates'] else 0

        self.stdout.write(f'Attendance records : {att_count}')
        if options['wipe_rates']:
            self.stdout.write(f'MentorRate overrides: {rate_count}')

        if options['dry_run']:
            self.stdout.write(self.style.WARNING('Dry run — nothing deleted.'))
            return

        if not options['yes']:
            answer = input(
                f'Delete ALL {att_count} attendance records'
                + (f' and {rate_count} rate overrides' if options['wipe_rates'] else '')
                + '? Type YES to confirm: '
            ).strip()
            if answer != 'YES':
                raise CommandError('Cancelled.')

        with transaction.atomic():
            deleted_att, _  = Attendance.objects.all().delete()
            deleted_rate = 0
            if options['wipe_rates']:
                deleted_rate, _ = MentorRate.objects.all().delete()

        self.stdout.write(self.style.SUCCESS(
            f'Done. Deleted {deleted_att} attendance records'
            + (f' and {deleted_rate} rate overrides' if options['wipe_rates'] else '')
            + '. All mentor salaries are now 0 сом.'
        ))
