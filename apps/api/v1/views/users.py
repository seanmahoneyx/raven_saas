# apps/api/v1/views/users.py
"""User profile and preferences endpoints."""
from django.db import IntegrityError
from django.shortcuts import get_object_or_404
from rest_framework.views import APIView
from rest_framework.response import Response
from rest_framework import status
from rest_framework.permissions import IsAuthenticated, IsAdminUser
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


@extend_schema(
    description="List all users or create a new user",
    tags=["Users"]
)
class UserListView(APIView):
    """
    GET /api/v1/users/ - Returns a list of all users.
    POST /api/v1/users/ - Create a new user (admin only).
    """
    permission_classes = [IsAuthenticated]

    def get_permissions(self):
        if self.request.method == 'POST':
            return [IsAdminUser()]
        return [IsAuthenticated()]

    def get(self, request):
        from users.models import User
        users = User.objects.all().order_by('username')
        data = [
            {
                'id': u.id,
                'username': u.username,
                'email': u.email,
                'name': getattr(u, 'name', ''),
                'is_active': u.is_active,
                'is_staff': u.is_staff,
                'is_superuser': u.is_superuser,
                'date_joined': u.date_joined,
            }
            for u in users
        ]
        return Response(data)

    def post(self, request):
        from users.models import User
        username = request.data.get('username', '').strip()
        password = request.data.get('password', '')
        if not username or not password:
            return Response(
                {'detail': 'Username and password are required.'},
                status=status.HTTP_400_BAD_REQUEST,
            )
        try:
            user = User.objects.create_user(
                username=username,
                email=request.data.get('email', ''),
                password=password,
            )
        except IntegrityError:
            return Response(
                {'detail': 'Username already exists.'},
                status=status.HTTP_400_BAD_REQUEST,
            )
        user.name = request.data.get('name', '')
        user.is_staff = request.data.get('is_staff', False)
        user.is_superuser = request.data.get('is_superuser', False)
        user.save(update_fields=['name', 'is_staff', 'is_superuser'])
        return Response(
            {
                'id': user.id,
                'username': user.username,
                'email': user.email,
                'name': user.name,
                'is_active': user.is_active,
                'is_staff': user.is_staff,
                'is_superuser': user.is_superuser,
                'date_joined': user.date_joined,
            },
            status=status.HTTP_201_CREATED,
        )


@extend_schema(
    description="Retrieve, update or delete a user",
    tags=["Users"]
)
class UserDetailView(APIView):
    """
    GET /api/v1/users/<id>/
    PATCH /api/v1/users/<id>/
    DELETE /api/v1/users/<id>/
    """
    permission_classes = [IsAdminUser]

    def _serialize(self, user):
        return {
            'id': user.id,
            'username': user.username,
            'email': user.email,
            'name': getattr(user, 'name', ''),
            'is_active': user.is_active,
            'is_staff': user.is_staff,
            'is_superuser': user.is_superuser,
            'date_joined': user.date_joined,
        }

    def get(self, request, pk):
        from users.models import User
        user = get_object_or_404(User, pk=pk)
        return Response(self._serialize(user))

    def patch(self, request, pk):
        from users.models import User
        user = get_object_or_404(User, pk=pk)
        update_fields = []
        for field in ('name', 'email', 'is_active', 'is_staff', 'is_superuser'):
            if field in request.data:
                setattr(user, field, request.data[field])
                update_fields.append(field)
        if 'username' in request.data:
            new_username = request.data['username'].strip()
            if new_username and new_username != user.username:
                if User.objects.filter(username=new_username).exclude(pk=pk).exists():
                    return Response(
                        {'detail': 'Username already exists.'},
                        status=status.HTTP_400_BAD_REQUEST,
                    )
                user.username = new_username
                update_fields.append('username')
        if 'password' in request.data and request.data['password']:
            user.set_password(request.data['password'])
            update_fields.append('password')
        if update_fields:
            user.save(update_fields=update_fields)
        return Response(self._serialize(user))

    def delete(self, request, pk):
        from users.models import User
        user = get_object_or_404(User, pk=pk)
        if user.pk == request.user.pk:
            return Response(
                {'detail': 'You cannot delete yourself.'},
                status=status.HTTP_400_BAD_REQUEST,
            )
        user.delete()
        return Response(status=status.HTTP_204_NO_CONTENT)


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
