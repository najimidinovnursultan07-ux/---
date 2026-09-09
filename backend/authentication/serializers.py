from django.contrib.auth import get_user_model
from django.db import transaction
from rest_framework import serializers

from .models import UserProfile

User = get_user_model()


class UserSerializer(serializers.ModelSerializer):
    full_name = serializers.SerializerMethodField()
    role = serializers.CharField(source='role_profile.role', read_only=True)
    is_approved = serializers.BooleanField(source='role_profile.is_approved', read_only=True)

    class Meta:
        model = User
        fields = ['id', 'full_name', 'email', 'role', 'is_approved']

    def get_full_name(self, user):
        return user.get_full_name()


class RegisterSerializer(serializers.ModelSerializer):
    full_name = serializers.CharField(
        source='first_name',
        required=True,
        allow_blank=False,
        error_messages={
            'blank': 'Аты-жөнүңүздү жазыңыз!',
            'required': 'Аты-жөнүңүздү жазыңыз!',
            'max_length': 'Аты-жөнүңүз 150 символдон ашпашы керек.',
        },
    )
    email = serializers.EmailField(
        required=True,
        error_messages={
            'invalid': 'Туура эмес email форматы (мисалы: example@gmail.com)!',
            'blank': 'Email киргизиңиз!',
            'required': 'Email киргизиңиз!',
        },
    )
    password = serializers.CharField(
        write_only=True,
        min_length=6,
        error_messages={
            'min_length': 'Пароль кеминде 6 символдон турушу керек!',
            'blank': 'Пароль жазыңыз!',
            'required': 'Пароль жазыңыз!',
        },
    )

    class Meta:
        model = User
        fields = ['full_name', 'email', 'password']

    def validate_full_name(self, value):
        value = value.strip()
        if not value:
            raise serializers.ValidationError('Аты-жөнүңүздү жазыңыз!')
        return value

    def validate_email(self, value):
        value = value.strip().lower()
        if User.objects.filter(username__iexact=value).exists() or User.objects.filter(email__iexact=value).exists():
            raise serializers.ValidationError('Бул email менен аккаунт мурда түзүлгөн! Кирүү барагына өтүңүз.')
        return value

    def create(self, validated_data):
        full_name = validated_data.pop('first_name')
        with transaction.atomic():
            user = User.objects.create_user(
                username=validated_data['email'],
                email=validated_data['email'],
                password=validated_data['password'],
                first_name=full_name,
            )
            UserProfile.objects.create(user=user, role=UserProfile.Role.USER, is_approved=False)
        return user


class LoginSerializer(serializers.Serializer):
    email = serializers.EmailField()
    password = serializers.CharField(write_only=True)

    def validate(self, attrs):
        email = attrs['email'].lower()
        user = User.objects.filter(email__iexact=email).first()
        if not user or not user.check_password(attrs['password']):
            raise serializers.ValidationError('Email же сырсөз туура эмес.')
        if not user.is_active:
            raise serializers.ValidationError('Бул аккаунт өчүрүлгөн.')
        attrs['user'] = user
        return attrs


class RoleChangeSerializer(serializers.Serializer):
    role = serializers.ChoiceField(choices=UserProfile.Role.choices)

    def update(self, user, validated_data):
        profile, _ = UserProfile.objects.get_or_create(user=user)
        profile.role = validated_data.get('role', profile.role)
        profile.is_approved = profile.role != UserProfile.Role.USER
        profile.save(update_fields=['role', 'is_approved'])
        return user

    def create(self, validated_data):
        raise NotImplementedError('Role changes require an existing user.')


class ProfileUpdateSerializer(serializers.Serializer):
    full_name = serializers.CharField(max_length=150, required=False)

    def update(self, user, validated_data):
        if 'full_name' in validated_data:
            first_name, _, last_name = validated_data['full_name'].strip().partition(' ')
            user.first_name = first_name
            user.last_name = last_name
            user.save(update_fields=['first_name', 'last_name'])
        return user
