from datetime import datetime
from models import db


class ManagedList(db.Model):
    """Admin-managed reusable list definition."""
    __tablename__ = 'managed_lists'

    id = db.Column(db.Integer, primary_key=True)
    name = db.Column(db.String(120), nullable=False, unique=True)
    description = db.Column(db.String(255))
    is_active = db.Column(db.Boolean, nullable=False, default=True)
    created_at = db.Column(db.DateTime, default=datetime.utcnow)
    updated_at = db.Column(db.DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    items = db.relationship(
        'ManagedListItem',
        back_populates='managed_list',
        cascade='all, delete-orphan',
        order_by='ManagedListItem.sort_order.asc()'
    )

    def to_dict(self, include_items=False, include_inactive_items=False):
        payload = {
            'id': self.id,
            'name': self.name,
            'description': self.description,
            'is_active': self.is_active,
            'created_at': self.created_at.isoformat() if self.created_at else None,
            'updated_at': self.updated_at.isoformat() if self.updated_at else None,
        }

        if include_items:
            items = self.items or []
            if not include_inactive_items:
                items = [item for item in items if item.is_active]
            payload['items'] = [item.to_dict() for item in items]

        return payload
