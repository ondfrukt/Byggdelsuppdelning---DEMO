from models import db
from datetime import datetime

class ViewConfiguration(db.Model):
    """ViewConfiguration model - stores display configuration for tree view per object type"""
    __tablename__ = 'view_configurations'
    
    id = db.Column(db.Integer, primary_key=True)
    object_type_id = db.Column(db.Integer, db.ForeignKey('object_types.id', ondelete='CASCADE'), nullable=False)
    tree_view_name_field = db.Column(db.String(100))  # Field name to display in tree view name column
    created_at = db.Column(db.DateTime, default=datetime.utcnow)
    updated_at = db.Column(db.DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)
    
    # Relationships
    object_type = db.relationship('ObjectType', backref='view_configuration')
    
    # Unique constraint: one configuration per object type
    __table_args__ = (
        db.UniqueConstraint('object_type_id', name='uq_view_config_object_type'),
    )
    
    def to_dict(self):
        return {
            'id': self.id,
            'object_type_id': self.object_type_id,
            'object_type_name': self.object_type.name if self.object_type else None,
            'tree_view_name_field': self.tree_view_name_field,
            'created_at': self.created_at.isoformat() if self.created_at else None,
            'updated_at': self.updated_at.isoformat() if self.updated_at else None
        }
