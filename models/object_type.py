from models import db
from datetime import datetime

class ObjectType(db.Model):
    """ObjectType model - represents types of objects in the system"""
    __tablename__ = 'object_types'
    
    id = db.Column(db.Integer, primary_key=True)
    name = db.Column(db.String(100), unique=True, nullable=False)
    description = db.Column(db.Text)
    icon = db.Column(db.String(50))
    id_prefix = db.Column(db.String(10))
    created_at = db.Column(db.DateTime, default=datetime.utcnow)
    is_system = db.Column(db.Boolean, default=False)
    
    # Relationships
    fields = db.relationship('ObjectField', back_populates='object_type', cascade='all, delete-orphan')
    objects = db.relationship('Object', back_populates='object_type')
    
    def to_dict(self, include_fields=False):
        result = {
            'id': self.id,
            'name': self.name,
            'description': self.description,
            'icon': self.icon,
            'id_prefix': self.id_prefix,
            'created_at': self.created_at.isoformat() if self.created_at else None,
            'is_system': self.is_system
        }
        if include_fields:
            result['fields'] = [field.to_dict() for field in sorted(self.fields, key=lambda f: f.display_order or 999)]
        return result
