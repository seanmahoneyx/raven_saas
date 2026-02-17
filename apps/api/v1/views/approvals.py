from rest_framework import viewsets, filters, status
from rest_framework.decorators import action
from rest_framework.permissions import AllowAny
from rest_framework.response import Response
from rest_framework.views import APIView
from django.http import HttpResponse
from django_filters.rest_framework import DjangoFilterBackend
from django.core.exceptions import ValidationError as DjangoValidationError
from drf_spectacular.utils import extend_schema, extend_schema_view

from apps.approvals.models import ApprovalRequest
from apps.approvals.services import ApprovalService
from apps.api.v1.serializers.approvals import (
    ApprovalRequestSerializer,
    ApprovalDecisionSerializer,
)


@extend_schema_view(
    list=extend_schema(tags=['approvals'], summary='List approval requests'),
    retrieve=extend_schema(tags=['approvals'], summary='Get approval request details'),
)
class ApprovalRequestViewSet(viewsets.ReadOnlyModelViewSet):
    serializer_class = ApprovalRequestSerializer
    filter_backends = [DjangoFilterBackend, filters.SearchFilter, filters.OrderingFilter]
    filterset_fields = ['status', 'rule_code']
    ordering_fields = ['created_at', 'status', 'expires_at']
    ordering = ['-created_at']

    def get_queryset(self):
        return ApprovalRequest.objects.select_related(
            'requestor', 'approver', 'content_type'
        ).all()

    @extend_schema(
        tags=['approvals'],
        summary='Get my pending approvals',
        responses={200: ApprovalRequestSerializer(many=True)},
    )
    @action(detail=False, methods=['get'], url_path='my-pending')
    def my_pending(self, request):
        """GET /approvals/my-pending/ - Get pending approvals for current user."""
        approvals = ApprovalService.get_pending_approvals(request.tenant, request.user)
        serializer = ApprovalRequestSerializer(approvals, many=True, context={'request': request})
        return Response(serializer.data)

    @extend_schema(
        tags=['approvals'],
        summary='Approve an approval request',
        request=ApprovalDecisionSerializer,
        responses={200: ApprovalRequestSerializer},
    )
    @action(detail=True, methods=['post'], url_path='approve')
    def approve(self, request, pk=None):
        """POST /approvals/{id}/approve/ - Approve a request."""
        serializer = ApprovalDecisionSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)

        service = ApprovalService(request.tenant, request.user)
        try:
            approval = service.approve(
                approval_id=pk,
                user=request.user,
                note=serializer.validated_data.get('note', ''),
            )
        except DjangoValidationError as e:
            return Response({'detail': e.message}, status=status.HTTP_400_BAD_REQUEST)

        result = ApprovalRequestSerializer(approval, context={'request': request})
        return Response(result.data)

    @extend_schema(
        tags=['approvals'],
        summary='Reject an approval request',
        request=ApprovalDecisionSerializer,
        responses={200: ApprovalRequestSerializer},
    )
    @action(detail=True, methods=['post'], url_path='reject')
    def reject(self, request, pk=None):
        """POST /approvals/{id}/reject/ - Reject a request."""
        serializer = ApprovalDecisionSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)

        service = ApprovalService(request.tenant, request.user)
        try:
            approval = service.reject(
                approval_id=pk,
                user=request.user,
                note=serializer.validated_data.get('note', ''),
            )
        except DjangoValidationError as e:
            return Response({'detail': e.message}, status=status.HTTP_400_BAD_REQUEST)

        result = ApprovalRequestSerializer(approval, context={'request': request})
        return Response(result.data)


class TokenApproveView(APIView):
    """GET /approvals/token/{token}/approve/ - One-click approve via email link."""
    permission_classes = [AllowAny]
    authentication_classes = []

    @extend_schema(tags=['approvals'], summary='One-click approve via email token')
    def get(self, request, token):
        try:
            approval = ApprovalRequest.objects.select_related('requestor').get(token=token)
        except ApprovalRequest.DoesNotExist:
            return HttpResponse(
                '<html><body><h2>Invalid or expired approval link.</h2></body></html>',
                content_type='text/html', status=404,
            )

        service = ApprovalService(approval.tenant, approval.requestor)
        try:
            service.approve(token=token)
            return HttpResponse(
                '<html><body><h2 style="color:green;">&#10004; Approved successfully.</h2>'
                '<p>You can close this window.</p></body></html>',
                content_type='text/html',
            )
        except DjangoValidationError as e:
            return HttpResponse(
                f'<html><body><h2 style="color:red;">&#10008; {e.message}</h2></body></html>',
                content_type='text/html', status=400,
            )


class TokenRejectView(APIView):
    """GET /approvals/token/{token}/reject/ - One-click reject via email link."""
    permission_classes = [AllowAny]
    authentication_classes = []

    @extend_schema(tags=['approvals'], summary='One-click reject via email token')
    def get(self, request, token):
        try:
            approval = ApprovalRequest.objects.select_related('requestor').get(token=token)
        except ApprovalRequest.DoesNotExist:
            return HttpResponse(
                '<html><body><h2>Invalid or expired approval link.</h2></body></html>',
                content_type='text/html', status=404,
            )

        service = ApprovalService(approval.tenant, approval.requestor)
        try:
            service.reject(token=token)
            return HttpResponse(
                '<html><body><h2 style="color:orange;">&#10008; Rejected.</h2>'
                '<p>You can close this window.</p></body></html>',
                content_type='text/html',
            )
        except DjangoValidationError as e:
            return HttpResponse(
                f'<html><body><h2 style="color:red;">&#10008; {e.message}</h2></body></html>',
                content_type='text/html', status=400,
            )
