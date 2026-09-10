from django.contrib.auth import get_user_model
from rest_framework import status
from rest_framework.authtoken.models import Token
from rest_framework.permissions import AllowAny, IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView

from .models import UserProfile
from .permissions import request_role
from .serializers import (
    LoginSerializer,
    ProfileUpdateSerializer,
    RegisterSerializer,
    RoleChangeSerializer,
    UserSerializer,
)

User = get_user_model()

SUPERADMIN_EMAIL = 'admin@gmail.com'


def _is_superadmin(user):
    """True for the designated superadmin (by is_superuser flag or email)."""
    return user.is_authenticated and (
        user.is_superuser
        or (user.email and user.email.lower() == SUPERADMIN_EMAIL)
    )


class RegisterView(APIView):
    permission_classes = [AllowAny]

    def post(self, request):
        serializer = RegisterSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        user = serializer.save()
        token = Token.objects.create(user=user)
        return Response({'token': token.key, 'user': UserSerializer(user).data}, status=status.HTTP_201_CREATED)


class LoginView(APIView):
    permission_classes = [AllowAny]

    def post(self, request):
        serializer = LoginSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        user = serializer.validated_data['user']
        token, _ = Token.objects.get_or_create(user=user)
        return Response({'token': token.key, 'user': UserSerializer(user).data})


class MeView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request):
        return Response(
            UserSerializer(request.user).data
            | {'effective_role': request_role(request), 'is_superuser': request.user.is_superuser}
        )

    def patch(self, request):
        serializer = ProfileUpdateSerializer(request.user, data=request.data, partial=True)
        serializer.is_valid(raise_exception=True)
        user = serializer.save()
        return Response(UserSerializer(user).data)


class UserListView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request):
        role = request_role(request)
        if role not in {UserProfile.Role.ADMIN, UserProfile.Role.CURATOR}:
            return Response({'detail': 'Ролдорду башкарууга уруксат жок.'}, status=status.HTTP_403_FORBIDDEN)

        qs = User.objects.select_related('role_profile').filter(is_active=True).order_by('first_name', 'email')

        # Superadmin sees everyone (including other admins).
        # Regular admin / curator filter out the superadmin itself to avoid
        # accidental self-lockout, and do not see other admins.
        if not _is_superadmin(request.user):
            if role == UserProfile.Role.ADMIN:
                # Regular admins: see non-superuser accounts only
                qs = qs.filter(is_superuser=False)
            else:
                # Curators: see only non-approved users and mentors
                qs = qs.filter(role_profile__role__in=[UserProfile.Role.USER, UserProfile.Role.MENTOR])

        return Response(UserSerializer(qs, many=True).data)


class ChangeRoleView(APIView):
    permission_classes = [IsAuthenticated]

    def patch(self, request, user_id):
        actor_role = request_role(request)
        actor_is_super = _is_superadmin(request.user)

        # Must be at least ADMIN or CURATOR to use this endpoint
        if actor_role not in {UserProfile.Role.ADMIN, UserProfile.Role.CURATOR}:
            return Response({'detail': 'Ролду өзгөртүүгө уруксат жок.'}, status=status.HTTP_403_FORBIDDEN)

        try:
            target = User.objects.select_related('role_profile').get(id=user_id, is_active=True)
        except User.DoesNotExist:
            return Response({'detail': 'Колдонуучу табылган жок.'}, status=status.HTTP_404_NOT_FOUND)

        # Nobody can change their own role via this endpoint
        if target.id == request.user.id:
            return Response({'detail': 'Өз ролуңузду өзгөртүүгө болбойт.'}, status=status.HTTP_403_FORBIDDEN)

        serializer = RoleChangeSerializer(target, data=request.data, partial=True)
        serializer.is_valid(raise_exception=True)
        new_role = serializer.validated_data['role']

        target_role = getattr(getattr(target, 'role_profile', None), 'role', None)

        # ── Superadmin can change ANY role including ADMIN ──────────────────
        if actor_is_super:
            # Only restriction: cannot demote another superuser (is_superuser flag)
            if target.is_superuser and target.id != request.user.id:
                return Response(
                    {'detail': 'Башка суперпайдалануучунун ролун өзгөртүүгө болбойт.'},
                    status=status.HTTP_403_FORBIDDEN,
                )
            serializer.save()
            target.refresh_from_db()
            return Response(UserSerializer(target).data)

        # ── Regular ADMIN: can assign any role EXCEPT to superusers or other admins ──
        if actor_role == UserProfile.Role.ADMIN:
            if target.is_superuser:
                return Response(
                    {'detail': 'Суперадминдин ролун өзгөртүүгө болбойт.'},
                    status=status.HTTP_403_FORBIDDEN,
                )
            if target_role == UserProfile.Role.ADMIN:
                return Response(
                    {'detail': 'Башка администратордун ролун өзгөртүүгө укугуңуз жок. Бул амалды суперадмин гана жасай алат.'},
                    status=status.HTTP_403_FORBIDDEN,
                )
            if new_role == UserProfile.Role.ADMIN:
                return Response(
                    {'detail': 'Администратор ролун дайындоо үчүн суперадмин болуу керек.'},
                    status=status.HTTP_403_FORBIDDEN,
                )
            serializer.save()
            target.refresh_from_db()
            return Response(UserSerializer(target).data)

        # ── Curator: can only promote/approve a USER to MENTOR ──────────────
        if actor_role == UserProfile.Role.CURATOR:
            if new_role != UserProfile.Role.MENTOR:
                return Response(
                    {'detail': 'Куратор бир гана ментор ролун бере алат.'},
                    status=status.HTTP_403_FORBIDDEN,
                )
            serializer.save()
            target.refresh_from_db()
            return Response(UserSerializer(target).data)

        return Response({'detail': 'Уруксат жок.'}, status=status.HTTP_403_FORBIDDEN)


class DeleteUserView(APIView):
    permission_classes = [IsAuthenticated]

    def delete(self, request, user_id):
        if request_role(request) != UserProfile.Role.ADMIN:
            return Response({'error': 'Тек гана Админ аккаунттарды өчүрө алат!'}, status=status.HTTP_403_FORBIDDEN)

        try:
            target = User.objects.select_related('role_profile').get(id=user_id)
        except User.DoesNotExist:
            return Response({'detail': 'Колдонуучу табылган жок.'}, status=status.HTTP_404_NOT_FOUND)

        # Cannot delete yourself or any superuser
        if target.id == request.user.id or target.is_superuser:
            return Response({'detail': 'Бул аккаунтту өчүрүүгө болбойт.'}, status=status.HTTP_403_FORBIDDEN)

        target_role = getattr(getattr(target, 'role_profile', None), 'role', None)

        # Superadmin can delete anyone except other superusers (already blocked above)
        if _is_superadmin(request.user):
            target.delete()
            return Response(status=status.HTTP_204_NO_CONTENT)

        # Regular admin can only delete CURATOR / MENTOR accounts
        if target_role not in {UserProfile.Role.CURATOR, UserProfile.Role.MENTOR}:
            return Response({'detail': 'Бул аккаунтту өчүрүүгө болбойт.'}, status=status.HTTP_403_FORBIDDEN)

        target.delete()
        return Response(status=status.HTTP_204_NO_CONTENT)
