"""
Management command to create test Purchase Orders for scheduler testing.
"""
from datetime import date, timedelta
from django.core.management.base import BaseCommand
from apps.tenants.models import Tenant
from apps.parties.models import Party, Vendor, Location
from apps.items.models import Item, UnitOfMeasure
from apps.orders.models import PurchaseOrder, PurchaseOrderLine
from shared.managers import set_current_tenant


class Command(BaseCommand):
    help = 'Create 20 test Purchase Orders for scheduler testing'

    def handle(self, *args, **options):
        tenant = Tenant.objects.first()
        if not tenant:
            self.stderr.write('No tenant found!')
            return

        # CRITICAL: Set the tenant in thread-local storage so TenantManager works
        set_current_tenant(tenant)
        self.stdout.write(f'Using tenant: {tenant}')

        # 1. Get or create UOM - use existing 'ea' (lowercase) if available
        uom = UnitOfMeasure.objects.filter(tenant=tenant, code__iexact='ea').first()
        if not uom:
            uom = UnitOfMeasure.objects.filter(tenant=tenant).first()
        if not uom:
            # Fallback: create new UOM with unique code
            uom = UnitOfMeasure.objects.create(
                tenant=tenant,
                code='EACH',
                name='Each',
                is_active=True
            )
            self.stdout.write(f'UOM: {uom.code} (created)')
        else:
            self.stdout.write(f'UOM: {uom.code} (exists, id={uom.id})')

        # 2. Get or create our warehouse location (ship_to for POs)
        # First we need a "self" party for our own company
        our_party = Party.objects.filter(tenant=tenant, party_type='customer').first()
        if not our_party:
            our_party = Party.objects.create(
                tenant=tenant,
                code='RAVEN',
                party_type='customer',
                display_name='Raven Warehouse',
                legal_name='Raven Distribution'
            )
            self.stdout.write(f'Our Party: {our_party.display_name} (created)')
        else:
            self.stdout.write(f'Our Party: {our_party.display_name} (exists)')

        warehouse = Location.objects.filter(tenant=tenant, location_type='WAREHOUSE').first()
        if not warehouse:
            warehouse = Location.objects.create(
                tenant=tenant,
                party=our_party,
                name='Main Warehouse',
                location_type='WAREHOUSE',
                address_line1='123 Warehouse Blvd',
                city='Los Angeles',
                state='CA',
                postal_code='90001',
                country='US',
                is_default=True
            )
            self.stdout.write(f'Warehouse: {warehouse.name} (created)')
        else:
            self.stdout.write(f'Warehouse: {warehouse.name} (exists)')

        # 4. Create 3 vendors (use filter().first() to avoid tenant filtering issues)
        vendor_data = [
            ('ABCBOX', 'ABC Box Company'),
            ('QPACK', 'Quality Packaging Inc'),
            ('METCOR', 'Metro Corrugated'),
        ]
        vendors = []
        for code, name in vendor_data:
            # Use filter().first() to work around tenant middleware
            party = Party.objects.filter(tenant=tenant, code=code).first()
            if not party:
                party = Party.objects.create(
                    tenant=tenant,
                    code=code,
                    party_type='vendor',
                    display_name=name,
                    legal_name=name
                )
            vendor = Vendor.objects.filter(tenant=tenant, party=party).first()
            if not vendor:
                vendor = Vendor.objects.create(tenant=tenant, party=party)
                created = True
            else:
                created = False
            vendors.append(vendor)
            self.stdout.write(f'Vendor: {name} (id={vendor.id}, created={created})')

        # 5. Create 5 items (use filter().first() pattern)
        item_data = [
            ('BOX-12x12x8', '12x12x8 RSC Box'),
            ('BOX-18x12x6', '18x12x6 RSC Box'),
            ('BOX-24x18x12', '24x18x12 RSC Box'),
            ('BOX-10x10x10', '10x10x10 Cube Box'),
            ('BOX-36x24x12', '36x24x12 Large RSC'),
        ]
        items = []
        for sku, name in item_data:
            item = Item.objects.filter(tenant=tenant, sku=sku).first()
            if not item:
                item = Item.objects.create(
                    tenant=tenant,
                    sku=sku,
                    name=name,
                    is_active=True,
                    base_uom=uom,
                    units_per_pallet=100
                )
                created = True
            else:
                created = False
            items.append(item)
            self.stdout.write(f'Item: {sku} (id={item.id}, created={created})')

        # 6. Create 20 POs spread across next 2 weeks
        today = date.today()
        po_count = 0

        # Delete existing test POs first
        deleted, _ = PurchaseOrder.objects.filter(
            tenant=tenant,
            po_number__startswith='PO-TEST-'
        ).delete()
        if deleted:
            self.stdout.write(f'Deleted {deleted} existing test POs')

        for i in range(20):
            vendor = vendors[i % len(vendors)]
            item = items[i % len(items)]
            # Spread across 2 weeks
            scheduled_date = today + timedelta(days=(i % 14))

            po = PurchaseOrder.objects.create(
                tenant=tenant,
                vendor=vendor,
                po_number=f'PO-TEST-{1000 + i}',
                status='confirmed',
                scheduled_date=scheduled_date,
                expected_date=scheduled_date,
                ship_to=warehouse,
                notes=f'Test PO #{i + 1} for scheduler'
            )

            # Add a line item
            PurchaseOrderLine.objects.create(
                tenant=tenant,
                purchase_order=po,
                item=item,
                quantity_ordered=100 * (1 + i % 5),
                uom=uom,
                unit_cost=10.00,
                line_number=1
            )
            po_count += 1

        self.stdout.write(self.style.SUCCESS(f'Created {po_count} test Purchase Orders'))

        # List created POs
        pos = PurchaseOrder.objects.filter(
            tenant=tenant,
            po_number__startswith='PO-TEST-'
        ).order_by('scheduled_date')[:10]

        self.stdout.write('\nSample POs:')
        for po in pos:
            self.stdout.write(
                f'  {po.po_number}: {po.vendor.party.display_name} - {po.scheduled_date}'
            )
