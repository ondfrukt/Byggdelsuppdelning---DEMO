from datetime import datetime
from models import db


class RelationTypeRule(db.Model):
    """Fixed relation rule per source/target object type pair."""
    __tablename__ = 'relation_type_rules'

    id = db.Column(db.Integer, primary_key=True)
    source_object_type_id = db.Column(
        db.Integer,
        db.ForeignKey('object_types.id', ondelete='CASCADE'),
        nullable=False
    )
    target_object_type_id = db.Column(
        db.Integer,
        db.ForeignKey('object_types.id', ondelete='CASCADE'),
        nullable=False
    )
    relation_type = db.Column(db.String(100), nullable=False)
    is_allowed = db.Column(db.Boolean, nullable=False, default=True)
    created_at = db.Column(db.DateTime, default=datetime.utcnow)
    updated_at = db.Column(db.DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    source_object_type = db.relationship('ObjectType', foreign_keys=[source_object_type_id])
    target_object_type = db.relationship('ObjectType', foreign_keys=[target_object_type_id])

    __table_args__ = (
        db.UniqueConstraint(
            'source_object_type_id',
            'target_object_type_id',
            name='uq_relation_type_rules_source_target'
        ),
        db.Index('idx_relation_type_rules_source_target', 'source_object_type_id', 'target_object_type_id'),
    )

    def to_dict(self):
        return {
            'id': self.id,
            'source_object_type_id': self.source_object_type_id,
            'target_object_type_id': self.target_object_type_id,
            'relation_type': self.relation_type,
            'is_allowed': bool(self.is_allowed),
            'created_at': self.created_at.isoformat() if self.created_at else None,
            'updated_at': self.updated_at.isoformat() if self.updated_at else None,
        }
