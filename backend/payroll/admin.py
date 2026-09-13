from django.contrib import admin
from .models import MentorRate


@admin.register(MentorRate)
class MentorRateAdmin(admin.ModelAdmin):
    list_display  = ('mentor', 'base_rate', 'online_bonus', 'offline_bonus', 'updated_at')
    list_editable = ('base_rate', 'online_bonus', 'offline_bonus')
    search_fields = ('mentor__first_name', 'mentor__last_name', 'mentor__username', 'mentor__email')
    ordering      = ('mentor__first_name', 'mentor__last_name')
    readonly_fields = ('updated_at',)

    # Custom action: reset all rates to default
    actions = ['reset_all_rates']

    def reset_all_rates(self, request, queryset):
        deleted, _ = MentorRate.objects.all().delete()
        self.message_user(request, f'✓ Сброшено {deleted} индивидуальных ставок. Все менторы вернулись к стандарту (150 сом).')
    reset_all_rates.short_description = '⚠️ Сбросить ВСЕ ставки до стандартных'

    def has_delete_permission(self, request, obj=None):
        return request.user.is_staff

    def has_add_permission(self, request):
        return request.user.is_staff

    def has_change_permission(self, request, obj=None):
        return request.user.is_staff
