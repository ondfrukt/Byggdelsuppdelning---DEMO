from datetime import datetime
from models import db


class ObjectFieldOverride(db.Model):
    """Object-level overrides for field behavior."""
    __tablename__ = 'object_field_overrides'

    id = db.Column(db.Integer, primary_key=True)
    object_id = db.Column(db.Integer, db.ForeignKey('objects.id', ondelete='CASCADE'), nullable=False)
    field_id = db.Column(db.Integer, db.ForeignKey('object_fields.id', ondelete='CASCADE'), nullable=False)
    is_required_override = db.Column(db.Boolean, nullable=True)
    created_at = db.Column(db.DateTime, default=datetime.utcnow)
    updated_at = db.Column(db.DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    object = db.relationship('Object')
    field = db.relationship('ObjectField', back_populates='overrides')

    __table_args__ = (
        db.UniqueConstraint('object_id', 'field_id', name='uix_object_field_override'),
        db.Index('idx_object_field_overrides_object', 'object_id'),
        db.Index('idx_object_field_overrides_field', 'field_id'),
    )

    def to_dict(self):
        return {
            'id': self.id,
            'object_id': self.object_id,
            'field_id': self.field_id,
            'is_required_override': self.is_required_override,
            'created_at': self.created_at.isoformat() if self.created_at else None,
            'updated_at': self.updated_at.isoformat() if self.updated_at else None,
        }
