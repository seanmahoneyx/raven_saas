"""Helper services for the assets app."""
import re


def _generate_asset_number(tenant):
    """Generate the next asset number for a tenant."""
    from apps.assets.models import FixedAsset

    asset_numbers = FixedAsset.objects.filter(tenant=tenant).values_list('asset_number', flat=True)
    max_num = 0
    for asset_num in asset_numbers:
        match = re.search(r'(\d+)', asset_num or '')
        if match:
            num = int(match.group(1))
            if num > max_num:
                max_num = num
    return f"FA-{str(max_num + 1).zfill(6)}"
