"""
Management command to seed default asset categories for a tenant.

Usage:
    python manage.py seed_asset_categories --tenant_id=1
    python manage.py seed_asset_categories --tenant_subdomain=acme
"""
from django.core.management.base import BaseCommand, CommandError
from django.db import transaction

from apps.tenants.models import Tenant
from apps.accounting.models import Account, AccountType
from apps.assets.models import AssetCategory
from shared.managers import set_current_tenant


# ─── Default Asset Categories ────────────────────────────────────────────────────
# (code, name, asset_acct_code, depr_expense_code, accum_depr_code, life_months)

DEFAULT_CATEGORIES = [
    ('BLDG', 'Buildings',               '1520', '6810', '1525', 480),
    ('MACH', 'Machinery & Equipment',   '1530', '6820', '1535', 120),
    ('VEH',  'Vehicles',                '1540', '6830', '1545', 60),
    ('FF',   'Furniture & Fixtures',    '1550', '6840', '1555', 84),
    ('COMP', 'Computer Equipment',      '1560', '6850', '1565', 36),
    ('LHI',  'Leasehold Improvements',  '1570', '6860', '1575', 120),
    ('DEL',  'Delivery Equipment',      '1580', '6830', '1585', 60),
    ('STOR', 'Storage Trailers',        '1590', '6830', '1595', 120),
    ('WHSE', 'Warehouse Equipment',     '1596', '6820', '1597', 84),
]

# Accounts that may need to be created if they don't exist in the chart of accounts
EXTRA_ACCOUNTS = [
    # (code, name, account_type, parent_code)
    ('1580', 'Delivery Equipment',                      AccountType.ASSET_FIXED,  '1500'),
    ('1585', 'Accumulated Depreciation - Delivery Equip', AccountType.CONTRA_ASSET, '1500'),
    ('1590', 'Storage Trailers',                        AccountType.ASSET_FIXED,  '1500'),
    ('1595', 'Accumulated Depreciation - Storage Trailers', AccountType.CONTRA_ASSET, '1500'),
    ('1596', 'Warehouse Equipment',                     AccountType.ASSET_FIXED,  '1500'),
    ('1597', 'Accumulated Depreciation - Warehouse Equip', AccountType.CONTRA_ASSET, '1500'),
]


class Command(BaseCommand):
    help = 'Seed default asset categories for a tenant'

    def add_arguments(self, parser):
        parser.add_argument('--tenant_id', type=int, help='Tenant ID')
        parser.add_argument('--tenant_subdomain', type=str, help='Tenant subdomain')
        parser.add_argument(
            '--force', action='store_true', default=False,
            help='Recreate categories even if they exist'
        )

    @transaction.atomic
    def handle(self, *args, **options):
        tenant_id = options.get('tenant_id')
        subdomain = options.get('tenant_subdomain')
        force = options.get('force', False)

        if not tenant_id and not subdomain:
            raise CommandError('Must provide either --tenant_id or --tenant_subdomain')

        try:
            if tenant_id:
                tenant = Tenant.objects.get(id=tenant_id)
            else:
                tenant = Tenant.objects.get(subdomain=subdomain)
        except Tenant.DoesNotExist:
            raise CommandError('Tenant not found')

        # Set tenant context for TenantManager-scoped queries
        set_current_tenant(tenant)

        self.stdout.write(f'Seeding asset categories for tenant: {tenant.name}')

        # Check if categories already exist
        existing_count = AssetCategory.objects.filter(tenant=tenant).count()
        if existing_count > 0:
            if force:
                self.stdout.write(
                    self.style.WARNING(f'Deleting {existing_count} existing asset categories...')
                )
                AssetCategory.objects.filter(tenant=tenant).delete()
            else:
                raise CommandError(
                    f'Tenant already has {existing_count} asset categories. '
                    f'Use --force to recreate.'
                )

        # Ensure extra GL accounts exist
        parent_account = Account.objects.filter(tenant=tenant, code='1500').first()
        for acct_code, acct_name, acct_type, parent_code in EXTRA_ACCOUNTS:
            if not Account.objects.filter(tenant=tenant, code=acct_code).exists():
                parent = Account.objects.filter(tenant=tenant, code=parent_code).first() if parent_code else None
                Account.objects.create(
                    tenant=tenant,
                    code=acct_code,
                    name=acct_name,
                    account_type=acct_type,
                    parent=parent or parent_account,
                    is_system=True,
                    is_active=True,
                    description='',
                )
                self.stdout.write(f'  Created GL account {acct_code} - {acct_name}')

        # Create asset categories
        created_count = 0
        for code, name, asset_code, depr_code, accum_code, life_months in DEFAULT_CATEGORIES:
            asset_acct = Account.objects.filter(tenant=tenant, code=asset_code).first()
            depr_acct = Account.objects.filter(tenant=tenant, code=depr_code).first()
            accum_acct = Account.objects.filter(tenant=tenant, code=accum_code).first()

            if not asset_acct:
                self.stdout.write(self.style.WARNING(
                    f'  Skipping {code}: missing asset account {asset_code}'
                ))
                continue
            if not depr_acct:
                self.stdout.write(self.style.WARNING(
                    f'  Skipping {code}: missing depreciation expense account {depr_code}'
                ))
                continue
            if not accum_acct:
                self.stdout.write(self.style.WARNING(
                    f'  Skipping {code}: missing accumulated depreciation account {accum_code}'
                ))
                continue

            AssetCategory.objects.create(
                tenant=tenant,
                code=code,
                name=name,
                asset_account=asset_acct,
                depreciation_expense_account=depr_acct,
                accumulated_depreciation_account=accum_acct,
                default_useful_life_months=life_months,
                default_depreciation_method='straight_line',
                default_salvage_rate=0,
            )
            created_count += 1
            self.stdout.write(f'  Created category {code} - {name}')

        self.stdout.write(
            self.style.SUCCESS(f'Successfully created {created_count} asset categories')
        )
