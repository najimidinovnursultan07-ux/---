from django.contrib.auth import get_user_model
from django.core.management import call_command
from django.core.management.base import CommandError
from datetime import date
from io import StringIO
from unittest.mock import patch
from rest_framework.test import APITestCase

from authentication.models import UserProfile
from attendance.models import Attendance, Student, StudentGroup


class AuthenticationApiTests(APITestCase):
    def test_register_returns_field_errors(self):
        response = self.client.post('/api/auth/register/', {
            'full_name': ' ',
            'email': 'invalid',
            'password': '123',
        }, format='json')

        self.assertEqual(response.status_code, 400)
        self.assertIn('full_name', response.data)
        self.assertIn('email', response.data)
        self.assertIn('password', response.data)

    def test_register_rejects_duplicate_email(self):
        User = get_user_model()
        User.objects.create_user(username='existing@example.com', email='existing@example.com', password='password123')

        response = self.client.post('/api/auth/register/', {
            'full_name': 'Existing User',
            'email': 'EXISTING@example.com',
            'password': 'password123',
        }, format='json')

        self.assertEqual(response.status_code, 400)
        self.assertIn('email', response.data)

    def test_registration_creates_locked_user(self):
        response = self.client.post('/api/auth/register/', {
            'full_name': 'New User',
            'email': 'new@example.com',
            'password': 'password123',
        }, format='json')

        self.assertEqual(response.status_code, 201)
        self.assertEqual(response.data['user']['role'], UserProfile.Role.USER)
        self.assertFalse(response.data['user']['is_approved'])

    def test_admin_can_delete_curator_or_mentor_account(self):
        User = get_user_model()
        admin = User.objects.create_user(username='admin@example.com', password='password123')
        UserProfile.objects.create(user=admin, role=UserProfile.Role.ADMIN, is_approved=True)
        mentor = User.objects.create_user(username='mentor@example.com', password='password123')
        UserProfile.objects.create(user=mentor, role=UserProfile.Role.MENTOR, is_approved=True)
        self.client.force_authenticate(admin)

        response = self.client.delete(f'/api/users/{mentor.id}/')

        self.assertEqual(response.status_code, 204)
        self.assertFalse(User.objects.filter(id=mentor.id).exists())

    def test_non_admin_cannot_delete_user_account(self):
        User = get_user_model()
        mentor = User.objects.create_user(username='mentor-delete@example.com', password='password123')
        UserProfile.objects.create(user=mentor, role=UserProfile.Role.MENTOR, is_approved=True)
        target = User.objects.create_user(username='target@example.com', password='password123')
        UserProfile.objects.create(user=target, role=UserProfile.Role.CURATOR, is_approved=True)
        self.client.force_authenticate(mentor)

        response = self.client.delete(f'/api/auth/users/{target.id}/')

        self.assertEqual(response.status_code, 403)
        self.assertTrue(User.objects.filter(id=target.id).exists())

    def test_reset_data_preserves_admin_and_deletes_client_data(self):
        User = get_user_model()
        admin = User.objects.create_user(username='handover-admin@example.com', password='AdminPassword123!')
        admin_profile = UserProfile.objects.create(user=admin, role=UserProfile.Role.ADMIN, is_approved=True)
        mentor = User.objects.create_user(username='handover-mentor@example.com', password='password123')
        UserProfile.objects.create(user=mentor, role=UserProfile.Role.MENTOR, is_approved=True)
        group = StudentGroup.objects.create(name='Handover Group', mentor=mentor)
        student = Student.objects.create(full_name='Handover Student', group=group)
        Attendance.objects.create(student=student, date=date.today())

        output = StringIO()
        call_command('reset_data', '--yes', stdout=output)

        admin.refresh_from_db()
        admin_profile.refresh_from_db()
        self.assertTrue(admin.is_active)
        self.assertTrue(admin.check_password('AdminPassword123!'))
        self.assertEqual(admin_profile.role, UserProfile.Role.ADMIN)
        self.assertFalse(User.objects.filter(id=mentor.id).exists())
        self.assertFalse(Attendance.objects.exists())
        self.assertFalse(Student.objects.exists())
        self.assertFalse(StudentGroup.objects.exists())
        self.assertIn('Admin accounts were preserved.', output.getvalue())

    def test_reset_data_requires_explicit_confirmation(self):
        output = StringIO()

        with patch('builtins.input', return_value='NO'):
            with self.assertRaises(CommandError):
                call_command('reset_data', stdout=output)

        self.assertIn('Attendance: 0', output.getvalue())
