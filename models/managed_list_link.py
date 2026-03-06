from datetime import datetime
from models import db


class ManagedListLink(db.Model):
    """Directed allowed relationship between two managed lists."""
    __tablename__ = 'managed_list_links'

    id = db.Column(db.Integer, primary_key=True)
    parent_list_id = db.Column(db.Integer, db.ForeignKey('managed_lists.id', ondelete='CASCADE'), nullable=False)
    child_list_id = db.Column(db.Integer, db.ForeignKey('managed_lists.id', ondelete='CASCADE'), nullable=False)
    relation_key = db.Column(db.String(64), nullable=False, default='depends_on')
    is_active = db.Column(db.Boolean, nullable=False, default=True)
    created_at = db.Column(db.DateTime, default=datetime.utcnow)
    updated_at = db.Column(db.DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    parent_list = db.relationship('ManagedList', foreign_keys=[parent_list_id], back_populates='child_links')
    child_list = db.relationship('ManagedList', foreign_keys=[child_list_id], back_populates='parent_links')

    item_links = db.relationship(
        'ManagedListItemLink',
        back_populates='list_link',
        cascade='all, delete-orphan'
    )

    def to_dict(self):
        return {
            'id': self.id,
            'parent_list_id': self.parent_list_id,
            'child_list_id': self.child_list_id,
            'relation_key': self.relation_key,
            'is_active': self.is_active,
            'created_at': self.created_at.isoformat() if self.created_at else None,
            'updated_at': self.updated_at.isoformat() if self.updated_at else None,
        }
