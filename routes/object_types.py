from flask import Blueprint, request, jsonify
from models import db, ObjectType, ObjectField, Object, ObjectData, FieldTemplate, RelationTypeRule, RelationType
from routes.relation_type_rules import ensure_complete_relation_rule_matrix
from extensions import cache
import json
import logging

logger = logging.getLogger(__name__)
bp = Blueprint('object_types', __name__, url_prefix='/api/object-types')

@bp.after_request
def invalidate_cache_on_write(response):
    if request.method != 'GET' and response.status_code < 400:
        cache.clear()
    return response

REQUIRED_NAME_FIELD = 'namn'
ALLOWED_DETAIL_WIDTHS = {'full', 'half', 'third'}
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


def normalize_detail_width(value):
    if value is None:
        return None
    normalized = str(value).strip().lower()
    if normalized in ALLOWED_DETAIL_WIDTHS:
        return normalized
    return None


def normalize_managed_list_field_options(value):
    if isinstance(value, str):
        try:
            value = json.loads(value)
        except Exception:
            return None, 'field_options must be valid JSON object for managed list fields'
    if not isinstance(value, dict):
        return None, 'field_options must be an object for managed list fields'

    source = str(value.get('source') or '').strip().lower()
    if source != 'managed_list':
        return None, "field_options.source must be 'managed_list'"

    try:
        list_id = int(value.get('list_id') or 0)
    except (TypeError, ValueError):
        return None, 'field_options.list_id must be an integer'
    if list_id <= 0:
        return None, 'field_options.list_id must be > 0'

    normalized = {
        'source': 'managed_list',
        'list_id': list_id,
    }

    selection_mode = str(value.get('selection_mode') or '').strip().lower()
    if selection_mode in ('single', 'multi'):
        normalized['selection_mode'] = selection_mode

    if 'allow_only_leaf_selection' in value:
        normalized['allow_only_leaf_selection'] = bool(value.get('allow_only_leaf_selection'))

    parent_field_name = str(value.get('parent_field_name') or '').strip()
    if parent_field_name:
        normalized['parent_field_name'] = parent_field_name

    try:
        parent_list_id = int(value.get('parent_list_id') or 0)
    except (TypeError, ValueError):
        return None, 'field_options.parent_list_id must be an integer'
    if parent_list_id > 0:
        normalized['parent_list_id'] = parent_list_id

    try:
        list_link_id = int(value.get('list_link_id') or 0)
    except (TypeError, ValueError):
        return None, 'field_options.list_link_id must be an integer'
    if list_link_id > 0:
        normalized['list_link_id'] = list_link_id

    try:
        hierarchy_level_count = int(value.get('hierarchy_level_count') or 0)
    except (TypeError, ValueError):
        return None, 'field_options.hierarchy_level_count must be an integer'

    raw_level_labels = value.get('hierarchy_level_labels')
    if raw_level_labels is None:
        level_labels = []
    elif isinstance(raw_level_labels, list):
        level_labels = [str(label or '').strip() for label in raw_level_labels]
        if any(not label for label in level_labels):
            return None, 'field_options.hierarchy_level_labels may not contain empty values'
    else:
        return None, 'field_options.hierarchy_level_labels must be an array of strings'

    if hierarchy_level_count < 0:
        return None, 'field_options.hierarchy_level_count must be >= 0'
    if hierarchy_level_count > 8:
        return None, 'field_options.hierarchy_level_count must be <= 8'
    if level_labels and len(level_labels) > 8:
        return None, 'field_options.hierarchy_level_labels may contain at most 8 labels'

    if hierarchy_level_count <= 0 and level_labels:
        hierarchy_level_count = len(level_labels)

    if hierarchy_level_count > 1:
        normalized['hierarchy_level_count'] = hierarchy_level_count

    if level_labels:
        if hierarchy_level_count > 0 and len(level_labels) > hierarchy_level_count:
            level_labels = level_labels[:hierarchy_level_count]
        normalized['hierarchy_level_labels'] = level_labels

    return normalized, None


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


def ensure_field_presence_for_all_objects(field):
    """Ensure every object of field's type has an ObjectData row for this field."""
    if not field or not field.object_type_id:
        return

    objects = Object.query.filter_by(object_type_id=field.object_type_id).all()
    for obj in objects:
        existing = ObjectData.query.filter_by(object_id=obj.id, field_id=field.id).first()
        if existing:
            continue
        db.session.add(ObjectData(object_id=obj.id, field_id=field.id))


def apply_template_to_field(field, template):
    """Copy standardized template attributes into object type field definition."""
    field.field_template_id = template.id
    field.field_name = template.field_name
    field.display_name = template.display_name
    field.field_type = template.field_type
    field.field_options = template.field_options
    field.lock_required_setting = bool(template.lock_required_setting)
    field.force_presence_on_all_objects = bool(template.force_presence_on_all_objects)
    field.is_table_visible = bool(template.is_table_visible)
    field.is_detail_visible = True
    field.help_text = template.help_text


def has_meaningful_field_data(field):
    """True if any ObjectData row for field contains a non-empty value."""
    for row in field.object_data:
        if row.value_text not in (None, ''):
            return True
        if row.value_number is not None:
            return True
        if row.value_date is not None:
            return True
        if row.value_boolean is not None:
            return True
        if row.value_json not in (None, {}, [], ''):
            return True
    return False


@bp.route('', methods=['GET'])
@cache.cached(timeout=300, query_string=True)
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
        data = request.get_json() or {}
        
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

        name_template = FieldTemplate.query.filter_by(field_name=REQUIRED_NAME_FIELD, is_active=True).order_by(FieldTemplate.id.asc()).first()

        # Every object type must have an obligatory namn-field.
        name_field = ObjectField(
            object_type_id=object_type.id,
            field_name=REQUIRED_NAME_FIELD,
            display_name='Name',
            field_type='text',
            is_required=True,
            lock_required_setting=True,
            force_presence_on_all_objects=True,
            is_table_visible=True,
            is_detail_visible=True,
            display_order=1
        )
        if name_template:
            apply_template_to_field(name_field, name_template)
            name_field.field_name = REQUIRED_NAME_FIELD
            name_field.is_required = True
            name_field.lock_required_setting = True
            name_field.force_presence_on_all_objects = True
        db.session.add(name_field)
        ensure_complete_relation_rule_matrix()
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
        data = request.get_json() or {}
        
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

        deleted_relation_rules = RelationTypeRule.query.filter(
            (RelationTypeRule.source_object_type_id == id) |
            (RelationTypeRule.target_object_type_id == id)
        ).delete(synchronize_session=False)

        scoped_relation_types = RelationType.query.filter(
            (RelationType.source_object_type_id == id) |
            (RelationType.target_object_type_id == id)
        ).all()
        for relation_type in scoped_relation_types:
            if relation_type.source_object_type_id == id:
                relation_type.source_object_type_id = None
            if relation_type.target_object_type_id == id:
                relation_type.target_object_type_id = None
        
        db.session.delete(object_type)
        db.session.commit()
        
        logger.info(
            "Deleted object type: %s (removed %s relation rules, cleared %s relation type scopes)",
            object_type.name,
            deleted_relation_rules,
            len(scoped_relation_types)
        )
        return jsonify({
            'message': 'Object type deleted successfully',
            'deleted_relation_rules': deleted_relation_rules,
            'cleared_relation_type_scopes': len(scoped_relation_types)
        }), 200
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
        data = request.get_json() or {}
        
        template_id = data.get('field_template_id')
        if template_id is None:
            return jsonify({'error': 'field_template_id is required'}), 400
        try:
            template_id = int(template_id)
        except (TypeError, ValueError):
            return jsonify({'error': 'field_template_id must be an integer'}), 400

        template = FieldTemplate.query.get(template_id)
        if not template:
            return jsonify({'error': 'Field template not found'}), 404
        if template.is_active is False:
            return jsonify({'error': 'Field template is inactive'}), 400

        normalized_detail_width = normalize_detail_width(data.get('detail_width'))
        if data.get('detail_width') is not None and normalized_detail_width is None:
            return jsonify({'error': "detail_width must be one of: full, half, third"}), 400
        
        # Check if field name already exists for this type
        field_name = template.field_name
        existing = next(
            (
                field for field in ObjectField.query.filter_by(object_type_id=id).all()
                if normalize_field_name(field.field_name) == normalize_field_name(field_name)
            ),
            None
        )
        if existing:
            # For computed fields, allow converting the existing field in-place
            if str(template.field_type or '').lower() == 'computed':
                existing.field_type = 'computed'
                incoming_options = data.get('field_options') or {}
                if isinstance(incoming_options, str):
                    try:
                        incoming_options = json.loads(incoming_options)
                    except Exception:
                        incoming_options = {}
                existing.field_options = incoming_options
                db.session.commit()
                return jsonify(existing.to_dict()), 200
            return jsonify({'error': 'Field with this name already exists for this object type'}), 400

        is_name_field = is_name_field_name(field_name)
        
        # Create field
        field = ObjectField(
            object_type_id=id,
            field_name=REQUIRED_NAME_FIELD if is_name_field else field_name,
            is_required=True if is_name_field else bool(data.get('is_required', template.is_required)),
            is_detail_visible=True,
            display_order=data.get('display_order'),
            detail_width=normalized_detail_width
        )
        apply_template_to_field(field, template)
        if is_name_field:
            field.field_name = REQUIRED_NAME_FIELD
            field.is_required = True
            field.lock_required_setting = True
            field.force_presence_on_all_objects = True

        if 'field_options' in data:
            if str(field.field_type or '').lower() != 'select':
                return jsonify({'error': 'field_options can only be set for select fields'}), 400
            current_options, current_error = normalize_managed_list_field_options(field.field_options or {})
            if current_error:
                return jsonify({'error': 'Only managed-list select options are supported here'}), 400
            incoming_options, incoming_error = normalize_managed_list_field_options(data.get('field_options'))
            if incoming_error:
                return jsonify({'error': incoming_error}), 400
            if int(incoming_options['list_id']) != int(current_options['list_id']):
                return jsonify({'error': 'list_id is template-managed and cannot be changed here'}), 400
            field.field_options = incoming_options
        
        db.session.add(field)
        db.session.flush()
        if field.force_presence_on_all_objects:
            ensure_field_presence_for_all_objects(field)
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

    immutable_keys = {'field_name', 'display_name', 'field_type', 'help_text', 'is_table_visible'}
    if any(key in data for key in immutable_keys):
        return {'error': 'Field definition is template-managed and cannot be edited here'}, 400

    if 'field_template_id' in data:
        return {'error': 'field_template_id cannot be changed on existing fields'}, 400

    if 'field_options' in data:
        if str(field.field_type or '').lower() not in ('select', 'computed'):
            return {'error': 'field_options can only be changed for select and computed fields'}, 400
        if str(field.field_type or '').lower() == 'computed':
            field.field_options = data.get('field_options') or {}
        else:
            current_options, current_error = normalize_managed_list_field_options(field.field_options or {})
            if current_error:
                return {'error': 'Only managed-list select options are editable here'}, 400
            incoming_options, incoming_error = normalize_managed_list_field_options(data.get('field_options'))
            if incoming_error:
                return {'error': incoming_error}, 400
            if int(incoming_options['list_id']) != int(current_options['list_id']):
                return {'error': 'list_id is template-managed and cannot be changed here'}, 400
            field.field_options = incoming_options

    if 'is_required' in data:
        if current_is_name_field and data['is_required'] is not True:
            return {'error': "Field 'namn' must remain required"}, 400
        field.is_required = data['is_required']
    
    if 'display_order' in data:
        field.display_order = data['display_order']

    if 'detail_width' in data:
        normalized_width = normalize_detail_width(data.get('detail_width'))
        if data.get('detail_width') is not None and normalized_width is None:
            return {'error': "detail_width must be one of: full, half, third"}, 400
        field.detail_width = normalized_width

    if 'is_detail_visible' in data:
        field.is_detail_visible = bool(data.get('is_detail_visible'))
    
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
        
        data = request.get_json() or {}
        
        # Update field using helper function
        error_response, status_code = _update_field_data(field, field_id, data)
        if error_response:
            return jsonify(error_response), status_code

        if field.force_presence_on_all_objects:
            ensure_field_presence_for_all_objects(field)
        
        db.session.commit()
        
        logger.info(f"Updated field {field.field_name} for object type {object_type.name}")
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
            duplicate_count = ObjectField.query.filter_by(
                object_type_id=type_id, field_name=field.field_name
            ).count()
            if duplicate_count <= 1:
                return jsonify({'error': "Field 'namn' is required and cannot be deleted"}), 400
        if field.force_presence_on_all_objects:
            return jsonify({'error': 'Disable force_presence_on_all_objects before deleting this field'}), 400
        
        # Check if there are object data entries using this field
        if has_meaningful_field_data(field):
            return jsonify({'error': 'Cannot delete field that has data'}), 400
        for row in list(field.object_data):
            db.session.delete(row)
        
        db.session.delete(field)
        db.session.commit()
        
        logger.info(f"Deleted field {field.field_name} from object type {object_type.name}")
        return jsonify({'message': 'Field deleted successfully'}), 200
    except Exception as e:
        db.session.rollback()
        logger.error(f"Error deleting field: {str(e)}")
        return jsonify({'error': 'Failed to delete field'}), 500
