#!/usr/bin/env python
"""
Script to create a test user for E2E tests.
Run with: python manage.py shell < tests/fixtures/setup_test_user.py
"""
import os
import sys
import django

# Add the project root to the path
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__)))))
os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'raven.settings')

django.setup()

from django.contrib.auth import get_user_model
from apps.tenants.models import Tenant

User = get_user_model()

# Create test tenant if it doesn't exist
tenant, created = Tenant.objects.get_or_create(
    subdomain='test',
    defaults={
        'name': 'Test Tenant',
        'is_active': True,
        'is_default': True,
    }
)
if created:
    print(f"Created tenant: {tenant.name}")
else:
    print(f"Tenant already exists: {tenant.name}")

# Create test user if it doesn't exist
username = 'testuser'
password = 'TestPassword123!'

try:
    user = User.objects.get(username=username)
    print(f"Test user already exists: {username}")
except User.DoesNotExist:
    user = User.objects.create_user(
        username=username,
        email='testuser@example.com',
        password=password,
        tenant=tenant,
    )
    print(f"Created test user: {username} with password: {password}")

print("Test setup complete!")
