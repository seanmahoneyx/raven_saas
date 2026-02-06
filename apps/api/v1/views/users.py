# apps/api/v1/views/users.py
"""User profile endpoint."""
from rest_framework.views import APIView
from rest_framework.response import Response
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
        })
