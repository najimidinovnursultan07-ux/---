from rest_framework.permissions import BasePermission

from .models import UserProfile


def request_role(request):
    if not request.user.is_authenticated:
        return None
    if request.user.is_superuser:
        return UserProfile.Role.ADMIN
    profile = getattr(request.user, 'role_profile', None)
    return profile.role if profile and profile.is_approved else None


class IsAdminUserRole(BasePermission):
    message = 'Администратордун уруксаты керек.'

    def has_permission(self, request, view):
        return request.user.is_authenticated and request_role(request) == UserProfile.Role.ADMIN


class IsAccountantOrAdmin(BasePermission):
    message = 'Бухгалтердин же администратордун уруксаты керек.'

    def has_permission(self, request, view):
        return request.user.is_authenticated and request_role(request) in {UserProfile.Role.ACCOUNTANT, UserProfile.Role.ADMIN}


class IsMentorOrAdmin(BasePermission):
    message = 'Ментор же администратордун уруксаты керек.'

    def has_permission(self, request, view):
        return request.user.is_authenticated and request_role(request) in {UserProfile.Role.ADMIN, UserProfile.Role.MENTOR}


class IsMentor(BasePermission):
    message = 'Ментордун уруксаты керек.'

    def has_permission(self, request, view):
        return request.user.is_authenticated and request_role(request) == UserProfile.Role.MENTOR


class IsCurator(BasePermission):
    message = 'Куратордун уруксаты керек.'

    def has_permission(self, request, view):
        return request.user.is_authenticated and request_role(request) in {UserProfile.Role.ADMIN, UserProfile.Role.CURATOR}


class IsApprovedUser(BasePermission):
    message = 'Аккаунтуңузга уруксат бериле элек.'

    def has_permission(self, request, view):
        return request.user.is_authenticated and request_role(request) in {
            UserProfile.Role.ADMIN,
            UserProfile.Role.ACCOUNTANT,
            UserProfile.Role.CURATOR,
            UserProfile.Role.MENTOR,
        }
