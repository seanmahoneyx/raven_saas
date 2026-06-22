# shared/search.py
"""Search ordering helpers shared across search/autocomplete endpoints."""
from django.db.models import Case, When, Value, IntegerField, Q


def prefix_ranked(queryset, fields, term):
    """Order an already-filtered queryset so that rows whose any of ``fields``
    *starts with* ``term`` come first, then the remaining (substring-only)
    matches — each group ordered alphabetically by the first field.

    This prevents the classic autocomplete failure where a substring match
    (``icontains``) plus a hard result cap buries the names that actually
    *start* with what the user typed: e.g. typing "D" matches every name
    containing a "d" anywhere, and the cap fills with A/B/C rows before any
    name beginning with "D" is reached.

    ``queryset`` should already be filtered to the matching set; this only
    reorders it. Returns the queryset unchanged when ``term`` is empty.
    """
    if not term or not fields:
        return queryset
    prefix_q = Q()
    for field in fields:
        prefix_q |= Q(**{f'{field}__istartswith': term})
    return queryset.annotate(
        _prefix_rank=Case(
            When(prefix_q, then=Value(0)),
            default=Value(1),
            output_field=IntegerField(),
        )
    ).order_by('_prefix_rank', fields[0])
