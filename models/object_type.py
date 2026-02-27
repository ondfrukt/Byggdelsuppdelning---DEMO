from models import db
from datetime import datetime
import re

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

    def _calculate_next_auto_id_number(self):
        max_number = 0
        pattern = re.compile(r'^[A-Za-z0-9_]+-(\d+)$')
        for obj in self.objects:
            candidate = str(obj.auto_id or '').strip().split('.')[0]
            match = pattern.match(candidate)
            if not match:
                continue
            number = int(match.group(1))
            if number > max_number:
                max_number = number
        return max_number + 1
    
    def to_dict(self, include_fields=False):
        result = {
            'id': self.id,
            'name': self.name,
            'description': self.description,
            'icon': self.icon,
            'id_prefix': self.id_prefix,
            'auto_id_next_number': self._calculate_next_auto_id_number(),
            'color': self.color,
            'created_at': self.created_at.isoformat() if self.created_at else None,
            'is_system': self.is_system
        }
        if include_fields:
            result['fields'] = [field.to_dict() for field in sorted(self.fields, key=lambda f: f.display_order or 999)]
        return result
