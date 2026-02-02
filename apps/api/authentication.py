# apps/api/authentication.py
"""
Custom JWT authentication that supports httpOnly cookies.

Checks for JWT tokens in the following order:
1. httpOnly cookie (preferred, more secure)
2. Authorization header (for backwards compatibility)
"""

from rest_framework_simplejwt.authentication import JWTAuthentication
from rest_framework_simplejwt.exceptions import InvalidToken, TokenError


ACCESS_TOKEN_COOKIE = 'raven_access'


class CookieJWTAuthentication(JWTAuthentication):
    """
    JWT Authentication that reads tokens from httpOnly cookies.

    Falls back to Authorization header for backwards compatibility
    and for non-browser clients.
    """

    def authenticate(self, request):
        # Try cookie first (preferred for browser clients)
        raw_token = request.COOKIES.get(ACCESS_TOKEN_COOKIE)

        if raw_token:
            try:
                validated_token = self.get_validated_token(raw_token)
                return self.get_user(validated_token), validated_token
            except (InvalidToken, TokenError):
                # Cookie token invalid, try header
                pass

        # Fall back to Authorization header
        return super().authenticate(request)
