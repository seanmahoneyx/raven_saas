"""
Label generation service for warehouse barcode labels.

Supports:
- PDF sheets (Avery 5160: 30 labels per sheet, 3 columns x 10 rows)
- ZPL (Zebra Programming Language for thermal printers)
- Code 128 barcodes via python-barcode
"""
import io
import logging
from django.template.loader import render_to_string

logger = logging.getLogger(__name__)


def _render_barcode_svg(data: str) -> str:
    """Generate Code 128 barcode as inline SVG string."""
    try:
        import barcode
        from barcode.writer import SVGWriter
        code128 = barcode.get('code128', data, writer=SVGWriter())
        buffer = io.BytesIO()
        code128.write(buffer, options={
            'module_width': 0.3,
            'module_height': 8,
            'font_size': 8,
            'text_distance': 2,
            'quiet_zone': 2,
        })
        return buffer.getvalue().decode('utf-8')
    except ImportError:
        # Fallback: return placeholder text if python-barcode not installed
        logger.warning('python-barcode not installed, using text fallback')
        return (
            f'<svg xmlns="http://www.w3.org/2000/svg" width="200" height="60">'
            f'<text y="30" font-family="monospace" font-size="14">{data}</text>'
            f'</svg>'
        )


class LabelService:
    """Service for generating printable barcode labels."""

    def __init__(self, tenant):
        self.tenant = tenant

    def generate_item_labels(self, item_id, qty=1, fmt='PDF'):
        """
        Generate item labels with SKU, description, and Code 128 barcode.

        Args:
            item_id: Item PK
            qty: Number of labels to generate
            fmt: 'PDF' for Avery 5160 sheet, 'ZPL' for thermal printer

        Returns:
            bytes (PDF) or str (ZPL)
        """
        from apps.items.models import Item
        item = Item.objects.get(pk=item_id, tenant=self.tenant)

        labels = []
        for _ in range(qty):
            labels.append({
                'line1': item.sku,
                'line2': (item.name[:35] + '...') if len(item.name) > 35 else item.name,
                'barcode_data': item.sku,
                'barcode_svg': _render_barcode_svg(item.sku),
            })

        if fmt == 'ZPL':
            return self._render_zpl_labels(labels, label_type='item')
        return self._render_pdf_sheet(labels)

    def generate_bin_labels(self, warehouse_id=None, location_ids=None, fmt='PDF'):
        """
        Generate bin/location labels with location code and barcode.

        Args:
            warehouse_id: Generate labels for all active locations in warehouse
            location_ids: Or specify exact location IDs
            fmt: 'PDF' or 'ZPL'

        Returns:
            bytes (PDF) or str (ZPL)
        """
        from apps.warehousing.models import WarehouseLocation

        if location_ids:
            locations = WarehouseLocation.objects.filter(
                pk__in=location_ids, tenant=self.tenant
            ).select_related('warehouse').order_by('name')
        elif warehouse_id:
            locations = WarehouseLocation.objects.filter(
                warehouse_id=warehouse_id, tenant=self.tenant, is_active=True,
            ).select_related('warehouse').order_by('name')
        else:
            raise ValueError("Must provide warehouse_id or location_ids")

        labels = []
        for loc in locations:
            barcode_val = loc.barcode or loc.name
            labels.append({
                'line1': loc.name,
                'line2': f'{loc.warehouse.code} - {loc.get_type_display()}',
                'barcode_data': barcode_val,
                'barcode_svg': _render_barcode_svg(barcode_val),
            })

        if fmt == 'ZPL':
            return self._render_zpl_labels(labels, label_type='bin')
        return self._render_pdf_sheet(labels)

    def generate_lpn_labels(self, lpn_ids, fmt='ZPL'):
        """
        Generate 4x6 shipping/LPN labels.

        Args:
            lpn_ids: List of LicensePlate PKs
            fmt: 'ZPL' (default for thermal) or 'PDF'

        Returns:
            str (ZPL) or bytes (PDF)
        """
        from apps.logistics.models import LicensePlate

        lpns = LicensePlate.objects.filter(
            pk__in=lpn_ids, tenant=self.tenant,
        ).select_related('order', 'order__customer', 'order__customer__party')

        if fmt == 'PDF':
            labels = []
            for lpn in lpns:
                customer_name = (
                    lpn.order.customer.party.display_name
                    if lpn.order and lpn.order.customer
                    else ''
                )
                order_num = lpn.order.order_number if lpn.order else ''
                labels.append({
                    'line1': lpn.code,
                    'line2': customer_name[:30],
                    'line3': f'SO# {order_num}',
                    'barcode_data': lpn.code,
                    'barcode_svg': _render_barcode_svg(lpn.code),
                })
            return self._render_pdf_4x6(labels)

        # ZPL output
        zpl_parts = []
        for lpn in lpns:
            customer_name = (
                lpn.order.customer.party.display_name
                if lpn.order and lpn.order.customer
                else ''
            )
            order_num = lpn.order.order_number if lpn.order else ''
            zpl_parts.append(self._zpl_4x6_label(
                lpn_code=lpn.code,
                customer_name=customer_name[:30],
                order_number=order_num,
                weight=str(lpn.weight_lbs),
            ))
        return '\n'.join(zpl_parts)

    def _render_pdf_sheet(self, labels):
        """Render labels to Avery 5160 PDF sheet (30 per page, 3x10 grid)."""
        from apps.documents.pdf import PDFService

        # Pad labels to fill complete rows
        while len(labels) % 3 != 0:
            labels.append(None)

        # Split into rows of 3
        rows = [labels[i:i + 3] for i in range(0, len(labels), 3)]

        # Split into pages of 10 rows
        pages = [rows[i:i + 10] for i in range(0, len(rows), 10)]

        return PDFService.render_to_pdf('labels/avery_5160.html', {
            'pages': pages,
        })

    def _render_pdf_4x6(self, labels):
        """Render 4x6 shipping labels as PDF."""
        from apps.documents.pdf import PDFService
        return PDFService.render_to_pdf('labels/lpn_4x6.html', {
            'labels': labels,
        })

    def _render_zpl_labels(self, labels, label_type='item'):
        """Render labels as ZPL for standard 2x1 thermal labels."""
        zpl_parts = []
        for label in labels:
            zpl_parts.append(
                f"^XA\n"
                f"^FO20,20^A0N,28,28^FD{label['line1']}^FS\n"
                f"^FO20,55^A0N,20,20^FD{label['line2']}^FS\n"
                f"^FO20,85^BY2^BCN,60,Y,N,N^FD{label['barcode_data']}^FS\n"
                f"^XZ"
            )
        return '\n'.join(zpl_parts)

    def _zpl_4x6_label(self, lpn_code, customer_name, order_number, weight='0'):
        """Generate ZPL for a single 4x6 shipping label."""
        return (
            f"^XA\n"
            f"^MMT\n"
            f"^PW812\n"
            f"^LL1218\n"
            f"^FO30,30^A0N,45,45^FD{lpn_code}^FS\n"
            f"^FO30,90^GB750,3,3^FS\n"
            f"^FO30,110^A0N,35,35^FD{customer_name}^FS\n"
            f"^FO30,160^A0N,28,28^FDSO# {order_number}^FS\n"
            f"^FO30,210^A0N,28,28^FDWeight: {weight} lbs^FS\n"
            f"^FO30,270^GB750,3,3^FS\n"
            f"^FO100,300^BY3^BCN,150,Y,N,N^FD{lpn_code}^FS\n"
            f"^FO30,500^GB750,3,3^FS\n"
            f"^FO30,520^A0N,24,24^FDRAVEN SAAS - WAREHOUSE MANAGEMENT^FS\n"
            f"^XZ"
        )
