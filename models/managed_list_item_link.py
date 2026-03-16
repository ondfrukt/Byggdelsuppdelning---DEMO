from datetime import datetime
from models import db


class ManagedListItemLink(db.Model):
    """Directed allowed relationship between two managed list items."""
    __tablename__ = 'managed_list_item_links'

    id = db.Column(db.Integer, primary_key=True)
    list_link_id = db.Column(db.Integer, db.ForeignKey('managed_list_links.id', ondelete='CASCADE'), nullable=False)
    parent_item_id = db.Column(db.Integer, db.ForeignKey('managed_list_items.id', ondelete='CASCADE'), nullable=False)
    child_item_id = db.Column(db.Integer, db.ForeignKey('managed_list_items.id', ondelete='CASCADE'), nullable=False)
    is_active = db.Column(db.Boolean, nullable=False, default=True)
    created_at = db.Column(db.DateTime, default=datetime.utcnow)
    updated_at = db.Column(db.DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    list_link = db.relationship('ManagedListLink', back_populates='item_links')
    parent_item = db.relationship('ManagedListItem', foreign_keys=[parent_item_id], back_populates='child_item_links')
    child_item = db.relationship('ManagedListItem', foreign_keys=[child_item_id], back_populates='parent_item_links')

    def to_dict(self):
        return {
            'id': self.id,
            'list_link_id': self.list_link_id,
            'parent_item_id': self.parent_item_id,
            'child_item_id': self.child_item_id,
            'is_active': self.is_active,
            'created_at': self.created_at.isoformat() if self.created_at else None,
            'updated_at': self.updated_at.isoformat() if self.updated_at else None,
        }
