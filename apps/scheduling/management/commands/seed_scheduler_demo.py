# apps/scheduling/management/commands/seed_scheduler_demo.py
"""
Management command to populate demo data for testing the Scheduler.

Creates:
- 3 Trucks for delivery scheduling
- 5 Vendors with parties and locations
- 5 Customers with parties and locations
- 12 Items with varied lifecycle_status (draft -> active)
- 20 Purchase Orders across the full STATUS_CHOICES set,
  with a chunk scheduled across the 8-week Mon-Fri grid
- 20 Sales Orders across the full STATUS_CHOICES set,
  with a chunk scheduled across the 8-week Mon-Fri grid
  (some flagged is_pickup=True for the Pick Up row)

Usage:
    python manage.py seed_scheduler_demo
    python manage.py seed_scheduler_demo --clear  # Clear existing demo data first
"""
from decimal import Decimal
from datetime import date, timedelta
from django.core.management.base import BaseCommand
from django.utils import timezone
from apps.tenants.models import Tenant
from apps.parties.models import Party, Customer, Vendor, Location, Truck
from apps.items.models import UnitOfMeasure, Item
from apps.orders.models import PurchaseOrder, PurchaseOrderLine, SalesOrder, SalesOrderLine
from shared.managers import set_current_tenant


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

# (sku, name, description, lifecycle_status)
ITEMS = [
    ('APPLE-FJ', 'Fuji Apples', 'Premium grade Fuji apples', 'active'),
    ('BANANA-OR', 'Organic Bananas', 'Fair trade organic bananas', 'active'),
    ('ORANGE-NV', 'Navel Oranges', 'California navel oranges', 'active'),
    ('GRAPE-RD', 'Red Grapes', 'Seedless red grapes', 'active'),
    ('LEMON-MR', 'Meyer Lemons', 'Meyer lemons from California', 'active'),
    ('BERRY-ST', 'Strawberry Flat', 'Driscoll strawberry flat', 'active'),
    ('PEAR-BT', 'Bartlett Pears', 'Bartlett pears (case)', 'pending_approval'),
    ('AVOCADO-HS', 'Hass Avocados', 'Mexican Hass avocados', 'design_complete'),
    ('PEACH-WH', 'White Peaches', 'White peach (currently in design)', 'in_design'),
    ('MANGO-AT', 'Ataulfo Mangos', 'Honey mango (design requested)', 'pending_design'),
    ('PINE-GS', 'Golden Pineapple', 'Golden Sweet pineapple (draft)', 'draft'),
    ('KIWI-GR', 'Green Kiwifruit', 'Zespri green kiwi (draft)', 'draft'),
]


def next_business_day(d):
    """Roll a date forward to the next Mon-Fri (skip Sat/Sun)."""
    while d.weekday() >= 5:  # 5=Sat, 6=Sun
        d += timedelta(days=1)
    return d


def business_offset(today, day_offset):
    """
    Return today + day_offset, snapped to the next Mon-Fri.

    The schedulizer only renders Mon-Fri cells, so we coerce
    weekend dates onto Monday for visibility.
    """
    return next_business_day(today + timedelta(days=day_offset))


class Command(BaseCommand):
    help = 'Seed demo data for Scheduler testing (trucks, parties, items, orders)'

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

        set_current_tenant(tenant)

        self.stdout.write(f'Seeding scheduler demo data for tenant: {tenant.name}')

        if options['clear']:
            self.clear_demo_data(tenant)

        trucks = self.create_trucks(tenant)
        uom_each = self.ensure_uom(tenant)
        items = self.create_items(tenant, uom_each)
        vendors = self.create_vendors(tenant)
        customers = self.create_customers(tenant)
        warehouse = self.ensure_warehouse(tenant)

        po_count = self.create_purchase_orders(tenant, vendors, items, uom_each, warehouse, trucks)
        so_count = self.create_sales_orders(tenant, customers, items, uom_each, warehouse, trucks)

        self.stdout.write(self.style.SUCCESS('\nDemo data seeded successfully!'))
        self.stdout.write(f'  - {len(trucks)} trucks')
        self.stdout.write(f'  - {len(vendors)} vendors')
        self.stdout.write(f'  - {len(customers)} customers')
        self.stdout.write(f'  - {len(items)} items (varied lifecycle_status)')
        self.stdout.write(f'  - {po_count} purchase orders (varied status, scheduling)')
        self.stdout.write(f'  - {so_count} sales orders (varied status, scheduling)')

    def clear_demo_data(self, tenant):
        """
        Clear demo orders (POs and SOs starting with DEMO-).

        Several downstream models PROTECT references to orders
        (Invoice, ShipmentLine, Payment, VendorBill, BillPayment),
        so we tear those down first in dependency order before
        the SalesOrder/PurchaseOrder rows can be deleted.
        """
        from apps.invoicing.models import Invoice, Payment, VendorBill, BillPayment
        from apps.shipping.models import ShipmentLine

        self.stdout.write('Clearing existing demo data...')

        demo_so_filter = {'tenant': tenant, 'sales_order__order_number__startswith': 'DEMO-SO-'}
        demo_po_filter = {'tenant': tenant, 'bill__purchase_order__po_number__startswith': 'DEMO-PO-'}

        # SO-side dependents: Payment (PROTECT) -> Invoice (PROTECT) -> SO,
        # ShipmentLine (PROTECT) -> SO.
        pay_deleted, _ = Payment.objects.filter(
            tenant=tenant,
            invoice__sales_order__order_number__startswith='DEMO-SO-'
        ).delete()
        if pay_deleted:
            self.stdout.write(f'  Deleted {pay_deleted} customer payments')

        inv_deleted, _ = Invoice.objects.filter(**demo_so_filter).delete()
        if inv_deleted:
            self.stdout.write(f'  Deleted {inv_deleted} invoice rows (incl. lines)')

        ship_line_deleted, _ = ShipmentLine.objects.filter(**demo_so_filter).delete()
        if ship_line_deleted:
            self.stdout.write(f'  Deleted {ship_line_deleted} shipment lines')

        # PO-side dependents: BillPayment (PROTECT) -> VendorBill (PROTECT) -> PO.
        bill_pay_deleted, _ = BillPayment.objects.filter(**demo_po_filter).delete()
        if bill_pay_deleted:
            self.stdout.write(f'  Deleted {bill_pay_deleted} vendor bill payments')

        vbill_deleted, _ = VendorBill.objects.filter(
            tenant=tenant,
            purchase_order__po_number__startswith='DEMO-PO-'
        ).delete()
        if vbill_deleted:
            self.stdout.write(f'  Deleted {vbill_deleted} vendor bill rows (incl. lines)')

        so_deleted, _ = SalesOrder.objects.filter(
            tenant=tenant,
            order_number__startswith='DEMO-SO-'
        ).delete()
        self.stdout.write(f'  Deleted {so_deleted} sales orders')

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
        uom, _ = UnitOfMeasure.objects.get_or_create(
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
        """Create demo items with varied lifecycle_status."""
        self.stdout.write('\nCreating items...')
        items = []
        for sku, name, desc, lifecycle_status in ITEMS:
            item, created = Item.objects.get_or_create(
                tenant=tenant,
                sku=sku,
                defaults={
                    'name': name,
                    'description': desc,
                    'base_uom': uom_each,
                    'item_type': 'inventory',
                    'is_active': True,
                    'lifecycle_status': lifecycle_status,
                }
            )
            # If item already existed, refresh its lifecycle_status so re-runs
            # pick up new status assignments without manual cleanup.
            if not created and item.lifecycle_status != lifecycle_status:
                item.lifecycle_status = lifecycle_status
                item.save(update_fields=['lifecycle_status'])
                action = 'Updated'
            else:
                action = 'Created' if created else 'Exists'
            self.stdout.write(f'  {action}: {sku} [{lifecycle_status}]')
            items.append(item)
        return items

    def create_vendors(self, tenant):
        """Create vendor parties with locations."""
        self.stdout.write('\nCreating vendors...')
        vendors = []
        for code, name, city, state in VENDORS:
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

            vendor, _ = Vendor.objects.get_or_create(
                tenant=tenant,
                party=party,
                defaults={
                    'payment_terms': 'NET30',
                }
            )

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

            customer, _ = Customer.objects.get_or_create(
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

    def create_purchase_orders(self, tenant, vendors, items, uom, warehouse, trucks):
        """
        Create purchase orders covering all BaseOrder.STATUS_CHOICES values
        plus a mix of scheduled and unscheduled rows.

        Each tuple is:
          (vendor_idx, day_offset_or_None, truck_idx_or_None,
           priority, num_lines, status, notes)

        day_offset is relative to today() and snapped to the next weekday;
        None leaves the order unscheduled (shows in the unscheduled bin).
        """
        self.stdout.write('\nCreating purchase orders...')
        today = timezone.now().date()

        po_configs = [
            # --- unscheduled bin: all the early-lifecycle states ---
            (3, None, None, 5, 1, 'draft',            ''),
            (0, None, None, 4, 2, 'draft',            'Quote pending'),
            (2, None, None, 5, 1, 'pending_approval', 'Awaiting purchasing mgr sign-off'),
            (4, None, None, 3, 2, 'pending_approval', ''),
            (1, None, None, 5, 2, 'confirmed',        'Vendor confirmed - awaiting schedule'),
            (0, None, None, 5, 3, 'confirmed',        ''),
            # --- past dates: shipped / received / complete ---
            (2, -10, 2, 3, 4, 'complete',           'Closed out'),
            (1,  -7, 1, 5, 2, 'partially_received', 'Backorder on line 2'),
            (4,  -5, 0, 4, 2, 'shipped',            'Vendor shipped FedEx'),
            (3,  -3, 1, 5, 2, 'cancelled',          'Vendor out of stock'),
            # --- this week / near future: scheduled and picking ---
            (0,  -1, 0, 2, 3, 'scheduled',          'Urgent - customer waiting'),
            (1,   0, 1, 1, 2, 'scheduled',          'RUSH - Hot load'),
            (2,   1, 2, 3, 4, 'picking',            'Call before delivery'),
            (4,   2, 0, 4, 2, 'scheduled',          'Dock 3 only'),
            (0,   3, 1, 5, 3, 'scheduled',          ''),
            (3,   4, 2, 3, 2, 'crossdock',          'Crossdock to METRO load'),
            # --- next week and beyond ---
            (1,   7, 0, 5, 2, 'confirmed',          'AM delivery required'),
            (2,  10, 1, 4, 3, 'scheduled',          ''),
            (3,  14, 2, 3, 2, 'scheduled',          'Reserved for monthly buy'),
            (4,  21, 0, 5, 1, 'confirmed',          'Long lead time order'),
        ]

        created_count = 0
        for i, (vendor_idx, day_offset, truck_idx, priority, num_lines, status, notes) in enumerate(po_configs, 1):
            po_number = f'DEMO-PO-{i:03d}'

            if PurchaseOrder.objects.filter(tenant=tenant, po_number=po_number).exists():
                self.stdout.write(f'  Exists: {po_number}')
                continue

            vendor = vendors[vendor_idx]
            scheduled_date = business_offset(today, day_offset) if day_offset is not None else None
            scheduled_truck = trucks[truck_idx] if truck_idx is not None else None

            po = PurchaseOrder.objects.create(
                tenant=tenant,
                vendor=vendor,
                po_number=po_number,
                order_date=today,
                ship_to=warehouse,
                status=status,
                priority=priority,
                notes=notes,
                scheduled_date=scheduled_date,
                scheduled_truck=scheduled_truck,
            )

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

            sched_str = f' @ {scheduled_date} on {scheduled_truck.name}' if scheduled_date else ' (unscheduled)'
            self.stdout.write(self.style.SUCCESS(
                f'  Created: {po_number} [{status}]{sched_str} - {vendor.party.display_name}'
            ))
            created_count += 1

        return created_count

    def create_sales_orders(self, tenant, customers, items, uom, warehouse, trucks):
        """
        Create sales orders covering all BaseOrder.STATUS_CHOICES values
        plus a mix of scheduled, unscheduled, and pickup rows.

        Each tuple is:
          (customer_idx, day_offset_or_None, truck_idx_or_None,
           priority, num_lines, status, is_pickup, notes)
        """
        self.stdout.write('\nCreating sales orders...')
        today = timezone.now().date()

        so_configs = [
            # --- unscheduled bin ---
            (4, None, None, 5, 4, 'draft',            False, ''),
            (1, None, None, 3, 2, 'draft',            False, 'Quote in progress'),
            (3, None, None, 5, 2, 'pending_approval', False, 'Credit hold review'),
            (0, None, None, 3, 2, 'confirmed',        False, ''),
            (2, None, None, 4, 1, 'confirmed',        False, 'Awaiting routing'),
            # --- pickup row (is_pickup=True) ---
            (1,  0, None, 2, 1, 'scheduled',          True,  'Customer pickup at 10am'),
            (3,  1, None, 4, 2, 'scheduled',          True,  'Will-call - back dock'),
            # --- past dates: shipped / complete / cancelled ---
            (0, -12, 2, 3, 3, 'complete',           False, 'Delivered, signed POD'),
            (2,  -8, 1, 5, 2, 'shipped',            False, 'In transit'),
            (4,  -5, 0, 4, 2, 'partially_received', False, 'Customer short - line 1 backordered'),
            (1,  -2, 1, 5, 1, 'cancelled',          False, 'Customer cancelled - duplicate'),
            # --- this week / near future ---
            (0, -1, 0, 3, 2, 'picking',            False, 'In pick'),
            (1,  0, 1, 1, 3, 'scheduled',          False, 'URGENT - same day'),
            (2,  1, 2, 5, 2, 'scheduled',          False, ''),
            (3,  2, 0, 4, 1, 'scheduled',          False, 'Call 30min before'),
            (4,  3, 1, 5, 2, 'scheduled',          False, 'Liftgate needed'),
            (0,  4, 2, 2, 2, 'crossdock',          False, 'Crossdock from PRIME PO'),
            # --- next week and beyond ---
            (2,  7, 0, 3, 3, 'confirmed',          False, 'Signature required'),
            (3, 10, 1, 5, 2, 'scheduled',          False, ''),
            (4, 17, 2, 4, 2, 'confirmed',          False, 'Monthly standing order'),
        ]

        created_count = 0
        for i, (cust_idx, day_offset, truck_idx, priority, num_lines, status, is_pickup, notes) in enumerate(so_configs, 1):
            order_number = f'DEMO-SO-{i:03d}'

            if SalesOrder.objects.filter(tenant=tenant, order_number=order_number).exists():
                self.stdout.write(f'  Exists: {order_number}')
                continue

            customer = customers[cust_idx]
            ship_to = customer.default_ship_to or customer.party.locations.filter(is_active=True).first()

            if not ship_to:
                self.stdout.write(self.style.WARNING(f'  Skipped: {order_number} (no ship_to location)'))
                continue

            scheduled_date = business_offset(today, day_offset) if day_offset is not None else None
            scheduled_truck = trucks[truck_idx] if truck_idx is not None else None

            so = SalesOrder.objects.create(
                tenant=tenant,
                customer=customer,
                order_number=order_number,
                order_date=today,
                ship_to=ship_to,
                status=status,
                priority=priority,
                notes=notes,
                is_pickup=is_pickup,
                scheduled_date=scheduled_date,
                scheduled_truck=scheduled_truck,
            )

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

            if scheduled_date:
                truck_name = scheduled_truck.name if scheduled_truck else 'Pickup'
                sched_str = f' @ {scheduled_date} on {truck_name}'
            else:
                sched_str = ' (unscheduled)'
            self.stdout.write(self.style.SUCCESS(
                f'  Created: {order_number} [{status}]{sched_str} - {customer.party.display_name}'
            ))
            created_count += 1

        return created_count
