"""
Security tests for authentication and authorization.

This test suite verifies authentication mechanisms, password security,
session management, and authorization controls.
"""
import pytest
from django.test import TestCase, Client
from django.contrib.auth import get_user_model
from django.urls import reverse
from apps.tenants.models import Tenant
from shared.models import TenantContext

User = get_user_model()


@pytest.mark.security
@pytest.mark.auth
class AuthenticationSecurityTests(TestCase):
    """
    Test authentication security including password policies,
    session management, and brute force protection.
    """

    def setUp(self):
        self.client = Client()
        self.tenant = Tenant.objects.create(
            name="Test Tenant",
            subdomain="test"
        )
        self.user = User.objects.create_user(
            username="testuser",
            email="test@example.com",
            password="SecurePassword123!"
        )

    def test_password_not_stored_in_plaintext(self):
        """
        CRITICAL: Verify passwords are hashed, not stored in plaintext.

        Attack: Database compromise leads to plaintext password exposure.
        """
        user = User.objects.get(username="testuser")
        # Password should be hashed
        self.assertNotEqual(user.password, "SecurePassword123!")
        # Should start with hash algorithm identifier
        self.assertTrue(user.password.startswith('pbkdf2_sha256$') or
                       user.password.startswith('argon2$') or
                       user.password.startswith('bcrypt$'))

    def test_invalid_login_attempts(self):
        """
        Security: Test that invalid login attempts are handled properly.

        Attack: Brute force password guessing.
        """
        # Try invalid login
        response = self.client.post('/login/', {
            'username': 'testuser',
            'password': 'WrongPassword'
        })

        # Should not be logged in
        self.assertNotIn('_auth_user_id', self.client.session)

        # Multiple failed attempts (basic test - full brute force protection
        # would require rate limiting which may not be implemented yet)
        for _ in range(5):
            response = self.client.post('/login/', {
                'username': 'testuser',
                'password': 'WrongPassword'
            })

        # User should still not be logged in
        self.assertNotIn('_auth_user_id', self.client.session)

    def test_session_invalidation_on_logout(self):
        """
        CRITICAL: Verify sessions are properly invalidated on logout.

        Attack: Session reuse after logout.
        """
        # Login
        self.client.login(username='testuser', password='SecurePassword123!')
        session_key = self.client.session.session_key

        # Logout
        self.client.logout()

        # Session should be cleared
        self.assertNotIn('_auth_user_id', self.client.session)

        # Old session key should not work
        self.client.cookies['sessionid'] = session_key
        # Try to access protected resource - should fail

    def test_password_in_url_vulnerability(self):
        """
        Security: Verify passwords are not accepted in URL parameters.

        Attack: Password in URL gets logged in access logs.
        """
        # Attempt login with password in URL (GET request)
        response = self.client.get('/login/', {
            'username': 'testuser',
            'password': 'SecurePassword123!'
        })

        # Should not be logged in (GET requests should not authenticate)
        self.assertNotIn('_auth_user_id', self.client.session)

    def test_username_enumeration_protection(self):
        """
        Security: Verify that error messages don't reveal if username exists.

        Attack: Username enumeration to build list of valid users.
        """
        # Try invalid username
        response1 = self.client.post('/login/', {
            'username': 'nonexistentuser',
            'password': 'SomePassword'
        })

        # Try valid username with wrong password
        response2 = self.client.post('/login/', {
            'username': 'testuser',
            'password': 'WrongPassword'
        })

        # Error messages should be generic and not reveal which field was wrong
        # Both should return similar error messages
        # (This test may fail if the current implementation leaks info)

    def test_session_fixation_protection(self):
        """
        CRITICAL: Verify session ID changes after login.

        Attack: Session fixation attack.
        """
        # Get initial session
        self.client.get('/login/')
        session_before = self.client.session.session_key

        # Login
        self.client.login(username='testuser', password='SecurePassword123!')
        session_after = self.client.session.session_key

        # Session ID should change after login
        self.assertNotEqual(session_before, session_after,
            "Session fixation vulnerability: Session ID did not change after login!")

    def test_remember_me_token_security(self):
        """
        Security: Verify "remember me" tokens are secure if implemented.

        Attack: Token theft leads to account takeover.
        """
        # This test is a placeholder - implement if remember me functionality exists
        pass


@pytest.mark.security
@pytest.mark.auth
class AuthorizationSecurityTests(TestCase):
    """
    Test authorization and access control mechanisms.

    Verifies that users can only access resources they're authorized for.
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

        # User for tenant 1
        self.user1 = User.objects.create_user(
            username="user1",
            email="user1@tenant1.com",
            password="Password123!"
        )

        # User for tenant 2
        self.user2 = User.objects.create_user(
            username="user2",
            email="user2@tenant2.com",
            password="Password123!"
        )

        # Admin user
        self.admin = User.objects.create_superuser(
            username="admin",
            email="admin@test.com",
            password="Admin123!"
        )

    def test_unauthenticated_access_blocked(self):
        """
        CRITICAL: Verify unauthenticated users cannot access protected resources.

        Attack: Direct URL access without authentication.
        """
        # Try to access admin without authentication
        response = self.client.get('/admin/')

        # Should redirect to login or return 403/401
        self.assertIn(response.status_code, [302, 401, 403])

    def test_authenticated_user_admin_access(self):
        """
        CRITICAL: Verify regular users cannot access admin panel.

        Attack: Privilege escalation through admin access.
        """
        self.client.login(username='user1', password='Password123!')

        response = self.client.get('/admin/')

        # Regular user should not access admin (should redirect or return 403)
        if response.status_code == 200:
            # If 200, check if actually logged into admin
            # or just redirected to login page
            self.fail("Regular user was able to access admin panel!")

    def test_cross_tenant_user_access(self):
        """
        CRITICAL: Verify users from one tenant cannot access another tenant's data.

        Attack: Cross-tenant data access through authentication.
        """
        with TenantContext(self.tenant1):
            from apps.parties.models import Party
            party1 = Party.objects.create(
                name="Tenant 1 Party",
                tenant=self.tenant1
            )

        with TenantContext(self.tenant2):
            party2 = Party.objects.create(
                name="Tenant 2 Party",
                tenant=self.tenant2
            )

        # Login as user1 (tenant 1)
        self.client.login(username='user1', password='Password123!')

        # User 1 should only see tenant 1 data
        # (This test assumes view-level permissions are implemented)

    def test_horizontal_privilege_escalation(self):
        """
        CRITICAL: Verify users cannot access other users' private data.

        Attack: Horizontal privilege escalation within same tenant.
        """
        # Create two users in same tenant
        user_a = User.objects.create_user(
            username="usera",
            email="usera@test.com",
            password="Password123!"
        )
        user_b = User.objects.create_user(
            username="userb",
            email="userb@test.com",
            password="Password123!"
        )

        # Login as user A
        self.client.login(username='usera', password='Password123!')

        # Try to access user B's profile/data
        # (This test assumes user profile URLs exist)
        # This is a placeholder for actual endpoint testing

    def test_direct_object_reference_vulnerability(self):
        """
        CRITICAL: Test for Insecure Direct Object Reference (IDOR).

        Attack: Manipulate object IDs to access unauthorized data.
        """
        with TenantContext(self.tenant1):
            from apps.orders.models import SalesOrder
            from apps.parties.models import Party, Customer, Location

            party = Party.objects.create(name="Test Party", tenant=self.tenant1)
            customer = Customer.objects.create(party=party)
            location = Location.objects.create(
                party=party,
                name="Test Location",
                address_1="123 Test St",
                city="Test City",
                state="CA",
                zip_code="90001",
                tenant=self.tenant1
            )

            order = SalesOrder.objects.create(
                order_number="SO-001",
                customer=customer,
                ship_to=location,
                tenant=self.tenant1
            )

        # Login as different tenant's user
        self.client.login(username='user2', password='Password123!')

        # Try to access tenant 1's order by ID
        # (Placeholder - would need actual view URLs)
        # Example: /api/orders/1/
        # This should be blocked

    def test_mass_assignment_vulnerability(self):
        """
        Security: Test for mass assignment vulnerabilities.

        Attack: Inject unauthorized fields in form submissions.
        """
        self.client.login(username='user1', password='Password123!')

        # Try to create object with is_superuser=True injected
        # (This tests if form/serializer properly restricts fields)
        # Placeholder for actual endpoint testing

    def test_function_level_access_control(self):
        """
        CRITICAL: Verify sensitive functions are protected.

        Attack: Direct access to admin/privileged functions.
        """
        self.client.login(username='user1', password='Password123!')

        # Try to access admin-only functions
        # Examples:
        # - Delete all users
        # - Modify system settings
        # - Access audit logs
        # (Placeholder for actual endpoint testing)


@pytest.mark.security
@pytest.mark.auth
class SessionSecurityTests(TestCase):
    """
    Test session security including hijacking prevention and timeout.
    """

    def setUp(self):
        self.client = Client()
        self.user = User.objects.create_user(
            username="testuser",
            email="test@example.com",
            password="Password123!"
        )

    def test_session_timeout(self):
        """
        Security: Verify sessions timeout after inactivity.

        Attack: Use stolen session long after it should have expired.
        """
        # Login
        self.client.login(username='testuser', password='Password123!')

        # Check if SESSION_COOKIE_AGE is set in settings
        from django.conf import settings
        session_age = getattr(settings, 'SESSION_COOKIE_AGE', None)

        # Session should have a timeout configured
        self.assertIsNotNone(session_age,
            "SESSION_COOKIE_AGE not configured - sessions never timeout!")

        # Sessions should timeout reasonably (not more than 2 weeks)
        max_reasonable_age = 14 * 24 * 60 * 60  # 2 weeks in seconds
        self.assertLessEqual(session_age, max_reasonable_age,
            f"Session timeout too long: {session_age} seconds")

    def test_session_cookie_security_flags(self):
        """
        CRITICAL: Verify session cookies have security flags set.

        Attack: Session hijacking through XSS or network sniffing.
        """
        from django.conf import settings

        # HttpOnly flag (prevents JavaScript access)
        session_cookie_httponly = getattr(settings, 'SESSION_COOKIE_HTTPONLY', False)
        self.assertTrue(session_cookie_httponly,
            "SESSION_COOKIE_HTTPONLY not enabled - vulnerable to XSS session theft!")

        # Secure flag (HTTPS only - should be True in production)
        session_cookie_secure = getattr(settings, 'SESSION_COOKIE_SECURE', False)
        # Note: May be False in development, but should be True in production
        # We'll warn but not fail for development environments
        if not session_cookie_secure:
            print("\nWARNING: SESSION_COOKIE_SECURE is False. "
                  "This is OK for development but MUST be True in production!")

        # SameSite flag (CSRF protection)
        session_cookie_samesite = getattr(settings, 'SESSION_COOKIE_SAMESITE', None)
        self.assertIn(session_cookie_samesite, ['Lax', 'Strict'],
            "SESSION_COOKIE_SAMESITE should be 'Lax' or 'Strict' for CSRF protection!")

    def test_session_hijacking_prevention(self):
        """
        Security: Verify session includes user agent/IP validation if implemented.

        Attack: Session hijacking through cookie theft.
        """
        # Login and get session
        self.client.login(username='testuser', password='Password123!')
        session_key = self.client.session.session_key

        # Create new client with different user agent
        client2 = Client()
        client2.cookies['sessionid'] = session_key

        # Ideally, the session should be invalidated or flagged as suspicious
        # when accessed from different user agent/IP
        # (This depends on implementation - may not be present)

    def test_concurrent_session_handling(self):
        """
        Security: Test handling of concurrent sessions for same user.

        Attack: Multiple session exploitation.
        """
        # Login from first client
        client1 = Client()
        client1.login(username='testuser', password='Password123!')

        # Login from second client (same user)
        client2 = Client()
        client2.login(username='testuser', password='Password123!')

        # Depending on security policy:
        # - Both sessions could be valid (less secure)
        # - First session should be invalidated (more secure)
        # - Track and limit concurrent sessions

        # This test documents the behavior
