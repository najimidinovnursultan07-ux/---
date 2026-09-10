from django.db import migrations, models


class Migration(migrations.Migration):
    dependencies = [
        ('authentication', '0003_role_approval_and_admin'),
    ]

    operations = [
        migrations.AlterField(
            model_name='userprofile',
            name='role',
            field=models.CharField(
                choices=[
                    ('ADMIN', 'Главный/Администратор'),
                    ('ACCOUNTANT', 'Бухгалтер'),
                    ('MENTOR', 'Ментор'),
                    ('CURATOR', 'Куратор'),
                    ('USER', 'Жөнөкөй колдонуучу'),
                ],
                default='USER',
                max_length=20,
            ),
        ),
    ]
