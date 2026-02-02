from flask import Blueprint, request, jsonify
from models import db, ObjectType, ObjectField
import logging

logger = logging.getLogger(__name__)
bp = Blueprint('object_types', __name__, url_prefix='/api/object-types')


@bp.route('', methods=['GET'])
def list_object_types():
    """List all object types"""
    try:
        include_fields = request.args.get('include_fields', 'false').lower() == 'true'
        object_types = ObjectType.query.all()
        return jsonify([ot.to_dict(include_fields=include_fields) for ot in object_types]), 200
    except Exception as e:
        logger.error(f"Error listing object types: {str(e)}")
        return jsonify({'error': 'Failed to list object types'}), 500


@bp.route('/<int:id>', methods=['GET'])
def get_object_type(id):
    """Get a specific object type with its fields"""
    try:
        object_type = ObjectType.query.get_or_404(id)
        return jsonify(object_type.to_dict(include_fields=True)), 200
    except Exception as e:
        logger.error(f"Error getting object type: {str(e)}")
        return jsonify({'error': 'Failed to get object type'}), 500


@bp.route('', methods=['POST'])
def create_object_type():
    """Create a new object type"""
    try:
        data = request.get_json()
        
        # Validate required fields
        if not data.get('name'):
            return jsonify({'error': 'Name is required'}), 400
        
        # Check if name already exists
        existing = ObjectType.query.filter_by(name=data['name']).first()
        if existing:
            return jsonify({'error': 'Object type with this name already exists'}), 400
        
        # Create object type
        object_type = ObjectType(
            name=data['name'],
            description=data.get('description'),
            icon=data.get('icon'),
            id_prefix=data.get('id_prefix'),
            is_system=False  # User-created types are never system types
        )
        
        db.session.add(object_type)
        db.session.commit()
        
        logger.info(f"Created object type: {object_type.name}")
        return jsonify(object_type.to_dict(include_fields=True)), 201
    except Exception as e:
        db.session.rollback()
        logger.error(f"Error creating object type: {str(e)}")
        return jsonify({'error': 'Failed to create object type'}), 500


@bp.route('/<int:id>', methods=['PUT'])
def update_object_type(id):
    """Update an object type"""
    try:
        object_type = ObjectType.query.get_or_404(id)
        data = request.get_json()
        
        # Update fields
        if 'name' in data and data['name'] != object_type.name:
            # Check if new name already exists
            existing = ObjectType.query.filter_by(name=data['name']).first()
            if existing:
                return jsonify({'error': 'Object type with this name already exists'}), 400
            object_type.name = data['name']
        
        if 'description' in data:
            object_type.description = data['description']
        
        if 'icon' in data:
            object_type.icon = data['icon']
        
        if 'id_prefix' in data:
            object_type.id_prefix = data['id_prefix']
        
        db.session.commit()
        
        logger.info(f"Updated object type: {object_type.name}")
        return jsonify(object_type.to_dict(include_fields=True)), 200
    except Exception as e:
        db.session.rollback()
        logger.error(f"Error updating object type: {str(e)}")
        return jsonify({'error': 'Failed to update object type'}), 500


@bp.route('/<int:id>', methods=['DELETE'])
def delete_object_type(id):
    """Delete an object type (only non-system types)"""
    try:
        object_type = ObjectType.query.get_or_404(id)
        
        # Check if it's a system type
        if object_type.is_system:
            return jsonify({'error': 'Cannot delete system object types'}), 403
        
        # Check if there are objects of this type
        if len(object_type.objects) > 0:
            return jsonify({'error': 'Cannot delete object type that has objects'}), 400
        
        db.session.delete(object_type)
        db.session.commit()
        
        logger.info(f"Deleted object type: {object_type.name}")
        return jsonify({'message': 'Object type deleted successfully'}), 200
    except Exception as e:
        db.session.rollback()
        logger.error(f"Error deleting object type: {str(e)}")
        return jsonify({'error': 'Failed to delete object type'}), 500


@bp.route('/<int:id>/fields', methods=['GET'])
def list_fields(id):
    """List all fields for an object type"""
    try:
        object_type = ObjectType.query.get_or_404(id)
        fields = sorted(object_type.fields, key=lambda f: f.display_order or 999)
        return jsonify([field.to_dict() for field in fields]), 200
    except Exception as e:
        logger.error(f"Error listing fields: {str(e)}")
        return jsonify({'error': 'Failed to list fields'}), 500


@bp.route('/<int:id>/fields', methods=['POST'])
def add_field(id):
    """Add a field to an object type"""
    try:
        object_type = ObjectType.query.get_or_404(id)
        data = request.get_json()
        
        # Validate required fields
        if not data.get('field_name') or not data.get('field_type'):
            return jsonify({'error': 'field_name and field_type are required'}), 400
        
        # Check if field name already exists for this type
        existing = ObjectField.query.filter_by(
            object_type_id=id,
            field_name=data['field_name']
        ).first()
        if existing:
            return jsonify({'error': 'Field with this name already exists for this object type'}), 400
        
        # Create field
        field = ObjectField(
            object_type_id=id,
            field_name=data['field_name'],
            display_name=data.get('display_name'),
            field_type=data['field_type'],
            field_options=data.get('field_options'),
            is_required=data.get('is_required', False),
            help_text=data.get('help_text'),
            display_order=data.get('display_order')
        )
        
        db.session.add(field)
        db.session.commit()
        
        logger.info(f"Added field {field.field_name} to object type {object_type.name}")
        return jsonify(field.to_dict()), 201
    except Exception as e:
        db.session.rollback()
        logger.error(f"Error adding field: {str(e)}")
        return jsonify({'error': 'Failed to add field'}), 500


@bp.route('/<int:type_id>/fields/<int:field_id>', methods=['PUT'])
def update_field_with_type(type_id, field_id):
    """Update a field (with type_id in path for compatibility)"""
    try:
        # Verify the object type exists
        object_type = ObjectType.query.get_or_404(type_id)
        
        field = ObjectField.query.get_or_404(field_id)
        
        # Verify the field belongs to this object type
        if field.object_type_id != type_id:
            return jsonify({'error': 'Field does not belong to this object type'}), 400
        
        data = request.get_json()
        
        # Update field properties
        if 'field_name' in data:
            # Check if new name already exists for this type
            existing = ObjectField.query.filter(
                ObjectField.object_type_id == field.object_type_id,
                ObjectField.field_name == data['field_name'],
                ObjectField.id != field_id
            ).first()
            if existing:
                return jsonify({'error': 'Field with this name already exists for this object type'}), 400
            field.field_name = data['field_name']
        
        if 'display_name' in data:
            field.display_name = data['display_name']
        
        if 'field_type' in data:
            field.field_type = data['field_type']
        
        if 'field_options' in data:
            field.field_options = data['field_options']
        
        if 'is_required' in data:
            field.is_required = data['is_required']
        
        if 'help_text' in data:
            field.help_text = data['help_text']
        
        if 'display_order' in data:
            field.display_order = data['display_order']
        
        db.session.commit()
        
        logger.info(f"Updated field {field.field_name} for object type {object_type.name}")
        return jsonify(field.to_dict()), 200
    except Exception as e:
        db.session.rollback()
        logger.error(f"Error updating field: {str(e)}")
        return jsonify({'error': 'Failed to update field'}), 500


@bp.route('/fields/<int:field_id>', methods=['PUT'])
def update_field(field_id):
    """Update a field (legacy route without type_id)"""
    try:
        field = ObjectField.query.get_or_404(field_id)
        data = request.get_json()
        
        # Update field properties
        if 'field_name' in data:
            # Check if new name already exists for this type
            existing = ObjectField.query.filter(
                ObjectField.object_type_id == field.object_type_id,
                ObjectField.field_name == data['field_name'],
                ObjectField.id != field_id
            ).first()
            if existing:
                return jsonify({'error': 'Field with this name already exists for this object type'}), 400
            field.field_name = data['field_name']
        
        if 'display_name' in data:
            field.display_name = data['display_name']
        
        if 'field_type' in data:
            field.field_type = data['field_type']
        
        if 'field_options' in data:
            field.field_options = data['field_options']
        
        if 'is_required' in data:
            field.is_required = data['is_required']
        
        if 'help_text' in data:
            field.help_text = data['help_text']
        
        if 'display_order' in data:
            field.display_order = data['display_order']
        
        db.session.commit()
        
        logger.info(f"Updated field {field.field_name}")
        return jsonify(field.to_dict()), 200
    except Exception as e:
        db.session.rollback()
        logger.error(f"Error updating field: {str(e)}")
        return jsonify({'error': 'Failed to update field'}), 500


@bp.route('/<int:type_id>/fields/<int:field_id>', methods=['DELETE'])
def delete_field_with_type(type_id, field_id):
    """Delete a field (with type_id in path for compatibility)"""
    try:
        # Verify the object type exists
        object_type = ObjectType.query.get_or_404(type_id)
        
        field = ObjectField.query.get_or_404(field_id)
        
        # Verify the field belongs to this object type
        if field.object_type_id != type_id:
            return jsonify({'error': 'Field does not belong to this object type'}), 400
        
        # Check if there are object data entries using this field
        if len(field.object_data) > 0:
            return jsonify({'error': 'Cannot delete field that has data'}), 400
        
        db.session.delete(field)
        db.session.commit()
        
        logger.info(f"Deleted field {field.field_name} from object type {object_type.name}")
        return jsonify({'message': 'Field deleted successfully'}), 200
    except Exception as e:
        db.session.rollback()
        logger.error(f"Error deleting field: {str(e)}")
        return jsonify({'error': 'Failed to delete field'}), 500


@bp.route('/fields/<int:field_id>', methods=['DELETE'])
def delete_field(field_id):
    """Delete a field"""
    try:
        field = ObjectField.query.get_or_404(field_id)
        
        # Check if there are object data entries using this field
        if len(field.object_data) > 0:
            return jsonify({'error': 'Cannot delete field that has data'}), 400
        
        db.session.delete(field)
        db.session.commit()
        
        logger.info(f"Deleted field {field.field_name}")
        return jsonify({'message': 'Field deleted successfully'}), 200
    except Exception as e:
        db.session.rollback()
        logger.error(f"Error deleting field: {str(e)}")
        return jsonify({'error': 'Failed to delete field'}), 500
