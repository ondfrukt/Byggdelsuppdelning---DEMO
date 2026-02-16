from models import db
from datetime import datetime
from sqlalchemy import JSON
from sqlalchemy.dialects.postgresql import JSONB

JSON_TYPE = JSON().with_variant(JSONB, "postgresql")

class ObjectRelation(db.Model):
    """ObjectRelation model - represents relationships between objects"""
    __tablename__ = 'object_relations'
    
    id = db.Column(db.Integer, primary_key=True)
    source_object_id = db.Column(db.Integer, db.ForeignKey('objects.id', ondelete='CASCADE'), nullable=False)
    target_object_id = db.Column(db.Integer, db.ForeignKey('objects.id', ondelete='CASCADE'), nullable=False)
    relation_type = db.Column(db.String(100), nullable=False)
    description = db.Column(db.Text)
    relation_metadata = db.Column(JSON_TYPE)  # JSONB on PostgreSQL, JSON elsewhere
    created_at = db.Column(db.DateTime, default=datetime.utcnow)
    
    # Relationships
    source_object = db.relationship('Object', foreign_keys=[source_object_id], back_populates='source_relations')
    target_object = db.relationship('Object', foreign_keys=[target_object_id], back_populates='target_relations')
    
    # Indexes
    __table_args__ = (
        db.Index('idx_source_object_id', 'source_object_id'),
        db.Index('idx_target_object_id', 'target_object_id'),
        db.Index('idx_relation_type', 'relation_type'),
    )
    
    def to_dict(self, include_objects=True):
        result = {
            'id': self.id,
            'source_object_id': self.source_object_id,
            'target_object_id': self.target_object_id,
            # Standardized relation entity aliases
            'objectA_id': self.source_object_id,
            'objectA_type': self.source_object.object_type.name if self.source_object and self.source_object.object_type else None,
            'objectB_id': self.target_object_id,
            'objectB_type': self.target_object.object_type.name if self.target_object and self.target_object.object_type else None,
            'relation_type': self.relation_type,
            'description': self.description,
            'metadata': self.relation_metadata,  # Return as 'metadata' in API
            'created_at': self.created_at.isoformat() if self.created_at else None
        }
        
        if include_objects:
            result['source_object'] = self.source_object.to_dict(include_data=True) if self.source_object else None
            result['target_object'] = self.target_object.to_dict(include_data=True) if self.target_object else None
        
        return result
