from datetime import datetime
from models import db


class ChangeManagementImpact(db.Model):
    """Link between a change-management item and affected objects."""
    __tablename__ = 'change_management_impacts'

    id = db.Column(db.Integer, primary_key=True)
    change_item_id = db.Column(
        db.Integer,
        db.ForeignKey('change_management_items.id', ondelete='CASCADE'),
        nullable=False
    )
    object_id = db.Column(
        db.Integer,
        db.ForeignKey('objects.id', ondelete='CASCADE'),
        nullable=False
    )
    impact_action = db.Column(db.String(40), nullable=False, default='to_be_replaced')
    created_at = db.Column(db.DateTime, default=datetime.utcnow)
    updated_at = db.Column(db.DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    change_item = db.relationship('ChangeManagementItem', back_populates='impacts')
    object = db.relationship('Object')

    __table_args__ = (
        db.UniqueConstraint('change_item_id', 'object_id', name='uq_change_item_object'),
    )

    def to_dict(self):
        return {
            'id': self.id,
            'change_item_id': self.change_item_id,
            'object_id': self.object_id,
            'impact_action': self.impact_action,
            'object': self.object.to_dict(include_data=True) if self.object else None,
            'created_at': self.created_at.isoformat() if self.created_at else None,
            'updated_at': self.updated_at.isoformat() if self.updated_at else None,
        }
