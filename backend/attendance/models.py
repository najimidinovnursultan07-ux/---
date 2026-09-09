from django.db import models
from django.contrib.auth.models import User


class StudentGroup(models.Model):
	name = models.CharField(max_length=150)
	mentor = models.ForeignKey(User, on_delete=models.CASCADE, related_name='student_groups')
	created_at = models.DateTimeField(auto_now_add=True)

	class Meta:
		ordering = ['name']

	def __str__(self):
		return f'{self.name} ({self.mentor.get_full_name() or self.mentor.username})'


class Student(models.Model):
	full_name = models.CharField(max_length=255)
	group = models.ForeignKey(
		StudentGroup,
		on_delete=models.CASCADE,
		related_name='students',
		null=True,
		blank=True,
	)
	# Kept for existing records and clients while they migrate to group_id.
	group_name = models.CharField(max_length=100, default='Group A')
	phone = models.CharField(max_length=32, blank=True, default='')
	is_active = models.BooleanField(default=True)
	created_at = models.DateTimeField(auto_now_add=True)

	class Meta:
		ordering = ['full_name']

	def __str__(self):
		return self.full_name


class Attendance(models.Model):
	class AttendanceType(models.TextChoices):
		OFFLINE = 'OFFLINE', 'Оффлайн'
		ONLINE = 'ONLINE', 'Онлайн'

	student = models.ForeignKey(
		Student,
		on_delete=models.CASCADE,
		related_name='attendances',
	)
	date = models.DateField()
	is_present = models.BooleanField(default=False)
	attendance_type = models.CharField(
		max_length=20,
		choices=AttendanceType.choices,
		default=AttendanceType.OFFLINE,
	)
	is_locked = models.BooleanField(default=False)

	class Meta:
		unique_together = ('student', 'date')
		indexes = [models.Index(fields=['date'])]
		ordering = ['student__full_name']

	def __str__(self):
		return f'{self.student.full_name} - {self.date}'
