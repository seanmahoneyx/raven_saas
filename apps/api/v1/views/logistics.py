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
        """POST /logistics/stops/{id}/sign/ - Capture POD signature."""
        serializer = SignDeliverySerializer(data=request.data)
        serializer.is_valid(raise_exception=True)

        service = LogisticsService(request.tenant, request.user)
        try:
            stop = service.sign_delivery(
                stop_id=pk,
                signature_base64=serializer.validated_data['signature_base64'],
                signed_by=serializer.validated_data['signed_by'],
            )
        except DjangoValidationError as e:
            return Response({'detail': e.message}, status=status.HTTP_400_BAD_REQUEST)

        result = DeliveryStopDetailSerializer(stop, context={'request': request})
        return Response(result.data)


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
