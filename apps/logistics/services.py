import base64
import uuid
from decimal import Decimal
from django.db import transaction
from django.core.exceptions import ValidationError
from django.core.files.base import ContentFile
from django.utils import timezone
from django.template.loader import render_to_string

from .models import LicensePlate, DeliveryStop
from apps.scheduling.models import DeliveryRun
from apps.orders.models import SalesOrder


class LogisticsService:
    """Service for logistics operations: run initialization, LPN management, POD."""

    def __init__(self, tenant, user=None):
        self.tenant = tenant
        self.user = user

    def initialize_run_logistics(self, run_id):
        """
        Initialize delivery stops for a run by grouping orders by customer.

        Looks at all SalesOrders assigned to the run, groups by customer,
        and creates DeliveryStop records for each unique customer.

        Args:
            run_id: DeliveryRun PK

        Returns:
            list[DeliveryStop]: Created stops
        """
        run = DeliveryRun.objects.get(pk=run_id, tenant=self.tenant)

        # Get all sales orders on this run
        orders = SalesOrder.objects.filter(
            tenant=self.tenant,
            delivery_run=run,
        ).select_related('customer', 'customer__party', 'ship_to')

        if not orders.exists():
            raise ValidationError(f"Run '{run.name}' has no sales orders to initialize.")

        # Group orders by customer
        customer_orders = {}
        for order in orders:
            cust_id = order.customer_id
            if cust_id not in customer_orders:
                customer_orders[cust_id] = {
                    'customer': order.customer,
                    'ship_to': order.ship_to,
                    'orders': [],
                }
            customer_orders[cust_id]['orders'].append(order)

        with transaction.atomic():
            # Delete existing stops for this run (re-initialize)
            DeliveryStop.objects.filter(tenant=self.tenant, run=run).delete()

            stops = []
            for seq, (cust_id, data) in enumerate(customer_orders.items(), start=1):
                stop = DeliveryStop.objects.create(
                    tenant=self.tenant,
                    run=run,
                    customer=data['customer'],
                    ship_to=data['ship_to'],
                    sequence=seq,
                    status='PENDING',
                )
                stop.orders.set(data['orders'])
                stops.append(stop)

            return stops

    def create_lpn(self, order, run=None, weight_lbs=Decimal('0.00'), notes=''):
        """
        Create a new License Plate (LPN) for a sales order.

        Args:
            order: SalesOrder instance
            run: Optional DeliveryRun instance
            weight_lbs: Pallet weight
            notes: Optional notes

        Returns:
            LicensePlate: Created LPN
        """
        code = self._generate_lpn_code()

        lpn = LicensePlate.objects.create(
            tenant=self.tenant,
            code=code,
            order=order,
            run=run,
            weight_lbs=weight_lbs,
            status='STAGED',
            notes=notes,
        )
        return lpn

    def sign_delivery(self, stop_id, signature_base64, signed_by):
        """
        Record proof of delivery for a stop.

        Args:
            stop_id: DeliveryStop PK
            signature_base64: Base64-encoded signature PNG
            signed_by: Name of signer

        Returns:
            DeliveryStop: Updated stop
        """
        stop = DeliveryStop.objects.get(pk=stop_id, tenant=self.tenant)

        if stop.status == 'COMPLETED':
            raise ValidationError("This stop has already been signed.")

        with transaction.atomic():
            # Decode and save signature image
            if signature_base64:
                img_data = base64.b64decode(signature_base64)
                filename = f"sig_{stop.run_id}_{stop.id}_{uuid.uuid4().hex[:8]}.png"
                stop.signature_image.save(filename, ContentFile(img_data), save=False)

            stop.signed_by = signed_by
            stop.status = 'COMPLETED'
            stop.delivered_at = timezone.now()
            stop.save()

            # Update all linked orders to shipped/complete
            stop.orders.all().update(status='shipped')

            # Update LPNs for these orders
            order_ids = list(stop.orders.values_list('id', flat=True))
            LicensePlate.objects.filter(
                tenant=self.tenant,
                order_id__in=order_ids,
                run=stop.run,
            ).update(status='DELIVERED')

            # Check if all stops complete -> mark run complete
            pending = DeliveryStop.objects.filter(
                run=stop.run,
                status__in=['PENDING', 'ARRIVED'],
            ).exists()
            if not pending:
                stop.run.is_complete = True
                stop.run.save(update_fields=['is_complete'])

            return stop

    def get_driver_manifest(self, run_id):
        """
        Get manifest data for a delivery run (for PDF generation).

        Returns dict with run info and ordered stop list.
        """
        run = DeliveryRun.objects.select_related('truck').get(
            pk=run_id, tenant=self.tenant
        )
        stops = DeliveryStop.objects.filter(
            tenant=self.tenant,
            run=run,
        ).select_related(
            'customer', 'customer__party', 'ship_to'
        ).prefetch_related('orders', 'orders__lines').order_by('sequence')

        return {
            'run': run,
            'stops': stops,
            'total_stops': stops.count(),
            'total_orders': sum(s.orders.count() for s in stops),
        }

    def _generate_lpn_code(self):
        """Generate unique LPN code."""
        last = LicensePlate.objects.filter(
            tenant=self.tenant,
            code__startswith='LPN-',
        ).order_by('-code').values_list('code', flat=True).first()

        if last:
            try:
                num = int(last.split('-')[1]) + 1
            except (IndexError, ValueError):
                num = 10001
        else:
            num = 10001

        return f"LPN-{num}"
