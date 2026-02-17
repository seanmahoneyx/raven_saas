# apps/api/v1/views/onboarding.py
"""
Onboarding wizard API endpoints.

Guides new tenants through initial setup:
  Step 1 - Company info
  Step 2 - Default warehouse
  Step 3 - Units of measure
  Step 4 - Invite team members
  Step 5 - Complete
"""
from rest_framework.views import APIView
from rest_framework.response import Response
from rest_framework import status
from rest_framework.permissions import IsAuthenticated
from rest_framework.parsers import MultiPartParser, FormParser, JSONParser
from drf_spectacular.utils import extend_schema

from apps.tenants.models import Tenant
from apps.warehousing.models import Warehouse
from apps.items.models import UnitOfMeasure
from ..serializers.onboarding import (
    CompanySetupSerializer,
    WarehouseSetupSerializer,
    UoMSetupSerializer,
    InviteTeamSerializer,
)

# ---------------------------------------------------------------------------
# Predefined UoM sets
# ---------------------------------------------------------------------------
UOM_PRESETS = {
    'standard': [
        ('EA', 'Each'),
        ('CS', 'Case'),
        ('PLT', 'Pallet'),
        ('LB', 'Pound'),
        ('KG', 'Kilogram'),
    ],
    'corrugated': [
        ('EA', 'Each'),
        ('SHT', 'Sheet'),
        ('MSF', 'Thousand Square Feet'),
        ('CS', 'Case'),
        ('PLT', 'Pallet'),
        ('BDL', 'Bundle'),
    ],
    'food': [
        ('EA', 'Each'),
        ('CS', 'Case'),
        ('PLT', 'Pallet'),
        ('LB', 'Pound'),
        ('KG', 'Kilogram'),
        ('GAL', 'Gallon'),
        ('OZ', 'Ounce'),
    ],
}

# Map industry choices to sensible default UoM preset
INDUSTRY_TO_PRESET = {
    'corrugated': 'corrugated',
    'food_beverage': 'food',
    'manufacturing': 'standard',
    'distribution': 'standard',
    'other': 'standard',
    '': 'standard',
}


def _get_tenant(request):
    """Return the Tenant for the current request user."""
    user = request.user
    # Support direct FK 'tenant' on user, or fall back to default tenant
    if hasattr(user, 'tenant') and user.tenant_id:
        return user.tenant
    # Development fallback: use the default tenant
    return Tenant.objects.filter(is_default=True).first()


# ---------------------------------------------------------------------------
# Status
# ---------------------------------------------------------------------------

@extend_schema(tags=['Onboarding'])
class OnboardingStatusView(APIView):
    """GET /api/v1/onboarding/status/ - Return current onboarding state."""
    permission_classes = [IsAuthenticated]

    def get(self, request):
        tenant = _get_tenant(request)
        if not tenant:
            return Response({'detail': 'Tenant not found.'}, status=status.HTTP_404_NOT_FOUND)

        return Response({
            'onboarding_completed': tenant.onboarding_completed,
            'onboarding_step': tenant.onboarding_step,
            'company_name': tenant.name,
            'company_address': tenant.company_address,
            'company_phone': tenant.company_phone,
            'company_logo': request.build_absolute_uri(tenant.company_logo.url) if tenant.company_logo else None,
            'industry': tenant.industry,
        })


# ---------------------------------------------------------------------------
# Step 1 - Company info
# ---------------------------------------------------------------------------

@extend_schema(tags=['Onboarding'])
class OnboardingCompanyView(APIView):
    """POST /api/v1/onboarding/company/ - Save company info (Step 1)."""
    permission_classes = [IsAuthenticated]
    parser_classes = [MultiPartParser, FormParser, JSONParser]

    def post(self, request):
        tenant = _get_tenant(request)
        if not tenant:
            return Response({'detail': 'Tenant not found.'}, status=status.HTTP_404_NOT_FOUND)

        serializer = CompanySetupSerializer(data=request.data)
        if not serializer.is_valid():
            return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)

        data = serializer.validated_data
        tenant.name = data['name']
        tenant.company_address = data.get('company_address', '')
        tenant.company_phone = data.get('company_phone', '')
        tenant.industry = data.get('industry', '')
        if 'company_logo' in data and data['company_logo']:
            tenant.company_logo = data['company_logo']
        if tenant.onboarding_step < 1:
            tenant.onboarding_step = 1
        tenant.save()

        return Response({
            'detail': 'Company info saved.',
            'onboarding_step': tenant.onboarding_step,
        })


# ---------------------------------------------------------------------------
# Step 2 - Default warehouse
# ---------------------------------------------------------------------------

@extend_schema(tags=['Onboarding'])
class OnboardingWarehouseView(APIView):
    """POST /api/v1/onboarding/warehouse/ - Create default warehouse (Step 2)."""
    permission_classes = [IsAuthenticated]

    def post(self, request):
        tenant = _get_tenant(request)
        if not tenant:
            return Response({'detail': 'Tenant not found.'}, status=status.HTTP_404_NOT_FOUND)

        serializer = WarehouseSetupSerializer(data=request.data)
        if not serializer.is_valid():
            return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)

        data = serializer.validated_data
        warehouse, created = Warehouse.objects.get_or_create(
            tenant=tenant,
            code=data.get('code', 'WH-01'),
            defaults={
                'name': data.get('name', 'Main Warehouse'),
                'notes': data.get('address', ''),
                'is_default': True,
            }
        )
        if not created:
            warehouse.name = data.get('name', warehouse.name)
            warehouse.notes = data.get('address', warehouse.notes)
            warehouse.is_default = True
            warehouse.save()

        if tenant.onboarding_step < 2:
            tenant.onboarding_step = 2
            tenant.save(update_fields=['onboarding_step'])

        return Response({
            'detail': 'Warehouse saved.',
            'warehouse_id': warehouse.id,
            'onboarding_step': tenant.onboarding_step,
        })


# ---------------------------------------------------------------------------
# Step 3 - Units of Measure
# ---------------------------------------------------------------------------

@extend_schema(tags=['Onboarding'])
class OnboardingUoMView(APIView):
    """POST /api/v1/onboarding/uom/ - Create default UoMs (Step 3)."""
    permission_classes = [IsAuthenticated]

    def post(self, request):
        tenant = _get_tenant(request)
        if not tenant:
            return Response({'detail': 'Tenant not found.'}, status=status.HTTP_404_NOT_FOUND)

        serializer = UoMSetupSerializer(data=request.data)
        if not serializer.is_valid():
            return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)

        data = serializer.validated_data
        preset_key = data.get('preset', 'standard')
        explicit_codes = data.get('uom_codes', [])

        if explicit_codes:
            # Build from explicit codes using the preset as lookup table
            all_uoms = {code: name for code, name in UOM_PRESETS.get(preset_key, [])}
            # Also search all presets for the code
            for entries in UOM_PRESETS.values():
                for code, name in entries:
                    if code not in all_uoms:
                        all_uoms[code] = name
            uom_list = [(code, all_uoms.get(code, code)) for code in explicit_codes]
        else:
            uom_list = UOM_PRESETS.get(preset_key, UOM_PRESETS['standard'])

        created_ids = []
        for code, name in uom_list:
            uom, _ = UnitOfMeasure.objects.get_or_create(
                tenant=tenant,
                code=code,
                defaults={'name': name},
            )
            created_ids.append(uom.id)

        if tenant.onboarding_step < 3:
            tenant.onboarding_step = 3
            tenant.save(update_fields=['onboarding_step'])

        return Response({
            'detail': f'{len(created_ids)} units of measure set up.',
            'uom_count': len(created_ids),
            'onboarding_step': tenant.onboarding_step,
        })

    def get(self, request):
        """GET /api/v1/onboarding/uom/ - Return available presets."""
        return Response({
            'presets': {
                key: [{'code': c, 'name': n} for c, n in entries]
                for key, entries in UOM_PRESETS.items()
            },
            'suggested_preset': INDUSTRY_TO_PRESET.get(
                _get_tenant(request).industry if _get_tenant(request) else '',
                'standard'
            ),
        })


# ---------------------------------------------------------------------------
# Step 4 - Invite team
# ---------------------------------------------------------------------------

@extend_schema(tags=['Onboarding'])
class OnboardingInviteView(APIView):
    """POST /api/v1/onboarding/invite/ - Send team invitations (Step 4)."""
    permission_classes = [IsAuthenticated]

    def post(self, request):
        tenant = _get_tenant(request)
        if not tenant:
            return Response({'detail': 'Tenant not found.'}, status=status.HTTP_404_NOT_FOUND)

        serializer = InviteTeamSerializer(data=request.data)
        if not serializer.is_valid():
            return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)

        invites = serializer.validated_data.get('invites', [])

        # TODO: Wire up real email invitations when the communication app is ready.
        # For now we record intent and return success so the wizard can proceed.
        invited = [inv['email'] for inv in invites]

        if tenant.onboarding_step < 4:
            tenant.onboarding_step = 4
            tenant.save(update_fields=['onboarding_step'])

        return Response({
            'detail': f'{len(invited)} invitation(s) queued.',
            'invited': invited,
            'onboarding_step': tenant.onboarding_step,
        })


# ---------------------------------------------------------------------------
# Complete
# ---------------------------------------------------------------------------

@extend_schema(tags=['Onboarding'])
class OnboardingCompleteView(APIView):
    """POST /api/v1/onboarding/complete/ - Mark onboarding as done."""
    permission_classes = [IsAuthenticated]

    def post(self, request):
        tenant = _get_tenant(request)
        if not tenant:
            return Response({'detail': 'Tenant not found.'}, status=status.HTTP_404_NOT_FOUND)

        tenant.onboarding_completed = True
        tenant.onboarding_step = 5
        tenant.save(update_fields=['onboarding_completed', 'onboarding_step'])

        return Response({
            'detail': 'Onboarding complete. Welcome to Raven!',
            'onboarding_completed': True,
            'onboarding_step': 5,
        })
