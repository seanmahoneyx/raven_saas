"""
Inventory importer — snapshot-mode: sets InventoryBalance.on_hand and
creates an ADJUST InventoryTransaction for the delta.
"""
from apps.items.models import Item
from apps.warehousing.models import Warehouse
from apps.inventory.models import InventoryBalance, InventoryTransaction
from .base import BaseCsvImporter


class InventoryImporter(BaseCsvImporter):
    """
    Import inventory balances from CSV (snapshot mode).

    Required columns: SKU, WarehouseCode, OnHand
    """
    required_columns = ['SKU', 'WarehouseCode', 'OnHand']

    def validate_row(self, row_num, row):
        errors = []

        sku = row.get('SKU', '')
        warehouse_code = row.get('WarehouseCode', '')
        on_hand_str = row.get('OnHand', '')

        if not sku:
            errors.append(f"Row {row_num}: SKU is required.")
        if not warehouse_code:
            errors.append(f"Row {row_num}: WarehouseCode is required.")
        if not on_hand_str:
            errors.append(f"Row {row_num}: OnHand is required.")

        if sku and not Item.objects.filter(tenant=self.tenant, sku=sku).exists():
            errors.append(f"Row {row_num}: SKU '{sku}' not found.")

        if warehouse_code and not Warehouse.objects.filter(tenant=self.tenant, code=warehouse_code).exists():
            errors.append(f"Row {row_num}: WarehouseCode '{warehouse_code}' not found.")

        if on_hand_str:
            try:
                val = int(on_hand_str)
                if val < 0:
                    errors.append(f"Row {row_num}: OnHand must be a non-negative integer.")
            except (ValueError, TypeError):
                errors.append(f"Row {row_num}: OnHand '{on_hand_str}' is not a valid integer.")

        return errors

    def process_row(self, row_num, row):
        # F9: handle concurrent delete gracefully with a descriptive message.
        try:
            item = Item.objects.get(tenant=self.tenant, sku=row['SKU'])
            warehouse = Warehouse.objects.get(tenant=self.tenant, code=row['WarehouseCode'])
        except (Item.DoesNotExist, Warehouse.DoesNotExist) as e:
            raise ValueError(f"Row {row_num}: {e}")

        new_on_hand = int(row['OnHand'])

        balance, was_created = InventoryBalance.objects.get_or_create(
            tenant=self.tenant,
            item=item,
            warehouse=warehouse,
            defaults={'on_hand': 0, 'allocated': 0, 'on_order': 0},
        )

        delta = new_on_hand - balance.on_hand
        balance.on_hand = new_on_hand
        balance.save()

        # F8: skip ADJUST transaction when delta == 0.
        if delta != 0:
            InventoryTransaction.objects.create(
                tenant=self.tenant,
                transaction_type='ADJUST',
                item=item,
                warehouse=warehouse,
                quantity=delta,
                reference_type='IMPORT',
                reference_number='Initial seed import',
                user=self.user,
                balance_on_hand=new_on_hand,
                balance_allocated=balance.allocated,
                notes='Snapshot CSV import',
            )

        return 'created' if was_created else 'updated'
