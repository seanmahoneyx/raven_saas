from decimal import Decimal, InvalidOperation
from django.utils import timezone

from apps.parties.models import Party, Customer, Vendor
from apps.items.models import Item, UnitOfMeasure
from apps.warehousing.models import WarehouseLocation, Warehouse
from apps.accounting.models import Account, JournalEntry, JournalEntryLine
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


class GLOpeningBalanceImporter(BaseCsvImporter):
    """
    Import GL opening balances from CSV.

    Creates a single posted Journal Entry with one line per row.
    Each row debits or credits a GL account. The CSV must balance
    (total debits == total credits) or an Opening Balance Equity
    plug line is auto-generated.

    Required columns: AccountCode, Debit, Credit
    Optional columns: Description
    """
    required_columns = ['AccountCode', 'Debit', 'Credit']

    def validate_row(self, row_num, row):
        errors = []
        if not row.get('AccountCode'):
            errors.append(f"Row {row_num}: AccountCode is required.")

        # Validate account exists
        code = row.get('AccountCode', '').strip()
        if code and not Account.objects.filter(tenant=self.tenant, code=code).exists():
            errors.append(f"Row {row_num}: Account '{code}' not found in Chart of Accounts.")

        # Validate amounts are valid decimals
        debit_str = row.get('Debit', '').strip()
        credit_str = row.get('Credit', '').strip()
        debit_val = Decimal('0')
        credit_val = Decimal('0')

        if debit_str:
            try:
                debit_val = Decimal(debit_str)
                if debit_val < 0:
                    errors.append(f"Row {row_num}: Debit cannot be negative.")
            except InvalidOperation:
                errors.append(f"Row {row_num}: Invalid Debit amount '{debit_str}'.")

        if credit_str:
            try:
                credit_val = Decimal(credit_str)
                if credit_val < 0:
                    errors.append(f"Row {row_num}: Credit cannot be negative.")
            except InvalidOperation:
                errors.append(f"Row {row_num}: Invalid Credit amount '{credit_str}'.")

        if debit_val == 0 and credit_val == 0:
            errors.append(f"Row {row_num}: Row must have a Debit or Credit amount.")

        if debit_val > 0 and credit_val > 0:
            errors.append(f"Row {row_num}: Row cannot have both Debit and Credit.")

        return errors

    def process_row(self, row_num, row):
        # Rows are collected and processed in bulk via post_process
        if not hasattr(self, '_pending_lines'):
            self._pending_lines = []

        code = row['AccountCode'].strip()
        debit = Decimal(row.get('Debit', '').strip() or '0')
        credit = Decimal(row.get('Credit', '').strip() or '0')
        description = row.get('Description', '').strip()

        self._pending_lines.append({
            'account_code': code,
            'debit': debit,
            'credit': credit,
            'description': description,
        })
        return 'created'

    def post_process(self):
        """Create a single Journal Entry with all opening balance lines."""
        if not hasattr(self, '_pending_lines') or not self._pending_lines:
            return

        # Calculate totals
        total_debit = sum(l['debit'] for l in self._pending_lines)
        total_credit = sum(l['credit'] for l in self._pending_lines)

        # Generate entry number
        today = timezone.now().date()
        count = JournalEntry.objects.filter(tenant=self.tenant).count()
        entry_number = f"JE-OB-{today.strftime('%Y')}-{count + 1:04d}"

        je = JournalEntry.objects.create(
            tenant=self.tenant,
            entry_number=entry_number,
            date=today,
            memo='Opening Balance Import',
            entry_type='standard',
            status='posted',
            posted_at=timezone.now(),
            posted_by=self.user,
            created_by=self.user,
        )

        line_num = 10
        for line_data in self._pending_lines:
            account = Account.objects.get(
                tenant=self.tenant,
                code=line_data['account_code'],
            )
            JournalEntryLine.objects.create(
                tenant=self.tenant,
                entry=je,
                line_number=line_num,
                account=account,
                description=line_data['description'] or f"Opening balance - {account.name}",
                debit=line_data['debit'],
                credit=line_data['credit'],
            )
            line_num += 10

        # Auto-plug if unbalanced
        diff = total_debit - total_credit
        if diff != Decimal('0'):
            equity_account = Account.objects.filter(
                tenant=self.tenant,
                account_type='EQUITY',
            ).first()
            if equity_account:
                JournalEntryLine.objects.create(
                    tenant=self.tenant,
                    entry=je,
                    line_number=line_num,
                    account=equity_account,
                    description='Opening Balance Equity (auto-plug)',
                    debit=abs(diff) if diff < 0 else Decimal('0'),
                    credit=diff if diff > 0 else Decimal('0'),
                )
