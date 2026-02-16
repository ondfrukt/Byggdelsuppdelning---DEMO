from models import db
from datetime import datetime
from sqlalchemy import JSON
from sqlalchemy.dialects.postgresql import JSONB
from decimal import Decimal

JSON_TYPE = JSON().with_variant(JSONB, "postgresql")

class ObjectData(db.Model):
    """ObjectData model - stores flexible metadata for objects"""
    __tablename__ = 'object_data'
    
    id = db.Column(db.Integer, primary_key=True)
    object_id = db.Column(db.Integer, db.ForeignKey('objects.id', ondelete='CASCADE'), nullable=False)
    field_id = db.Column(db.Integer, db.ForeignKey('object_fields.id', ondelete='CASCADE'), nullable=False)
    value_text = db.Column(db.Text)
    value_number = db.Column(db.Numeric(15, 4))
    value_date = db.Column(db.Date)
    value_boolean = db.Column(db.Boolean)
    value_json = db.Column(JSON_TYPE)
    created_at = db.Column(db.DateTime, default=datetime.utcnow)
    updated_at = db.Column(db.DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)
    
    # Relationships
    object = db.relationship('Object', back_populates='object_data')
    field = db.relationship('ObjectField', back_populates='object_data')
    
    # Unique constraint
    __table_args__ = (
        db.UniqueConstraint('object_id', 'field_id', name='uix_object_field'),
    )
    
    def to_dict(self):
        return {
            'id': self.id,
            'object_id': self.object_id,
            'field_id': self.field_id,
            'field_name': self.field.field_name if self.field else None,
            'value_text': self.value_text,
            'value_number': float(self.value_number) if self.value_number is not None else None,
            'value_date': self.value_date.isoformat() if self.value_date else None,
            'value_boolean': self.value_boolean,
            'value_json': self.value_json,
            'created_at': self.created_at.isoformat() if self.created_at else None,
            'updated_at': self.updated_at.isoformat() if self.updated_at else None
        }
