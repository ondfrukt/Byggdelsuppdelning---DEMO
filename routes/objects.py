from flask import Blueprint, request, jsonify
from models import db, Object, ObjectType, ObjectField, ObjectData, ObjectRelation, ViewConfiguration
from utils.auto_id_generator import generate_auto_id
from utils.validators import validate_object_data
from datetime import datetime, date
from decimal import Decimal
from copy import deepcopy
import re
import logging
import os

logger = logging.getLogger(__name__)
bp = Blueprint('objects', __name__, url_prefix='/api/objects')
PROJECT_ROOT = os.path.dirname(os.path.dirname(__file__))
UPLOAD_FOLDER = os.path.join(PROJECT_ROOT, 'static', 'uploads')


def get_display_name(obj, object_type_name, view_config):
    """
    Get display name for an object in tree view.
    
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
    # Primary rule: always prefer canonical name fields for tree view.
    name_value = (
        get_data_value_case_insensitive(obj.data, 'namn')
        or get_data_value_case_insensitive(obj.data, 'name')
    )
    if name_value:
        return str(name_value)

    # Backward compatibility: honor legacy tree-view config if present.
    config = view_config.get(object_type_name)
    field_name = (config or {}).get('tree_view_name_field')
    if field_name and field_name != 'ID':
        configured_value = get_data_value_case_insensitive(obj.data, field_name)
        if configured_value:
            return str(configured_value)

    # Final fallback.
    return obj.auto_id


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


def normalize_lookup_key(value):
    return ''.join(ch for ch in (value or '').lower() if ch.isalnum())


def parse_field_options(raw_options):
    if isinstance(raw_options, dict):
        return raw_options
    if isinstance(raw_options, str):
        try:
            import json
            parsed = json.loads(raw_options)
            return parsed if isinstance(parsed, dict) else None
        except Exception:
            return None
    return None


def matches_tree_view_type(object_type_name, tree_view):
    normalized = normalize_lookup_key(object_type_name)
    if tree_view == 'byggdelar':
        return 'byggdel' in normalized
    if tree_view == 'utrymmen':
        return 'utrymme' in normalized or 'rum' in normalized
    if tree_view == 'system':
        return 'system' in normalized
    return False


def get_tree_view_category_aliases(tree_view):
    if tree_view == 'byggdelar':
        return ['byggdelskategori', 'kategori', 'category']
    if tree_view == 'utrymmen':
        return ['typutrymme', 'typ utrymme', 'rumskategori', 'utrymmeskategori', 'kategori', 'category']
    if tree_view == 'system':
        return ['systemkategori', 'kategori', 'category']
    return ['kategori', 'category']


def get_tree_view_category_value(obj, tree_view):
    object_data = obj.data or {}
    object_fields = obj.object_type.fields if obj and obj.object_type else []
    normalized_data = {
        normalize_lookup_key(key): value
        for key, value in object_data.items()
        if isinstance(key, str)
    }

    if tree_view == 'byggdelar':
        for field in object_fields:
            if field.field_type != 'select':
                continue
            options = parse_field_options(field.field_options)
            if isinstance(options, dict) and options.get('source') == 'building_part_categories':
                value = object_data.get(field.field_name)
                if value is None:
                    value = normalized_data.get(normalize_lookup_key(field.field_name))
                if value:
                    return str(value).strip()

    aliases = get_tree_view_category_aliases(tree_view)
    for alias in aliases:
        value = normalized_data.get(normalize_lookup_key(alias))
        if value:
            return str(value).strip()

    return 'Okategoriserad'


def build_tree_root_nodes(root_objects, view_config):
    tree_nodes = []
    for root_object in root_objects:
        outgoing = ObjectRelation.query.filter_by(source_object_id=root_object.id).all()
        incoming = ObjectRelation.query.filter_by(target_object_id=root_object.id).all()
        relations = outgoing + incoming

        children = []
        children_by_type = {}

        for relation in relations:
            linked_object = relation.target_object if relation.source_object_id == root_object.id else relation.source_object
            direction = 'outgoing' if relation.source_object_id == root_object.id else 'incoming'

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
                    'data': linked_object_data,
                    'kravtext': get_data_value_case_insensitive(linked_object_data, 'kravtext'),
                    'beskrivning': get_data_value_case_insensitive(linked_object_data, 'beskrivning'),
                    'files': collect_tree_files_for_object(linked_object)
                })

        for type_name in sorted(children_by_type.keys(), key=lambda name: name.lower()):
            type_children = sorted(children_by_type[type_name], key=lambda item: (item.get('name') or '').lower())
            children.append({
                'id': f'group-{root_object.id}-{type_name}',
                'name': type_name,
                'type': 'group',
                'children': type_children
            })

        root_type_name = root_object.object_type.name if root_object.object_type else 'Objekt'
        root_display_name = get_display_name(root_object, root_type_name, view_config)
        root_data = root_object.data or {}

        tree_nodes.append({
            'id': str(root_object.id),
            'auto_id': root_object.auto_id,
            'name': root_display_name,
            'type': root_type_name,
            'data': root_data,
            'kravtext': get_data_value_case_insensitive(root_data, 'kravtext'),
            'beskrivning': get_data_value_case_insensitive(root_data, 'beskrivning'),
            'files': collect_tree_files_for_object(root_object),
            'children': children
        })

    return sorted(tree_nodes, key=lambda item: (item.get('name') or '').lower())


def is_document_object_type(type_name):
    """Check whether an object type is a document/drawing object."""
    normalized = (type_name or '').lower()
    return 'filobjekt' in normalized or 'ritning' in normalized or 'dokument' in normalized


def normalize_field_key(value):
    """Normalize field/type names for lenient matching."""
    return ''.join(ch for ch in (value or '').lower() if ch.isalnum())


def is_connection_object_type(type_name):
    """Check whether object type represents connection objects."""
    return 'anslutning' in normalize_field_key(type_name)


def find_field_name_by_aliases(fields, aliases):
    alias_keys = {normalize_field_key(alias) for alias in aliases}
    for field in fields:
        if normalize_field_key(field.field_name) in alias_keys:
            return field.field_name
    return None


def apply_connection_name_rules(object_type, object_data):
    """
    Ensure connection objects always have generated name based on Del A + Del B.
    Returns tuple: (ok, errors, mutated_object_data)
    """
    if not is_connection_object_type(object_type.name):
        return True, [], object_data

    if not isinstance(object_data, dict):
        return False, ['Data payload must be an object'], object_data

    del_a_field_name = find_field_name_by_aliases(object_type.fields, ['del_a', 'dela', 'del a'])
    del_b_field_name = find_field_name_by_aliases(object_type.fields, ['del_b', 'delb', 'del b'])
    name_field_name = find_field_name_by_aliases(object_type.fields, ['namn', 'name'])

    errors = []
    if not del_a_field_name:
        errors.append("Missing field definition for 'Del A' on object type")
    if not del_b_field_name:
        errors.append("Missing field definition for 'Del B' on object type")
    if not name_field_name:
        errors.append("Missing field definition for 'namn' on object type")
    if errors:
        return False, errors, object_data

    part_a = str(object_data.get(del_a_field_name) or '').strip()
    part_b = str(object_data.get(del_b_field_name) or '').strip()
    if not part_a or not part_b:
        return False, ["Fields 'Del A' and 'Del B' are required"], object_data

    ordered_parts = sorted([part_a, part_b], key=lambda value: value.lower())
    generated_name = f"{ordered_parts[0]} - {ordered_parts[1]}"
    object_data[name_field_name] = generated_name

    return True, [], object_data


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
                'id_full': obj.id_full,
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
            result = obj.to_dict(
                include_data=True,
                include_relations=True,
                include_documents=True,
                include_object_type_fields=True
            )
            return jsonify(result), 200
        except Exception as serialize_error:
            logger.error(f"Error serializing object {id}: {str(serialize_error)}", exc_info=True)
            # Try without relations and documents as fallback
            try:
                result = obj.to_dict(
                    include_data=True,
                    include_relations=False,
                    include_documents=False,
                    include_object_type_fields=True
                )
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

        # Connection objects: always generate name from Del A + Del B (alphabetical order).
        is_connection_valid, connection_errors, object_data = apply_connection_name_rules(object_type, object_data)
        if not is_connection_valid:
            return jsonify({'error': 'Validation failed', 'details': connection_errors}), 400
        
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

        # Connection objects: always generate name from Del A + Del B (alphabetical order).
        is_connection_valid, connection_errors, object_data = apply_connection_name_rules(obj.object_type, object_data)
        if not is_connection_valid:
            return jsonify({'error': 'Validation failed', 'details': connection_errors}), 400
        
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


@bp.route('/<int:id>/duplicate', methods=['POST'])
def duplicate_object(id):
    """Duplicate an object with copied data and relations but with a new ID."""
    try:
        source = Object.query.get_or_404(id)
        object_type = source.object_type
        payload = request.get_json(silent=True) or {}

        provided_data = payload.get('data')
        object_data = provided_data if isinstance(provided_data, dict) else source.data

        # Connection objects: always generate name from Del A + Del B (alphabetical order).
        is_connection_valid, connection_errors, object_data = apply_connection_name_rules(object_type, object_data)
        if not is_connection_valid:
            return jsonify({'error': 'Validation failed', 'details': connection_errors}), 400

        is_valid, errors = validate_object_data(object_type.fields, object_data)
        if not is_valid:
            return jsonify({'error': 'Validation failed', 'details': errors}), 400

        requested_status = payload.get('status')
        status = requested_status if isinstance(requested_status, str) and requested_status.strip() else source.status

        relation_ids_payload = payload.get('relation_ids')
        relation_id_filter = None
        if relation_ids_payload is not None:
            if not isinstance(relation_ids_payload, list):
                return jsonify({'error': 'relation_ids must be a list of integers'}), 400
            relation_id_filter = {
                int(relation_id) for relation_id in relation_ids_payload
                if str(relation_id).isdigit()
            }

        additional_target_ids_payload = payload.get('additional_target_ids')
        additional_target_ids = []
        if additional_target_ids_payload is not None:
            if not isinstance(additional_target_ids_payload, list):
                return jsonify({'error': 'additional_target_ids must be a list of integers'}), 400
            additional_target_ids = [
                int(target_id) for target_id in additional_target_ids_payload
                if str(target_id).isdigit()
            ]

        # Generate fresh identifiers for the duplicated object.
        auto_id = generate_auto_id(object_type.name)
        type_prefix = object_type.id_prefix or object_type.name[:3].upper()
        obj_count = Object.query.filter_by(object_type_id=object_type.id).count()
        main_id = f"{type_prefix}-{obj_count + 1:03d}"
        version = '001'
        id_full = f"{main_id}.{version}"

        duplicate = Object(
            object_type_id=object_type.id,
            auto_id=auto_id,
            created_by=source.created_by,
            status=status,
            version=version,
            main_id=main_id,
            id_full=id_full
        )

        db.session.add(duplicate)
        db.session.flush()

        # Copy dynamic field values as-is.
        for field in object_type.fields:
            value = object_data.get(field.field_name)
            if value is None or value == '':
                continue

            copied_data = ObjectData(
                object_id=duplicate.id,
                field_id=field.id
            )

            if field.field_type == 'number':
                copied_data.value_number = Decimal(str(value))
            elif field.field_type == 'date':
                if isinstance(value, str):
                    copied_data.value_date = datetime.fromisoformat(value.replace('Z', '+00:00')).date()
                elif isinstance(value, date):
                    copied_data.value_date = value
            elif field.field_type == 'boolean':
                copied_data.value_boolean = bool(value)
            else:
                copied_data.value_text = str(value)

            db.session.add(copied_data)

        # Copy every relation where the source object participates,
        # replacing source object ID with duplicated object ID.
        relations = ObjectRelation.query.filter(
            (ObjectRelation.source_object_id == source.id) |
            (ObjectRelation.target_object_id == source.id)
        ).all()
        created_relation_keys = set()

        for relation in relations:
            if relation_id_filter is not None and relation.id not in relation_id_filter:
                continue

            new_source_id = duplicate.id if relation.source_object_id == source.id else relation.source_object_id
            new_target_id = duplicate.id if relation.target_object_id == source.id else relation.target_object_id

            copied_relation = ObjectRelation(
                source_object_id=new_source_id,
                target_object_id=new_target_id,
                relation_type=relation.relation_type,
                description=relation.description,
                relation_metadata=deepcopy(relation.relation_metadata)
            )
            db.session.add(copied_relation)
            created_relation_keys.add((new_source_id, new_target_id, relation.relation_type))

        for target_id in additional_target_ids:
            if target_id == duplicate.id:
                continue

            target_object = Object.query.get(target_id)
            if not target_object:
                continue

            relation_type = 'relaterad'
            relation_key = (duplicate.id, target_id, relation_type)
            if relation_key in created_relation_keys:
                continue

            new_relation = ObjectRelation(
                source_object_id=duplicate.id,
                target_object_id=target_id,
                relation_type=relation_type
            )
            db.session.add(new_relation)
            created_relation_keys.add(relation_key)

        db.session.commit()

        logger.info(f"Duplicated object {source.auto_id} -> {duplicate.auto_id}")
        return jsonify(duplicate.to_dict(include_data=True, include_relations=True)), 201
    except Exception as e:
        db.session.rollback()
        logger.error(f"Error duplicating object {id}: {str(e)}", exc_info=True)
        return jsonify({'error': 'Failed to duplicate object', 'details': str(e)}), 500


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
    """Get hierarchical tree structure of objects, grouped by selected tree view mode."""
    try:
        tree_view = (request.args.get('view') or 'byggdelar').strip().lower()
        valid_views = {'byggdelar', 'utrymmen', 'system'}
        if tree_view not in valid_views:
            return jsonify({'error': 'Invalid view. Allowed values: byggdelar, utrymmen, system'}), 400

        # Get all view configurations
        view_configs_query = ViewConfiguration.query.all()
        view_config = {}
        for config in view_configs_query:
            if config.object_type:
                view_config[config.object_type.name] = {
                    'tree_view_name_field': config.tree_view_name_field
                }

        object_types = ObjectType.query.all()
        root_type_ids = [
            object_type.id
            for object_type in object_types
            if matches_tree_view_type(object_type.name, tree_view)
        ]

        if not root_type_ids:
            return jsonify([]), 200

        root_objects = Object.query.filter(Object.object_type_id.in_(root_type_ids)).all()
        if not root_objects:
            return jsonify([]), 200

        if tree_view == 'system':
            # For system view, system objects themselves should be top-level nodes.
            return jsonify(build_tree_root_nodes(root_objects, view_config)), 200

        category_groups = {}
        for root_object in root_objects:
            category_name = get_tree_view_category_value(root_object, tree_view)
            if category_name not in category_groups:
                category_groups[category_name] = []
            category_groups[category_name].append(root_object)

        tree = []
        for index, category_name in enumerate(sorted(category_groups.keys(), key=lambda name: name.lower()), start=1):
            category_roots = build_tree_root_nodes(category_groups[category_name], view_config)
            category_slug = re.sub(r'[^a-z0-9]+', '-', normalize_lookup_key(category_name)) or f'kategori-{index}'
            tree.append({
                'id': f'category-{tree_view}-{category_slug}-{index}',
                'name': category_name,
                'type': 'group',
                'children': category_roots
            })

        return jsonify(tree), 200
    except Exception as e:
        logger.error(f"Error getting tree: {str(e)}")
        return jsonify({'error': 'Failed to get tree'}), 500
