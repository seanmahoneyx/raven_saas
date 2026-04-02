from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('new_warehousing', '0004_stockquant_quant_reserved_lte_qty'),
    ]

    operations = [
        migrations.AddField(
            model_name='warehouse',
            name='pallet_capacity',
            field=models.PositiveIntegerField(blank=True, help_text='Maximum number of pallet slots in this warehouse', null=True),
        ),
    ]
