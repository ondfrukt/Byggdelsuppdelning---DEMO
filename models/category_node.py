from datetime import datetime
from models import db

VALID_LEVELS = (1, 2, 3)


class CategoryNode(db.Model):
    """A node in a hierarchical classification tree (max 3 levels)."""

    __tablename__ = 'category_nodes'

    id             = db.Column(db.Integer, primary_key=True)
    system_id      = db.Column(db.Integer, db.ForeignKey('classification_systems.id', ondelete='CASCADE'), nullable=False)
    parent_id      = db.Column(db.Integer, db.ForeignKey('category_nodes.id', ondelete='CASCADE'), nullable=True)
    code           = db.Column(db.String(50), nullable=True)
    name           = db.Column(db.String(200), nullable=False)
    level          = db.Column(db.Integer, nullable=False)  # 1, 2 or 3
    description    = db.Column(db.Text)
    sort_order     = db.Column(db.Integer, default=0, nullable=False)
    is_active      = db.Column(db.Boolean, nullable=False, default=True)
    created_at     = db.Column(db.DateTime, default=datetime.utcnow)
    updated_at     = db.Column(db.DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    system   = db.relationship('ClassificationSystem', back_populates='nodes')
    parent   = db.relationship('CategoryNode', remote_side='CategoryNode.id', back_populates='children')
    children = db.relationship(
        'CategoryNode',
        back_populates='parent',
        cascade='all, delete-orphan',
        order_by='CategoryNode.sort_order, CategoryNode.code',
    )

    __table_args__ = (
        db.UniqueConstraint('system_id', 'code', name='uq_category_node_system_code'),
        db.Index('idx_category_nodes_system', 'system_id'),
        db.Index('idx_category_nodes_parent', 'parent_id'),
        db.Index('idx_category_nodes_level', 'level'),
    )

    def validate(self):
        """Return list of validation error strings, empty if valid."""
        errors = []
        if self.level not in VALID_LEVELS:
            errors.append(f'level must be one of {VALID_LEVELS}, got {self.level}')
        if self.level == 1 and self.parent_id is not None:
            errors.append('parent_id must be NULL for level-1 nodes')
        if self.level in (2, 3) and self.parent_id is None:
            errors.append(f'parent_id is required for level-{self.level} nodes')
        return errors

    def to_dict(self, include_children=False):
        result = {
            'id':             self.id,
            'system_id':      self.system_id,
            'parent_id':      self.parent_id,
            'code':           self.code,
            'name':           self.name,
            'level':          self.level,
            'description':    self.description,
            'sort_order':     self.sort_order,
            'is_active':      self.is_active,
            'created_at':     self.created_at.isoformat() if self.created_at else None,
            'updated_at':     self.updated_at.isoformat() if self.updated_at else None,
        }
        if include_children:
            result['children'] = [c.to_dict(include_children=True) for c in self.children]
        return result

    def get_ancestors(self):
        """Return list of ancestor nodes from root down to (but not including) self."""
        ancestors = []
        node = self.parent
        while node:
            ancestors.append(node)
            node = node.parent
        ancestors.reverse()
        return ancestors

    def get_descendant_ids(self):
        """Return set of all descendant node IDs (recursive)."""
        ids = set()
        stack = list(self.children)
        while stack:
            child = stack.pop()
            ids.add(child.id)
            stack.extend(child.children)
        return ids
