from django.contrib.auth import get_user_model
from django.core.management.base import BaseCommand, CommandError
from django.db import transaction

from authentication.models import UserProfile
from attendance.models import Attendance, Student, StudentGroup


User = get_user_model()


class Command(BaseCommand):
    help = 'Safely reset attendance data and deactivate Mentor/Curator accounts while preserving Admin accounts.'

    def add_arguments(self, parser):
        parser.add_argument(
            '--yes',
            action='store_true',
            help='Confirm the destructive reset without an interactive prompt.',
        )
        parser.add_argument(
            '--dry-run',
            action='store_true',
            help='Show what would be deleted without changing the database.',
        )

    def handle(self, *args, **options):
        attendance_count = Attendance.objects.count()
        student_count = Student.objects.count()
        group_count = StudentGroup.objects.count()
        user_queryset = User.objects.filter(
            role_profile__role__in={UserProfile.Role.MENTOR, UserProfile.Role.CURATOR},
            is_superuser=False,
        ).exclude(role_profile__role=UserProfile.Role.ADMIN)
        user_count = user_queryset.count()

        self.stdout.write(
            f'Attendance: {attendance_count}; students: {student_count}; '
            f'groups: {group_count}; Mentor/Curator users: {user_count}.'
        )

        if options['dry_run']:
            self.stdout.write(self.style.WARNING('Dry run complete. No data was changed.'))
            return

        if not options['yes']:
            confirmation = input(
                'This permanently deletes attendance, students, and groups and deactivates Mentor/Curator users. '
                'Type RESET to continue: '
            ).strip()
            if confirmation != 'RESET':
                raise CommandError('Reset cancelled. Nothing was changed.')

        with transaction.atomic():
            Attendance.objects.all().delete()
            Student.objects.all().delete()
            StudentGroup.objects.all().delete()
            user_queryset.update(is_active=False)

        self.stdout.write(
            self.style.SUCCESS(
                f'Reset complete. Deleted {attendance_count} attendance records, '
                f'{student_count} students, {group_count} groups, and '
                f'{user_count} Mentor/Curator users. Admin accounts were preserved.'
            )
        )
