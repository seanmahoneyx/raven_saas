# apps/api/v1/serializers/base.py
"""
Base serializers with automatic tenant handling.

All tenant-scoped serializers should inherit from TenantModelSerializer
to ensure proper tenant assignment on create/update.
"""
from rest_framework import serializers


class TenantSerializerMixin:
    """
    Mixin that automatically handles tenant field on create/update.

    - Excludes 'tenant' from required input (auto-set from request)
    - Validates that objects belong to the current tenant
    - Auto-assigns tenant on create
    """

    def get_fields(self):
        fields = super().get_fields()
        # Make tenant read-only (set automatically)
        if 'tenant' in fields:
            fields['tenant'].read_only = True
        return fields

    def create(self, validated_data):
        """Auto-assign tenant from request context."""
        request = self.context.get('request')
        if request and hasattr(request, 'tenant'):
            validated_data['tenant'] = request.tenant
        return super().create(validated_data)

    def validate(self, attrs):
        """Validate foreign key references belong to the same tenant."""
        request = self.context.get('request')
        if not request or not hasattr(request, 'tenant'):
            return super().validate(attrs)

        tenant = request.tenant

        # Check all foreign key fields that have a tenant attribute
        for field_name, field in self.fields.items():
            if field_name in attrs and attrs[field_name] is not None:
                value = attrs[field_name]
                # Check if it's a model instance with tenant field
                if hasattr(value, 'tenant') and value.tenant != tenant:
                    raise serializers.ValidationError({
                        field_name: f"This {field_name} does not belong to your organization."
                    })

        return super().validate(attrs)


class TenantModelSerializer(TenantSerializerMixin, serializers.ModelSerializer):
    """
    Base ModelSerializer with automatic tenant handling.

    Usage:
        class CustomerSerializer(TenantModelSerializer):
            class Meta:
                model = Customer
                fields = '__all__'
    """
    pass


class TimestampMixin(serializers.Serializer):
    """Mixin that adds read-only timestamp fields."""
    created_at = serializers.DateTimeField(read_only=True)
    updated_at = serializers.DateTimeField(read_only=True)


class NavigationMixin(serializers.Serializer):
    """
    Adds `prev_id`/`next_id` for record-to-record navigation within a tenant.

    The model is inferred from the serialized instance, so this works for any
    tenant-scoped model with an integer `id` (PurchaseOrder, SalesOrder,
    Contract, ...). Subclasses must still list 'prev_id'/'next_id' in
    Meta.fields.
    """
    prev_id = serializers.SerializerMethodField()
    next_id = serializers.SerializerMethodField()

    def get_prev_id(self, obj):
        return type(obj).objects.filter(
            tenant=obj.tenant, id__lt=obj.id
        ).order_by('-id').values_list('id', flat=True).first()

    def get_next_id(self, obj):
        return type(obj).objects.filter(
            tenant=obj.tenant, id__gt=obj.id
        ).order_by('id').values_list('id', flat=True).first()
