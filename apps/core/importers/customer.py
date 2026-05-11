"""
Customer importer — creates/updates Party + Customer + Location records from CSV.
"""
from decimal import Decimal

from apps.parties.models import Party, Customer
from .base import BaseCsvImporter
from ._helpers import (
    parse_bool_default_true,
    validate_party_basics,
    validate_credit_limit,
    validate_address_completeness,
    upsert_party_address,
)


class CustomerImporter(BaseCsvImporter):
    """
    Import customers from CSV.

    Required columns: Code, Name, PaymentTerms
    Optional columns: LegalName, Email, Phone, Notes, CustomerType, TaxCode,
                      ResaleNumber, CreditLimit, ChargeFreight,
                      Address1, Address2, City, State, PostalCode, Country
    """
    required_columns = ['Code', 'Name', 'PaymentTerms']

    _VALID_CUSTOMER_TYPES = [c[0] for c in Customer.CUSTOMER_TYPE_CHOICES]

    def validate_row(self, row_num, row):
        errors = []
        validate_party_basics(row, row_num, errors)

        customer_type = row.get('CustomerType', '').strip().upper()
        if customer_type and customer_type not in self._VALID_CUSTOMER_TYPES:
            errors.append(
                f"Row {row_num}: Invalid CustomerType '{customer_type}'. "
                f"Must be one of: {', '.join(self._VALID_CUSTOMER_TYPES)}"
            )

        validate_credit_limit(row, row_num, errors)
        validate_address_completeness(row, row_num, errors)
        return errors

    def process_row(self, row_num, row):
        code = row['Code']
        display_name = row['Name']

        # Determine party_type promotion
        try:
            party = Party.objects.get(tenant=self.tenant, code=code)
            was_created = False
            if party.party_type == 'VENDOR':
                party.party_type = 'BOTH'
            elif party.party_type == 'OTHER':
                party.party_type = 'CUSTOMER'
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
                party_type='CUSTOMER',
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

        # Customer type (normalise to uppercase)
        customer_type = row.get('CustomerType', '').strip().upper()

        # Use get_or_create so we don't blank-overwrite existing fields (F7).
        customer, was_customer_created = Customer.objects.get_or_create(
            tenant=self.tenant,
            party=party,
            defaults={
                'payment_terms': row['PaymentTerms'],
                'charge_freight': parse_bool_default_true(row.get('ChargeFreight')),
            },
        )
        if not was_customer_created:
            # Always update required field.
            customer.payment_terms = row['PaymentTerms']
            # Only overwrite optional fields when row provides a value (F7).
            if row.get('ChargeFreight'):
                customer.charge_freight = parse_bool_default_true(row['ChargeFreight'])
        if customer_type:
            customer.customer_type = customer_type
        if row.get('TaxCode'):
            customer.tax_code = row['TaxCode']
        if row.get('ResaleNumber'):
            customer.resale_number = row['ResaleNumber']
        if credit_limit is not None:
            customer.credit_limit = credit_limit
        customer.save()

        upsert_party_address(self.tenant, party, row, location_type='SHIP_TO')

        return 'created' if was_created else 'updated'
