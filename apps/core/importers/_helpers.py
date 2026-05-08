"""
Shared helper utilities for CSV importers.
"""


def parse_bool(value):
    """Return True if value is a truthy string (true/yes/1), else False."""
    if not value:
        return False
    return str(value).strip().lower() in ('true', 'yes', '1')


def parse_bool_default_true(value):
    """Return True if value is blank/absent; otherwise parse as bool."""
    if not value or str(value).strip() == '':
        return True
    return str(value).strip().lower() in ('true', 'yes', '1')


def int_or_none(value):
    """Parse value as int, return None if blank/None."""
    if value is None or str(value).strip() == '':
        return None
    return int(str(value).strip())
