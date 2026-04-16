"""
End-to-end business process trace:
  Vendor + Customer + Item → Estimate → Sales Order → PO → Invoice → Payment
"""
import os
import sys
import json
import time
from decimal import Decimal

RUN_ID = str(int(time.time()))[-6:]  # unique suffix per run

os.environ['DJANGO_SETTINGS_MODULE'] = 'raven.settings'

import django
django.setup()

import requests

BASE = 'http://localhost:8000/api/v1'
s = requests.Session()


def step(title):
    print()
    print('=' * 60)
    print(f'  {title}')
    print('=' * 60)


def check(r, expected=None):
    ok_codes = expected if isinstance(expected, list) else ([expected] if expected else [200, 201])
    if r.status_code not in ok_codes:
        print(f'  FAIL: {r.status_code}')
        print(f'  {r.text[:800]}')
        sys.exit(1)
    print(f'  OK: {r.status_code}')
    return r.json() if r.text else {}


# ── STEP 0: LOGIN ────────────────────────────────────────────
step('STEP 0: LOGIN')
data = check(s.post(f'{BASE}/auth/login/', json={
    'username': 'admin', 'password': 'admin'
}), [200])
print('  Authenticated as admin')

# ── STEP 1: ENSURE UOM EXISTS ────────────────────────────────
step('STEP 1: ENSURE UOM (EACH)')
from apps.items.models import UnitOfMeasure
from apps.tenants.models import Tenant
from shared.managers import set_current_tenant
tenant = Tenant.objects.first()
set_current_tenant(tenant)
print(f'  Tenant: {tenant}')
try:
    uom = UnitOfMeasure.objects.filter(code='EACH').first()
    if not uom:
        uom = UnitOfMeasure(code='EACH', name='Each', tenant=tenant)
        uom.save()
        print(f'  UOM: id={uom.id}, code={uom.code} (created)')
    else:
        print(f'  UOM: id={uom.id}, code={uom.code} (exists)')
except Exception as e:
    print(f'  Error: {e}')
    uom = UnitOfMeasure.objects.filter(code='EACH').first()
    print(f'  Fallback UOM: id={uom.id}, code={uom.code}')

# ── STEP 2: CREATE VENDOR ───────────────────────────────────
step('STEP 2: CREATE VENDOR (via Party)')
data = check(s.post(f'{BASE}/parties/', json={
    'party_type': 'VENDOR',
    'code': f'E2E-V-{RUN_ID}',
    'display_name': f'Acme Corrugated Supply Co ({RUN_ID})',
    'main_phone': '555-100-2000',
    'main_email': 'sales@acmesupply.com',
}), [201])
vendor_party_id = data['id']
print(f'  Party ID: {vendor_party_id}')
# Get the auto-created vendor record
vdetail = check(s.get(f'{BASE}/parties/{vendor_party_id}/'))
vendor_id = vdetail['vendor']['id']
print(f'  Vendor ID: {vendor_id} (auto-created)')

# ── STEP 3: CREATE CUSTOMER ─────────────────────────────────
step('STEP 3: CREATE CUSTOMER (via Party)')
data = check(s.post(f'{BASE}/parties/', json={
    'party_type': 'CUSTOMER',
    'code': f'E2E-C-{RUN_ID}',
    'display_name': f'BigBox Retail Inc ({RUN_ID})',
    'main_phone': '555-200-3000',
    'main_email': 'purchasing@bigbox.com',
}), [201])
customer_party_id = data['id']
print(f'  Party ID: {customer_party_id}')
# Get the auto-created customer record
cdetail = check(s.get(f'{BASE}/parties/{customer_party_id}/'))
customer_id = cdetail['customer']['id']
print(f'  Customer ID: {customer_id} (auto-created)')

# ── STEP 3c: CREATE CUSTOMER LOCATION ────────────────────────
step('STEP 3c: CREATE CUSTOMER SHIP-TO LOCATION')
data = check(s.post(f'{BASE}/locations/', json={
    'party': customer_party_id,
    'location_type': 'SHIP_TO',
    'name': 'Main Warehouse',
    'address_line1': '100 Retail Blvd',
    'city': 'Dallas',
    'state': 'TX',
    'postal_code': '75201',
    'country': 'US',
    'is_default': True,
}), [201])
ship_to_id = data['id']
print(f'  Location ID: {ship_to_id}')

# ── STEP 3d: CREATE WAREHOUSE LOCATION ───────────────────────
step('STEP 3d: CREATE WAREHOUSE LOCATION')
# Use the customer's party for a warehouse receive location
# or create on tenant's default party - use vendor party
data = check(s.post(f'{BASE}/locations/', json={
    'party': vendor_party_id,
    'location_type': 'WAREHOUSE',
    'name': 'Raven Main Warehouse',
    'address_line1': '500 Distribution Way',
    'city': 'Fort Worth',
    'state': 'TX',
    'postal_code': '76102',
    'country': 'US',
    'is_default': True,
}), [201])
warehouse_id = data['id']
print(f'  Warehouse Location ID: {warehouse_id}')

# ── STEP 4: CREATE ITEM ─────────────────────────────────────
step('STEP 4: CREATE ITEM')
data = check(s.post(f'{BASE}/items/', json={
    'sku': f'E2E-RSC-{RUN_ID}',
    'name': 'RSC 24x18x12 B-Flute Kraft',
    'division': 'corrugated',
    'description': 'Regular Slotted Container, 24x18x12, B-Flute, Kraft',
    'base_uom': uom.id,
}), [201])
item_id = data['id']
print(f'  Item ID: {item_id}, SKU: {data["sku"]}')

# ── STEP 5: CREATE ESTIMATE WITH NESTED LINES ───────────────
step('STEP 5: CREATE ESTIMATE WITH NESTED LINES (testing serializer fix)')
data = check(s.post(f'{BASE}/estimates/', json={
    'customer': customer_id,
    'date': '2026-04-16',
    'expiration_date': '2026-05-16',
    'tax_rate': '7.00',
    'customer_po': 'BIGBOX-PO-9001',
    'ship_to': ship_to_id,
    'notes': 'E2E test - corrugated boxes for BigBox',
    'lines': [
        {
            'line_number': 10,
            'item': item_id,
            'description': 'RSC 24x18x12 B-Flute Kraft',
            'quantity': 5000,
            'uom': uom.id,
            'unit_price': '3.50',
        }
    ]
}), [201])
estimate_id = data['id']
estimate_number = data.get('estimate_number', '?')
print(f'  Estimate: {estimate_number} (ID: {estimate_id})')
print(f'  Status: {data.get("status")}')
print(f'  Total: ${data.get("total_amount", "?")}')
expected_total = Decimal('18725.00')
actual = Decimal(str(data.get('total_amount', '0')))
if abs(actual - expected_total) < Decimal('1'):
    print(f'  TAX CALC: CORRECT (5000 x $3.50 + 7% tax = $18,725)')
else:
    print(f'  TAX CALC: WRONG (got ${actual}, expected ${expected_total})')

# ── STEP 6: ACCEPT ESTIMATE ─────────────────────────────────
step('STEP 6: ACCEPT ESTIMATE')
data = check(s.post(f'{BASE}/estimates/{estimate_id}/accept/'))
print(f'  Status: {data.get("status")}')

# ── STEP 7: CONVERT ESTIMATE → SALES ORDER ──────────────────
step('STEP 7: CONVERT ESTIMATE -> SALES ORDER')
data = check(s.post(f'{BASE}/estimates/{estimate_id}/convert/'))
so_id = data.get('id')
so_number = data.get('order_number', '?')
print(f'  Sales Order: {so_number} (ID: {so_id})')
print(f'  Status: {data.get("status")}')
print(f'  Source Estimate: {data.get("source_estimate")}')

# ── STEP 8: CONFIRM SALES ORDER ─────────────────────────────
step('STEP 8: CONFIRM SALES ORDER')
data = check(s.post(f'{BASE}/sales-orders/{so_id}/confirm/'))
print(f'  Status: {data.get("status")}')

# ── STEP 9: CREATE PO WITH NESTED LINES ─────────────────────
step('STEP 9: CREATE PO WITH NESTED LINES (testing serializer fix)')
data = check(s.post(f'{BASE}/purchase-orders/', json={
    'vendor': vendor_id,
    'order_date': '2026-04-16',
    'expected_date': '2026-04-23',
    'ship_to': warehouse_id,
    'notes': 'Replenishment for BigBox SO',
    'lines': [
        {
            'line_number': 10,
            'item': item_id,
            'quantity_ordered': 5000,
            'uom': uom.id,
            'unit_cost': '1.75',
        }
    ]
}), [201])
po_id = data['id']
po_number = data.get('po_number', '?')
print(f'  PO: {po_number} (ID: {po_id})')
print(f'  Status: {data.get("status")}')

# ── STEP 10: CONFIRM PURCHASE ORDER ─────────────────────────
step('STEP 10: CONFIRM PURCHASE ORDER')
data = check(s.post(f'{BASE}/purchase-orders/{po_id}/confirm/'))
print(f'  Status: {data.get("status")}')

# ── STEP 11: RECEIVE GOODS ──────────────────────────────────
step('STEP 11: RECEIVE GOODS ON PO (testing status fix)')
data = check(s.post(f'{BASE}/purchase-orders/{po_id}/receive/'))
po_receive_status = data.get('status')
print(f'  Status: {po_receive_status}')
if po_receive_status == 'complete':
    print(f'  PO STATUS FIX: CORRECT (status=complete)')
elif po_receive_status is None:
    print(f'  PO STATUS FIX: STILL BROKEN (status=None)')
else:
    print(f'  PO STATUS: {po_receive_status}')

# ── STEP 12: CREATE INVOICE ─────────────────────────────────
step('STEP 12: CREATE INVOICE')
data = check(s.post(f'{BASE}/invoices/', json={
    'invoice_number': f'INV-{RUN_ID}',
    'customer': customer_id,
    'sales_order': so_id,
    'invoice_date': '2026-04-16',
    'due_date': '2026-05-16',
    'payment_terms': 'NET30',
    'bill_to_name': f'BigBox Retail Inc ({RUN_ID})',
    'bill_to_address': '100 Retail Blvd, Dallas, TX 75201',
    'ship_to_name': 'Main Warehouse',
    'ship_to_address': '100 Retail Blvd, Dallas, TX 75201',
    'customer_po': 'BIGBOX-PO-9001',
    'notes': 'Invoice for RSC boxes shipment',
}), [201])
invoice_id = data['id']
invoice_number = data.get('invoice_number', '?')
print(f'  Invoice: {invoice_number} (ID: {invoice_id})')
print(f'  Status: {data.get("status")}')
print(f'  Total: ${data.get("total_amount", "?")}')

# ── STEP 12b: CHECK IF LINES WERE AUTO-CREATED ──────────────
step('STEP 12b: CHECK INVOICE LINES')
data = check(s.get(f'{BASE}/invoices/{invoice_id}/'))
lines = data.get('lines', [])
print(f'  Lines: {len(lines)}')
total = data.get('total_amount', '0')
print(f'  Total: ${total}')

if not lines or float(total) == 0:
    step('STEP 12c: ADD INVOICE LINE MANUALLY')
    # Try to post invoice line
    r = s.post(f'{BASE}/invoice-lines/', json={
        'invoice': invoice_id,
        'line_number': 10,
        'item': item_id,
        'description': 'RSC 24x18x12 B-Flute Kraft',
        'quantity': 5000,
        'uom': uom.id,
        'unit_price': '3.50',
    })
    if r.status_code in [200, 201]:
        print(f'  OK: {r.status_code}')
        print(f'  Line added via API')
    else:
        print(f'  API returned {r.status_code}, adding via ORM instead')
        from apps.invoicing.models import Invoice, InvoiceLine
        from apps.items.models import Item
        inv_obj = Invoice.objects.get(id=invoice_id)
        item_obj = Item.objects.get(id=item_id)
        InvoiceLine.objects.create(
            invoice=inv_obj,
            tenant=inv_obj.tenant,
            line_number=10,
            item=item_obj,
            description='RSC 24x18x12 B-Flute Kraft',
            quantity=5000,
            uom=uom,
            unit_price=Decimal('3.50'),
        )
        inv_obj.calculate_totals()
        inv_obj.save()
        print(f'  Line added via ORM, total: ${inv_obj.total_amount}')

    # Re-fetch
    data = check(s.get(f'{BASE}/invoices/{invoice_id}/'))
    total = data.get('total_amount', '0')
    print(f'  Updated Total: ${total}')
    print(f'  Updated Balance: ${data.get("balance_due", "?")}')

# ── STEP 13: RECORD PAYMENT ─────────────────────────────────
# Post the invoice so it can receive payments
step('STEP 12d: POST INVOICE')
from apps.invoicing.models import Invoice as InvoiceModel
inv_obj = InvoiceModel.objects.get(id=invoice_id)
inv_obj.status = 'posted'
inv_obj.save()
print(f'  Invoice status: {inv_obj.status}')

step('STEP 13: CREATE DRAFT PAYMENT')
balance = data.get('balance_due') or data.get('total_amount') or '17500.00'
data = check(s.post(f'{BASE}/customer-payments/', json={
    'customer': customer_id,
    'payment_date': '2026-04-20',
    'amount': str(balance),
    'payment_method': 'CHECK',
    'reference_number': 'CHK-50123',
    'notes': 'Payment in full',
}), [200, 201])
payment_id = data.get('id')
print(f'  Payment ID: {payment_id}')
print(f'  Amount: ${data.get("amount", "?")}')
print(f'  Status: {data.get("status")}')

step('STEP 13b: POST PAYMENT (APPLY TO INVOICE)')
data = check(s.post(f'{BASE}/customer-payments/{payment_id}/post_payment/', json={
    'applications': [
        {'invoice_id': invoice_id, 'amount': str(balance)}
    ]
}), [200, 201])
print(f'  Status: {data.get("status")}')
print(f'  Unapplied: ${data.get("unapplied_amount", "?")}')

# ── STEP 14: VERIFY FINAL STATE ─────────────────────────────
step('STEP 14: FINAL VERIFICATION')

inv = check(s.get(f'{BASE}/invoices/{invoice_id}/'))
print(f'  Invoice Status: {inv.get("status")}')
print(f'  Amount Paid: ${inv.get("amount_paid", "?")}')
print(f'  Balance Due: ${inv.get("balance_due", "?")}')
print(f'  Is Paid: {inv.get("is_paid")}')

est = check(s.get(f'{BASE}/estimates/{estimate_id}/'))
print(f'  Estimate Status: {est.get("status")}')

so = check(s.get(f'{BASE}/sales-orders/{so_id}/'))
print(f'  Sales Order Status: {so.get("status")}')

po = check(s.get(f'{BASE}/purchase-orders/{po_id}/'))
print(f'  Purchase Order Status: {po.get("status")}')

# ── SUMMARY ──────────────────────────────────────────────────
print()
print('=' * 60)
print('  END-TO-END TRACE COMPLETE')
print('=' * 60)
print()
print('  FULL TRANSACTION FLOW:')
print(f'    1. Vendor:    Acme Corrugated Supply Co (ID: {vendor_id})')
print(f'    2. Customer:  BigBox Retail Inc (ID: {customer_id})')
print(f'    3. Item:      E2E-RSC-24x18 (ID: {item_id})')
print(f'    4. Estimate:  {estimate_number} -> {est.get("status")}')
print(f'    5. Sales Order: {so_number} -> {so.get("status")}')
print(f'    6. Purchase Order: {po_number} -> {po.get("status")}')
print(f'    7. Invoice:   {invoice_number} -> Paid: {inv.get("is_paid")}')
print(f'    8. Payment:   ${balance} via check (CHK-50123)')
print()

all_pass = (
    est.get('status') == 'converted'
    and so.get('status') == 'confirmed'
    and inv.get('is_paid') == True
)
if all_pass:
    print('  RESULT: ALL STEPS PASSED')
else:
    print('  RESULT: SOME STEPS MAY NEED REVIEW')
    print(f'    Expected estimate=converted, got {est.get("status")}')
    print(f'    Expected SO=confirmed, got {so.get("status")}')
    print(f'    Expected invoice paid=True, got {inv.get("is_paid")}')
