# apps/api/v1/views/pipeline.py
"""
Pipeline Kanban API endpoint.

Single GET endpoint that returns pipeline data for the Kanban board.
"""
from rest_framework.views import APIView
from rest_framework.response import Response
from drf_spectacular.utils import extend_schema


class PipelineView(APIView):
    """GET /api/v1/pipeline/ — Business pipeline Kanban data."""

    @extend_schema(
        tags=['pipeline'],
        summary='Get pipeline Kanban data',
        description='Returns customer and vendor track pipeline stages with cards and KPIs.',
    )
    def get(self, request):
        from apps.reporting.pipeline import get_pipeline_data
        data = get_pipeline_data(
            tenant=request.tenant,
            customer_id=request.query_params.get('customer'),
            vendor_id=request.query_params.get('vendor'),
            date_from=request.query_params.get('date_from'),
            date_to=request.query_params.get('date_to'),
        )
        return Response(data)
