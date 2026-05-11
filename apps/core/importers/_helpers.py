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
    """Append errors for Code/Name/PaymentTerms required fields. Mutates errors list in place."""
    if not row.get('Code'):
        errors.append(f"Row {row_num}: Code is required.")
    if not row.get('Name'):
        errors.append(f"Row {row_num}: Name is required.")
    if not row.get('PaymentTerms'):
        errors.append(f"Row {row_num}: PaymentTerms is required.")


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
