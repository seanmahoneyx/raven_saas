# apps/api/urls.py
"""
Main API URL configuration.

Includes versioned API routes and documentation.
"""
from django.urls import path, include
from drf_spectacular.views import (
    SpectacularAPIView,
    SpectacularRedocView,
    SpectacularSwaggerView,
)

urlpatterns = [
    # API v1
    path('v1/', include('apps.api.v1.urls')),

    # OpenAPI Schema
    path('schema/', SpectacularAPIView.as_view(), name='schema'),

    # API Documentation
    path('docs/', SpectacularSwaggerView.as_view(url_name='schema'), name='swagger-ui'),
    path('redoc/', SpectacularRedocView.as_view(url_name='schema'), name='redoc'),
]
