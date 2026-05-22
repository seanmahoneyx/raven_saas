"""
Backfill TenantSequence row for the new ItemReceipt (IR) sequence type.

Existing tenants were created before IR existed; without this migration they
would 500 the first time someone tries to receive goods because
get_next_sequence_number('IR') would raise DoesNotExist.
"""
from django.db import migrations


def backfill_ir(apps, schema_editor):
    Tenant = apps.get_model('tenants', 'Tenant')
    TenantSequence = apps.get_model('tenants', 'TenantSequence')

    for tenant in Tenant.objects.all():
        TenantSequence.objects.get_or_create(
            tenant=tenant,
            sequence_type='IR',
            defaults={'prefix': 'IR-', 'next_value': 1, 'padding': 6},
        )


def noop_reverse(apps, schema_editor):
    pass


class Migration(migrations.Migration):

    dependencies = [
        ('tenants', '0007_alter_tenantsequence_sequence_type'),
    ]

    operations = [
        migrations.RunPython(backfill_ir, noop_reverse),
    ]
