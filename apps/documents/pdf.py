# apps/documents/pdf.py
"""
PDF generation service using WeasyPrint.

Renders Django templates to HTML, then converts to PDF bytes.
"""
import logging
from io import BytesIO
from django.db.models import Sum
from django.template.loader import render_to_string

logger = logging.getLogger(__name__)

def _render_pdf_bytes(html_string):
    """Render an HTML string to PDF bytes using the best available backend."""
    # Prefer xhtml2pdf (pure Python, no native deps)
    try:
        from xhtml2pdf import pisa
        pdf_buffer = BytesIO()
        result = pisa.CreatePDF(html_string, dest=pdf_buffer)
        if result.err:
            raise RuntimeError(f"xhtml2pdf conversion failed with {result.err} errors")
        return pdf_buffer.getvalue()
    except ImportError:
        pass

    # Fallback to WeasyPrint (requires GTK3 on Windows)
    try:
        from weasyprint import HTML
        pdf_buffer = BytesIO()
        HTML(string=html_string).write_pdf(target=pdf_buffer)
        return pdf_buffer.getvalue()
    except (ImportError, OSError) as e:
        raise RuntimeError(
            "No PDF backend available. Install xhtml2pdf (pip install xhtml2pdf) "
            "or WeasyPrint with GTK3 runtime. "
            f"Original error: {e}"
        )


class PDFService:
    """
    Service for generating PDF documents from Django templates.

    Usage:
        pdf_bytes = PDFService.render_to_pdf('documents/invoice.html', context)
        pdf_bytes = PDFService.render_invoice(invoice)
    """

    @staticmethod
    def render_to_pdf(template_name, context):
        """
        Render a Django template to PDF bytes.

        Args:
            template_name: Path to Django template
            context: Template context dict

        Returns:
            bytes: PDF file content
        """
        html_string = render_to_string(template_name, context)
        return _render_pdf_bytes(html_string)

    @classmethod
    def render_invoice(cls, invoice):
        """
        Generate a PDF for an Invoice.

        Args:
            invoice: Invoice model instance (with lines prefetched)

        Returns:
            bytes: PDF file content
        """
        tenant_settings = invoice.tenant.settings
        lines = invoice.lines.select_related('item', 'uom').all()

        context = {
            'document_type': 'INVOICE',
            'document_number': invoice.invoice_number,
            'document_date': invoice.invoice_date,
            'company': {
                'name': tenant_settings.company_name or invoice.tenant.name,
                'address_line1': tenant_settings.address_line1,
                'address_line2': tenant_settings.address_line2,
                'city': tenant_settings.city,
                'state': tenant_settings.state,
                'postal_code': tenant_settings.postal_code,
                'country': tenant_settings.country,
                'phone': tenant_settings.phone,
                'email': tenant_settings.email,
            },
            'bill_to': {
                'name': invoice.bill_to_name,
                'address': invoice.bill_to_address,
            },
            'ship_to': {
                'name': invoice.ship_to_name,
                'address': invoice.ship_to_address,
            },
            'reference_fields': [
                ('Invoice #', invoice.invoice_number),
                ('Date', invoice.invoice_date),
                ('Due Date', invoice.due_date),
                ('Terms', invoice.get_payment_terms_display()),
                ('Customer PO', invoice.customer_po or '-'),
            ],
            'lines': [
                {
                    'line_number': line.line_number,
                    'sku': line.item.sku,
                    'description': line.description,
                    'quantity': line.quantity,
                    'uom': line.uom.code,
                    'unit_price': line.unit_price,
                    'discount_percent': line.discount_percent,
                    'line_total': line.line_total,
                }
                for line in lines
            ],
            'totals': {
                'subtotal': invoice.subtotal,
                'tax_rate': invoice.tax_rate,
                'tax_amount': invoice.tax_amount,
                'freight': invoice.freight_amount,
                'discount': invoice.discount_amount,
                'total': invoice.total_amount,
            },
            'notes': invoice.customer_notes,
            'footer_text': f'Payment Terms: {invoice.get_payment_terms_display()}',
        }

        return cls.render_to_pdf('documents/invoice.html', context)

    @classmethod
    def render_purchase_order(cls, purchase_order):
        """
        Generate a PDF for a Purchase Order.

        Args:
            purchase_order: PurchaseOrder model instance (with lines prefetched)

        Returns:
            bytes: PDF file content
        """
        tenant_settings = purchase_order.tenant.settings
        lines = purchase_order.lines.select_related('item', 'uom').all()

        # Get vendor info
        vendor = purchase_order.vendor
        vendor_party = vendor.party

        context = {
            'document_type': 'PURCHASE ORDER',
            'document_number': purchase_order.po_number,
            'document_date': purchase_order.order_date,
            'company': {
                'name': tenant_settings.company_name or purchase_order.tenant.name,
                'address_line1': tenant_settings.address_line1,
                'address_line2': tenant_settings.address_line2,
                'city': tenant_settings.city,
                'state': tenant_settings.state,
                'postal_code': tenant_settings.postal_code,
                'country': tenant_settings.country,
                'phone': tenant_settings.phone,
                'email': tenant_settings.email,
            },
            'vendor': {
                'name': vendor_party.display_name,
                'address': getattr(vendor_party, 'address', ''),
            },
            'ship_to': {
                'name': purchase_order.ship_to.name if purchase_order.ship_to else '',
                'address': getattr(purchase_order.ship_to, 'address', '') if purchase_order.ship_to else '',
            },
            'reference_fields': [
                ('PO #', purchase_order.po_number),
                ('Date', purchase_order.order_date),
                ('Expected', purchase_order.expected_date or '-'),
                ('Status', purchase_order.get_status_display()),
            ],
            'lines': [
                {
                    'line_number': line.line_number,
                    'sku': line.item.sku,
                    'description': f'{line.item.sku} - {line.item.description}' if hasattr(line.item, 'description') else line.item.sku,
                    'quantity': line.quantity_ordered,
                    'uom': line.uom.code if line.uom else '',
                    'unit_price': line.unit_cost,
                    'line_total': line.line_total,
                }
                for line in lines
            ],
            'totals': {
                'subtotal': purchase_order.subtotal,
                'total': purchase_order.subtotal,
            },
            'notes': purchase_order.notes,
            'footer_text': 'Thank you for your business.',
        }

        return cls.render_to_pdf('documents/purchase_order.html', context)

    @classmethod
    def render_estimate(cls, estimate):
        """
        Generate a PDF for an Estimate / Quote.

        Args:
            estimate: Estimate model instance (with lines prefetched)

        Returns:
            bytes: PDF file content
        """
        tenant_settings = estimate.tenant.settings
        lines = estimate.lines.select_related('item', 'uom').all()
        customer_party = estimate.customer.party

        context = {
            'document_type': 'ESTIMATE',
            'document_number': estimate.estimate_number,
            'document_date': estimate.date,
            'company': {
                'name': tenant_settings.company_name or estimate.tenant.name,
                'address_line1': tenant_settings.address_line1,
                'address_line2': tenant_settings.address_line2,
                'city': tenant_settings.city,
                'state': tenant_settings.state,
                'postal_code': tenant_settings.postal_code,
                'country': tenant_settings.country,
                'phone': tenant_settings.phone,
                'email': tenant_settings.email,
            },
            'customer': {
                'name': customer_party.display_name,
                'address': getattr(customer_party, 'address', ''),
            },
            'ship_to': {
                'name': estimate.ship_to.name if estimate.ship_to else '',
                'address': getattr(estimate.ship_to, 'address', '') if estimate.ship_to else '',
            },
            'reference_fields': [
                ('Estimate #', estimate.estimate_number),
                ('Date', estimate.date),
                ('Valid Until', estimate.expiration_date or 'N/A'),
                ('Customer PO', estimate.customer_po or '-'),
            ],
            'valid_until': estimate.expiration_date,
            'status': estimate.status,
            'status_display': estimate.get_status_display(),
            'lines': [
                {
                    'line_number': line.line_number,
                    'sku': line.item.sku,
                    'description': line.description or line.item.sku,
                    'quantity': line.quantity,
                    'uom': line.uom.code,
                    'unit_price': line.unit_price,
                    'line_total': line.amount,
                }
                for line in lines
            ],
            'totals': {
                'subtotal': estimate.subtotal,
                'tax_rate': estimate.tax_rate,
                'tax_amount': estimate.tax_amount,
                'total': estimate.total_amount,
            },
            'notes': estimate.notes,
            'terms_and_conditions': estimate.terms_and_conditions,
            'footer_text': f'This estimate is valid until {estimate.expiration_date}' if estimate.expiration_date else 'Thank you for your business.',
        }

        return cls.render_to_pdf('documents/estimate.html', context)

    @classmethod
    def render_rfq(cls, rfq):
        """
        Generate a PDF for a Request for Quotation.

        Args:
            rfq: RFQ model instance (with lines prefetched)

        Returns:
            bytes: PDF file content
        """
        tenant_settings = rfq.tenant.settings
        lines = rfq.lines.select_related('item', 'uom').all()

        vendor = rfq.vendor
        vendor_party = vendor.party

        context = {
            'document_type': 'REQUEST FOR QUOTATION',
            'document_number': rfq.rfq_number,
            'document_date': rfq.date,
            'company': {
                'name': tenant_settings.company_name or rfq.tenant.name,
                'address_line1': tenant_settings.address_line1,
                'address_line2': tenant_settings.address_line2,
                'city': tenant_settings.city,
                'state': tenant_settings.state,
                'postal_code': tenant_settings.postal_code,
                'country': tenant_settings.country,
                'phone': tenant_settings.phone,
                'email': tenant_settings.email,
            },
            'vendor': {
                'name': vendor_party.display_name,
                'address': getattr(vendor_party, 'address', ''),
            },
            'ship_to': {
                'name': rfq.ship_to.name if rfq.ship_to else '',
                'address': getattr(rfq.ship_to, 'address', '') if rfq.ship_to else '',
            },
            'reference_fields': [
                ('RFQ #', rfq.rfq_number),
                ('Date', rfq.date),
                ('Required By', rfq.expected_date or '-'),
                ('Status', rfq.get_status_display()),
            ],
            'lines': [
                {
                    'line_number': line.line_number,
                    'sku': line.item.sku,
                    'description': line.description or line.item.sku,
                    'quantity': line.quantity,
                    'uom': line.uom.code if line.uom else '',
                    'unit_price': line.target_price,
                    'line_total': line.line_total if line.target_price else None,
                }
                for line in lines
            ],
            'notes': rfq.notes,
            'footer_text': 'Please respond with your best pricing at your earliest convenience.',
        }

        return cls.render_to_pdf('documents/rfq.html', context)

    @classmethod
    def render_pick_ticket(cls, sales_order):
        """
        Generate a pick ticket PDF for a sales order.

        Args:
            sales_order: SalesOrder model instance

        Returns:
            bytes: PDF file content
        """
        tenant_settings = sales_order.tenant.settings
        lines_qs = sales_order.lines.select_related('item', 'uom', 'item__default_bin').all()

        # Sort lines by location name (warehouse walking path order)
        def get_location_name(line):
            bin_obj = getattr(line.item, 'default_bin', None)
            if bin_obj:
                return bin_obj.name or ''
            return ''

        lines_sorted = sorted(lines_qs, key=get_location_name)

        line_data = []
        for line in lines_sorted:
            bin_obj = getattr(line.item, 'default_bin', None)
            location_name = bin_obj.name if bin_obj else ''
            line_data.append({
                'location': location_name,
                'sku': line.item.sku,
                'item_name': line.item.name,
                'quantity_ordered': line.quantity_ordered,
                'uom': line.uom.code if line.uom else '',
                'line_number': line.line_number,
            })

        customer_party = sales_order.customer.party if sales_order.customer else None
        customer_name = customer_party.display_name if customer_party else ''

        ship_to = sales_order.ship_to
        ship_to_data = {}
        if ship_to:
            ship_to_data = {
                'name': getattr(ship_to, 'name', ''),
                'address_line1': getattr(ship_to, 'address_line1', ''),
                'city': getattr(ship_to, 'city', ''),
                'state': getattr(ship_to, 'state', ''),
                'postal_code': getattr(ship_to, 'postal_code', ''),
            }

        context = {
            'company': {
                'name': tenant_settings.company_name or sales_order.tenant.name,
                'phone': tenant_settings.phone,
            },
            'order': sales_order,
            'customer_name': customer_name,
            'ship_to': ship_to_data,
            'lines': line_data,
            'is_rush': (sales_order.priority or 0) > 5,
        }

        return cls.render_to_pdf('documents/pick_ticket.html', context)

    @classmethod
    def render_bill_of_lading(cls, bol):
        """
        Generate a Bill of Lading PDF.

        Args:
            bol: BillOfLading model instance

        Returns:
            bytes: PDF file content
        """
        lines_qs = bol.lines.select_related('item', 'uom').all()

        shipment = bol.shipment
        shipment_number = shipment.shipment_number if shipment else ''
        driver_name = shipment.driver_name if shipment else ''

        line_data = [
            {
                'num_packages': line.num_packages,
                'description': line.description or (line.item.name if line.item else ''),
                'weight': line.weight,
                'freight_class': line.freight_class,
                'nmfc_code': line.nmfc_code,
            }
            for line in lines_qs
        ]

        context = {
            'bol_number': bol.bol_number,
            'issue_date': bol.issue_date,
            'shipment_number': shipment_number,
            'shipper': {
                'name': bol.shipper_name,
                'address': bol.shipper_address,
            },
            'consignee': {
                'name': getattr(bol, 'consignee_name', ''),
                'address': getattr(bol, 'consignee_address', ''),
            },
            'carrier': {
                'name': bol.carrier_name,
                'scac': bol.carrier_scac,
                'trailer_number': bol.trailer_number,
                'seal_number': bol.seal_number,
                'driver_name': driver_name,
            },
            'lines': line_data,
            'totals': {
                'total_pieces': bol.total_pieces,
                'total_pallets': getattr(bol, 'total_pallets', ''),
                'total_weight': bol.total_weight,
                'weight_uom': bol.weight_uom if hasattr(bol, 'weight_uom') else 'lbs',
            },
            'notes': bol.notes,
        }

        return cls.render_to_pdf('documents/bol.html', context)

    @classmethod
    def render_delivery_manifest(cls, delivery_run):
        """
        Generate a delivery manifest PDF for a delivery run.

        Args:
            delivery_run: DeliveryRun model instance

        Returns:
            bytes: PDF file content
        """
        from apps.logistics.models import LicensePlate

        stops_qs = delivery_run.stops.select_related(
            'customer', 'customer__party', 'ship_to'
        ).prefetch_related('orders').order_by('sequence')

        truck = delivery_run.truck
        truck_name = truck.name if truck else ''

        stop_data = []
        total_pallets = 0
        for stop in stops_qs:
            order_ids = list(stop.orders.values_list('id', flat=True))
            pallet_count = LicensePlate.objects.filter(
                order_id__in=order_ids,
                run=delivery_run,
            ).count()
            total_pallets += pallet_count

            customer_party = stop.customer.party if stop.customer else None
            customer_name = customer_party.display_name if customer_party else ''

            ship_to = stop.ship_to
            address = ''
            city = ''
            if ship_to:
                parts = [
                    getattr(ship_to, 'address_line1', ''),
                    getattr(ship_to, 'address_line2', ''),
                ]
                address = ', '.join(p for p in parts if p)
                city_str = getattr(ship_to, 'city', '')
                state_str = getattr(ship_to, 'state', '')
                postal_str = getattr(ship_to, 'postal_code', '')
                city = f"{city_str}, {state_str} {postal_str}".strip(', ')

            order_numbers = list(stop.orders.values_list('order_number', flat=True))

            status_display_map = {
                'pending': 'Pending',
                'delivered': 'Delivered',
                'partial': 'Partial',
                'failed': 'Failed',
                'skipped': 'Skipped',
            }
            status = stop.status
            status_display = status_display_map.get(status, status.title() if status else 'Pending')

            stop_data.append({
                'sequence': stop.sequence,
                'customer_name': customer_name,
                'address': address,
                'city': city,
                'pallet_count': pallet_count,
                'order_numbers': order_numbers,
                'status': status,
                'status_display': status_display,
                'delivery_notes': stop.delivery_notes or '',
            })

        # Compute total weight from LPNs if available
        total_weight_lbs = LicensePlate.objects.filter(
            run=delivery_run
        ).aggregate(
            total=Sum('weight_lbs')
        )['total'] or 0

        context = {
            'run': delivery_run,
            'truck_name': truck_name,
            'stops': stop_data,
            'total_stops': len(stop_data),
            'total_pallets': total_pallets,
            'total_weight': round(float(total_weight_lbs), 1) if total_weight_lbs else 0,
        }

        return cls.render_to_pdf('documents/delivery_manifest.html', context)

    @classmethod
    def render_item_spec(cls, item):
        """
        Generate a PDF spec sheet for an Item.

        Args:
            item: Item model instance

        Returns:
            bytes: PDF file content
        """
        from datetime import date as date_cls
        tenant_settings = item.tenant.settings

        # Fetch related vendors
        vendor_links = item.vendors.select_related('vendor').all()
        vendors = [
            {
                'vendor_name': vl.vendor.display_name if hasattr(vl.vendor, 'display_name') else str(vl.vendor),
                'mpn': vl.mpn,
                'lead_time_days': vl.lead_time_days,
                'min_order_qty': vl.min_order_qty,
                'is_preferred': vl.is_preferred,
            }
            for vl in vendor_links
        ]

        # Fetch UOM conversions
        uom_conversions = [
            {
                'uom_code': conv.uom.code,
                'factor': conv.conversion_factor,
            }
            for conv in item.uom_conversions.select_related('uom').all()
        ]

        # Parent item info
        parent_sku = item.parent.sku if item.parent else ''
        parent_name = item.parent.name if item.parent else ''

        context = {
            'company': {
                'name': tenant_settings.company_name or item.tenant.name,
            },
            'generated_date': date_cls.today(),
            'item': {
                'sku': item.sku,
                'name': item.name,
                'division_display': item.get_division_display(),
                'is_active': item.is_active,
                'item_type': item.item_type,
                'base_uom': item.base_uom.code if item.base_uom else '-',
                'description': item.description,
                'purch_desc': item.purch_desc,
                'sell_desc': item.sell_desc,
                'reorder_point': item.reorder_point,
                'min_stock': item.min_stock,
                'safety_stock': item.safety_stock,
                'parent_sku': parent_sku,
                'parent_name': parent_name,
            },
            'vendors': vendors,
            'uom_conversions': uom_conversions,
        }

        return cls.render_to_pdf('documents/item_spec_sheet.html', context)

    @classmethod
    def render_item_quick_report(cls, item, report_data, start_date, end_date):
        """
        Generate a PDF for an Item QuickReport.

        Args:
            item: Item model instance
            report_data: Dict from ItemReportService.get_quick_report()
            start_date: Period start date
            end_date: Period end date

        Returns:
            bytes: PDF file content
        """
        tenant_settings = item.tenant.settings

        context = {
            'document_type': 'ITEM QUICK REPORT',
            'company': {
                'name': tenant_settings.company_name or item.tenant.name,
            },
            'item': {
                'sku': item.sku,
                'name': item.name,
                'description': getattr(item, 'description', ''),
            },
            'start_date': start_date,
            'end_date': end_date,
            'financials': report_data['financials'],
            'purchase_orders': report_data['purchase_orders'],
            'sales_orders': report_data['sales_orders'],
        }

        return cls.render_to_pdf('documents/item_quick_report.html', context)

    @classmethod
    def render_ar_aging(cls, tenant, as_of_date, interval=30, through=90, customer_id=None):
        """
        Generate a PDF for the A/R Aging Report.

        Args:
            tenant: Tenant model instance
            as_of_date: datetime.date for the as-of date
            interval: Bucket width in days (default 30)
            through: Max days before Over bucket (default 90)
            customer_id: Optional int to filter by a single customer

        Returns:
            bytes: PDF file content
        """
        from apps.reporting.services import FinancialReportService

        tenant_settings = tenant.settings
        report_data = FinancialReportService.get_ar_aging(
            tenant, as_of_date, interval=interval, through=through, customer_id=customer_id,
        )

        customer_name = None
        if customer_id is not None:
            from apps.parties.models import Customer
            try:
                customer_name = Customer.objects.select_related('party').get(
                    tenant=tenant, id=customer_id,
                ).party.display_name
            except Customer.DoesNotExist:
                pass

        buckets = report_data['buckets']
        rows = report_data['rows']
        totals = report_data['totals']

        # Pre-zip bucket+amount pairs for template iteration (no index access needed)
        for row in rows:
            row['bucket_amounts'] = list(zip(buckets, row['amounts']))
        totals['bucket_amounts'] = list(zip(buckets, totals['amounts']))

        context = {
            'company': {
                'name': tenant_settings.company_name or tenant.name,
                'address_line1': tenant_settings.address_line1,
                'address_line2': tenant_settings.address_line2,
                'city': tenant_settings.city,
                'state': tenant_settings.state,
                'postal_code': tenant_settings.postal_code,
                'phone': tenant_settings.phone,
                'email': tenant_settings.email,
            },
            'as_of_date': report_data['as_of_date'],
            'interval': report_data['interval'],
            'through': report_data['through'],
            'filters': report_data['filters'],
            'buckets': buckets,
            'rows': rows,
            'totals': totals,
            'include_detail': len(rows) <= 50,
            'customer_name': customer_name,
        }

        return cls.render_to_pdf('documents/reports/ar_aging.html', context)

    @classmethod
    def render_ap_aging(cls, tenant, as_of_date, interval=30, through=90, vendor_id=None):
        """
        Generate a PDF for the A/P Aging Report.

        Args:
            tenant: Tenant model instance
            as_of_date: datetime.date for the as-of date
            interval: Bucket width in days (default 30)
            through: Max days before Over bucket (default 90)
            vendor_id: Optional int to filter by a single vendor

        Returns:
            bytes: PDF file content
        """
        from apps.reporting.services import FinancialReportService

        tenant_settings = tenant.settings
        report_data = FinancialReportService.get_ap_aging(
            tenant, as_of_date, interval=interval, through=through, vendor_id=vendor_id,
        )

        vendor_name = None
        if vendor_id is not None:
            from apps.parties.models import Vendor
            try:
                vendor_name = Vendor.objects.select_related('party').get(
                    tenant=tenant, id=vendor_id,
                ).party.display_name
            except Vendor.DoesNotExist:
                pass

        buckets = report_data['buckets']
        rows = report_data['rows']
        totals = report_data['totals']

        for row in rows:
            row['bucket_amounts'] = list(zip(buckets, row['amounts']))
        totals['bucket_amounts'] = list(zip(buckets, totals['amounts']))

        context = {
            'company': {
                'name': tenant_settings.company_name or tenant.name,
                'address_line1': tenant_settings.address_line1,
                'address_line2': tenant_settings.address_line2,
                'city': tenant_settings.city,
                'state': tenant_settings.state,
                'postal_code': tenant_settings.postal_code,
                'phone': tenant_settings.phone,
                'email': tenant_settings.email,
            },
            'as_of_date': report_data['as_of_date'],
            'interval': report_data['interval'],
            'through': report_data['through'],
            'filters': report_data['filters'],
            'buckets': buckets,
            'rows': rows,
            'totals': totals,
            'include_detail': len(rows) <= 50,
            'vendor_name': vendor_name,
        }

        return cls.render_to_pdf('documents/reports/ap_aging.html', context)

    @classmethod
    def render_open_sales_orders(cls, tenant, status=None, customer_id=None,
                                  start_date=None, end_date=None):
        """
        Generate a PDF for the Open Sales Orders report.

        Args:
            tenant: Tenant model instance
            status: Optional status filter string
            customer_id: Optional int to filter by a single customer
            start_date: Optional order_date lower bound
            end_date: Optional order_date upper bound

        Returns:
            bytes: PDF file content
        """
        from datetime import date as date_cls
        from apps.reporting.queries import open_order_detail

        tenant_settings = tenant.settings
        rows = open_order_detail(
            tenant, status=status, customer_id=customer_id,
            start_date=start_date, end_date=end_date,
        )
        total_subtotal = sum(float(r.get('subtotal') or 0) for r in rows)

        applied_filters = {}
        if status:
            applied_filters['Status'] = status
        if customer_id is not None:
            from apps.customers.models import Customer
            try:
                cname = Customer.objects.select_related('party').get(
                    tenant=tenant, id=customer_id,
                ).party.display_name
                applied_filters['Customer'] = cname
            except Customer.DoesNotExist:
                applied_filters['Customer'] = str(customer_id)
        if start_date:
            applied_filters['From'] = str(start_date)
        if end_date:
            applied_filters['To'] = str(end_date)

        context = {
            'company': {
                'name': tenant_settings.company_name or tenant.name,
                'address_line1': tenant_settings.address_line1,
                'address_line2': tenant_settings.address_line2,
                'city': tenant_settings.city,
                'state': tenant_settings.state,
                'postal_code': tenant_settings.postal_code,
                'phone': tenant_settings.phone,
                'email': tenant_settings.email,
            },
            'rows': rows,
            'total_count': len(rows),
            'total_subtotal': total_subtotal,
            'generated_date': date_cls.today(),
            'applied_filters': applied_filters,
        }

        return cls.render_to_pdf('documents/reports/open_sales_orders.html', context)

    @classmethod
    def render_open_purchase_orders(cls, tenant, status=None, vendor_id=None,
                                     start_date=None, end_date=None):
        """
        Generate a PDF for the Open Purchase Orders report.

        Args:
            tenant: Tenant model instance
            status: Optional status filter string
            vendor_id: Optional int to filter by a single vendor
            start_date: Optional order_date lower bound
            end_date: Optional order_date upper bound

        Returns:
            bytes: PDF file content
        """
        from datetime import date as date_cls
        from apps.reporting.queries import open_po_report

        tenant_settings = tenant.settings
        rows = open_po_report(
            tenant, status=status, vendor_id=vendor_id,
            start_date=start_date, end_date=end_date,
        )
        total_subtotal = sum(float(r.get('subtotal') or 0) for r in rows)

        applied_filters = {}
        if status:
            applied_filters['Status'] = status
        if vendor_id is not None:
            from apps.parties.models import Vendor
            try:
                vname = Vendor.objects.select_related('party').get(
                    tenant=tenant, id=vendor_id,
                ).party.display_name
                applied_filters['Vendor'] = vname
            except Vendor.DoesNotExist:
                applied_filters['Vendor'] = str(vendor_id)
        if start_date:
            applied_filters['From'] = str(start_date)
        if end_date:
            applied_filters['To'] = str(end_date)

        context = {
            'company': {
                'name': tenant_settings.company_name or tenant.name,
                'address_line1': tenant_settings.address_line1,
                'address_line2': tenant_settings.address_line2,
                'city': tenant_settings.city,
                'state': tenant_settings.state,
                'postal_code': tenant_settings.postal_code,
                'phone': tenant_settings.phone,
                'email': tenant_settings.email,
            },
            'rows': rows,
            'total_count': len(rows),
            'total_subtotal': total_subtotal,
            'generated_date': date_cls.today(),
            'applied_filters': applied_filters,
        }

        return cls.render_to_pdf('documents/reports/open_purchase_orders.html', context)

    @classmethod
    def render_inventory_valuation(cls, tenant):
        """
        Generate a PDF for the Inventory Valuation report.

        Args:
            tenant: Tenant model instance

        Returns:
            bytes: PDF file content
        """
        from datetime import date as date_cls
        from apps.reporting.queries import inventory_valuation

        tenant_settings = tenant.settings
        data = inventory_valuation(tenant)  # {'rows': [...], 'grand_total': '...'}

        context = {
            'company': {
                'name': tenant_settings.company_name or tenant.name,
                'address_line1': tenant_settings.address_line1,
                'address_line2': tenant_settings.address_line2,
                'city': tenant_settings.city,
                'state': tenant_settings.state,
                'postal_code': tenant_settings.postal_code,
                'phone': tenant_settings.phone,
                'email': tenant_settings.email,
            },
            'as_of_date': date_cls.today(),
            'rows': data['rows'],
            'row_count': len(data['rows']),
            'grand_total': data['grand_total'],
        }

        return cls.render_to_pdf('documents/reports/inventory_valuation.html', context)

    @classmethod
    def render_stock_status(cls, tenant):
        """
        Generate a PDF for the Stock Status report.

        Args:
            tenant: Tenant model instance

        Returns:
            bytes: PDF file content
        """
        from datetime import date as date_cls
        from apps.reporting.queries import stock_status

        tenant_settings = tenant.settings
        rows = stock_status(tenant)  # plain list of dicts

        context = {
            'company': {
                'name': tenant_settings.company_name or tenant.name,
                'address_line1': tenant_settings.address_line1,
                'address_line2': tenant_settings.address_line2,
                'city': tenant_settings.city,
                'state': tenant_settings.state,
                'postal_code': tenant_settings.postal_code,
                'phone': tenant_settings.phone,
                'email': tenant_settings.email,
            },
            'as_of_date': date_cls.today(),
            'rows': rows,
            'row_count': len(rows),
        }

        return cls.render_to_pdf('documents/reports/stock_status.html', context)

    @classmethod
    def render_sales_by_customer(cls, tenant, start_date, end_date):
        """
        Generate a PDF for the Sales by Customer report.

        Args:
            tenant: Tenant model instance
            start_date: datetime.date period start
            end_date: datetime.date period end

        Returns:
            bytes: PDF file content
        """
        from decimal import Decimal
        from apps.reporting.queries import sales_by_customer

        tenant_settings = tenant.settings
        rows = sales_by_customer(tenant, start_date, end_date)  # list of dicts with Decimal fields

        total_orders = sum(r['order_count'] for r in rows)
        total_sales = sum(Decimal(str(r['total_sales'] or 0)) for r in rows)

        context = {
            'company': {
                'name': tenant_settings.company_name or tenant.name,
                'address_line1': tenant_settings.address_line1,
                'address_line2': tenant_settings.address_line2,
                'city': tenant_settings.city,
                'state': tenant_settings.state,
                'postal_code': tenant_settings.postal_code,
                'phone': tenant_settings.phone,
                'email': tenant_settings.email,
            },
            'start_date': start_date,
            'end_date': end_date,
            'rows': rows,
            'row_count': len(rows),
            'totals': {
                'orders': total_orders,
                'sales': total_sales,
            },
        }

        return cls.render_to_pdf('documents/reports/sales_by_customer.html', context)

    @classmethod
    def render_sales_by_item(cls, tenant, start_date, end_date):
        """
        Generate a PDF for the Sales by Item report.

        Args:
            tenant: Tenant model instance
            start_date: datetime.date period start
            end_date: datetime.date period end

        Returns:
            bytes: PDF file content
        """
        from decimal import Decimal
        from apps.reporting.queries import sales_by_item

        tenant_settings = tenant.settings
        rows = sales_by_item(tenant, start_date, end_date)  # list of dicts with Decimal fields

        total_qty = sum(r['qty_sold'] for r in rows)
        total_revenue = sum(Decimal(str(r['revenue'] or 0)) for r in rows)

        context = {
            'company': {
                'name': tenant_settings.company_name or tenant.name,
                'address_line1': tenant_settings.address_line1,
                'address_line2': tenant_settings.address_line2,
                'city': tenant_settings.city,
                'state': tenant_settings.state,
                'postal_code': tenant_settings.postal_code,
                'phone': tenant_settings.phone,
                'email': tenant_settings.email,
            },
            'start_date': start_date,
            'end_date': end_date,
            'rows': rows,
            'row_count': len(rows),
            'totals': {
                'qty': total_qty,
                'revenue': total_revenue,
            },
        }

        return cls.render_to_pdf('documents/reports/sales_by_item.html', context)

    @classmethod
    def render_vendor_performance(cls, tenant, start_date, end_date):
        """Generate a PDF for the Vendor Performance report."""
        from decimal import Decimal
        from datetime import date as date_cls
        from apps.reporting.queries import vendor_performance

        tenant_settings = tenant.settings
        rows = vendor_performance(tenant, start_date, end_date)

        total_orders = sum(r['total_orders'] for r in rows)
        total_late = sum(r['late_orders'] for r in rows)

        context = {
            'company': {
                'name': tenant_settings.company_name or tenant.name,
                'address_line1': tenant_settings.address_line1,
                'address_line2': tenant_settings.address_line2,
                'city': tenant_settings.city,
                'state': tenant_settings.state,
                'postal_code': tenant_settings.postal_code,
                'phone': tenant_settings.phone,
                'email': tenant_settings.email,
            },
            'start_date': start_date,
            'end_date': end_date,
            'rows': rows,
            'row_count': len(rows),
            'totals': {
                'total_orders': total_orders,
                'late_orders': total_late,
            },
        }

        return cls.render_to_pdf('documents/reports/vendor_performance.html', context)

    @classmethod
    def render_purchase_history(cls, tenant, start_date, end_date):
        """Generate a PDF for the Purchase History report."""
        from decimal import Decimal
        from apps.reporting.queries import purchase_history

        tenant_settings = tenant.settings
        rows = purchase_history(tenant, start_date, end_date)

        total_qty = sum(r['total_qty'] for r in rows)
        total_cost = sum(Decimal(str(r['total_cost'] or 0)) for r in rows)

        context = {
            'company': {
                'name': tenant_settings.company_name or tenant.name,
                'address_line1': tenant_settings.address_line1,
                'address_line2': tenant_settings.address_line2,
                'city': tenant_settings.city,
                'state': tenant_settings.state,
                'postal_code': tenant_settings.postal_code,
                'phone': tenant_settings.phone,
                'email': tenant_settings.email,
            },
            'start_date': start_date,
            'end_date': end_date,
            'rows': rows,
            'row_count': len(rows),
            'totals': {
                'total_qty': total_qty,
                'total_cost': total_cost,
            },
        }

        return cls.render_to_pdf('documents/reports/purchase_history.html', context)

    @classmethod
    def render_sales_tax_liability(cls, tenant, start_date, end_date):
        """Generate a PDF for the Sales Tax Liability report."""
        from decimal import Decimal
        from apps.reporting.queries import sales_tax_liability

        tenant_settings = tenant.settings
        rows = sales_tax_liability(tenant, start_date, end_date)

        total_taxable = sum(Decimal(str(r['taxable_amount'] or 0)) for r in rows)
        total_tax = sum(Decimal(str(r['tax_collected'] or 0)) for r in rows)
        total_invoices = sum(r['invoice_count'] for r in rows)

        context = {
            'company': {
                'name': tenant_settings.company_name or tenant.name,
                'address_line1': tenant_settings.address_line1,
                'address_line2': tenant_settings.address_line2,
                'city': tenant_settings.city,
                'state': tenant_settings.state,
                'postal_code': tenant_settings.postal_code,
                'phone': tenant_settings.phone,
                'email': tenant_settings.email,
            },
            'start_date': start_date,
            'end_date': end_date,
            'rows': rows,
            'row_count': len(rows),
            'totals': {
                'taxable_amount': total_taxable,
                'tax_collected': total_tax,
                'invoice_count': total_invoices,
            },
        }

        return cls.render_to_pdf('documents/reports/sales_tax_liability.html', context)

    @classmethod
    def render_backorder_report(cls, tenant):
        """Generate a PDF for the Backorder Report."""
        from datetime import date as date_cls
        from apps.reporting.queries import backorder_report

        tenant_settings = tenant.settings
        rows = backorder_report(tenant)

        context = {
            'company': {
                'name': tenant_settings.company_name or tenant.name,
                'address_line1': tenant_settings.address_line1,
                'address_line2': tenant_settings.address_line2,
                'city': tenant_settings.city,
                'state': tenant_settings.state,
                'postal_code': tenant_settings.postal_code,
                'phone': tenant_settings.phone,
                'email': tenant_settings.email,
            },
            'as_of_date': date_cls.today(),
            'rows': rows,
            'row_count': len(rows),
        }

        return cls.render_to_pdf('documents/reports/backorder_report.html', context)

    @classmethod
    def render_low_stock_alert(cls, tenant):
        """Generate a PDF for the Low Stock Alert report."""
        from datetime import date as date_cls
        from apps.reporting.queries import low_stock_alert

        tenant_settings = tenant.settings
        rows = low_stock_alert(tenant)

        context = {
            'company': {
                'name': tenant_settings.company_name or tenant.name,
                'address_line1': tenant_settings.address_line1,
                'address_line2': tenant_settings.address_line2,
                'city': tenant_settings.city,
                'state': tenant_settings.state,
                'postal_code': tenant_settings.postal_code,
                'phone': tenant_settings.phone,
                'email': tenant_settings.email,
            },
            'as_of_date': date_cls.today(),
            'rows': rows,
            'row_count': len(rows),
        }

        return cls.render_to_pdf('documents/reports/low_stock_alert.html', context)

    @classmethod
    def render_dead_stock(cls, tenant, days=180):
        """Generate a PDF for the Dead Stock report."""
        from datetime import date as date_cls
        from apps.reporting.queries import dead_stock

        tenant_settings = tenant.settings
        rows = dead_stock(tenant, days)

        context = {
            'company': {
                'name': tenant_settings.company_name or tenant.name,
                'address_line1': tenant_settings.address_line1,
                'address_line2': tenant_settings.address_line2,
                'city': tenant_settings.city,
                'state': tenant_settings.state,
                'postal_code': tenant_settings.postal_code,
                'phone': tenant_settings.phone,
                'email': tenant_settings.email,
            },
            'as_of_date': date_cls.today(),
            'days': days,
            'rows': rows,
            'row_count': len(rows),
        }

        return cls.render_to_pdf('documents/reports/dead_stock.html', context)

    # ── Financial Statements ───────────────────────────────────────────────

    @classmethod
    def render_trial_balance(cls, tenant, as_of_date):
        """Generate a PDF for the Trial Balance."""
        from decimal import Decimal
        from apps.reporting.services import FinancialReportService

        tenant_settings = tenant.settings
        accounts = FinancialReportService.get_trial_balance(tenant, as_of_date)
        total_debits = sum(Decimal(str(a['total_debit'])) for a in accounts)
        total_credits = sum(Decimal(str(a['total_credit'])) for a in accounts)

        context = {
            'company': {
                'name': tenant_settings.company_name or tenant.name,
                'address_line1': tenant_settings.address_line1,
                'address_line2': tenant_settings.address_line2,
                'city': tenant_settings.city,
                'state': tenant_settings.state,
                'postal_code': tenant_settings.postal_code,
                'phone': tenant_settings.phone,
                'email': tenant_settings.email,
            },
            'as_of_date': as_of_date,
            'accounts': accounts,
            'row_count': len(accounts),
            'total_debits': total_debits,
            'total_credits': total_credits,
        }

        return cls.render_to_pdf('documents/reports/trial_balance.html', context)

    @classmethod
    def render_income_statement(cls, tenant, start_date, end_date):
        """Generate a PDF for the Income Statement."""
        from apps.reporting.services import FinancialReportService

        tenant_settings = tenant.settings
        data = FinancialReportService.get_income_statement(tenant, start_date, end_date)

        context = {
            'company': {
                'name': tenant_settings.company_name or tenant.name,
                'address_line1': tenant_settings.address_line1,
                'address_line2': tenant_settings.address_line2,
                'city': tenant_settings.city,
                'state': tenant_settings.state,
                'postal_code': tenant_settings.postal_code,
                'phone': tenant_settings.phone,
                'email': tenant_settings.email,
            },
            'start_date': start_date,
            'end_date': end_date,
            'sections': data['sections'],
            'net_income': data['net_income'],
        }

        return cls.render_to_pdf('documents/reports/income_statement.html', context)

    @classmethod
    def render_balance_sheet(cls, tenant, as_of_date):
        """Generate a PDF for the Balance Sheet."""
        from decimal import Decimal
        from apps.reporting.services import FinancialReportService

        tenant_settings = tenant.settings
        data = FinancialReportService.get_balance_sheet(tenant, as_of_date)

        context = {
            'company': {
                'name': tenant_settings.company_name or tenant.name,
                'address_line1': tenant_settings.address_line1,
                'address_line2': tenant_settings.address_line2,
                'city': tenant_settings.city,
                'state': tenant_settings.state,
                'postal_code': tenant_settings.postal_code,
                'phone': tenant_settings.phone,
                'email': tenant_settings.email,
            },
            'as_of_date': as_of_date,
            'sections': data['sections'],
            'total_assets': data['total_assets'],
            'total_liabilities_and_equity': data['total_liabilities_and_equity'],
            'is_balanced': data['is_balanced'],
            'variance': data['variance'],
        }

        return cls.render_to_pdf('documents/reports/balance_sheet.html', context)

    @classmethod
    def render_cash_flow_statement(cls, tenant, start_date, end_date):
        """Generate a PDF for the Cash Flow Statement."""
        from apps.reporting.services import FinancialReportService

        tenant_settings = tenant.settings
        data = FinancialReportService.get_cash_flow_statement(tenant, start_date, end_date)

        context = {
            'company': {
                'name': tenant_settings.company_name or tenant.name,
                'address_line1': tenant_settings.address_line1,
                'address_line2': tenant_settings.address_line2,
                'city': tenant_settings.city,
                'state': tenant_settings.state,
                'postal_code': tenant_settings.postal_code,
                'phone': tenant_settings.phone,
                'email': tenant_settings.email,
            },
            'start_date': start_date,
            'end_date': end_date,
            'beginning_cash_balance': data['beginning_cash_balance'],
            'sections': data['sections'],
            'net_change_in_cash': data['net_change_in_cash'],
            'ending_cash_balance': data['ending_cash_balance'],
        }

        return cls.render_to_pdf('documents/reports/cash_flow.html', context)

    # ── Operational Reports (Wave 5) ──────────────────────────────────────────

    @classmethod
    def render_gross_margin(cls, tenant, date_from=None, date_to=None,
                            customer_id=None, item_id=None):
        """Generate a PDF for the Gross Margin report."""
        from decimal import Decimal
        from apps.reporting.services import FinancialReportService

        tenant_settings = tenant.settings
        svc = FinancialReportService(tenant)
        data = svc.get_gross_margin(
            date_from=date_from, date_to=date_to,
            customer_id=customer_id, item_id=item_id,
        )

        context = {
            'company': {
                'name': tenant_settings.company_name or tenant.name,
                'address_line1': tenant_settings.address_line1,
                'address_line2': tenant_settings.address_line2,
                'city': tenant_settings.city,
                'state': tenant_settings.state,
                'postal_code': tenant_settings.postal_code,
                'phone': tenant_settings.phone,
                'email': tenant_settings.email,
            },
            'date_from': data.get('date_from'),
            'date_to': data.get('date_to'),
            'summary': data['summary'],
            'by_customer': data['by_customer'],
            'by_item': data['by_item'],
        }

        return cls.render_to_pdf('documents/reports/gross_margin.html', context)

    @classmethod
    def render_contract_utilization(cls, tenant):
        """Generate a PDF for the Contract Utilization report."""
        from apps.reporting.services import FinancialReportService

        tenant_settings = tenant.settings
        svc = FinancialReportService(tenant)
        contracts = svc.get_contract_utilization()

        total_committed = sum(r['total_committed'] for r in contracts)
        total_released = sum(r['total_released'] for r in contracts)
        total_remaining = sum(r['total_remaining'] for r in contracts)

        context = {
            'company': {
                'name': tenant_settings.company_name or tenant.name,
                'address_line1': tenant_settings.address_line1,
                'address_line2': tenant_settings.address_line2,
                'city': tenant_settings.city,
                'state': tenant_settings.state,
                'postal_code': tenant_settings.postal_code,
                'phone': tenant_settings.phone,
                'email': tenant_settings.email,
            },
            'count': len(contracts),
            'contracts': contracts,
            'total_committed': total_committed,
            'total_released': total_released,
            'total_remaining': total_remaining,
        }

        return cls.render_to_pdf('documents/reports/contract_utilization.html', context)

    @classmethod
    def render_vendor_scorecard(cls, tenant, date_from=None, date_to=None):
        """Generate a PDF for the Vendor Scorecard report."""
        from decimal import Decimal
        from apps.reporting.services import FinancialReportService

        tenant_settings = tenant.settings
        svc = FinancialReportService(tenant)
        vendors = svc.get_vendor_scorecard(date_from=date_from, date_to=date_to)

        total_pos = sum(v['total_pos'] for v in vendors)
        completed_pos = sum(v['completed_pos'] for v in vendors)
        on_time_count = sum(v['on_time_count'] for v in vendors)
        late_count = sum(v['late_count'] for v in vendors)
        total_spend = sum(Decimal(str(v['total_spend'])) for v in vendors)

        context = {
            'company': {
                'name': tenant_settings.company_name or tenant.name,
                'address_line1': tenant_settings.address_line1,
                'address_line2': tenant_settings.address_line2,
                'city': tenant_settings.city,
                'state': tenant_settings.state,
                'postal_code': tenant_settings.postal_code,
                'phone': tenant_settings.phone,
                'email': tenant_settings.email,
            },
            'date_from': date_from,
            'date_to': date_to,
            'count': len(vendors),
            'vendors': vendors,
            'totals': {
                'total_pos': total_pos,
                'completed_pos': completed_pos,
                'on_time_count': on_time_count,
                'late_count': late_count,
                'total_spend': total_spend,
            },
        }

        return cls.render_to_pdf('documents/reports/vendor_scorecard.html', context)

    @classmethod
    def render_sales_commission(cls, tenant, date_from=None, date_to=None,
                                commission_rate=None):
        """Generate a PDF for the Sales Commission report."""
        from decimal import Decimal
        from apps.reporting.services import FinancialReportService

        tenant_settings = tenant.settings
        svc = FinancialReportService(tenant)
        data = svc.get_sales_commission(
            date_from=date_from, date_to=date_to, commission_rate=commission_rate,
        )

        # Pre-compute per-rep commission_rate_pct for the template
        by_rep = data.get('by_rep', [])
        for rep in by_rep:
            rep['commission_rate_pct'] = float(rep['commission_rate']) * 100

        total_invoice_count = sum(r['invoice_count'] for r in by_rep)
        rate_pct = float(data['commission_rate']) * 100

        context = {
            'company': {
                'name': tenant_settings.company_name or tenant.name,
                'address_line1': tenant_settings.address_line1,
                'address_line2': tenant_settings.address_line2,
                'city': tenant_settings.city,
                'state': tenant_settings.state,
                'postal_code': tenant_settings.postal_code,
                'phone': tenant_settings.phone,
                'email': tenant_settings.email,
            },
            'date_from': data.get('date_from'),
            'date_to': data.get('date_to'),
            'commission_rate': data['commission_rate'],
            'commission_rate_pct': rate_pct,
            'summary': data['summary'],
            'by_rep': by_rep,
            'totals': {
                'invoice_count': total_invoice_count,
            },
        }

        return cls.render_to_pdf('documents/reports/sales_commission.html', context)

    @classmethod
    def render_orders_vs_inventory(cls, tenant):
        """Generate a PDF for the Orders vs Inventory report."""
        from apps.reporting.services import FinancialReportService

        tenant_settings = tenant.settings
        svc = FinancialReportService(tenant)
        items = svc.get_orders_vs_inventory()

        context = {
            'company': {
                'name': tenant_settings.company_name or tenant.name,
                'address_line1': tenant_settings.address_line1,
                'address_line2': tenant_settings.address_line2,
                'city': tenant_settings.city,
                'state': tenant_settings.state,
                'postal_code': tenant_settings.postal_code,
                'phone': tenant_settings.phone,
                'email': tenant_settings.email,
            },
            'count': len(items),
            'items': items,
        }

        return cls.render_to_pdf('documents/reports/orders_vs_inventory.html', context)

    @classmethod
    def render_gross_margin_detail(cls, tenant, start_date, end_date):
        """Generate a PDF for the Gross Margin Detail report."""
        from apps.reporting.queries import gross_margin_report

        tenant_settings = tenant.settings
        data = gross_margin_report(tenant, start_date, end_date)

        context = {
            'company': {
                'name': tenant_settings.company_name or tenant.name,
                'address_line1': tenant_settings.address_line1,
                'address_line2': tenant_settings.address_line2,
                'city': tenant_settings.city,
                'state': tenant_settings.state,
                'postal_code': tenant_settings.postal_code,
                'phone': tenant_settings.phone,
                'email': tenant_settings.email,
            },
            'start_date': start_date,
            'end_date': end_date,
            'rows': data['rows'],
            'row_count': len(data['rows']),
            'summary': data['summary'],
        }

        return cls.render_to_pdf('documents/reports/gross_margin_detail.html', context)
