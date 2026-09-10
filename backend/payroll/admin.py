from django.contrib import admin
from .models import MentorRate


@admin.register(MentorRate)
class MentorRateAdmin(admin.ModelAdmin):
    list_display = ('mentor', 'base_rate', 'online_bonus', 'offline_bonus', 'updated_at')
    list_editable = ('base_rate', 'online_bonus', 'offline_bonus')
    search_fields = ('mentor__first_name', 'mentor__last_name', 'mentor__username', 'mentor__email')
    ordering = ('mentor__first_name', 'mentor__last_name')
    readonly_fields = ('updated_at',)
