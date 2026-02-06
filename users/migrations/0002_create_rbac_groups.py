# users/migrations/0002_create_rbac_groups.py
"""Create initial RBAC groups with permissions."""
from django.db import migrations


def create_groups(apps, schema_editor):
    Group = apps.get_model('auth', 'Group')
    Permission = apps.get_model('auth', 'Permission')

    # Define groups and their permission codenames
    groups_config = {
        'Admin': None,  # Gets all permissions
        'Sales': [
            # Customers
            'view_customer', 'add_customer', 'change_customer',
            'view_party', 'add_party', 'change_party',
            # Orders
            'view_salesorder', 'add_salesorder', 'change_salesorder',
            'view_estimate', 'add_estimate', 'change_estimate',
            # Invoicing
            'view_invoice', 'add_invoice', 'change_invoice',
            # Payments
            'view_customerpayment', 'add_customerpayment', 'change_customerpayment',
            # Items (view only)
            'view_item',
            # Contracts
            'view_contract', 'add_contract', 'change_contract',
            # Reports
            'view_reportdefinition',
        ],
        'Warehouse': [
            # Inventory
            'view_inventorybalance', 'change_inventorybalance',
            'view_inventorytransaction', 'add_inventorytransaction',
            'view_inventorylot', 'add_inventorylot', 'change_inventorylot',
            'view_inventorypallet', 'add_inventorypallet', 'change_inventorypallet',
            # Warehousing
            'view_warehouse', 'view_bin',
            # WMS
            'view_warehouselocation', 'add_warehouselocation', 'change_warehouselocation',
            'view_lot', 'add_lot', 'change_lot',
            # Shipping
            'view_shipment', 'add_shipment', 'change_shipment',
            'view_billoflading', 'add_billoflading', 'change_billoflading',
            # Items (view only)
            'view_item',
            # Orders (view only)
            'view_salesorder', 'view_purchaseorder',
        ],
        'Driver': [
            # Logistics
            'view_licenseplate', 'change_licenseplate',
            'view_deliverystop', 'change_deliverystop',
            # Shipping (view only)
            'view_shipment', 'view_billoflading',
        ],
        'Purchasing': [
            # Purchase Orders
            'view_purchaseorder', 'add_purchaseorder', 'change_purchaseorder',
            # RFQs
            'view_rfq', 'add_rfq', 'change_rfq',
            # Vendors
            'view_vendor', 'add_vendor', 'change_vendor',
            'view_party', 'add_party', 'change_party',
            # Items
            'view_item', 'add_item', 'change_item',
            # Vendor Bills
            'view_vendorbill', 'add_vendorbill', 'change_vendorbill',
            # Cost Lists
            'view_costlist', 'add_costlist', 'change_costlist',
        ],
    }

    for group_name, codenames in groups_config.items():
        group, _ = Group.objects.get_or_create(name=group_name)

        if codenames is None:
            # Admin gets all permissions
            group.permissions.set(Permission.objects.all())
        else:
            perms = Permission.objects.filter(codename__in=codenames)
            group.permissions.set(perms)


def remove_groups(apps, schema_editor):
    Group = apps.get_model('auth', 'Group')
    Group.objects.filter(name__in=['Admin', 'Sales', 'Warehouse', 'Driver', 'Purchasing']).delete()


class Migration(migrations.Migration):
    dependencies = [
        ('users', '0001_initial'),
    ]

    operations = [
        migrations.RunPython(create_groups, remove_groups),
    ]
