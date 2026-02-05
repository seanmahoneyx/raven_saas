"""
Management command to seed the Chart of Accounts for a new tenant.

This creates a comprehensive Chart of Accounts suitable for a
packaging distribution/manufacturing company.

Usage:
    python manage.py seed_coa --tenant_id=1
    python manage.py seed_coa --tenant_subdomain=acme
"""

from django.core.management.base import BaseCommand, CommandError
from django.db import transaction

from apps.tenants.models import Tenant
from apps.accounting.models import Account, AccountType


# ─── Standard Chart of Accounts ─────────────────────────────────────────────────

CHART_OF_ACCOUNTS = [
    # ═══════════════════════════════════════════════════════════════════════════
    # 1000-1999: ASSETS
    # ═══════════════════════════════════════════════════════════════════════════

    # Current Assets (1000-1499)
    ('1000', 'Cash and Cash Equivalents', AccountType.ASSET_CURRENT, None, True, 'Parent account for all cash accounts'),
    ('1010', 'Petty Cash', AccountType.ASSET_CURRENT, '1000', False, 'Small cash fund for minor expenses'),
    ('1020', 'Cash - Operating Account', AccountType.ASSET_CURRENT, '1000', False, 'Primary operating bank account'),
    ('1030', 'Cash - Payroll Account', AccountType.ASSET_CURRENT, '1000', False, 'Dedicated payroll bank account'),
    ('1040', 'Cash - Savings/Reserve', AccountType.ASSET_CURRENT, '1000', False, 'Savings or reserve funds'),

    ('1100', 'Accounts Receivable', AccountType.ASSET_CURRENT, None, True, 'Trade receivables from customers'),
    ('1110', 'Accounts Receivable - Trade', AccountType.ASSET_CURRENT, '1100', False, 'Customer invoices outstanding'),
    ('1120', 'Allowance for Doubtful Accounts', AccountType.CONTRA_ASSET, '1100', True, 'Reserve for uncollectible receivables'),

    ('1200', 'Inventory', AccountType.ASSET_CURRENT, None, True, 'Parent account for all inventory'),
    ('1210', 'Inventory - Raw Materials', AccountType.ASSET_CURRENT, '1200', False, 'Paper, corrugated board, packaging materials'),
    ('1220', 'Inventory - Work in Process', AccountType.ASSET_CURRENT, '1200', False, 'Boxes in production'),
    ('1230', 'Inventory - Finished Goods', AccountType.ASSET_CURRENT, '1200', False, 'Completed boxes ready for sale'),
    ('1240', 'Inventory - Consignment', AccountType.ASSET_CURRENT, '1200', False, 'Inventory held at customer locations'),
    ('1250', 'Inventory Reserve', AccountType.CONTRA_ASSET, '1200', True, 'Reserve for obsolete/damaged inventory'),

    ('1300', 'Prepaid Expenses', AccountType.ASSET_CURRENT, None, True, 'Parent for prepaid items'),
    ('1310', 'Prepaid Insurance', AccountType.ASSET_CURRENT, '1300', False, 'Insurance premiums paid in advance'),
    ('1320', 'Prepaid Rent', AccountType.ASSET_CURRENT, '1300', False, 'Rent paid in advance'),
    ('1330', 'Prepaid Supplies', AccountType.ASSET_CURRENT, '1300', False, 'Office and warehouse supplies'),

    ('1400', 'Other Current Assets', AccountType.ASSET_CURRENT, None, True, ''),
    ('1410', 'Employee Advances', AccountType.ASSET_CURRENT, '1400', False, 'Advances to employees'),
    ('1420', 'Deposits', AccountType.ASSET_CURRENT, '1400', False, 'Security deposits and other deposits'),

    # Fixed Assets (1500-1799)
    ('1500', 'Property and Equipment', AccountType.ASSET_FIXED, None, True, 'Parent for all fixed assets'),
    ('1510', 'Land', AccountType.ASSET_FIXED, '1500', False, 'Land owned'),
    ('1520', 'Buildings', AccountType.ASSET_FIXED, '1500', False, 'Warehouse and office buildings'),
    ('1525', 'Accumulated Depreciation - Buildings', AccountType.CONTRA_ASSET, '1500', True, ''),
    ('1530', 'Machinery and Equipment', AccountType.ASSET_FIXED, '1500', False, 'Box-making equipment, die cutters, etc.'),
    ('1535', 'Accumulated Depreciation - Machinery', AccountType.CONTRA_ASSET, '1500', True, ''),
    ('1540', 'Vehicles', AccountType.ASSET_FIXED, '1500', False, 'Delivery trucks and forklifts'),
    ('1545', 'Accumulated Depreciation - Vehicles', AccountType.CONTRA_ASSET, '1500', True, ''),
    ('1550', 'Furniture and Fixtures', AccountType.ASSET_FIXED, '1500', False, 'Office furniture, warehouse shelving'),
    ('1555', 'Accumulated Depreciation - F&F', AccountType.CONTRA_ASSET, '1500', True, ''),
    ('1560', 'Computer Equipment', AccountType.ASSET_FIXED, '1500', False, 'Computers, servers, printers'),
    ('1565', 'Accumulated Depreciation - Computers', AccountType.CONTRA_ASSET, '1500', True, ''),
    ('1570', 'Leasehold Improvements', AccountType.ASSET_FIXED, '1500', False, 'Improvements to leased property'),
    ('1575', 'Accumulated Amortization - Leasehold', AccountType.CONTRA_ASSET, '1500', True, ''),

    # Other Assets (1800-1999)
    ('1800', 'Other Assets', AccountType.ASSET_OTHER, None, True, ''),
    ('1810', 'Security Deposits', AccountType.ASSET_OTHER, '1800', False, 'Long-term deposits'),
    ('1820', 'Intangible Assets', AccountType.ASSET_OTHER, '1800', False, 'Software, patents, trademarks'),
    ('1825', 'Accumulated Amortization - Intangibles', AccountType.CONTRA_ASSET, '1800', True, ''),

    # ═══════════════════════════════════════════════════════════════════════════
    # 2000-2999: LIABILITIES
    # ═══════════════════════════════════════════════════════════════════════════

    # Current Liabilities (2000-2499)
    ('2000', 'Accounts Payable', AccountType.LIABILITY_CURRENT, None, True, 'Trade payables to vendors'),
    ('2010', 'Accounts Payable - Trade', AccountType.LIABILITY_CURRENT, '2000', False, 'Vendor invoices outstanding'),
    ('2020', 'Accounts Payable - Accrued', AccountType.LIABILITY_CURRENT, '2000', False, 'Accrued but not invoiced'),

    ('2100', 'Accrued Expenses', AccountType.LIABILITY_CURRENT, None, True, ''),
    ('2110', 'Accrued Wages', AccountType.LIABILITY_CURRENT, '2100', False, 'Unpaid wages at period end'),
    ('2120', 'Accrued Payroll Taxes', AccountType.LIABILITY_CURRENT, '2100', False, 'Employer payroll tax liability'),
    ('2130', 'Accrued Vacation', AccountType.LIABILITY_CURRENT, '2100', False, 'Accrued PTO liability'),
    ('2140', 'Accrued Interest', AccountType.LIABILITY_CURRENT, '2100', False, 'Interest payable'),
    ('2150', 'Accrued Utilities', AccountType.LIABILITY_CURRENT, '2100', False, 'Utility bills not yet received'),

    ('2200', 'Sales Tax Payable', AccountType.LIABILITY_CURRENT, None, True, 'Sales tax collected, due to state'),
    ('2210', 'State Sales Tax Payable', AccountType.LIABILITY_CURRENT, '2200', False, ''),
    ('2220', 'County/Local Tax Payable', AccountType.LIABILITY_CURRENT, '2200', False, ''),

    ('2300', 'Payroll Liabilities', AccountType.LIABILITY_CURRENT, None, True, ''),
    ('2310', 'Federal Withholding Payable', AccountType.LIABILITY_CURRENT, '2300', False, ''),
    ('2320', 'State Withholding Payable', AccountType.LIABILITY_CURRENT, '2300', False, ''),
    ('2330', 'FICA Payable', AccountType.LIABILITY_CURRENT, '2300', False, 'Social Security and Medicare'),
    ('2340', 'FUTA Payable', AccountType.LIABILITY_CURRENT, '2300', False, 'Federal unemployment tax'),
    ('2350', 'SUTA Payable', AccountType.LIABILITY_CURRENT, '2300', False, 'State unemployment tax'),
    ('2360', '401(k) Payable', AccountType.LIABILITY_CURRENT, '2300', False, 'Employee 401k contributions'),
    ('2370', 'Health Insurance Payable', AccountType.LIABILITY_CURRENT, '2300', False, 'Employee insurance deductions'),

    ('2400', 'Customer Deposits', AccountType.LIABILITY_CURRENT, None, True, 'Prepayments from customers'),
    ('2410', 'Deferred Revenue', AccountType.LIABILITY_CURRENT, '2400', False, 'Revenue not yet earned'),

    # Long-Term Liabilities (2500-2999)
    ('2500', 'Long-Term Debt', AccountType.LIABILITY_LONG_TERM, None, True, ''),
    ('2510', 'Notes Payable - Bank', AccountType.LIABILITY_LONG_TERM, '2500', False, 'Bank loans'),
    ('2520', 'Equipment Loans', AccountType.LIABILITY_LONG_TERM, '2500', False, 'Financed equipment'),
    ('2530', 'Vehicle Loans', AccountType.LIABILITY_LONG_TERM, '2500', False, 'Financed vehicles'),
    ('2540', 'Mortgage Payable', AccountType.LIABILITY_LONG_TERM, '2500', False, 'Building mortgage'),

    ('2600', 'Other Long-Term Liabilities', AccountType.LIABILITY_LONG_TERM, None, True, ''),
    ('2610', 'Capital Lease Obligations', AccountType.LIABILITY_LONG_TERM, '2600', False, 'Lease obligations'),

    # ═══════════════════════════════════════════════════════════════════════════
    # 3000-3999: EQUITY
    # ═══════════════════════════════════════════════════════════════════════════

    ('3000', 'Owner\'s Equity', AccountType.EQUITY, None, True, ''),
    ('3010', 'Common Stock', AccountType.EQUITY, '3000', False, 'Issued common stock'),
    ('3020', 'Additional Paid-in Capital', AccountType.EQUITY, '3000', False, 'Capital in excess of par'),
    ('3030', 'Retained Earnings', AccountType.EQUITY, '3000', True, 'Accumulated profits'),
    ('3040', 'Owner\'s Draws', AccountType.EQUITY, '3000', False, 'Distributions to owners'),
    ('3050', 'Current Year Earnings', AccountType.EQUITY, '3000', True, 'Income summary account'),

    # ═══════════════════════════════════════════════════════════════════════════
    # 4000-4999: REVENUE
    # ═══════════════════════════════════════════════════════════════════════════

    ('4000', 'Sales Revenue', AccountType.REVENUE, None, True, 'Parent for all sales'),
    ('4010', 'Sales - RSC Boxes', AccountType.REVENUE, '4000', False, 'Regular Slotted Container sales'),
    ('4020', 'Sales - Die Cut Boxes', AccountType.REVENUE, '4000', False, 'Die cut box sales'),
    ('4030', 'Sales - Folding Cartons', AccountType.REVENUE, '4000', False, 'Folding carton sales'),
    ('4040', 'Sales - Specialty Packaging', AccountType.REVENUE, '4000', False, 'Custom/specialty items'),
    ('4050', 'Sales - Sheets/Pads', AccountType.REVENUE, '4000', False, 'Corrugated sheets and pads'),
    ('4060', 'Sales - Packaging Supplies', AccountType.REVENUE, '4000', False, 'Tape, stretch wrap, etc.'),

    ('4100', 'Service Revenue', AccountType.REVENUE, None, True, ''),
    ('4110', 'Design Services', AccountType.REVENUE, '4100', False, 'Box design and prototyping'),
    ('4120', 'Assembly/Kitting Services', AccountType.REVENUE, '4100', False, 'Assembly services'),

    ('4200', 'Freight Revenue', AccountType.REVENUE, None, True, ''),
    ('4210', 'Freight Charged to Customers', AccountType.REVENUE, '4200', False, 'Delivery charges billed'),
    ('4220', 'Fuel Surcharge Revenue', AccountType.REVENUE, '4200', False, 'Fuel surcharges billed'),

    ('4300', 'Sales Adjustments', AccountType.CONTRA_REVENUE, None, True, ''),
    ('4310', 'Sales Returns', AccountType.CONTRA_REVENUE, '4300', False, 'Returned merchandise'),
    ('4320', 'Sales Allowances', AccountType.CONTRA_REVENUE, '4300', False, 'Price adjustments/claims'),
    ('4330', 'Sales Discounts', AccountType.CONTRA_REVENUE, '4300', False, 'Early payment discounts taken'),

    ('4900', 'Other Income', AccountType.REVENUE_OTHER, None, True, ''),
    ('4910', 'Interest Income', AccountType.REVENUE_OTHER, '4900', False, 'Bank interest earned'),
    ('4920', 'Scrap Sales', AccountType.REVENUE_OTHER, '4900', False, 'Sale of scrap materials'),
    ('4930', 'Miscellaneous Income', AccountType.REVENUE_OTHER, '4900', False, 'Other miscellaneous revenue'),

    # ═══════════════════════════════════════════════════════════════════════════
    # 5000-5999: COST OF GOODS SOLD
    # ═══════════════════════════════════════════════════════════════════════════

    ('5000', 'Cost of Goods Sold', AccountType.EXPENSE_COGS, None, True, 'Parent for all COGS'),
    ('5010', 'COGS - Materials', AccountType.EXPENSE_COGS, '5000', False, 'Direct material costs'),
    ('5020', 'COGS - Direct Labor', AccountType.EXPENSE_COGS, '5000', False, 'Direct labor costs'),
    ('5030', 'COGS - Manufacturing Overhead', AccountType.EXPENSE_COGS, '5000', False, 'Allocated overhead'),
    ('5040', 'COGS - Freight In', AccountType.EXPENSE_COGS, '5000', False, 'Inbound freight costs'),
    ('5050', 'COGS - Subcontract', AccountType.EXPENSE_COGS, '5000', False, 'Outside processing costs'),

    ('5100', 'Purchase Adjustments', AccountType.EXPENSE_COGS, None, True, ''),
    ('5110', 'Purchase Returns', AccountType.EXPENSE_COGS, '5100', False, 'Returns to vendors'),
    ('5120', 'Purchase Discounts', AccountType.EXPENSE_COGS, '5100', False, 'Early payment discounts received'),

    ('5200', 'Inventory Adjustments', AccountType.EXPENSE_COGS, None, True, ''),
    ('5210', 'Inventory Shrinkage', AccountType.EXPENSE_COGS, '5200', False, 'Physical count adjustments'),
    ('5220', 'Inventory Obsolescence', AccountType.EXPENSE_COGS, '5200', False, 'Write-down of obsolete inventory'),
    ('5230', 'Inventory Damage', AccountType.EXPENSE_COGS, '5200', False, 'Damaged goods written off'),

    # ═══════════════════════════════════════════════════════════════════════════
    # 6000-6999: OPERATING EXPENSES
    # ═══════════════════════════════════════════════════════════════════════════

    ('6000', 'Operating Expenses', AccountType.EXPENSE_OPERATING, None, True, 'Parent for operating expenses'),

    # Payroll & Benefits (6100)
    ('6100', 'Payroll Expenses', AccountType.EXPENSE_OPERATING, '6000', True, ''),
    ('6110', 'Salaries & Wages - Office', AccountType.EXPENSE_OPERATING, '6100', False, 'Administrative salaries'),
    ('6120', 'Salaries & Wages - Sales', AccountType.EXPENSE_OPERATING, '6100', False, 'Sales team compensation'),
    ('6130', 'Salaries & Wages - Warehouse', AccountType.EXPENSE_OPERATING, '6100', False, 'Indirect warehouse labor'),
    ('6140', 'Payroll Taxes', AccountType.EXPENSE_OPERATING, '6100', False, 'Employer payroll taxes'),
    ('6150', 'Employee Benefits', AccountType.EXPENSE_OPERATING, '6100', False, 'Health, dental, vision insurance'),
    ('6160', '401(k) Employer Match', AccountType.EXPENSE_OPERATING, '6100', False, 'Retirement plan matching'),
    ('6170', 'Workers Compensation', AccountType.EXPENSE_OPERATING, '6100', False, 'Workers comp insurance'),
    ('6180', 'Temporary Labor', AccountType.EXPENSE_OPERATING, '6100', False, 'Temp agency costs'),

    # Facilities (6200)
    ('6200', 'Facilities Expenses', AccountType.EXPENSE_OPERATING, '6000', True, ''),
    ('6210', 'Rent', AccountType.EXPENSE_OPERATING, '6200', False, 'Building and equipment rent'),
    ('6220', 'Utilities', AccountType.EXPENSE_OPERATING, '6200', False, 'Electric, gas, water'),
    ('6230', 'Property Taxes', AccountType.EXPENSE_OPERATING, '6200', False, 'Real estate taxes'),
    ('6240', 'Property Insurance', AccountType.EXPENSE_OPERATING, '6200', False, 'Building insurance'),
    ('6250', 'Repairs & Maintenance', AccountType.EXPENSE_OPERATING, '6200', False, 'Building and equipment repairs'),
    ('6260', 'Janitorial Services', AccountType.EXPENSE_OPERATING, '6200', False, 'Cleaning services'),
    ('6270', 'Security', AccountType.EXPENSE_OPERATING, '6200', False, 'Security services and systems'),

    # Vehicle & Delivery (6300)
    ('6300', 'Vehicle & Delivery Expenses', AccountType.EXPENSE_OPERATING, '6000', True, ''),
    ('6310', 'Fuel', AccountType.EXPENSE_OPERATING, '6300', False, 'Vehicle fuel costs'),
    ('6320', 'Vehicle Maintenance', AccountType.EXPENSE_OPERATING, '6300', False, 'Repairs and maintenance'),
    ('6330', 'Vehicle Insurance', AccountType.EXPENSE_OPERATING, '6300', False, 'Auto insurance'),
    ('6340', 'Vehicle Registration', AccountType.EXPENSE_OPERATING, '6300', False, 'License and registration'),
    ('6350', 'Freight Out', AccountType.EXPENSE_OPERATING, '6300', False, 'Outbound delivery costs'),
    ('6360', 'Common Carrier', AccountType.EXPENSE_OPERATING, '6300', False, 'Third-party shipping'),

    # Sales & Marketing (6400)
    ('6400', 'Sales & Marketing', AccountType.EXPENSE_OPERATING, '6000', True, ''),
    ('6410', 'Advertising', AccountType.EXPENSE_OPERATING, '6400', False, 'Advertising and promotion'),
    ('6420', 'Trade Shows', AccountType.EXPENSE_OPERATING, '6400', False, 'Trade show expenses'),
    ('6430', 'Sales Commissions', AccountType.EXPENSE_OPERATING, '6400', False, 'Commission expenses'),
    ('6440', 'Travel - Sales', AccountType.EXPENSE_OPERATING, '6400', False, 'Sales travel expenses'),
    ('6450', 'Samples', AccountType.EXPENSE_OPERATING, '6400', False, 'Sample costs'),
    ('6460', 'Customer Entertainment', AccountType.EXPENSE_OPERATING, '6400', False, 'Meals and entertainment'),

    # Office & Administrative (6500)
    ('6500', 'Office & Administrative', AccountType.EXPENSE_OPERATING, '6000', True, ''),
    ('6510', 'Office Supplies', AccountType.EXPENSE_OPERATING, '6500', False, 'General office supplies'),
    ('6520', 'Postage & Shipping', AccountType.EXPENSE_OPERATING, '6500', False, 'Office mail and shipping'),
    ('6530', 'Telephone & Internet', AccountType.EXPENSE_OPERATING, '6500', False, 'Phone and internet service'),
    ('6540', 'Software & Subscriptions', AccountType.EXPENSE_OPERATING, '6500', False, 'Software licenses'),
    ('6550', 'Dues & Memberships', AccountType.EXPENSE_OPERATING, '6500', False, 'Industry association dues'),
    ('6560', 'Training & Education', AccountType.EXPENSE_OPERATING, '6500', False, 'Employee training'),
    ('6570', 'Printing & Copying', AccountType.EXPENSE_OPERATING, '6500', False, 'Print services'),

    # Professional Services (6600)
    ('6600', 'Professional Services', AccountType.EXPENSE_OPERATING, '6000', True, ''),
    ('6610', 'Accounting & Bookkeeping', AccountType.EXPENSE_OPERATING, '6600', False, 'CPA and bookkeeping fees'),
    ('6620', 'Legal Fees', AccountType.EXPENSE_OPERATING, '6600', False, 'Attorney fees'),
    ('6630', 'Consulting', AccountType.EXPENSE_OPERATING, '6600', False, 'Business consulting'),
    ('6640', 'IT Services', AccountType.EXPENSE_OPERATING, '6600', False, 'IT support and services'),
    ('6650', 'Payroll Services', AccountType.EXPENSE_OPERATING, '6600', False, 'Payroll processing fees'),

    # Insurance (6700)
    ('6700', 'Insurance Expenses', AccountType.EXPENSE_OPERATING, '6000', True, ''),
    ('6710', 'General Liability Insurance', AccountType.EXPENSE_OPERATING, '6700', False, 'GL insurance'),
    ('6720', 'Product Liability Insurance', AccountType.EXPENSE_OPERATING, '6700', False, 'Product liability'),
    ('6730', 'Directors & Officers Insurance', AccountType.EXPENSE_OPERATING, '6700', False, 'D&O insurance'),
    ('6740', 'Umbrella Insurance', AccountType.EXPENSE_OPERATING, '6700', False, 'Umbrella coverage'),

    # Depreciation & Amortization (6800)
    ('6800', 'Depreciation & Amortization', AccountType.EXPENSE_OPERATING, '6000', True, ''),
    ('6810', 'Depreciation - Buildings', AccountType.EXPENSE_OPERATING, '6800', False, ''),
    ('6820', 'Depreciation - Machinery', AccountType.EXPENSE_OPERATING, '6800', False, ''),
    ('6830', 'Depreciation - Vehicles', AccountType.EXPENSE_OPERATING, '6800', False, ''),
    ('6840', 'Depreciation - F&F', AccountType.EXPENSE_OPERATING, '6800', False, ''),
    ('6850', 'Depreciation - Computers', AccountType.EXPENSE_OPERATING, '6800', False, ''),
    ('6860', 'Amortization - Leasehold', AccountType.EXPENSE_OPERATING, '6800', False, ''),
    ('6870', 'Amortization - Intangibles', AccountType.EXPENSE_OPERATING, '6800', False, ''),

    # Miscellaneous (6900)
    ('6900', 'Miscellaneous Expenses', AccountType.EXPENSE_OPERATING, '6000', True, ''),
    ('6910', 'Bank Charges', AccountType.EXPENSE_OPERATING, '6900', False, 'Bank service fees'),
    ('6920', 'Credit Card Fees', AccountType.EXPENSE_OPERATING, '6900', False, 'Merchant processing fees'),
    ('6930', 'Bad Debt Expense', AccountType.EXPENSE_OPERATING, '6900', False, 'Uncollectible accounts'),
    ('6940', 'Licenses & Permits', AccountType.EXPENSE_OPERATING, '6900', False, 'Business licenses'),
    ('6950', 'Penalties & Fines', AccountType.EXPENSE_OPERATING, '6900', False, 'Late fees and penalties'),
    ('6990', 'Other Operating Expenses', AccountType.EXPENSE_OPERATING, '6900', False, 'Miscellaneous'),

    # ═══════════════════════════════════════════════════════════════════════════
    # 7000-7999: OTHER INCOME/EXPENSES
    # ═══════════════════════════════════════════════════════════════════════════

    ('7000', 'Other Expenses', AccountType.EXPENSE_OTHER, None, True, ''),
    ('7010', 'Interest Expense', AccountType.EXPENSE_OTHER, '7000', False, 'Loan interest'),
    ('7020', 'Loss on Asset Disposal', AccountType.EXPENSE_OTHER, '7000', False, 'Loss on sale of assets'),
    ('7030', 'Income Tax Expense', AccountType.EXPENSE_OTHER, '7000', False, 'Federal and state income tax'),
]


class Command(BaseCommand):
    help = 'Seed the Chart of Accounts for a tenant'

    def add_arguments(self, parser):
        parser.add_argument(
            '--tenant_id',
            type=int,
            help='Tenant ID to seed accounts for'
        )
        parser.add_argument(
            '--tenant_subdomain',
            type=str,
            help='Tenant subdomain to seed accounts for'
        )
        parser.add_argument(
            '--force',
            action='store_true',
            help='Recreate accounts even if they exist'
        )

    @transaction.atomic
    def handle(self, *args, **options):
        tenant_id = options.get('tenant_id')
        subdomain = options.get('tenant_subdomain')
        force = options.get('force', False)

        if not tenant_id and not subdomain:
            raise CommandError('Must provide either --tenant_id or --tenant_subdomain')

        # Get tenant
        try:
            if tenant_id:
                tenant = Tenant.objects.get(id=tenant_id)
            else:
                tenant = Tenant.objects.get(subdomain=subdomain)
        except Tenant.DoesNotExist:
            raise CommandError(f'Tenant not found')

        self.stdout.write(f'Seeding Chart of Accounts for tenant: {tenant.name}')

        # Check if accounts already exist
        existing_count = Account.objects.filter(tenant=tenant).count()
        if existing_count > 0:
            if force:
                self.stdout.write(
                    self.style.WARNING(f'Deleting {existing_count} existing accounts...')
                )
                Account.objects.filter(tenant=tenant).delete()
            else:
                raise CommandError(
                    f'Tenant already has {existing_count} accounts. '
                    f'Use --force to recreate.'
                )

        # Create accounts in order (parents before children)
        created_accounts = {}
        created_count = 0

        for code, name, account_type, parent_code, is_system, description in CHART_OF_ACCOUNTS:
            parent = created_accounts.get(parent_code) if parent_code else None

            account = Account.objects.create(
                tenant=tenant,
                code=code,
                name=name,
                account_type=account_type,
                parent=parent,
                is_system=is_system,
                description=description,
                is_active=True
            )
            created_accounts[code] = account
            created_count += 1

        self.stdout.write(
            self.style.SUCCESS(f'Successfully created {created_count} accounts')
        )

        # Print summary by type
        self.stdout.write('\nAccount Summary by Type:')
        for account_type in AccountType:
            count = Account.objects.filter(
                tenant=tenant,
                account_type=account_type
            ).count()
            if count > 0:
                self.stdout.write(f'  {account_type.label}: {count}')
