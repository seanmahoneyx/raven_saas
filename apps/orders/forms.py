# apps/orders/forms.py
"""
Forms for order creation and management.
"""
from django import forms
from django.forms import inlineformset_factory
from .models import PurchaseOrder, PurchaseOrderLine, SalesOrder, SalesOrderLine
from apps.parties.models import Vendor, Customer, Location
from apps.items.models import Item, UnitOfMeasure


class PurchaseOrderForm(forms.ModelForm):
    """
    Form for creating/editing purchase orders.
    """
    class Meta:
        model = PurchaseOrder
        fields = [
            'vendor', 'po_number', 'order_date', 'expected_date',
            'ship_to', 'status', 'priority', 'notes'
        ]
        widgets = {
            'vendor': forms.Select(attrs={
                'class': 'w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-blue-500 focus:border-blue-500',
                'hx-get': '/orders/purchase/vendor-locations/',
                'hx-target': '#ship-to-select',
                'hx-trigger': 'change'
            }),
            'po_number': forms.TextInput(attrs={
                'class': 'w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-blue-500 focus:border-blue-500',
                'placeholder': 'Auto-generated if left blank'
            }),
            'order_date': forms.DateInput(attrs={
                'type': 'date',
                'class': 'w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-blue-500 focus:border-blue-500'
            }),
            'expected_date': forms.DateInput(attrs={
                'type': 'date',
                'class': 'w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-blue-500 focus:border-blue-500'
            }),
            'ship_to': forms.Select(attrs={
                'class': 'w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-blue-500 focus:border-blue-500',
                'id': 'ship-to-select'
            }),
            'status': forms.Select(attrs={
                'class': 'w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-blue-500 focus:border-blue-500'
            }),
            'priority': forms.NumberInput(attrs={
                'class': 'w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-blue-500 focus:border-blue-500',
                'min': '1',
                'max': '10'
            }),
            'notes': forms.Textarea(attrs={
                'class': 'w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-blue-500 focus:border-blue-500',
                'rows': '3'
            }),
        }

    def __init__(self, *args, **kwargs):
        super().__init__(*args, **kwargs)
        # Make po_number optional (will be auto-generated)
        self.fields['po_number'].required = False


class PurchaseOrderLineForm(forms.ModelForm):
    """
    Form for creating/editing purchase order lines.
    """
    class Meta:
        model = PurchaseOrderLine
        fields = ['line_number', 'item', 'quantity_ordered', 'uom', 'unit_cost', 'notes']
        widgets = {
            'line_number': forms.NumberInput(attrs={
                'class': 'w-20 px-2 py-2 border border-gray-300 rounded-md focus:ring-blue-500 focus:border-blue-500',
                'step': '10'
            }),
            'item': forms.Select(attrs={
                'class': 'w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-blue-500 focus:border-blue-500 item-select',
                'hx-get': '/orders/purchase/item-uoms/',
                'hx-target': 'closest tr .uom-select',
                'hx-trigger': 'change'
            }),
            'quantity_ordered': forms.NumberInput(attrs={
                'class': 'w-24 px-2 py-2 border border-gray-300 rounded-md focus:ring-blue-500 focus:border-blue-500 quantity-input',
                'min': '1',
                'hx-trigger': 'keyup changed delay:300ms',
                'hx-post': '/orders/purchase/calculate-line/',
                'hx-target': 'closest tr .line-total',
                'hx-include': 'closest tr'
            }),
            'uom': forms.Select(attrs={
                'class': 'w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-blue-500 focus:border-blue-500 uom-select'
            }),
            'unit_cost': forms.NumberInput(attrs={
                'class': 'w-28 px-2 py-2 border border-gray-300 rounded-md focus:ring-blue-500 focus:border-blue-500 unit-cost-input',
                'step': '0.01',
                'min': '0',
                'hx-trigger': 'keyup changed delay:300ms',
                'hx-post': '/orders/purchase/calculate-line/',
                'hx-target': 'closest tr .line-total',
                'hx-include': 'closest tr'
            }),
            'notes': forms.TextInput(attrs={
                'class': 'w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-blue-500 focus:border-blue-500',
                'placeholder': 'Optional notes...'
            }),
        }


# Formset for purchase order lines
PurchaseOrderLineFormSet = inlineformset_factory(
    PurchaseOrder,
    PurchaseOrderLine,
    form=PurchaseOrderLineForm,
    extra=1,
    can_delete=True,
    min_num=1,
    validate_min=True
)


class SalesOrderForm(forms.ModelForm):
    """
    Form for creating/editing sales orders.
    """
    class Meta:
        model = SalesOrder
        fields = [
            'customer', 'order_number', 'order_date', 'ship_to', 'bill_to',
            'customer_po', 'status', 'priority', 'notes'
        ]
        widgets = {
            'customer': forms.Select(attrs={
                'class': 'w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-blue-500 focus:border-blue-500',
                'hx-get': '/orders/sales/customer-locations/',
                'hx-target': '#ship-to-select,#bill-to-select',
                'hx-trigger': 'change'
            }),
            'order_number': forms.TextInput(attrs={
                'class': 'w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-blue-500 focus:border-blue-500',
                'placeholder': 'Auto-generated if left blank'
            }),
            'order_date': forms.DateInput(attrs={
                'type': 'date',
                'class': 'w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-blue-500 focus:border-blue-500'
            }),
            'ship_to': forms.Select(attrs={
                'class': 'w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-blue-500 focus:border-blue-500',
                'id': 'ship-to-select'
            }),
            'bill_to': forms.Select(attrs={
                'class': 'w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-blue-500 focus:border-blue-500',
                'id': 'bill-to-select'
            }),
            'customer_po': forms.TextInput(attrs={
                'class': 'w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-blue-500 focus:border-blue-500',
                'placeholder': "Customer's PO number"
            }),
            'status': forms.Select(attrs={
                'class': 'w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-blue-500 focus:border-blue-500'
            }),
            'priority': forms.NumberInput(attrs={
                'class': 'w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-blue-500 focus:border-blue-500',
                'min': '1',
                'max': '10'
            }),
            'notes': forms.Textarea(attrs={
                'class': 'w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-blue-500 focus:border-blue-500',
                'rows': '3'
            }),
        }

    def __init__(self, *args, **kwargs):
        super().__init__(*args, **kwargs)
        # Make order_number optional (will be auto-generated)
        self.fields['order_number'].required = False
        self.fields['bill_to'].required = False


class SalesOrderLineForm(forms.ModelForm):
    """
    Form for creating/editing sales order lines.
    """
    class Meta:
        model = SalesOrderLine
        fields = ['line_number', 'item', 'quantity_ordered', 'uom', 'unit_price', 'notes']
        widgets = {
            'line_number': forms.NumberInput(attrs={
                'class': 'w-20 px-2 py-2 border border-gray-300 rounded-md focus:ring-blue-500 focus:border-blue-500',
                'step': '10'
            }),
            'item': forms.Select(attrs={
                'class': 'w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-blue-500 focus:border-blue-500 item-select',
                'hx-get': '/orders/sales/item-uoms/',
                'hx-target': 'closest tr .uom-select',
                'hx-trigger': 'change'
            }),
            'quantity_ordered': forms.NumberInput(attrs={
                'class': 'w-24 px-2 py-2 border border-gray-300 rounded-md focus:ring-blue-500 focus:border-blue-500 quantity-input',
                'min': '1',
                'hx-trigger': 'keyup changed delay:300ms',
                'hx-post': '/orders/sales/calculate-line/',
                'hx-target': 'closest tr .line-total',
                'hx-include': 'closest tr'
            }),
            'uom': forms.Select(attrs={
                'class': 'w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-blue-500 focus:border-blue-500 uom-select'
            }),
            'unit_price': forms.NumberInput(attrs={
                'class': 'w-28 px-2 py-2 border border-gray-300 rounded-md focus:ring-blue-500 focus:border-blue-500 unit-price-input',
                'step': '0.01',
                'min': '0',
                'hx-trigger': 'keyup changed delay:300ms',
                'hx-post': '/orders/sales/calculate-line/',
                'hx-target': 'closest tr .line-total',
                'hx-include': 'closest tr'
            }),
            'notes': forms.TextInput(attrs={
                'class': 'w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-blue-500 focus:border-blue-500',
                'placeholder': 'Optional notes...'
            }),
        }


# Formset for sales order lines
SalesOrderLineFormSet = inlineformset_factory(
    SalesOrder,
    SalesOrderLine,
    form=SalesOrderLineForm,
    extra=1,
    can_delete=True,
    min_num=1,
    validate_min=True
)
