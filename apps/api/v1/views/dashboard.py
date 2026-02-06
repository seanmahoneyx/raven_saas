# apps/api/v1/views/dashboard.py
"""
Dashboard API endpoint.

Single GET endpoint that returns all dashboard data in one call.
"""
from rest_framework.views import APIView
from rest_framework.response import Response
from drf_spectacular.utils import extend_schema


class DashboardView(APIView):
    """GET /api/v1/dashboard/ — Executive dashboard data."""

    @extend_schema(
        tags=['dashboard'],
        summary='Get dashboard statistics',
        description='Returns KPIs, charts, low stock items, and recent activity in a single call.',
    )
    def get(self, request):
        from apps.reporting.dashboard import get_dashboard_stats
        data = get_dashboard_stats(request.tenant)
        return Response(data)
