from datetime import datetime
from sqlalchemy import JSON
from sqlalchemy.dialects.postgresql import JSONB
from models import db

JSON_TYPE = JSON().with_variant(JSONB, "postgresql")


class ManagedListItem(db.Model):
    """Admin-managed reusable list row/value."""
    __tablename__ = 'managed_list_items'

    id = db.Column(db.Integer, primary_key=True)
    list_id = db.Column(db.Integer, db.ForeignKey('managed_lists.id', ondelete='CASCADE'), nullable=False)
    value = db.Column(db.String(255), nullable=False)
    value_translations = db.Column(JSON_TYPE)
    sort_order = db.Column(db.Integer, nullable=False, default=0)
    is_active = db.Column(db.Boolean, nullable=False, default=True)
    created_at = db.Column(db.DateTime, default=datetime.utcnow)
    updated_at = db.Column(db.DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    managed_list = db.relationship('ManagedList', back_populates='items')

    def resolve_display_value(self, locale=None, fallback_language_code=None):
        translations = self.value_translations or {}
        requested_locale = str(locale or '').strip().lower()
        fallback_locale = str(fallback_language_code or '').strip().lower()

        candidates = []
        if requested_locale:
            candidates.append(requested_locale)
            if '-' in requested_locale:
                candidates.append(requested_locale.split('-', 1)[0])
            if '_' in requested_locale:
                candidates.append(requested_locale.split('_', 1)[0])
        if fallback_locale:
            candidates.append(fallback_locale)
        candidates.append('en')

        seen = set()
        for key in candidates:
            locale_key = str(key or '').strip().lower()
            if not locale_key or locale_key in seen:
                continue
            seen.add(locale_key)
            value = str(translations.get(locale_key) or '').strip()
            if value:
                return value

        fallback = str(self.value or '').strip()
        return fallback

    def to_dict(self, locale=None, fallback_language_code=None):
        return {
            'id': self.id,
            'list_id': self.list_id,
            'value': self.value,
            'display_value': self.resolve_display_value(locale=locale, fallback_language_code=fallback_language_code),
            'value_translations': self.value_translations or {},
            'sort_order': self.sort_order,
            'is_active': self.is_active,
            'created_at': self.created_at.isoformat() if self.created_at else None,
            'updated_at': self.updated_at.isoformat() if self.updated_at else None,
        }
