from rest_framework.views import APIView
from rest_framework.response import Response
from rest_framework import status
from django.http import HttpResponse
from drf_spectacular.utils import extend_schema

from apps.warehousing.labels import LabelService


class ItemLabelsView(APIView):
    """POST /api/v1/labels/items/ - Generate item barcode labels."""

    @extend_schema(tags=['labels'], summary='Generate item barcode labels')
    def post(self, request):
        item_id = request.data.get('item_id')
        qty = int(request.data.get('qty', 1))
        fmt = request.data.get('format', 'PDF').upper()

        if not item_id:
            return Response(
                {'error': 'item_id is required'},
                status=status.HTTP_400_BAD_REQUEST,
            )
        if qty < 1 or qty > 300:
            return Response(
                {'error': 'qty must be between 1 and 300'},
                status=status.HTTP_400_BAD_REQUEST,
            )

        service = LabelService(request.tenant)
        try:
            result = service.generate_item_labels(item_id, qty, fmt)
        except Exception as e:
            return Response(
                {'error': str(e)},
                status=status.HTTP_400_BAD_REQUEST,
            )

        if fmt == 'ZPL':
            return HttpResponse(result, content_type='text/plain')

        response = HttpResponse(result, content_type='application/pdf')
        response['Content-Disposition'] = 'inline; filename="item-labels.pdf"'
        return response


class BinLabelsView(APIView):
    """POST /api/v1/labels/bins/ - Generate bin/location barcode labels."""

    @extend_schema(tags=['labels'], summary='Generate bin location barcode labels')
    def post(self, request):
        warehouse_id = request.data.get('warehouse_id')
        location_ids = request.data.get('location_ids', [])
        fmt = request.data.get('format', 'PDF').upper()

        if not warehouse_id and not location_ids:
            return Response(
                {'error': 'warehouse_id or location_ids required'},
                status=status.HTTP_400_BAD_REQUEST,
            )

        service = LabelService(request.tenant)
        try:
            result = service.generate_bin_labels(
                warehouse_id=warehouse_id,
                location_ids=location_ids,
                fmt=fmt,
            )
        except Exception as e:
            return Response(
                {'error': str(e)},
                status=status.HTTP_400_BAD_REQUEST,
            )

        if fmt == 'ZPL':
            return HttpResponse(result, content_type='text/plain')

        response = HttpResponse(result, content_type='application/pdf')
        response['Content-Disposition'] = 'inline; filename="bin-labels.pdf"'
        return response


class LPNLabelsView(APIView):
    """POST /api/v1/labels/lpns/ - Generate LPN/shipping labels."""

    @extend_schema(tags=['labels'], summary='Generate LPN shipping labels')
    def post(self, request):
        lpn_ids = request.data.get('lpn_ids', [])
        fmt = request.data.get('format', 'ZPL').upper()

        if not lpn_ids:
            return Response(
                {'error': 'lpn_ids is required'},
                status=status.HTTP_400_BAD_REQUEST,
            )

        service = LabelService(request.tenant)
        try:
            result = service.generate_lpn_labels(lpn_ids, fmt)
        except Exception as e:
            return Response(
                {'error': str(e)},
                status=status.HTTP_400_BAD_REQUEST,
            )

        if fmt == 'ZPL':
            return HttpResponse(result, content_type='text/plain')

        response = HttpResponse(result, content_type='application/pdf')
        response['Content-Disposition'] = 'inline; filename="lpn-labels.pdf"'
        return response
