"""
Backfill TenantSequence rows for every existing tenant.

Up to now, auto-numbered models (SalesOrder.order_number, etc.) computed
their next number with `max(existing_numbers) + 1` in plain queries. That
worked but is racy under concurrent writes. We now route everything
through TenantSequence + select_for_update().

This migration:
  1. Creates any missing TenantSequence rows for every existing tenant
     (older tenants were created before EST / RFQ / FA / JE were in the
     signal's sequence_configs).
  2. Re-aligns each sequence's next_value to max(existing_data) + 1 so
     the first call after this migration cannot collide with a record
     already in the DB.
"""
import re
from django.db import migrations


SEQUENCE_CONFIGS = [
    # (sequence_type, prefix, padding, ('app_label', 'ModelName', 'field_name'))
    ('SO', 'SO-', 6, ('orders', 'SalesOrder', 'order_number')),
    ('PO', 'PO-', 6, ('orders', 'PurchaseOrder', 'po_number')),
    ('INV', 'INV-', 6, ('invoicing', 'Invoice', 'invoice_number')),
    ('BOL', 'BOL-', 6, ('shipping', 'BillOfLading', 'bol_number')),
    ('CONTRACT', 'CTR-', 6, ('contracts', 'Contract', 'contract_number')),
    ('JE', 'JE-', 6, ('accounting', 'JournalEntry', 'entry_number')),
    ('EST', 'EST-', 6, ('orders', 'Estimate', 'estimate_number')),
    ('RFQ', 'RFQ-', 6, ('orders', 'RFQ', 'rfq_number')),
    ('FA', 'FA-', 6, ('assets', 'FixedAsset', 'asset_number')),
]


def _max_numeric_suffix(Model, field_name, tenant):
    """Find the largest numeric suffix in `Model.field_name` for this tenant."""
    if Model is None:
        return 0
    values = Model.objects.filter(tenant=tenant).values_list(field_name, flat=True)
    max_num = 0
    for v in values:
        if not v:
            continue
        match = re.search(r'(\d+)', v)
        if match:
            num = int(match.group(1))
            if num > max_num:
                max_num = num
    return max_num


def backfill_sequences(apps, schema_editor):
    Tenant = apps.get_model('tenants', 'Tenant')
    TenantSequence = apps.get_model('tenants', 'TenantSequence')

    for tenant in Tenant.objects.all():
        for seq_type, prefix, padding, (app_label, model_name, field_name) in SEQUENCE_CONFIGS:
            try:
                Model = apps.get_model(app_label, model_name)
            except LookupError:
                Model = None  # App not installed / model missing — skip data lookup
            max_existing = _max_numeric_suffix(Model, field_name, tenant) if Model else 0
            next_value = max_existing + 1

            seq, created = TenantSequence.objects.get_or_create(
                tenant=tenant,
                sequence_type=seq_type,
                defaults={'prefix': prefix, 'next_value': next_value, 'padding': padding},
            )
            if not created and seq.next_value <= max_existing:
                seq.next_value = next_value
                seq.save(update_fields=['next_value'])


def noop_reverse(apps, schema_editor):
    """Reverse is a no-op: we don't delete sequence rows on rollback."""
    pass


class Migration(migrations.Migration):

    dependencies = [
        ('tenants', '0005_alter_tenantsequence_sequence_type'),
    ]

    operations = [
        migrations.RunPython(backfill_sequences, noop_reverse),
    ]
