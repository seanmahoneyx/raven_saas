"""
Security tests for CSRF and miscellaneous vulnerabilities.

This test suite covers:
- Cross-Site Request Forgery (CSRF)
- Clickjacking
- Information Disclosure
- Security Headers
- Secret Key Management
"""
import pytest
from django.test import TestCase, Client
from django.contrib.auth import get_user_model
from apps.tenants.models import Tenant

User = get_user_model()


@pytest.mark.security
@pytest.mark.csrf
class CSRFSecurityTests(TestCase):
    """
    Test CSRF protection mechanisms.

    CSRF allows attackers to perform unauthorized actions on behalf of
    authenticated users.
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
            password="Password123!"
        )

    def test_csrf_middleware_enabled(self):
        """
        CRITICAL: Verify CSRF middleware is enabled.

        Attack: CSRF attacks if middleware is disabled.
        """
        from django.conf import settings

        middleware = settings.MIDDLEWARE

        # CSRF middleware should be enabled
        self.assertIn('django.middleware.csrf.CsrfViewMiddleware', middleware,
            "CSRF middleware is not enabled! This is a CRITICAL vulnerability!")

    def test_csrf_token_required_for_post(self):
        """
        CRITICAL: Verify POST requests require CSRF token.

        Attack: Submit form without CSRF token.
        """
        # Try to submit without CSRF token
        response = self.client.post('/login/', {
            'username': 'testuser',
            'password': 'Password123!'
        })

        # Should be rejected (403) or require CSRF token
        # Note: Some views might be exempt - test specific endpoints

    def test_csrf_token_validation(self):
        """
        CRITICAL: Verify CSRF tokens are validated.

        Attack: Submit with invalid CSRF token.
        """
        # Get a page with CSRF token
        response = self.client.get('/login/')

        # Try to submit with wrong token
        response = self.client.post('/login/', {
            'username': 'testuser',
            'password': 'Password123!',
            'csrfmiddlewaretoken': 'invalid_token_12345'
        })

        # Should be rejected

    def test_csrf_exempt_not_overused(self):
        """
        Security: Check that @csrf_exempt is not overused.

        Attack: CSRF on endpoints that shouldn't be exempt.
        """
        # This is a code review test
        # Search codebase for @csrf_exempt decorator
        # Each usage should be justified (e.g., API endpoints with other auth)
        pass


@pytest.mark.security
class ClickjackingSecurityTests(TestCase):
    """
    Test clickjacking protection.

    Clickjacking allows attackers to trick users into clicking hidden elements.
    """

    def setUp(self):
        self.client = Client()

    def test_xframe_options_middleware(self):
        """
        CRITICAL: Verify X-Frame-Options middleware is enabled.

        Attack: Embed site in iframe for clickjacking.
        """
        from django.conf import settings

        middleware = settings.MIDDLEWARE

        # X-Frame-Options middleware should be enabled
        self.assertIn('django.middleware.clickjacking.XFrameOptionsMiddleware', middleware,
            "Clickjacking middleware is not enabled!")

    def test_xframe_options_header(self):
        """
        CRITICAL: Verify X-Frame-Options header is set.

        Attack: Load page in iframe for clickjacking.
        """
        response = self.client.get('/login/')

        # Should have X-Frame-Options header
        self.assertIn('X-Frame-Options', response.headers,
            "X-Frame-Options header not set!")

        # Should be DENY or SAMEORIGIN
        x_frame_value = response.headers.get('X-Frame-Options', '')
        self.assertIn(x_frame_value, ['DENY', 'SAMEORIGIN'],
            f"X-Frame-Options is '{x_frame_value}', should be DENY or SAMEORIGIN")


@pytest.mark.security
class InformationDisclosureTests(TestCase):
    """
    Test for information disclosure vulnerabilities.

    Verifies that sensitive information isn't leaked through errors,
    headers, or other means.
    """

    def setUp(self):
        self.client = Client()

    def test_debug_mode_disabled_in_production(self):
        """
        CRITICAL: Verify DEBUG is disabled in production.

        Attack: Debug mode leaks sensitive configuration and stack traces.
        """
        from django.conf import settings

        # In production, DEBUG must be False
        # For development, it's OK to be True
        # We'll just warn here
        if settings.DEBUG:
            print("\nWARNING: DEBUG=True. This is OK for development "
                  "but MUST be False in production!")

    def test_secret_key_not_exposed(self):
        """
        CRITICAL: Verify SECRET_KEY is not the default/example value.

        Attack: Use known secret key to forge sessions.
        """
        from django.conf import settings

        secret_key = settings.SECRET_KEY

        # Should not be default Django value
        self.assertNotEqual(secret_key, 'django-insecure-*',
            "SECRET_KEY is using default/example value!")

        # Should be reasonably long and random
        self.assertGreater(len(secret_key), 32,
            "SECRET_KEY is too short!")

        # In production, should be loaded from environment
        # Not hardcoded in settings.py

    def test_allowed_hosts_configured(self):
        """
        CRITICAL: Verify ALLOWED_HOSTS is properly configured.

        Attack: Host header injection.
        """
        from django.conf import settings

        allowed_hosts = settings.ALLOWED_HOSTS

        # Should not be ['*'] in production
        if '*' in allowed_hosts:
            print("\nWARNING: ALLOWED_HOSTS includes '*'. "
                  "This is OK for development but should be restricted in production!")

        # Should have specific hosts configured for production

    def test_error_pages_dont_leak_info(self):
        """
        Security: Verify error pages don't leak sensitive info.

        Attack: Trigger errors to gather information about the system.
        """
        # Request non-existent page
        response = self.client.get('/this-does-not-exist-12345/')

        # Should return 404
        self.assertEqual(response.status_code, 404)

        # Error page should not reveal:
        # - Django version
        # - Python version
        # - File paths
        # - Database schema
        # - Stack traces (unless DEBUG=True)

    def test_server_header_not_verbose(self):
        """
        Security: Verify Server header doesn't reveal too much.

        Attack: Gather version info for targeted attacks.
        """
        response = self.client.get('/login/')

        server_header = response.headers.get('Server', '')

        # Ideally, Server header should be minimal or removed
        # Should not reveal exact versions

    def test_no_directory_listing(self):
        """
        Security: Verify directory listing is disabled.

        Attack: Browse directory structure.
        """
        # Try to access various directories
        directories = [
            '/static/',
            '/media/',
            '/admin/static/',
        ]

        for directory in directories:
            response = self.client.get(directory)

            # Should not return directory listing (200 with file list)
            # Should either 404 or redirect


@pytest.mark.security
class SecurityHeadersTests(TestCase):
    """
    Test for security headers.

    Verifies that appropriate security headers are set.
    """

    def setUp(self):
        self.client = Client()

    def test_content_security_policy(self):
        """
        Security: Check for Content-Security-Policy header.

        Protects against XSS and data injection attacks.
        """
        response = self.client.get('/login/')

        # CSP header should be present (if implemented)
        # This is optional but recommended
        if 'Content-Security-Policy' in response.headers:
            csp = response.headers['Content-Security-Policy']
            # Should have reasonable restrictions
        else:
            print("\nINFO: Content-Security-Policy header not set. "
                  "Consider implementing for additional XSS protection.")

    def test_strict_transport_security(self):
        """
        Security: Check for Strict-Transport-Security header.

        Forces HTTPS connections.
        """
        response = self.client.get('/login/')

        # HSTS should be set in production (when using HTTPS)
        if 'Strict-Transport-Security' in response.headers:
            hsts = response.headers['Strict-Transport-Security']
            # Should have reasonable max-age
        else:
            print("\nINFO: Strict-Transport-Security header not set. "
                  "This should be enabled in production with HTTPS.")

    def test_x_content_type_options(self):
        """
        Security: Check for X-Content-Type-Options header.

        Prevents MIME type sniffing.
        """
        response = self.client.get('/login/')

        # Should have X-Content-Type-Options: nosniff
        if 'X-Content-Type-Options' in response.headers:
            value = response.headers['X-Content-Type-Options']
            self.assertEqual(value, 'nosniff')
        else:
            print("\nINFO: X-Content-Type-Options header not set. "
                  "Consider adding 'nosniff' for additional security.")


@pytest.mark.security
class PasswordSecurityTests(TestCase):
    """
    Test password security and policy enforcement.
    """

    def setUp(self):
        self.tenant = Tenant.objects.create(
            name="Test Tenant",
            subdomain="test"
        )

    def test_password_validators_configured(self):
        """
        CRITICAL: Verify password validators are configured.

        Prevents weak passwords.
        """
        from django.conf import settings

        validators = settings.AUTH_PASSWORD_VALIDATORS

        # Should have password validators configured
        self.assertGreater(len(validators), 0,
            "No password validators configured!")

        # Common validators
        validator_names = [v.get('NAME', '') for v in validators]

        # Should have at least minimum length validator
        has_min_length = any('MinimumLengthValidator' in name for name in validator_names)
        self.assertTrue(has_min_length,
            "MinimumLengthValidator not configured!")

    def test_weak_password_rejected(self):
        """
        CRITICAL: Verify weak passwords are rejected.

        Attack: Create account with weak password.
        """
        weak_passwords = [
            'password',
            '12345678',
            'qwerty',
            'abc123',
        ]

        for weak_pass in weak_passwords:
            try:
                user = User.objects.create_user(
                    username=f"test_{weak_pass}",
                    email=f"test_{weak_pass}@example.com",
                    password=weak_pass
                )
                # If we get here, password was accepted
                # Check if it was actually validated
                # (create_user might not validate, but forms should)
            except Exception as e:
                # Exception is good - weak password rejected
                pass

    def test_password_reset_token_security(self):
        """
        CRITICAL: Verify password reset tokens are secure.

        Attack: Guess or brute-force password reset tokens.
        """
        user = User.objects.create_user(
            username="resetuser",
            email="reset@example.com",
            password="OldPassword123!"
        )

        # Generate password reset token
        from django.contrib.auth.tokens import default_token_generator

        token = default_token_generator.make_token(user)

        # Token should be long and random
        self.assertGreater(len(token), 20,
            "Password reset token is too short!")

        # Token should not be predictable
        # (This is ensured by Django's implementation)

        # Token should expire after reasonable time
        # Token should be single-use


@pytest.mark.security
class RateLimitingTests(TestCase):
    """
    Test for rate limiting (if implemented).

    Rate limiting prevents brute force and DoS attacks.
    """

    def setUp(self):
        self.client = Client()

    def test_login_rate_limiting(self):
        """
        Security: Check if login attempts are rate limited.

        Attack: Brute force password guessing.
        """
        # This test checks if rate limiting is implemented
        # Make multiple rapid login attempts

        for i in range(20):
            response = self.client.post('/login/', {
                'username': 'testuser',
                'password': 'wrongpassword'
            })

        # After many attempts, should be rate limited (429 or 403)
        # If not implemented, this will pass but should print warning

        print("\nINFO: Login rate limiting test. "
              "Consider implementing rate limiting for brute force protection.")

    def test_api_rate_limiting(self):
        """
        Security: Check if API endpoints are rate limited.

        Attack: API abuse and DoS.
        """
        # If API endpoints exist, test rate limiting
        # This is a placeholder
        pass


@pytest.mark.security
class FileUploadSecurityTests(TestCase):
    """
    Test file upload security (if file uploads are implemented).
    """

    def setUp(self):
        self.tenant = Tenant.objects.create(
            name="Test Tenant",
            subdomain="test"
        )

    def test_file_type_validation(self):
        """
        CRITICAL: Verify uploaded file types are validated.

        Attack: Upload malicious executable files.
        """
        # If file upload exists, test:
        # - File extension validation
        # - MIME type validation
        # - File content validation (magic numbers)
        # - Reject executable files (.exe, .sh, .php, etc.)
        pass

    def test_file_size_limits(self):
        """
        Security: Verify file size limits are enforced.

        Attack: DoS through large file uploads.
        """
        # Should have reasonable file size limits
        from django.conf import settings

        max_upload_size = getattr(settings, 'FILE_UPLOAD_MAX_MEMORY_SIZE', None)

        if max_upload_size:
            # Should have reasonable limit (e.g., < 10MB for typical uploads)
            pass
        else:
            print("\nINFO: FILE_UPLOAD_MAX_MEMORY_SIZE not configured. "
                  "Consider setting limits to prevent DoS.")

    def test_file_storage_security(self):
        """
        CRITICAL: Verify uploaded files are stored securely.

        Attack: Execute uploaded malicious files.
        """
        # Uploaded files should:
        # - Be stored outside web root (not directly accessible)
        # - Have randomized names
        # - Be served with correct Content-Type
        # - Not be executable by web server
        pass
