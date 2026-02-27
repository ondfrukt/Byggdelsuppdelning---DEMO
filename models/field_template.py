from datetime import datetime
from sqlalchemy import JSON
from sqlalchemy.dialects.postgresql import JSONB
from models import db

JSON_TYPE = JSON().with_variant(JSONB, "postgresql")


class FieldTemplate(db.Model):
    """Reusable field template that can be applied to multiple object types."""
    __tablename__ = 'field_templates'

    id = db.Column(db.Integer, primary_key=True)
    template_name = db.Column(db.String(150), nullable=False, unique=True, index=True)
    field_name = db.Column(db.String(100), nullable=False)
    display_name = db.Column(db.String(200))
    display_name_translations = db.Column(JSON_TYPE)
    field_type = db.Column(db.String(50), nullable=False)
    field_options = db.Column(JSON_TYPE)
    is_required = db.Column(db.Boolean, default=False)
    lock_required_setting = db.Column(db.Boolean, nullable=False, default=False)
    force_presence_on_all_objects = db.Column(db.Boolean, nullable=False, default=False)
    is_table_visible = db.Column(db.Boolean, nullable=False, default=True)
    help_text = db.Column(db.String(500))
    help_text_translations = db.Column(JSON_TYPE)
    is_active = db.Column(db.Boolean, nullable=False, default=True)
    created_at = db.Column(db.DateTime, default=datetime.utcnow)
    updated_at = db.Column(db.DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    def to_dict(self):
        return {
            'id': self.id,
            'template_name': self.template_name,
            'field_name': self.field_name,
            'display_name': self.display_name,
            'display_name_translations': self.display_name_translations or {},
            'field_type': self.field_type,
            'field_options': self.field_options,
            'is_required': bool(self.is_required),
            'lock_required_setting': bool(self.lock_required_setting),
            'force_presence_on_all_objects': bool(self.force_presence_on_all_objects),
            'is_table_visible': bool(self.is_table_visible),
            'help_text': self.help_text,
            'help_text_translations': self.help_text_translations or {},
            'is_active': bool(self.is_active),
            'created_at': self.created_at.isoformat() if self.created_at else None,
            'updated_at': self.updated_at.isoformat() if self.updated_at else None,
        }
