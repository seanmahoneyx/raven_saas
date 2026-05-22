"""
Bootstrap a fresh pilot deployment.

Idempotently creates:
  - The default Tenant ("MS Packaging & Supply Distribution")
  - The initial admin User (superuser, no usable password)
  - Standard Chart of Accounts (via seed_coa)
  - AccountingSettings GL defaults (AR/AP/Cash/Inventory/COGS/Income/GR-IR)

Auto-created via signals (no action needed here):
  - TenantSettings
  - TenantSequence rows

Usage:
    python manage.py seed_pilot

The admin user is created without a usable password. Set it with:
    python manage.py changepassword admin
"""
from django.contrib.auth import get_user_model
from django.core.management import call_command
from django.core.management.base import BaseCommand

from apps.accounting.models import Account, AccountingSettings
from apps.tenants.models import Tenant
from shared.managers import set_current_tenant


DEFAULT_TENANT_NAME = 'MS Packaging & Supply Distribution'
DEFAULT_TENANT_SUBDOMAIN = 'localhost'
DEFAULT_ADMIN_USERNAME = 'admin'
DEFAULT_ADMIN_EMAIL = 'seanmahoney621@gmail.com'

# Account codes used by the standard seed_coa CHART_OF_ACCOUNTS. If you change
# the chart, update these to match (or the AccountingSettings wiring step will
# silently leave a default unset and downstream postings will fail with a
# clear ValidationError pointing at the right setting).
DEFAULT_ACCOUNT_CODES = {
    'ar': '1110',           # Accounts Receivable - Trade
    'ap': '2010',           # Accounts Payable - Trade
    'cash': '1020',         # Cash - Operating Account
    'inventory': '1230',    # Inventory - Finished Goods
    'cogs': '5000',         # Cost of Goods Sold (parent)
    'income': '4000',       # Sales Revenue (parent)
    'grir': '2050',         # GR/IR Clearing (Received-Not-Billed accrual)
}


class Command(BaseCommand):
    help = 'Bootstrap a fresh pilot deployment with default tenant + admin + chart of accounts.'

    def add_arguments(self, parser):
        parser.add_argument(
            '--tenant-name', default=DEFAULT_TENANT_NAME,
            help=f'Tenant display name (default: "{DEFAULT_TENANT_NAME}")',
        )
        parser.add_argument(
            '--admin-username', default=DEFAULT_ADMIN_USERNAME,
            help=f'Admin username (default: "{DEFAULT_ADMIN_USERNAME}")',
        )
        parser.add_argument(
            '--admin-email', default=DEFAULT_ADMIN_EMAIL,
            help=f'Admin email (default: "{DEFAULT_ADMIN_EMAIL}")',
        )
        parser.add_argument(
            '--skip-coa', action='store_true',
            help='Skip Chart of Accounts seeding (use if the tenant already has accounts you want to keep)',
        )

    def handle(self, *args, **options):
        tenant = self._ensure_tenant(options['tenant_name'])
        self._ensure_admin(options['admin_username'], options['admin_email'])
        if not options['skip_coa']:
            self._ensure_chart_of_accounts(tenant)
            self._wire_accounting_defaults(tenant)
        self._print_next_steps(options['admin_username'])

    def _ensure_tenant(self, name):
        tenant = Tenant.objects.filter(is_default=True).first()
        if tenant:
            self.stdout.write(self.style.WARNING(
                f'Default tenant already exists: {tenant.name}'
            ))
            return tenant

        tenant = Tenant.objects.create(
            name=name,
            subdomain=DEFAULT_TENANT_SUBDOMAIN,
            is_active=True,
            is_default=True,
        )
        self.stdout.write(self.style.SUCCESS(
            f'Created default tenant: {tenant.name}'
        ))

        settings = tenant.settings
        sequences = tenant.sequences.all()
        self.stdout.write(self.style.SUCCESS(
            f'  TenantSettings auto-created (company_name="{settings.company_name}")'
        ))
        self.stdout.write(self.style.SUCCESS(
            f'  TenantSequence rows auto-created: {sequences.count()}'
        ))
        return tenant

    def _ensure_admin(self, username, email):
        User = get_user_model()
        existing = User.objects.filter(username=username).first()
        if existing:
            self.stdout.write(self.style.WARNING(
                f'Admin user already exists: {existing.username} ({existing.email})'
            ))
            return existing

        admin = User.objects.create(
            username=username,
            email=email,
            is_staff=True,
            is_superuser=True,
            is_active=True,
        )
        admin.set_unusable_password()
        admin.save(update_fields=['password'])
        self.stdout.write(self.style.SUCCESS(
            f'Created admin user: {admin.username} ({admin.email}) - password not yet set'
        ))
        return admin

    def _ensure_chart_of_accounts(self, tenant):
        """Seed the standard CoA if the tenant has no accounts yet."""
        existing = Account.objects.filter(tenant=tenant).count()
        if existing:
            self.stdout.write(self.style.WARNING(
                f'Tenant already has {existing} accounts - skipping CoA seed.'
            ))
            return
        # Delegate to the dedicated seed_coa command for the actual list.
        call_command('seed_coa', tenant_id=tenant.pk)

    def _wire_accounting_defaults(self, tenant):
        """Point AccountingSettings at the standard chart accounts."""
        # The Account manager is tenant-aware and filters on the thread-local
        # current_tenant; management commands run with no tenant set, so reads
        # would silently return empty without this.
        set_current_tenant(tenant)
        try:
            accounts = {
                key: Account.objects.get(tenant=tenant, code=code)
                for key, code in DEFAULT_ACCOUNT_CODES.items()
            }
        except Account.DoesNotExist as e:
            self.stdout.write(self.style.WARNING(
                f'  Skipping AccountingSettings defaults - missing account: {e}'
            ))
            return

        settings = AccountingSettings.get_for_tenant(tenant)
        settings.default_ar_account = accounts['ar']
        settings.default_ap_account = accounts['ap']
        settings.default_cash_account = accounts['cash']
        settings.default_inventory_account = accounts['inventory']
        settings.default_cogs_account = accounts['cogs']
        settings.default_income_account = accounts['income']
        settings.default_grir_account = accounts['grir']
        settings.save()
        self.stdout.write(self.style.SUCCESS(
            '  AccountingSettings defaults wired (AR, AP, Cash, Inventory, COGS, Income, GR/IR)'
        ))

    def _print_next_steps(self, username):
        self.stdout.write('')
        self.stdout.write(self.style.NOTICE('Next steps:'))
        self.stdout.write(self.style.NOTICE(
            f'  1. Set the admin password:  python manage.py changepassword {username}'
        ))
        self.stdout.write(self.style.NOTICE(
            '  2. Log in at the deployed URL and import data via Admin -> Data Import'
        ))
