"""
Seed division-specific GL accounts for each item division.

Creates Sales, COGS, and Inventory sub-accounts per division:
  - Corrugated, Packaging, Tooling, Janitorial, Miscellaneous

Also adds missing accounts identified from the legacy QuickBooks COA.
"""
from django.core.management.base import BaseCommand
from apps.accounting.models import Account
from apps.tenants.models import Tenant
from shared.managers import set_current_tenant


# Division-specific accounts to create
DIVISION_ACCOUNTS = [
    # (code, name, account_type, parent_code, division_key)
    # ── Inventory by Division (under 1200 Inventory) ──
    ('1201', 'Inventory - Corrugated', 'ASSET_CURRENT', '1200', 'corrugated'),
    ('1202', 'Inventory - Packaging', 'ASSET_CURRENT', '1200', 'packaging'),
    ('1203', 'Inventory - Tooling', 'ASSET_CURRENT', '1200', 'tooling'),
    ('1204', 'Inventory - Janitorial', 'ASSET_CURRENT', '1200', 'janitorial'),
    ('1205', 'Inventory - Miscellaneous', 'ASSET_CURRENT', '1200', 'misc'),

    # ── Sales Revenue by Division (under 4000 Sales Revenue) ──
    ('4001', 'Sales - Corrugated', 'REVENUE', '4000', 'corrugated'),
    ('4002', 'Sales - Packaging', 'REVENUE', '4000', 'packaging'),
    ('4003', 'Sales - Tooling', 'REVENUE', '4000', 'tooling'),
    ('4004', 'Sales - Janitorial', 'REVENUE', '4000', 'janitorial'),
    ('4005', 'Sales - Miscellaneous', 'REVENUE', '4000', 'misc'),

    # ── COGS by Division (under 5000 Cost of Goods Sold) ──
    ('5001', 'COGS - Corrugated', 'EXPENSE_COGS', '5000', 'corrugated'),
    ('5002', 'COGS - Packaging', 'EXPENSE_COGS', '5000', 'packaging'),
    ('5003', 'COGS - Tooling', 'EXPENSE_COGS', '5000', 'tooling'),
    ('5004', 'COGS - Janitorial', 'EXPENSE_COGS', '5000', 'janitorial'),
    ('5005', 'COGS - Miscellaneous', 'EXPENSE_COGS', '5000', 'misc'),
]

# Additional accounts from QB COA that are missing
ADDITIONAL_ACCOUNTS = [
    # (code, name, account_type, parent_code)
    # ── Cash / Bank (specific bank accounts) ──
    ('1021', 'Bank of America - Checking', 'ASSET_CURRENT', '1000'),
    ('1022', 'Bank of America - Savings', 'ASSET_CURRENT', '1000'),
    ('1023', 'Capital One - Savings', 'ASSET_CURRENT', '1000'),

    # ── Other Current Assets ──
    ('1410', 'Vendor Deposits', 'ASSET_CURRENT', '1400'),
    ('1430', 'Vendor Rebate Receivable', 'ASSET_CURRENT', '1400'),
    ('1440', 'Undeposited Funds', 'ASSET_CURRENT', '1400'),
    ('1450', 'Notes Receivable', 'ASSET_CURRENT', '1400'),

    # ── Fixed Assets (consolidated from QB's per-asset tracking) ──
    ('1580', 'Delivery Equipment', 'ASSET_FIXED', '1500'),
    ('1585', 'Accumulated Depreciation - Delivery Equip', 'CONTRA_ASSET', '1500'),
    ('1590', 'Storage Trailers', 'ASSET_FIXED', '1500'),
    ('1595', 'Accumulated Depreciation - Storage Trailers', 'CONTRA_ASSET', '1500'),
    ('1596', 'Warehouse Equipment', 'ASSET_FIXED', '1500'),
    ('1597', 'Accumulated Depreciation - Warehouse Equip', 'CONTRA_ASSET', '1500'),

    # ── Credit Card Liabilities ──
    ('2050', 'Credit Card Payable', 'LIABILITY_CURRENT', '2000'),

    # ── Shareholder / Related Party ──
    ('2550', 'Shareholder Loans', 'LIABILITY_LONG_TERM', '2500'),

    # ── Equity (from QB) ──
    ('3050', 'Distributions', 'EQUITY', '3000'),

    # ── COGS sub-accounts (from QB) ──
    ('5060', 'COGS - Customs & Duties', 'EXPENSE_COGS', '5000'),
    ('5070', 'COGS - Tooling Costs', 'EXPENSE_COGS', '5000'),
    ('5080', 'COGS - Samples & Engineering', 'EXPENSE_COGS', '5000'),

    # ── Operating Expenses (from QB, consolidated) ──
    ('6190', 'Commissions', 'EXPENSE_OPERATING', '6100'),
    ('6280', 'Waste Disposal', 'EXPENSE_OPERATING', '6200'),
    ('6290', 'Exterminator/Pest Control', 'EXPENSE_OPERATING', '6200'),
    ('6370', 'Tolls', 'EXPENSE_OPERATING', '6300'),
    ('6380', 'GPS/Tracking', 'EXPENSE_OPERATING', '6300'),
    ('6390', 'Truck Inspections', 'EXPENSE_OPERATING', '6300'),
    ('6470', 'Charitable Contributions', 'EXPENSE_OPERATING', '6400'),
    ('6480', 'Client Development', 'EXPENSE_OPERATING', '6400'),
    ('6580', 'Equipment Rental', 'EXPENSE_OPERATING', '6500'),
    ('6590', 'Equipment Maintenance', 'EXPENSE_OPERATING', '6500'),
    ('6660', 'Collection Fees', 'EXPENSE_OPERATING', '6600'),

    # ── Other Income (from QB) ──
    ('4940', 'Vendor Rebate Income', 'REVENUE_OTHER', '4900'),
    ('4950', 'Gain on Sale of Assets', 'REVENUE_OTHER', '4900'),
    ('4960', 'Returned Check Fees', 'REVENUE_OTHER', '4900'),

    # ── Freight Income (from QB) ──
    ('4230', 'Freight Recovery', 'REVENUE', '4200'),

    # ── Sales Adjustments (from QB) ──
    ('4340', 'Rebates Given', 'CONTRA_REVENUE', '4300'),
]


class Command(BaseCommand):
    help = 'Seed division-specific GL accounts (Sales, COGS, Inventory per division)'

    def add_arguments(self, parser):
        parser.add_argument('--dry-run', action='store_true', help='Show what would be created without creating')

    def handle(self, *args, **options):
        dry_run = options['dry_run']
        tenant = Tenant.objects.first()
        if not tenant:
            self.stderr.write('No tenant found.')
            return

        set_current_tenant(tenant)

        created_count = 0
        skipped_count = 0

        all_accounts = DIVISION_ACCOUNTS + [(c, n, t, p) for c, n, t, p in ADDITIONAL_ACCOUNTS]

        # Process division accounts (have 5 fields)
        for entry in DIVISION_ACCOUNTS:
            code, name, account_type, parent_code, _division = entry
            created, skipped = self._create_account(
                tenant, code, name, account_type, parent_code, dry_run
            )
            created_count += created
            skipped_count += skipped

        # Process additional accounts (have 4 fields)
        for code, name, account_type, parent_code in ADDITIONAL_ACCOUNTS:
            created, skipped = self._create_account(
                tenant, code, name, account_type, parent_code, dry_run
            )
            created_count += created
            skipped_count += skipped

        action = 'Would create' if dry_run else 'Created'
        self.stdout.write(
            self.style.SUCCESS(
                f'{action} {created_count} accounts, skipped {skipped_count} (already exist)'
            )
        )

    def _create_account(self, tenant, code, name, account_type, parent_code, dry_run):
        # Check if already exists
        if Account.objects.filter(code=code).exists():
            return 0, 1

        # Find parent
        parent = Account.objects.filter(code=parent_code).first()
        if not parent:
            self.stderr.write(f'  WARN: Parent {parent_code} not found for {code} {name}')
            return 0, 1

        if dry_run:
            self.stdout.write(f'  + {code} {name} (under {parent_code})')
        else:
            Account.objects.create(
                tenant=tenant,
                code=code,
                name=name,
                account_type=account_type,
                parent=parent,
            )
            self.stdout.write(f'  + {code} {name}')

        return 1, 0
