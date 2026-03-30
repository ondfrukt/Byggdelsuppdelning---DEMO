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
    """List all classification systems
    ---
    tags:
      - Classification Systems
    summary: Lista klassificeringssystem
    parameters:
      - name: include_inactive
        in: query
        type: boolean
        required: false
        default: false
        description: Inkludera inaktiva system
    responses:
      200:
        description: Lista med klassificeringssystem
        schema:
          type: array
          items:
            $ref: '#/definitions/ClassificationSystem'
    """
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
    """Create a classification system
    ---
    tags:
      - Classification Systems
    summary: Skapa klassificeringssystem
    consumes:
      - application/json
    parameters:
      - in: body
        name: body
        required: true
        schema:
          type: object
          required:
            - name
          properties:
            name:
              type: string
              description: Systemets namn
            description:
              type: string
            version:
              type: string
            is_active:
              type: boolean
              default: true
    responses:
      201:
        description: System skapat
        schema:
          $ref: '#/definitions/ClassificationSystem'
      400:
        description: Valideringsfel
        schema:
          $ref: '#/definitions/Error'
    """
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
    """Get a single classification system
    ---
    tags:
      - Classification Systems
    summary: Hämta klassificeringssystem
    parameters:
      - name: system_id
        in: path
        type: integer
        required: true
        description: Systemets ID
    responses:
      200:
        description: Klassificeringssystemet
        schema:
          $ref: '#/definitions/ClassificationSystem'
      404:
        description: Hittades inte
        schema:
          $ref: '#/definitions/Error'
    """
    system = ClassificationSystem.query.get_or_404(system_id)
    return jsonify(system.to_dict(include_node_count=True)), 200


# ---------------------------------------------------------------------------
# PUT /api/classification-systems/<id>
# ---------------------------------------------------------------------------
@bp.route('/<int:system_id>', methods=['PUT'])
def update_system(system_id):
    """Update a classification system
    ---
    tags:
      - Classification Systems
    summary: Uppdatera klassificeringssystem
    parameters:
      - name: system_id
        in: path
        type: integer
        required: true
        description: Systemets ID
      - in: body
        name: body
        required: true
        schema:
          type: object
          properties:
            name:
              type: string
            description:
              type: string
            version:
              type: string
            is_active:
              type: boolean
    responses:
      200:
        description: Uppdaterat system
        schema:
          $ref: '#/definitions/ClassificationSystem'
      400:
        description: Valideringsfel
        schema:
          $ref: '#/definitions/Error'
      404:
        description: Hittades inte
        schema:
          $ref: '#/definitions/Error'
    """
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
    """Delete a classification system
    ---
    tags:
      - Classification Systems
    summary: Ta bort klassificeringssystem
    parameters:
      - name: system_id
        in: path
        type: integer
        required: true
        description: Systemets ID
    responses:
      200:
        description: Borttaget
        schema:
          type: object
          properties:
            message:
              type: string
      404:
        description: Hittades inte
        schema:
          $ref: '#/definitions/Error'
      409:
        description: Systemet har noder och kan ej tas bort
        schema:
          $ref: '#/definitions/Error'
    """
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
