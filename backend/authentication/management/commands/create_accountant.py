from django.contrib.auth import get_user_model
from django.core.management.base import BaseCommand

from authentication.models import UserProfile


ACCOUNTANT_EMAIL = 'accountant@okurmen.com'
ACCOUNTANT_PASSWORD = 'Accountant123!'


class Command(BaseCommand):
    help = 'Create or update the default Okurmen accountant account.'

    def handle(self, *args, **options):
        User = get_user_model()
        user = (
            User.objects.filter(email__iexact=ACCOUNTANT_EMAIL).first()
            or User.objects.filter(username__iexact=ACCOUNTANT_EMAIL).first()
        )
        created = user is None

        if created:
            user = User.objects.create_user(
                username=ACCOUNTANT_EMAIL,
                email=ACCOUNTANT_EMAIL,
                password=ACCOUNTANT_PASSWORD,
                first_name='Бухгалтер',
                is_active=True,
            )
        else:
            user.is_active = True
            user.save(update_fields=['is_active'])

        profile, _ = UserProfile.objects.get_or_create(user=user)
        profile.role = UserProfile.Role.ACCOUNTANT
        profile.is_approved = True
        profile.save(update_fields=['role', 'is_approved'])

        action = 'created' if created else 'updated'
        self.stdout.write(self.style.SUCCESS(f'Accountant account {action}: {user.email or user.username}'))
