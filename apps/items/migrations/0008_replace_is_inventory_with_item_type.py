# Generated migration: replace is_inventory BooleanField with item_type CharField

from django.db import migrations, models


def set_item_type_from_is_inventory(apps, schema_editor):
    """Data migration: set item_type based on old is_inventory value."""
    Item = apps.get_model('items', 'Item')
    # Items where is_inventory=False get item_type='other_charge'
    Item.objects.filter(is_inventory=False).update(item_type='other_charge')
    # Items where is_inventory=True keep the default 'stockable'


def reverse_item_type_to_is_inventory(apps, schema_editor):
    """Reverse data migration: restore is_inventory from item_type."""
    Item = apps.get_model('items', 'Item')
    Item.objects.exclude(item_type='other_charge').update(is_inventory=True)
    Item.objects.filter(item_type='other_charge').update(is_inventory=False)


class Migration(migrations.Migration):

    dependencies = [
        ('items', '0007_add_product_card_notes'),
    ]

    operations = [
        # Step 1: Add item_type field with default='stockable'
        migrations.AddField(
            model_name='item',
            name='item_type',
            field=models.CharField(
                choices=[
                    ('stockable', 'Stockable'),
                    ('crossdock', 'Crossdock'),
                    ('direct_ship', 'Direct Ship'),
                    ('other_charge', 'Other Charge'),
                ],
                default='stockable',
                help_text='Stockable=warehouse inventory, Crossdock=brief warehouse stay, Direct Ship=vendor to customer, Other Charge=freight/misc charges',
                max_length=20,
            ),
        ),
        migrations.AddField(
            model_name='historicalitem',
            name='item_type',
            field=models.CharField(
                choices=[
                    ('stockable', 'Stockable'),
                    ('crossdock', 'Crossdock'),
                    ('direct_ship', 'Direct Ship'),
                    ('other_charge', 'Other Charge'),
                ],
                default='stockable',
                help_text='Stockable=warehouse inventory, Crossdock=brief warehouse stay, Direct Ship=vendor to customer, Other Charge=freight/misc charges',
                max_length=20,
            ),
        ),
        # Step 2: Data migration
        migrations.RunPython(
            set_item_type_from_is_inventory,
            reverse_code=reverse_item_type_to_is_inventory,
        ),
        # Step 3: Remove old is_inventory field
        migrations.RemoveField(
            model_name='item',
            name='is_inventory',
        ),
        migrations.RemoveField(
            model_name='historicalitem',
            name='is_inventory',
        ),
        # Step 4: Add index for item_type
        migrations.AddIndex(
            model_name='item',
            index=models.Index(fields=['tenant', 'item_type'], name='items_item_tenant_item_type_idx'),
        ),
    ]
