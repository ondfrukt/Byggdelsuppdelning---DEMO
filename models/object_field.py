from models import db
from datetime import datetime
from sqlalchemy import JSON
from sqlalchemy.dialects.postgresql import JSONB

JSON_TYPE = JSON().with_variant(JSONB, "postgresql")

class ObjectField(db.Model):
    """ObjectField model - defines metadata fields for object types"""
    __tablename__ = 'object_fields'
    
    id = db.Column(db.Integer, primary_key=True)
    object_type_id = db.Column(db.Integer, db.ForeignKey('object_types.id', ondelete='CASCADE'), nullable=False)
    field_name = db.Column(db.String(100), nullable=False)
    display_name = db.Column(db.String(200))
    field_type = db.Column(db.String(50), nullable=False)  # text, textarea, number, date, select, file, boolean
    field_options = db.Column(JSON_TYPE)  # JSONB on PostgreSQL, JSON elsewhere
    is_required = db.Column(db.Boolean, default=False)
    is_table_visible = db.Column(db.Boolean, nullable=False, default=True)
    help_text = db.Column(db.String(500))
    display_order = db.Column(db.Integer)
    created_at = db.Column(db.DateTime, default=datetime.utcnow)
    
    # Relationships
    object_type = db.relationship('ObjectType', back_populates='fields')
    object_data = db.relationship('ObjectData', back_populates='field', cascade='all, delete-orphan')
    
    def to_dict(self):
        return {
            'id': self.id,
            'object_type_id': self.object_type_id,
            'field_name': self.field_name,
            'display_name': self.display_name,
            'field_type': self.field_type,
            'field_options': self.field_options,
            'is_required': self.is_required,
            'is_table_visible': self.is_table_visible,
            'help_text': self.help_text,
            'display_order': self.display_order,
            'created_at': self.created_at.isoformat() if self.created_at else None
        }
