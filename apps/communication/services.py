# apps/communication/services.py
"""
Email service for sending transactional emails with PDF attachments.

Supports Django's SMTP backend (configurable for Postmark/SendGrid via
EMAIL_BACKEND and related settings in settings.py).
"""
import logging
from django.core.mail import EmailMessage
from django.conf import settings

from apps.documents.pdf import PDFService

logger = logging.getLogger(__name__)


class EmailService:
    """
    Service for sending transactional emails with optional PDF attachments.

    Usage:
        EmailService.send_transaction(
            document=invoice,
            document_type='invoice',
            recipient_list=['customer@example.com'],
            subject='Invoice #1001',
            body='Please find your invoice attached.',
        )
    """

    # Map document types to PDF render methods and filename patterns
    DOCUMENT_TYPES = {
        'invoice': {
            'render': lambda doc: PDFService.render_invoice(doc),
            'filename': lambda doc: f'Invoice_{doc.invoice_number}.pdf',
            'default_subject': lambda doc: f'Invoice {doc.invoice_number}',
        },
        'purchase_order': {
            'render': lambda doc: PDFService.render_purchase_order(doc),
            'filename': lambda doc: f'PO_{doc.po_number}.pdf',
            'default_subject': lambda doc: f'Purchase Order {doc.po_number}',
        },
        'estimate': {
            'render': lambda doc: PDFService.render_estimate(doc),
            'filename': lambda doc: f'Estimate_{doc.estimate_number}.pdf',
            'default_subject': lambda doc: f'Estimate {doc.estimate_number}',
        },
    }

    @classmethod
    def send_transaction(
        cls,
        document,
        document_type: str,
        recipient_list: list[str],
        subject: str = '',
        body: str = '',
        from_email: str = None,
        cc: list[str] = None,
        attach_pdf: bool = True,
    ) -> dict:
        """
        Send a transactional email with an auto-generated PDF attachment.

        Args:
            document: Model instance (Invoice, PurchaseOrder, Estimate)
            document_type: One of 'invoice', 'purchase_order', 'estimate'
            recipient_list: List of recipient email addresses
            subject: Email subject (auto-generated if empty)
            body: Email body text
            from_email: Sender address (uses DEFAULT_FROM_EMAIL if not set)
            cc: Optional CC recipients
            attach_pdf: Whether to attach the PDF (default True)

        Returns:
            dict with 'success', 'message', and 'recipients' keys
        """
        if document_type not in cls.DOCUMENT_TYPES:
            return {
                'success': False,
                'message': f'Unknown document type: {document_type}',
                'recipients': [],
            }

        if not recipient_list:
            return {
                'success': False,
                'message': 'No recipients specified',
                'recipients': [],
            }

        type_config = cls.DOCUMENT_TYPES[document_type]

        # Default subject
        if not subject:
            subject = type_config['default_subject'](document)

        # Default from email
        if not from_email:
            from_email = getattr(settings, 'DEFAULT_FROM_EMAIL', 'noreply@example.com')

        try:
            email = EmailMessage(
                subject=subject,
                body=body,
                from_email=from_email,
                to=recipient_list,
                cc=cc or [],
            )

            # Attach PDF
            if attach_pdf:
                pdf_bytes = type_config['render'](document)
                filename = type_config['filename'](document)
                email.attach(filename, pdf_bytes, 'application/pdf')

            email.send(fail_silently=False)

            logger.info(
                'Email sent: %s to %s (document: %s)',
                subject, ', '.join(recipient_list), document_type,
            )

            return {
                'success': True,
                'message': f'Email sent to {len(recipient_list)} recipient(s)',
                'recipients': recipient_list,
            }

        except Exception as e:
            logger.error('Failed to send email: %s', str(e))
            return {
                'success': False,
                'message': f'Failed to send email: {str(e)}',
                'recipients': [],
            }

    @classmethod
    def send_approval_request(cls, approval, base_url=''):
        """
        Send approval request email with one-click approve/reject links.
        """
        if not base_url:
            base_url = getattr(settings, 'SITE_URL', 'http://localhost:5173')

        approve_url = f'{base_url}/api/v1/approvals/token/{approval.token}/approve/'
        reject_url = f'{base_url}/api/v1/approvals/token/{approval.token}/reject/'

        subject = f'Approval Required: {approval.rule_description}'
        body = (
            f'An order requires your approval.\n\n'
            f'Rule: {approval.rule_description}\n'
            f'Requested by: {approval.requestor.get_full_name() or approval.requestor.username}\n'
            f'Amount: ${approval.amount:,.2f}\n'
            f'Expires: {approval.expires_at.strftime("%Y-%m-%d %H:%M UTC")}\n\n'
            f'Click to approve:\n{approve_url}\n\n'
            f'Click to reject:\n{reject_url}\n\n'
            f'Or log in to review: {base_url}/approvals\n'
        )

        # Determine recipient
        if approval.approver and approval.approver.email:
            recipients = [approval.approver.email]
        else:
            from django.contrib.auth import get_user_model
            User = get_user_model()
            recipients = list(
                User.objects.filter(groups__name='Approvers')
                .exclude(email='')
                .values_list('email', flat=True)
            )

        if not recipients:
            logger.warning('No recipients for approval %s', approval.id)
            return {'success': False, 'message': 'No approver email found', 'recipients': []}

        try:
            email = EmailMessage(
                subject=subject,
                body=body,
                from_email=getattr(settings, 'DEFAULT_FROM_EMAIL', 'noreply@ravensaas.com'),
                to=recipients,
            )
            email.send(fail_silently=False)

            logger.info('Approval email sent for %s to %s', approval.id, recipients)
            return {'success': True, 'message': f'Sent to {len(recipients)} recipient(s)', 'recipients': recipients}
        except Exception as e:
            logger.error('Failed to send approval email: %s', str(e))
            return {'success': False, 'message': str(e), 'recipients': []}
