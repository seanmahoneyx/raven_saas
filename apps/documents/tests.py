# apps/documents/tests.py
"""
Tests for the Attachment model (GenericForeignKey) and DocumentLink lineage.
"""
from decimal import Decimal

from django.test import TestCase
from django.contrib.contenttypes.models import ContentType
from django.core.files.uploadedfile import SimpleUploadedFile
from django.utils import timezone

from apps.tenants.models import Tenant
from apps.parties.models import Party
from apps.documents.models import Attachment, DocumentLink, record_link
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


class DocumentLinkModelTestCase(TestCase):
    """Tests for the DocumentLink lineage model and record_link helper."""

    @classmethod
    def setUpTestData(cls):
        cls.tenant = Tenant.objects.create(name='Link Co', subdomain='test-doclinks')
        cls.user = User.objects.create_user(username='linkuser', password='pass')
        set_current_tenant(cls.tenant)

        # Two arbitrary tenant-scoped objects to act as source/target.
        cls.source = Party.objects.create(
            tenant=cls.tenant, party_type='CUSTOMER', code='SRC', display_name='Source Party',
        )
        cls.target = Party.objects.create(
            tenant=cls.tenant, party_type='CUSTOMER', code='TGT', display_name='Target Party',
        )

    def setUp(self):
        set_current_tenant(self.tenant)

    def test_record_link_creates_link(self):
        link = record_link(self.source, self.target, 'estimate_to_sales_order', self.tenant, user=self.user)
        self.assertIsNotNone(link.pk)
        self.assertEqual(link.source, self.source)
        self.assertEqual(link.target, self.target)
        self.assertEqual(link.relation, 'estimate_to_sales_order')
        self.assertEqual(link.created_by, self.user)

    def test_record_link_is_idempotent(self):
        """Calling record_link twice for the same edge returns one row (get_or_create)."""
        first = record_link(self.source, self.target, 'estimate_to_sales_order', self.tenant, user=self.user)
        second = record_link(self.source, self.target, 'estimate_to_sales_order', self.tenant)
        self.assertEqual(first.pk, second.pk)
        ct = ContentType.objects.get_for_model(Party)
        self.assertEqual(
            DocumentLink.objects.filter(
                tenant=self.tenant,
                source_content_type=ct, source_object_id=self.source.pk,
                target_content_type=ct, target_object_id=self.target.pk,
                relation='estimate_to_sales_order',
            ).count(),
            1,
        )

    def test_different_relation_creates_distinct_link(self):
        record_link(self.source, self.target, 'estimate_to_sales_order', self.tenant)
        record_link(self.source, self.target, 'estimate_to_contract', self.tenant)
        ct = ContentType.objects.get_for_model(Party)
        self.assertEqual(
            DocumentLink.objects.filter(
                tenant=self.tenant,
                source_content_type=ct, source_object_id=self.source.pk,
            ).count(),
            2,
        )


class ConvertCreatesDocumentLinkTestCase(TestCase):
    """convert_estimate_to_order should record an estimate→sales_order link."""

    @classmethod
    def setUpTestData(cls):
        from apps.parties.models import Customer, Location
        from apps.items.models import UnitOfMeasure, Item

        cls.tenant = Tenant.objects.create(name='Conv Co', subdomain='test-convlink')
        cls.user = User.objects.create_user(username='convuser', password='pass')
        set_current_tenant(cls.tenant)

        cls.uom = UnitOfMeasure.objects.create(tenant=cls.tenant, code='ea', name='Each')
        cls.cust_party = Party.objects.create(
            tenant=cls.tenant, party_type='CUSTOMER', code='C1', display_name='Conv Customer',
        )
        cls.location = Location.objects.create(
            tenant=cls.tenant, party=cls.cust_party, location_type='SHIP_TO',
            name='Main', address_line1='1 St', city='Chicago', state='IL', postal_code='60601',
        )
        cls.customer = Customer.objects.create(tenant=cls.tenant, party=cls.cust_party)
        cls.item = Item.objects.create(
            tenant=cls.tenant, sku='ITM-1', name='Widget', base_uom=cls.uom, item_type='inventory',
        )

    def setUp(self):
        set_current_tenant(self.tenant)

    def test_convert_estimate_to_order_records_link(self):
        from apps.orders.models import Estimate, EstimateLine, SalesOrder
        from apps.orders.services import convert_estimate_to_order

        est = Estimate.objects.create(
            tenant=self.tenant, estimate_number='EST-000001', customer=self.customer,
            status='sent', date=timezone.now().date(), ship_to=self.location,
        )
        EstimateLine.objects.create(
            tenant=self.tenant, estimate=est, line_number=10,
            item=self.item, quantity=5, uom=self.uom, unit_price=Decimal('10.00'),
        )

        so = convert_estimate_to_order(est, self.tenant, self.user)

        est_ct = ContentType.objects.get_for_model(Estimate)
        so_ct = ContentType.objects.get_for_model(SalesOrder)
        link = DocumentLink.objects.get(
            tenant=self.tenant,
            source_content_type=est_ct, source_object_id=est.pk,
            target_content_type=so_ct, target_object_id=so.pk,
            relation='estimate_to_sales_order',
        )
        self.assertEqual(link.created_by, self.user)
        self.assertEqual(link.source, est)
        self.assertEqual(link.target, so)
