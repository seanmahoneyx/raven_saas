# Test Field Name Corrections

## Field Mapping: Test Code → Actual Model

### Party Model
- ❌ `name` → ✅ `display_name`
- ✅ `tenant` (correct)
- ✅ `is_active` (correct)
- ✅ `notes` (correct)

### UnitOfMeasure Model
- ❌ `abbreviation` → ✅ `code`
- ✅ `name` (correct)
- ✅ `description` (correct)
- ✅ `tenant` (correct)

### Location Model
- ✅ `name` (correct)
- ❌ `address_1` → ✅ `address_line1`
- ❌ `address_2` → ✅ `address_line2`
- ❌ `zip_code` → ✅ `postal_code`
- ✅ `city` (correct)
- ✅ `state` (correct)

### Item Model
- ✅ `sku` (correct)
- ✅ `name` (correct)
- ✅ `description` (correct)
- ⚠️  Tests only set `description`, need to add `name` field too
- ✅ `base_uom` (correct)
- ✅ `tenant` (correct)

### Truck Model
- ✅ `name` (correct)
- ✅ `tenant` (correct)

## Summary of Required Changes

**Global Find & Replace Operations:**

1. **Party field:**
   - Find: `name="` (in Party.objects.create context)
   - Replace: `display_name="`

2. **UnitOfMeasure field:**
   - Find: `abbreviation="`
   - Replace: `code="`

3. **Location fields:**
   - Find: `address_1="`
   - Replace: `address_line1="`
   - Find: `zip_code="`
   - Replace: `postal_code="`

4. **Item field (where missing):**
   - Add `name="..."` field when creating Items

## Files to Update

- `security_tests/security_tenant_isolation.py`
- `security_tests/security_auth.py`
- `security_tests/security_injection.py`
- `security_tests/security_api_endpoints.py`

---
**Status:** Ready to apply fixes
**Estimated Time:** 15-20 minutes for all files
