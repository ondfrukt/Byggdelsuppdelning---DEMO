from models import db
from datetime import datetime
from sqlalchemy.dialects.postgresql import JSONB

class ObjectRelation(db.Model):
    """ObjectRelation model - represents relationships between objects"""
    __tablename__ = 'object_relations'
    
    id = db.Column(db.Integer, primary_key=True)
    source_object_id = db.Column(db.Integer, db.ForeignKey('objects.id', ondelete='CASCADE'), nullable=False)
    target_object_id = db.Column(db.Integer, db.ForeignKey('objects.id', ondelete='CASCADE'), nullable=False)
    relation_type = db.Column(db.String(100), nullable=False)
    description = db.Column(db.Text)
    metadata = db.Column(JSONB)
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
            'relation_type': self.relation_type,
            'description': self.description,
            'metadata': self.metadata,
            'created_at': self.created_at.isoformat() if self.created_at else None
        }
        
        if include_objects:
            result['source_object'] = self.source_object.to_dict(include_data=True) if self.source_object else None
            result['target_object'] = self.target_object.to_dict(include_data=True) if self.target_object else None
        
        return result
