from flask import Blueprint, request, jsonify
from models import db, ProductRelation, Product

relations_bp = Blueprint('relations', __name__)

@relations_bp.route('/products/<int:product_id>/relations', methods=['GET'])
def get_product_relations(product_id):
    """Get all relations for a specific product"""
    try:
        product = Product.query.get(product_id)
        if not product:
            return jsonify({'error': 'Product not found'}), 404
        
        # Get relations where this product is the parent
        parent_relations = ProductRelation.query.filter_by(parent_product_id=product_id).all()
        
        # Get relations where this product is the child
        child_relations = ProductRelation.query.filter_by(child_product_id=product_id).all()
        
        return jsonify({
            'as_parent': [rel.to_dict() for rel in parent_relations],
            'as_child': [
                {
                    'id': rel.id,
                    'parent_product_id': rel.parent_product_id,
                    'parent_product': rel.parent_product.to_dict() if rel.parent_product else None,
                    'child_product_id': rel.child_product_id,
                    'relation_type': rel.relation_type,
                    'description': rel.description,
                    'created_at': rel.created_at.isoformat() if rel.created_at else None
                }
                for rel in child_relations
            ]
        }), 200
    except Exception as e:
        return jsonify({'error': str(e)}), 500

@relations_bp.route('/products/<int:product_id>/relations', methods=['POST'])
def create_product_relation(product_id):
    """Create a new product relation"""
    try:
        product = Product.query.get(product_id)
        if not product:
            return jsonify({'error': 'Product not found'}), 404
        
        data = request.get_json()
        
        # Validate required fields
        if not data.get('child_product_id'):
            return jsonify({'error': 'Child product ID is required'}), 400
        if not data.get('relation_type'):
            return jsonify({'error': 'Relation type is required'}), 400
        
        # Validate relation type
        valid_types = ['består_av', 'variant_av', 'ersätter', 'ersätts_av']
        if data['relation_type'] not in valid_types:
            return jsonify({'error': f'Invalid relation type. Must be one of: {", ".join(valid_types)}'}), 400
        
        # Check if child product exists
        child_product = Product.query.get(data['child_product_id'])
        if not child_product:
            return jsonify({'error': 'Child product not found'}), 404
        
        # Check if relation already exists
        existing = ProductRelation.query.filter_by(
            parent_product_id=product_id,
            child_product_id=data['child_product_id'],
            relation_type=data['relation_type']
        ).first()
        if existing:
            return jsonify({'error': 'Relation already exists'}), 400
        
        relation = ProductRelation(
            parent_product_id=product_id,
            child_product_id=data['child_product_id'],
            relation_type=data['relation_type'],
            description=data.get('description', '')
        )
        
        db.session.add(relation)
        db.session.commit()
        
        return jsonify(relation.to_dict()), 201
    except Exception as e:
        db.session.rollback()
        return jsonify({'error': str(e)}), 500

@relations_bp.route('/relations/<int:relation_id>', methods=['DELETE'])
def delete_relation(relation_id):
    """Delete a product relation"""
    try:
        relation = ProductRelation.query.get(relation_id)
        if not relation:
            return jsonify({'error': 'Relation not found'}), 404
        
        db.session.delete(relation)
        db.session.commit()
        
        return jsonify({'message': 'Relation deleted successfully'}), 200
    except Exception as e:
        db.session.rollback()
        return jsonify({'error': str(e)}), 500
