from datetime import datetime
from models import db


class ObjectCategoryAssignment(db.Model):
    """Links an Object to a CategoryNode (classified_as relation)."""

    __tablename__ = 'object_category_assignments'

    id               = db.Column(db.Integer, primary_key=True)
    object_id        = db.Column(db.Integer, db.ForeignKey('objects.id', ondelete='CASCADE'), nullable=False)
    category_node_id = db.Column(db.Integer, db.ForeignKey('category_nodes.id', ondelete='CASCADE'), nullable=False)
    is_primary       = db.Column(db.Boolean, nullable=False, default=True)
    created_at       = db.Column(db.DateTime, default=datetime.utcnow)

    object        = db.relationship('Object', backref=db.backref('category_assignments', lazy='dynamic'))
    category_node = db.relationship('CategoryNode', backref=db.backref('object_assignments', lazy='dynamic'))

    __table_args__ = (
        db.UniqueConstraint('object_id', 'category_node_id', name='uq_obj_cat_assignment'),
        db.Index('idx_obj_cat_assign_object', 'object_id'),
        db.Index('idx_obj_cat_assign_node', 'category_node_id'),
    )

    def to_dict(self):
        return {
            'id':               self.id,
            'object_id':        self.object_id,
            'category_node_id': self.category_node_id,
            'is_primary':       self.is_primary,
            'created_at':       self.created_at.isoformat() if self.created_at else None,
        }
