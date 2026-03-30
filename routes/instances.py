from flask import Blueprint, jsonify, request

from models import db, Instance, Object
from utils.instance_types import ALLOWED_INSTANCE_TYPES
from routes.relation_type_rules import normalize_relation_direction

bp = Blueprint('instances', __name__, url_prefix='/api/instances')


def _normalize_instance_type(value):
    candidate = str(value or '').strip().lower()
    return candidate if candidate in ALLOWED_INSTANCE_TYPES else None


def _normalize_int(value, field_name, minimum=None):
    if value in (None, ''):
        return None, None
    try:
        parsed = int(value)
    except (TypeError, ValueError):
        return None, f'{field_name} must be an integer'
    if minimum is not None and parsed < minimum:
        return None, f'{field_name} must be >= {minimum}'
    return parsed, None


def _normalize_float(value, field_name, minimum=None):
    if value in (None, ''):
        return None, None
    try:
        parsed = float(value)
    except (TypeError, ValueError):
        return None, f'{field_name} must be a number'
    if minimum is not None and parsed < minimum:
        return None, f'{field_name} must be >= {minimum}'
    return parsed, None


def _apply_instance_data(instance, data):
    instance_type = _normalize_instance_type(data.get('instance_type', instance.instance_type))
    if not instance_type:
        return {'error': f"instance_type must be one of: {', '.join(sorted(ALLOWED_INSTANCE_TYPES))}"}, 400

    quantity, quantity_error = _normalize_float(data.get('quantity', instance.quantity), 'quantity', minimum=0)
    if quantity_error:
        return {'error': quantity_error}, 400

    waste_factor, waste_error = _normalize_float(data.get('waste_factor', instance.waste_factor), 'waste_factor', minimum=0)
    if waste_error:
        return {'error': waste_error}, 400

    installation_sequence, installation_error = _normalize_int(
        data.get('installation_sequence', instance.installation_sequence),
        'installation_sequence',
        minimum=0
    )
    if installation_error:
        return {'error': installation_error}, 400

    instance.instance_type = instance_type
    instance.quantity = quantity
    instance.unit = data.get('unit')
    instance.formula = data.get('formula')
    instance.role = data.get('role')
    instance.position = data.get('position')
    instance.waste_factor = waste_factor
    instance.installation_sequence = installation_sequence
    instance.optional = bool(data.get('optional', instance.optional))

    metadata_json = data.get('metadata_json', instance.metadata_json)
    if metadata_json is not None and not isinstance(metadata_json, (dict, list)):
        return {'error': 'metadata_json must be an object or array when provided'}, 400
    instance.metadata_json = metadata_json
    return None, None


@bp.route('', methods=['GET'])
def list_instances():
    """List instances (structural parent/child relationships)
    ---
    tags:
      - Instances
    summary: Lista instanser
    parameters:
      - name: object_id
        in: query
        type: integer
        required: false
        description: Filtrera på objekt-ID (inkluderar både förälder och barn)
    responses:
      200:
        description: Lista med instanser
        schema:
          type: array
          items:
            $ref: '#/definitions/Instance'
    """
    object_id = request.args.get('object_id', type=int)

    query = Instance.query
    if object_id is not None:
        query = query.filter(
            (Instance.parent_object_id == object_id) |
            (Instance.child_object_id == object_id)
        )

    items = query.order_by(Instance.id.asc()).all()
    payload = []
    for item in items:
        data = item.to_dict(include_objects=True)
        if object_id is not None:
            data['direction'] = 'outgoing' if item.parent_object_id == object_id else 'incoming'
        payload.append(data)
    return jsonify(payload), 200


@bp.route('', methods=['POST'])
def create_instance():
    """Create a structural parent/child instance
    ---
    tags:
      - Instances
    summary: Skapa instans
    consumes:
      - application/json
    parameters:
      - in: body
        name: body
        required: true
        schema:
          type: object
          required:
            - parent_object_id
            - child_object_id
            - instance_type
          properties:
            parent_object_id:
              type: integer
              description: ID för förälderobjektet
            child_object_id:
              type: integer
              description: ID för barnobjektet
            instance_type:
              type: string
              description: Typ av instans (se tillåtna värden)
            quantity:
              type: number
              description: Antal (>= 0)
            unit:
              type: string
              description: Enhet
            waste_factor:
              type: number
              description: Spilffaktor (>= 0)
            installation_sequence:
              type: integer
              description: Monteringsordning (>= 0)
            optional:
              type: boolean
            role:
              type: string
            position:
              type: string
            formula:
              type: string
            metadata_json:
              type: object
    responses:
      201:
        description: Instans skapad
        schema:
          $ref: '#/definitions/Instance'
      400:
        description: Valideringsfel
        schema:
          $ref: '#/definitions/Error'
      409:
        description: Instansen finns redan
        schema:
          $ref: '#/definitions/Error'
      500:
        description: Serverfel
        schema:
          $ref: '#/definitions/Error'
    """
    data = request.get_json() or {}

    parent_object_id = data.get('parent_object_id')
    child_object_id = data.get('child_object_id')
    if not parent_object_id or not child_object_id:
        return jsonify({'error': 'parent_object_id and child_object_id are required'}), 400
    if parent_object_id == child_object_id:
        return jsonify({'error': 'parent_object_id and child_object_id must differ'}), 400

    parent_object = Object.query.get(parent_object_id)
    child_object = Object.query.get(child_object_id)
    if not parent_object or not child_object:
        return jsonify({'error': 'Invalid object IDs'}), 400

    requested_instance_type = str(data.get('instance_type') or '').strip().lower()
    if not requested_instance_type:
        return jsonify({'error': f"instance_type must be one of: {', '.join(sorted(ALLOWED_INSTANCE_TYPES))}"}), 400

    _, parent_object, child_object, _ = normalize_relation_direction(
        relation_type=requested_instance_type,
        source_object=parent_object,
        target_object=child_object,
    )
    parent_object_id = parent_object.id
    child_object_id = child_object.id

    duplicate = Instance.query.filter_by(
        parent_object_id=parent_object_id,
        child_object_id=child_object_id,
        instance_type=requested_instance_type
    ).first()
    if duplicate:
        return jsonify({'error': 'Instance already exists for this parent/child/type'}), 409

    instance = Instance(
        parent_object_id=parent_object_id,
        child_object_id=child_object_id,
    )

    error_response, status_code = _apply_instance_data(instance, data)
    if error_response:
        return jsonify(error_response), status_code

    db.session.add(instance)
    db.session.commit()
    return jsonify(instance.to_dict(include_objects=True)), 201


@bp.route('/<int:instance_id>', methods=['PUT'])
def update_instance(instance_id):
    """Update a structural instance
    ---
    tags:
      - Instances
    summary: Uppdatera instans
    parameters:
      - name: instance_id
        in: path
        type: integer
        required: true
        description: Instansens ID
      - in: body
        name: body
        required: true
        schema:
          type: object
          properties:
            parent_object_id:
              type: integer
            child_object_id:
              type: integer
            instance_type:
              type: string
            quantity:
              type: number
            unit:
              type: string
            waste_factor:
              type: number
            installation_sequence:
              type: integer
            optional:
              type: boolean
            role:
              type: string
            position:
              type: string
            formula:
              type: string
            metadata_json:
              type: object
    responses:
      200:
        description: Uppdaterad instans
        schema:
          $ref: '#/definitions/Instance'
      400:
        description: Valideringsfel
        schema:
          $ref: '#/definitions/Error'
      404:
        description: Hittades inte
        schema:
          $ref: '#/definitions/Error'
      409:
        description: Instansen finns redan
        schema:
          $ref: '#/definitions/Error'
      500:
        description: Serverfel
        schema:
          $ref: '#/definitions/Error'
    """
    instance = Instance.query.get_or_404(instance_id)
    data = request.get_json() or {}

    parent_object = instance.parent_object
    child_object = instance.child_object

    if 'parent_object_id' in data or 'child_object_id' in data:
        parent_object_id = data.get('parent_object_id', instance.parent_object_id)
        child_object_id = data.get('child_object_id', instance.child_object_id)
        if parent_object_id == child_object_id:
            return jsonify({'error': 'parent_object_id and child_object_id must differ'}), 400
        parent_object = Object.query.get(parent_object_id)
        child_object = Object.query.get(child_object_id)
        if not parent_object or not child_object:
            return jsonify({'error': 'Invalid object IDs'}), 400

    requested_instance_type = str(data.get('instance_type', instance.instance_type) or '').strip().lower()
    if requested_instance_type:
        _, parent_object, child_object, _ = normalize_relation_direction(
            relation_type=requested_instance_type,
            source_object=parent_object,
            target_object=child_object,
        )

    parent_object_id = parent_object.id
    child_object_id = child_object.id
    duplicate = Instance.query.filter(
        Instance.id != instance.id,
        Instance.parent_object_id == parent_object_id,
        Instance.child_object_id == child_object_id,
        Instance.instance_type == requested_instance_type,
    ).first()
    if duplicate:
        return jsonify({'error': 'Instance already exists for this parent/child/type'}), 409

    instance.parent_object_id = parent_object_id
    instance.child_object_id = child_object_id

    error_response, status_code = _apply_instance_data(instance, data)
    if error_response:
        return jsonify(error_response), status_code

    db.session.commit()
    return jsonify(instance.to_dict(include_objects=True)), 200


@bp.route('/<int:instance_id>', methods=['DELETE'])
def delete_instance(instance_id):
    """Delete a structural instance
    ---
    tags:
      - Instances
    summary: Ta bort instans
    parameters:
      - name: instance_id
        in: path
        type: integer
        required: true
        description: Instansens ID
    responses:
      200:
        description: Instansen borttagen
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
    instance = Instance.query.get_or_404(instance_id)
    db.session.delete(instance)
    db.session.commit()
    return jsonify({'message': 'Instance deleted successfully'}), 200
