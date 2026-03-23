from datetime import datetime
from models import db


class ClassificationSystem(db.Model):
    """A named classification system (e.g. 'Internt', 'BSAB 96', 'Uniclass 2015')."""

    __tablename__ = 'classification_systems'

    id          = db.Column(db.Integer, primary_key=True)
    name        = db.Column(db.String(150), nullable=False)
    description = db.Column(db.Text)
    version     = db.Column(db.String(50))
    is_active   = db.Column(db.Boolean, nullable=False, default=True)
    created_at  = db.Column(db.DateTime, default=datetime.utcnow)
    updated_at  = db.Column(db.DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    nodes = db.relationship('CategoryNode', back_populates='system', cascade='all, delete-orphan')

    def to_dict(self, include_node_count=False):
        result = {
            'id':          self.id,
            'name':        self.name,
            'description': self.description,
            'version':     self.version,
            'is_active':   self.is_active,
            'created_at':  self.created_at.isoformat() if self.created_at else None,
            'updated_at':  self.updated_at.isoformat() if self.updated_at else None,
        }
        if include_node_count:
            result['root_node_count'] = sum(1 for n in self.nodes if n.parent_id is None)
        return result
