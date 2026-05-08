"""
Vendor importer — creates/updates Party + Vendor + Location records from CSV.
"""
from decimal import Decimal, InvalidOperation

from apps.parties.models import Party, Vendor, Location
from .base import BaseCsvImporter
from ._helpers import parse_bool_default_true


class VendorImporter(BaseCsvImporter):
    """
    Import vendors from CSV.

    Required columns: Code, Name, PaymentTerms
    Optional columns: LegalName, Email, Phone, Notes, VendorType, TaxCode, TaxId,
                      CreditLimit, ChargeFreight,
                      Address1, Address2, City, State, PostalCode, Country
    """
    required_columns = ['Code', 'Name', 'PaymentTerms']

    _VALID_VENDOR_TYPES = [v[0] for v in Vendor.VENDOR_TYPE_CHOICES]

    def validate_row(self, row_num, row):
        errors = []

        if not row.get('Code'):
            errors.append(f"Row {row_num}: Code is required.")
        if not row.get('Name'):
            errors.append(f"Row {row_num}: Name is required.")
        if not row.get('PaymentTerms'):
            errors.append(f"Row {row_num}: PaymentTerms is required.")

        vendor_type = row.get('VendorType', '').strip().upper()
        if vendor_type and vendor_type not in self._VALID_VENDOR_TYPES:
            errors.append(
                f"Row {row_num}: Invalid VendorType '{vendor_type}'. "
                f"Must be one of: {', '.join(self._VALID_VENDOR_TYPES)}"
            )

        credit_limit = row.get('CreditLimit', '').strip()
        if credit_limit:
            try:
                val = Decimal(credit_limit)
                if val < 0:
                    errors.append(f"Row {row_num}: CreditLimit must be >= 0.")
            except InvalidOperation:
                errors.append(f"Row {row_num}: CreditLimit '{credit_limit}' is not a valid decimal.")

        if row.get('Address1'):
            if not row.get('City'):
                errors.append(f"Row {row_num}: City is required when Address1 is provided.")
            if not row.get('State'):
                errors.append(f"Row {row_num}: State is required when Address1 is provided.")
            if not row.get('PostalCode'):
                errors.append(f"Row {row_num}: PostalCode is required when Address1 is provided.")

        return errors

    def process_row(self, row_num, row):
        code = row['Code']
        display_name = row['Name']

        # Determine party_type promotion
        try:
            party = Party.objects.get(tenant=self.tenant, code=code)
            was_created = False
            if party.party_type == 'CUSTOMER':
                party.party_type = 'BOTH'
            elif party.party_type == 'OTHER':
                party.party_type = 'VENDOR'
            # Always update display_name (required column).
            # Only overwrite optional fields when the row provides a value (F6).
            party.display_name = display_name
            if row.get('LegalName'):
                party.legal_name = row['LegalName']
            if row.get('Email'):
                party.main_email = row['Email']
            if row.get('Phone'):
                party.main_phone = row['Phone']
            if row.get('Notes'):
                party.notes = row['Notes']
            party.is_active = True
            party.save()
        except Party.DoesNotExist:
            # New party — set everything the row provides (F6).
            party = Party.objects.create(
                tenant=self.tenant,
                code=code,
                party_type='VENDOR',
                display_name=display_name,
                legal_name=row.get('LegalName', ''),
                main_email=row.get('Email', ''),
                main_phone=row.get('Phone', ''),
                notes=row.get('Notes', ''),
                is_active=True,
            )
            was_created = True

        # Credit limit
        credit_limit_str = row.get('CreditLimit', '').strip()
        credit_limit = Decimal(credit_limit_str) if credit_limit_str else None

        # Vendor type — only fall back to SUPPLIER for new records
        vendor_type = row.get('VendorType', '').strip().upper()

        # Use get_or_create so we don't blank-overwrite existing fields (F7).
        vendor, was_vendor_created = Vendor.objects.get_or_create(
            tenant=self.tenant,
            party=party,
            defaults={
                'payment_terms': row['PaymentTerms'],
                'vendor_type': vendor_type or 'SUPPLIER',
                'charge_freight': parse_bool_default_true(row.get('ChargeFreight')),
            },
        )
        if not was_vendor_created:
            # Always update required field.
            vendor.payment_terms = row['PaymentTerms']
            # Only overwrite optional fields when row provides a value (F7).
            if vendor_type:
                vendor.vendor_type = vendor_type
            if row.get('ChargeFreight'):
                vendor.charge_freight = parse_bool_default_true(row['ChargeFreight'])
        if row.get('TaxCode'):
            vendor.tax_code = row['TaxCode']
        if row.get('TaxId'):
            vendor.tax_id = row['TaxId']
        if credit_limit is not None:
            vendor.credit_limit = credit_limit
        vendor.save()

        # Address — only if Address1 provided
        if row.get('Address1'):
            Location.objects.update_or_create(
                tenant=self.tenant,
                party=party,
                name='Imported Address',
                defaults={
                    'location_type': 'WAREHOUSE',
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

        return 'created' if was_created else 'updated'
