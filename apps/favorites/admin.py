from django.contrib import admin
from .models import UserFavorite, UserRecentView


@admin.register(UserFavorite)
class UserFavoriteAdmin(admin.ModelAdmin):
    list_display = ['user', 'entity_type', 'object_id', 'label', 'created_at']
    list_filter = ['entity_type']
    search_fields = ['label', 'user__username']


@admin.register(UserRecentView)
class UserRecentViewAdmin(admin.ModelAdmin):
    list_display = ['user', 'entity_type', 'object_id', 'label', 'view_count', 'last_viewed_at']
    list_filter = ['entity_type']
    search_fields = ['label', 'user__username']
