from datetime import datetime
import csv
import io
import json
import logging
import re

from flask import Blueprint, jsonify, request, Response

from models import db
from models.managed_list import ManagedList
from models.managed_list_item import ManagedListItem
from models.managed_list_link import ManagedListLink
from models.managed_list_item_link import ManagedListItemLink
from models.field_list_binding import FieldListBinding
from models.object_type import ObjectType
from models.object_field import ObjectField

logger = logging.getLogger(__name__)
bp = Blueprint('lists_admin', __name__, url_prefix='/api')


def slugify(value):
    base = re.sub(r'[^a-z0-9]+', '_', str(value or '').strip().lower()).strip('_')
    return base[:100] if base else ''


def normalize_bool(value, default=False):
    if value is None:
        return bool(default)
    if isinstance(value, bool):
        return value
    if isinstance(value, (int, float)):
        return bool(value)
    text = str(value).strip().lower()
    return text in ('1', 'true', 'yes', 'y', 'ja')


def normalize_selection_mode(value):
    mode = str(value or '').strip().lower()
    return 'multi' if mode == 'multi' else 'single'


def normalize_parent_id(value):
    if value in (None, '', 'null', 'None'):
        return None
    try:
        parsed = int(value)
    except (TypeError, ValueError):
        return None
    return parsed if parsed > 0 else None


def normalize_translations(value):
    if not isinstance(value, dict):
        return {}
    normalized = {}
    for raw_key, raw_value in value.items():
        key = str(raw_key or '').strip().lower()
        if not key:
            continue
        text = str(raw_value or '').strip()
        if text:
            normalized[key] = text
    return normalized


def ensure_unique_list_code(code, exclude_list_id=None):
    query = ManagedList.query.filter(db.func.lower(ManagedList.code) == str(code).lower())
    if exclude_list_id is not None:
        query = query.filter(ManagedList.id != exclude_list_id)
    return query.first() is None


def ensure_unique_item_label(list_id, label, parent_item_id=None, exclude_item_id=None):
    query = ManagedListItem.query.filter(
        ManagedListItem.list_id == list_id,
        db.func.lower(ManagedListItem.label) == str(label).lower()
    )
    if parent_item_id is None:
        query = query.filter(ManagedListItem.parent_item_id.is_(None))
    else:
        query = query.filter(ManagedListItem.parent_item_id == parent_item_id)
    if exclude_item_id is not None:
        query = query.filter(ManagedListItem.id != exclude_item_id)
    return query.first() is None


def ensure_unique_item_code(list_id, code, exclude_item_id=None):
    if not code:
        return True
    query = ManagedListItem.query.filter(
        ManagedListItem.list_id == list_id,
        db.func.lower(ManagedListItem.code) == str(code).lower()
    )
    if exclude_item_id is not None:
        query = query.filter(ManagedListItem.id != exclude_item_id)
    return query.first() is None


def compute_item_level(parent_item):
    if not parent_item:
        return 0
    return int(parent_item.level or 0) + 1


def build_tree(items):
    by_id = {int(item.id): item for item in items}
    children = {}
    for item in items:
        parent_id = int(item.parent_item_id) if item.parent_item_id and int(item.parent_item_id) in by_id else 0
        children.setdefault(parent_id, []).append(item)

    def sort_key(item):
        return (int(item.sort_order or 0), str(item.label or item.value or '').lower())

    for parent_id in list(children.keys()):
        children[parent_id].sort(key=sort_key)

    def map_node(item):
        node = item.to_dict()
        node['parent_id'] = node.get('parent_item_id')
        node['children'] = [map_node(child) for child in children.get(int(item.id), [])]
        return node

    return [map_node(item) for item in children.get(0, [])]


def path_contains_descendant(item_id, candidate_parent_id):
    current_id = normalize_parent_id(candidate_parent_id)
    visited = {int(item_id)}
    while current_id:
        if current_id in visited:
            return True
        visited.add(current_id)
        parent_item = db.session.get(ManagedListItem, current_id)
        if not parent_item:
            return False
        current_id = normalize_parent_id(parent_item.parent_item_id)
    return False


def sync_binding_to_object_field(binding):
    object_type_name = str(binding.object_type or '').strip()
    field_name = str(binding.field_name or '').strip()
    if not object_type_name or not field_name:
        return

    object_type = ObjectType.query.filter(db.func.lower(ObjectType.name) == object_type_name.lower()).first()
    if not object_type:
        return

    field = ObjectField.query.filter_by(object_type_id=object_type.id, field_name=field_name).first()
    if not field:
        return

    field.field_type = 'select'
    field.field_options = {
        'source': 'managed_list',
        'list_id': int(binding.list_id),
        'selection_mode': normalize_selection_mode(binding.selection_mode),
        'allow_only_leaf_selection': bool(binding.allow_only_leaf_selection),
    }
    field.is_required = bool(binding.is_required)


def normalize_field_options(value):
    if isinstance(value, dict):
        return value
    if isinstance(value, str):
        text = value.strip()
        if not text:
            return None
        try:
            parsed = json.loads(text)
            if isinstance(parsed, dict):
                return parsed
        except Exception:
            return None
    return None


def get_list_usage_blockers(list_id):
    """Return object fields that currently reference this managed list."""
    blockers = {}

    bindings = FieldListBinding.query.filter_by(list_id=list_id).all()
    for binding in bindings:
        object_type_name = str(binding.object_type or '').strip()
        field_name = str(binding.field_name or '').strip()
        if not object_type_name or not field_name:
            continue
        key = (object_type_name.lower(), field_name.lower())
        blockers[key] = {
            'object_type': object_type_name,
            'field_name': field_name,
            'source': 'field_list_binding'
        }

    select_fields = ObjectField.query.filter_by(field_type='select').all()
    for field in select_fields:
        options = normalize_field_options(field.field_options)
        if not options or str(options.get('source') or '').strip().lower() != 'managed_list':
            continue
        try:
            referenced_list_id = int(options.get('list_id') or 0)
        except (TypeError, ValueError):
            continue
        if referenced_list_id != int(list_id):
            continue

        object_type_name = str(field.object_type.name if field.object_type else '').strip()
        field_name = str(field.field_name or '').strip()
        if not object_type_name or not field_name:
            continue
        key = (object_type_name.lower(), field_name.lower())
        blockers[key] = {
            'object_type': object_type_name,
            'field_name': field_name,
            'source': 'object_field_options'
        }

    return sorted(
        blockers.values(),
        key=lambda item: (item['object_type'].lower(), item['field_name'].lower())
    )


@bp.route('/lists', methods=['GET'])
def list_definitions():
    try:
        include_inactive = normalize_bool(request.args.get('include_inactive'), default=False)
        search = str(request.args.get('search') or '').strip().lower()

        query = ManagedList.query
        if not include_inactive:
            query = query.filter(ManagedList.is_active.is_(True))
        if search:
            like_value = f"%{search}%"
            query = query.filter(
                db.or_(
                    db.func.lower(ManagedList.name).like(like_value),
                    db.func.lower(db.func.coalesce(ManagedList.code, '')).like(like_value)
                )
            )

        lists = query.order_by(ManagedList.name.asc()).all()
        usage_map = {
            int(row[0]): int(row[1])
            for row in db.session.query(FieldListBinding.list_id, db.func.count(FieldListBinding.id))
            .group_by(FieldListBinding.list_id)
            .all()
        }
        item_count_map = {
            int(row[0]): int(row[1])
            for row in db.session.query(ManagedListItem.list_id, db.func.count(ManagedListItem.id))
            .group_by(ManagedListItem.list_id)
            .all()
        }

        payload = []
        for managed_list in lists:
            row = managed_list.to_dict(include_items=False, include_links=False)
            row['item_count'] = item_count_map.get(int(managed_list.id), 0)
            row['used_by_fields_count'] = usage_map.get(int(managed_list.id), 0)
            payload.append(row)
        return jsonify(payload), 200
    except Exception as e:
        logger.error(f"Error listing list definitions: {str(e)}")
        return jsonify({'error': 'Failed to list definitions'}), 500


@bp.route('/lists', methods=['POST'])
def create_list_definition():
    try:
        data = request.get_json() or {}
        name = str(data.get('name') or '').strip()
        if not name:
            return jsonify({'error': 'name is required'}), 400

        requested_code = slugify(data.get('code') or name)
        if not requested_code:
            requested_code = slugify(name)
        if not requested_code:
            return jsonify({'error': 'code is required'}), 400
        if not ensure_unique_list_code(requested_code):
            return jsonify({'error': 'code must be unique'}), 400

        managed_list = ManagedList(
            name=name,
            code=requested_code,
            description=str(data.get('description') or '').strip() or None,
            allow_multiselect=normalize_bool(data.get('allow_multiselect'), default=False),
            language_codes=['en'],
            additional_language_code='en',
            is_active=normalize_bool(data.get('is_active'), default=True),
        )
        db.session.add(managed_list)
        db.session.commit()
        return jsonify(managed_list.to_dict(include_items=False, include_links=False)), 201
    except Exception as e:
        db.session.rollback()
        logger.error(f"Error creating list definition: {str(e)}")
        return jsonify({'error': 'Failed to create list'}), 500


@bp.route('/lists/<int:list_id>', methods=['GET'])
def get_list_definition(list_id):
    try:
        include_items = normalize_bool(request.args.get('include_items'), default=True)
        include_inactive_items = normalize_bool(request.args.get('include_inactive_items'), default=True)
        managed_list = ManagedList.query.get_or_404(list_id)
        payload = managed_list.to_dict(
            include_items=include_items,
            include_inactive_items=include_inactive_items,
            include_links=False
        )
        if include_items:
            payload['items'] = sorted(
                payload.get('items') or [],
                key=lambda item: (int(item.get('sort_order') or 0), str(item.get('label') or item.get('value') or '').lower())
            )
        return jsonify(payload), 200
    except Exception as e:
        logger.error(f"Error getting list definition {list_id}: {str(e)}")
        return jsonify({'error': 'Failed to get list'}), 500


@bp.route('/lists/<int:list_id>', methods=['PUT'])
def update_list_definition(list_id):
    try:
        managed_list = ManagedList.query.get_or_404(list_id)
        data = request.get_json() or {}

        if 'name' in data:
            name = str(data.get('name') or '').strip()
            if not name:
                return jsonify({'error': 'name cannot be empty'}), 400
            managed_list.name = name

        if 'code' in data:
            code = slugify(data.get('code'))
            if not code:
                return jsonify({'error': 'code cannot be empty'}), 400
            if not ensure_unique_list_code(code, exclude_list_id=list_id):
                return jsonify({'error': 'code must be unique'}), 400
            managed_list.code = code

        if 'description' in data:
            managed_list.description = str(data.get('description') or '').strip() or None
        if 'allow_multiselect' in data:
            managed_list.allow_multiselect = normalize_bool(data.get('allow_multiselect'), default=False)
        if 'is_active' in data:
            managed_list.is_active = normalize_bool(data.get('is_active'), default=True)

        managed_list.language_codes = ['en']
        managed_list.additional_language_code = 'en'
        db.session.commit()
        return jsonify(managed_list.to_dict(include_items=False, include_links=False)), 200
    except Exception as e:
        db.session.rollback()
        logger.error(f"Error updating list definition {list_id}: {str(e)}")
        return jsonify({'error': 'Failed to update list'}), 500


@bp.route('/lists/<int:list_id>', methods=['DELETE'])
def delete_list_definition(list_id):
    try:
        managed_list = ManagedList.query.get_or_404(list_id)
        blockers = get_list_usage_blockers(list_id)
        if blockers:
            refs = ', '.join(
                f"{item['object_type']}.{item['field_name']}"
                for item in blockers[:5]
            )
            if len(blockers) > 5:
                refs = f"{refs}, +{len(blockers) - 5} till"
            return jsonify({
                'error': f'Listan används av fält och kan inte tas bort ({refs})',
                'details': {
                    'list_id': int(list_id),
                    'usage_count': len(blockers),
                    'used_by_fields': blockers
                }
            }), 409

        item_ids = [
            int(row[0])
            for row in db.session.query(ManagedListItem.id)
            .filter(ManagedListItem.list_id == list_id)
            .all()
        ]
        if item_ids:
            ManagedListItemLink.query.filter(
                db.or_(
                    ManagedListItemLink.parent_item_id.in_(item_ids),
                    ManagedListItemLink.child_item_id.in_(item_ids),
                )
            ).delete(synchronize_session=False)

        # Explicitly remove list-link graph rows before deleting the list.
        # This avoids ORM trying to nullify non-null FK columns on linked rows.
        list_links = ManagedListLink.query.filter(
            db.or_(
                ManagedListLink.parent_list_id == list_id,
                ManagedListLink.child_list_id == list_id
            )
        ).all()
        link_ids = [int(link.id) for link in list_links]
        if link_ids:
            ManagedListItemLink.query.filter(
                ManagedListItemLink.list_link_id.in_(link_ids)
            ).delete(synchronize_session=False)
            ManagedListLink.query.filter(
                ManagedListLink.id.in_(link_ids)
            ).delete(synchronize_session=False)

        db.session.delete(managed_list)
        db.session.commit()
        return jsonify({'message': 'List deleted'}), 200
    except Exception as e:
        db.session.rollback()
        logger.error(f"Error deleting list definition {list_id}: {str(e)}", exc_info=True)
        return jsonify({'error': 'Failed to delete list'}), 500


@bp.route('/lists/<int:list_id>/tree', methods=['GET'])
def get_list_tree(list_id):
    try:
        managed_list = ManagedList.query.get_or_404(list_id)
        include_inactive = normalize_bool(request.args.get('include_inactive'), default=False)
        query = ManagedListItem.query.filter_by(list_id=list_id)
        if not include_inactive:
            query = query.filter(ManagedListItem.is_active.is_(True))
        items = query.all()
        return jsonify({
            'list': managed_list.to_dict(include_items=False, include_links=False),
            'tree': build_tree(items)
        }), 200
    except Exception as e:
        logger.error(f"Error getting list tree {list_id}: {str(e)}")
        return jsonify({'error': 'Failed to get list tree'}), 500


@bp.route('/lists/<int:list_id>/items', methods=['GET'])
def search_list_items(list_id):
    try:
        ManagedList.query.get_or_404(list_id)
        include_inactive = normalize_bool(request.args.get('include_inactive'), default=False)
        parent_id = normalize_parent_id(request.args.get('parent_id'))
        search = str(request.args.get('search') or '').strip().lower()

        query = ManagedListItem.query.filter_by(list_id=list_id)
        if not include_inactive:
            query = query.filter(ManagedListItem.is_active.is_(True))
        if parent_id is not None:
            query = query.filter(ManagedListItem.parent_item_id == parent_id)
        if search:
            like_value = f"%{search}%"
            query = query.filter(
                db.or_(
                    db.func.lower(db.func.coalesce(ManagedListItem.label, '')).like(like_value),
                    db.func.lower(db.func.coalesce(ManagedListItem.code, '')).like(like_value)
                )
            )
        items = query.order_by(ManagedListItem.sort_order.asc(), ManagedListItem.label.asc()).all()
        payload = []
        for item in items:
            row = item.to_dict()
            row['parent_id'] = row.get('parent_item_id')
            payload.append(row)
        return jsonify(payload), 200
    except Exception as e:
        logger.error(f"Error searching list items for list {list_id}: {str(e)}")
        return jsonify({'error': 'Failed to search list items'}), 500


@bp.route('/lists/<int:list_id>/items', methods=['POST'])
def create_list_item(list_id):
    try:
        ManagedList.query.get_or_404(list_id)
        data = request.get_json() or {}

        translations = normalize_translations(data.get('value_translations'))
        label = str(data.get('label') or data.get('value') or translations.get('en') or '').strip()
        if not label:
            return jsonify({'error': 'label is required'}), 400

        parent_id = normalize_parent_id(data.get('parent_id'))
        parent_item = None
        if parent_id is not None:
            parent_item = ManagedListItem.query.filter_by(id=parent_id, list_id=list_id).first()
            if not parent_item:
                return jsonify({'error': 'parent_id must belong to the same list'}), 400

        if not ensure_unique_item_label(list_id, label, parent_id):
            return jsonify({'error': 'label must be unique under the same parent'}), 400

        translations['en'] = label

        item_code = slugify(data.get('code') or label)
        if item_code and not ensure_unique_item_code(list_id, item_code):
            return jsonify({'error': 'code must be unique within the list'}), 400

        max_order = db.session.query(db.func.max(ManagedListItem.sort_order)).filter_by(list_id=list_id).scalar() or 0
        sort_order = int(data.get('sort_order') or (max_order + 1))

        item = ManagedListItem(
            list_id=list_id,
            code=item_code or None,
            label=label,
            description=str(data.get('description') or '').strip() or None,
            value=label,
            parent_item_id=parent_id,
            level=compute_item_level(parent_item),
            sort_order=sort_order,
            is_active=normalize_bool(data.get('is_active'), default=True),
            is_selectable=normalize_bool(data.get('is_selectable'), default=True),
            value_translations=translations
        )
        db.session.add(item)
        db.session.commit()
        payload = item.to_dict()
        payload['parent_id'] = payload.get('parent_item_id')
        return jsonify(payload), 201
    except Exception as e:
        db.session.rollback()
        logger.error(f"Error creating list item for list {list_id}: {str(e)}")
        return jsonify({'error': 'Failed to create list item'}), 500


@bp.route('/list-items/<int:item_id>', methods=['PUT'])
def update_list_item(item_id):
    try:
        item = ManagedListItem.query.get_or_404(item_id)
        data = request.get_json() or {}

        incoming_translations = None
        if 'value_translations' in data:
            incoming_translations = normalize_translations(data.get('value_translations'))

        if 'label' in data or 'value' in data or incoming_translations is not None:
            label = str(
                data.get('label')
                or data.get('value')
                or (incoming_translations or {}).get('en')
                or item.label
                or item.value
                or ''
            ).strip()
            if not label:
                return jsonify({'error': 'label cannot be empty'}), 400
            if not ensure_unique_item_label(item.list_id, label, normalize_parent_id(data.get('parent_id', item.parent_item_id)), exclude_item_id=item.id):
                return jsonify({'error': 'label must be unique under the same parent'}), 400
            item.label = label
            item.value = label
            translations = dict(item.value_translations or {})
            if incoming_translations is not None:
                translations = incoming_translations
            translations['en'] = label
            item.value_translations = translations

        if 'code' in data:
            code = slugify(data.get('code'))
            if code and not ensure_unique_item_code(item.list_id, code, exclude_item_id=item.id):
                return jsonify({'error': 'code must be unique within the list'}), 400
            item.code = code or None

        if 'description' in data:
            item.description = str(data.get('description') or '').strip() or None
        if 'sort_order' in data:
            item.sort_order = int(data.get('sort_order') or 0)
        if 'is_active' in data:
            item.is_active = normalize_bool(data.get('is_active'), default=True)
        if 'is_selectable' in data:
            item.is_selectable = normalize_bool(data.get('is_selectable'), default=True)

        if 'parent_id' in data:
            new_parent_id = normalize_parent_id(data.get('parent_id'))
            if new_parent_id == int(item.id):
                return jsonify({'error': 'item cannot be parent of itself'}), 400
            parent_item = None
            if new_parent_id is not None:
                parent_item = db.session.get(ManagedListItem, new_parent_id)
                if not parent_item or int(parent_item.list_id) != int(item.list_id):
                    return jsonify({'error': 'parent must belong to the same list'}), 400
                if path_contains_descendant(item.id, new_parent_id):
                    return jsonify({'error': 'cannot move item under its own descendant'}), 400
            item.parent_item_id = new_parent_id
            item.level = compute_item_level(parent_item)

        db.session.commit()
        payload = item.to_dict()
        payload['parent_id'] = payload.get('parent_item_id')
        return jsonify(payload), 200
    except Exception as e:
        db.session.rollback()
        logger.error(f"Error updating list item {item_id}: {str(e)}")
        return jsonify({'error': 'Failed to update list item'}), 500


@bp.route('/list-items/<int:item_id>', methods=['DELETE'])
def delete_list_item(item_id):
    try:
        item = ManagedListItem.query.get_or_404(item_id)
        has_children = ManagedListItem.query.filter_by(list_id=item.list_id, parent_item_id=item.id).first()
        if has_children:
            return jsonify({'error': 'Cannot delete item with children'}), 400
        db.session.delete(item)
        db.session.commit()
        return jsonify({'message': 'List item deleted'}), 200
    except Exception as e:
        db.session.rollback()
        logger.error(f"Error deleting list item {item_id}: {str(e)}")
        return jsonify({'error': 'Failed to delete list item'}), 500


@bp.route('/list-items/<int:item_id>/move', methods=['POST'])
def move_list_item(item_id):
    try:
        item = ManagedListItem.query.get_or_404(item_id)
        data = request.get_json() or {}
        new_parent_id = normalize_parent_id(data.get('new_parent_id'))
        if new_parent_id == int(item.id):
            return jsonify({'error': 'item cannot be parent of itself'}), 400

        parent_item = None
        if new_parent_id is not None:
            parent_item = db.session.get(ManagedListItem, new_parent_id)
            if not parent_item or int(parent_item.list_id) != int(item.list_id):
                return jsonify({'error': 'new_parent_id must belong to the same list'}), 400
            if path_contains_descendant(item.id, new_parent_id):
                return jsonify({'error': 'cannot move item under its own descendant'}), 400

        item.parent_item_id = new_parent_id
        item.level = compute_item_level(parent_item)
        if 'sort_order' in data:
            item.sort_order = int(data.get('sort_order') or 0)
        db.session.commit()
        payload = item.to_dict()
        payload['parent_id'] = payload.get('parent_item_id')
        return jsonify(payload), 200
    except Exception as e:
        db.session.rollback()
        logger.error(f"Error moving list item {item_id}: {str(e)}")
        return jsonify({'error': 'Failed to move list item'}), 500


@bp.route('/field-bindings', methods=['GET'])
def list_field_bindings():
    try:
        list_id = request.args.get('list_id', type=int)
        object_type = str(request.args.get('object_type') or '').strip().lower()
        query = FieldListBinding.query
        if list_id:
            query = query.filter_by(list_id=list_id)
        if object_type:
            query = query.filter(db.func.lower(FieldListBinding.object_type) == object_type)
        rows = query.order_by(FieldListBinding.object_type.asc(), FieldListBinding.field_name.asc()).all()
        return jsonify([row.to_dict() for row in rows]), 200
    except Exception as e:
        logger.error(f"Error listing field bindings: {str(e)}")
        return jsonify({'error': 'Failed to list field bindings'}), 500


@bp.route('/field-bindings', methods=['POST'])
def create_field_binding():
    try:
        data = request.get_json() or {}
        object_type = str(data.get('object_type') or '').strip()
        field_name = str(data.get('field_name') or '').strip()
        list_id = int(data.get('list_id') or 0)
        if not object_type or not field_name or list_id <= 0:
            return jsonify({'error': 'object_type, field_name and list_id are required'}), 400

        ManagedList.query.get_or_404(list_id)
        existing = FieldListBinding.query.filter(
            db.func.lower(FieldListBinding.object_type) == object_type.lower(),
            db.func.lower(FieldListBinding.field_name) == field_name.lower()
        ).first()
        if existing:
            return jsonify({'error': 'binding already exists for object_type + field_name'}), 400

        binding = FieldListBinding(
            object_type=object_type,
            field_name=field_name,
            list_id=list_id,
            selection_mode=normalize_selection_mode(data.get('selection_mode')),
            allow_only_leaf_selection=normalize_bool(data.get('allow_only_leaf_selection'), default=False),
            is_required=normalize_bool(data.get('is_required'), default=False),
            created_at=datetime.utcnow(),
            updated_at=datetime.utcnow(),
        )
        db.session.add(binding)
        db.session.flush()
        sync_binding_to_object_field(binding)
        db.session.commit()
        return jsonify(binding.to_dict()), 201
    except Exception as e:
        db.session.rollback()
        logger.error(f"Error creating field binding: {str(e)}")
        return jsonify({'error': 'Failed to create binding'}), 500


@bp.route('/field-bindings/<int:binding_id>', methods=['PUT'])
def update_field_binding(binding_id):
    try:
        binding = FieldListBinding.query.get_or_404(binding_id)
        data = request.get_json() or {}
        if 'list_id' in data:
            list_id = int(data.get('list_id') or 0)
            if list_id <= 0:
                return jsonify({'error': 'list_id must be > 0'}), 400
            ManagedList.query.get_or_404(list_id)
            binding.list_id = list_id
        if 'selection_mode' in data:
            binding.selection_mode = normalize_selection_mode(data.get('selection_mode'))
        if 'allow_only_leaf_selection' in data:
            binding.allow_only_leaf_selection = normalize_bool(data.get('allow_only_leaf_selection'), default=False)
        if 'is_required' in data:
            binding.is_required = normalize_bool(data.get('is_required'), default=False)
        sync_binding_to_object_field(binding)
        db.session.commit()
        return jsonify(binding.to_dict()), 200
    except Exception as e:
        db.session.rollback()
        logger.error(f"Error updating field binding {binding_id}: {str(e)}")
        return jsonify({'error': 'Failed to update binding'}), 500


@bp.route('/field-bindings/<int:binding_id>', methods=['DELETE'])
def delete_field_binding(binding_id):
    try:
        binding = FieldListBinding.query.get_or_404(binding_id)
        db.session.delete(binding)
        db.session.commit()
        return jsonify({'message': 'Binding deleted'}), 200
    except Exception as e:
        db.session.rollback()
        logger.error(f"Error deleting field binding {binding_id}: {str(e)}")
        return jsonify({'error': 'Failed to delete binding'}), 500


@bp.route('/lists/<int:list_id>/export', methods=['GET'])
def export_list(list_id):
    try:
        managed_list = ManagedList.query.get_or_404(list_id)
        export_format = str(request.args.get('format') or 'json').strip().lower()
        items = ManagedListItem.query.filter_by(list_id=list_id).order_by(ManagedListItem.sort_order.asc()).all()

        if export_format == 'csv':
            buffer = io.StringIO()
            writer = csv.writer(buffer)
            writer.writerow(['id', 'parent_id', 'code', 'label', 'description', 'sort_order', 'level', 'is_active', 'is_selectable'])
            for item in items:
                writer.writerow([
                    item.id,
                    item.parent_item_id or '',
                    item.code or '',
                    item.label or item.value or '',
                    item.description or '',
                    int(item.sort_order or 0),
                    int(item.level or 0),
                    1 if item.is_active else 0,
                    1 if item.is_selectable else 0,
                ])
            content = buffer.getvalue()
            filename = f"{managed_list.code or slugify(managed_list.name) or 'list'}_export.csv"
            return Response(
                content,
                mimetype='text/csv',
                headers={'Content-Disposition': f'attachment; filename={filename}'}
            )

        payload = {
            'list': managed_list.to_dict(include_items=False, include_links=False),
            'tree': build_tree(items),
            'items': [item.to_dict() for item in items]
        }
        return jsonify(payload), 200
    except Exception as e:
        logger.error(f"Error exporting list {list_id}: {str(e)}")
        return jsonify({'error': 'Failed to export list'}), 500


@bp.route('/lists/<int:list_id>/import', methods=['POST'])
def import_list_items(list_id):
    try:
        ManagedList.query.get_or_404(list_id)
        payload = request.get_json(silent=True) or {}
        items = payload.get('items')
        if not isinstance(items, list):
            return jsonify({'error': 'items array is required'}), 400

        created_count = 0

        def import_node(node, parent_id=None):
            nonlocal created_count
            label = str((node or {}).get('label') or '').strip()
            if not label:
                return
            body = {
                'label': label,
                'code': str((node or {}).get('code') or '').strip(),
                'description': str((node or {}).get('description') or '').strip(),
                'sort_order': int((node or {}).get('sort_order') or 0),
                'is_active': normalize_bool((node or {}).get('is_active'), default=True),
                'is_selectable': normalize_bool((node or {}).get('is_selectable'), default=True),
            }
            if parent_id is not None:
                body['parent_id'] = parent_id
            response = create_list_item_internal(list_id, body)
            if not response:
                return
            created_count += 1
            for child in ((node or {}).get('children') or []):
                import_node(child, response.id)

        for node in items:
            import_node(node, None)

        db.session.commit()
        return jsonify({'message': 'Import completed', 'created': created_count}), 200
    except Exception as e:
        db.session.rollback()
        logger.error(f"Error importing list {list_id}: {str(e)}")
        return jsonify({'error': 'Failed to import list'}), 500


def create_list_item_internal(list_id, data):
    label = str(data.get('label') or data.get('value') or '').strip()
    if not label:
        return None
    parent_id = normalize_parent_id(data.get('parent_id'))
    parent_item = None
    if parent_id is not None:
        parent_item = ManagedListItem.query.filter_by(id=parent_id, list_id=list_id).first()
        if not parent_item:
            return None
    if not ensure_unique_item_label(list_id, label, parent_id):
        return ManagedListItem.query.filter_by(list_id=list_id, label=label, parent_item_id=parent_id).first()
    item_code = slugify(data.get('code') or label)
    if item_code and not ensure_unique_item_code(list_id, item_code):
        item_code = None

    max_order = db.session.query(db.func.max(ManagedListItem.sort_order)).filter_by(list_id=list_id).scalar() or 0
    sort_order = int(data.get('sort_order') or (max_order + 1))
    item = ManagedListItem(
        list_id=list_id,
        code=item_code or None,
        label=label,
        description=str(data.get('description') or '').strip() or None,
        value=label,
        parent_item_id=parent_id,
        level=compute_item_level(parent_item),
        sort_order=sort_order,
        is_active=normalize_bool(data.get('is_active'), default=True),
        is_selectable=normalize_bool(data.get('is_selectable'), default=True),
        value_translations={'en': label}
    )
    db.session.add(item)
    db.session.flush()
    return item
