from models import db
from datetime import datetime
from sqlalchemy import text
import re

_BASE_ID_PATTERN = re.compile(r'^[A-Za-z0-9_]+-(\d+)(?:\..*)?$')

class ObjectType(db.Model):
    """ObjectType model - represents types of objects in the system"""
    __tablename__ = 'object_types'
    
    id = db.Column(db.Integer, primary_key=True)
    name = db.Column(db.String(100), unique=True, nullable=False)
    description = db.Column(db.Text)
    icon = db.Column(db.String(50))
    id_prefix = db.Column(db.String(10))
    color = db.Column(db.String(7))
    created_at = db.Column(db.DateTime, default=datetime.utcnow)
    is_system = db.Column(db.Boolean, default=False)
    
    # Relationships
    fields = db.relationship('ObjectField', back_populates='object_type', cascade='all, delete-orphan')
    objects = db.relationship('Object', back_populates='object_type')

    def _calculate_next_base_id_number(self):
        if not hasattr(self, '_next_id_cache'):
            rows = db.session.execute(
                text("SELECT main_id FROM objects WHERE object_type_id = :type_id"),
                {'type_id': self.id}
            ).fetchall()
            max_num = 0
            for (main_id,) in rows:
                m = _BASE_ID_PATTERN.match(main_id or '')
                if m:
                    max_num = max(max_num, int(m.group(1)))
            self._next_id_cache = max_num + 1
        return self._next_id_cache
    
    def to_dict(self, include_fields=False):
        result = {
            'id': self.id,
            'name': self.name,
            'description': self.description,
            'icon': self.icon,
            'id_prefix': self.id_prefix,
            'next_base_id_number': self._calculate_next_base_id_number(),
            'color': self.color,
            'created_at': self.created_at.isoformat() if self.created_at else None,
            'is_system': self.is_system
        }
        if include_fields:
            result['fields'] = [field.to_dict() for field in sorted(self.fields, key=lambda f: f.display_order or 999)]
        return result
