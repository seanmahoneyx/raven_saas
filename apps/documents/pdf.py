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

def _get_weasyprint_html():
    """Lazy import of WeasyPrint to avoid startup crash when GTK libs are missing."""
    try:
        from weasyprint import HTML
        return HTML
    except (ImportError, OSError) as e:
        raise RuntimeError(
            "WeasyPrint is not available. On Windows, install GTK3 runtime "
            "(https://doc.courtbouillon.org/weasyprint/stable/first_steps.html). "
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
        HTML = _get_weasyprint_html()
        html_string = render_to_string(template_name, context)
        html = HTML(string=html_string)
        pdf_buffer = BytesIO()
        html.write_pdf(target=pdf_buffer)
        return pdf_buffer.getvalue()

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
                'is_inventory': item.is_inventory,
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
