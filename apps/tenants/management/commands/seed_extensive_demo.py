# apps/tenants/management/commands/seed_extensive_demo.py
"""
Extensive demo data seeder for thorough testing.

Builds on top of seed_full_demo data, adding large volumes of realistic
records across all modules. Run AFTER seed_full_demo.

Usage:
    python manage.py seed_extensive_demo
    python manage.py seed_extensive_demo --clear
"""
import random
from datetime import time, timedelta
from decimal import Decimal

from django.core.management.base import BaseCommand
from django.db import transaction
from django.utils import timezone

from apps.accounting.models import (
    Account,
    FiscalPeriod,
    JournalEntry,
    JournalEntryLine,
)
from apps.contracts.models import Contract, ContractLine, ContractRelease
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
from apps.scheduling.models import DeliveryRun, SchedulerNote
from apps.tenants.models import Tenant
from shared.managers import set_current_tenant


# ---------------------------------------------------------------------------
# Static data definitions
# ---------------------------------------------------------------------------

# 25 new customers: (code, display_name, legal_name, city, state, zip, customer_type, payment_terms)
CUSTOMERS = [
    ('ALPHAPZ', 'Alpha Pizza Supply', 'Alpha Pizza Supply Inc.', 'Brooklyn', 'NY', '11201', 'PIZZA', 'NET30'),
    ('BELLAVTA', 'Bella Vita Foods', 'Bella Vita Foods LLC', 'Newark', 'NJ', '07102', 'FOOD', 'NET30'),
    ('BRIGHTN', 'Brightner Beauty Co', 'Brightner Beauty Corporation', 'Los Angeles', 'CA', '90015', 'BEAUTY_HEALTH', 'NET45'),
    ('CROWNMFG', 'Crown Manufacturing', 'Crown Manufacturing Inc.', 'Detroit', 'MI', '48201', 'INDUSTRIAL', 'NET60'),
    ('DAILYGR', 'Daily Grocers', 'Daily Grocers Holdings LLC', 'Houston', 'TX', '77001', 'FOOD', 'NET30'),
    ('EVERGRN', 'Evergreen Markets', 'Evergreen Markets Corp.', 'Portland', 'OR', '97201', 'FOOD', 'NET30'),
    ('FORTIND', 'Fortress Industrial', 'Fortress Industrial Supply Inc.', 'Pittsburgh', 'PA', '15201', 'INDUSTRIAL', 'NET45'),
    ('GOLDREST', 'Gold Coast Restaurant Group', 'Gold Coast Restaurant Group LLC', 'Miami', 'FL', '33101', 'HOSPITALITY', 'NET15'),
    ('HARBOR', 'Harbor Health Products', 'Harbor Health Products Inc.', 'San Francisco', 'CA', '94102', 'BEAUTY_HEALTH', 'NET30'),
    ('IRONWKS', 'Ironworks Supply Co', 'Ironworks Supply Co. LLC', 'Cleveland', 'OH', '44101', 'INDUSTRIAL', 'NET60'),
    ('JUBILEE', 'Jubilee Bakery', 'Jubilee Bakery Inc.', 'Nashville', 'TN', '37201', 'FOOD', 'NET15'),
    ('KEYSTONE', 'Keystone Retail Group', 'Keystone Retail Holdings LLC', 'Philadelphia', 'PA', '19102', 'RETAIL', 'NET45'),
    ('LUMINA', 'Lumina Cosmetics', 'Lumina Cosmetics International Inc.', 'New York', 'NY', '10018', 'BEAUTY_HEALTH', 'NET30'),
    ('MERIDIAN', 'Meridian Foods', 'Meridian Foods Distribution LLC', 'Charlotte', 'NC', '28201', 'FOOD', 'NET30'),
    ('NEXGEN', 'NexGen Automotive', 'NexGen Automotive Parts Inc.', 'Indianapolis', 'IN', '46201', 'AUTOMOTIVE', 'NET45'),
    ('OAKHILL', 'Oakhill Grocery', 'Oakhill Grocery Corporation', 'Austin', 'TX', '78701', 'FOOD', 'NET30'),
    ('PINECRT', 'Pine Crest Pizza', 'Pine Crest Pizza Enterprises LLC', 'Chicago', 'IL', '60601', 'PIZZA', 'NET15'),
    ('QUICKSRV', 'QuickServe Restaurants', 'QuickServe Restaurant Holdings Inc.', 'Las Vegas', 'NV', '89101', 'HOSPITALITY', 'NET30'),
    ('REDCEDAR', 'Red Cedar Wholesale', 'Red Cedar Wholesale Distribution LLC', 'Milwaukee', 'WI', '53201', 'WHOLESALE', 'NET45'),
    ('SUMMIT', 'Summit Pharma', 'Summit Pharmaceutical Corp.', 'Raleigh', 'NC', '27601', 'PHARMACEUTICAL', 'NET60'),
    ('TRITON', 'Triton Manufacturing', 'Triton Manufacturing Inc.', 'Kansas City', 'MO', '64101', 'MANUFACTURER', 'NET45'),
    ('UNITEX', 'United Textiles', 'United Textiles Group LLC', 'Greenville', 'SC', '29601', 'TEXTILE', 'NET30'),
    ('VENTURE', 'Venture Janitorial', 'Venture Janitorial Supply Inc.', 'Tampa', 'FL', '33601', 'JANITORIAL', 'NET30'),
    ('WESTPAK', 'West Pacific Trading', 'West Pacific Trading Co. LLC', 'Sacramento', 'CA', '95814', 'WHOLESALE', 'NET45'),
    ('ZENITH', 'Zenith Construction', 'Zenith Construction Group Inc.', 'Denver', 'CO', '80202', 'CONSTRUCTION', 'NET60'),
]

# 10 new vendors: (code, display_name, legal_name, city, state, zip, vendor_type)
VENDORS = [
    ('CASCADE', 'Cascade Paper Mills', 'Cascade Paper Mills Inc.', 'Tacoma', 'WA', '98401', 'MANUFACTURER'),
    ('DOMINION', 'Dominion Board Corp', 'Dominion Board Corporation', 'Richmond', 'VA', '23219', 'MANUFACTURER'),
    ('ELITECON', 'Elite Containers', 'Elite Containers LLC', 'Charlotte', 'NC', '28202', 'SUPPLIER'),
    ('FIRSTPAK', 'First Choice Packaging', 'First Choice Packaging Inc.', 'Memphis', 'TN', '38103', 'DISTRIBUTOR'),
    ('GRANITE', 'Granite Box Mfg', 'Granite Box Manufacturing Inc.', 'Manchester', 'NH', '03101', 'MANUFACTURER'),
    ('HORIZON', 'Horizon Corrugated', 'Horizon Corrugated Supply LLC', 'Columbus', 'OH', '43215', 'SUPPLIER'),
    ('INTREPID', 'Intrepid Paper Co', 'Intrepid Paper Company Inc.', 'Portland', 'ME', '04101', 'MANUFACTURER'),
    ('JUPITER', 'Jupiter Packaging', 'Jupiter Packaging Solutions LLC', 'Birmingham', 'AL', '35203', 'DISTRIBUTOR'),
    ('KEYWEST', 'Key West Supplies', 'Key West Industrial Supplies Inc.', 'Savannah', 'GA', '31401', 'SUPPLIER'),
    ('LIBERTY', 'Liberty Wrap Co', 'Liberty Wrap Company LLC', 'Hartford', 'CT', '06103', 'SUPPLIER'),
]

# 15 RSC items: (sku, name, L, W, H, test, flute, paper, is_printed)
RSC_ITEMS = [
    ('RSC-0604', '6x4x4 Small Kraft RSC', Decimal('6'), Decimal('4'), Decimal('4'), 'ect29', 'e', 'k', False),
    ('RSC-0806', '8x6x6 Mailer RSC', Decimal('8'), Decimal('6'), Decimal('6'), 'ect32', 'b', 'k', False),
    ('RSC-1008', '10x8x6 Shipping RSC', Decimal('10'), Decimal('8'), Decimal('6'), 'ect32', 'c', 'k', False),
    ('RSC-1210', '12x10x10 Medium RSC', Decimal('12'), Decimal('10'), Decimal('10'), 'ect32', 'c', 'k', False),
    ('RSC-1412', '14x12x10 Printed RSC', Decimal('14'), Decimal('12'), Decimal('10'), 'ect32', 'b', 'mw', True),
    ('RSC-1614', '16x14x14 Heavy RSC', Decimal('16'), Decimal('14'), Decimal('14'), 'ect44', 'c', 'k', False),
    ('RSC-1816', '18x16x12 White RSC', Decimal('18'), Decimal('16'), Decimal('12'), 'ect44', 'c', 'mw', True),
    ('RSC-2016', '20x16x14 Printed RSC', Decimal('20'), Decimal('16'), Decimal('14'), 'ect44', 'b', 'mw', True),
    ('RSC-2218', '22x18x16 DW RSC', Decimal('22'), Decimal('18'), Decimal('16'), 'ect48', 'bc', 'k', False),
    ('RSC-2420', '24x20x18 Large RSC', Decimal('24'), Decimal('20'), Decimal('18'), 'ect48', 'bc', 'k', True),
    ('RSC-3020', '30x20x12 Flat RSC', Decimal('30'), Decimal('20'), Decimal('12'), 'ect44', 'c', 'k', False),
    ('RSC-3624', '36x24x18 XL RSC', Decimal('36'), Decimal('24'), Decimal('18'), 'ect48', 'bc', 'k', False),
    ('RSC-4024', '40x24x24 Jumbo RSC', Decimal('40'), Decimal('24'), Decimal('24'), 'ect51', 'bc', 'k', False),
    ('RSC-4430', '44x30x20 Oversize RSC', Decimal('44'), Decimal('30'), Decimal('20'), 'ect55', 'bc', 'k', False),
    ('RSC-4836', '48x36x24 Max RSC', Decimal('48'), Decimal('36'), Decimal('24'), 'ect55', 'bc', 'k', False),
]

# 10 DC items: (sku, name, L, W, test, flute, paper, is_printed)
DC_ITEMS = [
    ('DC-1010', '10x10 Small Pizza Box', Decimal('10'), Decimal('10'), 'ect32', 'e', 'mw', True),
    ('DC-1212', '12x12 Pizza Box', Decimal('12'), Decimal('12'), 'ect32', 'e', 'mw', True),
    ('DC-1414', '14x14 Pizza Box', Decimal('14'), Decimal('14'), 'ect32', 'e', 'mw', True),
    ('DC-1616', '16x16 Pizza Box', Decimal('16'), Decimal('16'), 'ect32', 'e', 'mw', True),
    ('DC-1818', '18x18 XL Pizza Box', Decimal('18'), Decimal('18'), 'ect32', 'e', 'mw', True),
    ('DC-2412', '24x12 Half Sheet Pad', Decimal('24'), Decimal('12'), 'ect29', 'b', 'k', False),
    ('DC-2416', '24x16 Full Tray', Decimal('24'), Decimal('16'), 'ect32', 'c', 'k', False),
    ('DC-2020', '20x20 Display Base', Decimal('20'), Decimal('20'), 'ect32', 'b', 'mw', True),
    ('DC-1206', '12x6 Insert Divider', Decimal('12'), Decimal('6'), 'ect29', 'e', 'k', False),
    ('DC-1510', '15x10 Bakery Box', Decimal('15'), Decimal('10'), 'ect32', 'b', 'mw', True),
]

# 15 packaging/misc items: (sku, name, description, division)
PKG_ITEMS = [
    ('PKG-TAPE2', '2" Carton Sealing Tape', '2" x 110yd clear carton sealing tape, 36 rolls/cs', 'packaging'),
    ('PKG-TAPE3', '3" Reinforced Tape', '3" x 375ft water-activated reinforced tape', 'packaging'),
    ('PKG-WRAP18', '18" Stretch Wrap', '18" x 1500ft 80ga stretch wrap, 4 rolls/cs', 'packaging'),
    ('PKG-WRAP20', '20" Machine Wrap', '20" x 5000ft 80ga machine stretch film', 'packaging'),
    ('PKG-EDGE48', '2x2x48 Edge Protector', '2" x 2" x 48" medium duty edge protectors', 'packaging'),
    ('PKG-EDGE36', '2x2x36 Edge Protector', '2" x 2" x 36" light duty edge protectors', 'packaging'),
    ('PKG-FOAM1', '1/8" Foam Roll', '1/8" x 72" x 550ft polyethylene foam roll', 'packaging'),
    ('PKG-LABEL', '4x6 Shipping Labels', '4" x 6" direct thermal shipping labels, 250/roll', 'packaging'),
    ('PKG-PALLET', '48x40 GMA Pallet', '48" x 40" 4-way entry GMA hardwood pallet', 'packaging'),
    ('PKG-DIVIDER', 'Corrugated Dividers', '12-cell corrugated divider set for standard RSC', 'packaging'),
    ('PKG-CORNER', 'Corner Board 3x3x36', '3" x 3" x 36" heavy duty corner boards', 'packaging'),
    ('PKG-DESIC', 'Desiccant Packets', '1oz silica gel desiccant packets, 300/cs', 'packaging'),
    ('PKG-VOID', 'Void Fill Paper', 'Fanfold 15" x 11" void fill paper, 500 sheets', 'packaging'),
    ('JAN-LINER', '40x48 Trash Liner', '40" x 48" 1.5mil black trash liner, 100/cs', 'janitorial'),
    ('MSC-STRAP', 'Poly Strapping', '1/2" x 7200ft polypropylene strapping', 'misc'),
]

# Street templates for realistic addresses
STREETS_SHIP = [
    '1200 Commerce Parkway', '3500 Distribution Drive', '780 Warehouse Lane',
    '4100 Industrial Boulevard', '2250 Logistics Way', '560 Terminal Road',
    '1899 Freight Circle', '6700 Shipping Dock Ave', '3201 Cargo Street',
    '955 Loading Bay Drive', '4450 Transport Blvd', '120 Factory Row',
    '8800 Enterprise Way', '2100 Supply Chain Ave', '1670 Port Access Road',
]
STREETS_BILL = [
    '100 Corporate Drive', '2500 Executive Blvd', '450 Finance Plaza',
    '800 Headquarters Lane', '1350 Business Park Way', '670 Admin Circle',
    '2200 Main Street', '3100 Center Avenue', '175 Office Tower Dr',
    '940 Accounting Row', '500 Payables Lane', '1800 Commerce St',
    '3300 Professional Blvd', '700 Legal Way', '420 Treasury Ave',
]
STREETS_WH = [
    '900 Mill Road', '5500 Manufacturing Drive', '2800 Plant Avenue',
    '1100 Production Lane', '4200 Assembly Blvd', '320 Paper Mill Way',
    '6100 Factory Drive', '1500 Board Avenue', '750 Corrugated Court',
    '3700 Supply Road',
]


class Command(BaseCommand):
    help = 'Seed extensive demo data for thorough testing (run after seed_full_demo)'

    def add_arguments(self, parser):
        parser.add_argument(
            '--clear',
            action='store_true',
            help='Clear extensive demo data first',
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

        # Seed random for reproducible data
        random.seed(42)

        self.stdout.write(f'\nSeeding extensive demo data for tenant: {tenant.name}')
        self.stdout.write('=' * 60)

        if options['clear']:
            self._clear()

        self._seed_parties()
        self._seed_items()
        self._seed_pricing()
        self._seed_estimates()
        self._seed_rfqs()
        self._seed_contracts()
        self._seed_purchase_orders()
        self._seed_sales_orders()
        self._seed_invoices()
        self._seed_vendor_bills()
        self._seed_design_requests()
        self._seed_journal_entries()
        self._seed_scheduling()

        self._print_summary()
        self.stdout.write(self.style.SUCCESS('\nExtensive demo data seeded successfully!'))

    # ------------------------------------------------------------------
    # CLEAR
    # ------------------------------------------------------------------

    def _clear(self):
        """Delete extensive demo data in reverse dependency order."""
        t = self.tenant
        self.stdout.write(self.style.WARNING('\nClearing extensive demo data...'))

        # Journal entries (EXT-JE prefix)
        d, _ = JournalEntry.objects.filter(
            tenant=t, entry_number__startswith='EXT-JE-'
        ).delete()
        self.stdout.write(f'  Deleted JournalEntry cascade: {d}')

        # Scheduler notes / delivery runs
        SchedulerNote.objects.filter(
            tenant=t, content__startswith='[EXT]'
        ).delete()
        DeliveryRun.objects.filter(
            tenant=t, name__startswith='Ext '
        ).delete()
        self.stdout.write('  Deleted scheduling records')

        # Design requests
        DesignRequest.objects.filter(
            tenant=t, ident__startswith='EXT-DR-'
        ).delete()

        # Payments first, then invoices / bills
        Payment.objects.filter(
            tenant=t, invoice__invoice_number__startswith='INV-1'
        ).delete()
        Invoice.objects.filter(
            tenant=t, invoice_number__startswith='INV-1'
        ).delete()

        BillPayment.objects.filter(
            tenant=t, bill__bill_number__startswith='BILL-1'
        ).delete()
        VendorBill.objects.filter(
            tenant=t, bill_number__startswith='BILL-1'
        ).delete()

        # Contract releases for EXT contracts
        ContractRelease.objects.filter(
            tenant=t,
            contract_line__contract__contract_number__startswith='CTR-1'
        ).delete()

        # Orders
        SalesOrder.objects.filter(
            tenant=t, order_number__startswith='SO-1'
        ).delete()
        PurchaseOrder.objects.filter(
            tenant=t, po_number__startswith='PO-1'
        ).delete()
        RFQ.objects.filter(
            tenant=t, rfq_number__startswith='RFQ-1'
        ).delete()
        Estimate.objects.filter(
            tenant=t, estimate_number__startswith='EST-1'
        ).delete()
        Contract.objects.filter(
            tenant=t, contract_number__startswith='CTR-1'
        ).delete()

        # Pricing for our items
        for sku_prefix in ['RSC-', 'DC-', 'PKG-', 'JAN-', 'MSC-']:
            PriceListHead.objects.filter(
                tenant=t, item__sku__startswith=sku_prefix
            ).delete()

        # Items (not starting with DEMO-)
        for sku_prefix in ['RSC-', 'DC-', 'PKG-', 'JAN-', 'MSC-']:
            Item.objects.filter(tenant=t, sku__startswith=sku_prefix).delete()

        # Parties (our new codes)
        for code, *_ in CUSTOMERS:
            Party.objects.filter(tenant=t, code=code).delete()
        for code, *_ in VENDORS:
            Party.objects.filter(tenant=t, code=code).delete()

        self.stdout.write(self.style.SUCCESS('  Clear complete.\n'))

    # ------------------------------------------------------------------
    # PARTIES
    # ------------------------------------------------------------------

    def _seed_parties(self):
        self.stdout.write('\n[1/13] Parties: 25 Customers + 10 Vendors')
        t = self.tenant

        # --- Customers ---
        self.new_customers = []
        for i, (code, display, legal, city, state, zipcode, cust_type, terms) in enumerate(CUSTOMERS):
            party, p_created = Party.objects.get_or_create(
                tenant=t, code=code,
                defaults={
                    'party_type': 'CUSTOMER',
                    'display_name': display,
                    'legal_name': legal,
                    'is_active': True,
                    'main_phone': f'({random.randint(200,999)}) {random.randint(200,999)}-{random.randint(1000,9999)}',
                    'main_email': f'orders@{code.lower()}.com',
                }
            )

            # SHIP_TO default
            ship_to, _ = Location.objects.get_or_create(
                tenant=t, party=party, location_type='SHIP_TO', is_default=True,
                defaults={
                    'name': f'{display} - Main Dock',
                    'code': f'{code}-SHIP',
                    'address_line1': STREETS_SHIP[i % len(STREETS_SHIP)],
                    'city': city, 'state': state, 'postal_code': zipcode,
                    'country': 'USA', 'is_active': True,
                    'loading_dock_hours': 'M-F 7am-4pm',
                }
            )

            # BILL_TO
            bill_to, _ = Location.objects.get_or_create(
                tenant=t, party=party, location_type='BILL_TO',
                defaults={
                    'name': f'{display} - Accounts Payable',
                    'code': f'{code}-BILL',
                    'address_line1': STREETS_BILL[i % len(STREETS_BILL)],
                    'city': city, 'state': state, 'postal_code': zipcode,
                    'country': 'USA', 'is_active': True,
                }
            )

            # Second SHIP_TO for variety
            second_cities = [
                ('Secaucus', 'NJ', '07094'), ('Carlstadt', 'NJ', '07072'),
                ('Ontario', 'CA', '91761'), ('Warren', 'MI', '48089'),
                ('Katy', 'TX', '77449'), ('Tigard', 'OR', '97223'),
                ('Cranberry Twp', 'PA', '16066'), ('Doral', 'FL', '33166'),
                ('South San Francisco', 'CA', '94080'), ('Solon', 'OH', '44139'),
                ('La Vergne', 'TN', '37086'), ('King of Prussia', 'PA', '19406'),
                ('Long Island City', 'NY', '11101'), ('Concord', 'NC', '28027'),
                ('Plainfield', 'IN', '46168'), ('Round Rock', 'TX', '78664'),
                ('Elk Grove Village', 'IL', '60007'), ('Henderson', 'NV', '89011'),
                ('Waukesha', 'WI', '53186'), ('Morrisville', 'NC', '27560'),
                ('Lenexa', 'KS', '66215'), ('Mauldin', 'SC', '29662'),
                ('Brandon', 'FL', '33511'), ('West Sacramento', 'CA', '95691'),
                ('Aurora', 'CO', '80011'),
            ]
            sc = second_cities[i]
            Location.objects.get_or_create(
                tenant=t, party=party, code=f'{code}-SHIP2',
                defaults={
                    'name': f'{display} - Warehouse 2',
                    'location_type': 'SHIP_TO',
                    'address_line1': f'{2000 + i * 100} Commerce Blvd',
                    'city': sc[0], 'state': sc[1], 'postal_code': sc[2],
                    'country': 'USA', 'is_active': True, 'is_default': False,
                    'loading_dock_hours': 'M-F 8am-3pm',
                }
            )

            customer, _ = Customer.objects.get_or_create(
                tenant=t, party=party,
                defaults={
                    'payment_terms': terms,
                    'default_ship_to': ship_to,
                    'default_bill_to': bill_to,
                    'customer_type': cust_type,
                    'credit_limit': Decimal(str(random.choice([5000, 10000, 25000, 50000, 100000]))),
                }
            )
            status = 'Created' if p_created else 'Exists'
            self.stdout.write(f'  Customer {status}: {display}')
            self.new_customers.append(customer)

        # --- Vendors ---
        self.new_vendors = []
        for i, (code, display, legal, city, state, zipcode, v_type) in enumerate(VENDORS):
            party, p_created = Party.objects.get_or_create(
                tenant=t, code=code,
                defaults={
                    'party_type': 'VENDOR',
                    'display_name': display,
                    'legal_name': legal,
                    'is_active': True,
                    'main_phone': f'({random.randint(200,999)}) {random.randint(200,999)}-{random.randint(1000,9999)}',
                    'main_email': f'sales@{code.lower()}.com',
                }
            )

            wh_loc, _ = Location.objects.get_or_create(
                tenant=t, party=party, location_type='WAREHOUSE', is_default=True,
                defaults={
                    'name': f'{display} - Plant',
                    'code': f'{code}-WH',
                    'address_line1': STREETS_WH[i % len(STREETS_WH)],
                    'city': city, 'state': state, 'postal_code': zipcode,
                    'country': 'USA', 'is_active': True,
                }
            )

            # Second location
            Location.objects.get_or_create(
                tenant=t, party=party, code=f'{code}-OFFICE',
                defaults={
                    'name': f'{display} - Sales Office',
                    'location_type': 'OFFICE',
                    'address_line1': f'{300 + i * 50} Corporate Park',
                    'city': city, 'state': state, 'postal_code': zipcode,
                    'country': 'USA', 'is_active': True, 'is_default': False,
                }
            )

            vendor, _ = Vendor.objects.get_or_create(
                tenant=t, party=party,
                defaults={
                    'payment_terms': random.choice(['NET30', 'NET30', 'NET45']),
                    'default_ship_from': wh_loc,
                    'vendor_type': v_type,
                }
            )
            status = 'Created' if p_created else 'Exists'
            self.stdout.write(f'  Vendor {status}: {display}')
            self.new_vendors.append(vendor)

        self.counts['customers'] = len(self.new_customers)
        self.counts['vendors'] = len(self.new_vendors)

    # ------------------------------------------------------------------
    # ITEMS
    # ------------------------------------------------------------------

    def _seed_items(self):
        self.stdout.write('\n[2/13] Items: 15 RSC + 10 DC + 15 Packaging')
        t = self.tenant

        ea_uom = UnitOfMeasure.objects.get(tenant=t, code='ea')

        self.rsc_items = []
        for sku, name, l, w, h, test, flute, paper, is_printed in RSC_ITEMS:
            item, created = RSCItem.objects.get_or_create(
                tenant=t, sku=sku,
                defaults={
                    'name': name,
                    'description': f'{name} - {test.upper()} {flute.upper()}-flute {paper.upper()}',
                    'division': 'corrugated',
                    'base_uom': ea_uom,
                    'is_inventory': True,
                    'is_active': True,
                    'length': l, 'width': w, 'height': h,
                    'test': test, 'flute': flute, 'paper': paper,
                    'is_printed': is_printed,
                }
            )
            self.stdout.write(f'  {"Created" if created else "Exists"}: {sku}')
            self.rsc_items.append(item)

        self.dc_items = []
        for sku, name, l, w, test, flute, paper, is_printed in DC_ITEMS:
            item, created = DCItem.objects.get_or_create(
                tenant=t, sku=sku,
                defaults={
                    'name': name,
                    'description': f'{name} - {test.upper()} {flute.upper()}-flute',
                    'division': 'corrugated',
                    'base_uom': ea_uom,
                    'is_inventory': True,
                    'is_active': True,
                    'length': l, 'width': w,
                    'test': test, 'flute': flute, 'paper': paper,
                    'is_printed': is_printed,
                }
            )
            self.stdout.write(f'  {"Created" if created else "Exists"}: {sku}')
            self.dc_items.append(item)

        self.pkg_items = []
        for sku, name, desc, division in PKG_ITEMS:
            item, created = Item.objects.get_or_create(
                tenant=t, sku=sku,
                defaults={
                    'name': name,
                    'description': desc,
                    'division': division,
                    'base_uom': ea_uom,
                    'is_inventory': True,
                    'is_active': True,
                }
            )
            self.stdout.write(f'  {"Created" if created else "Exists"}: {sku}')
            self.pkg_items.append(item)

        self.all_items = self.rsc_items + self.dc_items + self.pkg_items
        self.counts['items'] = len(self.all_items)

    # ------------------------------------------------------------------
    # PRICING
    # ------------------------------------------------------------------

    def _seed_pricing(self):
        self.stdout.write('\n[3/13] Price Lists')
        t = self.tenant
        today = self.today
        begin = today - timedelta(days=90)
        end = today + timedelta(days=270)

        pl_count = 0
        # Give each customer 3-5 price lists for different items
        for c_idx, cust in enumerate(self.new_customers):
            # Pick 3-5 items for this customer
            num_items = 3 + (c_idx % 3)  # 3, 4, or 5
            item_pool = self.rsc_items + self.dc_items
            start_idx = (c_idx * 3) % len(item_pool)
            selected_items = []
            for j in range(num_items):
                selected_items.append(item_pool[(start_idx + j) % len(item_pool)])

            for item in selected_items:
                plh, created = PriceListHead.objects.get_or_create(
                    tenant=t, customer=cust, item=item, begin_date=begin,
                    defaults={
                        'end_date': end,
                        'is_active': True,
                        'notes': f'Price list for {cust.party.display_name} - {item.name}',
                    }
                )
                if created:
                    pl_count += 1
                    # Base price varies by item size
                    base = Decimal('0.35') + (item.length or Decimal('10')) * Decimal('0.05')
                    base = base.quantize(Decimal('0.01'))

                    # 2-3 quantity breaks
                    PriceListLine.objects.create(
                        tenant=t, price_list=plh,
                        min_quantity=1, unit_price=base,
                    )
                    PriceListLine.objects.create(
                        tenant=t, price_list=plh,
                        min_quantity=500,
                        unit_price=(base * Decimal('0.88')).quantize(Decimal('0.0001')),
                    )
                    if num_items >= 4:
                        PriceListLine.objects.create(
                            tenant=t, price_list=plh,
                            min_quantity=2000,
                            unit_price=(base * Decimal('0.78')).quantize(Decimal('0.0001')),
                        )

        self.stdout.write(f'  Created {pl_count} price lists')
        self.counts['price_lists'] = pl_count

    # ------------------------------------------------------------------
    # ESTIMATES
    # ------------------------------------------------------------------

    def _seed_estimates(self):
        self.stdout.write('\n[4/13] Estimates (15)')
        t = self.tenant
        today = self.today
        ea_uom = UnitOfMeasure.objects.get(tenant=t, code='ea')

        est_statuses = [
            'draft', 'draft', 'draft', 'draft',
            'sent', 'sent', 'sent',
            'accepted', 'accepted', 'accepted',
            'rejected', 'rejected',
            'converted', 'converted', 'converted',
        ]

        self.estimates = []
        est_count = 0
        for i in range(15):
            est_num = f'EST-{10000 + i}'
            if Estimate.objects.filter(tenant=t, estimate_number=est_num).exists():
                est = Estimate.objects.get(tenant=t, estimate_number=est_num)
                self.estimates.append(est)
                self.stdout.write(f'  Exists: {est_num}')
                continue

            cust = self.new_customers[i % len(self.new_customers)]
            ship_to = cust.default_ship_to or Location.objects.filter(
                tenant=t, party=cust.party, location_type='SHIP_TO'
            ).first() or Location.objects.filter(tenant=t, party=cust.party).first()
            if not ship_to:
                ship_to = Location.objects.create(
                    tenant=t, party=cust.party, location_type='SHIP_TO',
                    name='Main', code=f'{cust.party.code}-MAIN',
                    address_line1='100 Main St', city='Anytown', state='TX', postal_code='75001',
                )
            bill_to = cust.default_bill_to or Location.objects.filter(
                tenant=t, party=cust.party, location_type='BILL_TO'
            ).first() or ship_to
            status = est_statuses[i]
            days_ago = 5 + i * 3

            # 2-4 lines per estimate
            num_lines = 2 + (i % 3)
            lines = []
            for j in range(num_lines):
                item = self.all_items[(i * 3 + j) % len(self.all_items)]
                qty = random.choice([100, 200, 300, 500, 750, 1000, 1500, 2000])
                price = (Decimal('0.40') + Decimal(str(random.randint(10, 300))) / Decimal('100')).quantize(Decimal('0.01'))
                lines.append((item, qty, price))

            subtotal = sum(Decimal(str(qty)) * price for _, qty, price in lines)
            tax_amt = (subtotal * Decimal('0.07')).quantize(Decimal('0.01'))

            est = Estimate.objects.create(
                tenant=t,
                estimate_number=est_num,
                customer=cust,
                date=today - timedelta(days=days_ago),
                expiration_date=today + timedelta(days=60 - days_ago),
                status=status,
                ship_to=ship_to,
                bill_to=bill_to,
                subtotal=subtotal,
                tax_rate=Decimal('0.0700'),
                tax_amount=tax_amt,
                total_amount=subtotal + tax_amt,
                notes=f'Estimate for {cust.party.display_name}',
            )
            for ln, (item, qty, price) in enumerate(lines, 1):
                EstimateLine.objects.create(
                    tenant=t, estimate=est,
                    line_number=ln * 10, item=item,
                    description=item.name,
                    quantity=qty, uom=ea_uom, unit_price=price,
                )
            self.estimates.append(est)
            est_count += 1
            self.stdout.write(self.style.SUCCESS(f'  Created: {est_num} ({status})'))

        self.counts['estimates'] = est_count

    # ------------------------------------------------------------------
    # RFQs
    # ------------------------------------------------------------------

    def _seed_rfqs(self):
        self.stdout.write('\n[5/13] RFQs (10)')
        t = self.tenant
        today = self.today
        ea_uom = UnitOfMeasure.objects.get(tenant=t, code='ea')

        # Get our warehouse location for ship_to
        wh_location = Location.objects.filter(
            tenant=t, party__code='OUR-WH'
        ).first()
        if not wh_location:
            wh_location = Location.objects.filter(
                tenant=t, location_type='WAREHOUSE'
            ).first()

        rfq_statuses = [
            'draft', 'draft', 'draft',
            'sent', 'sent', 'sent',
            'received', 'received',
            'converted', 'cancelled',
        ]

        rfq_count = 0
        for i in range(10):
            rfq_num = f'RFQ-{10000 + i}'
            if RFQ.objects.filter(tenant=t, rfq_number=rfq_num).exists():
                self.stdout.write(f'  Exists: {rfq_num}')
                continue

            vendor = self.new_vendors[i % len(self.new_vendors)]
            status = rfq_statuses[i]
            days_ago = 3 + i * 4

            rfq = RFQ.objects.create(
                tenant=t,
                rfq_number=rfq_num,
                vendor=vendor,
                date=today - timedelta(days=days_ago),
                expected_date=today + timedelta(days=21 - days_ago),
                status=status,
                ship_to=wh_location,
                notes=f'RFQ to {vendor.party.display_name}',
            )

            num_lines = 2 + (i % 2)  # 2-3 lines
            for j in range(num_lines):
                item = self.all_items[(i * 2 + j) % len(self.all_items)]
                qty = random.choice([500, 1000, 2000, 3000, 5000])
                target = (Decimal('0.25') + Decimal(str(random.randint(5, 150))) / Decimal('100')).quantize(Decimal('0.0001'))
                quoted = None
                if status in ('received', 'converted'):
                    quoted = (target * Decimal('0.95')).quantize(Decimal('0.0001'))

                RFQLine.objects.create(
                    tenant=t, rfq=rfq,
                    line_number=(j + 1) * 10, item=item,
                    description=item.name,
                    quantity=qty, uom=ea_uom,
                    target_price=target, quoted_price=quoted,
                )
            rfq_count += 1
            self.stdout.write(self.style.SUCCESS(f'  Created: {rfq_num} ({status})'))

        self.counts['rfqs'] = rfq_count

    # ------------------------------------------------------------------
    # CONTRACTS
    # ------------------------------------------------------------------

    def _seed_contracts(self):
        self.stdout.write('\n[6/13] Contracts (8)')
        t = self.tenant
        today = self.today
        ea_uom = UnitOfMeasure.objects.get(tenant=t, code='ea')

        ctr_statuses = ['draft', 'draft', 'active', 'active', 'active', 'active', 'complete', 'complete']

        self.contracts = []
        ctr_count = 0
        for i in range(8):
            ctr_num = f'CTR-{10000 + i}'
            if Contract.objects.filter(tenant=t, contract_number=ctr_num).exists():
                ctr = Contract.objects.get(tenant=t, contract_number=ctr_num)
                self.contracts.append(ctr)
                self.stdout.write(f'  Exists: {ctr_num}')
                continue

            cust = self.new_customers[i * 3 % len(self.new_customers)]
            status = ctr_statuses[i]
            ship_to = cust.default_ship_to

            if status == 'complete':
                start_off = -365
                end_off = -30
            elif status == 'active':
                start_off = -90
                end_off = 275
            else:
                start_off = 0
                end_off = 365

            ctr = Contract.objects.create(
                tenant=t,
                customer=cust,
                contract_number=ctr_num,
                blanket_po=f'BPO-{cust.party.code}-{today.year}',
                status=status,
                issue_date=today + timedelta(days=start_off),
                start_date=today + timedelta(days=start_off),
                end_date=today + timedelta(days=end_off),
                ship_to=ship_to,
                notes=f'Blanket order for {cust.party.display_name}',
            )

            num_lines = 2 + (i % 4)  # 2-5 lines
            for j in range(num_lines):
                item = self.rsc_items[(i + j) % len(self.rsc_items)]
                blanket_qty = random.choice([5000, 8000, 10000, 15000, 20000, 30000])
                price = (Decimal('0.50') + Decimal(str(random.randint(10, 250))) / Decimal('100')).quantize(Decimal('0.0001'))

                ContractLine.objects.create(
                    tenant=t, contract=ctr,
                    line_number=(j + 1) * 10, item=item,
                    blanket_qty=blanket_qty, uom=ea_uom,
                    unit_price=price,
                )

            self.contracts.append(ctr)
            ctr_count += 1
            self.stdout.write(self.style.SUCCESS(f'  Created: {ctr_num} ({status})'))

        self.counts['contracts'] = ctr_count

    # ------------------------------------------------------------------
    # PURCHASE ORDERS
    # ------------------------------------------------------------------

    def _seed_purchase_orders(self):
        self.stdout.write('\n[7/13] Purchase Orders (40+)')
        t = self.tenant
        today = self.today
        ea_uom = UnitOfMeasure.objects.get(tenant=t, code='ea')

        wh_location = Location.objects.filter(
            tenant=t, party__code='OUR-WH'
        ).first()
        if not wh_location:
            wh_location = Location.objects.filter(
                tenant=t, location_type='WAREHOUSE'
            ).first()

        trucks = list(Truck.objects.filter(tenant=t, is_active=True)[:4])

        # Status distribution for 42 POs
        po_statuses = (
            ['draft'] * 10 +
            ['confirmed'] * 10 +
            ['scheduled'] * 8 +
            ['partially_received'] * 5 +
            ['shipped'] * 4 +
            ['complete'] * 3 +
            ['cancelled'] * 2
        )

        self.purchase_orders = []
        po_count = 0
        for i in range(42):
            po_num = f'PO-{10000 + i}'
            if PurchaseOrder.objects.filter(tenant=t, po_number=po_num).exists():
                po = PurchaseOrder.objects.get(tenant=t, po_number=po_num)
                self.purchase_orders.append(po)
                self.stdout.write(f'  Exists: {po_num}')
                continue

            vendor = self.new_vendors[i % len(self.new_vendors)]
            status = po_statuses[i]
            days_off = -random.randint(0, 80)
            priority = random.randint(1, 5)

            sched_date = None
            sched_truck = None
            if status == 'scheduled' and trucks:
                sched_date = today + timedelta(days=random.randint(1, 14))
                sched_truck = trucks[i % len(trucks)]

            po = PurchaseOrder.objects.create(
                tenant=t,
                vendor=vendor,
                po_number=po_num,
                order_date=today + timedelta(days=days_off),
                expected_date=today + timedelta(days=days_off + 14),
                ship_to=wh_location,
                status=status,
                priority=priority,
                scheduled_date=sched_date,
                scheduled_truck=sched_truck,
                notes=f'PO to {vendor.party.display_name}',
            )

            num_lines = 2 + (i % 3)  # 2-4 lines
            for j in range(num_lines):
                item = self.all_items[(i * 2 + j) % len(self.all_items)]
                qty = random.choice([200, 500, 800, 1000, 1500, 2000, 3000, 5000])
                cost = (Decimal('0.20') + Decimal(str(random.randint(5, 180))) / Decimal('100')).quantize(Decimal('0.0001'))

                PurchaseOrderLine.objects.create(
                    tenant=t, purchase_order=po,
                    line_number=(j + 1) * 10, item=item,
                    quantity_ordered=qty, uom=ea_uom, unit_cost=cost,
                    quantity_received=qty if status == 'complete' else (qty // 2 if status == 'partially_received' else 0),
                )

            self.purchase_orders.append(po)
            po_count += 1
            if po_count % 10 == 0 or po_count == 42:
                self.stdout.write(f'  Created {po_count} purchase orders...')

        self.stdout.write(self.style.SUCCESS(f'  Total created: {po_count} purchase orders'))
        self.counts['purchase_orders'] = po_count

    # ------------------------------------------------------------------
    # SALES ORDERS
    # ------------------------------------------------------------------

    def _seed_sales_orders(self):
        self.stdout.write('\n[8/13] Sales Orders (85)')
        t = self.tenant
        today = self.today
        ea_uom = UnitOfMeasure.objects.get(tenant=t, code='ea')

        trucks = list(Truck.objects.filter(tenant=t, is_active=True)[:4])

        # Combine old and new customers for breadth
        all_customers = list(Customer.objects.filter(tenant=t))

        # Status distribution for 85 SOs
        so_statuses = (
            ['draft'] * 25 +
            ['confirmed'] * 20 +
            ['scheduled'] * 15 +
            ['shipped'] * 10 +
            ['complete'] * 10 +
            ['cancelled'] * 5
        )

        self.sales_orders = []
        so_count = 0
        for i in range(85):
            so_num = f'SO-{10000 + i}'
            if SalesOrder.objects.filter(tenant=t, order_number=so_num).exists():
                so = SalesOrder.objects.get(tenant=t, order_number=so_num)
                self.sales_orders.append(so)
                self.stdout.write(f'  Exists: {so_num}')
                continue

            cust = all_customers[i % len(all_customers)]
            status = so_statuses[i]
            days_off = -random.randint(0, 90)
            priority = random.randint(1, 5)

            ship_to = cust.default_ship_to or Location.objects.filter(
                tenant=t, party=cust.party, location_type='SHIP_TO'
            ).first() or Location.objects.filter(tenant=t, party=cust.party).first()
            if not ship_to:
                ship_to = Location.objects.create(
                    tenant=t, party=cust.party, location_type='SHIP_TO',
                    name='Main', code=f'{cust.party.code}-MAIN',
                    address_line1='100 Main St', city='Anytown', state='TX', postal_code='75001',
                )
            bill_to = cust.default_bill_to or Location.objects.filter(
                tenant=t, party=cust.party, location_type='BILL_TO'
            ).first() or ship_to

            sched_date = None
            sched_truck = None
            if status == 'scheduled' and trucks:
                sched_date = today + timedelta(days=random.randint(1, 14))
                sched_truck = trucks[i % len(trucks)]

            so = SalesOrder.objects.create(
                tenant=t,
                customer=cust,
                order_number=so_num,
                order_date=today + timedelta(days=days_off),
                ship_to=ship_to,
                bill_to=bill_to,
                status=status,
                priority=priority,
                scheduled_date=sched_date,
                scheduled_truck=sched_truck,
                customer_po=f'CUSTPO-{10000 + i}',
                notes=f'Order for {cust.party.display_name}',
            )

            num_lines = 2 + (i % 4)  # 2-5 lines
            for j in range(num_lines):
                item = self.all_items[(i * 3 + j) % len(self.all_items)]
                qty = random.choice([50, 100, 200, 300, 500, 750, 1000, 1500, 2000, 3000, 5000])
                price = (Decimal('0.25') + Decimal(str(random.randint(10, 1200))) / Decimal('100')).quantize(Decimal('0.01'))

                SalesOrderLine.objects.create(
                    tenant=t, sales_order=so,
                    line_number=(j + 1) * 10, item=item,
                    quantity_ordered=qty, uom=ea_uom, unit_price=price,
                )

            self.sales_orders.append(so)
            so_count += 1
            if so_count % 20 == 0 or so_count == 85:
                self.stdout.write(f'  Created {so_count} sales orders...')

        # Contract releases for active contracts
        release_count = 0
        active_contracts = [c for c in self.contracts if c.status == 'active']
        for ctr in active_contracts:
            ctr_lines = list(ctr.lines.all())
            # Find a completed SO for this customer
            cust_sos = [so for so in self.sales_orders
                        if so.customer_id == ctr.customer_id
                        and so.status in ('complete', 'shipped')]
            for so in cust_sos[:2]:  # max 2 releases per contract
                so_lines = list(so.lines.all())
                for cl, sl in zip(ctr_lines[:len(so_lines)], so_lines[:len(ctr_lines)]):
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
                        release_count += 1

        if release_count:
            self.stdout.write(f'  Created {release_count} contract releases')

        self.stdout.write(self.style.SUCCESS(f'  Total created: {so_count} sales orders'))
        self.counts['sales_orders'] = so_count

    # ------------------------------------------------------------------
    # INVOICES
    # ------------------------------------------------------------------

    def _seed_invoices(self):
        self.stdout.write('\n[9/13] Invoices (30)')
        t = self.tenant
        today = self.today
        ea_uom = UnitOfMeasure.objects.get(tenant=t, code='ea')

        # Status distribution for 30 invoices:
        # 8 paid, 5 partial, 7 posted/sent, 5 overdue, 5 draft
        inv_statuses = (
            ['paid'] * 8 +
            ['partial'] * 5 +
            ['posted', 'posted', 'posted', 'sent', 'sent', 'sent', 'sent'] +
            ['overdue'] * 5 +
            ['draft'] * 5
        )

        all_customers = list(Customer.objects.filter(tenant=t))

        invoices = []
        inv_count = 0
        for i in range(30):
            inv_num = f'INV-{10000 + i}'
            if Invoice.objects.filter(tenant=t, invoice_number=inv_num).exists():
                inv = Invoice.objects.get(tenant=t, invoice_number=inv_num)
                invoices.append(inv)
                self.stdout.write(f'  Exists: {inv_num}')
                continue

            cust = all_customers[i % len(all_customers)]
            status = inv_statuses[i]
            days_ago = random.randint(5, 90)

            # Find a SO for this customer if possible
            linked_so = None
            cust_sos = SalesOrder.objects.filter(
                tenant=t, customer=cust,
                status__in=('shipped', 'complete'),
            ).exclude(
                invoices__isnull=False
            ).first()
            if cust_sos:
                linked_so = cust_sos

            # Generate line data for subtotal calc
            num_lines = 2 + (i % 3)  # 2-4 lines
            line_data = []
            for j in range(num_lines):
                item = self.all_items[(i * 2 + j) % len(self.all_items)]
                qty = random.choice([100, 200, 300, 500, 750, 1000])
                price = (Decimal('0.50') + Decimal(str(random.randint(10, 1200))) / Decimal('100')).quantize(Decimal('0.0001'))
                line_data.append((item, qty, price))

            subtotal = sum(Decimal(str(qty)) * price for _, qty, price in line_data)
            tax_amt = (subtotal * Decimal('0.07')).quantize(Decimal('0.01'))
            total = subtotal + tax_amt

            amount_paid = Decimal('0')
            if status == 'paid':
                amount_paid = total
            elif status == 'partial':
                amount_paid = (total * Decimal('0.50')).quantize(Decimal('0.01'))

            # Overdue invoices have past due dates
            if status == 'overdue':
                due_date = today - timedelta(days=random.randint(10, 60))
            else:
                due_date = today - timedelta(days=days_ago - 30)

            inv = Invoice(
                tenant=t,
                invoice_number=inv_num,
                customer=cust,
                sales_order=linked_so,
                invoice_date=today - timedelta(days=days_ago),
                due_date=due_date,
                payment_terms='NET30',
                status=status,
                bill_to_name=cust.party.display_name,
                bill_to_address=f'{cust.party.display_name}\n{cust.party.code} Billing Dept',
                ship_to_name=cust.party.display_name,
                subtotal=subtotal,
                tax_rate=Decimal('0.0700'),
                tax_amount=tax_amt,
                total_amount=total,
                amount_paid=amount_paid,
                customer_po=f'CUSTPO-{10000 + i}',
                notes=f'Invoice for {cust.party.display_name}',
            )
            inv.save()

            for ln, (item, qty, price) in enumerate(line_data, 1):
                InvoiceLine.objects.create(
                    tenant=t, invoice=inv,
                    line_number=ln * 10, item=item,
                    description=item.name,
                    quantity=qty, uom=ea_uom,
                    unit_price=price,
                )

            invoices.append(inv)
            inv_count += 1

        # Create Payments for paid/partial invoices
        pmt_count = 0
        for inv in invoices:
            if inv.status == 'paid' and inv.amount_paid > 0:
                if not Payment.objects.filter(tenant=t, invoice=inv).exists():
                    Payment.objects.create(
                        tenant=t, invoice=inv,
                        payment_date=today - timedelta(days=random.randint(1, 30)),
                        amount=inv.total_amount,
                        payment_method=random.choice(['ACH', 'CHECK', 'WIRE']),
                        reference_number=f'PMT-{inv.invoice_number}',
                        notes=f'Full payment for {inv.invoice_number}',
                    )
                    pmt_count += 1
            elif inv.status == 'partial' and inv.amount_paid > 0:
                if not Payment.objects.filter(tenant=t, invoice=inv).exists():
                    Payment.objects.create(
                        tenant=t, invoice=inv,
                        payment_date=today - timedelta(days=random.randint(5, 40)),
                        amount=inv.amount_paid,
                        payment_method=random.choice(['ACH', 'CHECK']),
                        reference_number=f'PMT-{inv.invoice_number}-P',
                        notes=f'Partial payment for {inv.invoice_number}',
                    )
                    pmt_count += 1

        self.stdout.write(self.style.SUCCESS(f'  Created: {inv_count} invoices, {pmt_count} payments'))
        self.counts['invoices'] = inv_count
        self.counts['payments'] = pmt_count

    # ------------------------------------------------------------------
    # VENDOR BILLS
    # ------------------------------------------------------------------

    def _seed_vendor_bills(self):
        self.stdout.write('\n[10/13] Vendor Bills (15)')
        t = self.tenant
        today = self.today

        bill_statuses = (
            ['draft'] * 4 +
            ['posted'] * 4 +
            ['partial'] * 3 +
            ['paid'] * 4
        )

        all_vendors = list(Vendor.objects.filter(tenant=t))

        bills = []
        bill_count = 0
        for i in range(15):
            bill_num = f'BILL-{10000 + i}'
            if VendorBill.objects.filter(tenant=t, bill_number=bill_num).exists():
                bill = VendorBill.objects.get(tenant=t, bill_number=bill_num)
                bills.append(bill)
                self.stdout.write(f'  Exists: {bill_num}')
                continue

            vendor = all_vendors[i % len(all_vendors)]
            status = bill_statuses[i]
            days_ago = random.randint(5, 60)

            # Find a linked PO if possible
            linked_po = PurchaseOrder.objects.filter(
                tenant=t, vendor=vendor,
                status__in=('complete', 'partially_received', 'shipped'),
            ).exclude(
                bills__isnull=False
            ).first()

            subtotal = Decimal(str(random.randint(500, 15000)))
            tax_amt = (subtotal * Decimal('0.05')).quantize(Decimal('0.01'))
            total = subtotal + tax_amt

            amount_paid = Decimal('0')
            if status == 'paid':
                amount_paid = total
            elif status == 'partial':
                amount_paid = (total * Decimal('0.40')).quantize(Decimal('0.01'))

            bill = VendorBill(
                tenant=t,
                vendor=vendor,
                purchase_order=linked_po,
                vendor_invoice_number=f'{vendor.party.code}-INV-{10000 + i}',
                bill_number=bill_num,
                bill_date=today - timedelta(days=days_ago),
                due_date=today - timedelta(days=days_ago - 30),
                status=status,
                subtotal=subtotal,
                tax_amount=tax_amt,
                total_amount=total,
                amount_paid=amount_paid,
                notes=f'Bill from {vendor.party.display_name}',
            )
            bill.save()

            # 2-3 bill lines
            num_lines = 2 + (i % 2)
            for j in range(num_lines):
                item = self.all_items[(i * 2 + j) % len(self.all_items)]
                qty = Decimal(str(random.choice([200, 500, 1000, 2000, 3000])))
                unit_price = (subtotal / Decimal(str(num_lines)) / qty).quantize(Decimal('0.0001'))

                VendorBillLine.objects.create(
                    tenant=t, bill=bill,
                    line_number=(j + 1) * 10, item=item,
                    description=item.name,
                    quantity=qty, unit_price=unit_price,
                )

            bills.append(bill)
            bill_count += 1

        # Bill Payments for paid/partial bills
        bp_count = 0
        for bill in bills:
            if bill.status == 'paid' and bill.amount_paid > 0:
                if not BillPayment.objects.filter(tenant=t, bill=bill).exists():
                    BillPayment.objects.create(
                        tenant=t, bill=bill,
                        payment_date=today - timedelta(days=random.randint(1, 20)),
                        amount=bill.total_amount,
                        payment_method=random.choice(['ACH', 'CHECK', 'WIRE']),
                        reference_number=f'BP-{bill.bill_number}',
                        notes=f'Full payment for {bill.bill_number}',
                    )
                    bp_count += 1
            elif bill.status == 'partial' and bill.amount_paid > 0:
                if not BillPayment.objects.filter(tenant=t, bill=bill).exists():
                    BillPayment.objects.create(
                        tenant=t, bill=bill,
                        payment_date=today - timedelta(days=random.randint(5, 30)),
                        amount=bill.amount_paid,
                        payment_method='CHECK',
                        reference_number=f'BP-{bill.bill_number}-P',
                        notes=f'Partial payment for {bill.bill_number}',
                    )
                    bp_count += 1

        self.stdout.write(self.style.SUCCESS(f'  Created: {bill_count} vendor bills, {bp_count} bill payments'))
        self.counts['vendor_bills'] = bill_count
        self.counts['bill_payments'] = bp_count

    # ------------------------------------------------------------------
    # DESIGN REQUESTS
    # ------------------------------------------------------------------

    def _seed_design_requests(self):
        self.stdout.write('\n[11/13] Design Requests (10)')
        t = self.tenant

        dr_configs = [
            # (ident, cust_idx, status, style, L, W, D, test, flute, paper)
            ('EXT-DR-001', 0, 'pending', 'RSC', Decimal('18'), Decimal('14'), Decimal('10'), 'ect32', 'c', 'k'),
            ('EXT-DR-002', 3, 'pending', 'DC', Decimal('14'), Decimal('14'), None, 'ect32', 'e', 'mw'),
            ('EXT-DR-003', 5, 'in_progress', 'RSC', Decimal('28'), Decimal('20'), Decimal('16'), 'ect48', 'bc', 'k'),
            ('EXT-DR-004', 8, 'in_progress', 'RSC', Decimal('12'), Decimal('10'), Decimal('8'), 'ect32', 'b', 'mw'),
            ('EXT-DR-005', 10, 'in_progress', 'DC', Decimal('16'), Decimal('16'), None, 'ect32', 'e', 'mw'),
            ('EXT-DR-006', 12, 'approved', 'RSC', Decimal('36'), Decimal('24'), Decimal('20'), 'ect51', 'bc', 'k'),
            ('EXT-DR-007', 15, 'approved', 'FOL', Decimal('10'), Decimal('8'), Decimal('4'), 'ect29', 'e', 'k'),
            ('EXT-DR-008', 18, 'completed', 'RSC', Decimal('24'), Decimal('18'), Decimal('12'), 'ect44', 'c', 'k'),
            ('EXT-DR-009', 20, 'completed', 'DC', Decimal('20'), Decimal('20'), None, 'ect32', 'b', 'mw'),
            ('EXT-DR-010', 22, 'rejected', 'RSC', Decimal('48'), Decimal('36'), Decimal('24'), 'ect55', 'bc', 'k'),
        ]

        dr_count = 0
        for ident, c_idx, status, style, l, w, d, test, flute, paper in dr_configs:
            if DesignRequest.objects.filter(tenant=t, ident=ident).exists():
                self.stdout.write(f'  Exists: {ident}')
                continue

            cust_party = self.new_customers[c_idx % len(self.new_customers)].party

            dr = DesignRequest(
                tenant=t,
                customer=cust_party,
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
                notes=f'Design request {ident} for {cust_party.display_name}',
            )
            dr.save()
            dr_count += 1
            self.stdout.write(self.style.SUCCESS(
                f'  Created: {dr.file_number} ({ident}, {status})'
            ))

        self.counts['design_requests'] = dr_count

    # ------------------------------------------------------------------
    # JOURNAL ENTRIES
    # ------------------------------------------------------------------

    def _seed_journal_entries(self):
        self.stdout.write('\n[12/13] Journal Entries (10)')
        t = self.tenant
        today = self.today

        # Get fiscal period
        month_start = today.replace(day=1)
        if today.month == 12:
            month_end = today.replace(year=today.year + 1, month=1, day=1) - timedelta(days=1)
        else:
            month_end = today.replace(month=today.month + 1, day=1) - timedelta(days=1)

        fp, _ = FiscalPeriod.objects.get_or_create(
            tenant=t, start_date=month_start, end_date=month_end,
            defaults={
                'name': f'Ext {today.strftime("%B %Y")}',
                'status': 'open',
                'is_year_end': False,
            }
        )

        def get_acct(code):
            return Account.objects.filter(tenant=t, code=code).first()

        je_configs = [
            # (entry_num, entry_type, status, days_ago, memo, lines[(acct_code, desc, dr, cr)])
            ('EXT-JE-001', 'standard', 'draft', 2,
             'Warehouse supplies purchase',
             [('6510', 'Warehouse supplies', Decimal('875.00'), Decimal('0')),
              ('1020', 'Cash payment', Decimal('0'), Decimal('875.00'))]),
            ('EXT-JE-002', 'standard', 'posted', 5,
             'Customer payment received - Alpha Pizza',
             [('1020', 'Cash deposit', Decimal('12500.00'), Decimal('0')),
              ('1110', 'AR reduction - Alpha Pizza', Decimal('0'), Decimal('12500.00'))]),
            ('EXT-JE-003', 'standard', 'posted', 8,
             'Vendor payment - Cascade Paper Mills',
             [('2010', 'AP reduction', Decimal('8750.00'), Decimal('0')),
              ('1020', 'Cash payment', Decimal('0'), Decimal('8750.00'))]),
            ('EXT-JE-004', 'standard', 'posted', 12,
             'Monthly freight revenue accrual',
             [('1110', 'AR - freight charges', Decimal('3200.00'), Decimal('0')),
              ('4210', 'Freight income', Decimal('0'), Decimal('3200.00'))]),
            ('EXT-JE-005', 'standard', 'posted', 15,
             'Inventory adjustment - damaged goods',
             [('5000', 'COGS write-off', Decimal('1450.00'), Decimal('0')),
              ('1230', 'Inventory reduction', Decimal('0'), Decimal('1450.00'))]),
            ('EXT-JE-006', 'adjusting', 'posted', 18,
             'Prepaid insurance amortization',
             [('6410', 'Insurance expense', Decimal('2100.00'), Decimal('0')),
              ('1240', 'Prepaid insurance reduction', Decimal('0'), Decimal('2100.00'))]),
            ('EXT-JE-007', 'standard', 'posted', 22,
             'Sales discount adjustment',
             [('4330', 'Sales discount', Decimal('680.00'), Decimal('0')),
              ('1110', 'AR reduction', Decimal('0'), Decimal('680.00'))]),
            ('EXT-JE-008', 'standard', 'draft', 3,
             'Equipment maintenance expense',
             [('6310', 'Equipment maintenance', Decimal('3500.00'), Decimal('0')),
              ('2010', 'AP accrual', Decimal('0'), Decimal('3500.00'))]),
            ('EXT-JE-009', 'standard', 'posted', 28,
             'Payroll posting - warehouse staff',
             [('6100', 'Wages expense', Decimal('18500.00'), Decimal('0')),
              ('6110', 'Payroll tax expense', Decimal('1415.00'), Decimal('0')),
              ('1020', 'Cash - payroll', Decimal('0'), Decimal('15800.00')),
              ('2110', 'Payroll taxes payable', Decimal('0'), Decimal('4115.00'))]),
            ('EXT-JE-010', 'standard', 'posted', 35,
             'Customer bad debt write-off',
             [('6700', 'Bad debt expense', Decimal('2200.00'), Decimal('0')),
              ('1110', 'AR write-off', Decimal('0'), Decimal('2200.00'))]),
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

            for ln, (acct_code, desc, debit, credit) in enumerate(lines, 1):
                acct = get_acct(acct_code)
                if acct:
                    JournalEntryLine.objects.create(
                        tenant=t, entry=je,
                        line_number=ln * 10,
                        account=acct,
                        description=desc,
                        debit=debit, credit=credit,
                    )

            je_count += 1
            self.stdout.write(self.style.SUCCESS(f'  Created: {je_num} ({status})'))

        self.counts['journal_entries'] = je_count

    # ------------------------------------------------------------------
    # SCHEDULING
    # ------------------------------------------------------------------

    def _seed_scheduling(self):
        self.stdout.write('\n[13/13] Scheduling: Delivery Runs + Notes')
        t = self.tenant
        today = self.today

        trucks = list(Truck.objects.filter(tenant=t, is_active=True)[:4])
        if not trucks:
            self.stdout.write('  No trucks found, skipping scheduling')
            return

        # 6 Delivery Runs
        run_configs = [
            ('Ext Morning Local', trucks[0 % len(trucks)], today + timedelta(days=1), 1, time(6, 30)),
            ('Ext Midday Route', trucks[1 % len(trucks)], today + timedelta(days=1), 2, time(11, 0)),
            ('Ext Afternoon Express', trucks[0 % len(trucks)], today + timedelta(days=2), 1, time(13, 0)),
            ('Ext Next Day AM', trucks[2 % len(trucks)], today + timedelta(days=3), 1, time(7, 0)),
            ('Ext Next Day PM', trucks[2 % len(trucks)], today + timedelta(days=3), 2, time(14, 30)),
            ('Ext Weekend Rush', trucks[3 % len(trucks)] if len(trucks) > 3 else trucks[0], today + timedelta(days=5), 1, time(8, 0)),
        ]

        run_count = 0
        for name, truck, sched_date, seq, dept_time in run_configs:
            _, created = DeliveryRun.objects.get_or_create(
                tenant=t, truck=truck, scheduled_date=sched_date, sequence=seq,
                defaults={
                    'name': name,
                    'departure_time': dept_time,
                    'notes': f'Extensive demo delivery run: {name}',
                    'is_complete': False,
                }
            )
            if created:
                run_count += 1

        self.stdout.write(f'  Created {run_count} delivery runs')

        # 10 Scheduler Notes
        note_texts = [
            ('[EXT] Alpha Pizza needs AM delivery only - dock closes at noon',
             'red', today + timedelta(days=1), trucks[0]),
            ('[EXT] Cascade Paper shipment delayed 2 days - call for update',
             'orange', today + timedelta(days=2), None),
            ('[EXT] Bella Vita Foods requesting Saturday delivery exception',
             'purple', today + timedelta(days=5), trucks[1 % len(trucks)]),
            ('[EXT] Forklift maintenance scheduled - use dock 2 only',
             'yellow', today + timedelta(days=3), None),
            ('[EXT] Crown Manufacturing rush order - prioritize loading',
             'red', today + timedelta(days=1), trucks[2 % len(trucks)]),
            ('[EXT] Driver PTO request approved for Friday',
             'blue', today + timedelta(days=4), trucks[0]),
            ('[EXT] New customer Zenith Construction - first delivery, confirm address',
             'green', today + timedelta(days=2), trucks[1 % len(trucks)]),
            ('[EXT] Pallet jack repair needed before afternoon runs',
             'orange', today + timedelta(days=1), None),
            ('[EXT] Holiday schedule: reduced hours next Monday',
             'purple', today + timedelta(days=7), None),
            ('[EXT] DOT inspection due for Truck 3 - schedule before Friday',
             'red', today + timedelta(days=3), trucks[2 % len(trucks)]),
        ]

        note_count = 0
        for content, color, sched_date, truck in note_texts:
            if not SchedulerNote.objects.filter(tenant=t, content=content).exists():
                SchedulerNote.objects.create(
                    tenant=t,
                    content=content,
                    color=color,
                    scheduled_date=sched_date,
                    truck=truck,
                    is_pinned=(color == 'red'),
                )
                note_count += 1

        self.stdout.write(f'  Created {note_count} scheduler notes')
        self.counts['delivery_runs'] = run_count
        self.counts['scheduler_notes'] = note_count

    # ------------------------------------------------------------------
    # SUMMARY
    # ------------------------------------------------------------------

    def _print_summary(self):
        self.stdout.write('\n' + '=' * 60)
        self.stdout.write(self.style.SUCCESS('EXTENSIVE DEMO DATA SEEDING COMPLETE'))
        self.stdout.write('=' * 60)

        summary_items = [
            ('Customers', 'customers'),
            ('Vendors', 'vendors'),
            ('Items', 'items'),
            ('Price Lists', 'price_lists'),
            ('Estimates', 'estimates'),
            ('RFQs', 'rfqs'),
            ('Contracts', 'contracts'),
            ('Purchase Orders', 'purchase_orders'),
            ('Sales Orders', 'sales_orders'),
            ('Invoices', 'invoices'),
            ('Payments', 'payments'),
            ('Vendor Bills', 'vendor_bills'),
            ('Bill Payments', 'bill_payments'),
            ('Design Requests', 'design_requests'),
            ('Journal Entries', 'journal_entries'),
            ('Delivery Runs', 'delivery_runs'),
            ('Scheduler Notes', 'scheduler_notes'),
        ]

        for label, key in summary_items:
            count = self.counts.get(key, 0)
            if count:
                self.stdout.write(f'  {label:.<30} {count}')

        self.stdout.write('')
