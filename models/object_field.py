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
    field_template_id = db.Column(db.Integer, db.ForeignKey('field_templates.id', ondelete='SET NULL'), nullable=True)
    field_name = db.Column(db.String(100), nullable=False)
    display_name = db.Column(db.String(200))
    field_type = db.Column(db.String(50), nullable=False)  # text, textarea, number, date, select, file, boolean
    field_options = db.Column(JSON_TYPE)  # JSONB on PostgreSQL, JSON elsewhere
    is_required = db.Column(db.Boolean, default=False)
    lock_required_setting = db.Column(db.Boolean, nullable=False, default=False)
    force_presence_on_all_objects = db.Column(db.Boolean, nullable=False, default=False)
    is_table_visible = db.Column(db.Boolean, nullable=False, default=True)
    help_text = db.Column(db.String(500))
    display_order = db.Column(db.Integer)
    detail_width = db.Column(db.String(10))
    created_at = db.Column(db.DateTime, default=datetime.utcnow)
    
    # Relationships
    object_type = db.relationship('ObjectType', back_populates='fields')
    field_template = db.relationship('FieldTemplate')
    object_data = db.relationship('ObjectData', back_populates='field', cascade='all, delete-orphan')
    overrides = db.relationship('ObjectFieldOverride', back_populates='field', cascade='all, delete-orphan')
    
    def to_dict(self):
        return {
            'id': self.id,
            'object_type_id': self.object_type_id,
            'field_template_id': self.field_template_id,
            'field_template_name': self.field_template.template_name if self.field_template else None,
            'field_name': self.field_name,
            'display_name': self.display_name,
            'field_type': self.field_type,
            'field_options': self.field_options,
            'is_required': self.is_required,
            'lock_required_setting': bool(self.lock_required_setting),
            'force_presence_on_all_objects': bool(self.force_presence_on_all_objects),
            'is_table_visible': self.is_table_visible,
            'help_text': self.help_text,
            'display_order': self.display_order,
            'detail_width': self.detail_width,
            'created_at': self.created_at.isoformat() if self.created_at else None
        }
