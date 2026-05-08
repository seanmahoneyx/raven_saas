"""
Security tests — admin-only access to the DataImportView endpoints.
"""
import io
from django.urls import reverse
from django.test import TestCase, override_settings
from rest_framework.test import APIClient

from apps.tenants.models import Tenant
from users.models import User
from shared.managers import set_current_tenant


def _minimal_csv():
    content = b'Code,Name\nTEST,Test\n'
    f = io.BytesIO(content)
    f.name = 'test.csv'
    return f


@override_settings(ALLOWED_HOSTS=['*'])
class AdminRequiredTestCase(TestCase):
    """Non-admin users must get 403; admin users get through."""

    @classmethod
    def setUpTestData(cls):
        cls.tenant = Tenant.objects.create(
            name='Security Test Co', subdomain='test-security-admin'
        )
        # is_staff=True satisfies DRF IsAdminUser.
        cls.admin_user = User.objects.create_user(
            username='adminuser_sec', password='pass',
            is_staff=True, is_superuser=False,
        )
        cls.regular_user = User.objects.create_user(
            username='reguser_sec', password='pass',
            is_staff=False, is_superuser=False,
        )

    def setUp(self):
        set_current_tenant(self.tenant)

    def _client(self, user=None):
        """Return an APIClient whose HOST resolves via subdomain to the test tenant."""
        client = APIClient()
        # Use subdomain host so TenantMiddleware resolves the tenant correctly.
        client.defaults['SERVER_NAME'] = f'{self.tenant.subdomain}.ravensaas.com'
        if user is not None:
            client.force_authenticate(user=user)
        return client

    # ------------------------------------------------------------------
    # POST (import) — non-admin must be rejected
    # ------------------------------------------------------------------

    def test_post_unauthenticated_returns_401(self):
        client = self._client()  # no user
        url = reverse('data-import', kwargs={'import_type': 'items'})
        response = client.post(url, {'file': _minimal_csv()}, format='multipart')
        self.assertIn(response.status_code, [401, 403])

    def test_post_non_admin_returns_403(self):
        client = self._client(user=self.regular_user)
        url = reverse('data-import', kwargs={'import_type': 'items'})
        response = client.post(url, {'file': _minimal_csv()}, format='multipart')
        self.assertEqual(response.status_code, 403)

    def test_post_admin_user_is_accepted(self):
        """Admin user reaches the view logic (may get 200 or 400, not 403)."""
        client = self._client(user=self.admin_user)
        url = reverse('data-import', kwargs={'import_type': 'items'})
        response = client.post(url, {'file': _minimal_csv()}, format='multipart')
        # Should not be a permission error.
        self.assertNotIn(response.status_code, [401, 403])

    # ------------------------------------------------------------------
    # GET (template download) — non-admin must be rejected
    # ------------------------------------------------------------------

    def test_get_unauthenticated_returns_401(self):
        client = self._client()  # no user
        url = reverse('data-import-template', kwargs={'import_type': 'items'})
        response = client.get(url)
        self.assertIn(response.status_code, [401, 403])

    def test_get_non_admin_returns_403(self):
        client = self._client(user=self.regular_user)
        url = reverse('data-import-template', kwargs={'import_type': 'items'})
        response = client.get(url)
        self.assertEqual(response.status_code, 403)

    def test_get_admin_user_returns_200(self):
        client = self._client(user=self.admin_user)
        url = reverse('data-import-template', kwargs={'import_type': 'items'})
        response = client.get(url)
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response['Content-Type'], 'text/csv')
