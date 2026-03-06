# apps/tenants/management/commands/seed_pipeline_demo.py
"""
Management command to seed demo data for the Pipeline Kanban board.

Creates linked chains of entities so that related cards across columns
can be highlighted when a card is clicked.

Usage:
    python manage.py seed_pipeline_demo
    python manage.py seed_pipeline_demo --clear   # Delete all PIPE- records first
"""
from datetime import timedelta
from decimal import Decimal

from django.core.management.base import BaseCommand
from django.db import transaction
from django.utils import timezone

from apps.design.models import DesignRequest
from apps.inventory.models import InventoryLot
from apps.invoicing.models import (
    BillPayment,
    Invoice,
    InvoiceLine,
    VendorBill,
    VendorBillLine,
)
from apps.items.models import Item, UnitOfMeasure
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
from apps.payments.models import CustomerPayment, PaymentApplication
from apps.shipping.models import Shipment, ShipmentLine
from apps.tenants.models import Tenant
from apps.warehousing.models import Warehouse
from shared.managers import set_current_tenant


NOW = timezone.now()
TODAY = NOW.date()


def days_ago(n):
    return TODAY - timedelta(days=n)


class Command(BaseCommand):
    help = "Seed pipeline Kanban demo data with cross-entity linked chains."

    def add_arguments(self, parser):
        parser.add_argument(
            "--clear",
            action="store_true",
            help="Delete all PIPE- prefixed records before seeding.",
        )

    def handle(self, *args, **options):
        t = Tenant.objects.first()
        if not t:
            self.stderr.write("No tenant found. Run seed_full_demo first.")
            return

        set_current_tenant(t)

        if options["clear"]:
            self._clear(t)

        with transaction.atomic():
            self._seed(t)

    # ------------------------------------------------------------------
    # Clear
    # ------------------------------------------------------------------

    def _clear(self, t):
        self.stdout.write("Clearing PIPE- records...")

        # Payments first (depend on invoices)
        PaymentApplication.objects.filter(tenant=t, payment__payment_number__startswith="PIPE-").delete()
        CustomerPayment.objects.filter(tenant=t, payment_number__startswith="PIPE-").delete()
        BillPayment.objects.filter(tenant=t, bill__bill_number__startswith="PIPE-").delete()

        # Invoice lines then invoices
        InvoiceLine.objects.filter(tenant=t, invoice__invoice_number__startswith="PIPE-").delete()
        Invoice.objects.filter(tenant=t, invoice_number__startswith="PIPE-").delete()

        # Vendor bill lines then bills
        VendorBillLine.objects.filter(tenant=t, bill__bill_number__startswith="PIPE-").delete()
        VendorBill.objects.filter(tenant=t, bill_number__startswith="PIPE-").delete()

        # Shipment lines then shipments
        ShipmentLine.objects.filter(tenant=t, shipment__shipment_number__startswith="PIPE-").delete()
        Shipment.objects.filter(tenant=t, shipment_number__startswith="PIPE-").delete()

        # Sales order lines then sales orders
        SalesOrderLine.objects.filter(tenant=t, sales_order__order_number__startswith="PIPE-").delete()
        SalesOrder.objects.filter(tenant=t, order_number__startswith="PIPE-").delete()

        # Estimate lines then estimates
        EstimateLine.objects.filter(tenant=t, estimate__estimate_number__startswith="PIPE-").delete()
        Estimate.objects.filter(tenant=t, estimate_number__startswith="PIPE-").delete()

        # PO lines then POs
        PurchaseOrderLine.objects.filter(tenant=t, purchase_order__po_number__startswith="PIPE-").delete()
        PurchaseOrder.objects.filter(tenant=t, po_number__startswith="PIPE-").delete()

        # RFQ lines then RFQs
        RFQLine.objects.filter(tenant=t, rfq__rfq_number__startswith="PIPE-").delete()
        RFQ.objects.filter(tenant=t, rfq_number__startswith="PIPE-").delete()

        # Inventory lots
        InventoryLot.objects.filter(tenant=t, lot_number__startswith="PIPE-").delete()

        # Design requests
        DesignRequest.objects.filter(tenant=t, file_number__startswith="PIPE-").delete()

        self.stdout.write("  Done clearing.")

    # ------------------------------------------------------------------
    # Seed
    # ------------------------------------------------------------------

    def _seed(self, t):
        self.stdout.write("\n--- Phase 1: Foundation Data ---")

        # ------------------------------------------------------------------
        # UOM
        # ------------------------------------------------------------------
        uom, _ = UnitOfMeasure.objects.get_or_create(
            tenant=t, code='ea', defaults={'name': 'Each'}
        )
        self.stdout.write("  UOM: ea (Each)")

        # ------------------------------------------------------------------
        # Customers (Party + Customer)
        # ------------------------------------------------------------------
        customer_data = [
            ('METRO',    'Metro Markets',         50000),
            ('SUNNY',    'Sunny Side Grocers',    35000),
            ('HARVEST',  'Harvest Foods',         40000),
            ('GLEAF',    'Green Leaf Stores',     30000),
            ('COAST',    'Coastal Supermarkets',  45000),
        ]
        created_customers = {}
        for code, name, limit in customer_data:
            party, _ = Party.objects.get_or_create(
                tenant=t, code=code,
                defaults={'display_name': name, 'party_type': 'CUSTOMER'},
            )
            cust, _ = Customer.objects.get_or_create(
                tenant=t, party=party,
                defaults={'credit_limit': Decimal(str(limit)), 'payment_terms': 'NET30'},
            )
            created_customers[code] = cust
        self.stdout.write(f"  Customers: {len(created_customers)} created/found")

        metro     = created_customers['METRO']
        sunny     = created_customers['SUNNY']
        harvest   = created_customers['HARVEST']
        greenleaf = created_customers['GLEAF']
        coastal   = created_customers['COAST']

        # ------------------------------------------------------------------
        # Vendors (Party + Vendor)
        # ------------------------------------------------------------------
        vendor_data = [
            ('ACME',   'Acme Corrugated',      'NET30'),
            ('FRESH',  'Fresh Board Supply',   'NET30'),
            ('GLOBAL', 'Global Packaging Inc', 'NET45'),
            ('PRIME',  'Prime Paper Co',       'NET30'),
        ]
        created_vendors = {}
        for code, name, terms in vendor_data:
            party, _ = Party.objects.get_or_create(
                tenant=t, code=code,
                defaults={'display_name': name, 'party_type': 'VENDOR'},
            )
            vend, _ = Vendor.objects.get_or_create(
                tenant=t, party=party,
                defaults={'payment_terms': terms},
            )
            created_vendors[code] = vend
        self.stdout.write(f"  Vendors: {len(created_vendors)} created/found")

        acme       = created_vendors['ACME']
        fresh      = created_vendors['FRESH']
        global_pkg = created_vendors['GLOBAL']
        prime      = created_vendors['PRIME']

        # ------------------------------------------------------------------
        # Items
        # ------------------------------------------------------------------
        item_data = [
            ('PIPE-RSC-001', '12x10x8 RSC Kraft'),
            ('PIPE-RSC-002', '14x12x10 RSC Kraft'),
            ('PIPE-RSC-003', '16x14x12 RSC White'),
            ('PIPE-RSC-004', '18x16x14 RSC Kraft'),
            ('PIPE-RSC-005', '20x18x16 RSC White'),
        ]
        created_items = []
        for sku, name in item_data:
            item, _ = Item.objects.get_or_create(
                tenant=t, sku=sku,
                defaults={'name': name, 'base_uom': uom, 'division': 'corrugated'},
            )
            created_items.append(item)
        self.stdout.write(f"  Items: {len(created_items)} created/found")

        # ------------------------------------------------------------------
        # Truck
        # ------------------------------------------------------------------
        truck, _ = Truck.objects.get_or_create(
            tenant=t, name='Truck 1',
            defaults={},
        )
        self.stdout.write("  Truck: Truck 1")

        # ------------------------------------------------------------------
        # Warehouse party + location + warehouse
        # ------------------------------------------------------------------
        wh_party, _ = Party.objects.get_or_create(
            tenant=t, code='WH-MAIN',
            defaults={'display_name': 'Main Warehouse', 'party_type': 'OTHER'},
        )
        wh_location, _ = Location.objects.get_or_create(
            tenant=t, party=wh_party, name='Main Warehouse',
            defaults={
                'location_type': 'WAREHOUSE',
                'address_line1': '100 Industrial Blvd',
                'city': 'Springfield',
                'state': 'IL',
                'postal_code': '62701',
            },
        )
        warehouse, _ = Warehouse.objects.get_or_create(
            tenant=t, code='MAIN',
            defaults={'name': 'Main Warehouse', 'location': wh_location, 'is_default': True},
        )
        self.stdout.write("  Warehouse: MAIN")

        # ------------------------------------------------------------------
        # Item aliases for chain code below
        # ------------------------------------------------------------------
        item0 = created_items[0]
        item1 = created_items[1]
        item2 = created_items[2]

        def customer_location(cust):
            loc = getattr(cust, "default_ship_to", None)
            if loc:
                return loc
            return cust.party.locations.first() or wh_location

        counts = {
            "design_requests": 0,
            "estimates": 0,
            "sales_orders": 0,
            "shipments": 0,
            "invoices": 0,
            "customer_payments": 0,
            "payment_applications": 0,
            "rfqs": 0,
            "purchase_orders": 0,
            "inventory_lots": 0,
            "vendor_bills": 0,
            "bill_payments": 0,
        }

        # ==============================================================
        # CUSTOMER TRACK
        # ==============================================================
        self.stdout.write("\n--- Customer Track ---")

        # --- Chain 1: Metro Markets ---
        # DR (in_progress) -> Estimate (sent) -> SO (confirmed) -> Shipment (planned) -> Invoice (sent) -> Payment (posted)
        dr1 = self._create_dr(t, metro.party, "PIPE-DR-001", "in_progress", days_ago(20))
        counts["design_requests"] += 1

        est1 = self._create_estimate(t, metro, "PIPE-EST-001", "sent", days_ago(15), dr1)
        self._create_estimate_line(t, est1, item0, uom, 500, Decimal("12.50"))
        counts["estimates"] += 1

        so1 = self._create_so(t, metro, "PIPE-SO-001", "confirmed", days_ago(10),
                              customer_location(metro), source_estimate=est1)
        self._create_so_line(t, so1, item0, uom, 500, Decimal("12.50"))
        counts["sales_orders"] += 1

        ship1 = self._create_shipment(t, "PIPE-SHIP-001", "planned", days_ago(3), truck)
        ShipmentLine.objects.create(tenant=t, shipment=ship1, sales_order=so1)
        counts["shipments"] += 1

        inv1 = self._create_invoice(t, metro, "PIPE-INV-001", "sent", days_ago(2),
                                    Decimal("6250.00"), sales_order=so1, shipment=ship1)
        self._create_invoice_line(t, inv1, item0, uom, 500, Decimal("12.50"))
        counts["invoices"] += 1

        pay1 = self._create_customer_payment(t, metro, "PIPE-PAY-001", "posted",
                                             days_ago(1), Decimal("6250.00"))
        PaymentApplication.objects.create(
            tenant=t, payment=pay1, invoice=inv1, amount_applied=Decimal("6250.00")
        )
        counts["customer_payments"] += 1
        counts["payment_applications"] += 1

        self.stdout.write("  Chain 1 (Metro Markets): DR -> EST -> SO -> SHIP -> INV -> PAY")

        # --- Chain 2: Sunny Side ---
        # DR (approved) -> Estimate (accepted) -> SO (confirmed) -> Shipment (in_transit) -> Invoice (draft)
        dr2 = self._create_dr(t, sunny.party, "PIPE-DR-002", "approved", days_ago(30))
        counts["design_requests"] += 1

        est2 = self._create_estimate(t, sunny, "PIPE-EST-002", "accepted", days_ago(25), dr2)
        self._create_estimate_line(t, est2, item1, uom, 1000, Decimal("8.75"))
        counts["estimates"] += 1

        so2 = self._create_so(t, sunny, "PIPE-SO-002", "confirmed", days_ago(18),
                              customer_location(sunny), source_estimate=est2)
        self._create_so_line(t, so2, item1, uom, 1000, Decimal("8.75"))
        counts["sales_orders"] += 1

        ship2 = self._create_shipment(t, "PIPE-SHIP-002", "in_transit", days_ago(5), truck)
        ShipmentLine.objects.create(tenant=t, shipment=ship2, sales_order=so2)
        counts["shipments"] += 1

        inv2 = self._create_invoice(t, sunny, "PIPE-INV-002", "draft", days_ago(1),
                                    Decimal("8750.00"), sales_order=so2, shipment=ship2)
        self._create_invoice_line(t, inv2, item1, uom, 1000, Decimal("8.75"))
        counts["invoices"] += 1

        self.stdout.write("  Chain 2 (Sunny Side): DR -> EST -> SO -> SHIP -> INV")

        # --- Chain 3: Harvest Foods ---
        # DR (in_progress) -> Estimate (draft) -> SO (draft)
        dr3 = self._create_dr(t, harvest.party, "PIPE-DR-003", "in_progress", days_ago(7))
        counts["design_requests"] += 1

        est3 = self._create_estimate(t, harvest, "PIPE-EST-003", "draft", days_ago(5), dr3)
        self._create_estimate_line(t, est3, item2, uom, 200, Decimal("15.00"))
        counts["estimates"] += 1

        so3 = self._create_so(t, harvest, "PIPE-SO-003", "draft", days_ago(2),
                              customer_location(harvest), source_estimate=est3)
        self._create_so_line(t, so3, item2, uom, 200, Decimal("15.00"))
        counts["sales_orders"] += 1

        self.stdout.write("  Chain 3 (Harvest Foods): DR -> EST -> SO")

        # --- Chain 4: Green Leaf ---
        # Estimate (sent) -> SO (confirmed) -> Shipment (delivered) -> Invoice (paid) -> Payment (posted)
        est4 = self._create_estimate(t, greenleaf, "PIPE-EST-004", "sent", days_ago(45))
        self._create_estimate_line(t, est4, item0, uom, 750, Decimal("11.00"))
        counts["estimates"] += 1

        so4 = self._create_so(t, greenleaf, "PIPE-SO-004", "shipped", days_ago(30),
                              customer_location(greenleaf), source_estimate=est4)
        self._create_so_line(t, so4, item0, uom, 750, Decimal("11.00"))
        counts["sales_orders"] += 1

        ship4 = self._create_shipment(t, "PIPE-SHIP-004", "delivered", days_ago(25), truck)
        ShipmentLine.objects.create(tenant=t, shipment=ship4, sales_order=so4)
        counts["shipments"] += 1

        inv4 = self._create_invoice(t, greenleaf, "PIPE-INV-004", "paid", days_ago(20),
                                    Decimal("8250.00"), sales_order=so4, shipment=ship4)
        inv4.amount_paid = Decimal("8250.00")
        inv4.save()
        self._create_invoice_line(t, inv4, item0, uom, 750, Decimal("11.00"))
        counts["invoices"] += 1

        pay4 = self._create_customer_payment(t, greenleaf, "PIPE-PAY-004", "posted",
                                             days_ago(15), Decimal("8250.00"))
        PaymentApplication.objects.create(
            tenant=t, payment=pay4, invoice=inv4, amount_applied=Decimal("8250.00")
        )
        counts["customer_payments"] += 1
        counts["payment_applications"] += 1

        self.stdout.write("  Chain 4 (Green Leaf): EST -> SO -> SHIP -> INV -> PAY")

        # --- Chain 5: Coastal ---
        # SO (shipped) -> Invoice (overdue)
        so5 = self._create_so(t, coastal, "PIPE-SO-005", "shipped", days_ago(60),
                              customer_location(coastal))
        self._create_so_line(t, so5, item1, uom, 300, Decimal("9.00"))
        counts["sales_orders"] += 1

        inv5 = self._create_invoice(t, coastal, "PIPE-INV-005", "overdue", days_ago(45),
                                    Decimal("2700.00"), sales_order=so5)
        self._create_invoice_line(t, inv5, item1, uom, 300, Decimal("9.00"))
        counts["invoices"] += 1

        self.stdout.write("  Chain 5 (Coastal): SO -> INV (overdue)")

        # --- Unlinked extras ---
        # 3 more DRs
        for i, (party, status) in enumerate([
            (metro.party, "pending"),
            (sunny.party, "completed"),
            (harvest.party, "rejected"),
        ], start=10):
            self._create_dr(t, party, f"PIPE-DR-0{i}", status, days_ago(i * 3))
            counts["design_requests"] += 1

        # 2 more Estimates without DRs
        for i, (cust, status) in enumerate([
            (greenleaf, "expired"),
            (coastal, "draft"),
        ], start=10):
            est = self._create_estimate(t, cust, f"PIPE-EST-0{i}", status, days_ago(i * 4))
            self._create_estimate_line(t, est, item2, uom, 100, Decimal("10.00"))
            counts["estimates"] += 1

        # 3 more SOs without estimates
        for i, (cust, status) in enumerate([
            (metro, "confirmed"),
            (sunny, "draft"),
            (harvest, "complete"),
        ], start=10):
            so = self._create_so(t, cust, f"PIPE-SO-0{i}", status, days_ago(i * 2),
                                 customer_location(cust))
            self._create_so_line(t, so, item0, uom, 50, Decimal("14.00"))
            counts["sales_orders"] += 1

        # 2 more Invoices without SOs
        for i, (cust, status, amount) in enumerate([
            (metro, "sent", Decimal("1500.00")),
            (coastal, "partial", Decimal("3000.00")),
        ], start=10):
            inv = self._create_invoice(t, cust, f"PIPE-INV-0{i}", status, days_ago(i * 3), amount)
            self._create_invoice_line(t, inv, item1, uom, 150, Decimal("10.00"))
            counts["invoices"] += 1

        # ==============================================================
        # VENDOR TRACK
        # ==============================================================
        self.stdout.write("\n--- Vendor Track ---")

        # --- Vendor Chain 1: Acme ---
        # RFQ (sent) -> PO (confirmed) -> InventoryLot -> VendorBill (posted) -> BillPayment
        rfq1 = self._create_rfq(t, acme, "PIPE-RFQ-001", "sent", days_ago(20), wh_location)
        self._create_rfq_line(t, rfq1, item0, uom, 2000)
        counts["rfqs"] += 1

        po1 = self._create_po(t, acme, "PIPE-PO-001", "confirmed", days_ago(15),
                              wh_location, source_rfq=rfq1)
        self._create_po_line(t, po1, item0, uom, 2000, Decimal("5.00"))
        counts["purchase_orders"] += 1

        lot1 = InventoryLot.objects.create(
            tenant=t,
            lot_number="PIPE-LOT-001",
            item=item0,
            warehouse=warehouse,
            vendor=acme,
            purchase_order=po1,
            total_quantity=2000,
            unit_cost=Decimal("5.00"),
            received_date=days_ago(10),
        )
        counts["inventory_lots"] += 1

        bill1 = self._create_vendor_bill(t, acme, "PIPE-BILL-001", "posted", days_ago(10),
                                         Decimal("10000.00"), purchase_order=po1)
        self._create_vendor_bill_line(t, bill1, item0, 2000, Decimal("5.00"))
        counts["vendor_bills"] += 1

        bp1 = BillPayment.objects.create(
            tenant=t,
            bill=bill1,
            payment_date=days_ago(5),
            amount=Decimal("10000.00"),
            payment_method="ACH",
            reference_number="PIPE-BP-001",
        )
        counts["bill_payments"] += 1

        self.stdout.write("  Chain 1 (Acme): RFQ -> PO -> LOT -> BILL -> BPAY")

        # --- Vendor Chain 2: Fresh Board ---
        # RFQ (received) -> PO (partially_received) -> VendorBill (draft)
        rfq2 = self._create_rfq(t, fresh, "PIPE-RFQ-002", "received", days_ago(25), wh_location)
        self._create_rfq_line(t, rfq2, item1, uom, 1500)
        counts["rfqs"] += 1

        po2 = self._create_po(t, fresh, "PIPE-PO-002", "partially_received", days_ago(18),
                              wh_location, source_rfq=rfq2)
        self._create_po_line(t, po2, item1, uom, 1500, Decimal("6.00"))
        counts["purchase_orders"] += 1

        bill2 = self._create_vendor_bill(t, fresh, "PIPE-BILL-002", "draft", days_ago(5),
                                         Decimal("9000.00"), purchase_order=po2)
        self._create_vendor_bill_line(t, bill2, item1, 1500, Decimal("6.00"))
        counts["vendor_bills"] += 1

        self.stdout.write("  Chain 2 (Fresh Board): RFQ -> PO -> BILL")

        # --- Vendor Chain 3: Global Packaging ---
        # PO (confirmed) -> InventoryLot -> VendorBill (paid) -> BillPayment
        po3 = self._create_po(t, global_pkg, "PIPE-PO-003", "confirmed", days_ago(35), wh_location)
        self._create_po_line(t, po3, item2, uom, 3000, Decimal("4.50"))
        counts["purchase_orders"] += 1

        lot3 = InventoryLot.objects.create(
            tenant=t,
            lot_number="PIPE-LOT-003",
            item=item2,
            warehouse=warehouse,
            vendor=global_pkg,
            purchase_order=po3,
            total_quantity=3000,
            unit_cost=Decimal("4.50"),
            received_date=days_ago(28),
        )
        counts["inventory_lots"] += 1

        bill3 = self._create_vendor_bill(t, global_pkg, "PIPE-BILL-003", "paid", days_ago(25),
                                         Decimal("13500.00"), purchase_order=po3)
        bill3.amount_paid = Decimal("13500.00")
        bill3.save()
        self._create_vendor_bill_line(t, bill3, item2, 3000, Decimal("4.50"))
        counts["vendor_bills"] += 1

        bp3 = BillPayment.objects.create(
            tenant=t,
            bill=bill3,
            payment_date=days_ago(20),
            amount=Decimal("13500.00"),
            payment_method="CHECK",
            reference_number="PIPE-BP-003",
        )
        counts["bill_payments"] += 1

        self.stdout.write("  Chain 3 (Global Packaging): PO -> LOT -> BILL -> BPAY")

        # --- Vendor Chain 4: Prime Paper ---
        # RFQ (converted) -> PO (draft)
        rfq4 = self._create_rfq(t, prime, "PIPE-RFQ-004", "converted", days_ago(12), wh_location)
        self._create_rfq_line(t, rfq4, item0, uom, 500)
        counts["rfqs"] += 1

        po4 = self._create_po(t, prime, "PIPE-PO-004", "draft", days_ago(8),
                              wh_location, source_rfq=rfq4)
        self._create_po_line(t, po4, item0, uom, 500, Decimal("5.50"))
        counts["purchase_orders"] += 1

        self.stdout.write("  Chain 4 (Prime Paper): RFQ -> PO")

        # --- Unlinked vendor extras ---
        # 2 more RFQs
        for i, (vend, status) in enumerate([
            (acme, "draft"),
            (fresh, "cancelled"),
        ], start=10):
            rfq = self._create_rfq(t, vend, f"PIPE-RFQ-0{i}", status, days_ago(i * 5), wh_location)
            self._create_rfq_line(t, rfq, item1, uom, 200)
            counts["rfqs"] += 1

        # 2 more POs without RFQs
        for i, (vend, status) in enumerate([
            (global_pkg, "confirmed"),
            (prime, "received"),
        ], start=10):
            po = self._create_po(t, vend, f"PIPE-PO-0{i}", status, days_ago(i * 3), wh_location)
            self._create_po_line(t, po, item2, uom, 400, Decimal("4.75"))
            counts["purchase_orders"] += 1

        # 1 more VendorBill without PO
        bill_extra = self._create_vendor_bill(t, acme, "PIPE-BILL-010", "draft", days_ago(3),
                                              Decimal("2000.00"))
        self._create_vendor_bill_line(t, bill_extra, item0, 400, Decimal("5.00"))
        counts["vendor_bills"] += 1

        # Summary
        self._print_summary(counts)

    # ------------------------------------------------------------------
    # Factory helpers
    # ------------------------------------------------------------------

    def _create_dr(self, t, party, file_number, status, date):
        dr, _ = DesignRequest.objects.get_or_create(
            tenant=t,
            file_number=file_number,
            defaults=dict(
                customer=party,
                status=status,
                ident=f"Pipeline Demo Box {file_number}",
                style="RSC",
            ),
        )
        return dr

    def _create_estimate(self, t, customer, number, status, date, design_request=None):
        est, _ = Estimate.objects.get_or_create(
            tenant=t,
            estimate_number=number,
            defaults=dict(
                customer=customer,
                date=date,
                status=status,
                design_request=design_request,
                subtotal=Decimal("0"),
                total_amount=Decimal("0"),
            ),
        )
        return est

    def _create_estimate_line(self, t, estimate, item, uom, qty, price):
        line_number = estimate.lines.count() * 10 + 10
        EstimateLine.objects.get_or_create(
            tenant=t,
            estimate=estimate,
            line_number=line_number,
            defaults=dict(
                item=item,
                uom=uom,
                quantity=qty,
                unit_price=price,
            ),
        )

    def _create_so(self, t, customer, number, status, date, ship_to, source_estimate=None):
        so, _ = SalesOrder.objects.get_or_create(
            tenant=t,
            order_number=number,
            defaults=dict(
                customer=customer,
                order_date=date,
                status=status,
                ship_to=ship_to,
                source_estimate=source_estimate,
            ),
        )
        return so

    def _create_so_line(self, t, so, item, uom, qty, price):
        line_number = so.lines.count() * 10 + 10
        SalesOrderLine.objects.get_or_create(
            tenant=t,
            sales_order=so,
            line_number=line_number,
            defaults=dict(
                item=item,
                uom=uom,
                quantity_ordered=qty,
                unit_price=price,
            ),
        )

    def _create_shipment(self, t, number, status, ship_date, truck):
        ship, _ = Shipment.objects.get_or_create(
            tenant=t,
            shipment_number=number,
            defaults=dict(
                ship_date=ship_date,
                status=status,
                truck=truck,
            ),
        )
        return ship

    def _create_invoice(self, t, customer, number, status, date, total,
                        sales_order=None, shipment=None):
        due = date + timedelta(days=30)
        inv, _ = Invoice.objects.get_or_create(
            tenant=t,
            invoice_number=number,
            defaults=dict(
                customer=customer,
                invoice_date=date,
                due_date=due,
                status=status,
                total_amount=total,
                subtotal=total,
                bill_to_name=customer.party.display_name,
                sales_order=sales_order,
                shipment=shipment,
            ),
        )
        return inv

    def _create_invoice_line(self, t, invoice, item, uom, qty, price):
        line_number = invoice.lines.count() * 10 + 10
        InvoiceLine.objects.get_or_create(
            tenant=t,
            invoice=invoice,
            line_number=line_number,
            defaults=dict(
                item=item,
                uom=uom,
                quantity=qty,
                unit_price=price,
                description=getattr(item, "name", item.sku),
            ),
        )

    def _create_customer_payment(self, t, customer, number, status, date, amount):
        pay, _ = CustomerPayment.objects.get_or_create(
            tenant=t,
            payment_number=number,
            defaults=dict(
                customer=customer,
                payment_date=date,
                amount=amount,
                status=status,
                unapplied_amount=Decimal("0"),
                payment_method="CHECK",
            ),
        )
        return pay

    def _create_rfq(self, t, vendor, number, status, date, ship_to):
        rfq, _ = RFQ.objects.get_or_create(
            tenant=t,
            rfq_number=number,
            defaults=dict(
                vendor=vendor,
                date=date,
                status=status,
                ship_to=ship_to,
            ),
        )
        return rfq

    def _create_rfq_line(self, t, rfq, item, uom, qty):
        line_number = rfq.lines.count() * 10 + 10
        RFQLine.objects.get_or_create(
            tenant=t,
            rfq=rfq,
            line_number=line_number,
            defaults=dict(
                item=item,
                uom=uom,
                quantity=qty,
            ),
        )

    def _create_po(self, t, vendor, number, status, date, ship_to, source_rfq=None):
        po, _ = PurchaseOrder.objects.get_or_create(
            tenant=t,
            po_number=number,
            defaults=dict(
                vendor=vendor,
                order_date=date,
                status=status,
                ship_to=ship_to,
                source_rfq=source_rfq,
            ),
        )
        return po

    def _create_po_line(self, t, po, item, uom, qty, cost):
        line_number = po.lines.count() * 10 + 10
        PurchaseOrderLine.objects.get_or_create(
            tenant=t,
            purchase_order=po,
            line_number=line_number,
            defaults=dict(
                item=item,
                uom=uom,
                quantity_ordered=qty,
                unit_cost=cost,
            ),
        )

    def _create_vendor_bill(self, t, vendor, number, status, date, total, purchase_order=None):
        due = date + timedelta(days=30)
        bill, _ = VendorBill.objects.get_or_create(
            tenant=t,
            bill_number=number,
            defaults=dict(
                vendor=vendor,
                vendor_invoice_number=f"VI-{number}",
                bill_date=date,
                due_date=due,
                status=status,
                total_amount=total,
                subtotal=total,
                purchase_order=purchase_order,
            ),
        )
        return bill

    def _create_vendor_bill_line(self, t, bill, item, qty, cost):
        line_number = bill.lines.count() * 10 + 10
        VendorBillLine.objects.get_or_create(
            tenant=t,
            bill=bill,
            line_number=line_number,
            defaults=dict(
                item=item,
                description=getattr(item, "name", item.sku),
                quantity=Decimal(qty),
                unit_price=cost,
            ),
        )

    # ------------------------------------------------------------------
    # Summary
    # ------------------------------------------------------------------

    def _print_summary(self, counts):
        self.stdout.write("\n" + "=" * 50)
        self.stdout.write("Pipeline Demo Seed Summary")
        self.stdout.write("=" * 50)
        total = 0
        for key, val in counts.items():
            if val:
                label = key.replace("_", " ").title()
                self.stdout.write(f"  {label:<25} {val:>4}")
                total += val
        self.stdout.write("-" * 50)
        self.stdout.write(f"  {'Total Records':<25} {total:>4}")
        self.stdout.write("=" * 50)
        self.stdout.write("\nLinked chains created:")
        self.stdout.write("  Customer: Metro(DR->EST->SO->SHIP->INV->PAY)")
        self.stdout.write("  Customer: Sunny(DR->EST->SO->SHIP->INV)")
        self.stdout.write("  Customer: Harvest(DR->EST->SO)")
        self.stdout.write("  Customer: GreenLeaf(EST->SO->SHIP->INV->PAY)")
        self.stdout.write("  Customer: Coastal(SO->INV overdue)")
        self.stdout.write("  Vendor:   Acme(RFQ->PO->LOT->BILL->BPAY)")
        self.stdout.write("  Vendor:   FreshBoard(RFQ->PO->BILL)")
        self.stdout.write("  Vendor:   GlobalPkg(PO->LOT->BILL->BPAY)")
        self.stdout.write("  Vendor:   PrimePaper(RFQ->PO)")
        self.stdout.write(self.style.SUCCESS("\nPipeline demo seed complete."))
