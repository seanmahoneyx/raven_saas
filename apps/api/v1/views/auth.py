# apps/api/v1/views/auth.py
"""
Custom JWT authentication views with httpOnly cookie support.

This is more secure than storing tokens in localStorage because:
- Cookies with httpOnly flag cannot be accessed by JavaScript
- This protects against XSS attacks stealing tokens
"""

from django.conf import settings
from rest_framework import status
from rest_framework.response import Response
from rest_framework.views import APIView
from rest_framework.permissions import AllowAny, IsAuthenticated
from rest_framework_simplejwt.views import TokenObtainPairView, TokenRefreshView
from rest_framework_simplejwt.tokens import RefreshToken
from rest_framework_simplejwt.exceptions import TokenError, InvalidToken
from drf_spectacular.utils import extend_schema


# Cookie configuration
ACCESS_TOKEN_COOKIE = 'raven_access'
REFRESH_TOKEN_COOKIE = 'raven_refresh'
COOKIE_MAX_AGE_ACCESS = 60 * 60  # 1 hour
COOKIE_MAX_AGE_REFRESH = 60 * 60 * 24 * 7  # 7 days


def _get_cookie_settings():
    """Get cookie settings based on DEBUG mode."""
    secure = not settings.DEBUG  # Only secure in production
    return {
        'httponly': True,
        'secure': secure,
        'samesite': 'Lax',
        'path': '/',
    }


class CookieTokenObtainPairView(TokenObtainPairView):
    """
    Login endpoint that sets JWT tokens in httpOnly cookies.

    POST /api/v1/auth/login/
    Body: { "username": "...", "password": "..." }

    Response includes tokens in httpOnly cookies (not in response body).
    """

    @extend_schema(
        tags=['auth'],
        summary='Login and receive JWT in httpOnly cookies',
        description='Authenticate with username/password. Tokens are set as httpOnly cookies.',
    )
    def post(self, request, *args, **kwargs):
        serializer = self.get_serializer(data=request.data)

        try:
            serializer.is_valid(raise_exception=True)
        except TokenError as e:
            raise InvalidToken(e.args[0])

        # Get tokens from serializer
        access_token = serializer.validated_data.get('access')
        refresh_token = serializer.validated_data.get('refresh')

        # Create response without tokens in body (more secure)
        response = Response({
            'message': 'Login successful',
            'user': {
                'id': serializer.user.id,
                'username': serializer.user.username,
            }
        })

        # Set tokens in httpOnly cookies
        cookie_settings = _get_cookie_settings()

        response.set_cookie(
            ACCESS_TOKEN_COOKIE,
            access_token,
            max_age=COOKIE_MAX_AGE_ACCESS,
            **cookie_settings
        )
        response.set_cookie(
            REFRESH_TOKEN_COOKIE,
            refresh_token,
            max_age=COOKIE_MAX_AGE_REFRESH,
            **cookie_settings
        )

        return response


class CookieTokenRefreshView(APIView):
    """
    Refresh access token using refresh token from httpOnly cookie.

    POST /api/v1/auth/refresh/

    Reads refresh token from cookie, returns new access token in cookie.
    """
    permission_classes = [AllowAny]

    @extend_schema(
        tags=['auth'],
        summary='Refresh access token from httpOnly cookie',
        description='Uses refresh token from cookie to get new access token.',
    )
    def post(self, request, *args, **kwargs):
        refresh_token = request.COOKIES.get(REFRESH_TOKEN_COOKIE)

        if not refresh_token:
            return Response(
                {'error': 'No refresh token provided'},
                status=status.HTTP_401_UNAUTHORIZED
            )

        try:
            refresh = RefreshToken(refresh_token)
            access_token = str(refresh.access_token)

            response = Response({'message': 'Token refreshed'})

            cookie_settings = _get_cookie_settings()
            response.set_cookie(
                ACCESS_TOKEN_COOKIE,
                access_token,
                max_age=COOKIE_MAX_AGE_ACCESS,
                **cookie_settings
            )

            # Rotate refresh token if enabled
            if settings.SIMPLE_JWT.get('ROTATE_REFRESH_TOKENS', False):
                refresh.blacklist()
                new_refresh = RefreshToken.for_user(refresh.payload.get('user_id'))
                response.set_cookie(
                    REFRESH_TOKEN_COOKIE,
                    str(new_refresh),
                    max_age=COOKIE_MAX_AGE_REFRESH,
                    **cookie_settings
                )

            return response

        except TokenError:
            return Response(
                {'error': 'Invalid or expired refresh token'},
                status=status.HTTP_401_UNAUTHORIZED
            )


class CookieLogoutView(APIView):
    """
    Logout by clearing JWT cookies.

    POST /api/v1/auth/logout/
    """
    permission_classes = [IsAuthenticated]

    @extend_schema(
        tags=['auth'],
        summary='Logout and clear JWT cookies',
    )
    def post(self, request, *args, **kwargs):
        response = Response({'message': 'Logged out successfully'})

        # Clear cookies by setting them to empty with immediate expiry
        response.delete_cookie(ACCESS_TOKEN_COOKIE, path='/')
        response.delete_cookie(REFRESH_TOKEN_COOKIE, path='/')

        return response
