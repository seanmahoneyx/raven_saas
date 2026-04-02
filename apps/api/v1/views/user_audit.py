# apps/api/v1/views/user_audit.py
"""
User Audit Report API endpoint.

Aggregates change history across all django-simple-history tracked models,
filtered by user, date range, and model type. Admin-only.
"""
from datetime import datetime

from django.apps import apps
from django.db.models import Q
from rest_framework.views import APIView
from rest_framework.response import Response
from rest_framework.permissions import IsAdminUser
from drf_spectacular.utils import extend_schema


# All tracked models: key -> (app_label, model_name, display_label)
AUDIT_MODELS = {
    'item': ('items', 'Item', 'Item'),
    'corrugateditem': ('items', 'CorrugatedItem', 'Corrugated Item'),
    'packagingitem': ('items', 'PackagingItem', 'Packaging Item'),
    'salesorder': ('orders', 'SalesOrder', 'Sales Order'),
    'salesorderline': ('orders', 'SalesOrderLine', 'SO Line'),
    'purchaseorder': ('orders', 'PurchaseOrder', 'Purchase Order'),
    'purchaseorderline': ('orders', 'PurchaseOrderLine', 'PO Line'),
    'estimate': ('orders', 'Estimate', 'Estimate'),
    'estimateline': ('orders', 'EstimateLine', 'Estimate Line'),
    'invoice': ('invoicing', 'Invoice', 'Invoice'),
    'invoiceline': ('invoicing', 'InvoiceLine', 'Invoice Line'),
    'contract': ('contracts', 'Contract', 'Contract'),
    'payment': ('payments', 'Payment', 'Payment'),
    'inventorybalance': ('inventory', 'InventoryBalance', 'Inventory'),
    'shipment': ('shipping', 'Shipment', 'Shipment'),
    'receipt': ('shipping', 'Receipt', 'Receipt'),
    'designrequest': ('design', 'DesignRequest', 'Design Request'),
    'account': ('accounting', 'Account', 'Account'),
    'journalentry': ('accounting', 'JournalEntry', 'Journal Entry'),
    'pricelisthead': ('pricing', 'PriceListHead', 'Price List'),
    'shipment_logistics': ('logistics', 'Shipment', 'Logistics Shipment'),
    'delivery': ('logistics', 'Delivery', 'Delivery'),
}

HISTORY_TYPE_MAP = {'+': 'Created', '~': 'Changed', '-': 'Deleted'}

EXCLUDE_FIELDS = {
    'id', 'tenant', 'tenant_id', 'created_at', 'updated_at',
    'history_id', 'history_date', 'history_change_reason',
    'history_type', 'history_user', 'history_user_id',
}


def _get_record_label(model_class, record):
    """Try to get a human-readable label for the history record."""
    for attr in ['sku', 'order_number', 'invoice_number', 'contract_number', 'name', 'code']:
        val = getattr(record, attr, None)
        if val:
            return str(val)
    # Fall back to PK
    pk_field = model_class._meta.pk.attname if model_class._meta.pk else 'id'
    return f"#{getattr(record, pk_field, '?')}"


def _summarize_changes(record, older, model_class):
    """Return a brief summary of what changed."""
    if record.history_type == '+':
        return 'Record created'
    if record.history_type == '-':
        return 'Record deleted'

    changes = []
    for field in record.instance_type._meta.fields:
        name = field.attname
        if name in EXCLUDE_FIELDS:
            continue
        old_val = getattr(older, name, None) if older else None
        new_val = getattr(record, name, None)
        if old_val != new_val:
            verbose = name.replace('_', ' ').replace(' id', '').title()
            changes.append(verbose)

    if not changes:
        return 'No field changes'
    if len(changes) <= 3:
        return ', '.join(changes)
    return f"{', '.join(changes[:3])} +{len(changes) - 3} more"


class UserAuditReportView(APIView):
    """
    GET /api/v1/reports/user-audit/

    Returns aggregated audit trail across all tracked models.
    Admin-only. Supports filtering by user, date range, model types.

    Query params:
    - user_id: Filter by specific user (optional, shows all users if omitted)
    - date_from: Start date YYYY-MM-DD (optional)
    - date_to: End date YYYY-MM-DD (optional)
    - model_types: Comma-separated model keys to include (optional, all if omitted)
    - action_types: Comma-separated action types: created,changed,deleted (optional)
    - limit: Max results (default 200, max 500)
    """
    permission_classes = [IsAdminUser]

    @extend_schema(
        tags=['reports'],
        summary='User audit report - all changes across models',
    )
    def get(self, request):
        user_id = request.query_params.get('user_id')
        date_from = request.query_params.get('date_from')
        date_to = request.query_params.get('date_to')
        model_types_param = request.query_params.get('model_types')
        action_types_param = request.query_params.get('action_types')
        limit = min(int(request.query_params.get('limit', 200)), 500)

        # Determine which models to query
        if model_types_param:
            selected_keys = [k.strip() for k in model_types_param.split(',')]
        else:
            selected_keys = list(AUDIT_MODELS.keys())

        # Build action type filter
        action_filter = None
        if action_types_param:
            type_map = {'created': '+', 'changed': '~', 'deleted': '-'}
            action_filter = [type_map[a.strip()] for a in action_types_param.split(',') if a.strip() in type_map]

        all_records = []

        for key in selected_keys:
            if key not in AUDIT_MODELS:
                continue
            app_label, model_name, display_label = AUDIT_MODELS[key]

            try:
                model_class = apps.get_model(app_label, model_name)
            except LookupError:
                continue

            if not hasattr(model_class, 'history'):
                continue

            qs = model_class.history.filter(
                **({'tenant': request.tenant} if hasattr(model_class, 'tenant') else {})
            )

            if user_id:
                qs = qs.filter(history_user_id=user_id)
            if date_from:
                qs = qs.filter(history_date__date__gte=datetime.strptime(date_from, '%Y-%m-%d').date())
            if date_to:
                qs = qs.filter(history_date__date__lte=datetime.strptime(date_to, '%Y-%m-%d').date())
            if action_filter:
                qs = qs.filter(history_type__in=action_filter)

            records = list(qs.select_related('history_user').order_by('-history_date')[:limit])

            for i, record in enumerate(records):
                # Find the previous record for this same object to compute changes
                older = None
                if record.history_type == '~':
                    try:
                        pk_val = getattr(record, model_class._meta.pk.attname)
                        older = model_class.history.filter(
                            **{model_class._meta.pk.attname: pk_val},
                            history_date__lt=record.history_date,
                        ).order_by('-history_date').first()
                    except Exception:
                        pass

                all_records.append({
                    'timestamp': record.history_date.isoformat(),
                    'user': (
                        record.history_user.get_full_name() or record.history_user.username
                        if record.history_user else 'System'
                    ),
                    'user_id': record.history_user_id,
                    'action': HISTORY_TYPE_MAP.get(record.history_type, 'Changed'),
                    'model_type': key,
                    'model_label': display_label,
                    'record_label': _get_record_label(model_class, record),
                    'summary': _summarize_changes(record, older, model_class),
                })

        # Sort all records by timestamp descending, then trim to limit
        all_records.sort(key=lambda r: r['timestamp'], reverse=True)
        all_records = all_records[:limit]

        # Also return available model types and user list for filters
        return Response({
            'results': all_records,
            'available_models': [
                {'key': k, 'label': v[2]} for k, v in AUDIT_MODELS.items()
            ],
        })
