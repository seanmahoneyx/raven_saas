from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('items', '0014_add_dc_height'),
    ]

    operations = [
        migrations.AddField(
            model_name='item',
            name='secondary_ident',
            field=models.CharField(blank=True, help_text='Optional secondary identifier (customer part #, alt name, etc.)', max_length=255),
        ),
        migrations.AddField(
            model_name='item',
            name='extra_info_lines',
            field=models.JSONField(blank=True, default=list, help_text='Structured per-item complications (handhole, score, perforation, WRA, etc.)'),
        ),
    ]
