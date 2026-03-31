from flask import Blueprint, jsonify, request
from models import db, RelationTypeRule, RelationType, ObjectType, InstanceTypeField, FieldTemplate
from routes.relation_type_rules import get_available_relation_types, ensure_complete_relation_rule_matrix
from utils.instance_types import get_instance_type_specs
from extensions import cache

bp = Blueprint('relation_type_rules_api', __name__, url_prefix='/api/relation-type-rules')

@bp.after_request
def invalidate_cache_on_write(response):
    if request.method != 'GET' and response.status_code < 400:
        cache.clear()
    return response


def _normalize_relation_type(value):
    candidate = str(value or '').strip().lower()
    allowed = set(get_available_relation_types())
    allowed.update(
        str(item.get('key') or '').strip().lower()
        for item in get_instance_type_specs()
        if str(item.get('key') or '').strip()
    )
    return candidate if candidate in allowed else None


def _normalize_bool(value, default=True):
    if value is None:
        return bool(default)
    if isinstance(value, bool):
        return value
    text = str(value).strip().lower()
    if text in {'1', 'true', 'yes', 'ja', 'on'}:
        return True
    if text in {'0', 'false', 'no', 'nej', 'off'}:
        return False
    return bool(default)


def _normalize_instance_type_key(value):
    candidate = str(value or '').strip().lower()
    allowed = {
        str(item.get('key') or '').strip().lower()
        for item in get_instance_type_specs()
        if str(item.get('key') or '').strip()
    }
    return candidate if candidate in allowed else None


def _serialize_instance_type_fields():
    rows = (
        InstanceTypeField.query
        .order_by(InstanceTypeField.instance_type_key.asc(), InstanceTypeField.display_order.asc(), InstanceTypeField.id.asc())
        .all()
    )
    return [row.to_dict(include_template=True) for row in rows]


def _serialize_rule(rule):
    payload = rule.to_dict()
    payload['source_object_type_name'] = rule.source_object_type.name if rule.source_object_type else None
    payload['target_object_type_name'] = rule.target_object_type.name if rule.target_object_type else None
    return payload


def _sync_reverse_rule(source_object_type_id, target_object_type_id, relation_type):
    reverse_rule = RelationTypeRule.query.filter_by(
        source_object_type_id=target_object_type_id,
        target_object_type_id=source_object_type_id
    ).first()
    if not reverse_rule:
        reverse_rule = RelationTypeRule(
            source_object_type_id=target_object_type_id,
            target_object_type_id=source_object_type_id,
            relation_type=relation_type,
            is_allowed=False
        )
        db.session.add(reverse_rule)
        return

    reverse_rule.relation_type = relation_type
    reverse_rule.is_allowed = False


@bp.route('', methods=['GET'])
@cache.cached(timeout=300)
def list_relation_type_rules():
    """List all relation type rules
    ---
    tags:
      - Relation Type Rules
    summary: Lista relationstypregler
    responses:
      200:
        description: Regelmatris med relationstyper och instanstyper
        schema:
          type: object
          properties:
            items:
              type: array
              items:
                $ref: '#/definitions/RelationTypeRule'
            available_relation_types:
              type: array
              items:
                type: string
            relation_types:
              type: array
              items:
                type: object
            instance_types:
              type: array
              items:
                type: object
            instance_type_fields:
              type: array
              items:
                type: object
    """
    created = ensure_complete_relation_rule_matrix()
    if created > 0:
        db.session.commit()

    rules = RelationTypeRule.query.order_by(RelationTypeRule.id.asc()).all()
    relation_types = RelationType.query.order_by(RelationType.key.asc()).all()
    return jsonify({
        'items': [_serialize_rule(rule) for rule in rules],
        'available_relation_types': get_available_relation_types(),
        'relation_types': [relation_type.to_dict() for relation_type in relation_types],
        'instance_types': get_instance_type_specs(),
        'instance_type_fields': _serialize_instance_type_fields(),
    }), 200


@bp.route('/instance-type-fields/<string:instance_type_key>', methods=['PUT'])
def replace_instance_type_fields(instance_type_key):
    """Replace instance type fields for a given instance type key
    ---
    tags:
      - Relation Type Rules
    summary: Sätt fältmallar för en instanstyp
    parameters:
      - name: instance_type_key
        in: path
        type: string
        required: true
        description: Instanstypens nyckel
      - in: body
        name: body
        required: true
        schema:
          type: object
          required:
            - field_template_ids
          properties:
            field_template_ids:
              type: array
              items:
                type: integer
              description: Ordnad lista med fältmall-ID:n
    responses:
      200:
        description: Uppdaterade fält för instanstypen
        schema:
          type: object
          properties:
            instance_type_key:
              type: string
            items:
              type: array
              items:
                type: object
      400:
        description: Valideringsfel
        schema:
          $ref: '#/definitions/Error'
    """
    normalized_key = _normalize_instance_type_key(instance_type_key)
    if not normalized_key:
        return jsonify({'error': 'Invalid instance_type key'}), 400

    data = request.get_json() or {}
    requested_ids = data.get('field_template_ids')
    if not isinstance(requested_ids, list):
        return jsonify({'error': 'field_template_ids must be an array'}), 400

    normalized_ids = []
    seen = set()
    for raw_id in requested_ids:
        try:
            template_id = int(raw_id)
        except (TypeError, ValueError):
            return jsonify({'error': 'field_template_ids must contain numeric ids'}), 400
        if template_id <= 0 or template_id in seen:
            continue
        normalized_ids.append(template_id)
        seen.add(template_id)

    if normalized_ids:
        valid_ids = {
            row.id
            for row in FieldTemplate.query.filter(FieldTemplate.id.in_(normalized_ids)).all()
        }
        missing = [template_id for template_id in normalized_ids if template_id not in valid_ids]
        if missing:
            return jsonify({'error': f'Unknown field_template_ids: {missing}'}), 400

    existing_rows = InstanceTypeField.query.filter_by(instance_type_key=normalized_key).all()
    by_template_id = {int(row.field_template_id): row for row in existing_rows}
    keep_ids = set(normalized_ids)

    for row in existing_rows:
        if int(row.field_template_id) not in keep_ids:
            db.session.delete(row)

    for index, template_id in enumerate(normalized_ids):
        row = by_template_id.get(int(template_id))
        if row is None:
            row = InstanceTypeField(
                instance_type_key=normalized_key,
                field_template_id=int(template_id),
                display_order=index,
                is_required=False,
            )
            db.session.add(row)
        else:
            row.display_order = index

    db.session.commit()

    payload = (
        InstanceTypeField.query
        .filter_by(instance_type_key=normalized_key)
        .order_by(InstanceTypeField.display_order.asc(), InstanceTypeField.id.asc())
        .all()
    )
    return jsonify({
        'instance_type_key': normalized_key,
        'items': [row.to_dict(include_template=True) for row in payload]
    }), 200


@bp.route('', methods=['POST'])
def upsert_relation_type_rule():
    """Create or update a relation type rule
    ---
    tags:
      - Relation Type Rules
    summary: Skapa eller uppdatera relationstypregel
    consumes:
      - application/json
    parameters:
      - in: body
        name: body
        required: true
        schema:
          type: object
          required:
            - source_object_type_id
            - target_object_type_id
            - relation_type
          properties:
            source_object_type_id:
              type: integer
              description: Källobjekttypens ID
            target_object_type_id:
              type: integer
              description: Målobjekttypens ID
            relation_type:
              type: string
              description: Relationstyp
            is_allowed:
              type: boolean
              default: true
              description: Om relationen är tillåten
    responses:
      201:
        description: Ny regel skapad
        schema:
          $ref: '#/definitions/RelationTypeRule'
      200:
        description: Befintlig regel uppdaterad
        schema:
          $ref: '#/definitions/RelationTypeRule'
      400:
        description: Valideringsfel
        schema:
          $ref: '#/definitions/Error'
    """
    data = request.get_json() or {}
    source_object_type_id = data.get('source_object_type_id')
    target_object_type_id = data.get('target_object_type_id')
    relation_type = _normalize_relation_type(data.get('relation_type'))
    is_allowed = _normalize_bool(data.get('is_allowed', True), default=True)

    if not source_object_type_id or not target_object_type_id:
        return jsonify({'error': 'source_object_type_id and target_object_type_id are required'}), 400
    if source_object_type_id == target_object_type_id:
        return jsonify({'error': 'source_object_type_id and target_object_type_id must differ'}), 400
    if not relation_type:
        return jsonify({'error': 'Invalid relation_type'}), 400

    source_type = db.session.get(ObjectType, source_object_type_id)
    target_type = db.session.get(ObjectType, target_object_type_id)
    if not source_type or not target_type:
        return jsonify({'error': 'Invalid object type ids'}), 400

    rule = RelationTypeRule.query.filter_by(
        source_object_type_id=source_object_type_id,
        target_object_type_id=target_object_type_id
    ).first()

    is_create = rule is None
    if is_create:
        rule = RelationTypeRule(
            source_object_type_id=source_object_type_id,
            target_object_type_id=target_object_type_id,
            relation_type=relation_type,
            is_allowed=is_allowed
        )
        db.session.add(rule)
    else:
        rule.relation_type = relation_type
        rule.is_allowed = is_allowed

    if is_allowed:
        _sync_reverse_rule(source_object_type_id, target_object_type_id, relation_type)

    db.session.commit()
    return jsonify(_serialize_rule(rule)), 201 if is_create else 200


@bp.route('/<int:rule_id>', methods=['PUT'])
def update_relation_type_rule(rule_id):
    """Update a relation type rule
    ---
    tags:
      - Relation Type Rules
    summary: Uppdatera relationstypregel
    parameters:
      - name: rule_id
        in: path
        type: integer
        required: true
        description: Regelns ID
      - in: body
        name: body
        required: true
        schema:
          type: object
          properties:
            source_object_type_id:
              type: integer
            target_object_type_id:
              type: integer
            relation_type:
              type: string
            is_allowed:
              type: boolean
    responses:
      200:
        description: Uppdaterad regel
        schema:
          $ref: '#/definitions/RelationTypeRule'
      400:
        description: Valideringsfel
        schema:
          $ref: '#/definitions/Error'
      404:
        description: Hittades inte
        schema:
          $ref: '#/definitions/Error'
      409:
        description: Regel finns redan för detta par
        schema:
          $ref: '#/definitions/Error'
    """
    rule = RelationTypeRule.query.get_or_404(rule_id)
    data = request.get_json() or {}

    source_object_type_id = data.get('source_object_type_id', rule.source_object_type_id)
    target_object_type_id = data.get('target_object_type_id', rule.target_object_type_id)
    relation_type = _normalize_relation_type(data.get('relation_type', rule.relation_type))
    is_allowed = _normalize_bool(data.get('is_allowed', rule.is_allowed), default=rule.is_allowed)

    if source_object_type_id == target_object_type_id:
        return jsonify({'error': 'source_object_type_id and target_object_type_id must differ'}), 400
    if not relation_type:
        return jsonify({'error': 'Invalid relation_type'}), 400

    source_type = db.session.get(ObjectType, source_object_type_id)
    target_type = db.session.get(ObjectType, target_object_type_id)
    if not source_type or not target_type:
        return jsonify({'error': 'Invalid object type ids'}), 400

    duplicate = RelationTypeRule.query.filter_by(
        source_object_type_id=source_object_type_id,
        target_object_type_id=target_object_type_id
    ).first()
    if duplicate and duplicate.id != rule.id:
        return jsonify({'error': 'A rule already exists for this source/target pair'}), 409

    rule.source_object_type_id = source_object_type_id
    rule.target_object_type_id = target_object_type_id
    rule.relation_type = relation_type
    rule.is_allowed = is_allowed

    if is_allowed:
        _sync_reverse_rule(source_object_type_id, target_object_type_id, relation_type)

    db.session.commit()
    return jsonify(_serialize_rule(rule)), 200


@bp.route('/<int:rule_id>', methods=['DELETE'])
def delete_relation_type_rule(rule_id):
    """Delete a relation type rule
    ---
    tags:
      - Relation Type Rules
    summary: Ta bort relationstypregel
    parameters:
      - name: rule_id
        in: path
        type: integer
        required: true
        description: Regelns ID
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
    rule = RelationTypeRule.query.get_or_404(rule_id)
    db.session.delete(rule)
    db.session.commit()
    return jsonify({'message': 'Relation type rule deleted successfully'}), 200
