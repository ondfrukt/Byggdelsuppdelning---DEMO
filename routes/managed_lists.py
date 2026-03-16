from flask import Blueprint, request, jsonify
from models import db
from models.managed_list import ManagedList
from models.managed_list_item import ManagedListItem
from models.managed_list_link import ManagedListLink
from models.managed_list_item_link import ManagedListItemLink
from models.field_list_binding import FieldListBinding
from models.object_field import ObjectField
import logging
import json

logger = logging.getLogger(__name__)
bp = Blueprint('managed_lists', __name__, url_prefix='/api/managed-lists')


def normalize_locale(value):
    locale = str(value or '').strip().lower()
    if not locale:
        return ''
    return locale[:10]


def normalize_additional_language_code(value):
    code = normalize_locale(value)
    return code or 'fi'


def normalize_language_codes(value, fallback_additional='fi'):
    raw = value if isinstance(value, list) else []
    seen = set()
    codes = []

    for item in raw:
        code = normalize_locale(item)
        if not code or code in seen:
            continue
        seen.add(code)
        codes.append(code)

    if not codes:
        codes = ['en']

    return codes


def enforce_english_fallback(codes):
    normalized = normalize_language_codes(codes)
    if 'en' in normalized:
        ordered = ['en'] + [code for code in normalized if code != 'en']
    else:
        ordered = ['en'] + normalized
    return ordered[:10]


def get_fallback_language_code(managed_list):
    codes = enforce_english_fallback(getattr(managed_list, 'language_codes', None))
    return str(codes[0] or '').strip().lower() or 'en'


def normalize_translations(value):
    if not isinstance(value, dict):
        return {}

    normalized = {}
    for key, text in value.items():
        locale = normalize_locale(key)
        if not locale:
            continue
        normalized[locale] = str(text or '').strip()
    return normalized


def normalize_node_metadata(value):
    if isinstance(value, dict):
        return value
    return {}


def normalize_parent_item_id(value):
    if value is None:
        return None
    if isinstance(value, str):
        cleaned = value.strip().lower()
        if cleaned in ('', 'null', 'none'):
            return None
        value = cleaned
    try:
        parsed = int(value)
    except (TypeError, ValueError):
        return None
    return parsed if parsed > 0 else None


def _would_create_item_cycle(list_id, item_id, parent_item_id):
    current_parent_id = normalize_parent_item_id(parent_item_id)
    visited = {int(item_id)}

    while current_parent_id:
        if current_parent_id in visited:
            return True
        visited.add(current_parent_id)

        parent_item = ManagedListItem.query.filter_by(id=current_parent_id, list_id=list_id).first()
        if not parent_item:
            return False
        current_parent_id = normalize_parent_item_id(parent_item.parent_item_id)

    return False


def get_requested_locale():
    query_locale = normalize_locale(request.args.get('locale'))
    if query_locale:
        return query_locale

    header = str(request.headers.get('Accept-Language') or '').strip()
    if not header:
        return ''

    first_part = header.split(',', 1)[0]
    locale = first_part.split(';', 1)[0]
    return normalize_locale(locale)


def _find_duplicate_list_name(name, exclude_id=None):
    query = ManagedList.query.filter(db.func.lower(ManagedList.name) == name.lower())
    if exclude_id is not None:
        query = query.filter(ManagedList.id != exclude_id)
    return query.first()


def _find_duplicate_item_value(list_id, value, exclude_id=None):
    query = ManagedListItem.query.filter(
        ManagedListItem.list_id == list_id,
        db.func.lower(ManagedListItem.value) == value.lower()
    )
    if exclude_id is not None:
        query = query.filter(ManagedListItem.id != exclude_id)
    return query.first()


def _build_list_graph_edges(include_inactive=False):
    query = ManagedListLink.query
    if not include_inactive:
        query = query.filter_by(is_active=True)
    links = query.all()
    edges = {}
    for link in links:
        edges.setdefault(link.parent_list_id, set()).add(link.child_list_id)
    return edges


def _normalize_field_options(value):
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


def _get_list_usage_blockers(list_id):
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
        options = _normalize_field_options(field.field_options)
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


def _path_exists(edges, start_node_id, target_node_id):
    if start_node_id == target_node_id:
        return True
    visited = set()
    stack = [start_node_id]
    while stack:
        node = stack.pop()
        if node in visited:
            continue
        visited.add(node)
        for nxt in edges.get(node, set()):
            if nxt == target_node_id:
                return True
            if nxt not in visited:
                stack.append(nxt)
    return False


def _validate_item_link_membership(list_link, parent_item, child_item):
    if parent_item.list_id != list_link.parent_list_id:
        return f"parent_item_id {parent_item.id} does not belong to parent_list_id {list_link.parent_list_id}"
    if child_item.list_id != list_link.child_list_id:
        return f"child_item_id {child_item.id} does not belong to child_list_id {list_link.child_list_id}"
    return ''


@bp.route('', methods=['GET'])
def list_managed_lists():
    """List all managed lists."""
    try:
        include_inactive = request.args.get('include_inactive', 'false').lower() == 'true'
        include_items = request.args.get('include_items', 'false').lower() == 'true'
        include_inactive_items = request.args.get('include_inactive_items', 'false').lower() == 'true'
        include_links = request.args.get('include_links', 'false').lower() == 'true'
        locale = get_requested_locale()

        query = ManagedList.query
        if not include_inactive:
            query = query.filter_by(is_active=True)

        lists = query.order_by(ManagedList.name.asc()).all()
        return jsonify([
            managed_list.to_dict(
                include_items=include_items,
                include_inactive_items=include_inactive_items,
                locale=locale,
                include_links=include_links
            )
            for managed_list in lists
        ]), 200
    except Exception as e:
        logger.error(f"Error listing managed lists: {str(e)}")
        return jsonify({'error': 'Failed to list managed lists'}), 500


@bp.route('/<int:list_id>', methods=['GET'])
def get_managed_list(list_id):
    """Get one managed list."""
    try:
        include_items = request.args.get('include_items', 'true').lower() == 'true'
        include_inactive_items = request.args.get('include_inactive_items', 'false').lower() == 'true'
        include_links = request.args.get('include_links', 'false').lower() == 'true'
        locale = get_requested_locale()
        managed_list = ManagedList.query.get_or_404(list_id)
        return jsonify(managed_list.to_dict(
            include_items=include_items,
            include_inactive_items=include_inactive_items,
            locale=locale,
            include_links=include_links
        )), 200
    except Exception as e:
        logger.error(f"Error getting managed list {list_id}: {str(e)}")
        return jsonify({'error': 'Failed to get managed list'}), 500


@bp.route('', methods=['POST'])
def create_managed_list():
    """Create a managed list."""
    try:
        data = request.get_json() or {}
        name = (data.get('name') or '').strip()
        if not name:
            return jsonify({'error': 'name is required'}), 400

        if _find_duplicate_list_name(name):
            return jsonify({'error': 'List with this name already exists'}), 400

        language_codes = normalize_language_codes(
            data.get('language_codes'),
            fallback_additional=data.get('additional_language_code')
        )
        language_codes = enforce_english_fallback(language_codes)
        additional_language_code = normalize_additional_language_code(data.get('additional_language_code'))
        has_explicit_additional = 'additional_language_code' in data and str(data.get('additional_language_code') or '').strip() != ''
        if additional_language_code == 'en':
            additional_language_code = next((code for code in language_codes if code != 'en'), 'en')
        elif has_explicit_additional and additional_language_code not in language_codes:
            language_codes.append(additional_language_code)
            language_codes = enforce_english_fallback(language_codes)
        if len(language_codes) >= 2:
            additional_language_code = next((code for code in language_codes if code != 'en'), 'en')
        else:
            additional_language_code = 'en'

        managed_list = ManagedList(
            name=name,
            description=(data.get('description') or '').strip() or None,
            additional_language_code=additional_language_code,
            language_codes=language_codes,
            is_active=bool(data.get('is_active', True))
        )
        db.session.add(managed_list)
        db.session.commit()
        return jsonify(managed_list.to_dict()), 201
    except Exception as e:
        db.session.rollback()
        logger.error(f"Error creating managed list: {str(e)}")
        return jsonify({'error': 'Failed to create managed list'}), 500


@bp.route('/<int:list_id>', methods=['PUT'])
def update_managed_list(list_id):
    """Update a managed list."""
    try:
        managed_list = ManagedList.query.get_or_404(list_id)
        data = request.get_json() or {}

        if 'name' in data:
            new_name = (data.get('name') or '').strip()
            if not new_name:
                return jsonify({'error': 'name cannot be empty'}), 400
            if _find_duplicate_list_name(new_name, exclude_id=list_id):
                return jsonify({'error': 'List with this name already exists'}), 400
            managed_list.name = new_name

        if 'description' in data:
            managed_list.description = (data.get('description') or '').strip() or None

        if 'additional_language_code' in data:
            managed_list.additional_language_code = normalize_additional_language_code(data.get('additional_language_code'))

        if 'language_codes' in data:
            managed_list.language_codes = normalize_language_codes(
                data.get('language_codes'),
                fallback_additional=data.get('additional_language_code') or managed_list.additional_language_code
            )
        normalized_codes = enforce_english_fallback(
            normalize_language_codes(
                managed_list.language_codes,
                fallback_additional=managed_list.additional_language_code
            )
        )
        managed_list.language_codes = normalized_codes
        managed_list.additional_language_code = next((code for code in normalized_codes if code != 'en'), 'en')

        if 'is_active' in data:
            managed_list.is_active = bool(data['is_active'])

        db.session.commit()
        return jsonify(managed_list.to_dict()), 200
    except Exception as e:
        db.session.rollback()
        logger.error(f"Error updating managed list {list_id}: {str(e)}")
        return jsonify({'error': 'Failed to update managed list'}), 500


@bp.route('/<int:list_id>', methods=['DELETE'])
def delete_managed_list(list_id):
    """Delete a managed list."""
    try:
        managed_list = ManagedList.query.get_or_404(list_id)
        blockers = _get_list_usage_blockers(list_id)
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
        return jsonify({'message': 'Managed list deleted successfully'}), 200
    except Exception as e:
        db.session.rollback()
        logger.error(f"Error deleting managed list {list_id}: {str(e)}", exc_info=True)
        return jsonify({'error': 'Failed to delete managed list', 'details': str(e)}), 500


@bp.route('/links', methods=['GET'])
def list_managed_list_links():
    """List directed list->list links."""
    try:
        include_inactive = request.args.get('include_inactive', 'false').lower() == 'true'
        parent_list_id = request.args.get('parent_list_id', type=int)
        child_list_id = request.args.get('child_list_id', type=int)

        query = ManagedListLink.query
        if not include_inactive:
            query = query.filter_by(is_active=True)
        if parent_list_id:
            query = query.filter_by(parent_list_id=parent_list_id)
        if child_list_id:
            query = query.filter_by(child_list_id=child_list_id)

        links = query.order_by(ManagedListLink.parent_list_id.asc(), ManagedListLink.child_list_id.asc()).all()
        return jsonify([link.to_dict() for link in links]), 200
    except Exception as e:
        logger.error(f"Error listing managed list links: {str(e)}")
        return jsonify({'error': 'Failed to list managed list links'}), 500


@bp.route('/links', methods=['POST'])
def create_managed_list_link():
    """Create directed list->list link with cycle protection."""
    try:
        data = request.get_json() or {}
        parent_list_id = int(data.get('parent_list_id') or 0)
        child_list_id = int(data.get('child_list_id') or 0)
        relation_key = str(data.get('relation_key') or 'depends_on').strip() or 'depends_on'

        if not parent_list_id or not child_list_id:
            return jsonify({'error': 'parent_list_id and child_list_id are required'}), 400
        if parent_list_id == child_list_id:
            return jsonify({'error': 'parent_list_id and child_list_id cannot be the same'}), 400

        ManagedList.query.get_or_404(parent_list_id)
        ManagedList.query.get_or_404(child_list_id)

        existing = ManagedListLink.query.filter_by(
            parent_list_id=parent_list_id,
            child_list_id=child_list_id,
            relation_key=relation_key
        ).first()
        if existing:
            if not existing.is_active:
                existing.is_active = True
                db.session.commit()
            return jsonify(existing.to_dict()), 200

        edges = _build_list_graph_edges(include_inactive=False)
        if _path_exists(edges, child_list_id, parent_list_id):
            return jsonify({'error': 'Link would create a cycle in list graph'}), 400

        link = ManagedListLink(
            parent_list_id=parent_list_id,
            child_list_id=child_list_id,
            relation_key=relation_key,
            is_active=True
        )
        db.session.add(link)
        db.session.commit()
        return jsonify(link.to_dict()), 201
    except Exception as e:
        db.session.rollback()
        logger.error(f"Error creating managed list link: {str(e)}")
        return jsonify({'error': 'Failed to create managed list link'}), 500


@bp.route('/links/<int:link_id>', methods=['DELETE'])
def delete_managed_list_link(link_id):
    """Delete one directed list->list link."""
    try:
        link = ManagedListLink.query.get_or_404(link_id)
        db.session.delete(link)
        db.session.commit()
        return jsonify({'message': 'Managed list link deleted successfully'}), 200
    except Exception as e:
        db.session.rollback()
        logger.error(f"Error deleting managed list link {link_id}: {str(e)}")
        return jsonify({'error': 'Failed to delete managed list link'}), 500


@bp.route('/<int:list_id>/children', methods=['GET'])
def list_managed_list_children(list_id):
    """List child lists for a parent list."""
    try:
        ManagedList.query.get_or_404(list_id)
        include_inactive = request.args.get('include_inactive', 'false').lower() == 'true'
        query = ManagedListLink.query.filter_by(parent_list_id=list_id)
        if not include_inactive:
            query = query.filter_by(is_active=True)
        links = query.order_by(ManagedListLink.child_list_id.asc()).all()
        payload = []
        for link in links:
            child = ManagedList.query.get(link.child_list_id)
            if not child:
                continue
            payload.append({
                'link': link.to_dict(),
                'list': child.to_dict(include_items=False, include_links=False)
            })
        return jsonify(payload), 200
    except Exception as e:
        logger.error(f"Error listing child lists for list {list_id}: {str(e)}")
        return jsonify({'error': 'Failed to list child lists'}), 500


@bp.route('/<int:list_id>/parents', methods=['GET'])
def list_managed_list_parents(list_id):
    """List parent lists for a child list."""
    try:
        ManagedList.query.get_or_404(list_id)
        include_inactive = request.args.get('include_inactive', 'false').lower() == 'true'
        query = ManagedListLink.query.filter_by(child_list_id=list_id)
        if not include_inactive:
            query = query.filter_by(is_active=True)
        links = query.order_by(ManagedListLink.parent_list_id.asc()).all()
        payload = []
        for link in links:
            parent = ManagedList.query.get(link.parent_list_id)
            if not parent:
                continue
            payload.append({
                'link': link.to_dict(),
                'list': parent.to_dict(include_items=False, include_links=False)
            })
        return jsonify(payload), 200
    except Exception as e:
        logger.error(f"Error listing parent lists for list {list_id}: {str(e)}")
        return jsonify({'error': 'Failed to list parent lists'}), 500


@bp.route('/item-links', methods=['GET'])
def list_managed_list_item_links():
    """List directed item->item links."""
    try:
        include_inactive = request.args.get('include_inactive', 'false').lower() == 'true'
        list_link_id = request.args.get('list_link_id', type=int)
        parent_item_id = request.args.get('parent_item_id', type=int)
        child_item_id = request.args.get('child_item_id', type=int)

        query = ManagedListItemLink.query
        if not include_inactive:
            query = query.filter_by(is_active=True)
        if list_link_id:
            query = query.filter_by(list_link_id=list_link_id)
        if parent_item_id:
            query = query.filter_by(parent_item_id=parent_item_id)
        if child_item_id:
            query = query.filter_by(child_item_id=child_item_id)

        item_links = query.order_by(ManagedListItemLink.id.asc()).all()
        return jsonify([item_link.to_dict() for item_link in item_links]), 200
    except Exception as e:
        logger.error(f"Error listing managed list item links: {str(e)}")
        return jsonify({'error': 'Failed to list managed list item links'}), 500


@bp.route('/item-links', methods=['POST'])
def create_managed_list_item_link():
    """Create directed item->item link constrained by a list->list link."""
    try:
        data = request.get_json() or {}
        list_link_id = int(data.get('list_link_id') or 0)
        parent_item_id = int(data.get('parent_item_id') or 0)
        child_item_id = int(data.get('child_item_id') or 0)

        if not list_link_id or not parent_item_id or not child_item_id:
            return jsonify({'error': 'list_link_id, parent_item_id and child_item_id are required'}), 400
        if parent_item_id == child_item_id:
            return jsonify({'error': 'parent_item_id and child_item_id cannot be the same'}), 400

        list_link = ManagedListLink.query.get_or_404(list_link_id)
        parent_item = ManagedListItem.query.get_or_404(parent_item_id)
        child_item = ManagedListItem.query.get_or_404(child_item_id)

        validation_error = _validate_item_link_membership(list_link, parent_item, child_item)
        if validation_error:
            return jsonify({'error': validation_error}), 400

        existing = ManagedListItemLink.query.filter_by(
            list_link_id=list_link_id,
            parent_item_id=parent_item_id,
            child_item_id=child_item_id
        ).first()
        if existing:
            if not existing.is_active:
                existing.is_active = True
                db.session.commit()
            return jsonify(existing.to_dict()), 200

        item_link = ManagedListItemLink(
            list_link_id=list_link_id,
            parent_item_id=parent_item_id,
            child_item_id=child_item_id,
            is_active=True
        )
        db.session.add(item_link)
        db.session.commit()
        return jsonify(item_link.to_dict()), 201
    except Exception as e:
        db.session.rollback()
        logger.error(f"Error creating managed list item link: {str(e)}")
        return jsonify({'error': 'Failed to create managed list item link'}), 500


@bp.route('/item-links/<int:item_link_id>', methods=['DELETE'])
def delete_managed_list_item_link(item_link_id):
    """Delete one directed item->item link."""
    try:
        item_link = ManagedListItemLink.query.get_or_404(item_link_id)
        db.session.delete(item_link)
        db.session.commit()
        return jsonify({'message': 'Managed list item link deleted successfully'}), 200
    except Exception as e:
        db.session.rollback()
        logger.error(f"Error deleting managed list item link {item_link_id}: {str(e)}")
        return jsonify({'error': 'Failed to delete managed list item link'}), 500


@bp.route('/<int:list_id>/items', methods=['GET'])
def list_managed_list_items(list_id):
    """List rows for one managed list."""
    try:
        managed_list = ManagedList.query.get_or_404(list_id)
        fallback_language_code = get_fallback_language_code(managed_list)
        include_inactive = request.args.get('include_inactive', 'false').lower() == 'true'
        parent_item_id = request.args.get('parent_item_id', type=int)
        tree_parent_item_id_raw = request.args.get('tree_parent_item_id')
        list_link_id = request.args.get('list_link_id', type=int)
        parent_list_id = request.args.get('parent_list_id', type=int)
        locale = get_requested_locale()

        query = ManagedListItem.query.filter_by(list_id=list_id)
        if not include_inactive:
            query = query.filter_by(is_active=True)

        if tree_parent_item_id_raw is not None:
            tree_parent_item_id = normalize_parent_item_id(tree_parent_item_id_raw)
            if tree_parent_item_id is None:
                query = query.filter(ManagedListItem.parent_item_id.is_(None))
            else:
                parent_item = ManagedListItem.query.filter_by(
                    id=tree_parent_item_id,
                    list_id=list_id
                ).first()
                if not parent_item:
                    return jsonify({'error': 'tree_parent_item_id does not belong to this list'}), 400
                query = query.filter_by(parent_item_id=tree_parent_item_id)
        elif parent_item_id:
            filtered_query = query.join(
                ManagedListItemLink,
                ManagedListItem.id == ManagedListItemLink.child_item_id
            ).filter(
                ManagedListItemLink.parent_item_id == parent_item_id
            )
            if not include_inactive:
                filtered_query = filtered_query.filter(ManagedListItemLink.is_active.is_(True))
            if list_link_id:
                filtered_query = filtered_query.filter(ManagedListItemLink.list_link_id == list_link_id)
            elif parent_list_id:
                filtered_query = filtered_query.join(
                    ManagedListLink,
                    ManagedListItemLink.list_link_id == ManagedListLink.id
                ).filter(ManagedListLink.parent_list_id == parent_list_id)
            query = filtered_query

        items = query.order_by(ManagedListItem.sort_order.asc(), ManagedListItem.value.asc()).all()
        return jsonify([
            item.to_dict(locale=locale, fallback_language_code=fallback_language_code)
            for item in items
        ]), 200
    except Exception as e:
        logger.error(f"Error listing managed list items for list {list_id}: {str(e)}")
        return jsonify({'error': 'Failed to list managed list items'}), 500


@bp.route('/<int:list_id>/items', methods=['POST'])
def create_managed_list_item(list_id):
    """Create a row for one managed list."""
    try:
        managed_list = ManagedList.query.get_or_404(list_id)
        fallback_language_code = get_fallback_language_code(managed_list)
        data = request.get_json() or {}
        translations = normalize_translations(data.get('value_translations'))
        value = (data.get('value') or '').strip()
        if not value:
            value = str(translations.get(fallback_language_code) or '').strip()
        if not value:
            return jsonify({'error': f'value is required ({fallback_language_code}/fallback)'}), 400

        if not translations.get(fallback_language_code):
            translations[fallback_language_code] = value

        if _find_duplicate_item_value(list_id, value):
            return jsonify({'error': 'Row with this value already exists in the list'}), 400

        parent_item_id = normalize_parent_item_id(data.get('parent_item_id'))
        if parent_item_id is not None:
            parent_item = ManagedListItem.query.filter_by(id=parent_item_id, list_id=list_id).first()
            if not parent_item:
                return jsonify({'error': 'parent_item_id does not belong to this list'}), 400

        max_order = db.session.query(db.func.max(ManagedListItem.sort_order)).filter_by(list_id=list_id).scalar()
        next_order = (max_order or 0) + 1

        item = ManagedListItem(
            list_id=list_id,
            value=value,
            parent_item_id=parent_item_id,
            value_translations=translations,
            node_metadata=normalize_node_metadata(data.get('node_metadata')),
            sort_order=int(data.get('sort_order', next_order)),
            is_active=bool(data.get('is_active', True))
        )

        db.session.add(item)
        db.session.commit()
        return jsonify(item.to_dict()), 201
    except Exception as e:
        db.session.rollback()
        logger.error(f"Error creating managed list item for list {list_id}: {str(e)}")
        return jsonify({'error': 'Failed to create managed list item'}), 500


@bp.route('/<int:list_id>/items/<int:item_id>', methods=['PUT'])
def update_managed_list_item(list_id, item_id):
    """Update one list row."""
    try:
        managed_list = ManagedList.query.get_or_404(list_id)
        fallback_language_code = get_fallback_language_code(managed_list)
        item = ManagedListItem.query.filter_by(id=item_id, list_id=list_id).first_or_404()
        data = request.get_json() or {}

        if 'value_translations' in data:
            translations = normalize_translations(data.get('value_translations'))
            existing = item.value_translations or {}
            merged_translations = {
                **existing,
                **translations
            }
            fallback_translation = str((merged_translations or {}).get(fallback_language_code) or '').strip()
            if fallback_translation:
                if _find_duplicate_item_value(list_id, fallback_translation, exclude_id=item_id):
                    return jsonify({'error': 'Row with this value already exists in the list'}), 400
                item.value = fallback_translation
            item.value_translations = merged_translations

        if 'value' in data:
            value = (data.get('value') or '').strip()
            if not value:
                return jsonify({'error': 'value cannot be empty'}), 400
            if _find_duplicate_item_value(list_id, value, exclude_id=item_id):
                return jsonify({'error': 'Row with this value already exists in the list'}), 400
            item.value = value
            translations = item.value_translations or {}
            if not str(translations.get(fallback_language_code) or '').strip():
                translations[fallback_language_code] = value
                item.value_translations = translations

        if 'sort_order' in data:
            item.sort_order = int(data['sort_order'])

        if 'parent_item_id' in data:
            parent_item_id = normalize_parent_item_id(data.get('parent_item_id'))
            if parent_item_id is not None:
                if int(parent_item_id) == int(item_id):
                    return jsonify({'error': 'parent_item_id cannot be the same as item id'}), 400

                parent_item = ManagedListItem.query.filter_by(id=parent_item_id, list_id=list_id).first()
                if not parent_item:
                    return jsonify({'error': 'parent_item_id does not belong to this list'}), 400

                if _would_create_item_cycle(list_id, item_id, parent_item_id):
                    return jsonify({'error': 'parent_item_id would create a cycle'}), 400

            item.parent_item_id = parent_item_id

        if 'node_metadata' in data:
            item.node_metadata = normalize_node_metadata(data.get('node_metadata'))

        if 'is_active' in data:
            item.is_active = bool(data['is_active'])

        db.session.commit()
        return jsonify(item.to_dict()), 200
    except Exception as e:
        db.session.rollback()
        logger.error(f"Error updating managed list item {item_id}: {str(e)}")
        return jsonify({'error': 'Failed to update managed list item'}), 500


@bp.route('/<int:list_id>/items/<int:item_id>', methods=['DELETE'])
def delete_managed_list_item(list_id, item_id):
    """Delete one list row."""
    try:
        ManagedList.query.get_or_404(list_id)
        item = ManagedListItem.query.filter_by(id=item_id, list_id=list_id).first_or_404()
        has_children = ManagedListItem.query.filter_by(list_id=list_id, parent_item_id=item_id).first()
        if has_children:
            return jsonify({'error': 'Cannot delete item with children. Move or delete child items first.'}), 400
        db.session.delete(item)
        db.session.commit()
        return jsonify({'message': 'Managed list item deleted successfully'}), 200
    except Exception as e:
        db.session.rollback()
        logger.error(f"Error deleting managed list item {item_id}: {str(e)}")
        return jsonify({'error': 'Failed to delete managed list item'}), 500
