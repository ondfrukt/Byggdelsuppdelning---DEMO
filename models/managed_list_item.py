from datetime import datetime
from models import db


class ManagedListItem(db.Model):
    """Admin-managed reusable list row/value."""
    __tablename__ = 'managed_list_items'

    id = db.Column(db.Integer, primary_key=True)
    list_id = db.Column(db.Integer, db.ForeignKey('managed_lists.id', ondelete='CASCADE'), nullable=False)
    value = db.Column(db.String(255), nullable=False)
    sort_order = db.Column(db.Integer, nullable=False, default=0)
    is_active = db.Column(db.Boolean, nullable=False, default=True)
    created_at = db.Column(db.DateTime, default=datetime.utcnow)
    updated_at = db.Column(db.DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    managed_list = db.relationship('ManagedList', back_populates='items')

    def to_dict(self):
        return {
            'id': self.id,
            'list_id': self.list_id,
            'value': self.value,
            'sort_order': self.sort_order,
            'is_active': self.is_active,
            'created_at': self.created_at.isoformat() if self.created_at else None,
            'updated_at': self.updated_at.isoformat() if self.updated_at else None,
        }
