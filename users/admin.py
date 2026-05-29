from django.contrib import admin
from django.contrib.auth.admin import UserAdmin as DjangoUserAdmin

from .models import User


@admin.register(User)
class UserAdmin(DjangoUserAdmin):
    """Custom User admin that surfaces the `name` and `preferences` fields
    on top of Django's stock auth admin (password change UI, group/perm
    management, is_active/is_staff/is_superuser toggles)."""

    list_display = ('username', 'name', 'email', 'is_active', 'is_staff', 'is_superuser', 'date_joined')
    list_filter = ('is_active', 'is_staff', 'is_superuser', 'groups')
    search_fields = ('username', 'name', 'email')
    ordering = ('username',)

    fieldsets = DjangoUserAdmin.fieldsets + (
        ('Raven', {'fields': ('name', 'preferences')}),
    )
    add_fieldsets = DjangoUserAdmin.add_fieldsets + (
        ('Raven', {'fields': ('name', 'email')}),
    )
