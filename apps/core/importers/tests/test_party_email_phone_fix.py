"""
Regression tests: PartyImporter now persists Email and Phone to
Party.main_email and Party.main_phone.
"""
import io
from django.test import TestCase

from apps.tenants.models import Tenant
from apps.parties.models import Party
from apps.core.importers import PartyImporter
from shared.managers import set_current_tenant
from users.models import User


def make_csv(*rows, headers=None):
    if headers is None:
        headers = ['Code', 'Name', 'Type', 'LegalName', 'Email', 'Phone', 'Notes']
    lines = [','.join(headers)]
    for row in rows:
        lines.append(','.join(str(v) for v in row))
    f = io.BytesIO('\n'.join(lines).encode('utf-8'))
    f.name = 'test.csv'
    return f


class PartyEmailPhoneRegressionTestCase(TestCase):

    @classmethod
    def setUpTestData(cls):
        cls.tenant = Tenant.objects.create(name='Regression Co', subdomain='test-party-email-fix')
        cls.user = User.objects.create_user(username='reguser', password='pass')
        set_current_tenant(cls.tenant)

    def setUp(self):
        set_current_tenant(self.tenant)

    def _importer(self):
        return PartyImporter(tenant=self.tenant, user=self.user)

    def test_email_and_phone_saved_on_create(self):
        """Email and Phone columns are persisted to main_email/main_phone on new party."""
        f = make_csv(['EP001', 'Email Phone Co', 'CUSTOMER', '', 'contact@ep.com', '555-9999', ''])
        result = self._importer().run(f, commit=True)
        self.assertEqual(result['errors'], [])
        party = Party.objects.get(tenant=self.tenant, code='EP001')
        self.assertEqual(party.main_email, 'contact@ep.com')
        self.assertEqual(party.main_phone, '555-9999')

    def test_email_and_phone_not_lost_in_defaults_dict(self):
        """
        Regression: Email and Phone are present in the update_or_create defaults dict.

        PartyImporter is insert-only (it rejects existing codes), so we verify
        the fix by inspecting two fresh creates that each carry email/phone data.
        """
        f = make_csv(
            ['EP002A', 'Party A', 'CUSTOMER', '', 'a@ep.com', '555-0001', ''],
            ['EP002B', 'Party B', 'VENDOR', '', 'b@ep.com', '555-0002', ''],
        )
        result = self._importer().run(f, commit=True)
        self.assertEqual(result['errors'], [])
        party_a = Party.objects.get(tenant=self.tenant, code='EP002A')
        self.assertEqual(party_a.main_email, 'a@ep.com')
        self.assertEqual(party_a.main_phone, '555-0001')
        party_b = Party.objects.get(tenant=self.tenant, code='EP002B')
        self.assertEqual(party_b.main_email, 'b@ep.com')
        self.assertEqual(party_b.main_phone, '555-0002')

    def test_blank_email_phone_saves_empty_strings(self):
        """Blank Email/Phone columns save empty strings (not None)."""
        f = make_csv(['EP003', 'No Contact', 'VENDOR', '', '', '', ''])
        result = self._importer().run(f, commit=True)
        self.assertEqual(result['errors'], [])
        party = Party.objects.get(tenant=self.tenant, code='EP003')
        self.assertEqual(party.main_email, '')
        self.assertEqual(party.main_phone, '')
