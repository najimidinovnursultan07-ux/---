from django.conf import settings
from django.db import models


class UserProfile(models.Model):
    class Role(models.TextChoices):
        ADMIN = 'ADMIN', 'Главный/Администратор'
        MENTOR = 'MENTOR', 'Ментор'
        CURATOR = 'CURATOR', 'Куратор'
        USER = 'USER', 'Жөнөкөй колдонуучу'

    user = models.OneToOneField(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name='role_profile',
    )
    role = models.CharField(
        max_length=20,
        choices=Role.choices,
        default=Role.USER,
    )
    is_approved = models.BooleanField(default=False)

    def __str__(self):
        return self.user.get_full_name() or self.user.username
