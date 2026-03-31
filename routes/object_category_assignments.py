"""API for linking Objects to CategoryNodes (classified_as)."""
import logging

from flask import Blueprint, jsonify, request

from models import db, Object
from models.category_node import CategoryNode
from models.object_category_assignment import ObjectCategoryAssignment

logger = logging.getLogger(__name__)
bp = Blueprint('object_category_assignments', __name__, url_prefix='/api/object-category-assignments')


# GET /api/object-category-assignments?object_id=<id>
# GET /api/object-category-assignments?category_node_id=<id>
@bp.route('', methods=['GET'])
def list_assignments():
    """List object–category assignments
    ---
    tags:
      - Object Category Assignments
    summary: Lista kategorikopplingar
    parameters:
      - name: object_id
        in: query
        type: integer
        required: false
        description: Filtrera på objekt-ID
      - name: category_node_id
        in: query
        type: integer
        required: false
        description: Filtrera på kategorinod-ID
    responses:
      200:
        description: Lista med kategorikopplingar
        schema:
          type: array
          items:
            $ref: '#/definitions/ObjectCategoryAssignment'
    """
    object_id = request.args.get('object_id', type=int)
    category_node_id = request.args.get('category_node_id', type=int)

    query = ObjectCategoryAssignment.query
    if object_id:
        query = query.filter_by(object_id=object_id)
    if category_node_id:
        query = query.filter_by(category_node_id=category_node_id)

    assignments = query.all()
    result = []
    for a in assignments:
        d = a.to_dict()
        node = a.category_node
        d['category_node'] = {
            'id': node.id, 'code': node.code, 'name': node.name, 'level': node.level,
            'system_id': node.system_id,
        } if node else None
        result.append(d)
    return jsonify(result), 200


# POST /api/object-category-assignments
# Body: { "object_id": 1, "category_node_id": 8, "is_primary": true }
@bp.route('', methods=['POST'])
def create_assignment():
    """Create an object–category assignment
    ---
    tags:
      - Object Category Assignments
    summary: Koppla objekt till kategorinod
    consumes:
      - application/json
    parameters:
      - in: body
        name: body
        required: true
        schema:
          type: object
          required:
            - object_id
            - category_node_id
          properties:
            object_id:
              type: integer
              description: Objektets ID
            category_node_id:
              type: integer
              description: Kategorinodensins ID
            is_primary:
              type: boolean
              default: true
              description: Primär klassificering
    responses:
      201:
        description: Koppling skapad
        schema:
          $ref: '#/definitions/ObjectCategoryAssignment'
      400:
        description: Valideringsfel
        schema:
          $ref: '#/definitions/Error'
      404:
        description: Objekt eller nod hittades inte
        schema:
          $ref: '#/definitions/Error'
      409:
        description: Koppling finns redan (eller objekt redan kopplat i systemet)
        schema:
          $ref: '#/definitions/Error'
    """
    data = request.get_json()
    if not data:
        return jsonify({'error': 'Request body is required'}), 400

    object_id = data.get('object_id')
    category_node_id = data.get('category_node_id')

    if not object_id:
        return jsonify({'error': 'object_id is required'}), 400
    if not category_node_id:
        return jsonify({'error': 'category_node_id is required'}), 400

    if not db.session.get(Object, object_id):
        return jsonify({'error': f'Object {object_id} not found'}), 404
    node = db.session.get(CategoryNode, category_node_id)
    if not node:
        return jsonify({'error': f'CategoryNode {category_node_id} not found'}), 404

    existing = ObjectCategoryAssignment.query.filter_by(
        object_id=object_id, category_node_id=category_node_id
    ).first()
    if existing:
        return jsonify({'error': 'Assignment already exists'}), 409

    # Enforce one assignment per classification system per object
    existing_in_system = (
        ObjectCategoryAssignment.query
        .join(CategoryNode, ObjectCategoryAssignment.category_node_id == CategoryNode.id)
        .filter(
            ObjectCategoryAssignment.object_id == object_id,
            CategoryNode.system_id == node.system_id,
        )
        .first()
    )
    if existing_in_system:
        return jsonify({
            'error': 'Objektet är redan kopplat till en nod i detta klassificeringssystem. Ta bort den befintliga kopplingen först.',
            'existing_assignment_id': existing_in_system.id,
        }), 409

    is_primary = bool(data.get('is_primary', True))

    # If this is primary, unset any existing primary for this object
    if is_primary:
        ObjectCategoryAssignment.query.filter_by(
            object_id=object_id, is_primary=True
        ).update({'is_primary': False})

    assignment = ObjectCategoryAssignment(
        object_id=object_id,
        category_node_id=category_node_id,
        is_primary=is_primary,
    )
    db.session.add(assignment)
    db.session.commit()
    logger.info("Assigned object %s to category node %s", object_id, category_node_id)
    return jsonify(assignment.to_dict()), 201


# DELETE /api/object-category-assignments/<id>
@bp.route('/<int:assignment_id>', methods=['DELETE'])
def delete_assignment(assignment_id):
    """Delete an object–category assignment
    ---
    tags:
      - Object Category Assignments
    summary: Ta bort kategorikoppling
    parameters:
      - name: assignment_id
        in: path
        type: integer
        required: true
        description: Kopplingspostens ID
    responses:
      200:
        description: Borttagen
        schema:
          type: object
          properties:
            message:
              type: string
      404:
        description: Hittades inte
        schema:
          $ref: '#/definitions/Error'
    """
    assignment = ObjectCategoryAssignment.query.get_or_404(assignment_id)
    db.session.delete(assignment)
    db.session.commit()
    return jsonify({'message': 'Assignment removed'}), 200
