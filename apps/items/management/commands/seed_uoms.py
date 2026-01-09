# apps/items/management/commands/seed_uoms.py
"""
Management command to seed standard Units of Measure for a tenant.

Usage:
    python manage.py seed_uoms
"""
from django.core.management.base import BaseCommand
from apps.tenants.models import Tenant
from apps.items.models import UnitOfMeasure


STANDARD_UOMS = [
    ('ea', 'Each', 'Base unit - individual item'),
    ('cs', 'Case', 'Carton or case of items'),
    ('plt', 'Pallet', 'Full pallet'),
    ('rl', 'Roll', 'Roll (for fabric, paper, etc.)'),
    ('bx', 'Box', 'Box'),
    ('pk', 'Pack', 'Pack or bundle'),
    ('dz', 'Dozen', '12 units'),
]


class Command(BaseCommand):
    help = 'Seed standard Units of Measure for the default tenant'

    def handle(self, *args, **options):
        tenant = Tenant.objects.filter(is_default=True).first()

        if not tenant:
            self.stdout.write(
                self.style.ERROR('No default tenant found. Run create_default_tenant first.')
            )
            return

        self.stdout.write(f'Seeding UOMs for tenant: {tenant.name}')

        created_count = 0
        for code, name, description in STANDARD_UOMS:
            uom, created = UnitOfMeasure.objects.get_or_create(
                tenant=tenant,
                code=code,
                defaults={
                    'name': name,
                    'description': description,
                    'is_active': True
                }
            )
            if created:
                created_count += 1
                self.stdout.write(self.style.SUCCESS(f'  Created: {code} - {name}'))
            else:
                self.stdout.write(f'  Exists: {code} - {name}')

        self.stdout.write(
            self.style.SUCCESS(f'\nDone! Created {created_count} new UOMs.')
        )
