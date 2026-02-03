from models import db
from datetime import datetime

class ViewConfiguration(db.Model):
    """ViewConfiguration model - stores display configuration for tree view and list view per object type"""
    __tablename__ = 'view_configurations'
    
    id = db.Column(db.Integer, primary_key=True)
    object_type_id = db.Column(db.Integer, db.ForeignKey('object_types.id', ondelete='CASCADE'), nullable=False)
    tree_view_name_field = db.Column(db.String(100))  # Field name to display in tree view name column
    
    # List view configuration
    visible_columns = db.Column(db.JSON)  # Array of column configs: [{field_name, visible, width}]
    column_order = db.Column(db.JSON)  # Array of field names in display order
    column_widths = db.Column(db.JSON)  # Object mapping field_name to width in pixels
    
    created_at = db.Column(db.DateTime, default=datetime.utcnow)
    updated_at = db.Column(db.DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)
    
    # Relationships
    # Note: Using singular 'view_configuration' for backref since the unique constraint
    # ensures only one configuration exists per object type
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
            'visible_columns': self.visible_columns,
            'column_order': self.column_order,
            'column_widths': self.column_widths,
            'created_at': self.created_at.isoformat() if self.created_at else None,
            'updated_at': self.updated_at.isoformat() if self.updated_at else None
        }
