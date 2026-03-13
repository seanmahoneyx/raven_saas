# apps/favorites/models.py
"""
Favorites & Recents models.

UserFavorite: Explicit user-pinned entities for quick access in search dropdowns.
UserRecentView: Implicitly tracked entity views for recents and frequency ranking.
"""
from django.conf import settings
from django.db import models
from shared.models import TenantMixin, TimestampMixin


ENTITY_TYPE_CHOICES = [
    ('customer', 'Customer'),
    ('vendor', 'Vendor'),
    ('item', 'Item'),
    ('contact', 'Contact'),
    ('contract', 'Contract'),
    ('sales_order', 'Sales Order'),
    ('purchase_order', 'Purchase Order'),
    ('rfq', 'RFQ'),
    ('estimate', 'Estimate'),
    ('invoice', 'Invoice'),
    ('price_list', 'Price List'),
    ('design_request', 'Design Request'),
    ('account', 'Account'),
    ('journal_entry', 'Journal Entry'),
]

ENTITY_TYPE_VALUES = [c[0] for c in ENTITY_TYPE_CHOICES]


class UserFavorite(TenantMixin, TimestampMixin):
    """Explicit user-pinned entity for quick access in search dropdowns."""
    user = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name='favorites',
    )
    entity_type = models.CharField(max_length=30, choices=ENTITY_TYPE_CHOICES)
    object_id = models.PositiveBigIntegerField()
    label = models.CharField(max_length=255, help_text='Cached display name for fast rendering')

    class Meta:
        unique_together = [('tenant', 'user', 'entity_type', 'object_id')]
        indexes = [
            models.Index(fields=['tenant', 'user', 'entity_type']),
        ]
        ordering = ['-created_at']

    def __str__(self):
        return f'{self.user} \u2605 {self.entity_type}:{self.object_id} ({self.label})'


class UserRecentView(TenantMixin):
    """Implicitly tracked entity view for recents and frequency ranking."""
    user = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name='recent_views',
    )
    entity_type = models.CharField(max_length=30, choices=ENTITY_TYPE_CHOICES)
    object_id = models.PositiveBigIntegerField()
    label = models.CharField(max_length=255, help_text='Cached display name for fast rendering')
    view_count = models.PositiveIntegerField(default=1)
    last_viewed_at = models.DateTimeField(auto_now=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        unique_together = [('tenant', 'user', 'entity_type', 'object_id')]
        indexes = [
            models.Index(fields=['tenant', 'user', 'entity_type', 'last_viewed_at']),
        ]
        ordering = ['-last_viewed_at']

    def __str__(self):
        return f'{self.user} viewed {self.entity_type}:{self.object_id} x{self.view_count}'


def get_entity_label(entity_type, object_id, tenant=None):
    """
    Resolve a cached display label for a given entity type and object ID.

    Imports models lazily to avoid circular imports. Returns None if the
    entity does not exist or the type is not recognized.

    Args:
        entity_type: One of ENTITY_TYPE_VALUES.
        object_id: Primary key of the entity.
        tenant: Optional tenant instance to scope the query.

    Returns:
        str label or None.
    """
    try:
        if entity_type == 'customer':
            from apps.parties.models import Customer
            qs = Customer.objects.select_related('party')
            if tenant:
                qs = qs.filter(tenant=tenant)
            obj = qs.get(pk=object_id)
            return obj.party.display_name

        elif entity_type == 'vendor':
            from apps.parties.models import Vendor
            qs = Vendor.objects.select_related('party')
            if tenant:
                qs = qs.filter(tenant=tenant)
            obj = qs.get(pk=object_id)
            return obj.party.display_name

        elif entity_type == 'item':
            from apps.items.models import Item
            qs = Item.objects.all()
            if tenant:
                qs = qs.filter(tenant=tenant)
            obj = qs.get(pk=object_id)
            return f"{obj.sku} \u2013 {obj.name}"

        elif entity_type == 'contact':
            from apps.contacts.models import Contact
            qs = Contact.objects.all()
            if tenant:
                qs = qs.filter(tenant=tenant)
            obj = qs.get(pk=object_id)
            return f"{obj.first_name} {obj.last_name}"

        elif entity_type == 'contract':
            from apps.contracts.models import Contract
            qs = Contract.objects.all()
            if tenant:
                qs = qs.filter(tenant=tenant)
            obj = qs.get(pk=object_id)
            return obj.contract_number

        elif entity_type == 'sales_order':
            from apps.orders.models import SalesOrder
            qs = SalesOrder.objects.all()
            if tenant:
                qs = qs.filter(tenant=tenant)
            obj = qs.get(pk=object_id)
            return f"SO-{obj.order_number}"

        elif entity_type == 'purchase_order':
            from apps.orders.models import PurchaseOrder
            qs = PurchaseOrder.objects.all()
            if tenant:
                qs = qs.filter(tenant=tenant)
            obj = qs.get(pk=object_id)
            return f"PO-{obj.po_number}"

        elif entity_type == 'rfq':
            from apps.orders.models import RFQ
            qs = RFQ.objects.all()
            if tenant:
                qs = qs.filter(tenant=tenant)
            obj = qs.get(pk=object_id)
            return f"RFQ-{obj.rfq_number}"

        elif entity_type == 'estimate':
            from apps.orders.models import Estimate
            qs = Estimate.objects.all()
            if tenant:
                qs = qs.filter(tenant=tenant)
            obj = qs.get(pk=object_id)
            return f"EST-{obj.estimate_number}"

        elif entity_type == 'invoice':
            from apps.invoicing.models import Invoice
            qs = Invoice.objects.all()
            if tenant:
                qs = qs.filter(tenant=tenant)
            obj = qs.get(pk=object_id)
            return f"INV-{obj.invoice_number}"

        elif entity_type == 'price_list':
            from apps.pricing.models import PriceListHead
            qs = PriceListHead.objects.select_related('customer__party', 'item')
            if tenant:
                qs = qs.filter(tenant=tenant)
            obj = qs.get(pk=object_id)
            return str(obj)

        elif entity_type == 'design_request':
            from apps.design.models import DesignRequest
            qs = DesignRequest.objects.all()
            if tenant:
                qs = qs.filter(tenant=tenant)
            obj = qs.get(pk=object_id)
            return obj.file_number or str(obj.pk)

        elif entity_type == 'account':
            from apps.accounting.models import Account
            qs = Account.objects.all()
            if tenant:
                qs = qs.filter(tenant=tenant)
            obj = qs.get(pk=object_id)
            return f"{obj.code} - {obj.name}"

        elif entity_type == 'journal_entry':
            from apps.accounting.models import JournalEntry
            qs = JournalEntry.objects.all()
            if tenant:
                qs = qs.filter(tenant=tenant)
            obj = qs.get(pk=object_id)
            return obj.entry_number

    except Exception:
        return None

    return None
