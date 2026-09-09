from django.db import migrations, models


class Migration(migrations.Migration):
    dependencies = [
        ('attendance', '0002_student_created_at_student_group_name_student_phone_and_more'),
    ]

    operations = [
        migrations.AddField(
            model_name='attendance',
            name='is_locked',
            field=models.BooleanField(default=False),
        ),
    ]
