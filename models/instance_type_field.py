from datetime import datetime

from models import db


class InstanceTypeField(db.Model):
    """Binds field templates to a structural instance type key."""
    __tablename__ = 'instance_type_fields'

    id = db.Column(db.Integer, primary_key=True)
    instance_type_key = db.Column(db.String(120), nullable=False, index=True)
    field_template_id = db.Column(
        db.Integer,
        db.ForeignKey('field_templates.id', ondelete='CASCADE'),
        nullable=False,
        index=True
    )
    display_order = db.Column(db.Integer, nullable=False, default=0)
    is_required = db.Column(db.Boolean, nullable=False, default=False)
    created_at = db.Column(db.DateTime, default=datetime.utcnow)
    updated_at = db.Column(db.DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    field_template = db.relationship('FieldTemplate')

    __table_args__ = (
        db.UniqueConstraint('instance_type_key', 'field_template_id', name='uq_instance_type_field_key_template'),
        db.Index('idx_instance_type_fields_order', 'instance_type_key', 'display_order'),
    )

    def to_dict(self, include_template=True):
        payload = {
            'id': self.id,
            'instance_type_key': self.instance_type_key,
            'field_template_id': self.field_template_id,
            'display_order': int(self.display_order or 0),
            'is_required': bool(self.is_required),
            'created_at': self.created_at.isoformat() if self.created_at else None,
            'updated_at': self.updated_at.isoformat() if self.updated_at else None,
        }
        if include_template:
            payload['field_template'] = self.field_template.to_dict() if self.field_template else None
        return payload
