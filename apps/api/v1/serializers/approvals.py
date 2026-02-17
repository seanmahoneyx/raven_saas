# apps/api/v1/serializers/approvals.py
from rest_framework import serializers
from apps.approvals.models import ApprovalRequest


class ApprovalRequestSerializer(serializers.ModelSerializer):
    requestor_name = serializers.SerializerMethodField()
    approver_name = serializers.SerializerMethodField()
    order_display = serializers.SerializerMethodField()
    order_type = serializers.SerializerMethodField()
    order_id = serializers.IntegerField(source='object_id', read_only=True)
    is_expired = serializers.BooleanField(read_only=True)

    class Meta:
        model = ApprovalRequest
        fields = [
            'id', 'rule_code', 'rule_description', 'status',
            'requestor', 'requestor_name',
            'approver', 'approver_name',
            'order_type', 'order_id', 'order_display',
            'amount', 'is_expired',
            'decided_at', 'decision_note',
            'expires_at', 'created_at',
        ]
        read_only_fields = ['id', 'token', 'created_at', 'expires_at']

    def get_requestor_name(self, obj):
        return obj.requestor.get_full_name() or obj.requestor.username

    def get_approver_name(self, obj):
        if obj.approver:
            return obj.approver.get_full_name() or obj.approver.username
        return None

    def get_order_display(self, obj):
        order = obj.content_object
        if order:
            return str(order)
        return f'{obj.content_type} #{obj.object_id}'

    def get_order_type(self, obj):
        return obj.content_type.model if obj.content_type else None


class ApprovalDecisionSerializer(serializers.Serializer):
    """Payload for approve/reject actions."""
    note = serializers.CharField(required=False, allow_blank=True, default='')
