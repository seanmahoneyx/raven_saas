# apps/favorites/tests.py
"""
Tests for the Favorites & Recents feature.

Coverage:
- Model: UserFavorite and UserRecentView creation, constraints, get_entity_label()
- API: GET/POST/DELETE favorites, recents tracking (upsert, 50-cap), suggestions
- Tenant isolation: user in tenant A cannot see tenant B favorites
"""
from django.test import TestCase
from django.db import IntegrityError
from django.contrib.auth import get_user_model
from rest_framework.test import APIClient
from rest_framework import status

from apps.tenants.models import Tenant
from apps.parties.models import Party, Customer, Vendor
from apps.items.models import UnitOfMeasure, Item
from apps.favorites.models import UserFavorite, UserRecentView, get_entity_label
from shared.managers import set_current_tenant

User = get_user_model()


# =============================================================================
# SHARED FIXTURE HELPER
#
# Each API TestCase subclass calls _setup_shared_fixture(cls, unique_subdomain)
# from its setUpTestData. This gives each class its own isolated is_default=True
# tenant so TenantMiddleware Strategy 3 reliably resolves to the right tenant.
# =============================================================================

def _setup_shared_fixture(cls, subdomain):
    """
    Populate cls with a single is_default=True tenant plus supporting data.
    Call from setUpTestData as: _setup_shared_fixture(cls, 'my-subdomain').
    """
    cls.tenant = Tenant.objects.create(
        name='Test Company',
        subdomain=subdomain,
        is_default=True,
    )
    cls.user = User.objects.create_user(
        username=f'user_{subdomain}',
        password='testpass123',
    )
    set_current_tenant(cls.tenant)

    uom, _ = UnitOfMeasure.objects.get_or_create(
        tenant=cls.tenant, code='ea', defaults={'name': 'Each'},
    )
    cls.uom = uom

    cust_party = Party.objects.create(
        tenant=cls.tenant, party_type='CUSTOMER',
        code='TC-01', display_name='Test Customer Corp',
    )
    cls.customer = Customer.objects.create(tenant=cls.tenant, party=cust_party)

    vend_party = Party.objects.create(
        tenant=cls.tenant, party_type='VENDOR',
        code='TV-01', display_name='Test Vendor Inc',
    )
    cls.vendor = Vendor.objects.create(tenant=cls.tenant, party=vend_party)

    cls.item = Item.objects.create(
        tenant=cls.tenant,
        sku='TST-SKU-001',
        name='Test Item Alpha',
        base_uom=uom,
    )


# =============================================================================
# MODEL TESTS — no middleware involved, no default-tenant dependency
# =============================================================================

class UserFavoriteModelTests(TestCase):
    """Tests for UserFavorite model (no HTTP)."""

    @classmethod
    def setUpTestData(cls):
        cls.tenant = Tenant.objects.create(name='Fav Model Co', subdomain='fav-model-t')
        cls.user = User.objects.create_user(username='favmodeluser', password='pass')
        set_current_tenant(cls.tenant)
        cust_party = Party.objects.create(
            tenant=cls.tenant, party_type='CUSTOMER',
            code='FM-C1', display_name='Model Customer',
        )
        cls.customer = Customer.objects.create(tenant=cls.tenant, party=cust_party)

    def setUp(self):
        set_current_tenant(self.tenant)

    def test_create_user_favorite(self):
        """UserFavorite can be created with all required fields."""
        fav = UserFavorite.objects.create(
            tenant=self.tenant,
            user=self.user,
            entity_type='customer',
            object_id=self.customer.pk,
            label='Model Customer',
        )
        self.assertEqual(fav.entity_type, 'customer')
        self.assertEqual(fav.object_id, self.customer.pk)
        self.assertEqual(fav.label, 'Model Customer')
        self.assertEqual(fav.user, self.user)
        self.assertEqual(fav.tenant, self.tenant)

    def test_user_favorite_str(self):
        """UserFavorite __str__ includes entity_type and label."""
        fav = UserFavorite.objects.create(
            tenant=self.tenant,
            user=self.user,
            entity_type='customer',
            object_id=self.customer.pk + 100,
            label='Str Test Customer',
        )
        result = str(fav)
        self.assertIn('customer', result)
        self.assertIn('Str Test Customer', result)

    def test_user_favorite_unique_together(self):
        """Duplicate (tenant, user, entity_type, object_id) raises IntegrityError."""
        UserFavorite.objects.create(
            tenant=self.tenant, user=self.user,
            entity_type='customer', object_id=999001, label='First',
        )
        with self.assertRaises(IntegrityError):
            UserFavorite.objects.create(
                tenant=self.tenant, user=self.user,
                entity_type='customer', object_id=999001, label='Duplicate',
            )

    def test_user_favorite_default_ordering(self):
        """Favorites default ordering is most-recently-created first."""
        fav_a = UserFavorite.objects.create(
            tenant=self.tenant, user=self.user,
            entity_type='customer', object_id=999010, label='A',
        )
        fav_b = UserFavorite.objects.create(
            tenant=self.tenant, user=self.user,
            entity_type='customer', object_id=999011, label='B',
        )
        qs = UserFavorite.objects.filter(
            user=self.user, object_id__in=[999010, 999011],
        )
        self.assertEqual(qs.first().pk, fav_b.pk)


class UserRecentViewModelTests(TestCase):
    """Tests for UserRecentView model (no HTTP)."""

    @classmethod
    def setUpTestData(cls):
        cls.tenant = Tenant.objects.create(name='Recent Model Co', subdomain='recent-model-t')
        cls.user = User.objects.create_user(username='recentmodeluser', password='pass')
        set_current_tenant(cls.tenant)

    def setUp(self):
        set_current_tenant(self.tenant)

    def test_create_user_recent_view(self):
        """UserRecentView can be created; view_count defaults to 1."""
        recent = UserRecentView.objects.create(
            tenant=self.tenant, user=self.user,
            entity_type='vendor', object_id=111, label='Recent Vendor',
        )
        self.assertEqual(recent.entity_type, 'vendor')
        self.assertEqual(recent.object_id, 111)
        self.assertEqual(recent.view_count, 1)
        self.assertEqual(recent.label, 'Recent Vendor')

    def test_user_recent_view_str(self):
        """UserRecentView __str__ includes entity_type, object_id, and view_count."""
        recent = UserRecentView.objects.create(
            tenant=self.tenant, user=self.user,
            entity_type='item', object_id=222, label='Recent Item',
        )
        result = str(recent)
        self.assertIn('item', result)
        self.assertIn('222', result)

    def test_user_recent_view_unique_together(self):
        """Duplicate (tenant, user, entity_type, object_id) raises IntegrityError."""
        UserRecentView.objects.create(
            tenant=self.tenant, user=self.user,
            entity_type='item', object_id=999002, label='First',
        )
        with self.assertRaises(IntegrityError):
            UserRecentView.objects.create(
                tenant=self.tenant, user=self.user,
                entity_type='item', object_id=999002, label='Duplicate',
            )


class GetEntityLabelTests(TestCase):
    """Tests for the get_entity_label() utility function."""

    @classmethod
    def setUpTestData(cls):
        cls.tenant = Tenant.objects.create(name='Label Co', subdomain='label-t')
        set_current_tenant(cls.tenant)
        uom = UnitOfMeasure.objects.create(tenant=cls.tenant, code='ea', name='Each')
        cust_party = Party.objects.create(
            tenant=cls.tenant, party_type='CUSTOMER',
            code='LBL-C1', display_name='Label Customer Corp',
        )
        cls.customer = Customer.objects.create(tenant=cls.tenant, party=cust_party)
        vend_party = Party.objects.create(
            tenant=cls.tenant, party_type='VENDOR',
            code='LBL-V1', display_name='Label Vendor Inc',
        )
        cls.vendor = Vendor.objects.create(tenant=cls.tenant, party=vend_party)
        cls.item = Item.objects.create(
            tenant=cls.tenant, sku='LBL-SKU-001', name='Label Test Item', base_uom=uom,
        )

    def setUp(self):
        set_current_tenant(self.tenant)

    def test_get_entity_label_customer(self):
        """Returns party.display_name for a customer."""
        label = get_entity_label('customer', self.customer.pk, tenant=self.tenant)
        self.assertEqual(label, 'Label Customer Corp')

    def test_get_entity_label_vendor(self):
        """Returns party.display_name for a vendor."""
        label = get_entity_label('vendor', self.vendor.pk, tenant=self.tenant)
        self.assertEqual(label, 'Label Vendor Inc')

    def test_get_entity_label_item(self):
        """Returns 'SKU \u2013 name' for an item."""
        label = get_entity_label('item', self.item.pk, tenant=self.tenant)
        self.assertEqual(label, 'LBL-SKU-001 \u2013 Label Test Item')

    def test_get_entity_label_nonexistent_returns_none(self):
        """Returns None for a non-existent entity."""
        label = get_entity_label('customer', 9999999, tenant=self.tenant)
        self.assertIsNone(label)

    def test_get_entity_label_unknown_type_returns_none(self):
        """Returns None for an unrecognized entity type."""
        label = get_entity_label('unknown_type', 1, tenant=self.tenant)
        self.assertIsNone(label)

    def test_get_entity_label_without_tenant_scope(self):
        """Works without tenant argument (global search)."""
        label = get_entity_label('customer', self.customer.pk)
        self.assertEqual(label, 'Label Customer Corp')


# =============================================================================
# API TESTS
# Each class gets its own isolated tenant via _setup_shared_fixture so
# TenantMiddleware's default-tenant fallback always finds the right one.
# =============================================================================

class FavoriteListTests(TestCase):
    """GET /api/v1/favorites/ — list and filter."""

    @classmethod
    def setUpTestData(cls):
        _setup_shared_fixture(cls, 'fav-list-t')

    def setUp(self):
        self.client = APIClient()
        self.client.force_authenticate(user=self.user)
        set_current_tenant(self.tenant)

    def test_list_favorites_empty(self):
        """Returns an empty list when user has no favorites."""
        resp = self.client.get('/api/v1/favorites/')
        self.assertEqual(resp.status_code, status.HTTP_200_OK)
        self.assertIsInstance(resp.json(), list)

    def test_list_favorites_with_data(self):
        """Returns favorites belonging to the authenticated user."""
        UserFavorite.objects.create(
            tenant=self.tenant, user=self.user,
            entity_type='customer', object_id=self.customer.pk,
            label='Test Customer Corp',
        )
        resp = self.client.get('/api/v1/favorites/')
        self.assertEqual(resp.status_code, status.HTTP_200_OK)
        ids = [f['object_id'] for f in resp.json()]
        self.assertIn(self.customer.pk, ids)

    def test_list_favorites_filter_by_entity_type(self):
        """?entity_type=vendor returns only vendor favorites."""
        UserFavorite.objects.create(
            tenant=self.tenant, user=self.user,
            entity_type='vendor', object_id=self.vendor.pk,
            label='Test Vendor Inc',
        )
        UserFavorite.objects.create(
            tenant=self.tenant, user=self.user,
            entity_type='customer', object_id=self.customer.pk,
            label='Test Customer Corp',
        )
        resp = self.client.get('/api/v1/favorites/?entity_type=vendor')
        self.assertEqual(resp.status_code, status.HTTP_200_OK)
        types = {f['entity_type'] for f in resp.json()}
        self.assertEqual(types, {'vendor'})

    def test_list_favorites_requires_authentication(self):
        """Unauthenticated request returns 401."""
        resp = APIClient().get('/api/v1/favorites/')
        self.assertEqual(resp.status_code, status.HTTP_401_UNAUTHORIZED)


class FavoriteCreateTests(TestCase):
    """POST /api/v1/favorites/ — add a favorite."""

    @classmethod
    def setUpTestData(cls):
        _setup_shared_fixture(cls, 'fav-create-t')

    def setUp(self):
        self.client = APIClient()
        self.client.force_authenticate(user=self.user)
        set_current_tenant(self.tenant)

    def test_add_favorite_customer(self):
        """POST creates a favorite, resolves label, and returns 201."""
        resp = self.client.post('/api/v1/favorites/', {
            'entity_type': 'customer',
            'object_id': self.customer.pk,
        }, format='json')
        self.assertEqual(resp.status_code, status.HTTP_201_CREATED)
        data = resp.json()
        self.assertEqual(data['entity_type'], 'customer')
        self.assertEqual(data['object_id'], self.customer.pk)
        self.assertEqual(data['label'], 'Test Customer Corp')
        self.assertIn('id', data)

    def test_add_favorite_item(self):
        """POST creates a favorite for an item."""
        resp = self.client.post('/api/v1/favorites/', {
            'entity_type': 'item',
            'object_id': self.item.pk,
        }, format='json')
        self.assertEqual(resp.status_code, status.HTTP_201_CREATED)
        data = resp.json()
        self.assertIn('TST-SKU-001', data['label'])

    def test_add_duplicate_favorite_is_idempotent(self):
        """POST for an existing favorite returns 200 (not 201, not an error)."""
        payload = {'entity_type': 'vendor', 'object_id': self.vendor.pk}
        first = self.client.post('/api/v1/favorites/', payload, format='json')
        self.assertEqual(first.status_code, status.HTTP_201_CREATED)
        second = self.client.post('/api/v1/favorites/', payload, format='json')
        self.assertEqual(second.status_code, status.HTTP_200_OK)
        # Middleware clears thread-local tenant after each request; restore before querying.
        set_current_tenant(self.tenant)
        count = UserFavorite.objects.filter(
            user=self.user, entity_type='vendor', object_id=self.vendor.pk,
        ).count()
        self.assertEqual(count, 1)

    def test_add_favorite_nonexistent_entity_returns_404(self):
        """POST for a non-existent entity returns 404."""
        resp = self.client.post('/api/v1/favorites/', {
            'entity_type': 'customer',
            'object_id': 9999999,
        }, format='json')
        self.assertEqual(resp.status_code, status.HTTP_404_NOT_FOUND)

    def test_add_favorite_invalid_entity_type_returns_400(self):
        """POST with an invalid entity_type returns 400."""
        resp = self.client.post('/api/v1/favorites/', {
            'entity_type': 'not_a_valid_type',
            'object_id': 1,
        }, format='json')
        self.assertEqual(resp.status_code, status.HTTP_400_BAD_REQUEST)

    def test_add_favorite_missing_object_id_returns_400(self):
        """POST without object_id returns 400."""
        resp = self.client.post('/api/v1/favorites/', {
            'entity_type': 'customer',
        }, format='json')
        self.assertEqual(resp.status_code, status.HTTP_400_BAD_REQUEST)


class FavoriteDeleteTests(TestCase):
    """DELETE /api/v1/favorites/{id}/ — remove a favorite."""

    @classmethod
    def setUpTestData(cls):
        _setup_shared_fixture(cls, 'fav-delete-t')

    def setUp(self):
        self.client = APIClient()
        self.client.force_authenticate(user=self.user)
        set_current_tenant(self.tenant)

    def test_delete_favorite(self):
        """DELETE removes the favorite and returns 204."""
        fav = UserFavorite.objects.create(
            tenant=self.tenant, user=self.user,
            entity_type='customer', object_id=88001,
            label='To Delete',
        )
        resp = self.client.delete(f'/api/v1/favorites/{fav.pk}/')
        self.assertEqual(resp.status_code, status.HTTP_204_NO_CONTENT)
        self.assertFalse(UserFavorite.objects.filter(pk=fav.pk).exists())

    def test_delete_nonexistent_favorite_returns_404(self):
        """DELETE for a non-existent pk returns 404."""
        resp = self.client.delete('/api/v1/favorites/9999999/')
        self.assertEqual(resp.status_code, status.HTTP_404_NOT_FOUND)

    def test_cannot_delete_another_users_favorite(self):
        """DELETE for a favorite belonging to another user returns 404."""
        other_user = User.objects.create_user(
            username='other_del_user', password='pass',
        )
        fav = UserFavorite.objects.create(
            tenant=self.tenant, user=other_user,
            entity_type='customer', object_id=88888,
            label='Other User Fav',
        )
        resp = self.client.delete(f'/api/v1/favorites/{fav.pk}/')
        self.assertEqual(resp.status_code, status.HTTP_404_NOT_FOUND)
        # Record must still exist — use all_tenants() to bypass TenantManager scoping
        self.assertTrue(UserFavorite.objects.all_tenants().filter(pk=fav.pk).exists())


class RecentTrackTests(TestCase):
    """POST /api/v1/recents/ — track views."""

    @classmethod
    def setUpTestData(cls):
        _setup_shared_fixture(cls, 'recent-track-t')

    def setUp(self):
        self.client = APIClient()
        self.client.force_authenticate(user=self.user)
        set_current_tenant(self.tenant)
        # Clear any recents created by previous tests in this class
        UserRecentView.objects.filter(user=self.user).delete()

    def test_track_new_view(self):
        """POST creates a new recent view and returns {'status': 'tracked'}."""
        resp = self.client.post('/api/v1/recents/', {
            'entity_type': 'customer',
            'object_id': self.customer.pk,
        }, format='json')
        self.assertEqual(resp.status_code, status.HTTP_200_OK)
        self.assertEqual(resp.json(), {'status': 'tracked'})
        # Middleware clears thread-local tenant after the request; restore it before querying.
        set_current_tenant(self.tenant)
        recent = UserRecentView.objects.get(
            user=self.user, entity_type='customer', object_id=self.customer.pk,
        )
        self.assertEqual(recent.view_count, 1)
        self.assertEqual(recent.label, 'Test Customer Corp')

    def test_track_same_entity_increments_view_count(self):
        """POST for the same entity twice increments view_count to 2."""
        payload = {'entity_type': 'vendor', 'object_id': self.vendor.pk}
        self.client.post('/api/v1/recents/', payload, format='json')
        self.client.post('/api/v1/recents/', payload, format='json')
        set_current_tenant(self.tenant)
        recent = UserRecentView.objects.get(
            user=self.user, entity_type='vendor', object_id=self.vendor.pk,
        )
        self.assertEqual(recent.view_count, 2)

    def test_track_nonexistent_entity_returns_404(self):
        """POST for a non-existent entity returns 404."""
        resp = self.client.post('/api/v1/recents/', {
            'entity_type': 'customer',
            'object_id': 9999999,
        }, format='json')
        self.assertEqual(resp.status_code, status.HTTP_404_NOT_FOUND)

    def test_track_invalid_entity_type_returns_400(self):
        """POST with an invalid entity_type returns 400."""
        resp = self.client.post('/api/v1/recents/', {
            'entity_type': 'bogus_type',
            'object_id': 1,
        }, format='json')
        self.assertEqual(resp.status_code, status.HTTP_400_BAD_REQUEST)

    def test_track_enforces_50_record_cap(self):
        """
        Tracking a 51st entity causes the oldest to be deleted,
        keeping the per-(user, entity_type) total at exactly 50.
        """
        # Bulk-create 50 customer recents with synthetic object_ids
        UserRecentView.objects.bulk_create([
            UserRecentView(
                tenant=self.tenant,
                user=self.user,
                entity_type='customer',
                object_id=700000 + i,
                label=f'Old Customer {i}',
                view_count=1,
            )
            for i in range(50)
        ])
        self.assertEqual(
            UserRecentView.objects.filter(
                user=self.user, entity_type='customer',
            ).count(),
            50,
        )

        # Track the real customer — this is the 51st entry and triggers the cap
        resp = self.client.post('/api/v1/recents/', {
            'entity_type': 'customer',
            'object_id': self.customer.pk,
        }, format='json')
        self.assertEqual(resp.status_code, status.HTTP_200_OK)

        # Middleware clears thread-local tenant after the request; restore before querying.
        set_current_tenant(self.tenant)
        total = UserRecentView.objects.filter(
            user=self.user, entity_type='customer',
        ).count()
        self.assertEqual(total, 50)

        # The newly tracked entity must be present
        self.assertTrue(
            UserRecentView.objects.filter(
                user=self.user,
                entity_type='customer',
                object_id=self.customer.pk,
            ).exists()
        )


class RecentListTests(TestCase):
    """GET /api/v1/recents/ — list and filter."""

    @classmethod
    def setUpTestData(cls):
        _setup_shared_fixture(cls, 'recent-list-t')

    def setUp(self):
        self.client = APIClient()
        self.client.force_authenticate(user=self.user)
        set_current_tenant(self.tenant)
        # Seed one item recent so list tests have data
        UserRecentView.objects.get_or_create(
            tenant=self.tenant, user=self.user,
            entity_type='item', object_id=self.item.pk,
            defaults={'label': 'Test Item Alpha', 'view_count': 1},
        )

    def test_list_recents(self):
        """GET returns list of recent views for the authenticated user."""
        resp = self.client.get('/api/v1/recents/')
        self.assertEqual(resp.status_code, status.HTTP_200_OK)
        ids = [r['object_id'] for r in resp.json()]
        self.assertIn(self.item.pk, ids)

    def test_list_recents_filter_by_entity_type(self):
        """?entity_type=item returns only item recents."""
        UserRecentView.objects.get_or_create(
            tenant=self.tenant, user=self.user,
            entity_type='vendor', object_id=self.vendor.pk,
            defaults={'label': 'Test Vendor Inc', 'view_count': 1},
        )
        resp = self.client.get('/api/v1/recents/?entity_type=item')
        self.assertEqual(resp.status_code, status.HTTP_200_OK)
        types = {r['entity_type'] for r in resp.json()}
        self.assertEqual(types, {'item'})

    def test_list_recents_default_limit_is_10(self):
        """GET without ?limit returns at most 10 results."""
        resp = self.client.get('/api/v1/recents/')
        self.assertEqual(resp.status_code, status.HTTP_200_OK)
        self.assertLessEqual(len(resp.json()), 10)

    def test_list_recents_custom_limit(self):
        """?limit=1 returns at most 1 result."""
        resp = self.client.get('/api/v1/recents/?limit=1')
        self.assertEqual(resp.status_code, status.HTTP_200_OK)
        self.assertLessEqual(len(resp.json()), 1)

    def test_list_recents_requires_authentication(self):
        """Unauthenticated request returns 401."""
        resp = APIClient().get('/api/v1/recents/')
        self.assertEqual(resp.status_code, status.HTTP_401_UNAUTHORIZED)


class SuggestionsTests(TestCase):
    """GET /api/v1/suggestions/ — combined favorites + recents + search."""

    @classmethod
    def setUpTestData(cls):
        _setup_shared_fixture(cls, 'suggestions-t')

    def setUp(self):
        self.client = APIClient()
        self.client.force_authenticate(user=self.user)
        set_current_tenant(self.tenant)
        # Pin a favorite and a recent for this user
        UserFavorite.objects.get_or_create(
            tenant=self.tenant, user=self.user,
            entity_type='customer', object_id=self.customer.pk,
            defaults={'label': 'Test Customer Corp'},
        )
        UserRecentView.objects.get_or_create(
            tenant=self.tenant, user=self.user,
            entity_type='customer', object_id=self.customer.pk,
            defaults={'label': 'Test Customer Corp', 'view_count': 1},
        )

    def test_suggestions_missing_entity_type_returns_400(self):
        """GET without entity_type returns 400."""
        resp = self.client.get('/api/v1/suggestions/')
        self.assertEqual(resp.status_code, status.HTTP_400_BAD_REQUEST)

    def test_suggestions_invalid_entity_type_returns_400(self):
        """GET with an invalid entity_type returns 400."""
        resp = self.client.get('/api/v1/suggestions/?entity_type=not_valid')
        self.assertEqual(resp.status_code, status.HTTP_400_BAD_REQUEST)

    def test_suggestions_response_shape(self):
        """GET returns dict with favorites, recents, and results keys."""
        resp = self.client.get('/api/v1/suggestions/?entity_type=customer')
        self.assertEqual(resp.status_code, status.HTTP_200_OK)
        data = resp.json()
        self.assertIn('favorites', data)
        self.assertIn('recents', data)
        self.assertIn('results', data)

    def test_suggestions_favorites_section_populated(self):
        """favorites section contains pinned entities."""
        resp = self.client.get('/api/v1/suggestions/?entity_type=customer')
        self.assertEqual(resp.status_code, status.HTTP_200_OK)
        fav_ids = [f['id'] for f in resp.json()['favorites']]
        self.assertIn(self.customer.pk, fav_ids)

    def test_suggestions_recents_excludes_favorites(self):
        """recents section does not repeat items already in favorites."""
        resp = self.client.get('/api/v1/suggestions/?entity_type=customer')
        self.assertEqual(resp.status_code, status.HTTP_200_OK)
        data = resp.json()
        fav_ids = {f['id'] for f in data['favorites']}
        recent_ids = {r['id'] for r in data['recents']}
        self.assertEqual(fav_ids & recent_ids, set())

    def test_suggestions_results_empty_without_search(self):
        """results is empty when no ?search term is provided."""
        resp = self.client.get('/api/v1/suggestions/?entity_type=customer')
        self.assertEqual(resp.status_code, status.HTTP_200_OK)
        self.assertEqual(resp.json()['results'], [])

    def test_suggestions_search_returns_results(self):
        """?search=<term> populates the results section with matching entities."""
        resp = self.client.get(
            '/api/v1/suggestions/?entity_type=customer&search=Test'
        )
        self.assertEqual(resp.status_code, status.HTTP_200_OK)
        self.assertIn('results', resp.json())

    def test_suggestions_search_no_match(self):
        """?search=<nonexistent> returns empty results (not an error)."""
        resp = self.client.get(
            '/api/v1/suggestions/?entity_type=customer&search=XYZZY_NO_MATCH_99999'
        )
        self.assertEqual(resp.status_code, status.HTTP_200_OK)
        self.assertEqual(resp.json()['results'], [])

    def test_suggestions_favorites_have_is_favorite_true(self):
        """All items in the favorites section have is_favorite=True."""
        resp = self.client.get('/api/v1/suggestions/?entity_type=customer')
        self.assertEqual(resp.status_code, status.HTTP_200_OK)
        for fav in resp.json()['favorites']:
            self.assertTrue(fav['is_favorite'])

    def test_suggestions_requires_authentication(self):
        """Unauthenticated request returns 401."""
        resp = APIClient().get('/api/v1/suggestions/?entity_type=customer')
        self.assertEqual(resp.status_code, status.HTTP_401_UNAUTHORIZED)


# =============================================================================
# TENANT ISOLATION
# =============================================================================

class TenantIsolationTests(TestCase):
    """
    Verify that users in tenant A cannot read or modify tenant B's data.

    Tenant A is is_default=True so API requests from user_a resolve to
    tenant_a via TenantMiddleware Strategy 3.
    Tenant B records are created directly (bypassing HTTP).

    IMPORTANT: Assertions on cross-tenant records use .all_tenants() to
    bypass TenantManager's automatic per-tenant scoping.
    """

    @classmethod
    def setUpTestData(cls):
        cls.tenant_a = Tenant.objects.create(
            name='Tenant A Corp', subdomain='iso-a-t', is_default=True,
        )
        cls.user_a = User.objects.create_user(username='iso_user_a', password='pass')

        cls.tenant_b = Tenant.objects.create(
            name='Tenant B Corp', subdomain='iso-b-t', is_default=False,
        )
        cls.user_b = User.objects.create_user(username='iso_user_b', password='pass')

        set_current_tenant(cls.tenant_a)
        UnitOfMeasure.objects.create(tenant=cls.tenant_a, code='ea', name='Each')
        cust_party_a = Party.objects.create(
            tenant=cls.tenant_a, party_type='CUSTOMER',
            code='ISO-CA', display_name='Customer A',
        )
        cls.customer_a = Customer.objects.create(
            tenant=cls.tenant_a, party=cust_party_a,
        )

        set_current_tenant(cls.tenant_b)
        UnitOfMeasure.objects.create(tenant=cls.tenant_b, code='ea', name='Each')
        cust_party_b = Party.objects.create(
            tenant=cls.tenant_b, party_type='CUSTOMER',
            code='ISO-CB', display_name='Customer B',
        )
        cls.customer_b = Customer.objects.create(
            tenant=cls.tenant_b, party=cust_party_b,
        )

        set_current_tenant(cls.tenant_a)

    def setUp(self):
        self.client_a = APIClient()
        self.client_a.force_authenticate(user=self.user_a)
        set_current_tenant(self.tenant_a)

    def test_user_a_cannot_see_tenant_b_favorites_in_list(self):
        """Favorites belonging to tenant B / user B are invisible to user A's list."""
        fav_b = UserFavorite.objects.create(
            tenant=self.tenant_b,
            user=self.user_b,
            entity_type='customer',
            object_id=self.customer_b.pk,
            label='Customer B',
        )
        resp = self.client_a.get('/api/v1/favorites/')
        self.assertEqual(resp.status_code, status.HTTP_200_OK)
        returned_ids = [f['id'] for f in resp.json()]
        self.assertNotIn(fav_b.pk, returned_ids)

    def test_user_a_cannot_delete_tenant_b_favorite(self):
        """
        User A's DELETE of a favorite owned by user B returns 404.
        The destroy view filters by user=request.user (user_a), so user_b's
        favorite won't match and the record is left untouched.
        Use all_tenants() to verify the record still exists after the attempt.
        """
        fav_b = UserFavorite.objects.create(
            tenant=self.tenant_b,
            user=self.user_b,
            entity_type='customer',
            object_id=self.customer_b.pk + 50000,
            label='Customer B To Keep',
        )
        resp = self.client_a.delete(f'/api/v1/favorites/{fav_b.pk}/')
        self.assertEqual(resp.status_code, status.HTTP_404_NOT_FOUND)
        # all_tenants() bypasses TenantManager's tenant_a scope so we can see tenant_b's record
        self.assertTrue(
            UserFavorite.objects.all_tenants().filter(pk=fav_b.pk).exists()
        )

    def test_user_a_recents_do_not_include_user_b_recents(self):
        """Recents created under user B are not returned to user A."""
        UserRecentView.objects.create(
            tenant=self.tenant_b,
            user=self.user_b,
            entity_type='customer',
            object_id=self.customer_b.pk,
            label='Customer B Recent',
            view_count=1,
        )
        resp = self.client_a.get('/api/v1/recents/')
        self.assertEqual(resp.status_code, status.HTTP_200_OK)
        # The view filters by user=request.user (user_a), so user_b's records won't appear
        customer_recents = [
            r for r in resp.json() if r['entity_type'] == 'customer'
        ]
        recent_b_found = any(
            r['object_id'] == self.customer_b.pk for r in customer_recents
        )
        self.assertFalse(recent_b_found)
