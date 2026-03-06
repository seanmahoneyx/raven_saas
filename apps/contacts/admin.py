from django.contrib import admin
from .models import Contact

@admin.register(Contact)
class ContactAdmin(admin.ModelAdmin):
    list_display = ('first_name', 'last_name', 'party', 'title', 'email', 'phone', 'is_primary', 'is_active')
    list_filter = ('is_primary', 'is_active')
    search_fields = ('first_name', 'last_name', 'email')
