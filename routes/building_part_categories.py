from flask import Blueprint, request, jsonify
from models import db, BuildingPartCategory
import logging

logger = logging.getLogger(__name__)
bp = Blueprint('building_part_categories', __name__, url_prefix='/api/building-part-categories')


@bp.route('', methods=['GET'])
def list_categories():
    """List all building part categories."""
    try:
        include_inactive = request.args.get('include_inactive', 'false').lower() == 'true'
        query = BuildingPartCategory.query
        if not include_inactive:
            query = query.filter_by(is_active=True)

        categories = query.order_by(
            BuildingPartCategory.sort_order.asc(),
            BuildingPartCategory.name.asc()
        ).all()
        return jsonify([category.to_dict() for category in categories]), 200
    except Exception as e:
        logger.error(f"Error listing building part categories: {str(e)}")
        return jsonify({'error': 'Failed to list building part categories'}), 500


@bp.route('', methods=['POST'])
def create_category():
    """Create a building part category."""
    try:
        data = request.get_json() or {}
        name = (data.get('name') or '').strip()
        if not name:
            return jsonify({'error': 'name is required'}), 400

        existing = BuildingPartCategory.query.filter(
            db.func.lower(BuildingPartCategory.name) == name.lower()
        ).first()
        if existing:
            return jsonify({'error': 'Category with this name already exists'}), 400

        max_order = db.session.query(db.func.max(BuildingPartCategory.sort_order)).scalar()
        next_order = (max_order or 0) + 1

        category = BuildingPartCategory(
            name=name,
            sort_order=data.get('sort_order', next_order),
            is_active=data.get('is_active', True)
        )
        db.session.add(category)
        db.session.commit()
        return jsonify(category.to_dict()), 201
    except Exception as e:
        db.session.rollback()
        logger.error(f"Error creating building part category: {str(e)}")
        return jsonify({'error': 'Failed to create building part category'}), 500


@bp.route('/<int:category_id>', methods=['PUT'])
def update_category(category_id):
    """Update a building part category."""
    try:
        category = BuildingPartCategory.query.get_or_404(category_id)
        data = request.get_json() or {}

        if 'name' in data:
            new_name = (data.get('name') or '').strip()
            if not new_name:
                return jsonify({'error': 'name cannot be empty'}), 400
            existing = BuildingPartCategory.query.filter(
                db.func.lower(BuildingPartCategory.name) == new_name.lower(),
                BuildingPartCategory.id != category_id
            ).first()
            if existing:
                return jsonify({'error': 'Category with this name already exists'}), 400
            category.name = new_name

        if 'sort_order' in data:
            category.sort_order = int(data['sort_order'])

        if 'is_active' in data:
            category.is_active = bool(data['is_active'])

        db.session.commit()
        return jsonify(category.to_dict()), 200
    except Exception as e:
        db.session.rollback()
        logger.error(f"Error updating building part category {category_id}: {str(e)}")
        return jsonify({'error': 'Failed to update building part category'}), 500


@bp.route('/<int:category_id>', methods=['DELETE'])
def delete_category(category_id):
    """Delete a building part category."""
    try:
        category = BuildingPartCategory.query.get_or_404(category_id)
        db.session.delete(category)
        db.session.commit()
        return jsonify({'message': 'Building part category deleted successfully'}), 200
    except Exception as e:
        db.session.rollback()
        logger.error(f"Error deleting building part category {category_id}: {str(e)}")
        return jsonify({'error': 'Failed to delete building part category'}), 500
