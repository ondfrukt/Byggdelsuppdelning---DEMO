from flask import Blueprint, request, jsonify
from models import db, ObjectType, ObjectField
import logging

logger = logging.getLogger(__name__)
bp = Blueprint('object_types', __name__, url_prefix='/api/object-types')

REQUIRED_NAME_FIELD = 'namn'
OBJECT_TYPE_COLOR_PALETTE = {
    '#0EA5E9', '#14B8A6', '#22C55E', '#84CC16',
    '#EAB308', '#F97316', '#EF4444', '#EC4899',
    '#8B5CF6', '#6366F1', '#06B6D4', '#64748B',
    '#3498db', '#2ecc71', '#e74c3c', '#f39c12',
    '#9b59b6', '#1abc9c', '#34495e', '#95a5a6'
}
OBJECT_TYPE_COLOR_PALETTE_UPPER = {color.upper() for color in OBJECT_TYPE_COLOR_PALETTE}


def normalize_field_name(value):
    return (value or '').strip().lower()


def is_name_field_name(value):
    return normalize_field_name(value) == REQUIRED_NAME_FIELD


def normalize_object_type_color(value):
    if value is None:
        return None

    normalized = str(value).strip().upper()
    if not normalized:
        return None

    if not normalized.startswith('#'):
        normalized = f'#{normalized}'

    if len(normalized) != 7:
        return None

    hex_part = normalized[1:]
    if any(ch not in '0123456789ABCDEF' for ch in hex_part):
        return None

    normalized = f"#{hex_part.lower()}"
    if normalized.upper() not in OBJECT_TYPE_COLOR_PALETTE_UPPER:
        return None

    return normalized


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
            color=normalize_object_type_color(data.get('color')),
            is_system=False  # User-created types are never system types
        )

        if data.get('color') is not None and object_type.color is None:
            return jsonify({'error': 'Invalid color. Choose a value from the fixed color palette'}), 400
        
        db.session.add(object_type)
        db.session.flush()

        # Every object type must have an obligatory namn-field.
        name_field = ObjectField(
            object_type_id=object_type.id,
            field_name=REQUIRED_NAME_FIELD,
            display_name='Namn',
            field_type='text',
            is_required=True,
            is_table_visible=True,
            display_order=1
        )
        db.session.add(name_field)
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

        if 'color' in data:
            normalized_color = normalize_object_type_color(data.get('color'))
            if data.get('color') is not None and normalized_color is None:
                return jsonify({'error': 'Invalid color. Choose a value from the fixed color palette'}), 400
            object_type.color = normalized_color
        
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
        field_name = data['field_name']
        existing = next(
            (
                field for field in ObjectField.query.filter_by(object_type_id=id).all()
                if normalize_field_name(field.field_name) == normalize_field_name(field_name)
            ),
            None
        )
        if existing:
            return jsonify({'error': 'Field with this name already exists for this object type'}), 400

        is_name_field = is_name_field_name(field_name)
        
        # Create field
        field = ObjectField(
            object_type_id=id,
            field_name=REQUIRED_NAME_FIELD if is_name_field else field_name,
            display_name=data.get('display_name'),
            field_type=data['field_type'],
            field_options=data.get('field_options'),
            is_required=True if is_name_field else data.get('is_required', False),
            is_table_visible=data.get('is_table_visible', True),
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


def _update_field_data(field, field_id, data):
    """Helper function to update field properties"""
    current_is_name_field = is_name_field_name(field.field_name)

    # Update field properties
    if 'field_name' in data:
        new_field_name = data['field_name']
        new_is_name_field = is_name_field_name(new_field_name)

        if current_is_name_field and not new_is_name_field:
            return {'error': "Field 'namn' is required and cannot be renamed"}, 400

        # Check if new name already exists for this type
        existing = next(
            (
                candidate for candidate in ObjectField.query.filter(
                    ObjectField.object_type_id == field.object_type_id,
                    ObjectField.id != field_id
                ).all()
                if normalize_field_name(candidate.field_name) == normalize_field_name(new_field_name)
            ),
            None
        )
        if existing:
            return {'error': 'Field with this name already exists for this object type'}, 400
        field.field_name = REQUIRED_NAME_FIELD if new_is_name_field else new_field_name
    
    if 'display_name' in data:
        field.display_name = data['display_name']
    
    if 'field_type' in data:
        field.field_type = data['field_type']
    
    if 'field_options' in data:
        field.field_options = data['field_options']
    
    if 'is_required' in data:
        if current_is_name_field and data['is_required'] is not True:
            return {'error': "Field 'namn' must remain required"}, 400
        field.is_required = data['is_required']

    if 'is_table_visible' in data:
        field.is_table_visible = bool(data['is_table_visible'])
    
    if 'help_text' in data:
        field.help_text = data['help_text']
    
    if 'display_order' in data:
        field.display_order = data['display_order']
    
    return None, None


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
        
        # Update field using helper function
        error_response, status_code = _update_field_data(field, field_id, data)
        if error_response:
            return jsonify(error_response), status_code
        
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
        
        # Update field using helper function
        error_response, status_code = _update_field_data(field, field_id, data)
        if error_response:
            return jsonify(error_response), status_code
        
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

        if is_name_field_name(field.field_name):
            return jsonify({'error': "Field 'namn' is required and cannot be deleted"}), 400
        
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

        if is_name_field_name(field.field_name):
            return jsonify({'error': "Field 'namn' is required and cannot be deleted"}), 400
        
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
