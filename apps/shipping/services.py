# apps/shipping/services.py
"""
Shipping service for managing shipments and BOL generation.

ShippingService handles:
- Creating shipments from scheduled sales orders
- Managing shipment lines and delivery sequence
- Generating Bills of Lading
- Updating delivery status
- Integrating with inventory for issuing goods
"""
import logging
from decimal import Decimal
from collections import defaultdict
from django.db import models, transaction
from django.utils import timezone
from django.core.exceptions import ValidationError

from .models import Shipment, ShipmentLine, BillOfLading, BOLLine

logger = logging.getLogger(__name__)


class ShippingService:
    """
    Service for managing shipments and BOL generation.

    Usage:
        service = ShippingService(tenant, user)

        # Create shipment from sales orders
        shipment = service.create_shipment(
            ship_date=date(2024, 1, 15),
            truck=truck,
            sales_orders=[so1, so2, so3],
        )

        # Generate BOL
        bol = service.generate_bol(shipment, shipper_name="ACME Corp")

        # Mark delivery
        service.mark_delivered(shipment_line, signature_name="John Doe")
    """

    def __init__(self, tenant, user=None):
        """
        Initialize shipping service.

        Args:
            tenant: Tenant instance to scope operations
            user: User performing operations (for audit trail)
        """
        self.tenant = tenant
        self.user = user

    # ===== SHIPMENT CREATION =====

    def create_shipment(
        self,
        ship_date,
        truck,
        sales_orders=None,
        driver_name='',
        notes='',
        shipment_number=None,
    ):
        """
        Create a new shipment.

        Args:
            ship_date: Date of shipment
            truck: Truck instance
            sales_orders: Optional list of SalesOrder instances to include
            driver_name: Optional driver name
            notes: Optional notes
            shipment_number: Optional custom number (auto-generated if not provided)

        Returns:
            Shipment instance
        """
        if shipment_number is None:
            shipment_number = self._generate_shipment_number()

        with transaction.atomic():
            shipment = Shipment.objects.create(
                tenant=self.tenant,
                shipment_number=shipment_number,
                ship_date=ship_date,
                truck=truck,
                driver_name=driver_name,
                notes=notes,
                status='planned',
            )

            if sales_orders:
                for seq, order in enumerate(sales_orders):
                    self.add_order_to_shipment(shipment, order, delivery_sequence=seq)

            return shipment

    def create_shipment_from_delivery_run(self, delivery_run):
        """
        Create a Shipment from a DeliveryRun, including all its scheduled sales orders.

        Args:
            delivery_run: DeliveryRun instance

        Returns:
            Shipment instance

        Raises:
            ValidationError: If delivery run has no orders or is already complete
        """
        if delivery_run.is_complete:
            raise ValidationError("This delivery run is already marked complete.")

        # Collect all sales orders from the run
        sales_orders = list(delivery_run.sales_orders.select_related('customer__party').all())
        if not sales_orders:
            raise ValidationError("Delivery run has no sales orders to ship.")

        shipment = self.create_shipment(
            ship_date=delivery_run.scheduled_date,
            truck=delivery_run.truck,
            sales_orders=sales_orders,
            driver_name='',
            notes=f'Created from delivery run: {delivery_run.name}',
        )

        # Mark the delivery run as complete
        delivery_run.is_complete = True
        delivery_run.save()

        return shipment

    def add_order_to_shipment(self, shipment, sales_order, delivery_sequence=None):
        """
        Add a sales order to a shipment.

        Args:
            shipment: Shipment instance
            sales_order: SalesOrder instance
            delivery_sequence: Optional sequence (defaults to next in sequence)

        Returns:
            ShipmentLine instance
        """
        if delivery_sequence is None:
            max_seq = shipment.lines.aggregate(
                max_seq=models.Max('delivery_sequence')
            )['max_seq'] or -1
            delivery_sequence = max_seq + 1

        return ShipmentLine.objects.create(
            tenant=self.tenant,
            shipment=shipment,
            sales_order=sales_order,
            delivery_sequence=delivery_sequence,
            delivery_status='pending',
        )

    def remove_order_from_shipment(self, shipment, sales_order):
        """
        Remove a sales order from a shipment.

        Args:
            shipment: Shipment instance
            sales_order: SalesOrder instance
        """
        ShipmentLine.objects.filter(
            shipment=shipment,
            sales_order=sales_order,
        ).delete()

    def reorder_delivery_sequence(self, shipment, order_pks):
        """
        Reorder the delivery sequence of orders in a shipment.

        Args:
            shipment: Shipment instance
            order_pks: List of SalesOrder PKs in desired delivery order
        """
        with transaction.atomic():
            for seq, order_pk in enumerate(order_pks):
                ShipmentLine.objects.filter(
                    shipment=shipment,
                    sales_order_id=order_pk,
                ).update(delivery_sequence=seq)

    # ===== SHIPMENT STATUS =====

    def start_loading(self, shipment):
        """Mark shipment as loading."""
        shipment.status = 'loading'
        shipment.save()
        return shipment

    def depart(self, shipment, departure_time=None):
        """
        Mark shipment as departed.

        Args:
            shipment: Shipment instance
            departure_time: Optional datetime (defaults to now)
        """
        shipment.status = 'in_transit'
        shipment.departure_time = departure_time or timezone.now()
        shipment.save()

        # Update all pending lines to loaded
        shipment.lines.filter(delivery_status='pending').update(
            delivery_status='loaded'
        )

        # Broadcast shipment update via WebSocket
        try:
            from apps.api.ws_signals import broadcast_shipment_update
            broadcast_shipment_update(
                tenant_id=self.tenant.pk,
                shipment_id=shipment.pk,
                status='in_transit',
                data={'shipment_number': shipment.shipment_number},
            )
        except Exception:
            pass  # Never break the main flow

        return shipment

    def complete_shipment(self, shipment, arrival_time=None):
        """
        Mark entire shipment as delivered.

        Args:
            shipment: Shipment instance
            arrival_time: Optional datetime (defaults to now)
        """
        shipment.status = 'delivered'
        shipment.arrival_time = arrival_time or timezone.now()
        shipment.save()

        # Notify about delivery completion
        try:
            from apps.notifications.services import notify_group
            notify_group(
                tenant=self.tenant,
                group_name='Sales',
                title=f'Shipment {shipment.shipment_number} Delivered',
                message=f'Shipment has been delivered.',
                link=f'/shipping',
                notification_type='SUCCESS',
            )
        except Exception:
            pass  # Don't let notification failures break shipment flow

        # Broadcast shipment delivery via WebSocket
        try:
            from apps.api.ws_signals import broadcast_shipment_delivered
            broadcast_shipment_delivered(
                tenant_id=self.tenant.pk,
                shipment_id=shipment.pk,
                shipment_number=shipment.shipment_number,
            )
        except Exception:
            pass  # Never break the main flow

        return shipment

    def cancel_shipment(self, shipment):
        """Cancel a shipment."""
        if shipment.status in ('in_transit', 'delivered'):
            raise ValidationError("Cannot cancel a shipment that has departed or is delivered")

        shipment.status = 'cancelled'
        shipment.save()
        return shipment

    # ===== DELIVERY TRACKING =====

    def mark_delivered(
        self,
        shipment_line,
        signature_name='',
        delivered_at=None,
        notes='',
    ):
        """
        Mark a single order as delivered.

        Side effects:
        - Updates SO status to 'shipped'
        - Deducts inventory via FIFO (creates COGS journal entries)
        - Auto-creates draft invoice when all shipment lines are delivered

        Args:
            shipment_line: ShipmentLine instance
            signature_name: Name of person who signed
            delivered_at: Delivery time (defaults to now)
            notes: Delivery notes

        Returns:
            ShipmentLine instance
        """
        shipment_line.delivery_status = 'delivered'
        shipment_line.delivered_at = delivered_at or timezone.now()
        shipment_line.signature_name = signature_name
        if notes:
            shipment_line.notes = notes
        shipment_line.save()

        # Update sales order status
        sales_order = shipment_line.sales_order
        sales_order.status = 'shipped'
        sales_order.save()

        # Broadcast shipment line delivery via WebSocket
        try:
            from apps.api.ws_signals import broadcast_shipment_update
            broadcast_shipment_update(
                tenant_id=self.tenant.pk,
                shipment_id=shipment_line.shipment.pk,
                status='line_delivered',
                data={
                    'shipment_number': shipment_line.shipment.shipment_number,
                    'sales_order_id': sales_order.pk,
                    'order_number': sales_order.order_number,
                },
            )
        except Exception:
            pass  # Never break the main flow

        # Deduct inventory (FIFO COGS) for each SO line
        try:
            from apps.inventory.services import InventoryService
            from apps.warehousing.models import Warehouse

            default_warehouse = Warehouse.objects.filter(
                tenant=self.tenant, is_default=True
            ).first()

            if default_warehouse:
                inv_svc = InventoryService(self.tenant, self.user)
                for so_line in sales_order.lines.select_related('item').all():
                    try:
                        inv_svc.ship_stock(
                            item=so_line.item,
                            warehouse=default_warehouse,
                            quantity=so_line.quantity_ordered,
                            sales_order=sales_order,
                            reference=f'Shipment delivery: {shipment_line.shipment.shipment_number}',
                        )
                    except Exception as e:
                        logger.exception("Inventory deduction failed for SO line %s: %s", so_line.pk, e)
        except Exception as e:
            logger.exception("Inventory service setup failed for shipment %s: %s", shipment_line.shipment.pk, e)

        # Check if all lines delivered
        shipment = shipment_line.shipment
        all_delivered = not shipment.lines.exclude(
            delivery_status__in=['delivered', 'refused']
        ).exists()

        if all_delivered:
            self.complete_shipment(shipment)

            # Auto-create draft invoices (one per customer in the shipment)
            try:
                from apps.invoicing.services import InvoicingService
                inv_svc = InvoicingService(self.tenant, self.user)
                # Group shipment lines by customer
                customer_ids = set()
                for sl in shipment.lines.select_related('sales_order__customer').all():
                    if sl.sales_order and sl.sales_order.customer_id:
                        customer_ids.add(sl.sales_order.customer_id)
                if len(customer_ids) <= 1:
                    # Single customer -- use existing consolidated method
                    inv_svc.create_invoice_from_shipment(shipment=shipment)
                else:
                    # Multiple customers -- create one invoice per SO
                    for sl in shipment.lines.select_related('sales_order').all():
                        try:
                            inv_svc.create_invoice_from_order(
                                sales_order=sl.sales_order,
                            )
                        except Exception as e:
                            logger.exception(
                                "Invoice creation failed for order %s on shipment %s: %s",
                                sl.sales_order.order_number, shipment.pk, e,
                            )
            except Exception as e:
                logger.exception("Auto-invoice creation failed for shipment %s: %s", shipment.pk, e)

        return shipment_line

    def mark_refused(self, shipment_line, notes=''):
        """
        Mark a delivery as refused.

        Args:
            shipment_line: ShipmentLine instance
            notes: Reason for refusal
        """
        shipment_line.delivery_status = 'refused'
        shipment_line.notes = notes
        shipment_line.save()
        return shipment_line

    # ===== BOL GENERATION =====

    def generate_bol(
        self,
        shipment,
        shipper_name,
        shipper_address='',
        carrier_name='',
        carrier_scac='',
        trailer_number='',
        seal_number='',
        bol_number=None,
    ):
        """
        Generate a Bill of Lading for a shipment.

        Aggregates all items from all sales orders in the shipment
        into BOL lines.

        Args:
            shipment: Shipment instance
            shipper_name: Shipper company name
            shipper_address: Shipper address
            carrier_name: Carrier name
            carrier_scac: Standard Carrier Alpha Code
            trailer_number: Trailer number
            seal_number: Seal number
            bol_number: Optional custom BOL number

        Returns:
            BillOfLading instance
        """
        if bol_number is None:
            bol_number = self._generate_bol_number()

        with transaction.atomic():
            bol = BillOfLading.objects.create(
                tenant=self.tenant,
                bol_number=bol_number,
                shipment=shipment,
                status='draft',
                shipper_name=shipper_name,
                shipper_address=shipper_address,
                carrier_name=carrier_name,
                carrier_scac=carrier_scac,
                trailer_number=trailer_number,
                seal_number=seal_number,
            )

            # Aggregate items from all orders
            self._generate_bol_lines(bol, shipment)

            return bol

    def _generate_bol_lines(self, bol, shipment):
        """
        Generate BOL lines by aggregating items from shipment orders.

        Groups items by SKU and sums quantities.
        """
        # Aggregate items across all orders
        item_totals = defaultdict(lambda: {
            'item': None,
            'uom': None,
            'description': '',
            'quantity': 0,
        })

        for shipment_line in shipment.lines.all():
            for order_line in shipment_line.sales_order.lines.all():
                key = (order_line.item_id, order_line.uom_id)
                if item_totals[key]['item'] is None:
                    item_totals[key]['item'] = order_line.item
                    item_totals[key]['uom'] = order_line.uom
                    item_totals[key]['description'] = order_line.item.name
                item_totals[key]['quantity'] += order_line.quantity_ordered

        # Create BOL lines
        total_pieces = 0
        line_number = 10
        for key, data in item_totals.items():
            BOLLine.objects.create(
                tenant=self.tenant,
                bol=bol,
                line_number=line_number,
                item=data['item'],
                description=data['description'],
                quantity=data['quantity'],
                uom=data['uom'],
            )
            total_pieces += data['quantity']
            line_number += 10

        # Update BOL totals
        bol.total_pieces = total_pieces
        bol.save()

    def issue_bol(self, bol):
        """
        Issue the BOL (finalize for shipping).

        Args:
            bol: BillOfLading instance
        """
        bol.status = 'issued'
        bol.issue_date = timezone.now().date()
        bol.save()
        return bol

    def sign_bol_shipper(self, bol, signature_name):
        """
        Add shipper signature to BOL.

        Args:
            bol: BillOfLading instance
            signature_name: Name of shipper signing
        """
        bol.shipper_signature = signature_name
        bol.shipper_signed_date = timezone.now()
        bol.save()
        return bol

    def sign_bol_carrier(self, bol, signature_name):
        """
        Add carrier signature to BOL.

        Args:
            bol: BillOfLading instance
            signature_name: Name of carrier/driver signing
        """
        bol.carrier_signature = signature_name
        bol.carrier_signed_date = timezone.now()
        bol.save()
        return bol

    def sign_bol_consignee(self, bol, signature_name):
        """
        Add consignee signature to BOL (upon delivery).

        Args:
            bol: BillOfLading instance
            signature_name: Name of consignee signing
        """
        bol.consignee_signature = signature_name
        bol.consignee_signed_date = timezone.now()
        if bol.status == 'issued':
            bol.status = 'signed'
        bol.save()
        return bol

    def void_bol(self, bol, reason=''):
        """
        Void a BOL.

        Args:
            bol: BillOfLading instance
            reason: Reason for voiding
        """
        bol.status = 'void'
        if reason:
            bol.notes = f"{bol.notes}\nVOIDED: {reason}".strip()
        bol.save()
        return bol

    # ===== QUERIES =====

    def get_shipments_for_date(self, date, truck=None):
        """Get all shipments for a specific date."""
        qs = Shipment.objects.filter(
            tenant=self.tenant,
            ship_date=date,
        )
        if truck:
            qs = qs.filter(truck=truck)
        return qs.select_related('truck').prefetch_related('lines__sales_order')

    def get_shipments_for_truck(self, truck, status=None):
        """Get all shipments for a truck."""
        qs = Shipment.objects.filter(
            tenant=self.tenant,
            truck=truck,
        )
        if status:
            qs = qs.filter(status=status)
        return qs.order_by('-ship_date')

    def get_pending_deliveries(self, shipment):
        """Get pending deliveries for a shipment."""
        return shipment.lines.filter(
            delivery_status__in=['pending', 'loaded']
        ).order_by('delivery_sequence')

    # ===== HELPERS =====

    def _generate_shipment_number(self):
        """Generate unique shipment number."""
        date_part = timezone.now().strftime('%Y%m%d')
        seq = Shipment.objects.filter(
            tenant=self.tenant,
            shipment_number__startswith=date_part,
        ).count() + 1
        return f"{date_part}-{seq:04d}"

    def _generate_bol_number(self):
        """Generate unique BOL number."""
        date_part = timezone.now().strftime('%Y%m%d')
        seq = BillOfLading.objects.filter(
            tenant=self.tenant,
            bol_number__startswith=date_part,
        ).count() + 1
        return f"{date_part}-{seq:04d}"
