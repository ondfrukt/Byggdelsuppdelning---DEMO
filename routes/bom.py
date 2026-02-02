from flask import Blueprint, request, jsonify
from models import db, BOM, Product, Component

bom_bp = Blueprint('bom', __name__)

@bom_bp.route('/products/<int:product_id>/bom', methods=['GET'])
def get_product_bom(product_id):
    """Get BOM (Bill of Materials) for a specific product"""
    try:
        product = Product.query.get(product_id)
        if not product:
            return jsonify({'error': 'Product not found'}), 404
        
        bom_items = BOM.query.filter_by(product_id=product_id).order_by(BOM.position).all()
        return jsonify([item.to_dict() for item in bom_items]), 200
    except Exception as e:
        return jsonify({'error': str(e)}), 500

@bom_bp.route('/products/<int:product_id>/bom', methods=['POST'])
def add_bom_item(product_id):
    """Add a component to a product's BOM"""
    try:
        product = Product.query.get(product_id)
        if not product:
            return jsonify({'error': 'Product not found'}), 404
        
        data = request.get_json()
        
        # Validate required fields
        if not data.get('component_id'):
            return jsonify({'error': 'Component ID is required'}), 400
        if not data.get('quantity'):
            return jsonify({'error': 'Quantity is required'}), 400
        
        component = Component.query.get(data['component_id'])
        if not component:
            return jsonify({'error': 'Component not found'}), 404
        
        # Check if component already exists in BOM
        existing = BOM.query.filter_by(
            product_id=product_id,
            component_id=data['component_id']
        ).first()
        if existing:
            return jsonify({'error': 'Component already exists in BOM'}), 400
        
        bom_item = BOM(
            product_id=product_id,
            component_id=data['component_id'],
            quantity=data['quantity'],
            position=data.get('position'),
            notes=data.get('notes', '')
        )
        
        db.session.add(bom_item)
        db.session.commit()
        
        return jsonify(bom_item.to_dict()), 201
    except Exception as e:
        db.session.rollback()
        return jsonify({'error': str(e)}), 500

@bom_bp.route('/bom/<int:bom_id>', methods=['PUT'])
def update_bom_item(bom_id):
    """Update a BOM item"""
    try:
        bom_item = BOM.query.get(bom_id)
        if not bom_item:
            return jsonify({'error': 'BOM item not found'}), 404
        
        data = request.get_json()
        
        # Update fields
        if 'quantity' in data:
            bom_item.quantity = data['quantity']
        if 'position' in data:
            bom_item.position = data['position']
        if 'notes' in data:
            bom_item.notes = data['notes']
        
        db.session.commit()
        
        return jsonify(bom_item.to_dict()), 200
    except Exception as e:
        db.session.rollback()
        return jsonify({'error': str(e)}), 500

@bom_bp.route('/bom/<int:bom_id>', methods=['DELETE'])
def delete_bom_item(bom_id):
    """Delete a BOM item"""
    try:
        bom_item = BOM.query.get(bom_id)
        if not bom_item:
            return jsonify({'error': 'BOM item not found'}), 404
        
        db.session.delete(bom_item)
        db.session.commit()
        
        return jsonify({'message': 'BOM item deleted successfully'}), 200
    except Exception as e:
        db.session.rollback()
        return jsonify({'error': str(e)}), 500
