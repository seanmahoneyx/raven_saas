"""
Generic field-level history API endpoint.

Uses django-simple-history to return change records for tracked models.
Compares consecutive history records to show per-field diffs.
"""
from django.apps import apps
from django.http import Http404
from rest_framework.views import APIView
from rest_framework.response import Response
from drf_spectacular.utils import extend_schema

# Models that have HistoricalRecords and are allowed via the API
HISTORY_MODELS = {
    'item': ('items', 'Item'),
    'pricelist': ('pricing', 'PriceListHead'),
    'inventorybalance': ('inventory', 'InventoryBalance'),
    'account': ('accounting', 'Account'),
    'journalentry': ('accounting', 'JournalEntry'),
    'invoice': ('invoicing', 'Invoice'),
}

# Fields to exclude from diff display
EXCLUDE_FIELDS = {
    'id', 'tenant', 'tenant_id', 'created_at', 'updated_at',
    'history_id', 'history_date', 'history_change_reason',
    'history_type', 'history_user', 'history_user_id',
}


def _get_field_verbose(model_class, field_name):
    """Get human-readable field name from model."""
    try:
        field = model_class._meta.get_field(field_name)
        return field.verbose_name.title() if hasattr(field, 'verbose_name') else field_name
    except Exception:
        return field_name.replace('_', ' ').title()


def _diff_records(newer, older, model_class):
    """Compare two history records and return list of changed fields."""
    changes = []
    for field in newer.instance_type._meta.fields:
        name = field.attname
        if name in EXCLUDE_FIELDS:
            continue
        old_val = getattr(older, name, None) if older else None
        new_val = getattr(newer, name, None)
        if old_val != new_val:
            changes.append({
                'field': _get_field_verbose(model_class, name),
                'field_name': name,
                'old_value': str(old_val) if old_val is not None else None,
                'new_value': str(new_val) if new_val is not None else None,
            })
    return changes


class ModelHistoryView(APIView):
    """
    GET /api/v1/history/{model_type}/{object_id}/

    Returns field-level change history for a tracked model instance.
    """

    @extend_schema(
        tags=['history'],
        summary='Get field-level change history for a model instance',
    )
    def get(self, request, model_type, object_id):
        if model_type not in HISTORY_MODELS:
            raise Http404(f"History not available for '{model_type}'")

        app_label, model_name = HISTORY_MODELS[model_type]
        model_class = apps.get_model(app_label, model_name)

        # Verify object exists and belongs to tenant
        try:
            obj = model_class.objects.get(
                pk=object_id,
                tenant=request.tenant,
            )
        except model_class.DoesNotExist:
            raise Http404("Object not found")

        # Get historical records ordered by date descending
        history_qs = obj.history.all().order_by('-history_date')
        records = list(history_qs[:100])  # cap at 100 entries

        result = []
        for i, record in enumerate(records):
            older = records[i + 1] if i + 1 < len(records) else None

            history_type_map = {'+': 'Created', '~': 'Changed', '-': 'Deleted'}
            action = history_type_map.get(record.history_type, 'Changed')

            changes = _diff_records(record, older, model_class)

            # Skip entries with no actual changes (unless it's a creation)
            if not changes and action != 'Created':
                continue

            result.append({
                'id': record.history_id,
                'timestamp': record.history_date.isoformat(),
                'user': (
                    record.history_user.get_full_name() or record.history_user.email
                    if record.history_user else 'System'
                ),
                'action': action,
                'changes': changes,
            })

        return Response(result)
