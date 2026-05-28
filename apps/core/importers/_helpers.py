"""
Shared helper utilities for CSV importers.
"""
from decimal import Decimal, InvalidOperation

from apps.parties.models import Location


def parse_bool(value):
    """Return True if value is a truthy string (true/yes/1), else False."""
    if not value:
        return False
    return str(value).strip().lower() in ('true', 'yes', '1')


def parse_bool_default_true(value):
    """Return True if value is blank/absent; otherwise parse as bool."""
    if not value or str(value).strip() == '':
        return True
    return str(value).strip().lower() in ('true', 'yes', '1')


def int_or_none(value):
    """Parse value as int. Return None if blank/None or not a valid integer."""
    if value is None:
        return None
    s = str(value).strip()
    if not s:
        return None
    try:
        return int(s)
    except (TypeError, ValueError):
        return None


def validate_party_basics(row, row_num, errors):
    """Append errors for Name/PaymentTerms required fields. Mutates errors list in place.

    Code is optional — when blank, importers auto-generate CUST-NNN / VEND-NNN
    via `generate_next_party_code()` below.
    """
    if not row.get('Name'):
        errors.append(f"Row {row_num}: Name is required.")
    if not row.get('PaymentTerms'):
        errors.append(f"Row {row_num}: PaymentTerms is required.")


def generate_next_party_code(tenant, prefix, width=3):
    """Return the next available `{prefix}NNN` Party code for this tenant.

    Scans existing Party.code values matching the prefix and increments the
    max numeric suffix. Same race-condition profile as Item._generate_mspn:
    safe for serial/single-user imports, not safe under concurrent creates
    (will be migrated to TenantSequence.select_for_update — see backlog).
    """
    import re
    from apps.parties.models import Party
    pattern = re.compile(rf'^{re.escape(prefix)}(\d+)$')
    max_num = 0
    for code in Party.objects.filter(
        tenant=tenant, code__startswith=prefix
    ).values_list('code', flat=True):
        match = pattern.match(code or '')
        if match:
            num = int(match.group(1))
            if num > max_num:
                max_num = num
    return f"{prefix}{str(max_num + 1).zfill(width)}"


PHONE_MAX_LENGTH = 50  # matches Party.main_phone / Location.phone


def validate_phone_lengths(row, row_num, errors):
    """Append errors if Phone (and any subsidiary Phone columns) exceed the
    model's max_length. Prevents StringDataRightTruncation 500s — surfaces
    as a clean row-level validation error instead."""
    phone = (row.get('Phone') or '').strip()
    if phone and len(phone) > PHONE_MAX_LENGTH:
        errors.append(
            f"Row {row_num}: Phone exceeds {PHONE_MAX_LENGTH} characters "
            f"(was {len(phone)})."
        )


def validate_credit_limit(row, row_num, errors):
    """Append error if CreditLimit present and invalid (non-decimal or negative)."""
    raw = row.get('CreditLimit', '').strip()
    if not raw:
        return
    try:
        if Decimal(raw) < 0:
            errors.append(f"Row {row_num}: CreditLimit must be >= 0.")
    except InvalidOperation:
        errors.append(f"Row {row_num}: CreditLimit '{raw}' is not a valid decimal.")


def validate_address_completeness(row, row_num, errors):
    """Append errors if Address1 is present but City/State/PostalCode are missing."""
    if not row.get('Address1'):
        return
    for field in ('City', 'State', 'PostalCode'):
        if not row.get(field):
            errors.append(f"Row {row_num}: {field} is required when Address1 is provided.")


def upsert_party_address(tenant, party, row, location_type):
    """Create-or-update the 'Imported Address' Location for this party. No-op if Address1 missing."""
    if not row.get('Address1'):
        return
    Location.objects.update_or_create(
        tenant=tenant,
        party=party,
        name='Imported Address',
        defaults={
            'location_type': location_type,
            'address_line1': row['Address1'],
            'address_line2': row.get('Address2', ''),
            'city': row.get('City', ''),
            'state': row.get('State', ''),
            'postal_code': row.get('PostalCode', ''),
            'country': row.get('Country') or 'USA',
            'phone': row.get('Phone', ''),
            'email': row.get('Email', ''),
            'is_default': True,
            'is_active': True,
        },
    )
