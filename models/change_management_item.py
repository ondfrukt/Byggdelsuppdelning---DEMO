from datetime import datetime
from models import db


class ChangeManagementItem(db.Model):
    """Change management object (CRQ, CO, RO)."""
    __tablename__ = 'change_management_items'

    id = db.Column(db.Integer, primary_key=True)
    item_type = db.Column(db.String(16), nullable=False)
    title = db.Column(db.String(255), nullable=False)
    description = db.Column(db.Text)
    status = db.Column(db.String(50), nullable=False, default='Open')
    created_at = db.Column(db.DateTime, default=datetime.utcnow)
    updated_at = db.Column(db.DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)
    impacts = db.relationship(
        'ChangeManagementImpact',
        back_populates='change_item',
        cascade='all, delete-orphan'
    )

    @property
    def display_id(self):
        return f"{self.item_type}-{self.id}"

    def to_dict(self):
        return {
            'id': self.id,
            'display_id': self.display_id,
            'type': self.item_type,
            'title': self.title,
            'description': self.description,
            'status': self.status,
            'created_at': self.created_at.isoformat() if self.created_at else None,
            'updated_at': self.updated_at.isoformat() if self.updated_at else None,
        }
