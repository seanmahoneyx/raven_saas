# shared/middleware.py
"""
Security middleware for additional HTTP security headers.

These headers provide defense-in-depth protection against various attacks.
"""


class SecurityHeadersMiddleware:
    """
    Add additional security headers to all responses.

    Headers added:
    - X-Content-Type-Options: nosniff (prevent MIME type sniffing)
    - Referrer-Policy: strict-origin-when-cross-origin (privacy)
    - Permissions-Policy: restrict browser features

    Note: Other security headers are set via Django settings:
    - X-Frame-Options (via settings.X_FRAME_OPTIONS)
    - Strict-Transport-Security (via settings.SECURE_HSTS_SECONDS)
    - Content-Security-Policy (via django-csp if installed)
    """

    def __init__(self, get_response):
        self.get_response = get_response

    def __call__(self, request):
        response = self.get_response(request)

        # Prevent MIME type sniffing
        # Browsers will respect the Content-Type header
        response['X-Content-Type-Options'] = 'nosniff'

        # Control referrer information sent to other sites
        # Only send origin when navigating cross-origin
        response['Referrer-Policy'] = 'strict-origin-when-cross-origin'

        # Restrict browser features and APIs
        # Disable potentially dangerous features
        response['Permissions-Policy'] = (
            'geolocation=(), '  # Disable geolocation
            'microphone=(), '   # Disable microphone
            'camera=(), '       # Disable camera
            'payment=()'        # Disable payment API
        )

        return response
