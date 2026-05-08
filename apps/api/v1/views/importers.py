import re

from django.http import HttpResponse
from rest_framework.views import APIView
from rest_framework.response import Response
from rest_framework.parsers import MultiPartParser
from rest_framework.permissions import IsAdminUser
from rest_framework import status
from drf_spectacular.utils import extend_schema

from apps.core.importers import (
    LocationImporter, PartyImporter, ItemImporter, GLOpeningBalanceImporter,
    WarehouseImporter, CustomerImporter, VendorImporter, InventoryImporter,
)
from apps.core.importers.base import MAX_CSV_BYTES
from apps.core.importers.templates import build_template_csv


IMPORTER_MAP = {
    'locations': LocationImporter,
    'parties': PartyImporter,
    'items': ItemImporter,
    'gl-opening-balances': GLOpeningBalanceImporter,
    'warehouses': WarehouseImporter,
    'customers': CustomerImporter,
    'vendors': VendorImporter,
    'inventory': InventoryImporter,
}


class DataImportView(APIView):
    """
    POST /api/v1/admin/import/{type}/
    GET  /api/v1/admin/import/{type}/template/

    Upload a CSV file to import data. Supports dry-run validation.
    GET returns a downloadable CSV template for the given import type.

    Path params:
        type: one of locations, parties, items, gl-opening-balances,
              warehouses, customers, vendors, inventory

    Body (multipart/form-data) for POST:
        file: CSV file
        commit: 'true' or 'false' (default: false = dry run)
    """
    parser_classes = [MultiPartParser]
    permission_classes = [IsAdminUser]

    @extend_schema(
        tags=['admin'],
        summary='Download CSV import template',
        description='Returns a CSV template file for the given import type.',
    )
    def get(self, request, import_type):
        if import_type not in IMPORTER_MAP:
            return Response(
                {'detail': f"Invalid import type '{import_type}'. Must be one of: {', '.join(IMPORTER_MAP.keys())}"},
                status=status.HTTP_400_BAD_REQUEST,
            )

        filename, csv_bytes = build_template_csv(import_type)
        safe = re.sub(r'[^a-zA-Z0-9\-]', '', import_type)
        response = HttpResponse(csv_bytes, content_type='text/csv')
        response['Content-Disposition'] = f'attachment; filename="{safe}-template.csv"'
        return response

    @extend_schema(
        tags=['admin'],
        summary='Import data from CSV file',
        description='Upload CSV for locations, parties, items, warehouses, customers, vendors, or inventory. Use commit=false for dry run.',
    )
    def post(self, request, import_type):
        # Validate import type
        if import_type not in IMPORTER_MAP:
            return Response(
                {'detail': f"Invalid import type '{import_type}'. Must be one of: {', '.join(IMPORTER_MAP.keys())}"},
                status=status.HTTP_400_BAD_REQUEST,
            )

        # Validate file
        if 'file' not in request.FILES:
            return Response(
                {'detail': 'No file uploaded. Send a CSV file in the "file" field.'},
                status=status.HTTP_400_BAD_REQUEST,
            )

        file = request.FILES['file']
        if not file.name.endswith('.csv'):
            return Response(
                {'detail': 'Only CSV files are supported.'},
                status=status.HTTP_400_BAD_REQUEST,
            )

        # File size cap (F2)
        if file.size > MAX_CSV_BYTES:
            return Response(
                {'detail': 'File exceeds 10 MB limit.'},
                status=status.HTTP_413_REQUEST_ENTITY_TOO_LARGE,
            )

        # Parse commit flag
        commit = request.data.get('commit', 'false').lower() == 'true'

        # Run importer
        ImporterClass = IMPORTER_MAP[import_type]
        importer = ImporterClass(tenant=request.tenant, user=request.user)
        report = importer.run(file, commit=commit)

        # Build response
        response_data = {
            'import_type': import_type,
            'mode': 'commit' if commit else 'dry_run',
            'total': report['total'],
            'valid': report['valid'],
            'created': report['created'],
            'updated': report['updated'],
            'error_count': len(report['errors']),
            'errors': report['errors'],
        }

        if commit and not report['errors']:
            response_data['message'] = f"Successfully imported {report['created']} new and updated {report['updated']} existing records."

        return Response(response_data, status=status.HTTP_200_OK)
