from models import db

CARDINALITY_VALUES = ('one_to_one', 'one_to_many', 'many_to_one', 'many_to_many')


class RelationType(db.Model):
    """Defines available relation types and their semantics."""
    __tablename__ = 'relation_types'

    id = db.Column(db.Integer, primary_key=True)
    key = db.Column(db.String(100), nullable=False, unique=True, index=True)
    display_name = db.Column(db.String(150), nullable=False)
    description = db.Column(db.Text)

    source_object_type_id = db.Column(db.Integer, db.ForeignKey('object_types.id', ondelete='SET NULL'), nullable=True)
    target_object_type_id = db.Column(db.Integer, db.ForeignKey('object_types.id', ondelete='SET NULL'), nullable=True)

    cardinality = db.Column(
        db.Enum(*CARDINALITY_VALUES, name='relation_cardinality_enum', native_enum=False),
        nullable=False,
        default='many_to_many'
    )
    is_directed = db.Column(db.Boolean, nullable=False, default=True)
    is_composition = db.Column(db.Boolean, nullable=False, default=False)

    inverse_relation_type_id = db.Column(db.Integer, db.ForeignKey('relation_types.id', ondelete='SET NULL'), nullable=True)

    source_object_type = db.relationship('ObjectType', foreign_keys=[source_object_type_id])
    target_object_type = db.relationship('ObjectType', foreign_keys=[target_object_type_id])
    inverse_relation_type = db.relationship('RelationType', remote_side=[id], uselist=False)

    __table_args__ = (
        db.Index('idx_relation_types_source_target', 'source_object_type_id', 'target_object_type_id'),
    )

    def to_dict(self):
        return {
            'id': self.id,
            'key': self.key,
            'display_name': self.display_name,
            'description': self.description,
            'source_object_type_id': self.source_object_type_id,
            'target_object_type_id': self.target_object_type_id,
            'cardinality': self.cardinality,
            'is_directed': bool(self.is_directed),
            'is_composition': bool(self.is_composition),
            'inverse_relation_type_id': self.inverse_relation_type_id,
        }
