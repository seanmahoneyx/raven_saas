"""
Warehouse importer — creates/updates Warehouse records from CSV.
"""
from apps.warehousing.models import Warehouse
from .base import BaseCsvImporter
from ._helpers import parse_bool, int_or_none


class WarehouseImporter(BaseCsvImporter):
    """
    Import warehouses from CSV.

    Required columns: Code, Name
    Optional columns: IsDefault, PalletCapacity, Notes
    """
    required_columns = ['Code', 'Name']

    def validate_row(self, row_num, row):
        errors = []
        if not row.get('Code'):
            errors.append(f"Row {row_num}: Code is required.")
        if not row.get('Name'):
            errors.append(f"Row {row_num}: Name is required.")

        pallet_cap = row.get('PalletCapacity', '')
        if pallet_cap:
            try:
                val = int(pallet_cap)
                if val < 0:
                    errors.append(f"Row {row_num}: PalletCapacity must be a non-negative integer.")
            except (ValueError, TypeError):
                errors.append(f"Row {row_num}: PalletCapacity '{pallet_cap}' is not a valid integer.")

        return errors

    def process_row(self, row_num, row):
        _, created = Warehouse.objects.update_or_create(
            tenant=self.tenant,
            code=row['Code'],
            defaults={
                'name': row['Name'],
                'is_default': parse_bool(row.get('IsDefault')),
                'pallet_capacity': int_or_none(row.get('PalletCapacity')),
                'notes': row.get('Notes', ''),
                'is_active': True,
            },
        )
        return 'created' if created else 'updated'
