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
    def test_create_accountant_command_creates_login_ready_account(self):
        call_command('create_accountant')

        User = get_user_model()
        accountant = User.objects.get(email='accountant@gmail.com')
        self.assertTrue(accountant.is_active)
        self.assertTrue(accountant.check_password('Accountant123!'))
        self.assertEqual(accountant.role_profile.role, UserProfile.Role.ACCOUNTANT)
        self.assertTrue(accountant.role_profile.is_approved)

        login_response = self.client.post('/api/auth/login/', {
            'email': 'accountant@gmail.com',
            'password': 'Accountant123!',
        }, format='json')
        self.assertEqual(login_response.status_code, 200)
        self.assertEqual(login_response.data['user']['role'], UserProfile.Role.ACCOUNTANT)

    def test_create_accountant_command_does_not_restore_inactive_account(self):
        User = get_user_model()
        accountant = User.objects.create_user(
            username='accountant@okurmen.com',
            email='accountant@okurmen.com',
            password='existing-password',
            is_active=False,
        )
        UserProfile.objects.create(user=accountant, role=UserProfile.Role.USER, is_approved=False)

        call_command('create_accountant')

        self.assertEqual(User.objects.filter(email='accountant@gmail.com').count(), 0)
        self.assertEqual(User.objects.filter(email='accountant@okurmen.com').count(), 1)
        accountant.refresh_from_db()
        self.assertFalse(accountant.is_active)
        self.assertTrue(accountant.check_password('existing-password'))
        self.assertEqual(accountant.role_profile.role, UserProfile.Role.USER)
        self.assertFalse(accountant.role_profile.is_approved)
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

        user = get_user_model().objects.get(email='new@example.com')
        self.assertTrue(user.check_password('password123'))
        self.assertNotEqual(user.password, 'password123')

    def test_login_trims_email_before_case_insensitive_lookup(self):
        User = get_user_model()
        User.objects.create_user(
            username='login@example.com',
            email='login@example.com',
            password='password123',
        )

        response = self.client.post('/api/auth/login/', {
            'email': '  LOGIN@EXAMPLE.COM  ',
            'password': 'password123',
        }, format='json')

        self.assertEqual(response.status_code, 200)

    def test_admin_can_delete_curator_or_mentor_account(self):
        User = get_user_model()
        admin = User.objects.create_user(username='admin@example.com', password='password123')
        UserProfile.objects.create(user=admin, role=UserProfile.Role.ADMIN, is_approved=True)
        mentor = User.objects.create_user(username='mentor@example.com', password='password123')
        UserProfile.objects.create(user=mentor, role=UserProfile.Role.MENTOR, is_approved=True)
        self.client.force_authenticate(admin)

        response = self.client.delete(f'/api/users/{mentor.id}/')

        self.assertEqual(response.status_code, 204)
        mentor.refresh_from_db()
        self.assertFalse(mentor.is_active)

    def test_admin_can_update_user_role(self):
        User = get_user_model()
        admin = User.objects.create_user(username='role-admin@example.com', password='password123')
        UserProfile.objects.create(user=admin, role=UserProfile.Role.ADMIN, is_approved=True)
        target = User.objects.create_user(username='role-target@example.com', password='password123')
        UserProfile.objects.create(user=target, role=UserProfile.Role.USER, is_approved=False)
        self.client.force_authenticate(admin)

        response = self.client.patch(
            f'/api/users/{target.id}/change-role/',
            {'role': UserProfile.Role.MENTOR},
            format='json',
        )

        self.assertEqual(response.status_code, 200)
        target.refresh_from_db()
        self.assertEqual(target.role_profile.role, UserProfile.Role.MENTOR)
        self.assertTrue(target.role_profile.is_approved)
        self.assertEqual(response.data['role'], UserProfile.Role.MENTOR)

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
        mentor.refresh_from_db()
        self.assertFalse(mentor.is_active)
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
