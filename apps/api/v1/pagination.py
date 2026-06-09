"""Shared pagination classes for the v1 API."""
from rest_framework.pagination import PageNumberPagination


class StandardPagination(PageNumberPagination):
    """Default page-number pagination that honours a client ``?page_size=`` param.

    DRF's stock ``PageNumberPagination`` ignores ``?page_size`` unless
    ``page_size_query_param`` is set, which silently capped clients at
    ``PAGE_SIZE`` rows per request. Front-end helpers (e.g. ``fetchAllPages``)
    request larger pages to load a full dataset in fewer round trips, so we
    expose the param here with a sane upper bound.
    """

    page_size_query_param = 'page_size'
    max_page_size = 500
