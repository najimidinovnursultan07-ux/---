from django.contrib.auth import get_user_model
from django.core.management.base import BaseCommand

from authentication.models import UserProfile


ACCOUNTANT_EMAIL = 'accountant@okurmen.com'
ACCOUNTANT_GMAIL = 'accountant@gmail.com'
ACCOUNTANT_PASSWORD = 'Accountant123!'


class Command(BaseCommand):
    help = 'Create the default Okurmen accountant account once.'

    def handle(self, *args, **options):
        User = get_user_model()
        user = (
            User.objects.filter(email__iexact=ACCOUNTANT_GMAIL).first()
            or User.objects.filter(username__iexact=ACCOUNTANT_GMAIL).first()
            or User.objects.filter(email__iexact=ACCOUNTANT_EMAIL).first()
            or User.objects.filter(username__iexact=ACCOUNTANT_EMAIL).first()
        )
        if user is not None:
            status = 'inactive' if not user.is_active else 'already exists'
            self.stdout.write(
                self.style.WARNING(
                    f'Accountant account {status}: {user.email or user.username}. No changes made.'
                )
            )
            return

        user = User.objects.create_user(
            username=ACCOUNTANT_GMAIL,
            email=ACCOUNTANT_GMAIL,
            password=ACCOUNTANT_PASSWORD,
            first_name='Бухгалтер',
            is_active=True,
        )

        profile, _ = UserProfile.objects.get_or_create(user=user)
        profile.role = UserProfile.Role.ACCOUNTANT
        profile.is_approved = True
        profile.save(update_fields=['role', 'is_approved'])

        self.stdout.write(self.style.SUCCESS(f'Accountant account created: {user.email or user.username}'))
