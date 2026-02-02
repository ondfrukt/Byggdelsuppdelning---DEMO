from flask import Blueprint, request, jsonify
from models import db, Component

components_bp = Blueprint('components', __name__)

@components_bp.route('/components', methods=['GET'])
def get_components():
    """Get all components with optional filtering"""
    try:
        component_type = request.args.get('type')
        search = request.args.get('search', '').lower()
        
        query = Component.query
        
        if component_type:
            query = query.filter_by(type=component_type)
        
        if search:
            query = query.filter(
                db.or_(
                    Component.name.ilike(f'%{search}%'),
                    Component.specifications.ilike(f'%{search}%')
                )
            )
        
        components = query.order_by(Component.name).all()
        return jsonify([component.to_dict() for component in components]), 200
    except Exception as e:
        return jsonify({'error': str(e)}), 500

@components_bp.route('/components/<int:component_id>', methods=['GET'])
def get_component(component_id):
    """Get a specific component by ID"""
    try:
        component = Component.query.get(component_id)
        if not component:
            return jsonify({'error': 'Component not found'}), 404
        
        # Include usage information
        component_dict = component.to_dict()
        component_dict['used_in_products'] = [
            {'product_id': bom.product_id, 'product_name': bom.product.name, 'quantity': float(bom.quantity)}
            for bom in component.bom_items
        ]
        
        return jsonify(component_dict), 200
    except Exception as e:
        return jsonify({'error': str(e)}), 500

@components_bp.route('/components', methods=['POST'])
def create_component():
    """Create a new component"""
    try:
        data = request.get_json()
        
        # Validate required fields
        if not data.get('name'):
            return jsonify({'error': 'Name is required'}), 400
        
        component = Component(
            name=data['name'],
            type=data.get('type', ''),
            specifications=data.get('specifications', ''),
            unit=data.get('unit', 'st')
        )
        
        db.session.add(component)
        db.session.commit()
        
        return jsonify(component.to_dict()), 201
    except Exception as e:
        db.session.rollback()
        return jsonify({'error': str(e)}), 500

@components_bp.route('/components/<int:component_id>', methods=['PUT'])
def update_component(component_id):
    """Update an existing component"""
    try:
        component = Component.query.get(component_id)
        if not component:
            return jsonify({'error': 'Component not found'}), 404
        
        data = request.get_json()
        
        # Update fields
        if 'name' in data:
            component.name = data['name']
        if 'type' in data:
            component.type = data['type']
        if 'specifications' in data:
            component.specifications = data['specifications']
        if 'unit' in data:
            component.unit = data['unit']
        
        db.session.commit()
        
        return jsonify(component.to_dict()), 200
    except Exception as e:
        db.session.rollback()
        return jsonify({'error': str(e)}), 500

@components_bp.route('/components/<int:component_id>', methods=['DELETE'])
def delete_component(component_id):
    """Delete a component"""
    try:
        component = Component.query.get(component_id)
        if not component:
            return jsonify({'error': 'Component not found'}), 404
        
        # Check if component is used in any BOMs
        if component.bom_items:
            return jsonify({
                'error': f'Component is used in {len(component.bom_items)} product(s) and cannot be deleted'
            }), 400
        
        db.session.delete(component)
        db.session.commit()
        
        return jsonify({'message': 'Component deleted successfully'}), 200
    except Exception as e:
        db.session.rollback()
        return jsonify({'error': str(e)}), 500
