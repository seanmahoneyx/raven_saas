"""
Tests for GET template download — safe filename, correct content-type.
"""
import re
from django.urls import reverse
from django.test import TestCase, override_settings
from rest_framework.test import APIClient

from apps.tenants.models import Tenant
from users.models import User
from shared.managers import set_current_tenant


@override_settings(ALLOWED_HOSTS=['*'])
class TemplateDownloadTestCase(TestCase):

    @classmethod
    def setUpTestData(cls):
        cls.tenant = Tenant.objects.create(
            name='Template DL Co', subdomain='test-template-dl'
        )
        cls.admin_user = User.objects.create_user(
            username='tmpl_admin', password='pass',
            is_staff=True, is_superuser=False,
        )

    def setUp(self):
        set_current_tenant(self.tenant)

    def _client(self):
        client = APIClient()
        # Use subdomain host so TenantMiddleware resolves the tenant.
        client.defaults['SERVER_NAME'] = f'{self.tenant.subdomain}.ravensaas.com'
        client.force_authenticate(user=self.admin_user)
        return client

    def test_valid_type_returns_csv(self):
        url = reverse('data-import-template', kwargs={'import_type': 'items'})
        response = self._client().get(url)
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response['Content-Type'], 'text/csv')

    def test_filename_contains_only_safe_chars(self):
        """Content-Disposition filename must not contain special chars that allow injection."""
        client = self._client()
        for import_type in ['locations', 'parties', 'items', 'gl-opening-balances',
                            'warehouses', 'customers', 'vendors', 'inventory']:
            url = reverse('data-import-template', kwargs={'import_type': import_type})
            response = client.get(url)
            self.assertEqual(response.status_code, 200, msg=f"Failed for {import_type}")
            disposition = response['Content-Disposition']
            # Extract filename value from header
            filename_part = disposition.split('filename=')[-1].strip('"')
            # Must only contain alphanumeric, hyphen, dot
            self.assertRegex(
                filename_part,
                r'^[a-zA-Z0-9\-\.]+$',
                msg=f"Unsafe filename for {import_type}: {filename_part}",
            )

    def test_invalid_type_returns_400(self):
        url = reverse('data-import-template', kwargs={'import_type': 'nonexistent'})
        response = self._client().get(url)
        self.assertEqual(response.status_code, 400)
