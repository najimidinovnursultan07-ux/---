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
        return Response(UserSerializer(request.user).data | {'effective_role': request_role(request)})

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
        users = User.objects.select_related('role_profile').filter(is_active=True).order_by('first_name', 'email')
        return Response(UserSerializer(users, many=True).data)


class ChangeRoleView(APIView):
    permission_classes = [IsAuthenticated]

    def patch(self, request, user_id):
        actor_role = request_role(request)
        if actor_role not in {UserProfile.Role.ADMIN, UserProfile.Role.CURATOR}:
            return Response({'detail': 'Ролду өзгөртүүгө уруксат жок.'}, status=status.HTTP_403_FORBIDDEN)

        try:
            target = User.objects.select_related('role_profile').get(id=user_id, is_active=True)
        except User.DoesNotExist:
            return Response({'detail': 'Колдонуучу табылган жок.'}, status=status.HTTP_404_NOT_FOUND)

        serializer = RoleChangeSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        new_role = serializer.validated_data['role']
        if target.is_superuser and actor_role != UserProfile.Role.ADMIN:
            return Response({'detail': 'Бул администратордун ролун өзгөртүүгө болбойт.'}, status=status.HTTP_403_FORBIDDEN)
        if actor_role == UserProfile.Role.CURATOR and new_role != UserProfile.Role.MENTOR:
            return Response({'detail': 'Куратор бир гана ментор ролун бере алат.'}, status=status.HTTP_403_FORBIDDEN)

        profile, _ = UserProfile.objects.get_or_create(user=target)
        profile.role = new_role
        profile.is_approved = new_role != UserProfile.Role.USER
        profile.save(update_fields=['role', 'is_approved'])
        target.refresh_from_db()
        return Response(UserSerializer(target).data)


class DeleteUserView(APIView):
    permission_classes = [IsAuthenticated]

    def delete(self, request, user_id):
        if request_role(request) != UserProfile.Role.ADMIN:
            return Response({'error': 'Тек гана Админ аккаунттарды өчүрө алат!'}, status=status.HTTP_403_FORBIDDEN)

        try:
            target = User.objects.select_related('role_profile').get(id=user_id, is_active=True)
        except User.DoesNotExist:
            return Response({'detail': 'Колдонуучу табылган жок.'}, status=status.HTTP_404_NOT_FOUND)

        target_role = getattr(getattr(target, 'role_profile', None), 'role', None)
        if target.id == request.user.id or target.is_superuser or target_role not in {UserProfile.Role.CURATOR, UserProfile.Role.MENTOR}:
            return Response({'detail': 'Бул аккаунтту өчүрүүгө болбойт.'}, status=status.HTTP_403_FORBIDDEN)

        target.delete()
        return Response(status=status.HTTP_204_NO_CONTENT)
