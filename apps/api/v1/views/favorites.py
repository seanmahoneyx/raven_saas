# apps/api/v1/views/favorites.py
"""
Views for the Favorites & Recents feature.

Endpoints:
  GET/POST   /api/v1/favorites/           - list / create favorite
  DELETE     /api/v1/favorites/<pk>/      - remove favorite
  GET/POST   /api/v1/recents/             - list recents / track a view
  GET        /api/v1/suggestions/         - combined favorites+recents+search
"""
from rest_framework import viewsets, status
from rest_framework.response import Response
from rest_framework.views import APIView
from rest_framework.permissions import IsAuthenticated
from django.db.models import F

from apps.favorites.models import (
    UserFavorite, UserRecentView, ENTITY_TYPE_VALUES, get_entity_label,
)
from apps.api.v1.serializers.favorites import (
    UserFavoriteSerializer,
    UserRecentViewSerializer,
    AddFavoriteSerializer,
    TrackViewSerializer,
)

MAX_RECENTS = 50


class FavoriteViewSet(viewsets.GenericViewSet):
    """
    List, create, and delete user favorites.

    GET  /favorites/           - list favorites (optional ?entity_type=)
    POST /favorites/           - add a favorite
    DELETE /favorites/<pk>/    - remove a favorite
    """
    serializer_class = UserFavoriteSerializer
    permission_classes = [IsAuthenticated]
    http_method_names = ['get', 'post', 'delete']

    def get_queryset(self):
        qs = UserFavorite.objects.filter(user=self.request.user).order_by('-created_at')
        entity_type = self.request.query_params.get('entity_type')
        if entity_type:
            qs = qs.filter(entity_type=entity_type)
        return qs

    def list(self, request, *args, **kwargs):
        qs = self.get_queryset()
        return Response(UserFavoriteSerializer(qs, many=True).data)

    def create(self, request, *args, **kwargs):
        input_ser = AddFavoriteSerializer(data=request.data)
        input_ser.is_valid(raise_exception=True)
        data = input_ser.validated_data

        label = get_entity_label(data['entity_type'], data['object_id'])
        if label is None:
            return Response(
                {'detail': 'Entity not found.'},
                status=status.HTTP_404_NOT_FOUND,
            )

        favorite, created = UserFavorite.objects.get_or_create(
            tenant=request.tenant,
            user=request.user,
            entity_type=data['entity_type'],
            object_id=data['object_id'],
            defaults={'label': label},
        )
        if not created:
            # Refresh label in case it changed
            favorite.label = label
            favorite.save(update_fields=['label'])

        return Response(
            UserFavoriteSerializer(favorite).data,
            status=status.HTTP_201_CREATED if created else status.HTTP_200_OK,
        )

    def destroy(self, request, *args, **kwargs):
        try:
            favorite = UserFavorite.objects.get(
                pk=kwargs['pk'],
                user=request.user,
            )
        except UserFavorite.DoesNotExist:
            return Response(
                {'detail': 'Not found.'},
                status=status.HTTP_404_NOT_FOUND,
            )
        favorite.delete()
        return Response(status=status.HTTP_204_NO_CONTENT)


class RecentViewAPI(APIView):
    """
    List recent views and track new views.

    GET  /recents/        - list recents (optional ?entity_type=&limit=10)
    POST /recents/        - track a view (upsert: increments view_count)
    """
    permission_classes = [IsAuthenticated]

    def get(self, request):
        qs = UserRecentView.objects.filter(user=request.user).order_by('-last_viewed_at')
        entity_type = request.query_params.get('entity_type')
        if entity_type:
            qs = qs.filter(entity_type=entity_type)
        try:
            limit = int(request.query_params.get('limit', 10))
        except (TypeError, ValueError):
            limit = 10
        qs = qs[:limit]
        return Response(UserRecentViewSerializer(qs, many=True).data)

    def post(self, request):
        ser = TrackViewSerializer(data=request.data)
        ser.is_valid(raise_exception=True)
        data = ser.validated_data

        label = get_entity_label(data['entity_type'], data['object_id'])
        if label is None:
            return Response(
                {'detail': 'Entity not found.'},
                status=status.HTTP_404_NOT_FOUND,
            )

        recent, created = UserRecentView.objects.get_or_create(
            tenant=request.tenant,
            user=request.user,
            entity_type=data['entity_type'],
            object_id=data['object_id'],
            defaults={'label': label, 'view_count': 1},
        )
        if not created:
            UserRecentView.objects.filter(pk=recent.pk).update(
                view_count=F('view_count') + 1,
                label=label,
            )
            # Refresh last_viewed_at (auto_now field updates on save)
            recent.refresh_from_db()
            recent.save(update_fields=['last_viewed_at'])

        # Enforce per-type cap: keep only the 50 most recent
        excess_ids = list(
            UserRecentView.objects.filter(
                tenant=request.tenant,
                user=request.user,
                entity_type=data['entity_type'],
            ).order_by('-last_viewed_at')[MAX_RECENTS:].values_list('id', flat=True)
        )
        if excess_ids:
            UserRecentView.objects.filter(id__in=excess_ids).delete()

        return Response({'status': 'tracked'}, status=status.HTTP_200_OK)


class SuggestionsAPI(APIView):
    """
    Combined suggestions endpoint for combobox/autocomplete UI.

    GET /suggestions/?entity_type=<type>[&search=<term>]

    Returns:
      {
        "favorites": [...],   # up to 10
        "recents":   [...],   # up to 5, excluding favorites
        "results":   [...],   # up to 20, always returned (filtered by search when provided)
      }
    """
    permission_classes = [IsAuthenticated]

    def get(self, request):
        entity_type = request.query_params.get('entity_type', '').strip()
        search = request.query_params.get('search', '').strip()

        if not entity_type or entity_type not in ENTITY_TYPE_VALUES:
            return Response(
                {'detail': 'entity_type is required and must be valid.'},
                status=status.HTTP_400_BAD_REQUEST,
            )

        # 1. Favorites (max 10)
        fav_qs = UserFavorite.objects.filter(
            user=request.user,
            entity_type=entity_type,
        ).order_by('-created_at')[:10]
        favorites = [
            {'id': f.object_id, 'label': f.label, 'is_favorite': True}
            for f in fav_qs
        ]
        fav_ids = {f['id'] for f in favorites}

        # 2. Recents (max 5, exclude favorites)
        recent_qs = UserRecentView.objects.filter(
            user=request.user,
            entity_type=entity_type,
        ).exclude(object_id__in=fav_ids).order_by('-last_viewed_at')[:5]
        recents = [
            {'id': r.object_id, 'label': r.label, 'is_favorite': False}
            for r in recent_qs
        ]
        recent_ids = {r['id'] for r in recents}

        # 3. Search results (max 20) — always return results, filtered by search if provided
        exclude_ids = fav_ids | recent_ids
        results = self._search_entities(request, entity_type, search, exclude_ids)

        return Response({
            'favorites': favorites,
            'recents': recents,
            'results': results,
        })

    def _search_entities(self, request, entity_type, search, exclude_ids):
        registry = self._get_registry()
        config = registry.get(entity_type)
        if not config:
            return []

        model_class, search_fields, label_func = config
        from django.db.models import Q

        qs = model_class.objects.exclude(id__in=exclude_ids)
        if search:
            q = Q()
            for field in search_fields:
                q |= Q(**{f'{field}__icontains': search})
            qs = qs.filter(q)
        qs = qs[:20]

        # Determine which results are already favorited
        existing_fav_ids = set(
            UserFavorite.objects.filter(
                user=request.user,
                entity_type=entity_type,
            ).values_list('object_id', flat=True)
        )

        return [
            {
                'id': obj.id,
                'label': label_func(obj),
                'is_favorite': obj.id in existing_fav_ids,
            }
            for obj in qs
        ]

    def _get_registry(self):
        """
        Lazy registry mapping entity_type -> (Model, search_fields, label_func).
        All imports are deferred to avoid circular import issues.
        """
        from apps.parties.models import Customer, Vendor
        from apps.items.models import Item

        registry = {
            'customer': (
                Customer,
                ['party__display_name', 'party__code'],
                lambda o: o.party.display_name,
            ),
            'vendor': (
                Vendor,
                ['party__display_name', 'party__code'],
                lambda o: o.party.display_name,
            ),
            'item': (
                Item,
                ['sku', 'name'],
                lambda o: f'{o.sku} \u2013 {o.name}',
            ),
        }

        try:
            from apps.contacts.models import Contact
            registry['contact'] = (
                Contact,
                ['first_name', 'last_name', 'email'],
                lambda o: f'{o.first_name} {o.last_name}'.strip(),
            )
        except ImportError:
            pass

        try:
            from apps.contracts.models import Contract
            registry['contract'] = (
                Contract,
                ['contract_number', 'blanket_po'],
                lambda o: o.contract_number,
            )
        except ImportError:
            pass

        try:
            from apps.orders.models import SalesOrder, PurchaseOrder
            registry['sales_order'] = (
                SalesOrder,
                ['order_number', 'customer_po'],
                lambda o: o.order_number,
            )
            registry['purchase_order'] = (
                PurchaseOrder,
                ['po_number'],
                lambda o: o.po_number,
            )
        except ImportError:
            pass

        try:
            from apps.orders.models import RFQ
            registry['rfq'] = (
                RFQ,
                ['rfq_number'],
                lambda o: o.rfq_number,
            )
        except ImportError:
            pass

        try:
            from apps.orders.models import Estimate
            registry['estimate'] = (
                Estimate,
                ['estimate_number'],
                lambda o: o.estimate_number,
            )
        except ImportError:
            pass

        try:
            from apps.invoicing.models import Invoice
            registry['invoice'] = (
                Invoice,
                ['invoice_number'],
                lambda o: o.invoice_number,
            )
        except ImportError:
            pass

        try:
            from apps.pricing.models import PriceList
            registry['price_list'] = (
                PriceList,
                ['customer__party__display_name', 'item__sku'],
                lambda o: f'Price: {o.customer} / {o.item}',
            )
        except ImportError:
            pass

        try:
            from apps.design.models import DesignRequest
            registry['design_request'] = (
                DesignRequest,
                ['file_number', 'ident'],
                lambda o: o.file_number or o.ident,
            )
        except ImportError:
            pass

        try:
            from apps.accounting.models import Account
            registry['account'] = (
                Account,
                ['code', 'name'],
                lambda o: f'{o.code} \u2013 {o.name}',
            )
        except ImportError:
            pass

        try:
            from apps.accounting.models import JournalEntry
            registry['journal_entry'] = (
                JournalEntry,
                ['entry_number', 'memo'],
                lambda o: o.entry_number,
            )
        except ImportError:
            pass

        return registry
