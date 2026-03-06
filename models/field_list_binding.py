from datetime import datetime
from models import db


class FieldListBinding(db.Model):
    """Binds one object field to a managed list definition."""
    __tablename__ = 'field_list_bindings'

    id = db.Column(db.Integer, primary_key=True)
    object_type = db.Column(db.String(100), nullable=False)
    field_name = db.Column(db.String(100), nullable=False)
    list_id = db.Column(db.Integer, db.ForeignKey('managed_lists.id', ondelete='CASCADE'), nullable=False)
    selection_mode = db.Column(db.String(20), nullable=False, default='single')  # single|multi
    allow_only_leaf_selection = db.Column(db.Boolean, nullable=False, default=False)
    is_required = db.Column(db.Boolean, nullable=False, default=False)
    created_at = db.Column(db.DateTime, default=datetime.utcnow)
    updated_at = db.Column(db.DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    managed_list = db.relationship('ManagedList')

    __table_args__ = (
        db.UniqueConstraint('object_type', 'field_name', name='uix_field_list_bindings_object_type_field_name'),
    )

    def to_dict(self):
        return {
            'id': self.id,
            'object_type': self.object_type,
            'field_name': self.field_name,
            'list_id': self.list_id,
            'selection_mode': self.selection_mode,
            'allow_only_leaf_selection': bool(self.allow_only_leaf_selection),
            'is_required': bool(self.is_required),
            'created_at': self.created_at.isoformat() if self.created_at else None,
            'updated_at': self.updated_at.isoformat() if self.updated_at else None,
        }
