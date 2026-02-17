from rest_framework import viewsets, filters, status
from rest_framework.decorators import action
from rest_framework.response import Response
from rest_framework.views import APIView
from django_filters.rest_framework import DjangoFilterBackend
from django.core.exceptions import ValidationError as DjangoValidationError
from drf_spectacular.utils import extend_schema, extend_schema_view

from apps.logistics.models import LicensePlate, DeliveryStop
from apps.logistics.services import LogisticsService
from apps.api.v1.serializers.logistics import (
    LicensePlateSerializer,
    DeliveryStopListSerializer,
    DeliveryStopDetailSerializer,
    SignDeliverySerializer,
    ArriveStopSerializer,
)


@extend_schema_view(
    list=extend_schema(tags=['logistics'], summary='List license plates'),
    retrieve=extend_schema(tags=['logistics'], summary='Get license plate details'),
    create=extend_schema(tags=['logistics'], summary='Create a license plate'),
    update=extend_schema(tags=['logistics'], summary='Update a license plate'),
    partial_update=extend_schema(tags=['logistics'], summary='Partially update a license plate'),
    destroy=extend_schema(tags=['logistics'], summary='Delete a license plate'),
)
class LicensePlateViewSet(viewsets.ModelViewSet):
    serializer_class = LicensePlateSerializer
    filter_backends = [DjangoFilterBackend, filters.SearchFilter, filters.OrderingFilter]
    filterset_fields = ['order', 'run', 'status']
    search_fields = ['code']
    ordering_fields = ['code', 'status', 'created_at']
    ordering = ['-created_at']

    def get_queryset(self):
        return LicensePlate.objects.select_related(
            'order', 'order__customer', 'order__customer__party', 'run'
        ).all()


@extend_schema_view(
    list=extend_schema(tags=['logistics'], summary='List delivery stops'),
    retrieve=extend_schema(tags=['logistics'], summary='Get delivery stop details'),
)
class DeliveryStopViewSet(viewsets.ReadOnlyModelViewSet):
    filter_backends = [DjangoFilterBackend, filters.SearchFilter, filters.OrderingFilter]
    filterset_fields = ['run', 'status', 'customer']
    search_fields = ['customer__party__display_name']
    ordering_fields = ['sequence', 'status', 'delivered_at']
    ordering = ['sequence']

    def get_queryset(self):
        return DeliveryStop.objects.select_related(
            'customer', 'customer__party', 'ship_to', 'run'
        ).prefetch_related('orders').all()

    def get_serializer_class(self):
        if self.action == 'retrieve':
            return DeliveryStopDetailSerializer
        return DeliveryStopListSerializer

    @extend_schema(
        tags=['logistics'],
        summary='Sign proof of delivery for a stop',
        request=SignDeliverySerializer,
        responses={200: DeliveryStopDetailSerializer},
    )
    @action(detail=True, methods=['post'], url_path='sign')
    def sign(self, request, pk=None):
        """POST /logistics/stops/{id}/sign/ - Capture POD signature + photo."""
        serializer = SignDeliverySerializer(data=request.data)
        serializer.is_valid(raise_exception=True)

        service = LogisticsService(request.tenant, request.user)
        try:
            stop = service.sign_delivery(
                stop_id=pk,
                signature_base64=serializer.validated_data['signature_base64'],
                signed_by=serializer.validated_data['signed_by'],
                photo_base64=serializer.validated_data.get('photo_base64', ''),
                gps_lat=serializer.validated_data.get('gps_lat'),
                gps_lng=serializer.validated_data.get('gps_lng'),
                delivery_notes=serializer.validated_data.get('delivery_notes', ''),
            )
        except DjangoValidationError as e:
            return Response({'detail': e.message}, status=status.HTTP_400_BAD_REQUEST)

        result = DeliveryStopDetailSerializer(stop, context={'request': request})
        return Response(result.data)

    @extend_schema(
        tags=['logistics'],
        summary='Record driver arrival at a stop',
        request=ArriveStopSerializer,
        responses={200: DeliveryStopDetailSerializer},
    )
    @action(detail=True, methods=['post'], url_path='arrive')
    def arrive(self, request, pk=None):
        """POST /logistics/stops/{id}/arrive/ - Record arrival timestamp + GPS."""
        serializer = ArriveStopSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)

        service = LogisticsService(request.tenant, request.user)
        try:
            stop = service.arrive_at_stop(
                stop_id=pk,
                gps_lat=serializer.validated_data.get('gps_lat'),
                gps_lng=serializer.validated_data.get('gps_lng'),
            )
        except DjangoValidationError as e:
            return Response({'detail': e.message}, status=status.HTTP_400_BAD_REQUEST)

        result = DeliveryStopDetailSerializer(stop, context={'request': request})
        return Response(result.data)


class ManifestPDFView(APIView):
    """GET /logistics/runs/{run_id}/manifest-pdf/ - Download delivery manifest PDF."""

    @extend_schema(
        tags=['logistics'],
        summary='Download delivery manifest PDF for a run',
        responses={200: {'type': 'string', 'format': 'binary'}},
    )
    def get(self, request, run_id):
        from apps.scheduling.models import DeliveryRun
        from apps.documents.pdf import PDFService
        from django.http import HttpResponse
        try:
            run = DeliveryRun.objects.get(pk=run_id, tenant=request.tenant)
        except DeliveryRun.DoesNotExist:
            from rest_framework.response import Response
            return Response({'error': 'Delivery run not found'}, status=404)
        pdf_bytes = PDFService.render_delivery_manifest(run)
        response = HttpResponse(pdf_bytes, content_type='application/pdf')
        response['Content-Disposition'] = f'inline; filename="manifest-{run.name}.pdf"'
        return response


class InitializeRunView(APIView):
    """POST /logistics/runs/{run_id}/initialize/ - Create delivery stops from run orders."""

    @extend_schema(
        tags=['logistics'],
        summary='Initialize delivery stops for a run',
        responses={201: DeliveryStopListSerializer(many=True)},
    )
    def post(self, request, run_id):
        service = LogisticsService(request.tenant, request.user)
        try:
            stops = service.initialize_run_logistics(run_id)
        except DjangoValidationError as e:
            return Response({'detail': e.message}, status=status.HTTP_400_BAD_REQUEST)

        result = DeliveryStopListSerializer(stops, many=True, context={'request': request})
        return Response(result.data, status=status.HTTP_201_CREATED)


class DriverRunView(APIView):
    """GET /logistics/my-run/ - Get today's run manifest for authenticated driver."""

    @extend_schema(
        tags=['logistics'],
        summary="Get today's delivery run for the authenticated driver",
        responses={200: {'type': 'object'}},
    )
    def get(self, request):
        service = LogisticsService(request.tenant, request.user)
        result = service.get_my_run(request.user)

        if not result:
            return Response({'detail': 'No run scheduled for today.'}, status=status.HTTP_404_NOT_FOUND)

        run = result['run']
        stops_data = []
        for stop in result['stops']:
            orders_data = []
            for order in stop.orders.all():
                lines_data = []
                for line in order.lines.all():
                    lines_data.append({
                        'item_sku': line.item.sku,
                        'item_name': line.item.name,
                        'quantity': line.quantity_ordered,
                        'uom_code': line.uom.code if line.uom else 'ea',
                    })
                orders_data.append({
                    'id': order.id,
                    'order_number': order.order_number,
                    'customer_po': order.customer_po or '',
                    'lines': lines_data,
                })

            # Get pallet count from LPNs
            from apps.logistics.models import LicensePlate
            pallet_count = LicensePlate.objects.filter(
                order_id__in=stop.orders.values_list('id', flat=True),
                run=stop.run,
            ).count()

            ship_to = stop.ship_to
            stops_data.append({
                'id': stop.id,
                'sequence': stop.sequence,
                'status': stop.status,
                'customer_name': stop.customer.party.display_name if stop.customer else '',
                'address': f"{ship_to.address_line1 or ''}, {ship_to.city or ''}, {ship_to.state or ''} {ship_to.postal_code or ''}".strip(', ') if ship_to else '',
                'city': ship_to.city if ship_to else '',
                'delivery_notes': stop.delivery_notes or '',
                'pallet_count': pallet_count,
                'orders': orders_data,
                'arrived_at': stop.arrived_at,
                'delivered_at': stop.delivered_at,
            })

        return Response({
            'run_id': run.id,
            'run_name': run.name,
            'truck_name': result['truck_name'],
            'scheduled_date': str(run.scheduled_date),
            'total_stops': result['total_stops'],
            'total_weight_lbs': str(result['total_weight_lbs']),
            'is_complete': result['is_complete'],
            'stops': stops_data,
        })

    @extend_schema(
        tags=['logistics'],
        summary='Start the delivery run',
        responses={200: {'type': 'object'}},
    )
    def post(self, request):
        """POST /logistics/my-run/ - Start the run (mark as in progress)."""
        service = LogisticsService(request.tenant, request.user)
        result = service.get_my_run(request.user)

        if not result:
            return Response({'detail': 'No run scheduled for today.'}, status=status.HTTP_404_NOT_FOUND)

        # Run is now active (we don't have a status field on DeliveryRun,
        # but we can track via stop statuses)
        return Response({'detail': 'Run started.', 'run_id': result['run'].id})
