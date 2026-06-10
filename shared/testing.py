"""
Shared test base classes.

`BaseTestCase` provides the fixture scaffolding that nearly every app's tests
duplicate: a default tenant, a user, a base unit of measure, and the
`set_current_tenant` wiring (in both `setUpTestData` and `setUp`).

Subclasses add their own domain objects by overriding `setUpTestData` and
calling `super().setUpTestData()` first::

    class MyTest(BaseTestCase):
        @classmethod
        def setUpTestData(cls):
            super().setUpTestData()
            cls.customer = Customer.objects.create(tenant=cls.tenant, ...)
"""
from django.contrib.auth import get_user_model
from django.test import TestCase

from apps.tenants.models import Tenant
from apps.items.models import UnitOfMeasure
from shared.managers import set_current_tenant

User = get_user_model()


class BaseTestCase(TestCase):
    """TestCase with a default tenant, user, base UOM, and tenant context."""

    @classmethod
    def setUpTestData(cls):
        cls.tenant = Tenant.objects.create(
            name='Test Co',
            subdomain='test',
            is_default=True,
        )
        cls.user = User.objects.create_user(
            username='testuser',
            email='test@test.com',
            password='testpass123',
        )
        set_current_tenant(cls.tenant)

        cls.uom = UnitOfMeasure.objects.create(
            tenant=cls.tenant,
            code='ea',
            name='Each',
            is_active=True,
        )

    def setUp(self):
        set_current_tenant(self.tenant)
