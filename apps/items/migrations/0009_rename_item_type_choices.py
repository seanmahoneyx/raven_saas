# Migration: rename item_type choice values
# stockable -> inventory, direct_ship -> non_stockable

from django.db import migrations, models


def rename_item_types(apps, schema_editor):
    Item = apps.get_model('items', 'Item')
    Item.objects.filter(item_type='stockable').update(item_type='inventory')
    Item.objects.filter(item_type='direct_ship').update(item_type='non_stockable')
    # Also update historical records
    HistoricalItem = apps.get_model('items', 'HistoricalItem')
    HistoricalItem.objects.filter(item_type='stockable').update(item_type='inventory')
    HistoricalItem.objects.filter(item_type='direct_ship').update(item_type='non_stockable')


def reverse_rename_item_types(apps, schema_editor):
    Item = apps.get_model('items', 'Item')
    Item.objects.filter(item_type='inventory').update(item_type='stockable')
    Item.objects.filter(item_type='non_stockable').update(item_type='direct_ship')
    HistoricalItem = apps.get_model('items', 'HistoricalItem')
    HistoricalItem.objects.filter(item_type='inventory').update(item_type='stockable')
    HistoricalItem.objects.filter(item_type='non_stockable').update(item_type='direct_ship')


class Migration(migrations.Migration):

    dependencies = [
        ('items', '0008_replace_is_inventory_with_item_type'),
    ]

    operations = [
        # Data migration first
        migrations.RunPython(rename_item_types, reverse_rename_item_types),
        # Update the field choices on Item
        migrations.AlterField(
            model_name='item',
            name='item_type',
            field=models.CharField(
                choices=[
                    ('inventory', 'Inventory'),
                    ('non_stockable', 'Non-Stockable'),
                    ('crossdock', 'Crossdock'),
                    ('other_charge', 'Other Charge'),
                ],
                default='inventory',
                help_text='Inventory=warehouse stocked, Non-Stockable=direct/crossdock only, Crossdock=crossdock only, Other Charge=freight/misc charges',
                max_length=20,
            ),
        ),
        # Update the field choices on HistoricalItem
        migrations.AlterField(
            model_name='historicalitem',
            name='item_type',
            field=models.CharField(
                choices=[
                    ('inventory', 'Inventory'),
                    ('non_stockable', 'Non-Stockable'),
                    ('crossdock', 'Crossdock'),
                    ('other_charge', 'Other Charge'),
                ],
                default='inventory',
                help_text='Inventory=warehouse stocked, Non-Stockable=direct/crossdock only, Crossdock=crossdock only, Other Charge=freight/misc charges',
                max_length=20,
            ),
        ),
    ]
