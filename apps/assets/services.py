"""Helper services for the assets app."""


def _generate_asset_number(tenant):
    """Atomically consume the next fixed-asset number for a tenant."""
    from apps.tenants.models import get_next_sequence_number
    return get_next_sequence_number(tenant, 'FA')
