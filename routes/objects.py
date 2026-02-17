from flask import Blueprint, request, jsonify
from models import db, Object, ObjectType, ObjectField, ObjectData, ObjectRelation, ViewConfiguration
from utils.auto_id_generator import generate_auto_id
from utils.validators import validate_object_data
from datetime import datetime, date
from decimal import Decimal
import logging
import os

logger = logging.getLogger(__name__)
bp = Blueprint('objects', __name__, url_prefix='/api/objects')
PROJECT_ROOT = os.path.dirname(os.path.dirname(__file__))
UPLOAD_FOLDER = os.path.join(PROJECT_ROOT, 'static', 'uploads')


def get_display_name(obj, object_type_name, view_config):
    """
    Get display name for an object based on view configuration.
    
    Args:
        obj: Object instance
        object_type_name: Name of the object type
        view_config: Dictionary of view configurations {object_type_name: config}
    
    Returns:
        Display name string
        - If no config or field not specified: Returns auto_id
        - If configured to use "ID": Returns auto_id
        - If field value exists: Returns field value as string
        - If field is configured but value is empty: Returns "ID: {auto_id}" 
          (prefix helps distinguish from configured fields with actual values)
    """
    # Get configuration for this object type
    config = view_config.get(object_type_name)
    
    # If no config or no field specified, use default
    if not config or not config.get('tree_view_name_field'):
        return obj.auto_id
    
    field_name = config['tree_view_name_field']
    
    # If configured to use ID, return auto_id
    if field_name == 'ID':
        return obj.auto_id
    
    # Try to get value from object data
    value = obj.data.get(field_name)
    
    # If value exists, return it, otherwise fallback to ID with prefix
    # The "ID:" prefix indicates a fallback scenario to distinguish from 
    # cases where the field is intentionally set to an ID-like value
    if value:
        return str(value)
    else:
        return f"ID: {obj.auto_id}"


def get_data_value_case_insensitive(data, field_name):
    """Get a field value from object data with case-insensitive fallback."""
    if not isinstance(data, dict):
        return None

    if field_name in data:
        return data[field_name]

    field_name_lower = field_name.lower()
    for key, value in data.items():
        if isinstance(key, str) and key.lower() == field_name_lower:
            return value

    return None


def is_document_object_type(type_name):
    """Check whether an object type is a document/drawing object."""
    normalized = (type_name or '').lower()
    return 'filobjekt' in normalized or 'ritning' in normalized or 'dokument' in normalized


def is_pdf_document(document):
    """Check whether a document is a PDF file."""
    filename = (document.original_filename or document.filename or '').lower()
    mime_type = (document.mime_type or '').lower()
    return filename.endswith('.pdf') or mime_type == 'application/pdf'


def get_document_storage_candidates(document):
    """Return possible file system paths for a stored document file."""
    candidates = []

    if document.file_path:
        if os.path.isabs(document.file_path):
            candidates.append(document.file_path)
        else:
            candidates.append(os.path.join(PROJECT_ROOT, document.file_path))
            candidates.append(os.path.join(UPLOAD_FOLDER, document.file_path))
            basename = os.path.basename(document.file_path)
            if basename:
                candidates.append(os.path.join(UPLOAD_FOLDER, basename))

    if document.filename:
        candidates.append(os.path.join(UPLOAD_FOLDER, document.filename))

    unique = []
    seen = set()
    for path in candidates:
        normalized = os.path.normpath(path)
        if normalized not in seen:
            seen.add(normalized)
            unique.append(normalized)
    return unique


def get_document_link_description(document, owner_object=None):
    """Resolve a readable description for a document link in the tree."""
    owner_data = owner_object.data if owner_object else {}

    object_description = get_data_value_case_insensitive(owner_data, 'beskrivning')
    if object_description:
        return str(object_description)

    object_name = (
        get_data_value_case_insensitive(owner_data, 'namn')
        or get_data_value_case_insensitive(owner_data, 'name')
    )
    if object_name:
        return str(object_name)

    original_filename = document.original_filename or document.filename or ''
    stem = os.path.splitext(original_filename)[0]
    return stem or 'PDF-dokument'


def collect_tree_files_for_object(obj):
    """Collect direct and indirectly linked files for an object in tree view."""
    files = []
    seen_ids = set()

    def add_document(document, owner=None, source='direct'):
        if not document or document.id in seen_ids:
            return

        seen_ids.add(document.id)
        payload = document.to_dict()
        payload['description'] = get_document_link_description(document, owner)
        payload['source'] = source
        files.append(payload)

    # Direct files on object
    for document in obj.documents:
        add_document(document, owner=obj, source='direct')

    # Indirect files through related document/drawing objects
    relations = ObjectRelation.query.filter(
        (ObjectRelation.source_object_id == obj.id) |
        (ObjectRelation.target_object_id == obj.id)
    ).all()

    for relation in relations:
        linked_object = relation.target_object if relation.source_object_id == obj.id else relation.source_object
        if not linked_object or not is_document_object_type(linked_object.object_type.name):
            continue

        for document in linked_object.documents:
            add_document(document, owner=linked_object, source='indirect')

    return files


def enrich_object_with_file_metadata(payload, obj):
    """Attach file metadata used by list and table views."""
    files = collect_tree_files_for_object(obj)
    payload['files'] = files
    payload['file_count'] = len(files)
    payload['has_files'] = len(files) > 0
    return payload


@bp.route('', methods=['GET'])
def list_objects():
    """List all objects with optional filtering and optional pagination."""
    try:
        object_type_name = request.args.get('type')
        search = request.args.get('search')
        minimal = request.args.get('minimal', 'false').lower() == 'true'
        page = request.args.get('page', type=int)
        per_page = request.args.get('per_page', type=int)

        query = Object.query

        if object_type_name:
            query = query.join(ObjectType).filter(ObjectType.name == object_type_name)

        objects = query.order_by(Object.created_at.desc()).all()

        if search:
            search_lower = search.lower()
            filtered_objects = []
            for obj in objects:
                if search_lower in (obj.auto_id or '').lower():
                    filtered_objects.append(obj)
                    continue

                for od in obj.object_data:
                    if od.value_text and search_lower in od.value_text.lower():
                        filtered_objects.append(obj)
                        break
            objects = filtered_objects

        def to_minimal_payload(obj):
            data = obj.to_dict(include_data=True).get('data', {})
            payload = {
                'id': obj.id,
                'auto_id': obj.auto_id,
                'object_type': {
                    'id': obj.object_type.id if obj.object_type else None,
                    'name': obj.object_type.name if obj.object_type else None
                },
                'data': {
                    key: value
                    for key, value in data.items()
                    if key.lower() in ['namn', 'name', 'beskrivning', 'description']
                }
            }
            return enrich_object_with_file_metadata(payload, obj)

        if page and per_page:
            total = len(objects)
            total_pages = max((total + per_page - 1) // per_page, 1)
            page = min(max(page, 1), total_pages)
            start_index = (page - 1) * per_page
            end_index = start_index + per_page
            page_objects = objects[start_index:end_index]

            items = [to_minimal_payload(obj) for obj in page_objects] if minimal else [
                enrich_object_with_file_metadata(obj.to_dict(include_data=True), obj)
                for obj in page_objects
            ]
            return jsonify({
                'items': items,
                'page': page,
                'per_page': per_page,
                'total': total,
                'total_pages': total_pages
            }), 200

        if minimal:
            return jsonify([to_minimal_payload(obj) for obj in objects]), 200

        return jsonify([
            enrich_object_with_file_metadata(obj.to_dict(include_data=True), obj)
            for obj in objects
        ]), 200
    except Exception as e:
        logger.error(f"Error listing objects: {str(e)}")
        return jsonify({'error': 'Failed to list objects'}), 500


@bp.route('/<int:id>', methods=['GET'])
def get_object(id):
    """Get a specific object with all data and relations"""
    try:
        obj = Object.query.get_or_404(id)
        
        # Try to serialize the object with detailed error handling
        try:
            result = obj.to_dict(include_data=True, include_relations=True, include_documents=True)
            return jsonify(result), 200
        except Exception as serialize_error:
            logger.error(f"Error serializing object {id}: {str(serialize_error)}", exc_info=True)
            # Try without relations and documents as fallback
            try:
                result = obj.to_dict(include_data=True, include_relations=False, include_documents=False)
                logger.warning(f"Returned object {id} with data only (excluded relations and documents) due to serialization error")
                return jsonify(result), 200
            except Exception as fallback_error:
                logger.error(f"Error in fallback serialization for object {id}: {str(fallback_error)}", exc_info=True)
                raise
    except Exception as e:
        logger.error(f"Error getting object {id}: {str(e)}", exc_info=True)
        return jsonify({'error': 'Failed to get object'}), 500


@bp.route('', methods=['POST'])
def create_object():
    """Create a new object with dynamic data"""
    try:
        data = request.get_json()
        
        # Validate required fields
        if not data.get('object_type_id'):
            return jsonify({'error': 'object_type_id is required'}), 400
        
        # Get object type
        object_type = ObjectType.query.get(data['object_type_id'])
        if not object_type:
            return jsonify({'error': 'Invalid object_type_id'}), 400
        
        # Get object data
        object_data = data.get('data', {})
        
        # Validate object data against fields
        is_valid, errors = validate_object_data(object_type.fields, object_data)
        if not is_valid:
            return jsonify({'error': 'Validation failed', 'details': errors}), 400
        
        # Generate auto ID
        auto_id = generate_auto_id(object_type.name)
        
        # Generate MainID and version for new objects
        status = data.get('status', 'In work')
        version = '001'
        
        # Generate MainID based on object type prefix
        # NOTE: This approach has a potential race condition in concurrent environments.
        # For production, consider using database sequences or unique constraints with retry logic.
        type_prefix = object_type.id_prefix or object_type.name[:3].upper()
        # Get the count of objects of this type to generate unique MainID
        obj_count = Object.query.filter_by(object_type_id=object_type.id).count()
        main_id = f"{type_prefix}-{obj_count + 1:03d}"
        id_full = f"{main_id}.{version}"
        
        # Create object
        obj = Object(
            object_type_id=object_type.id,
            auto_id=auto_id,
            created_by=data.get('created_by'),
            status=status,
            version=version,
            main_id=main_id,
            id_full=id_full
        )
        
        db.session.add(obj)
        db.session.flush()
        
        # Add object data
        for field in object_type.fields:
            field_name = field.field_name
            value = object_data.get(field_name)
            
            if value is not None and value != '':
                obj_data = ObjectData(
                    object_id=obj.id,
                    field_id=field.id
                )
                
                # Set value based on field type
                if field.field_type == 'number':
                    # Handle both string and numeric input
                    if isinstance(value, (int, float)):
                        obj_data.value_number = Decimal(str(value))
                    else:
                        obj_data.value_number = Decimal(value)
                elif field.field_type == 'date':
                    if isinstance(value, str):
                        obj_data.value_date = datetime.fromisoformat(value.replace('Z', '+00:00')).date()
                    else:
                        obj_data.value_date = value
                elif field.field_type == 'boolean':
                    obj_data.value_boolean = bool(value)
                else:
                    obj_data.value_text = str(value)
                
                db.session.add(obj_data)
        
        db.session.commit()
        
        logger.info(f"Created object: {obj.auto_id}")
        return jsonify(obj.to_dict(include_data=True)), 201
    except Exception as e:
        db.session.rollback()
        logger.error(f"Error creating object: {str(e)}")
        return jsonify({'error': 'Failed to create object', 'details': str(e)}), 500


@bp.route('/<int:id>', methods=['PUT'])
def update_object(id):
    """Update an object's data"""
    try:
        obj = Object.query.get_or_404(id)
        data = request.get_json()
        
        # Update metadata fields if provided
        if 'status' in data:
            obj.status = data['status']
        
        # Get object data
        object_data = data.get('data', {})
        
        # Validate object data against fields
        is_valid, errors = validate_object_data(obj.object_type.fields, object_data)
        if not is_valid:
            return jsonify({'error': 'Validation failed', 'details': errors}), 400
        
        # Update object data
        for field in obj.object_type.fields:
            field_name = field.field_name
            value = object_data.get(field_name)
            
            # Find existing object data
            existing = ObjectData.query.filter_by(
                object_id=obj.id,
                field_id=field.id
            ).first()
            
            if value is not None and value != '':
                if not existing:
                    existing = ObjectData(
                        object_id=obj.id,
                        field_id=field.id
                    )
                    db.session.add(existing)
                
                # Update value based on field type
                if field.field_type == 'number':
                    existing.value_number = Decimal(str(value))
                    existing.value_text = None
                    existing.value_date = None
                    existing.value_boolean = None
                elif field.field_type == 'date':
                    if isinstance(value, str):
                        existing.value_date = datetime.fromisoformat(value.replace('Z', '+00:00')).date()
                    else:
                        existing.value_date = value
                    existing.value_text = None
                    existing.value_number = None
                    existing.value_boolean = None
                elif field.field_type == 'boolean':
                    existing.value_boolean = bool(value)
                    existing.value_text = None
                    existing.value_number = None
                    existing.value_date = None
                else:
                    existing.value_text = str(value)
                    existing.value_number = None
                    existing.value_date = None
                    existing.value_boolean = None
                
                existing.updated_at = datetime.utcnow()
            elif existing:
                # Remove if value is empty
                db.session.delete(existing)
        
        obj.updated_at = datetime.utcnow()
        db.session.commit()
        
        logger.info(f"Updated object: {obj.auto_id}")
        return jsonify(obj.to_dict(include_data=True)), 200
    except Exception as e:
        db.session.rollback()
        logger.error(f"Error updating object: {str(e)}")
        return jsonify({'error': 'Failed to update object', 'details': str(e)}), 500


@bp.route('/<int:id>', methods=['DELETE'])
def delete_object(id):
    """Delete an object"""
    try:
        obj = Object.query.get_or_404(id)
        auto_id = obj.auto_id

        removed_paths = []
        for document in list(obj.documents):
            for candidate in get_document_storage_candidates(document):
                if os.path.exists(candidate):
                    os.remove(candidate)
                    removed_paths.append(candidate)
        
        db.session.delete(obj)
        db.session.commit()
        
        logger.info(f"Deleted object: {auto_id}; removed_files={removed_paths}")
        return jsonify({'message': 'Object deleted successfully'}), 200
    except Exception as e:
        db.session.rollback()
        logger.error(f"Error deleting object: {str(e)}")
        return jsonify({'error': 'Failed to delete object'}), 500


@bp.route('/tree', methods=['GET'])
def get_tree():
    """Get hierarchical tree structure of objects, grouped by Byggdel"""
    try:
        # Get all view configurations
        view_configs_query = ViewConfiguration.query.all()
        view_config = {}
        for config in view_configs_query:
            if config.object_type:
                view_config[config.object_type.name] = {
                    'tree_view_name_field': config.tree_view_name_field
                }
        
        # Get all Byggdel objects (root nodes)
        byggdel_type = ObjectType.query.filter_by(name='Byggdel').first()
        if not byggdel_type:
            return jsonify([]), 200
        
        byggdel_objects = Object.query.filter_by(object_type_id=byggdel_type.id).all()
        
        tree = []
        for byggdel in byggdel_objects:
            # Collect relation entities where the object appears on either side
            outgoing = ObjectRelation.query.filter_by(source_object_id=byggdel.id).all()
            incoming = ObjectRelation.query.filter_by(target_object_id=byggdel.id).all()
            relations = outgoing + incoming

            children = []
            children_by_type = {}

            for relation in relations:
                # Resolve linked object from relation direction to support two-way traversal
                linked_object = relation.target_object if relation.source_object_id == byggdel.id else relation.source_object
                direction = 'outgoing' if relation.source_object_id == byggdel.id else 'incoming'

                if linked_object:
                    type_name = linked_object.object_type.name
                    if type_name not in children_by_type:
                        children_by_type[type_name] = []

                    display_name = get_display_name(linked_object, type_name, view_config)

                    linked_object_data = linked_object.data or {}

                    children_by_type[type_name].append({
                        'id': str(linked_object.id),
                        'auto_id': linked_object.auto_id,
                        'name': display_name,
                        'type': type_name,
                        'direction': direction,
                        'kravtext': get_data_value_case_insensitive(linked_object_data, 'kravtext'),
                        'beskrivning': get_data_value_case_insensitive(linked_object_data, 'beskrivning'),
                        'files': collect_tree_files_for_object(linked_object)
                    })

            for type_name, objects in children_by_type.items():
                children.append({
                    'id': f'group-{byggdel.id}-{type_name}',
                    'name': type_name,
                    'type': 'group',
                    'children': objects
                })

            byggdel_display_name = get_display_name(byggdel, 'Byggdel', view_config)

            tree.append({
                'id': str(byggdel.id),
                'auto_id': byggdel.auto_id,
                'name': byggdel_display_name,
                'type': 'Byggdel',
                'children': children
            })
        
        return jsonify(tree), 200
    except Exception as e:
        logger.error(f"Error getting tree: {str(e)}")
        return jsonify({'error': 'Failed to get tree'}), 500
