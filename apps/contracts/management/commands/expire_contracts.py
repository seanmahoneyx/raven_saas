"""Management command to auto-expire contracts past their end date."""
from django.core.management.base import BaseCommand
from apps.tenants.models import Tenant
from apps.contracts.services import ContractService


class Command(BaseCommand):
    help = 'Expire contracts that are past their end date'

    def handle(self, *args, **options):
        total_expired = 0
        for tenant in Tenant.objects.all():
            svc = ContractService(tenant)
            count = svc.auto_expire_contracts()
            if count:
                self.stdout.write(f"  {tenant.name}: expired {count} contracts")
                total_expired += count

        self.stdout.write(self.style.SUCCESS(f"Done. Expired {total_expired} contracts total."))
