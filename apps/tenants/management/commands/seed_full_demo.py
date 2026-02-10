# apps/tenants/management/commands/seed_full_demo.py
"""
Comprehensive management command to seed demo data across ALL modules.

Creates a realistic dataset for a corrugated packaging distribution company
including parties, items, orders, inventory, shipping, invoicing, accounting,
design requests, and scheduling data.

Usage:
    python manage.py seed_full_demo
    python manage.py seed_full_demo --clear   # Wipe DEMO- records first
"""
from datetime import time, timedelta
from decimal import Decimal

from django.core.management import call_command
from django.core.management.base import BaseCommand
from django.db import transaction
from django.utils import timezone

from apps.accounting.models import (
    Account,
    AccountingSettings,
    FiscalPeriod,
    JournalEntry,
    JournalEntryLine,
)
from apps.contracts.models import Contract, ContractLine, ContractRelease
from apps.costing.models import CostListHead, CostListLine
from apps.design.models import DesignRequest
from apps.invoicing.models import (
    BillPayment,
    Invoice,
    InvoiceLine,
    Payment,
    VendorBill,
    VendorBillLine,
)
from apps.items.models import (
    DCItem,
    Item,
    ItemUOM,
    ItemVendor,
    RSCItem,
    UnitOfMeasure,
)
from apps.orders.models import (
    Estimate,
    EstimateLine,
    PurchaseOrder,
    PurchaseOrderLine,
    RFQ,
    RFQLine,
    SalesOrder,
    SalesOrderLine,
)
from apps.parties.models import Customer, Location, Party, Truck, Vendor
from apps.pricing.models import PriceListHead, PriceListLine
from apps.scheduling.models import (
    DailyKickOverride,
    DeliveryRun,
    PriorityLinePriority,
    SchedulerNote,
    VendorKickAllotment,
)
from apps.shipping.models import BillOfLading, BOLLine, Shipment, ShipmentLine
from apps.tenants.models import Tenant
from apps.warehousing.models import (
    Bin,
    Lot,
    StockMoveLog,
    StockQuant,
    Warehouse,
    WarehouseLocation,
)
from shared.managers import set_current_tenant


# ---------------------------------------------------------------------------
# Static data definitions
# ---------------------------------------------------------------------------

CUSTOMERS = [
    ('METRO', 'Metro Markets', 'Metro Markets Inc.', 'New York', 'NY', '10001'),
    ('SUNNY', 'Sunny Side Grocers', 'Sunny Side Grocers LLC', 'Atlanta', 'GA', '30301'),
    ('HARVEST', 'Harvest Foods', 'Harvest Foods Corp.', 'Dallas', 'TX', '75201'),
    ('GREEN', 'Green Leaf Stores', 'Green Leaf Stores Inc.', 'Seattle', 'WA', '98101'),
    ('COASTAL', 'Coastal Supermarkets', 'Coastal Supermarkets LLC', 'San Diego', 'CA', '92101'),
    ('MTNVIEW', 'Mountain View Packaging', 'Mountain View Packaging Co.', 'Denver', 'CO', '80201'),
    ('LAKESIDE', 'Lakeside Distribution', 'Lakeside Distribution Inc.', 'Minneapolis', 'MN', '55401'),
    ('EASTERN', 'Eastern Paper Co.', 'Eastern Paper Co. LLC', 'Philadelphia', 'PA', '19101'),
]

VENDORS = [
    ('ACME', 'Acme Corrugated', 'Acme Corrugated Inc.', 'Chicago', 'IL', '60601'),
    ('FRESH', 'Fresh Board Supply', 'Fresh Board Supply LLC', 'Jacksonville', 'FL', '32099'),
    ('GLOBAL', 'Global Packaging Inc', 'Global Packaging Inc.', 'Los Angeles', 'CA', '90001'),
    ('PRIME', 'Prime Paper Co', 'Prime Paper Co. LLC', 'Denver', 'CO', '80202'),
    ('VALLEY', 'Valley Box Mfg', 'Valley Box Manufacturing Inc.', 'Phoenix', 'AZ', '85001'),
    ('SOUTHEAST', 'Southeast Containers', 'Southeast Containers LLC', 'Atlanta', 'GA', '30302'),
]

TRUCKS = [
    ('Truck 1 Local', 'LOC-1001', 24),
    ('Truck 2 Regional', 'REG-2002', 48),
    ('Truck 3 Long Haul', 'LNG-3003', 52),
    ('Truck 4 Flatbed', 'FLT-4004', 30),
]

# RSC items: (sku, name, L, W, H, test, flute, paper, is_printed)
RSC_ITEMS = [
    ('DEMO-RSC-1210', '12x10x8 Kraft RSC', Decimal('12'), Decimal('10'), Decimal('8'),
     'ect32', 'b', 'k', False),
    ('DEMO-RSC-1814', '18x14x12 White RSC', Decimal('18'), Decimal('14'), Decimal('12'),
     'ect44', 'c', 'mw', True),
    ('DEMO-RSC-2418', '24x18x16 DW RSC', Decimal('24'), Decimal('18'), Decimal('16'),
     'ect48', 'bc', 'k', True),
    ('DEMO-RSC-0804', '8x6x4 Small RSC', Decimal('8'), Decimal('6'), Decimal('4'),
     'ect32', 'e', 'k', False),
    ('DEMO-RSC-3624', '36x24x12 Large RSC', Decimal('36'), Decimal('24'), Decimal('12'),
     'ect51', 'c', 'k', True),
]

# DC items: (sku, name, L, W, test, flute, paper, is_printed)
DC_ITEMS = [
    ('DEMO-DC-1008', '10x8 Pizza Box DC', Decimal('10'), Decimal('8'),
     'ect32', 'e', 'mw', True),
    ('DEMO-DC-1414', '14x14 Pad DC', Decimal('14'), Decimal('14'),
     'ect29', 'b', 'k', False),
    ('DEMO-DC-2015', '20x15 Tray DC', Decimal('20'), Decimal('15'),
     'ect32', 'c', 'k', False),
    ('DEMO-DC-1212', '12x12 Insert DC', Decimal('12'), Decimal('12'),
     'ect29', 'e', 'k', False),
    ('DEMO-DC-0604', '6x4 Display DC', Decimal('6'), Decimal('4'),
     'ect32', 'b', 'mw', True),
]

# Packaging items: (sku, name, description)
PKG_ITEMS = [
    ('DEMO-PKG-WRAP', 'Stretch Wrap', '18" x 1500\' 80ga stretch wrap'),
    ('DEMO-PKG-TAPE', 'Packing Tape', '2" x 110yd carton sealing tape'),
    ('DEMO-PKG-EDGE', 'Edge Protectors', '2" x 2" x 48" edge protectors'),
    ('DEMO-PKG-SLIP', 'Slip Sheets', '40" x 48" corrugated slip sheets'),
    ('DEMO-PKG-PLTW', 'Pallet Wrap', '20" x 5000\' machine stretch film'),
]

BINS = [
    ('A-01-01', 'A', '01', '01', 'STORAGE'),
    ('A-01-02', 'A', '01', '02', 'STORAGE'),
    ('A-01-03', 'A', '01', '03', 'STORAGE'),
    ('A-01-04', 'A', '01', '04', 'STORAGE'),
    ('STAGING-1', '', '', '', 'STAGING'),
    ('STAGING-2', '', '', '', 'STAGING'),
    ('RECV-DOCK-1', '', '', '', 'RECEIVING'),
    ('RECV-DOCK-2', '', '', '', 'RECEIVING'),
    ('SHIP-DOCK-1', '', '', '', 'SHIPPING'),
    ('SHIP-DOCK-2', '', '', '', 'SHIPPING'),
    ('DAMAGED-HOLD', '', '', '', 'DAMAGED'),
    ('OVERFLOW', 'B', '01', '01', 'STORAGE'),
]


class Command(BaseCommand):
    help = 'Seed comprehensive demo data across all modules'

    def add_arguments(self, parser):
        parser.add_argument(
            '--clear',
            action='store_true',
            help='Clear existing DEMO-prefixed records before seeding',
        )

    @transaction.atomic
    def handle(self, *args, **options):
        tenant = Tenant.objects.filter(is_default=True).first()
        if not tenant:
            self.stdout.write(self.style.ERROR(
                'No default tenant found. Run create_default_tenant first.'
            ))
            return

        set_current_tenant(tenant)
        self.tenant = tenant
        self.today = timezone.now().date()
        self.counts = {}

        self.stdout.write(f'\nSeeding full demo data for tenant: {tenant.name}')
        self.stdout.write('=' * 60)

        if options['clear']:
            self._clear_demo_data()

        # Phase 1: Foundation (COA + UOMs + Accounting Settings)
        self._phase_01_foundation()

        # Phase 2: Parties
        customers, vendors, trucks, wh_location = self._phase_02_parties()

        # Phase 3: Warehouse + Bins
        warehouse = self._phase_03_warehouse(wh_location)

        # Phase 4: Items
        items, rsc_items, dc_items, pkg_items = self._phase_04_items(vendors)

        # Phase 5: Price Lists + Cost Lists
        self._phase_05_pricing(customers, vendors, items, rsc_items, dc_items)

        # Phase 6: Estimates
        estimates = self._phase_06_estimates(customers, items, rsc_items)

        # Phase 7: Contracts
        contracts = self._phase_07_contracts(customers, items, rsc_items)

        # Phase 8: RFQs
        self._phase_08_rfqs(vendors, items, rsc_items, wh_location)

        # Phase 9: Purchase Orders
        pos = self._phase_09_purchase_orders(vendors, items, rsc_items, dc_items,
                                              wh_location, trucks)

        # Phase 10: Sales Orders
        sos = self._phase_10_sales_orders(customers, items, rsc_items, dc_items,
                                           trucks, estimates, contracts)

        # Phase 11: Inventory
        wh_locations = self._phase_11_inventory(warehouse, items, rsc_items, pos)

        # Phase 12: Shipments
        self._phase_12_shipments(trucks, sos, items, rsc_items)

        # Phase 13: Invoices + Payments + Vendor Bills
        self._phase_13_invoicing(customers, vendors, sos, pos, items, rsc_items)

        # Phase 14: Design Requests
        self._phase_14_design_requests(customers)

        # Phase 15: Scheduling
        self._phase_15_scheduling(trucks, vendors, pos, sos)

        # Phase 16: Journal Entries
        self._phase_16_journal_entries()

        # Summary
        self._print_summary()

    # ------------------------------------------------------------------
    # CLEAR
    # ------------------------------------------------------------------

    def _clear_demo_data(self):
        """Delete all DEMO-prefixed records in reverse dependency order."""
        t = self.tenant
        self.stdout.write(self.style.WARNING('\nClearing existing demo data...'))

        # 1. Journal entries
        je_del, _ = JournalEntry.objects.filter(
            tenant=t, entry_number__startswith='DEMO-JE-'
        ).delete()
        self.stdout.write(f'  Deleted JournalEntry cascade: {je_del}')

        # 2. Payments and bills
        for model, prefix_field, prefix in [
            (BillPayment, 'bill__bill_number__startswith', 'DEMO-BILL-'),
            (Payment, 'invoice__invoice_number__startswith', 'DEMO-INV-'),
        ]:
            d, _ = model.objects.filter(tenant=t, **{prefix_field: prefix}).delete()
            self.stdout.write(f'  Deleted {model.__name__}: {d}')

        for model, field, prefix in [
            (VendorBill, 'bill_number__startswith', 'DEMO-BILL-'),
            (Invoice, 'invoice_number__startswith', 'DEMO-INV-'),
        ]:
            d, _ = model.objects.filter(tenant=t, **{field: prefix}).delete()
            self.stdout.write(f'  Deleted {model.__name__} cascade: {d}')

        # 3. Shipping
        for model, field, prefix in [
            (BillOfLading, 'bol_number__startswith', 'DEMO-BOL-'),
            (Shipment, 'shipment_number__startswith', 'DEMO-SHIP-'),
        ]:
            d, _ = model.objects.filter(tenant=t, **{field: prefix}).delete()
            self.stdout.write(f'  Deleted {model.__name__} cascade: {d}')

        # 4. Contract releases (via contract lines)
        cr_del, _ = ContractRelease.objects.filter(
            tenant=t,
            contract_line__contract__contract_number__startswith='DEMO-CTR-'
        ).delete()
        self.stdout.write(f'  Deleted ContractRelease: {cr_del}')

        # 5. Inventory
        for model in [StockMoveLog, StockQuant, Lot]:
            d, _ = model.objects.filter(
                tenant=t, item__sku__startswith='DEMO-'
            ).delete()
            self.stdout.write(f'  Deleted {model.__name__}: {d}')

        # 6. Scheduling
        PriorityLinePriority.objects.filter(
            tenant=t,
            purchase_order_line__purchase_order__po_number__startswith='DEMO-PO-'
        ).delete()
        DailyKickOverride.objects.filter(tenant=t).delete()
        VendorKickAllotment.objects.filter(tenant=t).delete()
        SchedulerNote.objects.filter(tenant=t).delete()
        DeliveryRun.objects.filter(
            tenant=t, name__startswith='Demo'
        ).delete()
        self.stdout.write('  Deleted scheduling records')

        # 7. Orders
        for model, field, prefix in [
            (SalesOrder, 'order_number__startswith', 'DEMO-SO-'),
            (PurchaseOrder, 'po_number__startswith', 'DEMO-PO-'),
            (RFQ, 'rfq_number__startswith', 'DEMO-RFQ-'),
            (Estimate, 'estimate_number__startswith', 'DEMO-EST-'),
            (Contract, 'contract_number__startswith', 'DEMO-CTR-'),
        ]:
            d, _ = model.objects.filter(tenant=t, **{field: prefix}).delete()
            self.stdout.write(f'  Deleted {model.__name__} cascade: {d}')

        # 8. Pricing
        for model in [PriceListHead, CostListHead]:
            d, _ = model.objects.filter(
                tenant=t, item__sku__startswith='DEMO-'
            ).delete()
            self.stdout.write(f'  Deleted {model.__name__} cascade: {d}')

        # 9. Item relationships
        ItemVendor.objects.filter(tenant=t, item__sku__startswith='DEMO-').delete()
        ItemUOM.objects.filter(tenant=t, item__sku__startswith='DEMO-').delete()

        # 10. Design requests
        DesignRequest.objects.filter(
            tenant=t, ident__startswith='DEMO-'
        ).delete()

        # 11. Items (cascade deletes RSCItem/DCItem via MTI)
        d, _ = Item.objects.filter(tenant=t, sku__startswith='DEMO-').delete()
        self.stdout.write(f'  Deleted Items cascade: {d}')

        # 12. Warehouse
        Bin.objects.filter(tenant=t, warehouse__code='MAIN').delete()
        WarehouseLocation.objects.filter(tenant=t, warehouse__code='MAIN').delete()
        Warehouse.objects.filter(tenant=t, code='MAIN').delete()

        # 13. Fiscal period
        FiscalPeriod.objects.filter(tenant=t, name__startswith='Demo').delete()

        self.stdout.write(self.style.SUCCESS('  Clear complete.\n'))

    # ------------------------------------------------------------------
    # PHASE 1: Foundation
    # ------------------------------------------------------------------

    def _phase_01_foundation(self):
        self.stdout.write('\n[Phase 1] Foundation: COA, UOMs, Accounting Settings')
        t = self.tenant

        # Seed COA and UOMs via existing commands
        if not Account.objects.filter(tenant=t).exists():
            call_command('seed_coa', tenant_id=t.id)
            self.stdout.write('  Seeded Chart of Accounts')
        else:
            self.stdout.write('  COA already exists')

        call_command('seed_uoms')
        self.stdout.write('  UOMs ensured')

        # Configure AccountingSettings
        acct_settings = AccountingSettings.get_for_tenant(t)
        acct_map = {
            'default_ar_account': '1110',
            'default_ap_account': '2010',
            'default_inventory_account': '1230',
            'default_income_account': '4000',
            'default_cogs_account': '5000',
            'default_cash_account': '1020',
            'default_freight_income_account': '4210',
            'default_freight_expense_account': '6350',
            'default_sales_discount_account': '4330',
            'default_purchase_discount_account': '5120',
        }
        changed = False
        for field, code in acct_map.items():
            if getattr(acct_settings, f'{field}_id') is None:
                acct = Account.objects.filter(tenant=t, code=code).first()
                if acct:
                    setattr(acct_settings, field, acct)
                    changed = True
        if changed:
            acct_settings.save()
            self.stdout.write('  Configured AccountingSettings defaults')
        else:
            self.stdout.write('  AccountingSettings already configured')

    # ------------------------------------------------------------------
    # PHASE 2: Parties
    # ------------------------------------------------------------------

    def _phase_02_parties(self):
        self.stdout.write('\n[Phase 2] Parties: Customers, Vendors, Trucks')
        t = self.tenant

        # Customers
        customers = []
        for code, display, legal, city, state, zipcode in CUSTOMERS:
            party, p_created = Party.objects.get_or_create(
                tenant=t, code=code,
                defaults={
                    'party_type': 'CUSTOMER',
                    'display_name': display,
                    'legal_name': legal,
                    'is_active': True,
                }
            )

            # SHIP_TO location
            ship_to, _ = Location.objects.get_or_create(
                tenant=t, party=party, location_type='SHIP_TO', is_default=True,
                defaults={
                    'name': f'{display} - Shipping',
                    'code': f'{code}-SHIP',
                    'address_line1': f'{100 + len(customers) * 100} Commerce Blvd',
                    'city': city, 'state': state, 'postal_code': zipcode,
                    'country': 'USA', 'is_active': True,
                }
            )

            # BILL_TO location
            bill_to, _ = Location.objects.get_or_create(
                tenant=t, party=party, location_type='BILL_TO',
                defaults={
                    'name': f'{display} - Billing',
                    'code': f'{code}-BILL',
                    'address_line1': f'{200 + len(customers) * 100} Finance Ave',
                    'city': city, 'state': state, 'postal_code': zipcode,
                    'country': 'USA', 'is_active': True,
                }
            )

            customer, _ = Customer.objects.get_or_create(
                tenant=t, party=party,
                defaults={
                    'payment_terms': 'NET30',
                    'default_ship_to': ship_to,
                    'default_bill_to': bill_to,
                }
            )
            status = 'Created' if p_created else 'Exists'
            self.stdout.write(f'  Customer {status}: {display}')
            customers.append(customer)

        # Vendors
        vendors = []
        for code, display, legal, city, state, zipcode in VENDORS:
            party, p_created = Party.objects.get_or_create(
                tenant=t, code=code,
                defaults={
                    'party_type': 'VENDOR',
                    'display_name': display,
                    'legal_name': legal,
                    'is_active': True,
                }
            )

            wh_loc, _ = Location.objects.get_or_create(
                tenant=t, party=party, location_type='WAREHOUSE', is_default=True,
                defaults={
                    'name': f'{display} Warehouse',
                    'code': f'{code}-WH',
                    'address_line1': f'{300 + len(vendors) * 100} Industrial Dr',
                    'city': city, 'state': state, 'postal_code': zipcode,
                    'country': 'USA', 'is_active': True,
                }
            )

            vendor, _ = Vendor.objects.get_or_create(
                tenant=t, party=party,
                defaults={
                    'payment_terms': 'NET30',
                    'default_ship_from': wh_loc,
                }
            )
            status = 'Created' if p_created else 'Exists'
            self.stdout.write(f'  Vendor {status}: {display}')
            vendors.append(vendor)

        # Our warehouse party/location
        our_party, _ = Party.objects.get_or_create(
            tenant=t, code='OUR-WH',
            defaults={
                'party_type': 'OTHER',
                'display_name': 'Our Warehouse',
                'legal_name': t.name,
                'is_active': True,
            }
        )
        wh_location, _ = Location.objects.get_or_create(
            tenant=t, party=our_party, name='Main Distribution Center',
            defaults={
                'location_type': 'WAREHOUSE',
                'code': 'OUR-WH-MAIN',
                'address_line1': '100 Distribution Way',
                'city': 'Memphis', 'state': 'TN', 'postal_code': '38118',
                'country': 'USA', 'is_default': True, 'is_active': True,
            }
        )

        # Trucks
        trucks = []
        for name, plate, cap in TRUCKS:
            truck, created = Truck.objects.get_or_create(
                tenant=t, name=name,
                defaults={
                    'license_plate': plate,
                    'capacity_pallets': cap,
                    'is_active': True,
                }
            )
            status = 'Created' if created else 'Exists'
            self.stdout.write(f'  Truck {status}: {name}')
            trucks.append(truck)

        self.counts['customers'] = len(customers)
        self.counts['vendors'] = len(vendors)
        self.counts['trucks'] = len(trucks)
        return customers, vendors, trucks, wh_location

    # ------------------------------------------------------------------
    # PHASE 3: Warehouse + Bins
    # ------------------------------------------------------------------

    def _phase_03_warehouse(self, wh_location):
        self.stdout.write('\n[Phase 3] Warehouse + Bins')
        t = self.tenant

        warehouse, wh_created = Warehouse.objects.get_or_create(
            tenant=t, code='MAIN',
            defaults={
                'name': 'Main Warehouse',
                'location': wh_location,
                'is_active': True,
                'is_default': True,
            }
        )
        self.stdout.write(f'  Warehouse {"Created" if wh_created else "Exists"}: MAIN')

        bin_count = 0
        for code, aisle, rack, level, bin_type in BINS:
            _, created = Bin.objects.get_or_create(
                warehouse=warehouse, code=code,
                defaults={
                    'aisle': aisle, 'rack': rack, 'level': level,
                    'bin_type': bin_type, 'is_active': True,
                }
            )
            if created:
                bin_count += 1

        self.stdout.write(f'  Created {bin_count} bins (total {Bin.objects.filter(warehouse=warehouse).count()})')
        self.counts['bins'] = Bin.objects.filter(warehouse=warehouse).count()
        return warehouse

    # ------------------------------------------------------------------
    # PHASE 4: Items
    # ------------------------------------------------------------------

    def _phase_04_items(self, vendors):
        self.stdout.write('\n[Phase 4] Items (RSC, DC, Packaging)')
        t = self.tenant

        uom_ea = UnitOfMeasure.objects.get(tenant=t, code='ea')
        uom_cs = UnitOfMeasure.objects.get(tenant=t, code='cs')
        uom_plt = UnitOfMeasure.objects.get(tenant=t, code='plt')

        all_items = []
        rsc_items = []
        dc_items = []
        pkg_items = []

        # RSC Items
        for sku, name, l, w, h, test, flute, paper, is_printed in RSC_ITEMS:
            item, created = RSCItem.objects.get_or_create(
                tenant=t, sku=sku,
                defaults={
                    'name': name,
                    'description': f'{name} - {test.upper()} {flute.upper()}-flute {paper.upper()}',
                    'division': 'corrugated',
                    'base_uom': uom_ea,
                    'is_inventory': True, 'is_active': True,
                    'length': l, 'width': w, 'height': h,
                    'test': test, 'flute': flute, 'paper': paper,
                    'is_printed': is_printed,
                    'panels_printed': 2 if is_printed else None,
                    'colors_printed': 1 if is_printed else None,
                    'units_per_layer': 8, 'layers_per_pallet': 6,
                    'units_per_pallet': 48,
                }
            )
            self.stdout.write(f'  {"Created" if created else "Exists"}: {sku}')
            rsc_items.append(item)
            all_items.append(item)

        # DC Items
        for sku, name, l, w, test, flute, paper, is_printed in DC_ITEMS:
            item, created = DCItem.objects.get_or_create(
                tenant=t, sku=sku,
                defaults={
                    'name': name,
                    'description': f'{name} - {test.upper()} {flute.upper()}-flute',
                    'division': 'corrugated',
                    'base_uom': uom_ea,
                    'is_inventory': True, 'is_active': True,
                    'length': l, 'width': w,
                    'test': test, 'flute': flute, 'paper': paper,
                    'is_printed': is_printed,
                    'panels_printed': 1 if is_printed else None,
                    'colors_printed': 2 if is_printed else None,
                    'units_per_layer': 12, 'layers_per_pallet': 8,
                    'units_per_pallet': 96,
                }
            )
            self.stdout.write(f'  {"Created" if created else "Exists"}: {sku}')
            dc_items.append(item)
            all_items.append(item)

        # Packaging Items
        for sku, name, desc in PKG_ITEMS:
            item, created = Item.objects.get_or_create(
                tenant=t, sku=sku,
                defaults={
                    'name': name,
                    'description': desc,
                    'division': 'packaging',
                    'base_uom': uom_ea,
                    'is_inventory': True, 'is_active': True,
                }
            )
            self.stdout.write(f'  {"Created" if created else "Exists"}: {sku}')
            pkg_items.append(item)
            all_items.append(item)

        # ItemUOM conversions for the first 5 RSC items
        for item in rsc_items[:5]:
            ItemUOM.objects.get_or_create(
                tenant=t, item=item, uom=uom_cs,
                defaults={'multiplier_to_base': 12}
            )
            ItemUOM.objects.get_or_create(
                tenant=t, item=item, uom=uom_plt,
                defaults={'multiplier_to_base': 576}
            )

        # ItemVendor links: each vendor supplies 3-4 items
        vendor_item_map = [
            (0, [0, 1, 5, 10]),     # ACME -> RSC-1210, RSC-1814, DC-1008, PKG-WRAP
            (1, [2, 6, 11]),         # FRESH -> RSC-2418, DC-1414, PKG-TAPE
            (2, [3, 7, 8, 12]),      # GLOBAL -> RSC-0804, DC-2015, DC-1212, PKG-EDGE
            (3, [4, 9, 13]),         # PRIME -> RSC-3624, DC-0604, PKG-SLIP
            (4, [0, 2, 5, 14]),      # VALLEY -> RSC-1210, RSC-2418, DC-1008, PKG-PLTW
            (5, [1, 3, 6, 7]),       # SOUTHEAST -> RSC-1814, RSC-0804, DC-1414, DC-2015
        ]
        iv_count = 0
        for v_idx, item_indices in vendor_item_map:
            vendor_party = vendors[v_idx].party
            for i, item_idx in enumerate(item_indices):
                item = all_items[item_idx]
                _, created = ItemVendor.objects.get_or_create(
                    tenant=t, item=item, vendor=vendor_party,
                    defaults={
                        'mpn': f'{vendor_party.code}-{item.sku[-4:]}',
                        'lead_time_days': 5 + (i * 2),
                        'min_order_qty': 100 * (i + 1),
                        'is_preferred': i == 0,
                        'is_active': True,
                    }
                )
                if created:
                    iv_count += 1

        self.stdout.write(f'  Created {iv_count} ItemVendor links')
        self.counts['items'] = len(all_items)
        self.counts['item_vendors'] = iv_count
        return all_items, rsc_items, dc_items, pkg_items

    # ------------------------------------------------------------------
    # PHASE 5: Price Lists + Cost Lists
    # ------------------------------------------------------------------

    def _phase_05_pricing(self, customers, vendors, items, rsc_items, dc_items):
        self.stdout.write('\n[Phase 5] Price Lists + Cost Lists')
        t = self.tenant
        today = self.today

        # 8 Price Lists (customer + item combos)
        price_configs = [
            (0, rsc_items[0], [
                (1, Decimal('1.2500')), (100, Decimal('1.1000')),
                (500, Decimal('0.9500')), (1000, Decimal('0.8500'))]),
            (1, rsc_items[1], [
                (1, Decimal('1.8500')), (100, Decimal('1.6500')),
                (500, Decimal('1.4500'))]),
            (2, rsc_items[2], [
                (1, Decimal('2.7500')), (100, Decimal('2.4000')),
                (500, Decimal('2.1000')), (1000, Decimal('1.8500'))]),
            (3, rsc_items[3], [
                (1, Decimal('0.6500')), (100, Decimal('0.5500')),
                (500, Decimal('0.4800'))]),
            (4, rsc_items[4], [
                (1, Decimal('3.2000')), (100, Decimal('2.8000')),
                (500, Decimal('2.4000'))]),
            (0, dc_items[0], [
                (1, Decimal('0.9500')), (100, Decimal('0.8000')),
                (500, Decimal('0.7000'))]),
            (5, dc_items[1], [
                (1, Decimal('0.5500')), (100, Decimal('0.4500')),
                (1000, Decimal('0.3800'))]),
            (6, dc_items[2], [
                (1, Decimal('1.4500')), (100, Decimal('1.2500')),
                (500, Decimal('1.0500'))]),
        ]

        pl_count = 0
        for cust_idx, item, tiers in price_configs:
            plh, created = PriceListHead.objects.get_or_create(
                tenant=t, customer=customers[cust_idx], item=item,
                begin_date=today - timedelta(days=90),
                defaults={
                    'end_date': today + timedelta(days=275),
                    'is_active': True,
                    'notes': 'Demo price list',
                }
            )
            if created:
                pl_count += 1
                for min_qty, price in tiers:
                    PriceListLine.objects.create(
                        tenant=t, price_list=plh,
                        min_quantity=min_qty, unit_price=price,
                    )

        self.stdout.write(f'  Created {pl_count} price lists')

        # 8 Cost Lists (vendor + item combos)
        cost_configs = [
            (0, rsc_items[0], [
                (1, Decimal('0.6500')), (100, Decimal('0.5800')),
                (500, Decimal('0.5000')), (1000, Decimal('0.4200'))]),
            (1, rsc_items[2], [
                (1, Decimal('1.4000')), (100, Decimal('1.2000')),
                (500, Decimal('1.0500'))]),
            (2, rsc_items[3], [
                (1, Decimal('0.3200')), (100, Decimal('0.2800')),
                (500, Decimal('0.2400'))]),
            (3, rsc_items[4], [
                (1, Decimal('1.6500')), (100, Decimal('1.4500')),
                (500, Decimal('1.2500'))]),
            (0, dc_items[0], [
                (1, Decimal('0.4500')), (100, Decimal('0.3800')),
                (500, Decimal('0.3200'))]),
            (4, dc_items[1], [
                (1, Decimal('0.2800')), (100, Decimal('0.2300')),
                (1000, Decimal('0.1900'))]),
            (5, dc_items[2], [
                (1, Decimal('0.7500')), (100, Decimal('0.6500')),
                (500, Decimal('0.5500'))]),
            (3, dc_items[4], [
                (1, Decimal('0.3500')), (100, Decimal('0.2900')),
                (500, Decimal('0.2400'))]),
        ]

        cl_count = 0
        for vend_idx, item, tiers in cost_configs:
            clh, created = CostListHead.objects.get_or_create(
                tenant=t, vendor=vendors[vend_idx], item=item,
                begin_date=today - timedelta(days=90),
                defaults={
                    'end_date': today + timedelta(days=275),
                    'is_active': True,
                    'notes': 'Demo cost list',
                }
            )
            if created:
                cl_count += 1
                for min_qty, cost in tiers:
                    CostListLine.objects.create(
                        tenant=t, cost_list=clh,
                        min_quantity=min_qty, unit_cost=cost,
                    )

        self.stdout.write(f'  Created {cl_count} cost lists')
        self.counts['price_lists'] = pl_count
        self.counts['cost_lists'] = cl_count

    # ------------------------------------------------------------------
    # PHASE 6: Estimates
    # ------------------------------------------------------------------

    def _phase_06_estimates(self, customers, items, rsc_items):
        self.stdout.write('\n[Phase 6] Estimates')
        t = self.tenant
        today = self.today
        uom_ea = UnitOfMeasure.objects.get(tenant=t, code='ea')

        est_configs = [
            # (number, cust_idx, status, days_ago, lines)
            ('DEMO-EST-001', 0, 'draft', 5, [
                (rsc_items[0], 500, Decimal('1.10')),
                (rsc_items[1], 200, Decimal('1.75')),
            ]),
            ('DEMO-EST-002', 1, 'draft', 3, [
                (rsc_items[2], 100, Decimal('2.50')),
                (rsc_items[3], 1000, Decimal('0.55')),
                (items[10], 50, Decimal('12.50')),
            ]),
            ('DEMO-EST-003', 2, 'sent', 10, [
                (rsc_items[0], 2000, Decimal('0.95')),
                (rsc_items[4], 300, Decimal('2.80')),
            ]),
            ('DEMO-EST-004', 3, 'accepted', 15, [
                (rsc_items[1], 750, Decimal('1.65')),
                (rsc_items[2], 400, Decimal('2.30')),
                (items[11], 100, Decimal('3.50')),
            ]),
            ('DEMO-EST-005', 4, 'rejected', 20, [
                (rsc_items[3], 500, Decimal('0.60')),
                (rsc_items[4], 200, Decimal('3.00')),
            ]),
            ('DEMO-EST-006', 5, 'converted', 30, [
                (rsc_items[0], 1000, Decimal('1.00')),
                (rsc_items[1], 500, Decimal('1.55')),
                (rsc_items[3], 2000, Decimal('0.48')),
                (items[12], 200, Decimal('2.25')),
            ]),
        ]

        estimates = []
        for est_num, cust_idx, status, days_ago, lines in est_configs:
            if Estimate.objects.filter(tenant=t, estimate_number=est_num).exists():
                est = Estimate.objects.get(tenant=t, estimate_number=est_num)
                estimates.append(est)
                self.stdout.write(f'  Exists: {est_num}')
                continue

            cust = customers[cust_idx]
            ship_to = cust.default_ship_to or cust.party.locations.first()
            bill_to = cust.default_bill_to

            subtotal = sum(Decimal(qty) * price for _, qty, price in lines)
            tax_amt = subtotal * Decimal('0.07')

            est = Estimate.objects.create(
                tenant=t,
                estimate_number=est_num,
                customer=cust,
                date=today - timedelta(days=days_ago),
                expiration_date=today + timedelta(days=30 - days_ago),
                status=status,
                ship_to=ship_to,
                bill_to=bill_to,
                subtotal=subtotal,
                tax_rate=Decimal('0.0700'),
                tax_amount=tax_amt,
                total_amount=subtotal + tax_amt,
                notes=f'Demo estimate {est_num}',
            )
            for i, (item, qty, price) in enumerate(lines, 1):
                EstimateLine.objects.create(
                    tenant=t, estimate=est,
                    line_number=i * 10, item=item,
                    description=item.name,
                    quantity=qty, uom=uom_ea, unit_price=price,
                )
            estimates.append(est)
            self.stdout.write(self.style.SUCCESS(f'  Created: {est_num} ({status})'))

        self.counts['estimates'] = len(estimates)
        return estimates

    # ------------------------------------------------------------------
    # PHASE 7: Contracts
    # ------------------------------------------------------------------

    def _phase_07_contracts(self, customers, items, rsc_items):
        self.stdout.write('\n[Phase 7] Contracts')
        t = self.tenant
        today = self.today
        uom_ea = UnitOfMeasure.objects.get(tenant=t, code='ea')

        ctr_configs = [
            # (number, cust_idx, status, blanket_po, start_offset, end_offset, lines)
            ('DEMO-CTR-001', 0, 'active', 'BPO-METRO-2026', -60, 305, [
                (rsc_items[0], 10000, Decimal('0.9500')),
                (rsc_items[1], 5000, Decimal('1.5500')),
                (rsc_items[3], 20000, Decimal('0.4800')),
            ]),
            ('DEMO-CTR-002', 2, 'draft', 'BPO-HARVEST-2026', 0, 365, [
                (rsc_items[2], 3000, Decimal('2.2000')),
                (rsc_items[4], 2000, Decimal('2.6000')),
            ]),
            ('DEMO-CTR-003', 4, 'complete', 'BPO-COASTAL-2025', -365, -1, [
                (rsc_items[0], 8000, Decimal('1.0000')),
                (rsc_items[2], 4000, Decimal('2.3000')),
            ]),
        ]

        contracts = []
        for ctr_num, cust_idx, status, blanket_po, start_off, end_off, lines in ctr_configs:
            if Contract.objects.filter(tenant=t, contract_number=ctr_num).exists():
                ctr = Contract.objects.get(tenant=t, contract_number=ctr_num)
                contracts.append(ctr)
                self.stdout.write(f'  Exists: {ctr_num}')
                continue

            cust = customers[cust_idx]
            ship_to = cust.default_ship_to

            ctr = Contract.objects.create(
                tenant=t,
                customer=cust,
                contract_number=ctr_num,
                blanket_po=blanket_po,
                status=status,
                issue_date=today + timedelta(days=start_off),
                start_date=today + timedelta(days=start_off),
                end_date=today + timedelta(days=end_off),
                ship_to=ship_to,
                notes=f'Demo contract {ctr_num}',
            )
            for i, (item, qty, price) in enumerate(lines, 1):
                ContractLine.objects.create(
                    tenant=t, contract=ctr,
                    line_number=i * 10, item=item,
                    blanket_qty=qty, uom=uom_ea, unit_price=price,
                )
            contracts.append(ctr)
            self.stdout.write(self.style.SUCCESS(f'  Created: {ctr_num} ({status})'))

        self.counts['contracts'] = len(contracts)
        return contracts

    # ------------------------------------------------------------------
    # PHASE 8: RFQs
    # ------------------------------------------------------------------

    def _phase_08_rfqs(self, vendors, items, rsc_items, wh_location):
        self.stdout.write('\n[Phase 8] RFQs')
        t = self.tenant
        today = self.today
        uom_ea = UnitOfMeasure.objects.get(tenant=t, code='ea')

        rfq_configs = [
            ('DEMO-RFQ-001', 0, 'draft', 2, [
                (rsc_items[0], 2000, Decimal('0.5500'), None),
                (rsc_items[1], 1000, Decimal('1.2000'), None),
            ]),
            ('DEMO-RFQ-002', 1, 'sent', 5, [
                (rsc_items[2], 500, Decimal('1.3000'), None),
            ]),
            ('DEMO-RFQ-003', 2, 'received', 10, [
                (rsc_items[3], 3000, Decimal('0.2800'), Decimal('0.2650')),
                (rsc_items[4], 1000, Decimal('1.4000'), Decimal('1.3500')),
                (items[7], 500, Decimal('0.6000'), Decimal('0.5800')),
            ]),
            ('DEMO-RFQ-004', 3, 'converted', 20, [
                (rsc_items[0], 5000, Decimal('0.5000'), Decimal('0.4800')),
                (rsc_items[2], 2000, Decimal('1.2500'), Decimal('1.2000')),
            ]),
        ]

        rfq_count = 0
        for rfq_num, v_idx, status, days_ago, lines in rfq_configs:
            if RFQ.objects.filter(tenant=t, rfq_number=rfq_num).exists():
                self.stdout.write(f'  Exists: {rfq_num}')
                continue

            rfq = RFQ.objects.create(
                tenant=t,
                rfq_number=rfq_num,
                vendor=vendors[v_idx],
                date=today - timedelta(days=days_ago),
                expected_date=today + timedelta(days=14 - days_ago),
                status=status,
                ship_to=wh_location,
                notes=f'Demo RFQ {rfq_num}',
            )
            for i, (item, qty, target, quoted) in enumerate(lines, 1):
                RFQLine.objects.create(
                    tenant=t, rfq=rfq,
                    line_number=i * 10, item=item,
                    description=item.name,
                    quantity=qty, uom=uom_ea,
                    target_price=target, quoted_price=quoted,
                )
            rfq_count += 1
            self.stdout.write(self.style.SUCCESS(f'  Created: {rfq_num} ({status})'))

        self.counts['rfqs'] = rfq_count

    # ------------------------------------------------------------------
    # PHASE 9: Purchase Orders
    # ------------------------------------------------------------------

    def _phase_09_purchase_orders(self, vendors, items, rsc_items, dc_items,
                                   wh_location, trucks):
        self.stdout.write('\n[Phase 9] Purchase Orders')
        t = self.tenant
        today = self.today
        uom_ea = UnitOfMeasure.objects.get(tenant=t, code='ea')

        # (po_num, vendor_idx, status, days_offset, priority, truck_idx_or_none, lines)
        po_configs = [
            ('DEMO-PO-001', 0, 'draft', -2, 5, None, [
                (rsc_items[0], 500, Decimal('0.5800')),
                (rsc_items[1], 200, Decimal('1.2500')),
            ]),
            ('DEMO-PO-002', 1, 'draft', -1, 5, None, [
                (rsc_items[2], 300, Decimal('1.2000')),
            ]),
            ('DEMO-PO-003', 0, 'draft', 0, 4, None, [
                (dc_items[0], 1000, Decimal('0.3800')),
                (dc_items[1], 500, Decimal('0.2300')),
            ]),
            ('DEMO-PO-004', 2, 'confirmed', -5, 3, None, [
                (rsc_items[0], 2000, Decimal('0.5000')),
                (rsc_items[3], 1500, Decimal('0.2800')),
                (items[12], 200, Decimal('1.5000')),
            ]),
            ('DEMO-PO-005', 3, 'confirmed', -3, 2, None, [
                (rsc_items[4], 800, Decimal('1.4500')),
            ]),
            ('DEMO-PO-006', 4, 'confirmed', -4, 5, None, [
                (dc_items[2], 600, Decimal('0.6500')),
                (dc_items[4], 400, Decimal('0.2900')),
            ]),
            ('DEMO-PO-007', 5, 'confirmed', -7, 1, None, [
                (rsc_items[1], 1000, Decimal('1.2000')),
                (rsc_items[2], 500, Decimal('1.0500')),
            ]),
            ('DEMO-PO-008', 0, 'scheduled', -10, 3, 0, [
                (rsc_items[0], 3000, Decimal('0.5000')),
                (dc_items[0], 1500, Decimal('0.3500')),
            ]),
            ('DEMO-PO-009', 1, 'scheduled', -8, 4, 1, [
                (rsc_items[3], 5000, Decimal('0.2600')),
            ]),
            ('DEMO-PO-010', 2, 'shipped', -20, 5, None, [
                (rsc_items[0], 1000, Decimal('0.5200')),
                (rsc_items[1], 500, Decimal('1.1500')),
                (dc_items[1], 800, Decimal('0.2200')),
            ]),
            ('DEMO-PO-011', 3, 'complete', -30, 5, None, [
                (rsc_items[2], 2000, Decimal('1.1000')),
                (rsc_items[4], 1000, Decimal('1.3500')),
            ]),
            ('DEMO-PO-012', 4, 'cancelled', -15, 5, None, [
                (dc_items[3], 500, Decimal('0.2000')),
            ]),
        ]

        pos = []
        for po_num, v_idx, status, days_off, priority, truck_idx, lines in po_configs:
            if PurchaseOrder.objects.filter(tenant=t, po_number=po_num).exists():
                po = PurchaseOrder.objects.get(tenant=t, po_number=po_num)
                pos.append(po)
                self.stdout.write(f'  Exists: {po_num}')
                continue

            sched_date = None
            sched_truck = None
            if status == 'scheduled':
                sched_date = today + timedelta(days=3 + (len(pos) % 10))
                sched_truck = trucks[truck_idx] if truck_idx is not None else None

            po = PurchaseOrder.objects.create(
                tenant=t,
                vendor=vendors[v_idx],
                po_number=po_num,
                order_date=today + timedelta(days=days_off),
                expected_date=today + timedelta(days=days_off + 14),
                ship_to=wh_location,
                status=status,
                priority=priority,
                scheduled_date=sched_date,
                scheduled_truck=sched_truck,
                notes=f'Demo PO {po_num}',
            )
            for i, (item, qty, cost) in enumerate(lines, 1):
                PurchaseOrderLine.objects.create(
                    tenant=t, purchase_order=po,
                    line_number=i * 10, item=item,
                    quantity_ordered=qty, uom=uom_ea, unit_cost=cost,
                )
            pos.append(po)
            self.stdout.write(self.style.SUCCESS(
                f'  Created: {po_num} ({status})'
                + (f' sched={sched_date}' if sched_date else '')
            ))

        self.counts['purchase_orders'] = len(pos)
        return pos

    # ------------------------------------------------------------------
    # PHASE 10: Sales Orders
    # ------------------------------------------------------------------

    def _phase_10_sales_orders(self, customers, items, rsc_items, dc_items,
                                trucks, estimates, contracts):
        self.stdout.write('\n[Phase 10] Sales Orders')
        t = self.tenant
        today = self.today
        uom_ea = UnitOfMeasure.objects.get(tenant=t, code='ea')

        # (so_num, cust_idx, status, days_off, priority, truck_idx|None, lines, est_idx|None)
        so_configs = [
            ('DEMO-SO-001', 0, 'draft', -2, 5, None, [
                (rsc_items[0], 200, Decimal('1.10')),
                (rsc_items[1], 100, Decimal('1.75')),
            ], None),
            ('DEMO-SO-002', 1, 'draft', -1, 4, None, [
                (dc_items[0], 500, Decimal('0.85')),
            ], None),
            ('DEMO-SO-003', 2, 'confirmed', -5, 3, None, [
                (rsc_items[0], 1000, Decimal('1.00')),
                (rsc_items[3], 2000, Decimal('0.55')),
                (items[10], 100, Decimal('12.00')),
            ], None),
            ('DEMO-SO-004', 3, 'confirmed', -4, 2, None, [
                (rsc_items[2], 300, Decimal('2.40')),
                (dc_items[2], 400, Decimal('1.20')),
            ], 3),  # linked to accepted estimate DEMO-EST-004
            ('DEMO-SO-005', 4, 'confirmed', -7, 1, None, [
                (rsc_items[4], 500, Decimal('2.80')),
            ], None),
            ('DEMO-SO-006', 0, 'scheduled', -10, 3, 0, [
                (rsc_items[0], 500, Decimal('0.95')),
                (rsc_items[1], 250, Decimal('1.55')),
                (dc_items[0], 300, Decimal('0.80')),
            ], None),
            ('DEMO-SO-007', 5, 'scheduled', -8, 4, 1, [
                (rsc_items[2], 800, Decimal('2.10')),
                (dc_items[1], 600, Decimal('0.45')),
            ], None),
            ('DEMO-SO-008', 6, 'scheduled', -6, 5, 2, [
                (rsc_items[3], 3000, Decimal('0.48')),
            ], None),
            ('DEMO-SO-009', 2, 'shipped', -20, 5, None, [
                (rsc_items[0], 1500, Decimal('1.00')),
                (rsc_items[4], 400, Decimal('2.65')),
            ], None),
            ('DEMO-SO-010', 7, 'shipped', -18, 5, None, [
                (dc_items[0], 2000, Decimal('0.78')),
                (dc_items[2], 1000, Decimal('1.10')),
            ], None),
            ('DEMO-SO-011', 0, 'complete', -30, 5, None, [
                (rsc_items[0], 1000, Decimal('0.95')),
                (rsc_items[1], 500, Decimal('1.50')),
                (rsc_items[3], 2000, Decimal('0.48')),
            ], 5),  # linked to converted estimate DEMO-EST-006
            ('DEMO-SO-012', 1, 'cancelled', -15, 5, None, [
                (dc_items[3], 300, Decimal('0.35')),
            ], None),
        ]

        sos = []
        for so_num, c_idx, status, days_off, priority, truck_idx, lines, est_idx in so_configs:
            if SalesOrder.objects.filter(tenant=t, order_number=so_num).exists():
                so = SalesOrder.objects.get(tenant=t, order_number=so_num)
                sos.append(so)
                self.stdout.write(f'  Exists: {so_num}')
                continue

            cust = customers[c_idx]
            ship_to = cust.default_ship_to or cust.party.locations.first()

            sched_date = None
            sched_truck = None
            if status == 'scheduled':
                sched_date = today + timedelta(days=2 + (len(sos) % 12))
                sched_truck = trucks[truck_idx] if truck_idx is not None else None

            source_est = estimates[est_idx] if est_idx is not None else None

            so = SalesOrder.objects.create(
                tenant=t,
                customer=cust,
                order_number=so_num,
                order_date=today + timedelta(days=days_off),
                ship_to=ship_to,
                bill_to=cust.default_bill_to,
                status=status,
                priority=priority,
                scheduled_date=sched_date,
                scheduled_truck=sched_truck,
                source_estimate=source_est,
                customer_po=f'CUSTPO-{so_num[-3:]}',
                notes=f'Demo SO {so_num}',
            )
            for i, (item, qty, price) in enumerate(lines, 1):
                SalesOrderLine.objects.create(
                    tenant=t, sales_order=so,
                    line_number=i * 10, item=item,
                    quantity_ordered=qty, uom=uom_ea, unit_price=price,
                )
            sos.append(so)
            self.stdout.write(self.style.SUCCESS(
                f'  Created: {so_num} ({status})'
                + (f' sched={sched_date}' if sched_date else '')
            ))

        # Contract releases for DEMO-CTR-001 (active) against DEMO-SO-011
        if contracts and len(contracts) > 0 and len(sos) >= 11:
            ctr = contracts[0]  # DEMO-CTR-001
            so = sos[10]  # DEMO-SO-011
            ctr_lines = list(ctr.lines.all())
            so_lines = list(so.lines.all())

            for cl, sl in zip(ctr_lines, so_lines):
                if not ContractRelease.objects.filter(
                    tenant=t, sales_order_line=sl
                ).exists():
                    ContractRelease.objects.create(
                        tenant=t,
                        contract_line=cl,
                        sales_order_line=sl,
                        quantity_ordered=sl.quantity_ordered,
                        release_date=so.order_date,
                        balance_before=cl.blanket_qty,
                        balance_after=max(0, cl.blanket_qty - sl.quantity_ordered),
                    )
            self.stdout.write('  Created contract releases for CTR-001 -> SO-011')

        self.counts['sales_orders'] = len(sos)
        return sos

    # ------------------------------------------------------------------
    # PHASE 11: Inventory
    # ------------------------------------------------------------------

    def _phase_11_inventory(self, warehouse, items, rsc_items, pos):
        self.stdout.write('\n[Phase 11] Inventory (WarehouseLocations, Lots, Stock)')
        t = self.tenant

        # Create WarehouseLocations
        wh_loc_configs = [
            ('RECV-1', 'RECV-1', 'RECEIVING_DOCK', 'Receiving'),
            ('STOR-A1', 'STOR-A1', 'STORAGE', 'Zone A / Aisle 1'),
            ('STOR-A2', 'STOR-A2', 'STORAGE', 'Zone A / Aisle 2'),
            ('STOR-B1', 'STOR-B1', 'STORAGE', 'Zone B / Aisle 1'),
            ('SHIP-1', 'SHIP-1', 'SHIPPING_DOCK', 'Shipping'),
        ]

        wh_locations = {}
        for name, barcode, loc_type, parent_path in wh_loc_configs:
            loc, _ = WarehouseLocation.objects.get_or_create(
                tenant=t, barcode=barcode,
                defaults={
                    'warehouse': warehouse,
                    'name': name,
                    'type': loc_type,
                    'parent_path': parent_path,
                    'is_active': True,
                }
            )
            wh_locations[name] = loc

        # Lots and stock for "received" POs (PO-010, PO-011)
        lot_items = [rsc_items[0], rsc_items[1], rsc_items[2],
                     rsc_items[3], rsc_items[4], items[5]]  # items[5] = DC-1008

        lot_count = 0
        quant_count = 0
        move_count = 0
        recv_loc = wh_locations['RECV-1']
        stor_locs = [wh_locations['STOR-A1'], wh_locations['STOR-A2'],
                     wh_locations['STOR-B1']]

        for i, item in enumerate(lot_items):
            lot_num = f'DEMO-LOT-{i+1:03d}'
            lot, lot_created = Lot.objects.get_or_create(
                tenant=t, item=item, lot_number=lot_num,
                defaults={
                    'vendor_batch': f'VB-{2026}-{i+1:04d}',
                    'expiry_date': self.today + timedelta(days=180 + i * 30),
                }
            )
            if lot_created:
                lot_count += 1

            stor_loc = stor_locs[i % len(stor_locs)]
            qty = Decimal(str(200 + i * 100))

            _, sq_created = StockQuant.objects.get_or_create(
                tenant=t, item=item, location=stor_loc, lot=lot,
                defaults={'quantity': qty}
            )
            if sq_created:
                quant_count += 1

            if not StockMoveLog.objects.filter(
                tenant=t, item=item, lot=lot, reference__startswith='DEMO-'
            ).exists():
                StockMoveLog.objects.create(
                    tenant=t, item=item,
                    source_location=recv_loc,
                    destination_location=stor_loc,
                    lot=lot, quantity=qty,
                    reference=f'DEMO-RECEIPT PO putaway',
                )
                move_count += 1

        self.stdout.write(f'  Created {len(wh_locations)} warehouse locations')
        self.stdout.write(f'  Created {lot_count} lots, {quant_count} quants, {move_count} moves')
        self.counts['lots'] = lot_count
        self.counts['stock_quants'] = quant_count
        return wh_locations

    # ------------------------------------------------------------------
    # PHASE 12: Shipments
    # ------------------------------------------------------------------

    def _phase_12_shipments(self, trucks, sos, items, rsc_items):
        self.stdout.write('\n[Phase 12] Shipments + BOLs')
        t = self.tenant
        today = self.today
        uom_ea = UnitOfMeasure.objects.get(tenant=t, code='ea')

        # (ship_num, status, truck_idx, days_off, driver, so_indices, bol?)
        ship_configs = [
            ('DEMO-SHIP-001', 'planned', 0, 3, 'Mike Johnson', [5], False),
            ('DEMO-SHIP-002', 'loading', 1, 0, 'Tom Williams', [6], False),
            ('DEMO-SHIP-003', 'in_transit', 2, -1, 'Dave Brown', [8], True),
            ('DEMO-SHIP-004', 'delivered', 0, -5, 'Mike Johnson', [9], True),
        ]

        ship_count = 0
        bol_count = 0
        for ship_num, status, truck_idx, days_off, driver, so_idxs, has_bol in ship_configs:
            if Shipment.objects.filter(tenant=t, shipment_number=ship_num).exists():
                self.stdout.write(f'  Exists: {ship_num}')
                continue

            ship = Shipment.objects.create(
                tenant=t,
                shipment_number=ship_num,
                ship_date=today + timedelta(days=days_off),
                truck=trucks[truck_idx],
                driver_name=driver,
                status=status,
                departure_time=(
                    timezone.now() + timedelta(days=days_off, hours=-2)
                    if status in ('in_transit', 'delivered') else None
                ),
                arrival_time=(
                    timezone.now() + timedelta(days=days_off)
                    if status == 'delivered' else None
                ),
                notes=f'Demo shipment {ship_num}',
            )

            for seq, so_idx in enumerate(so_idxs):
                if so_idx < len(sos):
                    del_status = {
                        'planned': 'pending', 'loading': 'loaded',
                        'in_transit': 'loaded', 'delivered': 'delivered',
                    }.get(status, 'pending')

                    ShipmentLine.objects.create(
                        tenant=t, shipment=ship,
                        sales_order=sos[so_idx],
                        delivery_sequence=seq + 1,
                        delivery_status=del_status,
                        delivered_at=(
                            timezone.now() + timedelta(days=days_off)
                            if status == 'delivered' else None
                        ),
                        signature_name='J. Smith' if status == 'delivered' else '',
                    )

            ship_count += 1
            self.stdout.write(self.style.SUCCESS(f'  Created: {ship_num} ({status})'))

            # BOL for in_transit and delivered
            if has_bol:
                bol_num = ship_num.replace('SHIP', 'BOL')
                if not BillOfLading.objects.filter(tenant=t, bol_number=bol_num).exists():
                    bol_status = 'signed' if status == 'delivered' else 'issued'
                    bol = BillOfLading.objects.create(
                        tenant=t,
                        bol_number=bol_num,
                        shipment=ship,
                        status=bol_status,
                        issue_date=today + timedelta(days=days_off),
                        carrier_name='Raven Logistics',
                        carrier_scac='RVNL',
                        trailer_number=f'TRL-{ship_num[-3:]}',
                        seal_number=f'SEAL-{ship_num[-3:]}',
                        shipper_name=t.name,
                        shipper_address='100 Distribution Way, Memphis, TN 38118',
                        total_pieces=10,
                        total_weight=Decimal('2500.00'),
                    )
                    # BOL Lines
                    first_so_idx = so_idxs[0]
                    if first_so_idx < len(sos):
                        so = sos[first_so_idx]
                        for i, sol in enumerate(so.lines.all()[:3], 1):
                            BOLLine.objects.create(
                                tenant=t, bol=bol,
                                line_number=i * 10,
                                item=sol.item,
                                description=sol.item.name,
                                quantity=sol.quantity_ordered,
                                uom=sol.uom,
                                num_packages=max(1, sol.quantity_ordered // 48),
                                weight=Decimal(str(sol.quantity_ordered)) * Decimal('0.5'),
                                freight_class='70',
                            )
                    bol_count += 1
                    self.stdout.write(f'    BOL {bol_num} ({bol_status})')

        self.counts['shipments'] = ship_count
        self.counts['bols'] = bol_count

    # ------------------------------------------------------------------
    # PHASE 13: Invoicing
    # ------------------------------------------------------------------

    def _phase_13_invoicing(self, customers, vendors, sos, pos, items, rsc_items):
        self.stdout.write('\n[Phase 13] Invoices, Payments, Vendor Bills')
        t = self.tenant
        today = self.today
        uom_ea = UnitOfMeasure.objects.get(tenant=t, code='ea')

        # Invoices: (inv_num, cust_idx, status, days_ago, so_idx|None, subtotal)
        inv_configs = [
            ('DEMO-INV-001', 0, 'draft', 3, 0, Decimal('550.00')),
            ('DEMO-INV-002', 2, 'posted', 10, 2, Decimal('2100.00')),
            ('DEMO-INV-003', 3, 'sent', 15, 3, Decimal('1200.00')),
            ('DEMO-INV-004', 0, 'partial', 25, 10, Decimal('2185.00')),
            ('DEMO-INV-005', 7, 'paid', 40, 9, Decimal('2660.00')),
            ('DEMO-INV-006', 4, 'overdue', 60, 4, Decimal('1400.00')),
        ]

        inv_count = 0
        invoices = []
        for inv_num, c_idx, status, days_ago, so_idx, subtotal in inv_configs:
            if Invoice.objects.filter(tenant=t, invoice_number=inv_num).exists():
                inv = Invoice.objects.get(tenant=t, invoice_number=inv_num)
                invoices.append(inv)
                self.stdout.write(f'  Exists: {inv_num}')
                continue

            cust = customers[c_idx]
            tax_amt = subtotal * Decimal('0.07')
            total = subtotal + tax_amt

            amount_paid = Decimal('0')
            if status == 'paid':
                amount_paid = total
            elif status == 'partial':
                amount_paid = total * Decimal('0.50')

            linked_so = sos[so_idx] if so_idx is not None and so_idx < len(sos) else None

            inv = Invoice(
                tenant=t,
                invoice_number=inv_num,
                customer=cust,
                sales_order=linked_so,
                invoice_date=today - timedelta(days=days_ago),
                due_date=today - timedelta(days=days_ago - 30),
                payment_terms='NET30',
                status=status,
                bill_to_name=cust.party.display_name,
                bill_to_address=f'{cust.party.display_name}\n123 Main St',
                ship_to_name=cust.party.display_name,
                subtotal=subtotal,
                tax_rate=Decimal('0.0700'),
                tax_amount=tax_amt,
                total_amount=total,
                amount_paid=amount_paid,
                customer_po=f'CUSTPO-{inv_num[-3:]}',
                notes=f'Demo invoice {inv_num}',
            )
            inv.save()

            # Invoice lines from SO lines or synthetic
            if linked_so:
                for i, sol in enumerate(linked_so.lines.all()[:3], 1):
                    InvoiceLine.objects.create(
                        tenant=t, invoice=inv,
                        line_number=i * 10, item=sol.item,
                        description=sol.item.name,
                        quantity=sol.quantity_ordered,
                        uom=sol.uom,
                        unit_price=sol.unit_price,
                        sales_order_line=sol,
                    )
            else:
                InvoiceLine.objects.create(
                    tenant=t, invoice=inv,
                    line_number=10, item=rsc_items[0],
                    description=rsc_items[0].name,
                    quantity=500, uom=uom_ea,
                    unit_price=Decimal('1.10'),
                )

            invoices.append(inv)
            inv_count += 1
            self.stdout.write(self.style.SUCCESS(f'  Created: {inv_num} ({status})'))

        # Payments
        pmt_count = 0
        pmt_configs = [
            # (invoice_idx, amount, method, ref)
            (4, None, 'ACH', 'ACH-20260110'),     # full pay on DEMO-INV-005
            (3, Decimal('1168.98'), 'CHECK', 'CHK-5544'),  # partial on DEMO-INV-004
            (2, Decimal('500.00'), 'WIRE', 'WIRE-9988'),   # partial on DEMO-INV-003
        ]
        for inv_idx, amount, method, ref in pmt_configs:
            if inv_idx < len(invoices):
                inv = invoices[inv_idx]
                pay_amt = amount if amount else inv.total_amount
                if not Payment.objects.filter(tenant=t, invoice=inv, reference_number=ref).exists():
                    Payment.objects.create(
                        tenant=t, invoice=inv,
                        payment_date=today - timedelta(days=5 + pmt_count * 7),
                        amount=pay_amt,
                        payment_method=method,
                        reference_number=ref,
                        notes=f'Demo payment {ref}',
                    )
                    pmt_count += 1

        self.stdout.write(f'  Created {pmt_count} payments')

        # Vendor Bills
        bill_configs = [
            ('DEMO-BILL-001', 0, 'draft', 5, 3, 'ACME-INV-1001', Decimal('1520.00')),
            ('DEMO-BILL-002', 1, 'posted', 15, 4, 'FRESH-INV-2001', Decimal('960.00')),
            ('DEMO-BILL-003', 2, 'partial', 25, 5, 'GLOBAL-INV-3001', Decimal('2380.00')),
            ('DEMO-BILL-004', 3, 'paid', 40, 6, 'PRIME-INV-4001', Decimal('1160.00')),
        ]

        bill_count = 0
        bills = []
        for bill_num, v_idx, status, days_ago, po_idx, vendor_inv_num, subtotal in bill_configs:
            if VendorBill.objects.filter(tenant=t, bill_number=bill_num).exists():
                bill = VendorBill.objects.get(tenant=t, bill_number=bill_num)
                bills.append(bill)
                self.stdout.write(f'  Exists: {bill_num}')
                continue

            total = subtotal + (subtotal * Decimal('0.05'))  # 5% tax
            linked_po = pos[po_idx] if po_idx < len(pos) else None

            amount_paid = Decimal('0')
            if status == 'paid':
                amount_paid = total
            elif status == 'partial':
                amount_paid = total * Decimal('0.40')

            bill = VendorBill(
                tenant=t,
                vendor=vendors[v_idx],
                purchase_order=linked_po,
                vendor_invoice_number=vendor_inv_num,
                bill_number=bill_num,
                bill_date=today - timedelta(days=days_ago),
                due_date=today - timedelta(days=days_ago - 30),
                status=status,
                subtotal=subtotal,
                tax_amount=subtotal * Decimal('0.05'),
                total_amount=total,
                amount_paid=amount_paid,
                notes=f'Demo vendor bill {bill_num}',
            )
            bill.save()

            # Bill lines
            if linked_po:
                for i, pol in enumerate(linked_po.lines.all()[:3], 1):
                    VendorBillLine.objects.create(
                        tenant=t, bill=bill,
                        line_number=i * 10, item=pol.item,
                        description=pol.item.name,
                        quantity=Decimal(str(pol.quantity_ordered)),
                        unit_price=pol.unit_cost,
                        purchase_order_line=pol,
                    )
            else:
                VendorBillLine.objects.create(
                    tenant=t, bill=bill,
                    line_number=10, item=rsc_items[0],
                    description=rsc_items[0].name,
                    quantity=Decimal('1000'),
                    unit_price=Decimal('0.5200'),
                )

            bills.append(bill)
            bill_count += 1
            self.stdout.write(self.style.SUCCESS(f'  Created: {bill_num} ({status})'))

        # Bill Payments
        bp_count = 0
        bp_configs = [
            (3, None, 'ACH', 'BP-ACH-1001'),      # full pay on BILL-004
            (2, Decimal('999.60'), 'CHECK', 'BP-CHK-2001'),  # partial on BILL-003
        ]
        for bill_idx, amount, method, ref in bp_configs:
            if bill_idx < len(bills):
                bill = bills[bill_idx]
                pay_amt = amount if amount else bill.total_amount
                if not BillPayment.objects.filter(
                    tenant=t, bill=bill, reference_number=ref
                ).exists():
                    BillPayment.objects.create(
                        tenant=t, bill=bill,
                        payment_date=today - timedelta(days=3 + bp_count * 10),
                        amount=pay_amt,
                        payment_method=method,
                        reference_number=ref,
                        notes=f'Demo bill payment {ref}',
                    )
                    bp_count += 1

        self.stdout.write(f'  Created {bp_count} bill payments')
        self.counts['invoices'] = inv_count
        self.counts['payments'] = pmt_count
        self.counts['vendor_bills'] = bill_count
        self.counts['bill_payments'] = bp_count

    # ------------------------------------------------------------------
    # PHASE 14: Design Requests
    # ------------------------------------------------------------------

    def _phase_14_design_requests(self, customers):
        self.stdout.write('\n[Phase 14] Design Requests')
        t = self.tenant

        dr_configs = [
            # (ident, cust_idx, status, style, L, W, D, test, flute, paper)
            ('DEMO-DR-PND', 0, 'pending', 'RSC', Decimal('16'), Decimal('12'),
             Decimal('10'), 'ect32', 'c', 'k'),
            ('DEMO-DR-INP', 1, 'in_progress', 'DC', Decimal('20'), Decimal('16'),
             None, 'ect44', 'b', 'mw'),
            ('DEMO-DR-APR', 2, 'approved', 'RSC', Decimal('24'), Decimal('20'),
             Decimal('18'), 'ect48', 'bc', 'k'),
            ('DEMO-DR-REJ', 3, 'rejected', 'FOL', Decimal('10'), Decimal('8'),
             Decimal('6'), 'ect29', 'e', 'k'),
            ('DEMO-DR-CMP', 4, 'completed', 'RSC', Decimal('30'), Decimal('22'),
             Decimal('14'), 'ect51', 'c', 'k'),
        ]

        dr_count = 0
        for ident, c_idx, status, style, l, w, d, test, flute, paper in dr_configs:
            if DesignRequest.objects.filter(tenant=t, ident=ident).exists():
                self.stdout.write(f'  Exists: {ident}')
                continue

            # For the completed one, link to an existing generated item
            generated_item = None
            if status == 'completed':
                generated_item = Item.objects.filter(
                    tenant=t, sku='DEMO-RSC-3624'
                ).first()

            dr = DesignRequest(
                tenant=t,
                customer=customers[c_idx].party,
                status=status,
                ident=ident,
                style=style,
                length=l, width=w, depth=d,
                test=test, flute=flute, paper=paper,
                has_ard=status in ('approved', 'completed'),
                has_pdf=status in ('in_progress', 'approved', 'completed'),
                has_dxf=status == 'completed',
                has_samples=status in ('approved', 'completed'),
                pallet_configuration=status == 'completed',
                sample_quantity=5 if status in ('approved', 'completed') else None,
                notes=f'Demo design request {ident}',
                generated_item=generated_item,
            )
            # Don't set file_number - model save() auto-generates it
            dr.save()
            dr_count += 1
            self.stdout.write(self.style.SUCCESS(
                f'  Created: {dr.file_number} ({ident}, {status})'
            ))

        self.counts['design_requests'] = dr_count

    # ------------------------------------------------------------------
    # PHASE 15: Scheduling
    # ------------------------------------------------------------------

    def _phase_15_scheduling(self, trucks, vendors, pos, sos):
        self.stdout.write('\n[Phase 15] Scheduling (DeliveryRuns, Notes, Priority, Allotments)')
        t = self.tenant
        today = self.today

        # 3 Delivery Runs
        run_configs = [
            ('Demo Morning Run', trucks[0], today + timedelta(days=3), 1,
             time(7, 0), 'Early AM deliveries'),
            ('Demo Afternoon Run', trucks[1], today + timedelta(days=5), 1,
             time(13, 0), 'Afternoon delivery route'),
            ('Demo Express Run', trucks[2], today + timedelta(days=7), 1,
             time(9, 30), 'Rush delivery run'),
        ]

        runs = []
        for name, truck, sched_date, seq, dept_time, notes in run_configs:
            run, created = DeliveryRun.objects.get_or_create(
                tenant=t, truck=truck, scheduled_date=sched_date, sequence=seq,
                defaults={
                    'name': name,
                    'departure_time': dept_time,
                    'notes': notes,
                    'is_complete': False,
                }
            )
            runs.append(run)
            if created:
                self.stdout.write(f'  DeliveryRun: {name}')

        # 4 Scheduler Notes
        note_configs = [
            ('Truck 1 driver out sick Friday - need replacement',
             'red', today + timedelta(days=5), trucks[0], None, None, None, True),
            ('ACME shipment may be delayed - call to confirm',
             'orange', today + timedelta(days=3), trucks[1], None, None, None, False),
            ('Customer requested AM delivery only',
             'blue', None, None, None,
             sos[5] if len(sos) > 5 else None, None, False),
            ('Priority override - expedite this order',
             'purple', None, None, None, None,
             pos[4] if len(pos) > 4 else None, True),
        ]

        note_count = 0
        for content, color, sched_date, truck, run, so, po, pinned in note_configs:
            if not SchedulerNote.objects.filter(
                tenant=t, content=content
            ).exists():
                SchedulerNote.objects.create(
                    tenant=t,
                    content=content,
                    color=color,
                    scheduled_date=sched_date,
                    truck=truck,
                    delivery_run=run,
                    sales_order=so,
                    purchase_order=po,
                    is_pinned=pinned,
                )
                note_count += 1

        self.stdout.write(f'  Created {note_count} scheduler notes')

        # 6 PriorityLinePriority entries
        plp_count = 0
        # Get PO lines from confirmed/scheduled POs
        priority_pos = [p for p in pos if p.status in ('confirmed', 'scheduled')]
        for i, po in enumerate(priority_pos[:6]):
            first_line = po.lines.first()
            if first_line and not PriorityLinePriority.objects.filter(
                tenant=t, purchase_order_line=first_line
            ).exists():
                box_type = 'RSC' if 'RSC' in first_line.item.sku else 'DC'
                PriorityLinePriority.objects.create(
                    tenant=t,
                    purchase_order_line=first_line,
                    vendor=po.vendor,
                    scheduled_date=today + timedelta(days=i + 1),
                    box_type=box_type,
                    sequence=i,
                )
                plp_count += 1

        self.stdout.write(f'  Created {plp_count} priority line entries')

        # 3 VendorKickAllotment records
        vka_count = 0
        allotment_configs = [
            (vendors[0], 'RSC', 150),
            (vendors[0], 'DC', 80),
            (vendors[1], 'RSC', 120),
        ]
        for vendor, box_type, allotment in allotment_configs:
            _, created = VendorKickAllotment.objects.get_or_create(
                tenant=t, vendor=vendor, box_type=box_type,
                defaults={'daily_allotment': allotment}
            )
            if created:
                vka_count += 1

        self.stdout.write(f'  Created {vka_count} vendor kick allotments')

        # 2 DailyKickOverride records
        dko_count = 0
        override_configs = [
            (vendors[0], 'RSC', today + timedelta(days=5), 200),
            (vendors[1], 'RSC', today + timedelta(days=7), 80),
        ]
        for vendor, box_type, date, allotment in override_configs:
            _, created = DailyKickOverride.objects.get_or_create(
                tenant=t, vendor=vendor, box_type=box_type, date=date,
                defaults={'allotment': allotment}
            )
            if created:
                dko_count += 1

        self.stdout.write(f'  Created {dko_count} daily kick overrides')
        self.counts['delivery_runs'] = len(runs)
        self.counts['scheduler_notes'] = note_count
        self.counts['priority_entries'] = plp_count

    # ------------------------------------------------------------------
    # PHASE 16: Journal Entries
    # ------------------------------------------------------------------

    def _phase_16_journal_entries(self):
        self.stdout.write('\n[Phase 16] Journal Entries')
        t = self.tenant
        today = self.today

        # Fiscal period
        month_start = today.replace(day=1)
        if today.month == 12:
            month_end = today.replace(year=today.year + 1, month=1, day=1) - timedelta(days=1)
        else:
            month_end = today.replace(month=today.month + 1, day=1) - timedelta(days=1)

        fp, _ = FiscalPeriod.objects.get_or_create(
            tenant=t, start_date=month_start, end_date=month_end,
            defaults={
                'name': f'Demo {today.strftime("%B %Y")}',
                'status': 'open',
                'is_year_end': False,
            }
        )

        def get_acct(code):
            return Account.objects.get(tenant=t, code=code)

        je_configs = [
            # (entry_num, entry_type, status, days_ago, memo, lines[(acct_code, desc, dr, cr)])
            ('DEMO-JE-001', 'standard', 'draft', 3,
             'Office supplies purchase',
             [('6510', 'Office supplies', Decimal('250.00'), Decimal('0')),
              ('1020', 'Cash payment', Decimal('0'), Decimal('250.00'))]),
            ('DEMO-JE-002', 'standard', 'posted', 10,
             'Customer payment received - Metro Markets',
             [('1020', 'Cash receipt', Decimal('5000.00'), Decimal('0')),
              ('1110', 'AR reduction', Decimal('0'), Decimal('5000.00'))]),
            ('DEMO-JE-003', 'standard', 'posted', 15,
             'Vendor bill payment - Acme Corrugated',
             [('2010', 'AP reduction', Decimal('3200.00'), Decimal('0')),
              ('1020', 'Cash payment', Decimal('0'), Decimal('3200.00'))]),
        ]

        je_count = 0
        for je_num, entry_type, status, days_ago, memo, lines in je_configs:
            if JournalEntry.objects.filter(tenant=t, entry_number=je_num).exists():
                self.stdout.write(f'  Exists: {je_num}')
                continue

            je = JournalEntry.objects.create(
                tenant=t,
                entry_number=je_num,
                date=today - timedelta(days=days_ago),
                memo=memo,
                entry_type=entry_type,
                status=status,
                fiscal_period=fp,
                posted_at=timezone.now() if status == 'posted' else None,
            )

            for i, (acct_code, desc, debit, credit) in enumerate(lines, 1):
                JournalEntryLine.objects.create(
                    tenant=t, entry=je,
                    line_number=i * 10,
                    account=get_acct(acct_code),
                    description=desc,
                    debit=debit, credit=credit,
                )

            je_count += 1
            self.stdout.write(self.style.SUCCESS(f'  Created: {je_num} ({status})'))

        self.counts['journal_entries'] = je_count

    # ------------------------------------------------------------------
    # SUMMARY
    # ------------------------------------------------------------------

    def _print_summary(self):
        self.stdout.write('\n' + '=' * 60)
        self.stdout.write(self.style.SUCCESS('DEMO DATA SEEDING COMPLETE'))
        self.stdout.write('=' * 60)

        summary_items = [
            ('Customers', 'customers'),
            ('Vendors', 'vendors'),
            ('Trucks', 'trucks'),
            ('Bins', 'bins'),
            ('Items', 'items'),
            ('Item-Vendor links', 'item_vendors'),
            ('Price Lists', 'price_lists'),
            ('Cost Lists', 'cost_lists'),
            ('Estimates', 'estimates'),
            ('Contracts', 'contracts'),
            ('RFQs', 'rfqs'),
            ('Purchase Orders', 'purchase_orders'),
            ('Sales Orders', 'sales_orders'),
            ('Lots', 'lots'),
            ('Stock Quants', 'stock_quants'),
            ('Shipments', 'shipments'),
            ('Bills of Lading', 'bols'),
            ('Invoices', 'invoices'),
            ('Payments', 'payments'),
            ('Vendor Bills', 'vendor_bills'),
            ('Bill Payments', 'bill_payments'),
            ('Design Requests', 'design_requests'),
            ('Delivery Runs', 'delivery_runs'),
            ('Scheduler Notes', 'scheduler_notes'),
            ('Priority Entries', 'priority_entries'),
            ('Journal Entries', 'journal_entries'),
        ]

        for label, key in summary_items:
            count = self.counts.get(key, 0)
            if count:
                self.stdout.write(f'  {label:.<30} {count}')

        self.stdout.write('')
