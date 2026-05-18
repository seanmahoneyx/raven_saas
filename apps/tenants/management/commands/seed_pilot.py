"""
Bootstrap a fresh pilot deployment.

Idempotently creates:
  - The default Tenant ("MS Packaging & Supply Distribution")
  - The initial admin User (superuser, no usable password)

Auto-created via signals (no action needed here):
  - TenantSettings
  - TenantSequence rows
  - Default chart of accounts

Usage:
    python manage.py seed_pilot

The admin user is created without a usable password. Set it with:
    python manage.py changepassword admin
"""
from django.contrib.auth import get_user_model
from django.core.management.base import BaseCommand

from apps.tenants.models import Tenant


DEFAULT_TENANT_NAME = 'MS Packaging & Supply Distribution'
DEFAULT_TENANT_SUBDOMAIN = 'localhost'
DEFAULT_ADMIN_USERNAME = 'admin'
DEFAULT_ADMIN_EMAIL = 'seanmahoney621@gmail.com'


class Command(BaseCommand):
    help = 'Bootstrap a fresh pilot deployment with default tenant + initial admin.'

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

    def handle(self, *args, **options):
        tenant = self._ensure_tenant(options['tenant_name'])
        self._ensure_admin(options['admin_username'], options['admin_email'])
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
            f'Created admin user: {admin.username} ({admin.email}) — password not yet set'
        ))
        return admin

    def _print_next_steps(self, username):
        self.stdout.write('')
        self.stdout.write(self.style.NOTICE('Next steps:'))
        self.stdout.write(self.style.NOTICE(
            f'  1. Set the admin password:  python manage.py changepassword {username}'
        ))
        self.stdout.write(self.style.NOTICE(
            '  2. Log in at the deployed URL and import data via Admin → Data Import'
        ))
