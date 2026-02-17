# apps/api/v1/serializers/onboarding.py
"""Serializers for the tenant onboarding wizard."""
from rest_framework import serializers


class CompanySetupSerializer(serializers.Serializer):
    """Step 1: Company info."""
    name = serializers.CharField(max_length=255)
    company_address = serializers.CharField(allow_blank=True, required=False, default='')
    company_phone = serializers.CharField(max_length=20, allow_blank=True, required=False, default='')
    company_logo = serializers.ImageField(required=False, allow_null=True)
    industry = serializers.ChoiceField(
        choices=[
            ('manufacturing', 'Manufacturing'),
            ('distribution', 'Distribution'),
            ('corrugated', 'Corrugated Packaging'),
            ('food_beverage', 'Food & Beverage'),
            ('other', 'Other'),
        ],
        allow_blank=True,
        required=False,
        default='',
    )


class WarehouseSetupSerializer(serializers.Serializer):
    """Step 2: Default warehouse."""
    name = serializers.CharField(max_length=100, default='Main Warehouse')
    code = serializers.CharField(max_length=20, default='WH-01')
    address = serializers.CharField(allow_blank=True, required=False, default='')


class UoMSetupSerializer(serializers.Serializer):
    """Step 3: Units of measure preset selection."""
    PRESET_CHOICES = [('standard', 'Standard'), ('corrugated', 'Corrugated'), ('food', 'Food & Beverage')]
    preset = serializers.ChoiceField(choices=PRESET_CHOICES, required=False, default='standard')
    # Optional explicit list of codes to create (overrides preset if provided)
    uom_codes = serializers.ListField(
        child=serializers.CharField(max_length=10),
        required=False,
        allow_empty=True,
    )


class InviteMemberSerializer(serializers.Serializer):
    """Single invite entry."""
    ROLE_CHOICES = [
        ('Admin', 'Admin'),
        ('Sales', 'Sales'),
        ('Warehouse', 'Warehouse'),
        ('Driver', 'Driver'),
        ('Viewer', 'Viewer'),
    ]
    email = serializers.EmailField()
    role = serializers.ChoiceField(choices=ROLE_CHOICES, default='Viewer')


class InviteTeamSerializer(serializers.Serializer):
    """Step 4: Invite team members."""
    invites = serializers.ListField(
        child=InviteMemberSerializer(),
        required=False,
        allow_empty=True,
    )
