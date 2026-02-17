# apps/api/v1/views/users.py
"""User profile and preferences endpoints."""
from rest_framework.views import APIView
from rest_framework.response import Response
from rest_framework import status
from rest_framework.permissions import IsAuthenticated
from drf_spectacular.utils import extend_schema


@extend_schema(
    description="Get current user profile with roles and permissions",
    tags=["Users"]
)
class CurrentUserView(APIView):
    """
    GET /api/v1/users/me/

    Returns the authenticated user's profile including groups/roles and permissions.
    """
    permission_classes = [IsAuthenticated]

    def get(self, request):
        user = request.user
        groups = list(user.groups.values_list('name', flat=True))
        permissions = list(user.get_all_permissions())

        return Response({
            'id': user.id,
            'username': user.username,
            'email': user.email,
            'name': getattr(user, 'name', ''),
            'is_superuser': user.is_superuser,
            'is_staff': user.is_staff,
            'roles': groups,
            'permissions': permissions,
            'preferences': getattr(user, 'preferences', {}),
        })


class UserPreferencesView(APIView):
    """GET/PATCH /api/v1/users/me/preferences/ - Manage user preferences."""
    permission_classes = [IsAuthenticated]

    @extend_schema(tags=['Users'], summary='Get user preferences')
    def get(self, request):
        return Response(request.user.preferences or {})

    @extend_schema(tags=['Users'], summary='Update user preferences')
    def patch(self, request):
        user = request.user
        # Merge incoming prefs with existing (partial update)
        current = user.preferences or {}
        current.update(request.data)
        user.preferences = current
        user.save(update_fields=['preferences'])
        return Response(user.preferences)
