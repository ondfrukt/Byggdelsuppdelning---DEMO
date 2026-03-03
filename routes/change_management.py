from flask import Blueprint, request, jsonify
from models import db
from models.change_management_item import ChangeManagementItem
from models.change_management_impact import ChangeManagementImpact
from models.object import Object
from sqlalchemy import or_, func
import logging

logger = logging.getLogger(__name__)
bp = Blueprint('change_management', __name__, url_prefix='/api/change-management')

ALLOWED_TYPES = {'CRQ', 'CO', 'RO'}
ALLOWED_IMPACT_ACTIONS = {'to_be_replaced', 'cancellation'}


def _normalize_type(raw_type):
    return str(raw_type or '').strip().upper()


def _normalize_impact_action(raw_action):
    return str(raw_action or '').strip().lower()


def _parse_item_id(item_key):
    value = str(item_key or '').strip().upper()
    if value.startswith('CO-'):
        value = value[3:]
    if not value.isdigit():
        return None
    parsed = int(value)
    return parsed if parsed > 0 else None


def _get_item_by_key(item_key):
    item_id = _parse_item_id(item_key)
    if not item_id:
        return None
    return ChangeManagementItem.query.get(item_id)


@bp.route('', methods=['GET'])
def list_change_items():
    """List change management items."""
    try:
        item_type = _normalize_type(request.args.get('type'))
        search = str(request.args.get('search') or '').strip().lower()

        query = ChangeManagementItem.query
        if item_type:
            query = query.filter(ChangeManagementItem.item_type == item_type)

        if search:
            query = query.filter(
                or_(
                    func.lower(ChangeManagementItem.title).like(f'%{search}%'),
                    func.lower(func.coalesce(ChangeManagementItem.description, '')).like(f'%{search}%'),
                    func.lower(ChangeManagementItem.status).like(f'%{search}%'),
                )
            )

        items = query.order_by(ChangeManagementItem.id.desc()).all()
        return jsonify([item.to_dict() for item in items]), 200
    except Exception as e:
        logger.error(f"Error listing change items: {str(e)}")
        return jsonify({'error': 'Failed to list change items'}), 500


@bp.route('/<item_key>', methods=['GET'])
def get_change_item(item_key):
    """Get one change management item."""
    try:
        item = _get_item_by_key(item_key)
        if not item:
            return jsonify({'error': 'Change item not found'}), 404
        return jsonify(item.to_dict()), 200
    except Exception as e:
        logger.error(f"Error getting change item {item_key}: {str(e)}")
        return jsonify({'error': 'Failed to get change item'}), 500


@bp.route('', methods=['POST'])
def create_change_item():
    """Create a change management item."""
    try:
        payload = request.get_json() or {}
        item_type = _normalize_type(payload.get('type'))
        title = str(payload.get('title') or '').strip()

        if item_type not in ALLOWED_TYPES:
            return jsonify({'error': 'type must be one of CRQ, CO, RO'}), 400
        if not title:
            return jsonify({'error': 'title is required'}), 400

        item = ChangeManagementItem(
            item_type=item_type,
            title=title,
            description=str(payload.get('description') or '').strip() or None,
            status=str(payload.get('status') or 'Open').strip() or 'Open'
        )
        db.session.add(item)
        db.session.commit()
        return jsonify(item.to_dict()), 201
    except Exception as e:
        db.session.rollback()
        logger.error(f"Error creating change item: {str(e)}")
        return jsonify({'error': 'Failed to create change item'}), 500


@bp.route('/<item_key>', methods=['PUT'])
def update_change_item(item_key):
    """Update a change management item."""
    try:
        item = _get_item_by_key(item_key)
        if not item:
            return jsonify({'error': 'Change item not found'}), 404
        payload = request.get_json() or {}

        if 'type' in payload:
            item_type = _normalize_type(payload.get('type'))
            if item_type not in ALLOWED_TYPES:
                return jsonify({'error': 'type must be one of CRQ, CO, RO'}), 400
            item.item_type = item_type

        if 'title' in payload:
            title = str(payload.get('title') or '').strip()
            if not title:
                return jsonify({'error': 'title cannot be empty'}), 400
            item.title = title

        if 'description' in payload:
            item.description = str(payload.get('description') or '').strip() or None

        if 'status' in payload:
            item.status = str(payload.get('status') or '').strip() or 'Open'

        db.session.commit()
        return jsonify(item.to_dict()), 200
    except Exception as e:
        db.session.rollback()
        logger.error(f"Error updating change item {item_key}: {str(e)}")
        return jsonify({'error': 'Failed to update change item'}), 500


@bp.route('/<item_key>', methods=['DELETE'])
def delete_change_item(item_key):
    """Delete a change management item."""
    try:
        item = _get_item_by_key(item_key)
        if not item:
            return jsonify({'error': 'Change item not found'}), 404
        db.session.delete(item)
        db.session.commit()
        return jsonify({'message': 'Change item deleted successfully'}), 200
    except Exception as e:
        db.session.rollback()
        logger.error(f"Error deleting change item {item_key}: {str(e)}")
        return jsonify({'error': 'Failed to delete change item'}), 500


@bp.route('/<item_key>/impacts', methods=['GET'])
def list_change_item_impacts(item_key):
    """List impacted objects for one change item."""
    try:
        item = _get_item_by_key(item_key)
        if not item:
            return jsonify({'error': 'Change item not found'}), 404
        impacts = ChangeManagementImpact.query.filter_by(change_item_id=item.id).all()
        return jsonify([impact.to_dict() for impact in impacts]), 200
    except Exception as e:
        logger.error(f"Error listing impacts for change item {item_key}: {str(e)}")
        return jsonify({'error': 'Failed to list impacts'}), 500


@bp.route('/<item_key>/impacts', methods=['POST'])
def add_change_item_impact(item_key):
    """Add impacted object to one change item."""
    try:
        item = _get_item_by_key(item_key)
        if not item:
            return jsonify({'error': 'Change item not found'}), 404
        payload = request.get_json() or {}

        object_id = payload.get('object_id')
        if not object_id:
            return jsonify({'error': 'object_id is required'}), 400

        obj = Object.query.get(object_id)
        if not obj:
            return jsonify({'error': 'Invalid object_id'}), 400

        existing = ChangeManagementImpact.query.filter_by(
            change_item_id=item.id,
            object_id=object_id
        ).first()
        if existing:
            return jsonify({'error': 'Object already added to this change item'}), 409

        impact_action = _normalize_impact_action(payload.get('impact_action') or 'to_be_replaced')
        if impact_action not in ALLOWED_IMPACT_ACTIONS:
            return jsonify({'error': 'impact_action must be to_be_replaced or cancellation'}), 400

        impact = ChangeManagementImpact(
            change_item_id=item.id,
            object_id=object_id,
            impact_action=impact_action
        )
        db.session.add(impact)
        db.session.commit()
        return jsonify(impact.to_dict()), 201
    except Exception as e:
        db.session.rollback()
        logger.error(f"Error adding impact for change item {item_key}: {str(e)}")
        return jsonify({'error': 'Failed to add impact'}), 500


@bp.route('/<item_key>/impacts/<int:impact_id>', methods=['PUT'])
def update_change_item_impact(item_key, impact_id):
    """Update impacted object row."""
    try:
        item = _get_item_by_key(item_key)
        if not item:
            return jsonify({'error': 'Change item not found'}), 404
        impact = ChangeManagementImpact.query.filter_by(
            id=impact_id,
            change_item_id=item.id
        ).first()
        if not impact:
            return jsonify({'error': 'Impact row not found'}), 404

        payload = request.get_json() or {}
        if 'impact_action' in payload:
            impact_action = _normalize_impact_action(payload.get('impact_action'))
            if impact_action not in ALLOWED_IMPACT_ACTIONS:
                return jsonify({'error': 'impact_action must be to_be_replaced or cancellation'}), 400
            impact.impact_action = impact_action

        db.session.commit()
        return jsonify(impact.to_dict()), 200
    except Exception as e:
        db.session.rollback()
        logger.error(f"Error updating impact {impact_id} for change item {item_key}: {str(e)}")
        return jsonify({'error': 'Failed to update impact'}), 500


@bp.route('/<item_key>/impacts/<int:impact_id>', methods=['DELETE'])
def delete_change_item_impact(item_key, impact_id):
    """Delete impacted object row."""
    try:
        item = _get_item_by_key(item_key)
        if not item:
            return jsonify({'error': 'Change item not found'}), 404
        impact = ChangeManagementImpact.query.filter_by(
            id=impact_id,
            change_item_id=item.id
        ).first()
        if not impact:
            return jsonify({'error': 'Impact row not found'}), 404
        db.session.delete(impact)
        db.session.commit()
        return jsonify({'message': 'Impact deleted successfully'}), 200
    except Exception as e:
        db.session.rollback()
        logger.error(f"Error deleting impact {impact_id} for change item {item_key}: {str(e)}")
        return jsonify({'error': 'Failed to delete impact'}), 500
