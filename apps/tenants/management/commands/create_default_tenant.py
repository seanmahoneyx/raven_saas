# apps/tenants/management/commands/create_default_tenant.py
"""
Management command to create a default tenant for development.

Usage:
    python manage.py create_default_tenant
"""
from django.core.management.base import BaseCommand
from apps.tenants.models import Tenant


class Command(BaseCommand):
    help = 'Create a default tenant for local development'

    def handle(self, *args, **options):
        # Check if default tenant already exists
        if Tenant.objects.filter(is_default=True).exists():
            self.stdout.write(
                self.style.WARNING('Default tenant already exists.')
            )
            tenant = Tenant.objects.get(is_default=True)
            self.stdout.write(
                self.style.SUCCESS(f'Default tenant: {tenant.name} (subdomain: {tenant.subdomain})')
            )
            return

        # Create default tenant
        tenant = Tenant.objects.create(
            name='Raven Distribution',
            subdomain='localhost',
            is_active=True,
            is_default=True
        )

        self.stdout.write(
            self.style.SUCCESS(f'Successfully created default tenant: {tenant.name}')
        )
        self.stdout.write(
            self.style.SUCCESS(f'  - Subdomain: {tenant.subdomain}')
        )
        self.stdout.write(
            self.style.SUCCESS(f'  - ID: {tenant.id}')
        )

        # TenantSettings and TenantSequence are auto-created by signals
        settings = tenant.settings
        sequences = tenant.sequences.all()

        self.stdout.write(
            self.style.SUCCESS(f'\nAuto-created TenantSettings with company name: {settings.company_name}')
        )
        self.stdout.write(
            self.style.SUCCESS(f'\nAuto-created {sequences.count()} sequence records:')
        )
        for seq in sequences:
            self.stdout.write(
                self.style.SUCCESS(f'  - {seq.sequence_type}: {seq.prefix}######')
            )
