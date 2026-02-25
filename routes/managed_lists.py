from flask import Blueprint, request, jsonify
from models import db
from models.managed_list import ManagedList
from models.managed_list_item import ManagedListItem
import logging

logger = logging.getLogger(__name__)
bp = Blueprint('managed_lists', __name__, url_prefix='/api/managed-lists')


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


@bp.route('', methods=['GET'])
def list_managed_lists():
    """List all managed lists."""
    try:
        include_inactive = request.args.get('include_inactive', 'false').lower() == 'true'
        include_items = request.args.get('include_items', 'false').lower() == 'true'
        include_inactive_items = request.args.get('include_inactive_items', 'false').lower() == 'true'

        query = ManagedList.query
        if not include_inactive:
            query = query.filter_by(is_active=True)

        lists = query.order_by(ManagedList.name.asc()).all()
        return jsonify([
            managed_list.to_dict(
                include_items=include_items,
                include_inactive_items=include_inactive_items
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
        managed_list = ManagedList.query.get_or_404(list_id)
        return jsonify(managed_list.to_dict(include_items=include_items, include_inactive_items=include_inactive_items)), 200
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

        managed_list = ManagedList(
            name=name,
            description=(data.get('description') or '').strip() or None,
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
        db.session.delete(managed_list)
        db.session.commit()
        return jsonify({'message': 'Managed list deleted successfully'}), 200
    except Exception as e:
        db.session.rollback()
        logger.error(f"Error deleting managed list {list_id}: {str(e)}")
        return jsonify({'error': 'Failed to delete managed list'}), 500


@bp.route('/<int:list_id>/items', methods=['GET'])
def list_managed_list_items(list_id):
    """List rows for one managed list."""
    try:
        ManagedList.query.get_or_404(list_id)
        include_inactive = request.args.get('include_inactive', 'false').lower() == 'true'

        query = ManagedListItem.query.filter_by(list_id=list_id)
        if not include_inactive:
            query = query.filter_by(is_active=True)

        items = query.order_by(ManagedListItem.sort_order.asc(), ManagedListItem.value.asc()).all()
        return jsonify([item.to_dict() for item in items]), 200
    except Exception as e:
        logger.error(f"Error listing managed list items for list {list_id}: {str(e)}")
        return jsonify({'error': 'Failed to list managed list items'}), 500


@bp.route('/<int:list_id>/items', methods=['POST'])
def create_managed_list_item(list_id):
    """Create a row for one managed list."""
    try:
        ManagedList.query.get_or_404(list_id)
        data = request.get_json() or {}
        value = (data.get('value') or '').strip()
        if not value:
            return jsonify({'error': 'value is required'}), 400

        if _find_duplicate_item_value(list_id, value):
            return jsonify({'error': 'Row with this value already exists in the list'}), 400

        max_order = db.session.query(db.func.max(ManagedListItem.sort_order)).filter_by(list_id=list_id).scalar()
        next_order = (max_order or 0) + 1

        item = ManagedListItem(
            list_id=list_id,
            value=value,
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
        ManagedList.query.get_or_404(list_id)
        item = ManagedListItem.query.filter_by(id=item_id, list_id=list_id).first_or_404()
        data = request.get_json() or {}

        if 'value' in data:
            value = (data.get('value') or '').strip()
            if not value:
                return jsonify({'error': 'value cannot be empty'}), 400
            if _find_duplicate_item_value(list_id, value, exclude_id=item_id):
                return jsonify({'error': 'Row with this value already exists in the list'}), 400
            item.value = value

        if 'sort_order' in data:
            item.sort_order = int(data['sort_order'])

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
        db.session.delete(item)
        db.session.commit()
        return jsonify({'message': 'Managed list item deleted successfully'}), 200
    except Exception as e:
        db.session.rollback()
        logger.error(f"Error deleting managed list item {item_id}: {str(e)}")
        return jsonify({'error': 'Failed to delete managed list item'}), 500
