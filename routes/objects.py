from flask import Blueprint, request, jsonify
from models import db, Object, ObjectType, ObjectField, ObjectData, ObjectRelation, ObjectFieldOverride, ViewConfiguration, ManagedListItem, Instance
from utils.auto_id_generator import (
    generate_base_id,
    compose_full_id,
    normalize_version,
    normalize_base_id,
    get_next_version_for_base_id
)
from utils.validators import validate_object_data
from datetime import datetime, date
from decimal import Decimal
from copy import deepcopy
import re
import logging
import os
import json
import html

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
        - If no config or field not specified: Returns ID
        - If configured to use "ID": Returns ID
        - If field value exists: Returns field value as string
        - If field is configured but value is empty: Returns "ID: {id_full}"
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
    return obj.id_full


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


def natural_sort_key(value):
    parts = re.split(r'(\d+)', str(value or '').strip().casefold())
    key = []
    for part in parts:
        if not part:
            continue
        if part.isdigit():
            key.append((0, int(part)))
        else:
            key.append((1, part))
    return key


def strip_html_to_text(value):
    text = str(value or '')
    if not text:
        return ''
    text = re.sub(r'(?i)<br\s*/?>', '\n', text)
    text = re.sub(r'(?i)</p\s*>', '\n', text)
    text = re.sub(r'<[^>]+>', '', text)
    text = html.unescape(text)
    text = re.sub(r'\r\n?', '\n', text)
    text = re.sub(r'\n{3,}', '\n\n', text)
    return text.strip()


def is_requirement_object_type(type_name):
    normalized = normalize_field_key(type_name)
    return 'requirement' in normalized or 'krav' in normalized


def get_object_field_value_by_template_names(obj, template_names):
    if not obj or not obj.object_type:
        return None

    normalized_templates = {normalize_field_key(name) for name in template_names if name}
    if not normalized_templates:
        return None

    object_data = obj.data or {}
    for field in obj.object_type.fields or []:
        template = getattr(field, 'field_template', None)
        candidate_names = {
            normalize_field_key(getattr(field, 'field_name', '')),
            normalize_field_key(getattr(field, 'display_name', '')),
            normalize_field_key(getattr(template, 'template_name', '')),
            normalize_field_key(getattr(template, 'display_name', ''))
        }

        translations = getattr(template, 'display_name_translations', None) or {}
        if isinstance(translations, dict):
            candidate_names.update(normalize_field_key(value) for value in translations.values())

        if normalized_templates.isdisjoint(candidate_names):
            continue

        value = get_data_value_case_insensitive(object_data, field.field_name)
        if value not in (None, ''):
            return value

    return None


def get_tree_requirement_text(obj):
    own_value = get_object_field_value_by_template_names(obj, ['Requirement Text', 'Kravtext'])
    if own_value not in (None, ''):
        return strip_html_to_text(own_value)
    return ''


def get_tree_short_description(obj):
    value = get_object_field_value_by_template_names(
        obj,
        ['Description - short', 'Description short', 'Kort beskrivning']
    )
    if value not in (None, ''):
        return strip_html_to_text(value)
    return ''


def matches_tree_view_type(object_type_name, tree_view):
    normalized = normalize_lookup_key(object_type_name)
    if tree_view == 'byggdelar':
        return normalized in {'assembly', 'byggdel', 'buildingpart'} or 'byggdel' in normalized
    if tree_view == 'utrymmen':
        return normalized in {'space', 'utrymme', 'rum', 'room'} or 'utrymme' in normalized or 'rum' in normalized
    if tree_view == 'system':
        return normalized in {'system', 'systemobjekt', 'systemobject', 'sys'}
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

    aliases = get_tree_view_category_aliases(tree_view)
    for alias in aliases:
        value = normalized_data.get(normalize_lookup_key(alias))
        if value:
            return str(value).strip()

    return 'Okategoriserad'


def normalize_field_options(raw_options):
    if not raw_options:
        return None
    if isinstance(raw_options, dict):
        return raw_options
    if not isinstance(raw_options, str):
        return None
    try:
        parsed = json.loads(raw_options)
    except (TypeError, ValueError, json.JSONDecodeError):
        return None
    return parsed if isinstance(parsed, dict) else None


def get_category_field_definition(obj, tree_view):
    if not obj or not obj.object_type:
        return None

    alias_keys = {normalize_lookup_key(alias) for alias in get_tree_view_category_aliases(tree_view)}
    for field in obj.object_type.fields or []:
        field_name = normalize_lookup_key(field.field_name)
        display_name = normalize_lookup_key(field.display_name)
        if field_name in alias_keys or display_name in alias_keys:
            return field
    return None


def get_managed_list_lookup(list_id, cache):
    safe_list_id = int(list_id or 0)
    if safe_list_id <= 0:
        return None

    if safe_list_id in cache:
        return cache[safe_list_id]

    items = ManagedListItem.query.filter_by(list_id=safe_list_id).all()
    by_id = {}
    by_value = {}
    for item in items:
        item_id = int(item.id or 0)
        label = str(item.resolve_display_value() or item.label or item.value or '').strip()
        value_key = str(item.value or '').strip()
        if item_id > 0 and label:
            by_id[item_id] = {
                'label': label,
                'parent_item_id': int(item.parent_item_id or 0) or None
            }
        if value_key and label:
            by_value[value_key] = item_id

    lookup = {'by_id': by_id, 'by_value': by_value}
    cache[safe_list_id] = lookup
    return lookup


def resolve_managed_list_path(raw_value, list_id, cache):
    lookup = get_managed_list_lookup(list_id, cache)
    if not lookup:
        return []

    item_id = None
    numeric_value = int(raw_value) if str(raw_value or '').strip().isdigit() else None
    if numeric_value and numeric_value in lookup['by_id']:
        item_id = numeric_value
    else:
        item_id = lookup['by_value'].get(str(raw_value or '').strip())

    if not item_id:
        return []

    path = []
    visited = set()
    current_id = item_id
    while current_id and current_id in lookup['by_id'] and current_id not in visited:
        visited.add(current_id)
        item = lookup['by_id'][current_id]
        label = str(item.get('label') or '').strip()
        if label:
            path.append(label)
        current_id = item.get('parent_item_id')

    return list(reversed(path))


def resolve_tree_field_display_value(field, raw_value, managed_list_cache=None):
    if raw_value in (None, ''):
        return raw_value
    if not field:
        return raw_value

    field_type = str(getattr(field, 'field_type', '') or '').strip().lower()
    if field_type != 'select':
        return raw_value

    field_options = normalize_field_options(getattr(field, 'field_options', None))
    if not field_options:
        return raw_value

    if str(field_options.get('source') or '').strip().lower() == 'managed_list':
        list_id = field_options.get('list_id')
        path = resolve_managed_list_path(raw_value, list_id, managed_list_cache or {})
        if path:
            return ' > '.join(path)

    return raw_value


def build_tree_display_data(obj, managed_list_cache=None):
    object_data = dict(obj.data or {})
    if not obj or not obj.object_type:
        return object_data

    display_data = dict(object_data)
    for field in obj.object_type.fields or []:
        field_name = getattr(field, 'field_name', None)
        if not field_name:
            continue

        raw_value = get_data_value_case_insensitive(object_data, field_name)
        if raw_value in (None, ''):
            continue

        display_data[field_name] = resolve_tree_field_display_value(field, raw_value, managed_list_cache)

    return display_data


def get_tree_view_category_path(obj, tree_view, managed_list_cache=None):
    managed_list_cache = managed_list_cache if isinstance(managed_list_cache, dict) else {}
    object_data = obj.data or {}
    category_field = get_category_field_definition(obj, tree_view)
    raw_value = None
    if category_field:
        raw_value = get_data_value_case_insensitive(object_data, category_field.field_name)
        if raw_value in (None, '') and category_field.display_name:
            raw_value = get_data_value_case_insensitive(object_data, category_field.display_name)

    if raw_value not in (None, '') and category_field:
        field_options = normalize_field_options(category_field.field_options)
        if (
            str(category_field.field_type or '').lower() == 'select'
            and field_options
            and str(field_options.get('source') or '').strip().lower() == 'managed_list'
        ):
            list_id = field_options.get('list_id')
            path = resolve_managed_list_path(raw_value, list_id, managed_list_cache)
            if path:
                return path

    fallback_value = get_tree_view_category_value(obj, tree_view)
    if isinstance(fallback_value, str) and '>' in fallback_value:
        return [segment.strip() for segment in fallback_value.split('>') if segment.strip()]
    fallback_label = str(fallback_value or '').strip() or 'Okategoriserad'
    return [fallback_label]


def build_instance_child_nodes(parent_object, view_config, managed_list_cache=None, visited_ids=None):
    managed_list_cache = managed_list_cache or {}
    visited_ids = set(visited_ids or set())
    if parent_object.id in visited_ids:
        return []
def build_tree_root_nodes(root_objects, view_config, managed_list_cache=None, relations_lookup=None):
    tree_nodes = []
    for root_object in root_objects:
        if relations_lookup is not None:
            relations = relations_lookup.get(root_object.id, [])
        else:
            outgoing = ObjectRelation.query.filter_by(source_object_id=root_object.id).all()
            incoming = ObjectRelation.query.filter_by(target_object_id=root_object.id).all()
            relations = outgoing + incoming

    next_visited_ids = set(visited_ids)
    next_visited_ids.add(parent_object.id)
    child_instances = Instance.query.filter_by(parent_object_id=parent_object.id).order_by(Instance.id.asc()).all()

    children_by_type = {}
    for instance in child_instances:
        child_object = instance.child_object
        if not child_object or child_object.id in next_visited_ids:
            continue
        for relation in relations:
            linked_object = relation.target_object if relation.source_object_id == root_object.id else relation.source_object
            direction = 'outgoing' if relation.source_object_id == root_object.id else 'incoming'

            if linked_object:
                type_name = linked_object.object_type.name
                if type_name not in children_by_type:
                    children_by_type[type_name] = []

                display_name = get_display_name(linked_object, type_name, view_config)
                linked_object_data = build_tree_display_data(linked_object, managed_list_cache)

                children_by_type[type_name].append({
                    'id': str(linked_object.id),
                    'id_full': linked_object.id_full,
                    'name': display_name,
                    'type': type_name,
                    'direction': direction,
                    'created_at': linked_object.created_at.isoformat() if linked_object.created_at else None,
                    'data': linked_object_data,
                    'kravtext': get_tree_requirement_text(linked_object),
                    'beskrivning': get_tree_short_description(linked_object),
                    'files': collect_tree_files_for_object(linked_object, relations_lookup)
                })

        type_name = child_object.object_type.name if child_object.object_type else 'Objekt'
        children_by_type.setdefault(type_name, [])

        display_name = get_display_name(child_object, type_name, view_config)
        child_object_data = build_tree_display_data(child_object, managed_list_cache)
        nested_children = build_instance_child_nodes(
            child_object,
            view_config,
            managed_list_cache=managed_list_cache,
            visited_ids=next_visited_ids,
        )

        children_by_type[type_name].append({
            'id': str(child_object.id),
            'id_full': child_object.id_full,
            'name': display_name,
            'type': type_name,
            'direction': 'outgoing',
            'created_at': child_object.created_at.isoformat() if child_object.created_at else None,
            'data': child_object_data,
            'kravtext': get_tree_requirement_text(child_object),
            'beskrivning': get_tree_short_description(child_object),
            'files': collect_tree_files_for_object(child_object),
            'instance_type': instance.instance_type,
            'children': nested_children,
        })

    children = []
    for type_name in sorted(children_by_type.keys(), key=natural_sort_key):
        type_children = sorted(children_by_type[type_name], key=lambda item: natural_sort_key(item.get('name')))
        children.append({
            'id': f'group-{parent_object.id}-{type_name}',
            'name': type_name,
            'type': 'group',
            'children': type_children
        })
    return children


def build_tree_root_nodes(root_objects, view_config, managed_list_cache=None, tree_view='byggdelar'):
    tree_nodes = []
    for root_object in root_objects:
        if tree_view == 'system':
            children = build_instance_child_nodes(root_object, view_config, managed_list_cache=managed_list_cache)
        else:
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
                    linked_object_data = build_tree_display_data(linked_object, managed_list_cache)

                    children_by_type[type_name].append({
                        'id': str(linked_object.id),
                        'id_full': linked_object.id_full,
                        'name': display_name,
                        'type': type_name,
                        'direction': direction,
                        'created_at': linked_object.created_at.isoformat() if linked_object.created_at else None,
                        'data': linked_object_data,
                        'kravtext': get_tree_requirement_text(linked_object),
                        'beskrivning': get_tree_short_description(linked_object),
                        'files': collect_tree_files_for_object(linked_object)
                    })

            for type_name in sorted(children_by_type.keys(), key=natural_sort_key):
                type_children = sorted(children_by_type[type_name], key=lambda item: natural_sort_key(item.get('name')))
                children.append({
                    'id': f'group-{root_object.id}-{type_name}',
                    'name': type_name,
                    'type': 'group',
                    'children': type_children
                })

        root_type_name = root_object.object_type.name if root_object.object_type else 'Objekt'
        root_display_name = get_display_name(root_object, root_type_name, view_config)
        root_data = build_tree_display_data(root_object, managed_list_cache)

        tree_nodes.append({
            'id': str(root_object.id),
            'id_full': root_object.id_full,
            'name': root_display_name,
            'type': root_type_name,
            'created_at': root_object.created_at.isoformat() if root_object.created_at else None,
            'data': root_data,
            'kravtext': get_tree_requirement_text(root_object),
            'beskrivning': get_tree_short_description(root_object),
            'files': collect_tree_files_for_object(root_object, relations_lookup),
            'children': children
        })

    return sorted(tree_nodes, key=lambda item: natural_sort_key(item.get('name')))


def build_category_group_tree(root_objects, tree_view, view_config):
    managed_list_cache = {}
    relations_lookup = build_relations_lookup([obj.id for obj in root_objects])
    category_tree = {}

    for root_object in root_objects:
        path = get_tree_view_category_path(root_object, tree_view, managed_list_cache)
        current_children = category_tree
        current_group = None
        for segment in path:
            current_group = current_children.setdefault(segment, {
                'children': {},
                'objects': []
            })
            current_children = current_group['children']
        if current_group is None:
            continue
        current_group['objects'].append(root_object)

    def serialize_group_nodes(tree_level, path_segments=None):
        path_segments = path_segments or []
        nodes = []
        for index, group_name in enumerate(sorted(tree_level.keys(), key=natural_sort_key), start=1):
            group_data = tree_level[group_name]
            current_path = path_segments + [group_name]
            child_groups = serialize_group_nodes(group_data['children'], current_path)
            group_slug = re.sub(r'[^a-z0-9]+', '-', normalize_lookup_key('-'.join(current_path))) or f'kategori-{index}'
            nodes.append({
                'id': f"category-{tree_view}-{group_slug}-{index}",
                'name': group_name,
                'type': 'group',
                'children': child_groups + build_tree_root_nodes(group_data['objects'], view_config, managed_list_cache, tree_view=tree_view)
            })
        return nodes

    return serialize_group_nodes(category_tree)


def is_document_object_type(type_name):
    """Check whether an object type is a document/drawing object."""
    normalized = (type_name or '').lower()
    return (
        'filobjekt' in normalized
        or 'fileobject' in normalized
        or 'file object' in normalized
        or 'ritning' in normalized
        or 'dokument' in normalized
        or 'document' in normalized
    )


def normalize_field_key(value):
    """Normalize field/type names for lenient matching."""
    return ''.join(ch for ch in (value or '').lower() if ch.isalnum())


def is_connection_object_type(type_name):
    """Check whether object type represents connection objects."""
    normalized = normalize_field_key(type_name)
    return 'anslutning' in normalized or 'connection' in normalized


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


def get_required_overrides_map(object_id):
    overrides = ObjectFieldOverride.query.filter_by(object_id=object_id).all()
    return {
        int(override.field_id): override.is_required_override
        for override in overrides
        if override.is_required_override is not None
    }


def get_effective_required_for_field(field, required_overrides=None):
    required_overrides = required_overrides or {}
    is_required = bool(field.is_required)
    if bool(getattr(field, 'lock_required_setting', False)):
        return is_required

    if field.id in required_overrides and required_overrides[field.id] is not None:
        return bool(required_overrides[field.id])
    return is_required


def enrich_object_type_fields_with_effective_required(obj_payload, required_overrides):
    object_type = obj_payload.get('object_type') or {}
    fields = object_type.get('fields') or []
    for field_payload in fields:
        field_id = field_payload.get('id')
        default_required = bool(field_payload.get('is_required'))
        lock_required_setting = bool(field_payload.get('lock_required_setting'))
        override_value = required_overrides.get(field_id)
        if lock_required_setting:
            effective_required = default_required
        elif override_value is None:
            effective_required = default_required
        else:
            effective_required = bool(override_value)

        field_payload['is_required_effective'] = bool(effective_required)
        field_payload['is_required_override'] = override_value


def set_object_data_value(record, field_type, value, field_options=None):
    """Set typed ObjectData value and clear non-applicable typed columns."""
    def normalize_field_options(raw_options):
        if isinstance(raw_options, dict):
            return raw_options
        if isinstance(raw_options, str):
            text = raw_options.strip()
            if not text:
                return None
            try:
                parsed = json.loads(text)
                return parsed if isinstance(parsed, dict) else None
            except Exception:
                return None
        return None

    def normalize_multi_values(raw_value):
        if raw_value is None:
            return []
        if isinstance(raw_value, list):
            values = raw_value
        elif isinstance(raw_value, str):
            values = [part.strip() for part in raw_value.split(',') if part.strip()]
        else:
            values = [raw_value]
        result = []
        for candidate in values:
            try:
                parsed = int(candidate)
            except (TypeError, ValueError):
                continue
            if parsed <= 0 or parsed in result:
                continue
            result.append(parsed)
        return result

    def resolve_path_payload(item_id):
        from models import ManagedListItem
        item = ManagedListItem.query.get(item_id)
        if not item:
            return None

        chain = []
        visited = set()
        current = item
        while current and int(current.id) not in visited:
            current_id = int(current.id)
            visited.add(current_id)
            chain.append({
                'id': current_id,
                'label': str(current.resolve_display_value(locale='sv', fallback_language_code='en') or current.value or '').strip()
            })
            parent_id = int(current.parent_item_id or 0)
            if parent_id <= 0:
                break
            current = ManagedListItem.query.get(parent_id)

        chain.reverse()
        if not chain:
            return None
        return {
            'selected_id': int(item.id),
            'label': chain[-1]['label'],
            'path_ids': [entry['id'] for entry in chain],
            'path': [entry['label'] for entry in chain]
        }

    if value is None or value == '':
        record.value_text = None
        record.value_number = None
        record.value_date = None
        record.value_boolean = None
        record.value_json = None
        return

    if field_type == 'number':
        if isinstance(value, (int, float)):
            record.value_number = Decimal(str(value))
        else:
            record.value_number = Decimal(value)
        record.value_text = None
        record.value_date = None
        record.value_boolean = None
        record.value_json = None
    elif field_type == 'date':
        if isinstance(value, str):
            record.value_date = datetime.fromisoformat(value.replace('Z', '+00:00')).date()
        else:
            record.value_date = value
        record.value_text = None
        record.value_number = None
        record.value_boolean = None
        record.value_json = None
    elif field_type == 'boolean':
        record.value_boolean = bool(value)
        record.value_text = None
        record.value_number = None
        record.value_date = None
        record.value_json = None
    elif field_type == 'select':
        field_options = normalize_field_options(field_options)
        is_multi_managed_list = (
            bool(field_options)
            and str(field_options.get('source') or '').strip().lower() == 'managed_list'
            and str(field_options.get('selection_mode') or '').strip().lower() == 'multi'
        )
        if not is_multi_managed_list:
            record.value_text = str(value)
            record.value_number = None
            record.value_date = None
            record.value_boolean = None
            record.value_json = None
            return

        selected_ids = normalize_multi_values(value)
        if not selected_ids:
            record.value_text = None
            record.value_number = None
            record.value_date = None
            record.value_boolean = None
            record.value_json = None
            return

        selected = []
        for selected_id in selected_ids:
            payload = resolve_path_payload(selected_id)
            if payload:
                selected.append(payload)

        if not selected:
            record.value_text = None
            record.value_number = None
            record.value_date = None
            record.value_boolean = None
            record.value_json = None
            return

        record.value_text = ','.join(str(entry['selected_id']) for entry in selected)
        record.value_number = None
        record.value_date = None
        record.value_boolean = None
        record.value_json = {
            'selection_mode': 'multi',
            'list_id': int(field_options.get('list_id') or 0),
            'selected_ids': [entry['selected_id'] for entry in selected],
            'selected': selected
        }
    else:
        record.value_text = str(value)
        record.value_number = None
        record.value_date = None
        record.value_boolean = None
        record.value_json = None


def has_meaningful_value(value):
    if value is None or value == '':
        return False
    if isinstance(value, (list, tuple, set)):
        return len(value) > 0
    return True


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


def build_relations_lookup(object_ids):
    """Batch-load all relations for a list of object IDs in a single query.

    Returns a dict mapping each object_id to a list of its relations,
    avoiding one query per object (N+1 problem).
    """
    if not object_ids:
        return {}
    all_relations = ObjectRelation.query.filter(
        (ObjectRelation.source_object_id.in_(object_ids)) |
        (ObjectRelation.target_object_id.in_(object_ids))
    ).all()
    lookup = {obj_id: [] for obj_id in object_ids}
    for relation in all_relations:
        if relation.source_object_id in lookup:
            lookup[relation.source_object_id].append(relation)
        if relation.target_object_id in lookup:
            lookup[relation.target_object_id].append(relation)
    return lookup


def collect_tree_files_for_object(obj, relations_lookup=None):
    """Collect direct and indirectly linked files for an object in tree view.

    Pass relations_lookup (from build_relations_lookup) to avoid an extra
    database query per object.
    """
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
    if relations_lookup is not None:
        relations = relations_lookup.get(obj.id, [])
    else:
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


def enrich_object_with_file_metadata(payload, obj, relations_lookup=None):
    """Attach file metadata used by list and table views."""
    files = collect_tree_files_for_object(obj, relations_lookup)
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

        # Pre-fetch all relations in one query to avoid N+1 per object
        relations_lookup = build_relations_lookup([obj.id for obj in objects])

        if search:
            search_lower = search.lower()
            filtered_objects = []
            for obj in objects:
                if search_lower in (obj.id_full or '').lower():
                    filtered_objects.append(obj)
                    continue

                for od in obj.object_data:
                    if od.value_text and search_lower in od.value_text.lower():
                        filtered_objects.append(obj)
                        break
            objects = filtered_objects

        def to_minimal_payload(obj):
            data = obj.to_dict(include_data=True).get('data', {})
            minimal_fields = {
                'namn',
                'name',
                'beskrivning',
                'description',
                'description - short',
                'description short',
                'kort beskrivning'
            }
            payload = {
                'id': obj.id,
                'id_full': obj.id_full,
                'object_type': {
                    'id': obj.object_type.id if obj.object_type else None,
                    'name': obj.object_type.name if obj.object_type else None
                },
                'data': {
                    key: value
                    for key, value in data.items()
                    if key.lower() in minimal_fields
                }
            }
            return enrich_object_with_file_metadata(payload, obj, relations_lookup)

        if page and per_page:
            total = len(objects)
            total_pages = max((total + per_page - 1) // per_page, 1)
            page = min(max(page, 1), total_pages)
            start_index = (page - 1) * per_page
            end_index = start_index + per_page
            page_objects = objects[start_index:end_index]

            items = [to_minimal_payload(obj) for obj in page_objects] if minimal else [
                enrich_object_with_file_metadata(obj.to_dict(include_data=True), obj, relations_lookup)
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
            enrich_object_with_file_metadata(obj.to_dict(include_data=True), obj, relations_lookup)
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
            required_overrides = get_required_overrides_map(obj.id)
            enrich_object_type_fields_with_effective_required(result, required_overrides)
            result['field_overrides'] = [
                {
                    'field_id': field_id,
                    'is_required_override': override_value
                }
                for field_id, override_value in required_overrides.items()
            ]
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
                required_overrides = get_required_overrides_map(obj.id)
                enrich_object_type_fields_with_effective_required(result, required_overrides)
                result['field_overrides'] = [
                    {
                        'field_id': field_id,
                        'is_required_override': override_value
                    }
                    for field_id, override_value in required_overrides.items()
                ]
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
        is_valid, errors = validate_object_data(object_type.fields, object_data, {})
        if not is_valid:
            return jsonify({'error': 'Validation failed', 'details': errors}), 400
        
        # Generate BaseID + version. If main_id is provided, create a version in that series.
        requested_main_id = normalize_base_id(data.get('main_id'))
        if requested_main_id:
            main_id = requested_main_id
            requested_version = data.get('version')
            version = normalize_version(requested_version) if requested_version else get_next_version_for_base_id(main_id)
        else:
            main_id = generate_base_id(object_type.name)
            version = normalize_version(data.get('version') or 'v1')

        id_full = compose_full_id(main_id, version)

        if Object.query.filter_by(id_full=id_full).first():
            return jsonify({'error': f'Object with ID {id_full} already exists'}), 409

        status = data.get('status', 'In work')
        
        # Create object
        obj = Object(
            object_type_id=object_type.id,
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
            should_store = has_meaningful_value(value) or bool(field.force_presence_on_all_objects)
            if not should_store:
                continue

            obj_data = ObjectData(
                object_id=obj.id,
                field_id=field.id
            )
            set_object_data_value(obj_data, field.field_type, value, field.field_options)
            db.session.add(obj_data)
        
        db.session.commit()
        
        logger.info(f"Created object: {obj.id_full}")
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
        field_overrides_payload = data.get('field_overrides')

        # Connection objects: always generate name from Del A + Del B (alphabetical order).
        is_connection_valid, connection_errors, object_data = apply_connection_name_rules(obj.object_type, object_data)
        if not is_connection_valid:
            return jsonify({'error': 'Validation failed', 'details': connection_errors}), 400

        # Compute pending required overrides (including payload changes) before validation.
        required_overrides = get_required_overrides_map(obj.id)
        pending_required_overrides = dict(required_overrides)
        fields_by_id = {field.id: field for field in obj.object_type.fields}
        normalized_override_payload = []

        if field_overrides_payload is not None:
            if not isinstance(field_overrides_payload, list):
                return jsonify({'error': 'field_overrides must be a list'}), 400

            for item in field_overrides_payload:
                field_id = item.get('field_id')
                override_value = item.get('is_required_override')

                if not isinstance(field_id, int) or field_id not in fields_by_id:
                    return jsonify({'error': f'Invalid field_id in field_overrides: {field_id}'}), 400

                if override_value is not None and not isinstance(override_value, bool):
                    return jsonify({'error': f'is_required_override for field {field_id} must be boolean or null'}), 400

                field = fields_by_id[field_id]
                if field.lock_required_setting and override_value is not None and bool(override_value) != bool(field.is_required):
                    return jsonify({'error': f"Field '{field.field_name}' has locked required setting and cannot be overridden"}), 400

                normalized_override_payload.append({
                    'field_id': field_id,
                    'is_required_override': override_value
                })
                if override_value is None:
                    pending_required_overrides.pop(field_id, None)
                else:
                    pending_required_overrides[field_id] = bool(override_value)

        # Validate object data against fields and pending overrides
        is_valid, errors = validate_object_data(obj.object_type.fields, object_data, pending_required_overrides)
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
            
            if has_meaningful_value(value):
                if not existing:
                    existing = ObjectData(
                        object_id=obj.id,
                        field_id=field.id
                    )
                    db.session.add(existing)

                set_object_data_value(existing, field.field_type, value, field.field_options)
                existing.updated_at = datetime.utcnow()
            elif field.force_presence_on_all_objects:
                if not existing:
                    existing = ObjectData(
                        object_id=obj.id,
                        field_id=field.id
                    )
                    db.session.add(existing)
                set_object_data_value(existing, field.field_type, None, field.field_options)
                existing.updated_at = datetime.utcnow()
            elif existing:
                # Remove if value is empty
                db.session.delete(existing)

        # Persist override updates (if provided) in same transaction as object update.
        for item in normalized_override_payload:
            field_id = item['field_id']
            override_value = item['is_required_override']
            existing_override = ObjectFieldOverride.query.filter_by(object_id=obj.id, field_id=field_id).first()

            if override_value is None:
                if existing_override:
                    db.session.delete(existing_override)
                continue

            if not existing_override:
                existing_override = ObjectFieldOverride(object_id=obj.id, field_id=field_id)
                db.session.add(existing_override)
            existing_override.is_required_override = bool(override_value)

        obj.updated_at = datetime.utcnow()
        db.session.commit()
        
        logger.info(f"Updated object: {obj.id_full}")
        return jsonify(obj.to_dict(include_data=True)), 200
    except Exception as e:
        db.session.rollback()
        logger.error(f"Error updating object: {str(e)}")
        return jsonify({'error': 'Failed to update object', 'details': str(e)}), 500


@bp.route('/<int:id>/field-overrides', methods=['GET'])
def get_object_field_overrides(id):
    """Get object-level field overrides for required settings."""
    try:
        obj = Object.query.get_or_404(id)
        overrides = ObjectFieldOverride.query.filter_by(object_id=obj.id).all()
        required_overrides = get_required_overrides_map(obj.id)

        payload = []
        for field in obj.object_type.fields:
            override_entry = next((item for item in overrides if item.field_id == field.id), None)
            payload.append({
                'field_id': field.id,
                'field_name': field.field_name,
                'default_required': bool(field.is_required),
                'lock_required_setting': bool(field.lock_required_setting),
                'effective_required': get_effective_required_for_field(field, required_overrides),
                'is_required_override': override_entry.is_required_override if override_entry else None
            })

        return jsonify(payload), 200
    except Exception as e:
        logger.error(f"Error getting field overrides for object {id}: {str(e)}")
        return jsonify({'error': 'Failed to get field overrides'}), 500


@bp.route('/<int:id>/field-overrides', methods=['PUT'])
def update_object_field_overrides(id):
    """Set object-level field required overrides."""
    try:
        obj = Object.query.get_or_404(id)
        data = request.get_json() or {}
        overrides_payload = data.get('overrides')
        if not isinstance(overrides_payload, list):
            return jsonify({'error': 'overrides must be a list'}), 400

        fields_by_id = {field.id: field for field in obj.object_type.fields}
        for item in overrides_payload:
            field_id = item.get('field_id')
            if not isinstance(field_id, int) or field_id not in fields_by_id:
                return jsonify({'error': f'Invalid field_id: {field_id}'}), 400

            override_value = item.get('is_required_override')
            if override_value is not None and not isinstance(override_value, bool):
                return jsonify({'error': f'is_required_override for field {field_id} must be boolean or null'}), 400

            field = fields_by_id[field_id]
            if field.lock_required_setting and override_value is not None and bool(override_value) != bool(field.is_required):
                return jsonify({'error': f"Field '{field.field_name}' has locked required setting and cannot be overridden"}), 400

            existing = ObjectFieldOverride.query.filter_by(object_id=obj.id, field_id=field_id).first()
            if override_value is None:
                if existing:
                    db.session.delete(existing)
                continue

            if not existing:
                existing = ObjectFieldOverride(object_id=obj.id, field_id=field_id)
                db.session.add(existing)
            existing.is_required_override = bool(override_value)

        db.session.flush()

        required_overrides = get_required_overrides_map(obj.id)
        is_valid, errors = validate_object_data(obj.object_type.fields, obj.data or {}, required_overrides)
        if not is_valid:
            db.session.rollback()
            return jsonify({'error': 'Override validation failed', 'details': errors}), 400

        db.session.commit()
        return jsonify({'message': 'Field overrides updated successfully'}), 200
    except Exception as e:
        db.session.rollback()
        logger.error(f"Error updating field overrides for object {id}: {str(e)}")
        return jsonify({'error': 'Failed to update field overrides'}), 500


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

        source_required_overrides = get_required_overrides_map(source.id)
        is_valid, errors = validate_object_data(object_type.fields, object_data, source_required_overrides)
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

        # Duplication creates a new object series by default.
        # Only reuse an existing BaseID when the client explicitly requests main_id.
        requested_main_id = normalize_base_id(payload.get('main_id'))
        requested_version = payload.get('version')
        if requested_main_id:
            main_id = requested_main_id
            version = normalize_version(requested_version) if requested_version else get_next_version_for_base_id(main_id)
        else:
            main_id = generate_base_id(object_type.name)
            version = normalize_version(requested_version or 'v1')
        id_full = compose_full_id(main_id, version)

        if Object.query.filter_by(id_full=id_full).first():
            return jsonify({'error': f'Object with ID {id_full} already exists'}), 409

        duplicate = Object(
            object_type_id=object_type.id,
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
            should_store = (value is not None and value != '') or bool(field.force_presence_on_all_objects)
            if not should_store:
                continue

            copied_data = ObjectData(
                object_id=duplicate.id,
                field_id=field.id
            )
            set_object_data_value(copied_data, field.field_type, value, field.field_options)
            db.session.add(copied_data)

        source_overrides = ObjectFieldOverride.query.filter_by(object_id=source.id).all()
        for override in source_overrides:
            if override.is_required_override is None:
                continue
            duplicate_override = ObjectFieldOverride(
                object_id=duplicate.id,
                field_id=override.field_id,
                is_required_override=override.is_required_override
            )
            db.session.add(duplicate_override)

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
                max_targets_per_source=relation.max_targets_per_source,
                max_sources_per_target=relation.max_sources_per_target,
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

            relation_type = 'references_object'
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

        logger.info(f"Duplicated object {source.id_full} -> {duplicate.id_full}")
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
        object_id_full = obj.id_full

        removed_paths = []
        for document in list(obj.documents):
            for candidate in get_document_storage_candidates(document):
                if os.path.exists(candidate):
                    os.remove(candidate)
                    removed_paths.append(candidate)
        
        db.session.delete(obj)
        db.session.commit()
        
        logger.info(f"Deleted object: {object_id_full}; removed_files={removed_paths}")
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
            return jsonify(build_tree_root_nodes(root_objects, view_config, tree_view=tree_view)), 200
            relations_lookup = build_relations_lookup([obj.id for obj in root_objects])
            return jsonify(build_tree_root_nodes(root_objects, view_config, relations_lookup=relations_lookup)), 200

        return jsonify(build_category_group_tree(root_objects, tree_view, view_config)), 200
    except Exception as e:
        logger.error(f"Error getting tree: {str(e)}")
        return jsonify({'error': 'Failed to get tree'}), 500
