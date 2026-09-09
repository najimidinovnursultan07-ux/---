from datetime import date

from django.contrib.auth import get_user_model
from rest_framework.test import APITestCase

from authentication.models import UserProfile

from attendance.models import Attendance, Student, StudentGroup


class AttendanceApiTests(APITestCase):
	def setUp(self):
		User = get_user_model()
		self.user = User.objects.create_user(
			username='mentor@example.com',
			email='mentor@example.com',
			password='password123',
		)
		UserProfile.objects.create(
			user=self.user,
			role=UserProfile.Role.MENTOR,
			is_approved=True,
		)
		self.group = StudentGroup.objects.create(name='Mentor Group', mentor=self.user)
		self.client.force_authenticate(self.user)

	def test_approved_user_can_create_student_and_daily_record(self):
		response = self.client.post('/api/students/', {'full_name': 'Test Student', 'group_id': self.group.id}, format='json')

		self.assertEqual(response.status_code, 201)
		student = Student.objects.get(id=response.data['id'])
		self.assertTrue(Attendance.objects.filter(student=student, date=date.today()).exists())

	def test_bulk_save_and_daily_fetch_preserve_status(self):
		student = Student.objects.create(full_name='Test Student', group=self.group)
		response = self.client.post('/api/attendance/save-bulk/', {
			'date': date.today().isoformat(),
			'records': [{'student_id': student.id, 'is_present': True}],
		}, format='json')

		self.assertEqual(response.status_code, 200)
		daily = self.client.get('/api/attendance/', {'date': date.today().isoformat()})
		record = next(item for item in daily.data if item['student_id'] == student.id)
		self.assertTrue(record['is_present'])

	def test_mode_save_updates_present_attendance(self):
		student = Student.objects.create(full_name='Online Student', group=self.group)
		self.client.post('/api/attendance/save-bulk/', {
			'date': date.today().isoformat(),
			'records': [{'student_id': student.id, 'is_present': True}],
		}, format='json')
		response = self.client.post('/api/attendance/save-mode/', {
			'date': date.today().isoformat(),
			'records': [{'student_id': student.id, 'attendance_type': 'ONLINE'}],
		}, format='json')

		self.assertEqual(response.status_code, 200)
		self.assertEqual(Attendance.objects.get(student=student, date=date.today()).attendance_type, 'ONLINE')

	def test_pdf_report_contains_only_present_students(self):
		curator = get_user_model().objects.create_user(username='curator@example.com', password='password123')
		UserProfile.objects.create(user=curator, role=UserProfile.Role.CURATOR, is_approved=True)
		self.client.force_authenticate(curator)
		present_student = Student.objects.create(full_name='Келген Окуучу', group_name='А-1')
		Student.objects.create(full_name='Келбеген Окуучу', group_name='А-1')
		Attendance.objects.filter(student=present_student, date=date.today()).update(is_present=True)

		response = self.client.get('/api/attendance/report-pdf/', {'date': date.today().isoformat()})

		self.assertEqual(response.status_code, 200)
		self.assertEqual(response['Content-Type'], 'application/pdf')
		self.assertIn(b'%PDF', response.content[:20])

	def test_history_returns_three_month_matrix(self):
		response = self.client.get('/api/attendance/history/', {'months': 3})

		self.assertEqual(response.status_code, 403)

	def test_mentor_can_soft_delete_student_in_owned_group(self):
		group = StudentGroup.objects.create(name='A-1', mentor=self.user)
		student = Student.objects.create(full_name='Удаляемый Окуучу', group=group)
		Attendance.objects.create(student=student, date=date.today())

		response = self.client.delete(f'/api/students/{student.id}/')

		self.assertEqual(response.status_code, 204)
		student.refresh_from_db()
		self.assertFalse(student.is_active)
		self.assertTrue(Attendance.objects.filter(student=student).exists())

	def test_mentor_cannot_delete_student_from_another_group(self):
		other_mentor = get_user_model().objects.create_user(username='other-mentor@example.com', password='password123')
		other_group = StudentGroup.objects.create(name='B-1', mentor=other_mentor)
		student = Student.objects.create(full_name='Башка Топ Окуучусу', group=other_group)

		response = self.client.delete(f'/api/students/{student.id}/')

		self.assertEqual(response.status_code, 403)
		student.refresh_from_db()
		self.assertTrue(student.is_active)

	def test_mentor_cannot_view_or_update_another_mentors_students(self):
		other_mentor = get_user_model().objects.create_user(username='isolated@example.com', password='password123')
		other_group = StudentGroup.objects.create(name='Isolated Group', mentor=other_mentor)
		student = Student.objects.create(full_name='Жашырылган Окуучу', group=other_group)

		students_response = self.client.get('/api/students/')
		update_response = self.client.patch(f'/api/students/{student.id}/', {'full_name': 'Өзгөртүлгөн'}, format='json')

		self.assertEqual(students_response.status_code, 200)
		self.assertNotIn(student.id, [item['id'] for item in students_response.data])
		self.assertEqual(update_response.status_code, 404)

	def test_students_endpoint_filters_by_group(self):
		other_group = StudentGroup.objects.create(name='Filtered Group', mentor=self.user)
		included = Student.objects.create(full_name='Тандалган Окуучу', group=other_group)
		Student.objects.create(full_name='Башка Окуучу', group=self.group)

		response = self.client.get('/api/students/', {'group_id': other_group.id})

		self.assertEqual(response.status_code, 200)
		self.assertEqual([item['id'] for item in response.data], [included.id])

	def test_curator_can_view_groups_but_cannot_create_students(self):
		curator = get_user_model().objects.create_user(username='curator-rbac@example.com', password='password123')
		UserProfile.objects.create(user=curator, role=UserProfile.Role.CURATOR, is_approved=True)
		self.client.force_authenticate(curator)

		groups_response = self.client.get('/api/groups/')
		student_response = self.client.post('/api/students/', {'full_name': 'Куратор Окуучусу', 'group_id': self.group.id}, format='json')

		self.assertEqual(groups_response.status_code, 200)
		self.assertEqual(student_response.status_code, 403)

	def test_mentor_group_delete_deactivates_students_and_preserves_attendance(self):
		student = Student.objects.create(full_name='Тайпа Окуучусу', group=self.group)
		attendance = Attendance.objects.create(student=student, date=date.today(), is_present=True)

		response = self.client.delete(f'/api/groups/{self.group.id}/')

		self.assertEqual(response.status_code, 204)
		student.refresh_from_db()
		self.assertFalse(student.is_active)
		self.assertIsNone(student.group_id)
		self.assertEqual(student.group_name, 'Mentor Group')
		self.assertTrue(Attendance.objects.filter(id=attendance.id, is_present=True).exists())

	def test_admin_is_read_only_for_students_and_groups(self):
		admin = get_user_model().objects.create_user(username='admin-observer@example.com', password='password123')
		UserProfile.objects.create(user=admin, role=UserProfile.Role.ADMIN, is_approved=True)
		self.client.force_authenticate(admin)

		student_response = self.client.post('/api/students/', {'full_name': 'Admin Student', 'group_id': self.group.id}, format='json')
		group_response = self.client.post('/api/groups/', {'name': 'Admin Group', 'mentor_id': self.user.id}, format='json')

		self.assertEqual(student_response.status_code, 403)
		self.assertEqual(group_response.status_code, 403)
