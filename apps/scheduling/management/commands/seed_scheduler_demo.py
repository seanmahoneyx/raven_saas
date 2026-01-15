# apps/scheduling/management/commands/seed_scheduler_demo.py
"""
Management command to populate demo data for testing the Scheduler.

Creates:
- 3 Trucks for delivery scheduling
- 5 Vendors with parties and locations
- 5 Customers with parties and locations
- 5 Items with UOMs
- 10 Purchase Orders (unscheduled)
- 10 Sales Orders (unscheduled)

Usage:
    python manage.py seed_scheduler_demo
    python manage.py seed_scheduler_demo --clear  # Clear existing demo data first
"""
from decimal import Decimal
from django.core.management.base import BaseCommand
from django.utils import timezone
from apps.tenants.models import Tenant
from apps.parties.models import Party, Customer, Vendor, Location, Truck
from apps.items.models import UnitOfMeasure, Item
from apps.orders.models import PurchaseOrder, PurchaseOrderLine, SalesOrder, SalesOrderLine
from shared.managers import set_current_tenant


# Demo data definitions
VENDORS = [
    ('ACME', 'Acme Produce Co.', 'Chicago', 'IL'),
    ('FRESH', 'Fresh Farms LLC', 'Miami', 'FL'),
    ('GLOBAL', 'Global Goods Inc.', 'Los Angeles', 'CA'),
    ('PRIME', 'Prime Suppliers', 'Denver', 'CO'),
    ('VALLEY', 'Valley Distributors', 'Phoenix', 'AZ'),
]

CUSTOMERS = [
    ('METRO', 'Metro Markets', 'New York', 'NY'),
    ('SUNNY', 'Sunny Side Grocers', 'Atlanta', 'GA'),
    ('HARVEST', 'Harvest Foods', 'Dallas', 'TX'),
    ('GREEN', 'Green Leaf Stores', 'Seattle', 'WA'),
    ('COASTAL', 'Coastal Supermarkets', 'San Diego', 'CA'),
]

TRUCKS = [
    ('Truck 1 - Local', 'ABC-1234', 24),
    ('Truck 2 - Regional', 'DEF-5678', 48),
    ('Truck 3 - Long Haul', 'GHI-9012', 52),
]

ITEMS = [
    ('APPLE-FJ', 'Fuji Apples', 'Premium grade Fuji apples'),
    ('BANANA-OR', 'Organic Bananas', 'Fair trade organic bananas'),
    ('ORANGE-NV', 'Navel Oranges', 'California navel oranges'),
    ('GRAPE-RD', 'Red Grapes', 'Seedless red grapes'),
    ('LEMON-MR', 'Meyer Lemons', 'Meyer lemons from California'),
]


class Command(BaseCommand):
    help = 'Seed demo data for Scheduler testing (trucks, parties, orders)'

    def add_arguments(self, parser):
        parser.add_argument(
            '--clear',
            action='store_true',
            help='Clear existing demo orders before seeding',
        )

    def handle(self, *args, **options):
        tenant = Tenant.objects.filter(is_default=True).first()

        if not tenant:
            self.stdout.write(
                self.style.ERROR('No default tenant found. Run create_default_tenant first.')
            )
            return

        # Set current tenant for TenantManager to work properly
        set_current_tenant(tenant)

        self.stdout.write(f'Seeding scheduler demo data for tenant: {tenant.name}')

        if options['clear']:
            self.clear_demo_data(tenant)

        # Create trucks
        trucks = self.create_trucks(tenant)

        # Ensure UOMs exist
        uom_each = self.ensure_uom(tenant)

        # Create items
        items = self.create_items(tenant, uom_each)

        # Create vendors and their parties/locations
        vendors = self.create_vendors(tenant)

        # Create customers and their parties/locations
        customers = self.create_customers(tenant)

        # Get our warehouse location
        warehouse = self.ensure_warehouse(tenant)

        # Create purchase orders
        self.create_purchase_orders(tenant, vendors, items, uom_each, warehouse)

        # Create sales orders
        self.create_sales_orders(tenant, customers, items, uom_each, warehouse)

        self.stdout.write(self.style.SUCCESS('\nDemo data seeded successfully!'))
        self.stdout.write(f'  - {len(trucks)} trucks')
        self.stdout.write(f'  - {len(vendors)} vendors')
        self.stdout.write(f'  - {len(customers)} customers')
        self.stdout.write(f'  - {len(items)} items')
        self.stdout.write(f'  - 10 purchase orders (unscheduled)')
        self.stdout.write(f'  - 10 sales orders (unscheduled)')

    def clear_demo_data(self, tenant):
        """Clear demo orders (POs and SOs starting with DEMO)."""
        self.stdout.write('Clearing existing demo data...')

        # Delete demo sales orders
        so_deleted, _ = SalesOrder.objects.filter(
            tenant=tenant,
            order_number__startswith='DEMO-SO-'
        ).delete()
        self.stdout.write(f'  Deleted {so_deleted} sales orders')

        # Delete demo purchase orders
        po_deleted, _ = PurchaseOrder.objects.filter(
            tenant=tenant,
            po_number__startswith='DEMO-PO-'
        ).delete()
        self.stdout.write(f'  Deleted {po_deleted} purchase orders')

    def create_trucks(self, tenant):
        """Create delivery trucks."""
        self.stdout.write('\nCreating trucks...')
        trucks = []
        for name, plate, capacity in TRUCKS:
            truck, created = Truck.objects.get_or_create(
                tenant=tenant,
                name=name,
                defaults={
                    'license_plate': plate,
                    'capacity_pallets': capacity,
                    'is_active': True,
                }
            )
            status = 'Created' if created else 'Exists'
            self.stdout.write(f'  {status}: {name}')
            trucks.append(truck)
        return trucks

    def ensure_uom(self, tenant):
        """Ensure base UOM exists."""
        uom, created = UnitOfMeasure.objects.get_or_create(
            tenant=tenant,
            code='ea',
            defaults={
                'name': 'Each',
                'description': 'Base unit',
                'is_active': True,
            }
        )
        return uom

    def create_items(self, tenant, uom_each):
        """Create demo items."""
        self.stdout.write('\nCreating items...')
        items = []
        for sku, name, desc in ITEMS:
            item, created = Item.objects.get_or_create(
                tenant=tenant,
                sku=sku,
                defaults={
                    'name': name,
                    'description': desc,
                    'base_uom': uom_each,
                    'is_inventory': True,
                    'is_active': True,
                }
            )
            status = 'Created' if created else 'Exists'
            self.stdout.write(f'  {status}: {sku}')
            items.append(item)
        return items

    def create_vendors(self, tenant):
        """Create vendor parties with locations."""
        self.stdout.write('\nCreating vendors...')
        vendors = []
        for code, name, city, state in VENDORS:
            # Create or get party
            party, party_created = Party.objects.get_or_create(
                tenant=tenant,
                code=code,
                defaults={
                    'party_type': 'VENDOR',
                    'display_name': name,
                    'legal_name': name,
                    'is_active': True,
                }
            )

            # Create or get vendor record
            vendor, vendor_created = Vendor.objects.get_or_create(
                tenant=tenant,
                party=party,
                defaults={
                    'payment_terms': 'NET30',
                }
            )

            # Create location if party was just created
            if party_created:
                Location.objects.create(
                    tenant=tenant,
                    party=party,
                    location_type='WAREHOUSE',
                    name='Main Warehouse',
                    address_line1=f'123 {code} Industrial Dr',
                    city=city,
                    state=state,
                    postal_code='12345',
                    country='USA',
                    is_default=True,
                    is_active=True,
                )

            status = 'Created' if party_created else 'Exists'
            self.stdout.write(f'  {status}: {name}')
            vendors.append(vendor)
        return vendors

    def create_customers(self, tenant):
        """Create customer parties with locations."""
        self.stdout.write('\nCreating customers...')
        customers = []
        for code, name, city, state in CUSTOMERS:
            # Create or get party
            party, party_created = Party.objects.get_or_create(
                tenant=tenant,
                code=code,
                defaults={
                    'party_type': 'CUSTOMER',
                    'display_name': name,
                    'legal_name': name,
                    'is_active': True,
                }
            )

            # Create location if party was just created
            location = None
            if party_created:
                location = Location.objects.create(
                    tenant=tenant,
                    party=party,
                    location_type='SHIP_TO',
                    name='Main Store',
                    address_line1=f'456 {code} Commerce Blvd',
                    city=city,
                    state=state,
                    postal_code='67890',
                    country='USA',
                    is_default=True,
                    is_active=True,
                )
            else:
                location = party.locations.filter(is_active=True).first()

            # Create or get customer record
            customer, customer_created = Customer.objects.get_or_create(
                tenant=tenant,
                party=party,
                defaults={
                    'payment_terms': 'NET30',
                    'default_ship_to': location,
                }
            )

            status = 'Created' if party_created else 'Exists'
            self.stdout.write(f'  {status}: {name}')
            customers.append(customer)
        return customers

    def ensure_warehouse(self, tenant):
        """Create or get our warehouse location."""
        # Create a warehouse party
        party, _ = Party.objects.get_or_create(
            tenant=tenant,
            code='OUR-WH',
            defaults={
                'party_type': 'OTHER',
                'display_name': 'Our Warehouse',
                'legal_name': tenant.name,
                'is_active': True,
            }
        )

        location, _ = Location.objects.get_or_create(
            tenant=tenant,
            party=party,
            name='Main Distribution Center',
            defaults={
                'location_type': 'WAREHOUSE',
                'address_line1': '100 Distribution Way',
                'city': 'Memphis',
                'state': 'TN',
                'postal_code': '38118',
                'country': 'USA',
                'is_default': True,
                'is_active': True,
            }
        )
        return location

    def create_purchase_orders(self, tenant, vendors, items, uom, warehouse):
        """Create 10 unscheduled purchase orders."""
        self.stdout.write('\nCreating purchase orders...')

        po_configs = [
            # (vendor_idx, priority, num_lines, status, notes)
            (0, 2, 3, 'confirmed', 'Urgent - customer waiting'),
            (1, 5, 2, 'confirmed', ''),
            (2, 3, 4, 'confirmed', 'Call before delivery'),
            (3, 5, 1, 'draft', ''),
            (4, 4, 2, 'confirmed', 'Dock 3 only'),
            (0, 5, 3, 'confirmed', ''),
            (1, 1, 2, 'confirmed', 'RUSH - Hot load'),
            (2, 5, 1, 'draft', ''),
            (3, 3, 2, 'confirmed', 'AM delivery required'),
            (4, 5, 3, 'confirmed', ''),
        ]

        for i, (vendor_idx, priority, num_lines, status, notes) in enumerate(po_configs, 1):
            po_number = f'DEMO-PO-{i:03d}'

            # Skip if already exists
            if PurchaseOrder.objects.filter(tenant=tenant, po_number=po_number).exists():
                self.stdout.write(f'  Exists: {po_number}')
                continue

            vendor = vendors[vendor_idx]

            po = PurchaseOrder.objects.create(
                tenant=tenant,
                vendor=vendor,
                po_number=po_number,
                order_date=timezone.now().date(),
                ship_to=warehouse,
                status=status,
                priority=priority,
                notes=notes,
            )

            # Create lines
            for line_num in range(1, num_lines + 1):
                item = items[(i + line_num) % len(items)]
                qty = (line_num * 10) + (i * 5)

                PurchaseOrderLine.objects.create(
                    tenant=tenant,
                    purchase_order=po,
                    line_number=line_num * 10,
                    item=item,
                    quantity_ordered=qty,
                    uom=uom,
                    unit_cost=Decimal('2.50'),
                )

            self.stdout.write(self.style.SUCCESS(f'  Created: {po_number} ({vendor.party.display_name})'))

    def create_sales_orders(self, tenant, customers, items, uom, warehouse):
        """Create 10 unscheduled sales orders."""
        self.stdout.write('\nCreating sales orders...')

        so_configs = [
            # (customer_idx, priority, num_lines, status, notes)
            (0, 3, 2, 'confirmed', ''),
            (1, 1, 3, 'confirmed', 'URGENT - Same day'),
            (2, 5, 2, 'confirmed', ''),
            (3, 4, 1, 'confirmed', 'Call 30min before'),
            (4, 5, 4, 'draft', ''),
            (0, 2, 2, 'confirmed', 'Back door delivery'),
            (1, 5, 1, 'confirmed', ''),
            (2, 3, 3, 'confirmed', 'Signature required'),
            (3, 5, 2, 'confirmed', ''),
            (4, 4, 2, 'confirmed', 'Liftgate needed'),
        ]

        for i, (cust_idx, priority, num_lines, status, notes) in enumerate(so_configs, 1):
            order_number = f'DEMO-SO-{i:03d}'

            # Skip if already exists
            if SalesOrder.objects.filter(tenant=tenant, order_number=order_number).exists():
                self.stdout.write(f'  Exists: {order_number}')
                continue

            customer = customers[cust_idx]
            ship_to = customer.default_ship_to or customer.party.locations.filter(is_active=True).first()

            if not ship_to:
                self.stdout.write(self.style.WARNING(f'  Skipped: {order_number} (no ship_to location)'))
                continue

            so = SalesOrder.objects.create(
                tenant=tenant,
                customer=customer,
                order_number=order_number,
                order_date=timezone.now().date(),
                ship_to=ship_to,
                status=status,
                priority=priority,
                notes=notes,
            )

            # Create lines
            for line_num in range(1, num_lines + 1):
                item = items[(i + line_num + 2) % len(items)]
                qty = (line_num * 8) + (i * 3)

                SalesOrderLine.objects.create(
                    tenant=tenant,
                    sales_order=so,
                    line_number=line_num * 10,
                    item=item,
                    quantity_ordered=qty,
                    uom=uom,
                    unit_price=Decimal('4.99'),
                )

            self.stdout.write(self.style.SUCCESS(f'  Created: {order_number} ({customer.party.display_name})'))
