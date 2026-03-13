# apps/items/management/commands/seed_product_card_demo.py
"""
Management command to seed demo data for the Product Card feature.

Creates a full set of demo data including tenant, parties, items, price lists,
cost lists, RFQs, purchase orders, and sales orders.

Usage:
    python manage.py seed_product_card_demo
"""
import datetime
from django.core.management.base import BaseCommand
from django.db import transaction


class Command(BaseCommand):
    help = 'Seed demo data for Product Card feature'

    def handle(self, *args, **options):
        with transaction.atomic():
            self._seed_all()

    def _seed_all(self):
        tenant = self._seed_tenant()

        # Set current tenant in thread-local so TenantManager scoping works
        from shared.managers import set_current_tenant
        set_current_tenant(tenant)

        ea = self._seed_uom(tenant)
        acme_party, acme_customer = self._seed_acme(tenant)
        pps_party, pps_vendor = self._seed_vendor(tenant, 'PPS', 'Pacific Packaging Supply')
        nbc_party, nbc_vendor = self._seed_vendor(tenant, 'NBC', 'National Box Co')

        # Locations needed for orders
        acme_location = self._seed_location(tenant, acme_party, 'ACME Main', 'SHIP_TO')
        warehouse_location = self._seed_location(tenant, pps_party, 'Main Warehouse', 'WAREHOUSE')

        box = self._seed_box_item(tenant, ea, acme_party)
        tape = self._seed_tape_item(tenant, ea)

        self._seed_item_vendors(tenant, box, pps_party, nbc_party)
        self._seed_item_vendors_tape(tenant, tape, pps_party)

        self._seed_price_lists(tenant, acme_customer, box)
        self._seed_cost_lists(tenant, pps_vendor, nbc_vendor, box)

        self._seed_rfqs(tenant, pps_vendor, nbc_vendor, box, ea)
        self._seed_purchase_orders(tenant, pps_vendor, nbc_vendor, box, ea, warehouse_location)
        self._seed_sales_orders(tenant, acme_customer, box, ea, acme_location)

        self.stdout.write(self.style.SUCCESS('Done! Product Card demo data seeded.'))

    # -------------------------------------------------------------------------
    # Tenant
    # -------------------------------------------------------------------------

    def _seed_tenant(self):
        from apps.tenants.models import Tenant
        tenant = Tenant.objects.filter(is_default=True).first()
        if not tenant:
            tenant = Tenant.objects.first()
        if not tenant:
            tenant = Tenant.objects.create(
                name='Demo Company',
                subdomain='demo',
                is_active=True,
                is_default=True,
            )
            self.stdout.write(f'  Created tenant: {tenant.name}')
        else:
            self.stdout.write(f'  Using existing tenant: {tenant.name}')
        return tenant

    # -------------------------------------------------------------------------
    # Unit of Measure
    # -------------------------------------------------------------------------

    def _seed_uom(self, tenant):
        from apps.items.models import UnitOfMeasure
        ea, created = UnitOfMeasure.objects.get_or_create(
            tenant=tenant,
            code='EA',
            defaults={'name': 'Each'},
        )
        self.stdout.write(f'  {"Created" if created else "Found"} UOM: {ea.code} - {ea.name}')
        return ea

    # -------------------------------------------------------------------------
    # Parties
    # -------------------------------------------------------------------------

    def _seed_acme(self, tenant):
        from apps.parties.models import Party, Customer
        acme_party, created = Party.objects.get_or_create(
            tenant=tenant,
            code='ACME',
            defaults={
                'display_name': 'Acme Manufacturing',
                'party_type': 'CUSTOMER',
                'is_active': True,
            },
        )
        self.stdout.write(f'  {"Created" if created else "Found"} party: {acme_party.code}')

        acme_customer, created = Customer.objects.get_or_create(
            tenant=tenant,
            party=acme_party,
            defaults={'payment_terms': 'NET30'},
        )
        self.stdout.write(f'  {"Created" if created else "Found"} customer: {acme_party.display_name}')
        return acme_party, acme_customer

    def _seed_vendor(self, tenant, code, display_name):
        from apps.parties.models import Party, Vendor
        party, created = Party.objects.get_or_create(
            tenant=tenant,
            code=code,
            defaults={
                'display_name': display_name,
                'party_type': 'VENDOR',
                'is_active': True,
            },
        )
        self.stdout.write(f'  {"Created" if created else "Found"} party: {party.code}')

        vendor, created = Vendor.objects.get_or_create(
            tenant=tenant,
            party=party,
            defaults={'payment_terms': 'NET30'},
        )
        self.stdout.write(f'  {"Created" if created else "Found"} vendor: {party.display_name}')
        return party, vendor

    # -------------------------------------------------------------------------
    # Locations
    # -------------------------------------------------------------------------

    def _seed_location(self, tenant, party, name, location_type):
        from apps.parties.models import Location
        location, created = Location.objects.get_or_create(
            tenant=tenant,
            party=party,
            name=name,
            defaults={
                'location_type': location_type,
                'address_line1': '123 Main St',
                'city': 'Anytown',
                'state': 'CA',
                'postal_code': '90210',
                'is_active': True,
            },
        )
        self.stdout.write(f'  {"Created" if created else "Found"} location: {party.code} - {name}')
        return location

    # -------------------------------------------------------------------------
    # Items
    # -------------------------------------------------------------------------

    def _seed_box_item(self, tenant, ea, acme_party):
        from apps.items.models import Item
        box, created = Item.objects.get_or_create(
            tenant=tenant,
            sku='BOX-2436',
            defaults={
                'name': '24x36 RSC Box',
                'division': 'corrugated',
                'is_inventory': True,
                'base_uom': ea,
                'description': 'Standard 24x36 RSC corrugated box',
                'purch_desc': '24x36 RSC - 32ECT C-Flute Kraft',
                'sell_desc': '24x36 RSC Box - Standard Grade',
                'reorder_point': 500,
                'min_stock': 200,
                'safety_stock': 100,
                'customer': acme_party,
                'is_active': True,
            },
        )
        self.stdout.write(f'  {"Created" if created else "Found"} item: {box.sku}')
        return box

    def _seed_tape_item(self, tenant, ea):
        from apps.items.models import Item
        tape, created = Item.objects.get_or_create(
            tenant=tenant,
            sku='TAPE-2',
            defaults={
                'name': '2" Packing Tape',
                'division': 'packaging',
                'is_inventory': True,
                'base_uom': ea,
                'description': 'Standard 2 inch clear packing tape',
                'is_active': True,
            },
        )
        self.stdout.write(f'  {"Created" if created else "Found"} item: {tape.sku}')
        return tape

    # -------------------------------------------------------------------------
    # Item Vendors
    # -------------------------------------------------------------------------

    def _seed_item_vendors(self, tenant, box, pps_party, nbc_party):
        from apps.items.models import ItemVendor
        iv_pps, created = ItemVendor.objects.get_or_create(
            tenant=tenant,
            item=box,
            vendor=pps_party,
            defaults={
                'is_preferred': True,
                'lead_time_days': 7,
                'min_order_qty': 500,
                'mpn': 'PPS-RSC-2436',
            },
        )
        self.stdout.write(f'  {"Created" if created else "Found"} ItemVendor: {box.sku} -> PPS')

        iv_nbc, created = ItemVendor.objects.get_or_create(
            tenant=tenant,
            item=box,
            vendor=nbc_party,
            defaults={
                'is_preferred': False,
                'lead_time_days': 14,
                'min_order_qty': 1000,
                'mpn': 'NBC-2436-32E',
            },
        )
        self.stdout.write(f'  {"Created" if created else "Found"} ItemVendor: {box.sku} -> NBC')

    def _seed_item_vendors_tape(self, tenant, tape, pps_party):
        from apps.items.models import ItemVendor
        iv, created = ItemVendor.objects.get_or_create(
            tenant=tenant,
            item=tape,
            vendor=pps_party,
            defaults={
                'is_preferred': True,
                'lead_time_days': 3,
                'min_order_qty': 100,
                'mpn': 'PPS-TAPE-2CLR',
            },
        )
        self.stdout.write(f'  {"Created" if created else "Found"} ItemVendor: {tape.sku} -> PPS')

    # -------------------------------------------------------------------------
    # Price Lists
    # -------------------------------------------------------------------------

    def _seed_price_lists(self, tenant, acme_customer, box):
        from apps.pricing.models import PriceListHead, PriceListLine

        # 2024 inactive price list (create first so overlap check passes)
        pl_2024, created = self._get_or_create_price_list(
            tenant=tenant,
            customer=acme_customer,
            item=box,
            begin_date=datetime.date(2024, 1, 1),
            end_date=datetime.date(2024, 12, 31),
            is_active=False,
            notes='Prior year pricing',
        )
        self.stdout.write(f'  {"Created" if created else "Found"} PriceList 2024 (inactive)')
        if created:
            for min_qty, price in [(1, '3.1000'), (500, '2.7500'), (1000, '2.5000')]:
                PriceListLine.objects.get_or_create(
                    price_list=pl_2024,
                    min_quantity=min_qty,
                    defaults={'unit_price': price, 'tenant': tenant},
                )
            self.stdout.write(f'    Created 3 price tiers for 2024 list')

        # 2025 active price list
        pl_2025, created = self._get_or_create_price_list(
            tenant=tenant,
            customer=acme_customer,
            item=box,
            begin_date=datetime.date(2025, 1, 1),
            end_date=datetime.date(2025, 12, 31),
            is_active=True,
            notes='Annual contract pricing',
        )
        self.stdout.write(f'  {"Created" if created else "Found"} PriceList 2025 (active)')
        if created:
            for min_qty, price in [
                (1, '2.8500'), (500, '2.5000'), (1000, '2.2500'), (5000, '2.0000')
            ]:
                PriceListLine.objects.get_or_create(
                    price_list=pl_2025,
                    min_quantity=min_qty,
                    defaults={'unit_price': price, 'tenant': tenant},
                )
            self.stdout.write(f'    Created 4 price tiers for 2025 list')

    def _get_or_create_price_list(self, tenant, customer, item, begin_date, end_date,
                                   is_active, notes):
        from apps.pricing.models import PriceListHead
        try:
            pl = PriceListHead.objects.get(
                tenant=tenant,
                customer=customer,
                item=item,
                begin_date=begin_date,
            )
            return pl, False
        except PriceListHead.DoesNotExist:
            # Bypass save()'s full_clean for inactive records to avoid overlap issues
            # during seeding; create via direct ORM then update
            pl = PriceListHead(
                tenant=tenant,
                customer=customer,
                item=item,
                begin_date=begin_date,
                end_date=end_date,
                is_active=is_active,
                notes=notes,
            )
            # full_clean only overlaps with is_active=True records,
            # so calling it is safe here since the 2025 and 2024 ranges don't overlap
            pl.full_clean()
            pl.save()
            return pl, True

    # -------------------------------------------------------------------------
    # Cost Lists
    # -------------------------------------------------------------------------

    def _seed_cost_lists(self, tenant, pps_vendor, nbc_vendor, box):
        from apps.costing.models import CostListHead, CostListLine

        # PPS cost list - open ended
        cl_pps, created = self._get_or_create_cost_list(
            tenant=tenant,
            vendor=pps_vendor,
            item=box,
            begin_date=datetime.date(2025, 1, 1),
            end_date=None,
            is_active=True,
            notes='Preferred vendor - volume pricing',
        )
        self.stdout.write(f'  {"Created" if created else "Found"} CostList: PPS -> {box.sku}')
        if created:
            for min_qty, cost in [
                (1, '1.4500'), (500, '1.2000'), (1000, '1.0500'), (5000, '0.9500')
            ]:
                CostListLine.objects.get_or_create(
                    cost_list=cl_pps,
                    min_quantity=min_qty,
                    defaults={'unit_cost': cost, 'tenant': tenant},
                )
            self.stdout.write(f'    Created 4 cost tiers for PPS')

        # NBC cost list - open ended
        cl_nbc, created = self._get_or_create_cost_list(
            tenant=tenant,
            vendor=nbc_vendor,
            item=box,
            begin_date=datetime.date(2025, 1, 1),
            end_date=None,
            is_active=True,
            notes='Backup supplier',
        )
        self.stdout.write(f'  {"Created" if created else "Found"} CostList: NBC -> {box.sku}')
        if created:
            for min_qty, cost in [(1, '1.6000'), (1000, '1.3500')]:
                CostListLine.objects.get_or_create(
                    cost_list=cl_nbc,
                    min_quantity=min_qty,
                    defaults={'unit_cost': cost, 'tenant': tenant},
                )
            self.stdout.write(f'    Created 2 cost tiers for NBC')

    def _get_or_create_cost_list(self, tenant, vendor, item, begin_date, end_date,
                                  is_active, notes):
        from apps.costing.models import CostListHead
        try:
            cl = CostListHead.objects.get(
                tenant=tenant,
                vendor=vendor,
                item=item,
                begin_date=begin_date,
            )
            return cl, False
        except CostListHead.DoesNotExist:
            cl = CostListHead(
                tenant=tenant,
                vendor=vendor,
                item=item,
                begin_date=begin_date,
                end_date=end_date,
                is_active=is_active,
                notes=notes,
            )
            cl.full_clean()
            cl.save()
            return cl, True

    # -------------------------------------------------------------------------
    # RFQs
    # -------------------------------------------------------------------------

    def _seed_rfqs(self, tenant, pps_vendor, nbc_vendor, box, ea):
        from apps.orders.models import RFQ, RFQLine

        rfqs = [
            {
                'rfq_number': '001',
                'vendor': pps_vendor,
                'date': datetime.date(2025, 2, 15),
                'status': 'received',
                'lines': [
                    {
                        'qty': 2000,
                        'target_price': '1.10',
                        'quoted_price': '1.05',
                        'notes': 'Price good for 60 days',
                    }
                ],
            },
            {
                'rfq_number': '002',
                'vendor': nbc_vendor,
                'date': datetime.date(2025, 3, 1),
                'status': 'received',
                'lines': [
                    {
                        'qty': 5000,
                        'target_price': '0.95',
                        'quoted_price': '1.00',
                        'notes': 'Min order 5000. Can do $0.95 at 10000+',
                    }
                ],
            },
            {
                'rfq_number': '003',
                'vendor': pps_vendor,
                'date': datetime.date(2025, 1, 10),
                'status': 'converted',
                'lines': [
                    {
                        'qty': 1000,
                        'target_price': '1.15',
                        'quoted_price': '1.12',
                        'notes': 'Rush order pricing',
                    }
                ],
            },
        ]

        for rfq_data in rfqs:
            rfq, created = RFQ.objects.get_or_create(
                tenant=tenant,
                rfq_number=rfq_data['rfq_number'],
                defaults={
                    'vendor': rfq_data['vendor'],
                    'date': rfq_data['date'],
                    'status': rfq_data['status'],
                },
            )
            self.stdout.write(
                f'  {"Created" if created else "Found"} RFQ-{rfq.rfq_number}'
            )
            if created:
                for i, line_data in enumerate(rfq_data['lines'], start=10):
                    RFQLine.objects.get_or_create(
                        tenant=tenant,
                        rfq=rfq,
                        line_number=i,
                        defaults={
                            'item': box,
                            'quantity': line_data['qty'],
                            'uom': ea,
                            'target_price': line_data['target_price'],
                            'quoted_price': line_data['quoted_price'],
                            'notes': line_data['notes'],
                        },
                    )

    # -------------------------------------------------------------------------
    # Purchase Orders
    # -------------------------------------------------------------------------

    def _seed_purchase_orders(self, tenant, pps_vendor, nbc_vendor, box, ea,
                               warehouse_location):
        from apps.orders.models import PurchaseOrder, PurchaseOrderLine

        pos = [
            {
                'po_number': '001',
                'vendor': pps_vendor,
                'order_date': datetime.date(2025, 2, 20),
                'status': 'complete',
                'lines': [{'qty': 2000, 'unit_cost': '1.05'}],
            },
            {
                'po_number': '002',
                'vendor': nbc_vendor,
                'order_date': datetime.date(2025, 1, 15),
                'status': 'complete',
                'lines': [{'qty': 1000, 'unit_cost': '1.35'}],
            },
        ]

        for po_data in pos:
            po, created = PurchaseOrder.objects.get_or_create(
                tenant=tenant,
                po_number=po_data['po_number'],
                defaults={
                    'vendor': po_data['vendor'],
                    'order_date': po_data['order_date'],
                    'status': po_data['status'],
                    'ship_to': warehouse_location,
                },
            )
            self.stdout.write(
                f'  {"Created" if created else "Found"} PO-{po.po_number}'
            )
            if created:
                for i, line_data in enumerate(po_data['lines'], start=10):
                    PurchaseOrderLine.objects.get_or_create(
                        tenant=tenant,
                        purchase_order=po,
                        line_number=i,
                        defaults={
                            'item': box,
                            'quantity_ordered': line_data['qty'],
                            'uom': ea,
                            'unit_cost': line_data['unit_cost'],
                            'quantity_received': line_data['qty'],
                        },
                    )

    # -------------------------------------------------------------------------
    # Sales Orders
    # -------------------------------------------------------------------------

    def _seed_sales_orders(self, tenant, acme_customer, box, ea, acme_location):
        from apps.orders.models import SalesOrder, SalesOrderLine

        sos = [
            {
                'order_number': '001',
                'order_date': datetime.date(2025, 3, 1),
                'status': 'shipped',
                'lines': [{'qty': 500, 'unit_price': '2.50'}],
            },
            {
                'order_number': '002',
                'order_date': datetime.date(2025, 2, 15),
                'status': 'complete',
                'lines': [{'qty': 2000, 'unit_price': '2.25'}],
            },
        ]

        for so_data in sos:
            so, created = SalesOrder.objects.get_or_create(
                tenant=tenant,
                order_number=so_data['order_number'],
                defaults={
                    'customer': acme_customer,
                    'order_date': so_data['order_date'],
                    'status': so_data['status'],
                    'ship_to': acme_location,
                },
            )
            self.stdout.write(
                f'  {"Created" if created else "Found"} SO-{so.order_number}'
            )
            if created:
                for i, line_data in enumerate(so_data['lines'], start=10):
                    SalesOrderLine.objects.get_or_create(
                        tenant=tenant,
                        sales_order=so,
                        line_number=i,
                        defaults={
                            'item': box,
                            'quantity_ordered': line_data['qty'],
                            'uom': ea,
                            'unit_price': line_data['unit_price'],
                        },
                    )
