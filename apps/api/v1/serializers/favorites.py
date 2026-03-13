# apps/api/v1/serializers/favorites.py
"""
Serializers for the Favorites & Recents feature.
"""
from rest_framework import serializers
from apps.favorites.models import UserFavorite, UserRecentView, ENTITY_TYPE_VALUES


class UserFavoriteSerializer(serializers.ModelSerializer):
    class Meta:
        model = UserFavorite
        fields = ['id', 'entity_type', 'object_id', 'label', 'created_at']
        read_only_fields = ['id', 'label', 'created_at']


class UserRecentViewSerializer(serializers.ModelSerializer):
    class Meta:
        model = UserRecentView
        fields = ['id', 'entity_type', 'object_id', 'label', 'view_count', 'last_viewed_at']
        read_only_fields = ['id', 'label', 'view_count', 'last_viewed_at']


class AddFavoriteSerializer(serializers.Serializer):
    entity_type = serializers.ChoiceField(choices=ENTITY_TYPE_VALUES)
    object_id = serializers.IntegerField(min_value=1)


class TrackViewSerializer(serializers.Serializer):
    entity_type = serializers.ChoiceField(choices=ENTITY_TYPE_VALUES)
    object_id = serializers.IntegerField(min_value=1)


class SuggestionItemSerializer(serializers.Serializer):
    id = serializers.IntegerField()
    label = serializers.CharField()
    is_favorite = serializers.BooleanField(default=False)
