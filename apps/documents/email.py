# apps/documents/email.py
"""
Email service for sending documents and notifications.

Uses Django's EmailMultiAlternatives for HTML email with attachments.
"""
import logging
from django.conf import settings
from django.core.mail import EmailMultiAlternatives
from django.template.loader import render_to_string

logger = logging.getLogger(__name__)


class EmailService:
    """
    Service for sending emails with optional PDF attachments.

    Usage:
        EmailService.send_email(
            to=['customer@example.com'],
            subject='Invoice INV-001',
            html_body='<h1>Your invoice is attached</h1>',
            attachments=[('invoice.pdf', pdf_bytes, 'application/pdf')]
        )
        EmailService.send_invoice(invoice, 'customer@example.com')
    """

    @staticmethod
    def send_email(to, subject, html_body, from_email=None, attachments=None, cc=None, bcc=None):
        """
        Send an HTML email with optional attachments.

        Args:
            to: List of recipient email addresses
            subject: Email subject line
            html_body: HTML content of the email
            from_email: Sender email (defaults to DEFAULT_FROM_EMAIL)
            attachments: List of (filename, content_bytes, mime_type) tuples
            cc: List of CC addresses
            bcc: List of BCC addresses

        Returns:
            int: Number of messages sent (0 or 1)
        """
        if isinstance(to, str):
            to = [to]

        from_email = from_email or getattr(settings, 'DEFAULT_FROM_EMAIL', 'noreply@ravensaas.com')

        msg = EmailMultiAlternatives(
            subject=subject,
            body=html_body,  # Fallback plain text
            from_email=from_email,
            to=to,
            cc=cc or [],
            bcc=bcc or [],
        )
        msg.attach_alternative(html_body, 'text/html')

        if attachments:
            for filename, content, mime_type in attachments:
                msg.attach(filename, content, mime_type)

        try:
            result = msg.send()
            logger.info(f"Email sent to {to}: {subject}")
            return result
        except Exception as e:
            logger.error(f"Failed to send email to {to}: {e}")
            raise

    @classmethod
    def send_invoice(cls, invoice, to_email, cc=None):
        """
        Generate an invoice PDF and email it.

        Args:
            invoice: Invoice model instance
            to_email: Recipient email address(es)
            cc: Optional CC addresses

        Returns:
            int: Number of messages sent
        """
        from .pdf import PDFService

        pdf_bytes = PDFService.render_invoice(invoice)
        tenant_name = invoice.tenant.settings.company_name or invoice.tenant.name
        subject = f'Invoice {invoice.invoice_number} from {tenant_name}'

        html_body = render_to_string('documents/email/invoice_email.html', {
            'invoice': invoice,
            'company_name': tenant_name,
        })

        return cls.send_email(
            to=to_email,
            subject=subject,
            html_body=html_body,
            attachments=[(
                f'Invoice_{invoice.invoice_number}.pdf',
                pdf_bytes,
                'application/pdf',
            )],
            cc=cc,
        )

    @classmethod
    def send_purchase_order(cls, purchase_order, to_email, cc=None):
        """
        Generate a PO PDF and email it to the vendor.

        Args:
            purchase_order: PurchaseOrder model instance
            to_email: Recipient email address(es)
            cc: Optional CC addresses

        Returns:
            int: Number of messages sent
        """
        from .pdf import PDFService

        pdf_bytes = PDFService.render_purchase_order(purchase_order)
        tenant_name = purchase_order.tenant.settings.company_name or purchase_order.tenant.name
        subject = f'Purchase Order {purchase_order.po_number} from {tenant_name}'

        html_body = render_to_string('documents/email/po_email.html', {
            'purchase_order': purchase_order,
            'company_name': tenant_name,
        })

        return cls.send_email(
            to=to_email,
            subject=subject,
            html_body=html_body,
            attachments=[(
                f'PO_{purchase_order.po_number}.pdf',
                pdf_bytes,
                'application/pdf',
            )],
            cc=cc,
        )
