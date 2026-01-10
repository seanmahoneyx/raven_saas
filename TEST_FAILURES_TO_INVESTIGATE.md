# Test Failures Requiring Investigation

**Status:** Tests created but need fixes before production
**Last Updated:** 2026-01-10
**Priority:** HIGH - Must be resolved before production deployment

---

## 📊 Test Results Summary

**Total Tests:** 95
**Passed:** 54 (57%)
**Failed:** 41 (43%)

⚠️ **IMPORTANT:** Most failures are due to test code issues (wrong field names), NOT actual security vulnerabilities. However, all failures must be investigated and resolved to ensure application security.

---

## 🔴 Critical Test Failures (Security-Related)

### 1. Tenant Isolation Tests (HIGHEST PRIORITY)

**File:** `security_tests/security_tenant_isolation.py`
**Failed Tests:** 18 out of 21

#### Primary Issue: Model Field Name Mismatches

**Error Pattern:**
```python
TypeError: Party() got unexpected keyword arguments: 'name'
TypeError: UnitOfMeasure() got unexpected keyword arguments: 'abbreviation'
```

**Root Cause:**
Tests were written assuming field names that don't match the actual model schema.

**Actions Required:**

1. **Check Party model fields:**
   ```bash
   python manage.py shell -c "from apps.parties.models import Party; print([f.name for f in Party._meta.get_fields()])"
   ```
   - Determine correct field name for party name
   - Update tests to use correct field

2. **Check UnitOfMeasure model fields:**
   ```bash
   python manage.py shell -c "from apps.items.models import UnitOfMeasure; print([f.name for f in UnitOfMeasure._meta.get_fields()])"
   ```
   - Tests use `abbreviation`, model likely uses `code`
   - Update all test references

3. **Fix test fixtures:**
   - Update `setUp()` methods in all test classes
   - Use correct field names throughout
   - Add proper tenant context

#### Specific Failures:

- ❌ `test_party_isolation_query` - Field name issue
- ❌ `test_customer_isolation_query` - Field name issue
- ❌ `test_location_isolation_query` - Field name issue
- ❌ `test_item_isolation_query` - Field name issue
- ❌ `test_sales_order_isolation_query` - Field name issue
- ❌ `test_truck_isolation_query` - Field name issue
- ❌ `test_direct_pk_access_blocked` - Field name issue
- ❌ `test_related_object_isolation` - Field name issue
- ❌ `test_cross_tenant_foreign_key_assignment` - Field name issue
- ❌ `test_update_without_tenant_context` - Field name issue
- ❌ `test_raw_sql_injection_attempt` - Field name issue
- ❌ `test_bulk_operations_respect_tenant` - Field name issue
- ❌ `test_aggregate_queries_isolated` - Field name issue
- ❌ `test_select_related_cross_tenant_leak` - Field name issue
- ❌ `test_prefetch_related_cross_tenant_leak` - Field name issue
- ❌ `test_nested_tenant_context_security` - Field name issue
- ❌ `test_context_manager_exception_safety` - Field name issue
- ❌ `test_concurrent_tenant_context_isolation` - Field name issue

**CRITICAL:** Once field names are fixed, ALL these tests MUST pass before production.

---

### 2. Schedulizer Endpoint Security Tests

**File:** `security_tests/security_api_endpoints.py`
**Failed Tests:** 8 out of 8

#### Primary Issue: Same Field Name Problems + URL Issues

**Error Pattern:**
```python
TypeError: UnitOfMeasure() got unexpected keyword arguments: 'abbreviation'
```

**Actions Required:**

1. **Fix field names** (same as above)

2. **Verify URL routes exist:**
   ```bash
   python manage.py show_urls | grep -E "(v2|schedulizer)"
   ```
   - Ensure `/v2/` endpoints exist
   - Verify endpoint URLs match test expectations

3. **Test actual endpoints manually:**
   ```bash
   # Test authentication requirement
   curl -I http://localhost:8000/v2/

   # Test with authentication
   # (create test user and get session cookie first)
   ```

#### Specific Failures:

- ❌ `test_unauthenticated_schedulizer_access` - Setup failed (field names)
- ❌ `test_schedule_update_authentication_required` - Setup failed
- ❌ `test_cross_tenant_order_modification` - Setup failed
- ❌ `test_order_status_update_authorization` - Setup failed
- ❌ `test_order_notes_xss_protection` - Setup failed
- ❌ `test_htmx_header_validation` - Setup failed
- ❌ `test_side_panel_authorization` - Setup failed
- ❌ `test_global_history_tenant_isolation` - Setup failed

**IMPORTANT:** These are critical security tests for the main application UI. Must verify:
- Authentication is required
- Cross-tenant access is blocked
- XSS is prevented in notes
- HTMX endpoints are secured

---

### 3. Middleware Security Tests

**File:** `security_tests/security_api_endpoints.py`
**Failed Tests:** 2 out of 2

#### Primary Issue: Import Path

**Error:**
```python
ModuleNotFoundError: No module named 'shared.middleware'
```

**Resolution:** ✅ **FIXED** - `shared/middleware.py` created in latest commit

**Actions Required:**

1. **Rerun tests:**
   ```bash
   pytest security_tests/security_api_endpoints.py::MiddlewareSecurityTests -v
   ```

2. **Verify both tests pass:**
   - `test_tenant_middleware_sets_tenant`
   - `test_tenant_header_injection_protection`

---

## 🟡 Authorization Tests (Medium Priority)

### 4. Authorization Security Tests

**File:** `security_tests/security_auth.py`
**Failed Tests:** 2 out of 7

#### Issue: Same Field Name Problem

**Failures:**
- ❌ `test_cross_tenant_user_access` - Field name issue
- ❌ `test_direct_object_reference_vulnerability` - Field name issue

**Actions Required:**
- Fix field names in test code
- Rerun authorization tests
- Verify cross-tenant access is properly blocked

---

## 🟡 Injection Vulnerability Tests (Medium Priority)

### 5. SQL Injection Tests

**File:** `security_tests/security_injection.py`
**Failed Tests:** 9 out of 15

#### Issue: Field Name Problems

All failures due to using wrong field names in test setup.

**Failures:**
- ❌ `test_sql_injection_in_party_name` - Field name issue
- ❌ `test_sql_injection_in_filters` - Field name issue
- ❌ `test_sql_injection_in_order_by` - Field name issue
- ❌ `test_raw_sql_injection_protection` - Field name issue
- ❌ `test_sql_injection_through_extra` - Field name issue
- ❌ `test_xss_in_party_name_storage` - Field name issue
- ❌ `test_xss_in_item_description` - Field name issue
- ❌ `test_xss_in_order_notes` - Field name issue
- ❌ `test_template_injection_in_party_name` - Field name issue

**NOTE:** Django ORM provides SQL injection protection by default, but these tests verify it. Must pass before production.

---

## 🟢 Minor Test Failures (Low Priority)

### 6. Information Disclosure Test

**File:** `security_tests/security_csrf_misc.py`
**Failed Test:** 1

**Failure:**
```python
test_error_pages_dont_leak_info
AssertionError: 403 != 404
```

**Issue:** Expected 404 for non-existent page, got 403 (Forbidden)

**Analysis:** This is likely due to tenant middleware returning 403 when no tenant can be resolved. This is actually CORRECT behavior for security, but test expectations need updating.

**Actions Required:**
- Update test to accept both 403 and 404
- Verify error pages don't leak sensitive information
- Confirm this behavior is intentional

---

## 📋 Step-by-Step Fix Plan

### Phase 1: Model Field Investigation (1-2 hours)

1. **Document actual model schemas:**
   ```bash
   python manage.py shell
   from apps.parties.models import Party
   from apps.items.models import UnitOfMeasure, Item
   from apps.orders.models import SalesOrder, PurchaseOrder

   # Print all fields for each model
   for model in [Party, UnitOfMeasure, Item, SalesOrder, PurchaseOrder]:
       print(f"\n{model.__name__} fields:")
       for field in model._meta.get_fields():
           print(f"  - {field.name}: {field.__class__.__name__}")
   ```

2. **Create field mapping document:**
   ```
   Test Expected → Actual Model Field
   Party.name → Party.[actual_field]
   UnitOfMeasure.abbreviation → UnitOfMeasure.code
   etc.
   ```

### Phase 2: Test Code Updates (2-3 hours)

1. **Update test fixtures:**
   - Fix all `setUp()` methods
   - Use correct field names
   - Add any missing required fields

2. **Update test assertions:**
   - Fix field name references in assertions
   - Update expected vs actual comparisons

3. **Test incrementally:**
   ```bash
   # Test one file at a time
   pytest security_tests/security_tenant_isolation.py -v
   pytest security_tests/security_auth.py -v
   pytest security_tests/security_injection.py -v
   pytest security_tests/security_csrf_misc.py -v
   pytest security_tests/security_api_endpoints.py -v
   ```

### Phase 3: Security Verification (1-2 hours)

1. **Run full test suite:**
   ```bash
   pytest security_tests/ -v -m security
   ```

2. **Verify 100% pass rate**

3. **Manual security testing:**
   - Create two test tenants
   - Attempt cross-tenant access
   - Verify all blocked (403/404)
   - Test SQL injection payloads manually
   - Test XSS payloads manually

### Phase 4: Documentation Update (30 minutes)

1. **Update SECURITY_REPORT.md:**
   - Change test pass rate
   - Remove "test code issues" disclaimer
   - Add "All tests passing" badge

2. **Update PRE_PRODUCTION_CHECKLIST.md:**
   - Check off test-related items
   - Document any new findings

---

## ⚠️ Known Non-Security Issues

These test failures do NOT indicate security vulnerabilities:

1. **Field name mismatches** - Tests need updating, models are correct
2. **Import path errors** - Now fixed with middleware creation
3. **403 vs 404 responses** - Actually more secure (403), test needs updating

---

## ✅ Verification Checklist

Before marking tests as complete:

- [ ] All model field names documented
- [ ] All test fixtures updated
- [ ] All tests run successfully
- [ ] Manual cross-tenant test performed
- [ ] Manual injection attack tests performed
- [ ] Test results documented
- [ ] Security report updated
- [ ] Team notified of results

---

## 🚨 BLOCKER Status

**Can we deploy to production with these test failures?**

**Answer: NO**

**Reason:** While the failures appear to be test code issues rather than actual vulnerabilities, we MUST verify this by:

1. Fixing all test code
2. Running complete test suite
3. Ensuring 100% pass rate
4. Performing manual security testing

**Only then** can we be confident the application is secure for production.

---

## 📞 Next Steps

1. **Immediate (Today):**
   - Document actual model field names
   - Fix 5-10 tests as proof of concept
   - Verify those tests pass

2. **Short Term (This Week):**
   - Fix all remaining tests
   - Achieve 100% pass rate
   - Perform manual security testing
   - Update documentation

3. **Before Production:**
   - Complete PRE_PRODUCTION_CHECKLIST.md
   - Get team sign-off on security testing
   - Deploy to staging for final verification

---

**Last Updated:** 2026-01-10
**Priority:** HIGH
**Blocking Production:** YES
**Estimated Fix Time:** 4-6 hours
