from datetime import datetime
from sqlalchemy import JSON
from sqlalchemy.dialects.postgresql import JSONB
from models import db

JSON_TYPE = JSON().with_variant(JSONB, "postgresql")


class ManagedList(db.Model):
    """Admin-managed reusable list definition."""
    __tablename__ = 'managed_lists'

    id = db.Column(db.Integer, primary_key=True)
    code = db.Column(db.String(100), unique=True)
    name = db.Column(db.String(120), nullable=False, unique=True)
    description = db.Column(db.String(255))
    allow_multiselect = db.Column(db.Boolean, nullable=False, default=False)
    language_codes = db.Column(JSON_TYPE)
    additional_language_code = db.Column(db.String(10), nullable=False, default='fi')
    is_active = db.Column(db.Boolean, nullable=False, default=True)
    created_at = db.Column(db.DateTime, default=datetime.utcnow)
    updated_at = db.Column(db.DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    items = db.relationship(
        'ManagedListItem',
        back_populates='managed_list',
        cascade='all, delete-orphan',
        order_by='ManagedListItem.sort_order.asc()'
    )
    parent_links = db.relationship(
        'ManagedListLink',
        foreign_keys='ManagedListLink.child_list_id',
        back_populates='child_list'
    )
    child_links = db.relationship(
        'ManagedListLink',
        foreign_keys='ManagedListLink.parent_list_id',
        back_populates='parent_list'
    )

    def to_dict(self, include_items=False, include_inactive_items=False, locale=None, include_links=False):
        normalized_codes = [
            str(code or '').strip().lower()
            for code in (self.language_codes or [])
            if str(code or '').strip()
        ]
        if not normalized_codes:
            normalized_codes = ['en']

        fallback_language = normalized_codes[0]

        additional_language = self.additional_language_code or 'fi'
        if len(normalized_codes) >= 2:
            additional_language = normalized_codes[1]
        else:
            additional_language = fallback_language

        payload = {
            'id': self.id,
            'code': self.code,
            'name': self.name,
            'description': self.description,
            'allow_multiselect': bool(self.allow_multiselect),
            'language_codes': normalized_codes,
            'fallback_language_code': fallback_language,
            'additional_language_code': additional_language,
            'is_active': self.is_active,
            'created_at': self.created_at.isoformat() if self.created_at else None,
            'updated_at': self.updated_at.isoformat() if self.updated_at else None,
        }

        if include_items:
            items = self.items or []
            if not include_inactive_items:
                items = [item for item in items if item.is_active]
            payload['items'] = [
                item.to_dict(
                    locale=locale,
                    fallback_language_code=fallback_language
                )
                for item in items
            ]

        if include_links:
            payload['parent_links'] = [
                link.to_dict()
                for link in (self.parent_links or [])
                if link.is_active
            ]
            payload['child_links'] = [
                link.to_dict()
                for link in (self.child_links or [])
                if link.is_active
            ]

        return payload
