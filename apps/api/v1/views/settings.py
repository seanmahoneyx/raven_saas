# apps/api/v1/views/settings.py
"""Tenant settings endpoint - combines company info and accounting defaults."""
from rest_framework.views import APIView
from rest_framework.response import Response
from rest_framework.permissions import IsAuthenticated
from drf_spectacular.utils import extend_schema


@extend_schema(
    description="Get or update tenant settings (company info + accounting defaults)",
    tags=["Settings"]
)
class TenantSettingsView(APIView):
    """
    GET /api/v1/settings/ - Returns combined tenant + accounting settings.
    PATCH /api/v1/settings/ - Updates tenant and/or accounting settings.
    """
    permission_classes = [IsAuthenticated]

    def _serialize(self, tenant_settings, accounting_settings):
        # Build full address from components
        address_parts = [
            tenant_settings.address_line1,
            tenant_settings.address_line2,
            ', '.join(filter(None, [
                tenant_settings.city,
                tenant_settings.state,
                tenant_settings.postal_code,
            ])),
            tenant_settings.country if tenant_settings.country != 'USA' else '',
        ]
        company_address = '\n'.join(p for p in address_parts if p)

        return {
            'id': tenant_settings.pk,
            'company_name': tenant_settings.company_name,
            'company_address': company_address,
            'company_phone': tenant_settings.phone,
            'company_email': tenant_settings.email,
            'company_logo_url': tenant_settings.logo.url if tenant_settings.logo else '',
            'fiscal_year_start_month': 1,  # TODO: add to model if needed
            'default_income_account': accounting_settings.default_income_account_id,
            'default_cogs_account': accounting_settings.default_cogs_account_id,
            'default_inventory_account': accounting_settings.default_inventory_account_id,
            'default_ar_account': accounting_settings.default_ar_account_id,
            'default_ap_account': accounting_settings.default_ap_account_id,
            'default_cash_account': accounting_settings.default_cash_account_id,
            'default_freight_income_account': accounting_settings.default_freight_income_account_id,
            'default_freight_expense_account': accounting_settings.default_freight_expense_account_id,
            'default_sales_discount_account': accounting_settings.default_sales_discount_account_id,
            'default_purchase_discount_account': accounting_settings.default_purchase_discount_account_id,
        }

    def get(self, request):
        from apps.tenants.models import TenantSettings
        from apps.accounting.models import AccountingSettings

        tenant = request.tenant
        ts, _ = TenantSettings.objects.get_or_create(tenant=tenant)
        acct = AccountingSettings.get_for_tenant(tenant)
        return Response(self._serialize(ts, acct))

    def patch(self, request):
        from apps.tenants.models import TenantSettings
        from apps.accounting.models import AccountingSettings

        tenant = request.tenant
        ts, _ = TenantSettings.objects.get_or_create(tenant=tenant)
        acct = AccountingSettings.get_for_tenant(tenant)

        data = request.data

        # Update company info fields
        if 'company_name' in data:
            ts.company_name = data['company_name']
        if 'company_phone' in data:
            ts.phone = data['company_phone']
        if 'company_email' in data:
            ts.email = data['company_email']
        if 'company_address' in data:
            # Store full address in address_line1 for simplicity
            ts.address_line1 = data['company_address']
            ts.address_line2 = ''
            ts.city = ''
            ts.state = ''
            ts.postal_code = ''
        ts.save()

        # Update accounting defaults
        acct_fields = [
            'default_income_account', 'default_cogs_account', 'default_inventory_account',
            'default_ar_account', 'default_ap_account', 'default_cash_account',
            'default_freight_income_account', 'default_freight_expense_account',
            'default_sales_discount_account', 'default_purchase_discount_account',
        ]
        update_fields = []
        for field in acct_fields:
            if field in data:
                fk_field = f'{field}_id'
                setattr(acct, fk_field, data[field])
                update_fields.append(fk_field)
        if update_fields:
            acct.save(update_fields=update_fields)

        return Response(self._serialize(ts, acct))
