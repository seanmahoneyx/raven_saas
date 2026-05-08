"""
CSV template definitions for all import types.

Each entry provides headers and one example row so users can download
a pre-formatted template before importing data.
"""
import csv
import io


TEMPLATES = {
    'locations': {
        'headers': ['Name', 'Barcode', 'Warehouse', 'Type', 'Zone'],
        'example_row': ['A-01-01', 'BC-A0101', 'MAIN', 'STORAGE', 'Zone A'],
    },
    'parties': {
        'headers': ['Code', 'Name', 'Type', 'LegalName', 'Email', 'Phone', 'Notes'],
        'example_row': ['ACME', 'Acme Corp', 'CUSTOMER', 'Acme Corporation Inc', 'info@acme.com', '555-1234', ''],
    },
    'items': {
        'headers': ['SKU', 'Name', 'UOM', 'Description', 'Division', 'PurchDesc', 'SellDesc',
                    'SecondaryIdent', 'ReorderPoint', 'MinStock'],
        'example_row': ['MSPN-000001', 'Widget Box 12x12x12', 'EA', '12 inch cube box', 'corrugated',
                        'Corrugated box 12x12x12', 'Box 12x12x12', 'WB-12', '50', '25'],
    },
    'gl-opening-balances': {
        'headers': ['AccountCode', 'Debit', 'Credit', 'Description'],
        'example_row': ['1000', '10000.00', '0.00', 'Opening cash balance'],
    },
    'warehouses': {
        'headers': ['Code', 'Name', 'IsDefault', 'PalletCapacity', 'Notes'],
        'example_row': ['MAIN', 'Main Warehouse', 'true', '500', 'Primary fulfillment warehouse'],
    },
    'customers': {
        'headers': ['Code', 'Name', 'PaymentTerms', 'LegalName', 'Email', 'Phone', 'Notes',
                    'CustomerType', 'TaxCode', 'ResaleNumber', 'CreditLimit', 'ChargeFreight',
                    'Address1', 'Address2', 'City', 'State', 'PostalCode', 'Country'],
        'example_row': ['CUST001', 'Acme Corp', 'NET30', 'Acme Corporation Inc', 'ar@acme.com',
                        '555-1000', '', 'INDUSTRIAL', '', '', '50000.00', 'true',
                        '100 Industrial Blvd', 'Suite 200', 'Chicago', 'IL', '60601', 'USA'],
    },
    'vendors': {
        'headers': ['Code', 'Name', 'PaymentTerms', 'LegalName', 'Email', 'Phone', 'Notes',
                    'VendorType', 'TaxCode', 'TaxId', 'CreditLimit', 'ChargeFreight',
                    'Address1', 'Address2', 'City', 'State', 'PostalCode', 'Country'],
        'example_row': ['VEND001', 'Supply Co', 'NET60', 'Supply Company LLC', 'ap@supply.com',
                        '555-2000', '', 'SUPPLIER', '', '12-3456789', '', 'true',
                        '200 Commerce Dr', '', 'Atlanta', 'GA', '30301', 'USA'],
    },
    'inventory': {
        'headers': ['SKU', 'WarehouseCode', 'OnHand'],
        'example_row': ['MSPN-000001', 'MAIN', '100'],
    },
}


def build_template_csv(import_type: str) -> tuple:
    """
    Returns (filename, csv_bytes).

    Raises KeyError if import_type is not recognized.
    """
    template = TEMPLATES[import_type]  # raises KeyError if unknown
    headers = template['headers']
    example_row = template['example_row']

    buf = io.StringIO()
    writer = csv.writer(buf)
    writer.writerow(headers)
    writer.writerow(example_row)

    filename = f"{import_type}-template.csv"
    csv_bytes = buf.getvalue().encode('utf-8')
    return filename, csv_bytes
