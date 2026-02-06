from apps.parties.models import Party, Customer, Vendor
from apps.items.models import Item, UnitOfMeasure
from apps.warehousing.models import WarehouseLocation, Warehouse
from .base import BaseCsvImporter


VALID_LOCATION_TYPES = ['RECEIVING_DOCK', 'STORAGE', 'PICKING', 'PACKING', 'SHIPPING_DOCK', 'SCRAP']
VALID_PARTY_TYPES = ['CUSTOMER', 'VENDOR', 'BOTH', 'OTHER']


class LocationImporter(BaseCsvImporter):
    """
    Import warehouse locations from CSV.

    Required columns: Name, Barcode, Warehouse
    Optional columns: Type (defaults to STORAGE), Zone (maps to parent_path)
    """
    required_columns = ['Name', 'Barcode', 'Warehouse']

    def validate_row(self, row_num, row):
        errors = []
        if not row.get('Name'):
            errors.append(f"Row {row_num}: Name is required.")
        if not row.get('Barcode'):
            errors.append(f"Row {row_num}: Barcode is required.")
        if not row.get('Warehouse'):
            errors.append(f"Row {row_num}: Warehouse code is required.")

        # Validate warehouse exists
        wh_code = row.get('Warehouse', '')
        if wh_code and not Warehouse.objects.filter(tenant=self.tenant, code=wh_code).exists():
            errors.append(f"Row {row_num}: Warehouse '{wh_code}' not found.")

        # Validate barcode uniqueness
        barcode = row.get('Barcode', '')
        if barcode and WarehouseLocation.objects.filter(tenant=self.tenant, barcode=barcode).exists():
            errors.append(f"Row {row_num}: Barcode '{barcode}' already exists.")

        # Validate type if provided
        loc_type = row.get('Type', '').upper()
        if loc_type and loc_type not in VALID_LOCATION_TYPES:
            errors.append(f"Row {row_num}: Invalid Type '{loc_type}'. Must be one of: {', '.join(VALID_LOCATION_TYPES)}")

        return errors

    def process_row(self, row_num, row):
        warehouse = Warehouse.objects.get(tenant=self.tenant, code=row['Warehouse'])
        loc_type = row.get('Type', '').upper() or 'STORAGE'
        parent_path = row.get('Zone', '')

        _, created = WarehouseLocation.objects.update_or_create(
            tenant=self.tenant,
            barcode=row['Barcode'],
            defaults={
                'warehouse': warehouse,
                'name': row['Name'],
                'type': loc_type,
                'parent_path': parent_path,
                'is_active': True,
            },
        )
        return 'created' if created else 'updated'


class PartyImporter(BaseCsvImporter):
    """
    Import parties (customers/vendors) from CSV.

    Required columns: Code, Name, Type
    Optional columns: LegalName, Email, Phone, Notes
    """
    required_columns = ['Code', 'Name', 'Type']

    def validate_row(self, row_num, row):
        errors = []
        if not row.get('Code'):
            errors.append(f"Row {row_num}: Code is required.")
        if not row.get('Name'):
            errors.append(f"Row {row_num}: Name is required.")

        party_type = row.get('Type', '').upper()
        if not party_type:
            errors.append(f"Row {row_num}: Type is required.")
        elif party_type not in VALID_PARTY_TYPES:
            errors.append(f"Row {row_num}: Invalid Type '{party_type}'. Must be one of: {', '.join(VALID_PARTY_TYPES)}")

        # Check code uniqueness
        code = row.get('Code', '')
        if code and Party.objects.filter(tenant=self.tenant, code=code).exists():
            errors.append(f"Row {row_num}: Party code '{code}' already exists.")

        return errors

    def process_row(self, row_num, row):
        party, created = Party.objects.update_or_create(
            tenant=self.tenant,
            code=row['Code'],
            defaults={
                'display_name': row['Name'],
                'party_type': row['Type'].upper(),
                'legal_name': row.get('LegalName', ''),
                'notes': row.get('Notes', ''),
                'is_active': True,
            },
        )

        # Auto-create Customer/Vendor based on type
        party_type = row['Type'].upper()
        if party_type in ('CUSTOMER', 'BOTH'):
            Customer.objects.get_or_create(tenant=self.tenant, party=party)
        if party_type in ('VENDOR', 'BOTH'):
            Vendor.objects.get_or_create(tenant=self.tenant, party=party)

        return 'created' if created else 'updated'


class ItemImporter(BaseCsvImporter):
    """
    Import items from CSV.

    Required columns: SKU, Name, UOM
    Optional columns: Description, Division, PurchDesc, SellDesc
    """
    required_columns = ['SKU', 'Name', 'UOM']

    def validate_row(self, row_num, row):
        errors = []
        if not row.get('SKU'):
            errors.append(f"Row {row_num}: SKU is required.")
        if not row.get('Name'):
            errors.append(f"Row {row_num}: Name is required.")
        if not row.get('UOM'):
            errors.append(f"Row {row_num}: UOM code is required.")

        # Validate UOM exists
        uom_code = row.get('UOM', '')
        if uom_code and not UnitOfMeasure.objects.filter(tenant=self.tenant, code=uom_code).exists():
            errors.append(f"Row {row_num}: UOM '{uom_code}' not found. Create it first.")

        # Validate SKU uniqueness
        sku = row.get('SKU', '')
        if sku and Item.objects.filter(tenant=self.tenant, sku=sku).exists():
            errors.append(f"Row {row_num}: SKU '{sku}' already exists.")

        # Validate division if provided
        division = row.get('Division', '').lower()
        valid_divisions = ['corrugated', 'packaging', 'tooling', 'janitorial', 'misc']
        if division and division not in valid_divisions:
            errors.append(f"Row {row_num}: Invalid Division '{division}'. Must be one of: {', '.join(valid_divisions)}")

        return errors

    def process_row(self, row_num, row):
        uom = UnitOfMeasure.objects.get(tenant=self.tenant, code=row['UOM'])
        division = row.get('Division', '').lower() or 'misc'

        _, created = Item.objects.update_or_create(
            tenant=self.tenant,
            sku=row['SKU'],
            defaults={
                'name': row['Name'],
                'base_uom': uom,
                'division': division,
                'description': row.get('Description', ''),
                'purch_desc': row.get('PurchDesc', ''),
                'sell_desc': row.get('SellDesc', ''),
                'is_active': True,
                'is_inventory': True,
            },
        )
        return 'created' if created else 'updated'
