# apps/documents/tests.py
"""
Tests for the Attachment model (GenericForeignKey).
"""
from django.test import TestCase
from django.contrib.contenttypes.models import ContentType
from django.core.files.uploadedfile import SimpleUploadedFile

from apps.tenants.models import Tenant
from apps.parties.models import Party
from apps.documents.models import Attachment
from shared.managers import set_current_tenant
from users.models import User


class AttachmentModelTestCase(TestCase):
    """Tests for the Attachment model with GenericForeignKey."""

    @classmethod
    def setUpTestData(cls):
        cls.tenant = Tenant.objects.create(name='Doc Co', subdomain='test-documents')
        cls.user = User.objects.create_user(username='docuser', password='pass')
        set_current_tenant(cls.tenant)

        cls.party = Party.objects.create(
            tenant=cls.tenant,
            party_type='CUSTOMER',
            code='DOC-PARTY',
            display_name='Doc Party',
        )

    def setUp(self):
        set_current_tenant(self.tenant)

    # ── 5.4a: Create Attachment linked to a Party ────────────────────────

    def test_create_attachment(self):
        """Create an Attachment linked to a Party via GenericForeignKey."""
        ct = ContentType.objects.get_for_model(Party)
        fake_file = SimpleUploadedFile(
            'test_document.pdf',
            b'%PDF-1.4 fake content',
            content_type='application/pdf',
        )
        attachment = Attachment.objects.create(
            tenant=self.tenant,
            content_type=ct,
            object_id=self.party.pk,
            file=fake_file,
            filename='test_document.pdf',
            mime_type='application/pdf',
            category='document',
            uploaded_by=self.user,
        )
        self.assertEqual(attachment.content_type, ct)
        self.assertEqual(attachment.object_id, self.party.pk)
        self.assertEqual(attachment.filename, 'test_document.pdf')
        self.assertEqual(attachment.mime_type, 'application/pdf')
        self.assertEqual(attachment.category, 'document')
        self.assertIn('test_document', str(attachment))

    # ── 5.4b: __str__ format ─────────────────────────────────────────────

    def test_attachment_str(self):
        """Attachment __str__ includes filename and content_type:object_id."""
        ct = ContentType.objects.get_for_model(Party)
        fake_file = SimpleUploadedFile(
            'spec_sheet.png',
            b'\x89PNG fake image',
            content_type='image/png',
        )
        attachment = Attachment.objects.create(
            tenant=self.tenant,
            content_type=ct,
            object_id=self.party.pk,
            file=fake_file,
            filename='spec_sheet.png',
            mime_type='image/png',
            category='image',
        )
        expected_str = f"spec_sheet.png ({ct}:{self.party.pk})"
        self.assertEqual(str(attachment), expected_str)

    # ── 5.4c: Query attachments for a specific object ────────────────────

    def test_query_attachments_for_object(self):
        """Query all attachments for a given object using content_type + object_id."""
        ct = ContentType.objects.get_for_model(Party)

        for i in range(3):
            fake_file = SimpleUploadedFile(
                f'file_{i}.pdf',
                b'content',
                content_type='application/pdf',
            )
            Attachment.objects.create(
                tenant=self.tenant,
                content_type=ct,
                object_id=self.party.pk,
                file=fake_file,
                filename=f'file_{i}.pdf',
                mime_type='application/pdf',
            )

        attachments = Attachment.objects.filter(
            tenant=self.tenant,
            content_type=ct,
            object_id=self.party.pk,
        )
        self.assertEqual(attachments.count(), 3)
