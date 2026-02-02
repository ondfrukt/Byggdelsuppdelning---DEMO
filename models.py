from flask_sqlalchemy import SQLAlchemy
from datetime import datetime

db = SQLAlchemy()

class Product(db.Model):
    """Product model - represents a product in the PLM system"""
    __tablename__ = 'products'
    
    id = db.Column(db.Integer, primary_key=True)
    name = db.Column(db.String(200), nullable=False)
    article_number = db.Column(db.String(50), unique=True, nullable=False)
    version = db.Column(db.String(20), default='1.0')
    status = db.Column(db.String(50), default='Koncept')  # Koncept, Under utveckling, Godkänd, Obsolete
    description = db.Column(db.Text)
    created_at = db.Column(db.DateTime, default=datetime.utcnow)
    updated_at = db.Column(db.DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)
    
    # Relationships
    bom_items = db.relationship('BOM', back_populates='product', cascade='all, delete-orphan')
    parent_relations = db.relationship('ProductRelation', foreign_keys='ProductRelation.parent_product_id', 
                                      back_populates='parent_product', cascade='all, delete-orphan')
    child_relations = db.relationship('ProductRelation', foreign_keys='ProductRelation.child_product_id', 
                                     back_populates='child_product', cascade='all, delete-orphan')
    
    def to_dict(self):
        return {
            'id': self.id,
            'name': self.name,
            'article_number': self.article_number,
            'version': self.version,
            'status': self.status,
            'description': self.description,
            'created_at': self.created_at.isoformat() if self.created_at else None,
            'updated_at': self.updated_at.isoformat() if self.updated_at else None
        }

class Component(db.Model):
    """Component model - represents a component that can be used in products"""
    __tablename__ = 'components'
    
    id = db.Column(db.Integer, primary_key=True)
    name = db.Column(db.String(200), nullable=False)
    type = db.Column(db.String(100))  # Mekanik, Elektronik, Programvara, Material
    specifications = db.Column(db.Text)
    unit = db.Column(db.String(20), default='st')  # st, kg, meter, liter
    created_at = db.Column(db.DateTime, default=datetime.utcnow)
    
    # Relationships
    bom_items = db.relationship('BOM', back_populates='component', cascade='all, delete-orphan')
    
    def to_dict(self):
        return {
            'id': self.id,
            'name': self.name,
            'type': self.type,
            'specifications': self.specifications,
            'unit': self.unit,
            'created_at': self.created_at.isoformat() if self.created_at else None
        }

class BOM(db.Model):
    """BOM (Bill of Materials) model - links products to components with quantities"""
    __tablename__ = 'bom'
    
    id = db.Column(db.Integer, primary_key=True)
    product_id = db.Column(db.Integer, db.ForeignKey('products.id', ondelete='CASCADE'), nullable=False)
    component_id = db.Column(db.Integer, db.ForeignKey('components.id', ondelete='CASCADE'), nullable=False)
    quantity = db.Column(db.Numeric(10, 2), nullable=False)
    position = db.Column(db.Integer)
    notes = db.Column(db.Text)
    created_at = db.Column(db.DateTime, default=datetime.utcnow)
    
    # Relationships
    product = db.relationship('Product', back_populates='bom_items')
    component = db.relationship('Component', back_populates='bom_items')
    
    def to_dict(self):
        return {
            'id': self.id,
            'product_id': self.product_id,
            'component_id': self.component_id,
            'component': self.component.to_dict() if self.component else None,
            'quantity': float(self.quantity),
            'position': self.position,
            'notes': self.notes,
            'created_at': self.created_at.isoformat() if self.created_at else None
        }

class ProductRelation(db.Model):
    """ProductRelation model - represents relationships between products"""
    __tablename__ = 'product_relations'
    
    id = db.Column(db.Integer, primary_key=True)
    parent_product_id = db.Column(db.Integer, db.ForeignKey('products.id', ondelete='CASCADE'), nullable=False)
    child_product_id = db.Column(db.Integer, db.ForeignKey('products.id', ondelete='CASCADE'), nullable=False)
    relation_type = db.Column(db.String(50), nullable=False)  # består_av, variant_av, ersätter, ersätts_av
    description = db.Column(db.Text)
    created_at = db.Column(db.DateTime, default=datetime.utcnow)
    
    # Relationships
    parent_product = db.relationship('Product', foreign_keys=[parent_product_id], back_populates='parent_relations')
    child_product = db.relationship('Product', foreign_keys=[child_product_id], back_populates='child_relations')
    
    def to_dict(self):
        return {
            'id': self.id,
            'parent_product_id': self.parent_product_id,
            'child_product_id': self.child_product_id,
            'child_product': self.child_product.to_dict() if self.child_product else None,
            'relation_type': self.relation_type,
            'description': self.description,
            'created_at': self.created_at.isoformat() if self.created_at else None
        }
