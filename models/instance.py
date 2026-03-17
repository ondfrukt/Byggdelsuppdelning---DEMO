from datetime import datetime
from sqlalchemy import JSON
from sqlalchemy.dialects.postgresql import JSONB

from models import db

JSON_TYPE = JSON().with_variant(JSONB, "postgresql")


class Instance(db.Model):
    """Structural parent/child relation used for build-up and composition."""
    __tablename__ = 'instances'

    id = db.Column(db.Integer, primary_key=True)
    parent_object_id = db.Column(db.Integer, db.ForeignKey('objects.id', ondelete='CASCADE'), nullable=False)
    child_object_id = db.Column(db.Integer, db.ForeignKey('objects.id', ondelete='CASCADE'), nullable=False)
    instance_type = db.Column(db.String(100), nullable=False)
    quantity = db.Column(db.Float)
    unit = db.Column(db.String(50))
    formula = db.Column(db.String(255))
    role = db.Column(db.String(100))
    position = db.Column(db.String(100))
    waste_factor = db.Column(db.Float)
    installation_sequence = db.Column(db.Integer)
    optional = db.Column(db.Boolean, nullable=False, default=False)
    metadata_json = db.Column(JSON_TYPE)
    created_at = db.Column(db.DateTime, default=datetime.utcnow)
    updated_at = db.Column(db.DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    parent_object = db.relationship('Object', foreign_keys=[parent_object_id], back_populates='child_instances')
    child_object = db.relationship('Object', foreign_keys=[child_object_id], back_populates='parent_instances')

    __table_args__ = (
        db.Index('idx_instances_parent', 'parent_object_id'),
        db.Index('idx_instances_child', 'child_object_id'),
        db.Index('idx_instances_type', 'instance_type'),
    )

    def to_dict(self, include_objects=True):
        payload = {
            'id': self.id,
            'parent_object_id': self.parent_object_id,
            'child_object_id': self.child_object_id,
            'instance_type': self.instance_type,
            'quantity': self.quantity,
            'unit': self.unit,
            'formula': self.formula,
            'role': self.role,
            'position': self.position,
            'waste_factor': self.waste_factor,
            'installation_sequence': self.installation_sequence,
            'optional': bool(self.optional),
            'metadata_json': self.metadata_json,
            'created_at': self.created_at.isoformat() if self.created_at else None,
            'updated_at': self.updated_at.isoformat() if self.updated_at else None,
        }

        if include_objects:
            payload['parent_object'] = self.parent_object.to_dict(include_data=True) if self.parent_object else None
            payload['child_object'] = self.child_object.to_dict(include_data=True) if self.child_object else None

        return payload
