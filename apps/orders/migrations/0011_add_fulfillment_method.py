# Migration: add fulfillment_method to SalesOrderLine and PurchaseOrderLine

from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('orders', '0010_contract_type_and_direct_class'),
    ]

    operations = [
        migrations.AddField(
            model_name='salesorderline',
            name='fulfillment_method',
            field=models.CharField(
                blank=True,
                choices=[
                    ('stock', 'To Stock'),
                    ('direct', 'Direct Ship'),
                    ('crossdock', 'Crossdock'),
                ],
                help_text='How this line is fulfilled: stock=warehouse, direct=vendor to customer, crossdock=brief warehouse stay',
                max_length=20,
                null=True,
            ),
        ),
        migrations.AddField(
            model_name='purchaseorderline',
            name='fulfillment_method',
            field=models.CharField(
                blank=True,
                choices=[
                    ('stock', 'To Stock'),
                    ('direct', 'Direct Ship'),
                    ('crossdock', 'Crossdock'),
                ],
                help_text='How this line is fulfilled: stock=warehouse, direct=vendor to customer, crossdock=brief warehouse stay',
                max_length=20,
                null=True,
            ),
        ),
    ]
