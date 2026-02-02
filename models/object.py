from models import db
from datetime import datetime

class Object(db.Model):
    """Object model - represents all objects of all types"""
    __tablename__ = 'objects'
    
    id = db.Column(db.Integer, primary_key=True)
    object_type_id = db.Column(db.Integer, db.ForeignKey('object_types.id', ondelete='RESTRICT'), nullable=False)
    auto_id = db.Column(db.String(50), unique=True, nullable=False)
    created_at = db.Column(db.DateTime, default=datetime.utcnow)
    updated_at = db.Column(db.DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)
    created_by = db.Column(db.String(100))
    
    # Relationships
    object_type = db.relationship('ObjectType', back_populates='objects')
    object_data = db.relationship('ObjectData', back_populates='object', cascade='all, delete-orphan')
    source_relations = db.relationship('ObjectRelation', foreign_keys='ObjectRelation.source_object_id',
                                      back_populates='source_object', cascade='all, delete-orphan')
    target_relations = db.relationship('ObjectRelation', foreign_keys='ObjectRelation.target_object_id',
                                      back_populates='target_object', cascade='all, delete-orphan')
    documents = db.relationship('Document', back_populates='object', cascade='all, delete-orphan')
    
    @property
    def data(self):
        """Get object data as a dictionary"""
        data = {}
        for od in self.object_data:
            if od.field:
                field_type = od.field.field_type
                if field_type == 'number':
                    data[od.field.field_name] = float(od.value_number) if od.value_number is not None else None
                elif field_type == 'date':
                    data[od.field.field_name] = od.value_date.isoformat() if od.value_date else None
                elif field_type == 'boolean':
                    data[od.field.field_name] = od.value_boolean
                else:
                    data[od.field.field_name] = od.value_text
        return data
    
    def to_dict(self, include_data=True, include_relations=False, include_documents=False):
        result = {
            'id': self.id,
            'auto_id': self.auto_id,
            'object_type': self.object_type.to_dict() if self.object_type else None,
            'created_at': self.created_at.isoformat() if self.created_at else None,
            'updated_at': self.updated_at.isoformat() if self.updated_at else None,
            'created_by': self.created_by
        }
        
        if include_data:
            result['data'] = self.data
        
        if include_relations:
            relations = {}
            for rel in self.source_relations:
                if rel.relation_type not in relations:
                    relations[rel.relation_type] = []
                relations[rel.relation_type].append({
                    'id': rel.id,
                    'target': rel.target_object.to_dict(include_data=True, include_relations=False) if rel.target_object else None,
                    'description': rel.description,
                    'metadata': rel.relation_metadata
                })
            result['relations'] = relations
        
        if include_documents:
            result['documents'] = [doc.to_dict() for doc in self.documents]
        
        return result
