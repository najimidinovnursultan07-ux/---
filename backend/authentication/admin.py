from django.contrib import admin
from django.contrib.auth.admin import UserAdmin as BaseUserAdmin
from django.contrib.auth import get_user_model
from django.utils.html import format_html

from .models import UserProfile

User = get_user_model()


# ─── Inline: UserProfile inside User ─────────────────────────────────────────

class UserProfileInline(admin.StackedInline):
    model        = UserProfile
    can_delete   = False
    verbose_name = 'Роль и статус'
    fields       = ('role', 'is_approved')
    extra        = 0


# ─── Extended User admin ──────────────────────────────────────────────────────

@admin.register(User)
class ExtendedUserAdmin(BaseUserAdmin):
    inlines      = (UserProfileInline,)
    list_display = (
        'email', 'full_name_display', 'role_display', 'is_approved_display',
        'is_staff', 'is_superuser', 'is_active',
    )
    list_filter  = (
        'is_staff', 'is_superuser', 'is_active',
        'role_profile__role', 'role_profile__is_approved',
    )
    search_fields = ('email', 'username', 'first_name', 'last_name')
    ordering      = ('email',)

    # Allow editing is_superuser, is_staff directly
    fieldsets = BaseUserAdmin.fieldsets + (
        ('Роль Okurmen', {'fields': ()}),
    )

    def full_name_display(self, obj):
        return obj.get_full_name() or '—'
    full_name_display.short_description = 'Имя'

    def role_display(self, obj):
        profile = getattr(obj, 'role_profile', None)
        if profile:
            colors = {
                'ADMIN':      '#FF6B00',
                'MENTOR':     '#2e7d32',
                'CURATOR':    '#1565c0',
                'ACCOUNTANT': '#6a1b9a',
                'USER':       '#607d8b',
            }
            color = colors.get(profile.role, '#607d8b')
            return format_html(
                '<span style="color:{};font-weight:bold">{}</span>',
                color,
                profile.get_role_display(),
            )
        return '—'
    role_display.short_description = 'Роль'

    def is_approved_display(self, obj):
        profile = getattr(obj, 'role_profile', None)
        if profile:
            return format_html(
                '<span style="color:{}">{}</span>',
                '#2e7d32' if profile.is_approved else '#c62828',
                '✓ Одобрен' if profile.is_approved else '✗ Ожидает',
            )
        return '—'
    is_approved_display.short_description = 'Статус'

    def get_queryset(self, request):
        return super().get_queryset(request).select_related('role_profile')


# ─── UserProfile standalone ───────────────────────────────────────────────────

@admin.register(UserProfile)
class UserProfileAdmin(admin.ModelAdmin):
    list_display  = ('user_email', 'user_name', 'role', 'is_approved')
    list_filter   = ('role', 'is_approved')
    list_editable = ('role', 'is_approved')
    search_fields = ('user__email', 'user__first_name', 'user__last_name')
    ordering      = ('role', 'user__email')

    def user_email(self, obj):
        return obj.user.email or obj.user.username
    user_email.short_description = 'Email'

    def user_name(self, obj):
        return obj.user.get_full_name() or '—'
    user_name.short_description = 'Имя'

    def get_queryset(self, request):
        return super().get_queryset(request).select_related('user')
