from rest_framework.views import APIView
from rest_framework.response import Response
from rest_framework.parsers import MultiPartParser
from rest_framework import status
from drf_spectacular.utils import extend_schema

from apps.core.importers import LocationImporter, PartyImporter, ItemImporter


IMPORTER_MAP = {
    'locations': LocationImporter,
    'parties': PartyImporter,
    'items': ItemImporter,
}


class DataImportView(APIView):
    """
    POST /api/v1/admin/import/{type}/

    Upload a CSV file to import data. Supports dry-run validation.

    Path params:
        type: 'locations', 'parties', or 'items'

    Body (multipart/form-data):
        file: CSV file
        commit: 'true' or 'false' (default: false = dry run)
    """
    parser_classes = [MultiPartParser]

    @extend_schema(
        tags=['admin'],
        summary='Import data from CSV file',
        description='Upload CSV for locations, parties, or items. Use commit=false for dry run.',
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
