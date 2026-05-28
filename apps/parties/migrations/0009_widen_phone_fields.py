from django.db import migrations, models


class Migration(migrations.Migration):
    """Widen phone fields to 50 chars so formatted numbers with extensions
    (e.g. "+1 (631) 821-6567 ext. 1234") don't overflow varchar(30)/varchar(20)
    during CSV imports of real customer/vendor data."""

    dependencies = [
        ('parties', '0008_update_customer_type_choices'),
    ]

    operations = [
        migrations.AlterField(
            model_name='party',
            name='main_phone',
            field=models.CharField(blank=True, help_text='Primary phone number', max_length=50),
        ),
        migrations.AlterField(
            model_name='location',
            name='phone',
            field=models.CharField(blank=True, help_text='Location contact phone', max_length=50),
        ),
    ]
