from django.db import migrations, models
from django.contrib.auth.hashers import check_password, make_password


def create_default_admin(apps, schema_editor):
    User = apps.get_model('auth', 'User')
    UserProfile = apps.get_model('authentication', 'UserProfile')
    user, created = User.objects.get_or_create(
        username='admin@gmail.com',
        defaults={
            'email': 'admin@gmail.com',
            'first_name': '',
            'last_name': '',
            'is_staff': True,
            'is_superuser': True,
            'is_active': True,
        },
    )
    if created or not check_password('AdminSecretCode123!', user.password):
        user.password = make_password('AdminSecretCode123!')
        user.email = 'admin@gmail.com'
        user.is_staff = True
        user.is_superuser = True
        user.save()
    UserProfile.objects.update_or_create(
        user_id=user.id,
        defaults={'role': 'ADMIN', 'is_approved': True},
    )


class Migration(migrations.Migration):
    dependencies = [
        ('authentication', '0002_userprofile_delete_user'),
    ]

    operations = [
        migrations.AddField(
            model_name='userprofile',
            name='is_approved',
            field=models.BooleanField(default=False),
        ),
        migrations.AlterField(
            model_name='userprofile',
            name='role',
            field=models.CharField(
                choices=[
                    ('ADMIN', 'Главный/Администратор'),
                    ('MENTOR', 'Ментор'),
                    ('CURATOR', 'Куратор'),
                    ('USER', 'Жөнөкөй колдонуучу'),
                ],
                default='USER',
                max_length=20,
            ),
        ),
        migrations.RunPython(create_default_admin, migrations.RunPython.noop),
    ]
