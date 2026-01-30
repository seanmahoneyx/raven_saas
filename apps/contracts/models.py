# apps/contracts/models.py
"""
Contract models for managing blanket purchase orders.

Models:
- Contract: Blanket order header with customer commitment
- ContractLine: Line items with committed quantities per item
- ContractRelease: Links releases to sales order lines, tracks balance drawdown
"""
from django.db import models
from django.db.models import Sum
from django.utils import timezone
from simple_history.models import HistoricalRecords
from shared.models import TenantMixin, TimestampMixin


class Contract(TenantMixin, TimestampMixin):
    """
    Blanket Order / Contract Header.

    Represents a commitment from a customer to purchase items over time.
    Each contract can include multiple items with different committed quantities.
    Individual releases draw down from the contract balance.
    """
    STATUS_CHOICES = [
        ('draft', 'Draft'),
        ('active', 'Active'),
        ('complete', 'Completed'),
        ('cancelled', 'Cancelled'),
        ('expired', 'Expired'),
    ]

    customer = models.ForeignKey(
        'parties.Customer',
        on_delete=models.PROTECT,
        related_name='contracts',
        help_text="Customer this contract belongs to"
    )
    contract_number = models.CharField(
        max_length=50,
        help_text="Internal contract number (auto-generated, unique per tenant)"
    )
    blanket_po = models.CharField(
        max_length=100,
        blank=True,
        help_text="Customer's blanket PO reference number"
    )
    status = models.CharField(
        max_length=20,
        choices=STATUS_CHOICES,
        default='draft',
        help_text="Current contract status"
    )
    issue_date = models.DateField(
        default=timezone.now,
        help_text="Date contract was issued/created"
    )
    start_date = models.DateField(
        null=True,
        blank=True,
        help_text="Contract effective start date"
    )
    end_date = models.DateField(
        null=True,
        blank=True,
        help_text="Contract expiration date (null = no expiration)"
    )
    ship_to = models.ForeignKey(
        'parties.Location',
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='contracts_ship_to',
        help_text="Default shipping location for releases"
    )
    notes = models.TextField(
        blank=True,
        help_text="Contract terms, notes, special instructions"
    )

    # Audit trail
    history = HistoricalRecords()

    class Meta:
        verbose_name = "Contract"
        verbose_name_plural = "Contracts"
        unique_together = [('tenant', 'contract_number')]
        indexes = [
            models.Index(fields=['tenant', 'contract_number']),
            models.Index(fields=['tenant', 'customer', 'status']),
            models.Index(fields=['tenant', 'blanket_po']),
            models.Index(fields=['tenant', 'status']),
        ]

    def __str__(self):
        return f"CTR-{self.contract_number}"

    @property
    def is_active(self):
        """Check if contract is currently active and not expired."""
        if self.status != 'active':
            return False
        today = timezone.now().date()
        if self.start_date and today < self.start_date:
            return False
        if self.end_date and today > self.end_date:
            return False
        return True

    @property
    def total_committed_qty(self):
        """Sum of all line blanket quantities."""
        result = self.lines.aggregate(total=Sum('blanket_qty'))
        return result['total'] or 0

    @property
    def total_released_qty(self):
        """Sum of all released quantities across all lines."""
        return sum(line.released_qty for line in self.lines.all())

    @property
    def total_remaining_qty(self):
        """Sum of remaining balance across all lines."""
        return sum(line.remaining_qty for line in self.lines.all())

    @property
    def completion_percentage(self):
        """Percentage of contract fulfilled."""
        total = self.total_committed_qty
        if total == 0:
            return 0
        return round((self.total_released_qty / total) * 100, 1)

    @property
    def num_lines(self):
        """Count of line items."""
        return self.lines.count()

    def save(self, *args, **kwargs):
        """Auto-generate contract number if not set."""
        if not self.contract_number:
            # Get next number for this tenant
            last_contract = Contract.objects.filter(
                tenant=self.tenant
            ).order_by('-id').first()
            if last_contract and last_contract.contract_number.isdigit():
                next_num = int(last_contract.contract_number) + 1
            else:
                next_num = 1
            self.contract_number = str(next_num).zfill(4)
        super().save(*args, **kwargs)


class ContractLine(TenantMixin, TimestampMixin):
    """
    Contract Line Item.

    Each line represents a specific item with a committed blanket quantity.
    Releases are tracked to calculate remaining balance.
    """
    contract = models.ForeignKey(
        Contract,
        on_delete=models.CASCADE,
        related_name='lines',
        help_text="Parent contract"
    )
    line_number = models.PositiveIntegerField(
        help_text="Line sequence (10, 20, 30...)"
    )
    item = models.ForeignKey(
        'items.Item',
        on_delete=models.PROTECT,
        related_name='contract_lines',
        help_text="Item covered by this contract line"
    )
    blanket_qty = models.PositiveIntegerField(
        help_text="Total committed quantity for this item"
    )
    uom = models.ForeignKey(
        'items.UnitOfMeasure',
        on_delete=models.PROTECT,
        related_name='contract_lines',
        help_text="Unit of measure for quantities"
    )
    unit_price = models.DecimalField(
        max_digits=12,
        decimal_places=4,
        null=True,
        blank=True,
        help_text="Contracted unit price (optional, can be overridden on release)"
    )
    notes = models.TextField(
        blank=True,
        help_text="Line-specific notes"
    )

    class Meta:
        verbose_name = "Contract Line"
        verbose_name_plural = "Contract Lines"
        unique_together = [('tenant', 'contract', 'line_number')]
        indexes = [
            models.Index(fields=['tenant', 'contract', 'line_number']),
            models.Index(fields=['tenant', 'item']),
        ]
        ordering = ['line_number']

    def __str__(self):
        return f"{self.contract.contract_number} Line {self.line_number}: {self.item.sku}"

    @property
    def released_qty(self):
        """Sum of all quantities released against this line (excluding cancelled orders)."""
        result = self.releases.exclude(
            sales_order_line__sales_order__status='cancelled'
        ).aggregate(total=Sum('quantity_ordered'))
        return result['total'] or 0

    @property
    def remaining_qty(self):
        """Balance remaining to be released."""
        return max(0, self.blanket_qty - self.released_qty)

    @property
    def is_fully_released(self):
        """True if all blanket qty has been released."""
        return self.remaining_qty == 0


class ContractRelease(TenantMixin, TimestampMixin):
    """
    Contract Release - links a SalesOrderLine to a ContractLine.

    Each release represents a drawdown against the contract balance.
    One SalesOrderLine can only be linked to one ContractLine.
    """
    contract_line = models.ForeignKey(
        ContractLine,
        on_delete=models.PROTECT,
        related_name='releases',
        help_text="Contract line this release draws from"
    )
    sales_order_line = models.OneToOneField(
        'orders.SalesOrderLine',
        on_delete=models.CASCADE,
        related_name='contract_release',
        help_text="Sales order line fulfilling this release"
    )
    quantity_ordered = models.PositiveIntegerField(
        help_text="Quantity drawn from contract (mirrors sales order line qty)"
    )
    release_date = models.DateField(
        default=timezone.now,
        help_text="Date release was created"
    )
    balance_before = models.PositiveIntegerField(
        help_text="Contract line balance before this release"
    )
    balance_after = models.PositiveIntegerField(
        help_text="Contract line balance after this release"
    )
    notes = models.TextField(
        blank=True,
        help_text="Release-specific notes"
    )

    class Meta:
        verbose_name = "Contract Release"
        verbose_name_plural = "Contract Releases"
        indexes = [
            models.Index(fields=['tenant', 'contract_line']),
            models.Index(fields=['tenant', 'release_date']),
        ]
        ordering = ['release_date', 'id']

    def __str__(self):
        return f"Release {self.sales_order_line.sales_order.order_number} from {self.contract_line}"

    def save(self, *args, **kwargs):
        """Capture balance snapshot before saving."""
        if not self.pk:  # New release
            # Calculate balance before this release (current remaining + this qty since it hasn't been counted yet)
            self.balance_before = self.contract_line.remaining_qty
            self.balance_after = max(0, self.balance_before - self.quantity_ordered)
        super().save(*args, **kwargs)
