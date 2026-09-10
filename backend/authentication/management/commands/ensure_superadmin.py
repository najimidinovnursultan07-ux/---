"""
ensure_superadmin — идемпотентный скрипт инициализации.

Гарантирует, что аккаунт admin@gmail.com существует в базе данных
и имеет флаги is_superuser=True, is_staff=True, роль ADMIN, is_approved=True.

Вызывается из build.sh при каждом деплое. Если аккаунт уже существует
и настроен правильно — ничего не меняет.

Пароль берётся из переменной окружения ADMIN_PASSWORD.
Если переменная не задана, пароль НЕ изменяется (безопасно для повторных запусков).
"""

import os

from django.contrib.auth import get_user_model
from django.core.management.base import BaseCommand
from django.db import transaction

from authentication.models import UserProfile

ADMIN_EMAIL = 'admin@gmail.com'
ADMIN_USERNAME = 'admin@gmail.com'
DEFAULT_FULL_NAME = 'Администратор'


class Command(BaseCommand):
    help = 'Ensure admin@gmail.com exists as a superuser with ADMIN role. Idempotent.'

    def handle(self, *args, **options):
        User = get_user_model()

        with transaction.atomic():
            # Find by email or username (covers both cases)
            user = (
                User.objects.filter(email__iexact=ADMIN_EMAIL).first()
                or User.objects.filter(username__iexact=ADMIN_USERNAME).first()
            )

            created = False
            if user is None:
                # Create fresh
                password = os.environ.get('ADMIN_PASSWORD', 'Admin123!')
                user = User.objects.create_user(
                    username=ADMIN_USERNAME,
                    email=ADMIN_EMAIL,
                    password=password,
                    first_name=DEFAULT_FULL_NAME,
                    is_active=True,
                )
                created = True
                self.stdout.write(self.style.SUCCESS(
                    f'Superadmin account created: {ADMIN_EMAIL}'
                ))
            else:
                self.stdout.write(self.style.WARNING(
                    f'Superadmin account already exists: {user.email or user.username}'
                ))

            # Enforce superuser / staff flags regardless
            changed_flags = []
            if not user.is_superuser:
                user.is_superuser = True
                changed_flags.append('is_superuser')
            if not user.is_staff:
                user.is_staff = True
                changed_flags.append('is_staff')
            if not user.is_active:
                user.is_active = True
                changed_flags.append('is_active')

            # Apply password from env only on first create (already set above)
            # or if ADMIN_PASSWORD env var is explicitly set on an existing account
            if not created:
                env_password = os.environ.get('ADMIN_PASSWORD')
                if env_password:
                    user.set_password(env_password)
                    changed_flags.append('password')

            if changed_flags:
                update_fields = [f for f in changed_flags if f != 'password']
                update_fields += ['password'] if 'password' in changed_flags else []
                user.save()
                self.stdout.write(self.style.SUCCESS(
                    f'Updated flags on {user.email}: {", ".join(changed_flags)}'
                ))

            # Ensure UserProfile with ADMIN role
            profile, profile_created = UserProfile.objects.get_or_create(user=user)
            profile_changed = []
            if profile.role != UserProfile.Role.ADMIN:
                profile.role = UserProfile.Role.ADMIN
                profile_changed.append('role → ADMIN')
            if not profile.is_approved:
                profile.is_approved = True
                profile_changed.append('is_approved → True')
            if profile_changed:
                profile.save(update_fields=['role', 'is_approved'])
                self.stdout.write(self.style.SUCCESS(
                    f'UserProfile updated: {", ".join(profile_changed)}'
                ))
            elif profile_created:
                self.stdout.write(self.style.SUCCESS('UserProfile created with ADMIN role.'))
            else:
                self.stdout.write('UserProfile already correct. No changes.')

        self.stdout.write(self.style.SUCCESS('ensure_superadmin complete.'))
