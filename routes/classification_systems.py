"""CRUD API for ClassificationSystem."""
import logging

from flask import Blueprint, jsonify, request

from models import db
from models.classification_system import ClassificationSystem
from models.category_node import CategoryNode

logger = logging.getLogger(__name__)
bp = Blueprint('classification_systems', __name__, url_prefix='/api/classification-systems')


# ---------------------------------------------------------------------------
# GET /api/classification-systems
# ---------------------------------------------------------------------------
@bp.route('', methods=['GET'])
def list_systems():
    include_inactive = request.args.get('include_inactive', 'false').lower() in ('1', 'true', 'yes')
    query = ClassificationSystem.query
    if not include_inactive:
        query = query.filter_by(is_active=True)
    systems = query.order_by(ClassificationSystem.name).all()
    return jsonify([s.to_dict(include_node_count=True) for s in systems]), 200


# ---------------------------------------------------------------------------
# POST /api/classification-systems
# ---------------------------------------------------------------------------
@bp.route('', methods=['POST'])
def create_system():
    data = request.get_json()
    if not data:
        return jsonify({'error': 'Request body is required'}), 400

    name = (data.get('name') or '').strip()
    if not name:
        return jsonify({'error': 'name is required'}), 400

    system = ClassificationSystem(
        name=name,
        description=(data.get('description') or '').strip() or None,
        version=(data.get('version') or '').strip() or None,
        is_active=bool(data.get('is_active', True)),
    )
    db.session.add(system)
    db.session.commit()
    logger.info("Created ClassificationSystem id=%s name=%s", system.id, system.name)
    return jsonify(system.to_dict()), 201


# ---------------------------------------------------------------------------
# GET /api/classification-systems/<id>
# ---------------------------------------------------------------------------
@bp.route('/<int:system_id>', methods=['GET'])
def get_system(system_id):
    system = ClassificationSystem.query.get_or_404(system_id)
    return jsonify(system.to_dict(include_node_count=True)), 200


# ---------------------------------------------------------------------------
# PUT /api/classification-systems/<id>
# ---------------------------------------------------------------------------
@bp.route('/<int:system_id>', methods=['PUT'])
def update_system(system_id):
    system = ClassificationSystem.query.get_or_404(system_id)
    data = request.get_json()
    if not data:
        return jsonify({'error': 'Request body is required'}), 400

    if 'name' in data:
        name = (data['name'] or '').strip()
        if not name:
            return jsonify({'error': 'name cannot be empty'}), 400
        system.name = name
    if 'description' in data:
        system.description = (data['description'] or '').strip() or None
    if 'version' in data:
        system.version = (data['version'] or '').strip() or None
    if 'is_active' in data:
        system.is_active = bool(data['is_active'])

    db.session.commit()
    return jsonify(system.to_dict()), 200


# ---------------------------------------------------------------------------
# DELETE /api/classification-systems/<id>
# ---------------------------------------------------------------------------
@bp.route('/<int:system_id>', methods=['DELETE'])
def delete_system(system_id):
    system = ClassificationSystem.query.get_or_404(system_id)

    if system.nodes:
        return jsonify({
            'error': 'Cannot delete classification system that contains category nodes. '
                     'Remove all nodes first.'
        }), 409

    db.session.delete(system)
    db.session.commit()
    logger.info("Deleted ClassificationSystem id=%s", system_id)
    return jsonify({'message': 'Classification system deleted'}), 200
