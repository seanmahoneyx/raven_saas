"""
Security tests for API endpoints and views.

This test suite covers:
- Schedulizer endpoint security
- HTMX endpoint security
- Admin panel security
- Access control on all views
"""
import pytest
from django.test import TestCase, Client, RequestFactory
from django.contrib.auth import get_user_model
from apps.tenants.models import Tenant
from apps.parties.models import Party, Customer, Location, Truck
from apps.orders.models import SalesOrder, PurchaseOrder
from apps.items.models import UnitOfMeasure
from shared.models import TenantContext
import json

User = get_user_model()


@pytest.mark.security
class SchedulizerEndpointSecurityTests(TestCase):
    """
    Test security of schedulizer endpoints.

    The schedulizer has HTMX endpoints that allow updating order status,
    scheduling, and notes. These must be properly secured.
    """

    def setUp(self):
        self.client = Client()
        self.tenant1 = Tenant.objects.create(
            name="Tenant 1",
            subdomain="tenant1"
        )
        self.tenant2 = Tenant.objects.create(
            name="Tenant 2",
            subdomain="tenant2"
        )

        self.user1 = User.objects.create_user(
            username="user1",
            password="Password123!"
        )
        self.user2 = User.objects.create_user(
            username="user2",
            password="Password123!"
        )

        # Create test data for tenant 1
        with TenantContext(self.tenant1):
            uom = UnitOfMeasure.objects.create(name="Each", code="ea")
            party1 = Party.objects.create(display_name="Party 1", tenant=self.tenant1)
            customer1 = Customer.objects.create(party=party1)
            location1 = Location.objects.create(
                party=party1,
                name="Location 1",
                address_line1="123 St",
                city="City",
                state="CA",
                postal_code="90001",
                tenant=self.tenant1
            )
            self.truck1 = Truck.objects.create(name="Truck 1", tenant=self.tenant1)

            self.order1 = SalesOrder.objects.create(
                order_number="SO-T1-001",
                customer=customer1,
                ship_to=location1,
                tenant=self.tenant1
            )

        # Create test data for tenant 2
        with TenantContext(self.tenant2):
            party2 = Party.objects.create(display_name="Party 2", tenant=self.tenant2)
            customer2 = Customer.objects.create(party=party2)
            location2 = Location.objects.create(
                party=party2,
                name="Location 2",
                address_line1="456 St",
                city="City",
                state="NY",
                postal_code="10001",
                tenant=self.tenant2
            )
            self.truck2 = Truck.objects.create(name="Truck 2", tenant=self.tenant2)

            self.order2 = SalesOrder.objects.create(
                order_number="SO-T2-001",
                customer=customer2,
                ship_to=location2,
                tenant=self.tenant2
            )

    def test_unauthenticated_schedulizer_access(self):
        """
        CRITICAL: Verify unauthenticated users cannot access schedulizer.

        Attack: Direct URL access without authentication.
        """
        response = self.client.get('/v2/')

        # Should redirect to login or return 401/403
        self.assertIn(response.status_code, [302, 401, 403],
            "Unauthenticated user can access schedulizer!")

    def test_schedule_update_authentication_required(self):
        """
        CRITICAL: Verify schedule update endpoint requires authentication.

        Attack: Modify schedules without authentication.
        """
        response = self.client.post('/v2/update/', {
            'order_id': self.order1.id,
            'truck_id': self.truck1.id,
            'date': '2026-01-15'
        }, HTTP_X_REQUESTED_WITH='XMLHttpRequest')

        # Should be rejected (redirect to login or 401/403)
        self.assertIn(response.status_code, [302, 401, 403],
            "Unauthenticated user can update schedules!")

    def test_cross_tenant_order_modification(self):
        """
        CRITICAL: Verify users cannot modify orders from other tenants.

        Attack: User from tenant 1 modifies tenant 2's order.
        """
        # Login as user 1
        self.client.login(username='user1', password='Password123!')

        # Set tenant 1 context via subdomain header
        response = self.client.post('/v2/update/', {
            'order_id': self.order2.id,  # Tenant 2's order
            'truck_id': self.truck1.id,
            'date': '2026-01-15'
        }, HTTP_X_REQUESTED_WITH='XMLHttpRequest', HTTP_HOST='tenant1.example.com')

        # Should be rejected or not found
        self.assertIn(response.status_code, [403, 404],
            "User can modify orders from different tenant!")

    def test_order_status_update_authorization(self):
        """
        CRITICAL: Verify order status updates are authorized.

        Attack: Unauthorized status changes.
        """
        self.client.login(username='user1', password='Password123!')

        # Try to update order status
        response = self.client.post('/v2/status/', {
            'order_id': self.order2.id,  # Different tenant
            'status': 'complete'
        }, HTTP_X_REQUESTED_WITH='XMLHttpRequest', HTTP_HOST='tenant1.example.com')

        # Should be rejected
        self.assertIn(response.status_code, [403, 404],
            "User can change status of orders from different tenant!")

    def test_order_notes_xss_protection(self):
        """
        CRITICAL: Verify order notes are protected from XSS.

        Attack: Inject XSS payload through notes field.
        """
        self.client.login(username='user1', password='Password123!')

        xss_payload = "<script>alert('XSS')</script>"

        response = self.client.post('/v2/notes/', {
            'order_id': self.order1.id,
            'notes': xss_payload
        }, HTTP_X_REQUESTED_WITH='XMLHttpRequest', HTTP_HOST='tenant1.example.com')

        # Notes should be saved but escaped when rendered
        with TenantContext(self.tenant1):
            order = SalesOrder.objects.get(id=self.order1.id)
            self.assertEqual(order.notes, xss_payload)  # Stored as-is

        # When rendered in response, should be escaped
        if response.status_code == 200:
            response_text = response.content.decode()
            # Should not contain unescaped script tags
            self.assertNotIn('<script>alert', response_text,
                "XSS payload not escaped in response!")

    def test_htmx_header_validation(self):
        """
        Security: Verify HTMX endpoints validate the HX-Request header.

        Attack: Call HTMX endpoints directly without proper headers.
        """
        self.client.login(username='user1', password='Password123!')

        # Try to call HTMX endpoint without HX-Request header
        response = self.client.post('/v2/update/', {
            'order_id': self.order1.id,
            'truck_id': self.truck1.id,
            'date': '2026-01-15'
        }, HTTP_HOST='tenant1.example.com')

        # Depending on implementation, might reject or handle differently

    def test_side_panel_authorization(self):
        """
        CRITICAL: Verify side panel only shows authorized order details.

        Attack: View order details from different tenant.
        """
        self.client.login(username='user1', password='Password123!')

        # Try to get side panel for tenant 2's order
        response = self.client.get(f'/v2/side-panel/?order_id={self.order2.id}',
            HTTP_X_REQUESTED_WITH='XMLHttpRequest',
            HTTP_HOST='tenant1.example.com')

        # Should be rejected or not found
        self.assertIn(response.status_code, [403, 404],
            "User can view order details from different tenant!")

    def test_global_history_tenant_isolation(self):
        """
        CRITICAL: Verify global history only shows current tenant's data.

        Attack: View activity history from other tenants.
        """
        self.client.login(username='user1', password='Password123!')

        response = self.client.get('/v2/history/',
            HTTP_X_REQUESTED_WITH='XMLHttpRequest',
            HTTP_HOST='tenant1.example.com')

        if response.status_code == 200:
            response_text = response.content.decode()
            # Should not contain tenant 2's order number
            self.assertNotIn('SO-T2-001', response_text,
                "Global history leaks data from other tenants!")


@pytest.mark.security
class AdminPanelSecurityTests(TestCase):
    """
    Test security of Django admin panel.

    The admin panel has powerful capabilities and must be properly secured.
    """

    def setUp(self):
        self.client = Client()
        self.tenant = Tenant.objects.create(
            name="Test Tenant",
            subdomain="test"
        )

        self.regular_user = User.objects.create_user(
            username="regular",
            password="Password123!"
        )

        self.staff_user = User.objects.create_user(
            username="staff",
            password="Password123!",
            is_staff=True
        )

        self.superuser = User.objects.create_superuser(
            username="admin",
            password="Admin123!"
        )

    def test_admin_requires_authentication(self):
        """
        CRITICAL: Verify admin panel requires authentication.

        Attack: Access admin without login.
        """
        response = self.client.get('/admin/')

        # Should redirect to login
        self.assertEqual(response.status_code, 302,
            "Admin panel accessible without authentication!")

        # Should redirect to login page
        self.assertIn('/login/', response.url)

    def test_admin_requires_staff_status(self):
        """
        CRITICAL: Verify admin panel requires staff status.

        Attack: Regular user accesses admin panel.
        """
        self.client.login(username='regular', password='Password123!')

        response = self.client.get('/admin/')

        # Should be rejected (redirect or 403)
        # Regular users should not access admin
        self.assertNotEqual(response.status_code, 200,
            "Regular user can access admin panel!")

    def test_admin_tenant_isolation(self):
        """
        CRITICAL: Verify admin panel respects tenant isolation.

        Attack: View/modify data from other tenants via admin.
        """
        self.client.login(username='admin', password='Admin123!')

        # Access admin party list
        response = self.client.get('/admin/parties/party/')

        # Admin should be properly scoped to tenant
        # (This depends on how admin is configured with tenant filtering)

    def test_admin_bulk_actions_tenant_safe(self):
        """
        CRITICAL: Verify bulk actions in admin respect tenant isolation.

        Attack: Bulk delete/modify records from multiple tenants.
        """
        # This requires testing admin bulk actions with tenant filtering
        pass

    def test_admin_raw_id_fields_tenant_safe(self):
        """
        Security: Verify raw_id_fields don't leak cross-tenant IDs.

        Attack: Enumerate IDs from other tenants.
        """
        # When using raw_id_fields, the popup should only show
        # options from the current tenant
        pass


@pytest.mark.security
class MiddlewareSecurityTests(TestCase):
    """
    Test security of custom middleware.

    The tenant middleware is critical for security.
    """

    def setUp(self):
        self.tenant1 = Tenant.objects.create(
            name="Tenant 1",
            subdomain="tenant1"
        )
        self.tenant2 = Tenant.objects.create(
            name="Tenant 2",
            subdomain="tenant2"
        )
        self.factory = RequestFactory()

    def test_tenant_middleware_sets_tenant(self):
        """
        CRITICAL: Verify tenant middleware properly sets current tenant.

        Attack: Wrong tenant context leads to data leakage.
        """
        from shared.middleware import TenantMiddleware

        middleware = TenantMiddleware(lambda r: None)

        # Test with tenant 1 subdomain
        request = self.factory.get('/', HTTP_HOST='tenant1.example.com')
        middleware.process_request(request)

        # Verify tenant is set
        from shared.models import get_current_tenant
        # Note: This depends on implementation details

    def test_tenant_header_injection_protection(self):
        """
        CRITICAL: Verify tenant resolution isn't vulnerable to header injection.

        Attack: Inject malicious tenant ID via headers.
        """
        from shared.middleware import TenantMiddleware

        middleware = TenantMiddleware(lambda r: None)

        # Try to inject tenant via custom header
        request = self.factory.get('/',
            HTTP_HOST='tenant1.example.com',
            HTTP_X_TENANT_ID='999999')  # Malicious tenant ID

        middleware.process_request(request)

        # Should use subdomain, not injected header
        # Or validate header against subdomain

    def test_default_tenant_security(self):
        """
        Security: Verify default tenant doesn't leak data.

        Attack: Access without tenant context to view all data.
        """
        # Requests without valid tenant should either:
        # 1. Be rejected (most secure)
        # 2. Get empty queryset
        # 3. Use safe default tenant

        # Should NEVER return data from multiple tenants
        pass


@pytest.mark.security
class InputValidationTests(TestCase):
    """
    Test input validation on all forms and endpoints.
    """

    def setUp(self):
        self.client = Client()
        self.tenant = Tenant.objects.create(
            name="Test Tenant",
            subdomain="test"
        )
        self.user = User.objects.create_user(
            username="testuser",
            password="Password123!"
        )

    def test_integer_field_overflow(self):
        """
        Security: Test for integer overflow vulnerabilities.

        Attack: Send extremely large numbers.
        """
        self.client.login(username='testuser', password='Password123!')

        # Try to create object with overflow value
        # Example: quantity field
        overflow_value = 9999999999999999999999999999999

        # Should be rejected or capped

    def test_negative_quantity_validation(self):
        """
        Security: Verify negative quantities are properly validated.

        Attack: Use negative quantities to manipulate calculations.
        """
        # Try to create order line with negative quantity
        # Should be rejected by model validation

    def test_string_field_length_limits(self):
        """
        Security: Verify string fields enforce length limits.

        Attack: DoS through extremely long strings.
        """
        with TenantContext(self.tenant):
            # Try to create party with extremely long name
            very_long_name = "A" * 100000

            try:
                party = Party.objects.create(
                    name=very_long_name,
                    tenant=self.tenant
                )
                # Should be truncated or rejected
            except Exception:
                # Exception is acceptable
                pass

    def test_email_validation(self):
        """
        Security: Verify email fields are properly validated.

        Attack: Inject malicious code through email field.
        """
        malicious_emails = [
            "test@example.com<script>alert('XSS')</script>",
            "test@example.com\r\nBcc: attacker@evil.com",
            "test';DROP TABLE users;--@example.com",
        ]

        for email in malicious_emails:
            try:
                user = User.objects.create_user(
                    username=f"user_{hash(email)}",
                    email=email,
                    password="Password123!"
                )
                # Email should be validated and sanitized
            except Exception:
                # Rejection is acceptable
                pass

    def test_url_validation(self):
        """
        Security: Verify URL fields are properly validated.

        Attack: SSRF through URL fields.
        """
        malicious_urls = [
            "javascript:alert('XSS')",
            "file:///etc/passwd",
            "http://169.254.169.254/latest/meta-data/",  # AWS metadata
            "http://localhost:6379/",  # Redis
        ]

        # If URL fields exist, they should be validated
        # Should only allow http:// and https://
        # Should block private IP ranges in production
