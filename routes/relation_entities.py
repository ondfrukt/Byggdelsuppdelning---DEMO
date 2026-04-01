from flask import Blueprint, jsonify, request
from sqlalchemy import or_
from models import db, Object, ObjectRelation
from routes.relation_type_rules import (
    validate_relation_type_scope,
    enforce_pair_relation_type,
    normalize_relation_direction,
)

bp = Blueprint('relation_entities', __name__, url_prefix='/api/relations')
DEFAULT_RELATION_TYPE = 'references_object'


def _normalize_limit(value, field_name):
    if value in (None, ''):
        return None, None
    try:
        parsed = int(value)
    except (TypeError, ValueError):
        return None, f'{field_name} must be an integer'
    if parsed <= 0:
        return None, f'{field_name} must be greater than 0'
    return parsed, None


def normalize_id_full(value):
    if value is None:
        return ''
    return str(value).strip().lower()


def get_linked_id_fulls(source_id):
    linked_id_fulls = set()
    relations = ObjectRelation.query.filter(
        or_(
            ObjectRelation.source_object_id == source_id,
            ObjectRelation.target_object_id == source_id
        )
    ).all()

    for relation in relations:
        linked_object = relation.target_object if relation.source_object_id == source_id else relation.source_object
        linked_id_full = normalize_id_full(linked_object.id_full if linked_object else None)
        if linked_id_full:
            linked_id_fulls.add(linked_id_full)

    return linked_id_fulls


@bp.route('', methods=['GET'])
def list_relations():
    """List all relation entities, optional filter by object_id.
    ---
    tags:
      - Relations
    summary: Lista relationer
    parameters:
      - name: object_id
        in: query
        type: integer
        required: false
        description: Filtrera på objekt-ID
    responses:
      200:
        description: Lista med relationer
        schema:
          type: array
          items:
            $ref: '#/definitions/ObjectRelation'
    """
    object_id = request.args.get('object_id', type=int)

    query = ObjectRelation.query
    if object_id is not None:
        query = query.filter(
            (ObjectRelation.source_object_id == object_id) |
            (ObjectRelation.target_object_id == object_id)
        )

    relations = query.order_by(ObjectRelation.created_at.desc()).all()

    payload = []
    for rel in relations:
        item = rel.to_dict(include_objects=True)
        if object_id is not None:
            item['direction'] = 'outgoing' if rel.source_object_id == object_id else 'incoming'
        payload.append(item)

    return jsonify(payload), 200


@bp.route('', methods=['POST'])
def create_relation():
    """Create relation entity between two objects.
    ---
    tags:
      - Relations
    summary: Skapa relation mellan två objekt
    consumes:
      - application/json
    parameters:
      - in: body
        name: body
        required: true
        schema:
          type: object
          required:
            - source_object_id
            - target_object_id
          properties:
            source_object_id:
              type: integer
              description: Källobjektets ID (alt. objectA_id)
            target_object_id:
              type: integer
              description: Målobjektets ID (alt. objectB_id)
            relation_type:
              type: string
              description: Relationstyp (default auto)
            description:
              type: string
            metadata:
              type: object
    responses:
      201:
        description: Relation skapad
        schema:
          $ref: '#/definitions/ObjectRelation'
      400:
        description: Valideringsfel
        schema:
          $ref: '#/definitions/Error'
      409:
        description: Relation finns redan
        schema:
          $ref: '#/definitions/Error'
      422:
        description: Relationstyp inte tillåten för dessa objekttyper
        schema:
          $ref: '#/definitions/Error'
    """
    data = request.get_json() or {}

    source_object_id = data.get('source_object_id') or data.get('objectA_id')
    target_object_id = data.get('target_object_id') or data.get('objectB_id')
    relation_type = (data.get('relation_type') or 'auto').strip().lower() or 'auto'

    if not source_object_id or not target_object_id:
        return jsonify({'error': 'source_object_id/objectA_id and target_object_id/objectB_id are required'}), 400

    if source_object_id == target_object_id:
        return jsonify({'error': 'Self-relations are not allowed'}), 400

    source_object = db.session.get(Object, source_object_id)
    target_object = db.session.get(Object, target_object_id)

    if not source_object or not target_object:
        return jsonify({'error': 'Invalid object IDs'}), 400

    relation_type, source_object, target_object, _ = normalize_relation_direction(
        relation_type=relation_type,
        source_object=source_object,
        target_object=target_object,
    )
    source_object_id = source_object.id
    target_object_id = target_object.id

    relation_type, pair_type_error = enforce_pair_relation_type(
        relation_type=relation_type,
        source_object=source_object,
        target_object=target_object,
        fallback=DEFAULT_RELATION_TYPE
    )
    if pair_type_error:
        return jsonify({'error': pair_type_error}), 422

    max_targets_per_source, max_targets_error = _normalize_limit(data.get('max_targets_per_source'), 'max_targets_per_source')
    if max_targets_error:
        return jsonify({'error': max_targets_error}), 400

    max_sources_per_target, max_sources_error = _normalize_limit(data.get('max_sources_per_target'), 'max_sources_per_target')
    if max_sources_error:
        return jsonify({'error': max_sources_error}), 400

    relation_scope_error = validate_relation_type_scope(relation_type, source_object, target_object)
    if relation_scope_error:
        return jsonify({'error': relation_scope_error}), 422

    target_id_full = normalize_id_full(target_object.id_full)
    if target_id_full and target_id_full in get_linked_id_fulls(source_object_id):
        return jsonify({'error': f'Relation already exists for full ID: {target_object.id_full}'}), 409

    relation = ObjectRelation(
        source_object_id=source_object_id,
        target_object_id=target_object_id,
        relation_type=relation_type,
        description=data.get('description'),
        relation_metadata=data.get('metadata', {})
    )

    db.session.add(relation)
    db.session.commit()

    return jsonify(relation.to_dict(include_objects=True)), 201



@bp.route('/batch', methods=['POST'])
def create_relations_batch():
    """Create relation entities in batch format.
    ---
    tags:
      - Relations
    summary: Skapa flera relationer (batch)
    consumes:
      - application/json
    parameters:
      - in: body
        name: body
        required: true
        schema:
          type: object
          required:
            - sourceId
            - relations
          properties:
            sourceId:
              type: integer
              description: Källobjektets ID
            relations:
              type: array
              items:
                type: object
                required:
                  - targetId
                properties:
                  targetId:
                    type: integer
                  relationType:
                    type: string
                  metadata:
                    type: object
    responses:
      201:
        description: Alla relationer skapade
        schema:
          type: object
          properties:
            sourceId:
              type: integer
            created:
              type: array
              items:
                $ref: '#/definitions/ObjectRelation'
            errors:
              type: array
              items:
                type: object
            summary:
              type: object
      207:
        description: Delvis lyckad (vissa relationer misslyckades)
        schema:
          type: object
      400:
        description: Valideringsfel
        schema:
          $ref: '#/definitions/Error'
    """
    data = request.get_json() or {}

    source_id = data.get('sourceId')
    relations = data.get('relations', [])

    if not source_id or not isinstance(relations, list):
        return jsonify({'error': 'sourceId and relations[] are required'}), 400

    source_object = db.session.get(Object, source_id)
    if not source_object:
        return jsonify({'error': 'Invalid sourceId'}), 400

    existing_linked_id_fulls = get_linked_id_fulls(source_id)
    linked_id_fulls_by_source = {source_id: existing_linked_id_fulls}

    created = []
    errors = []

    for index, relation_data in enumerate(relations):
        target_id = relation_data.get('targetId')
        relation_type = (relation_data.get('relationType') or DEFAULT_RELATION_TYPE).strip().lower() or DEFAULT_RELATION_TYPE
        metadata = relation_data.get('metadata') or {}
        max_targets_per_source, max_targets_error = _normalize_limit(
            relation_data.get('max_targets_per_source'),
            'max_targets_per_source'
        )
        max_sources_per_target, max_sources_error = _normalize_limit(
            relation_data.get('max_sources_per_target'),
            'max_sources_per_target'
        )

        if not target_id:
            errors.append({'index': index, 'targetId': target_id, 'error': 'targetId is required'})
            continue

        if source_id == target_id:
            errors.append({'index': index, 'targetId': target_id, 'error': 'Self-relations are not allowed'})
            continue

        target_object = db.session.get(Object, target_id)
        if not target_object:
            errors.append({'index': index, 'targetId': target_id, 'error': 'Target object not found'})
            continue
        if max_targets_error:
            errors.append({'index': index, 'targetId': target_id, 'error': max_targets_error})
            continue
        if max_sources_error:
            errors.append({'index': index, 'targetId': target_id, 'error': max_sources_error})
            continue

        relation_type, normalized_source_object, normalized_target_object, was_swapped = normalize_relation_direction(
            relation_type=relation_type,
            source_object=source_object,
            target_object=target_object,
        )
        normalized_source_id = normalized_source_object.id
        normalized_target_id = normalized_target_object.id

        relation_type, pair_type_error = enforce_pair_relation_type(
            relation_type=relation_type,
            source_object=normalized_source_object,
            target_object=normalized_target_object,
            fallback=DEFAULT_RELATION_TYPE
        )
        if pair_type_error:
            errors.append({'index': index, 'targetId': target_id, 'error': pair_type_error})
            continue

        relation_scope_error = validate_relation_type_scope(
            relation_type,
            normalized_source_object,
            normalized_target_object,
        )
        if relation_scope_error:
            errors.append({'index': index, 'targetId': target_id, 'error': relation_scope_error})
            continue

        source_linked_id_fulls = linked_id_fulls_by_source.setdefault(
            normalized_source_id,
            get_linked_id_fulls(normalized_source_id),
        )
        target_id_full = normalize_id_full(normalized_target_object.id_full)
        if target_id_full and target_id_full in source_linked_id_fulls:
            errors.append({
                'index': index,
                'targetId': target_id,
                'error': f'An object with full ID {normalized_target_object.id_full} is already linked'
            })
            continue

        duplicate = ObjectRelation.query.filter_by(
            source_object_id=normalized_source_id,
            target_object_id=normalized_target_id,
            relation_type=relation_type
        ).first()
        if duplicate:
            errors.append({'index': index, 'targetId': target_id, 'error': 'Relation already exists'})
            continue

        relation = ObjectRelation(
            source_object_id=normalized_source_id,
            target_object_id=normalized_target_id,
            relation_type=relation_type,
            relation_metadata=metadata,
            description=metadata.get('description') if isinstance(metadata, dict) else None
        )
        db.session.add(relation)
        try:
            db.session.flush()
        except Exception as exc:
            db.session.rollback()
            errors.append({'index': index, 'targetId': target_id, 'error': str(exc)})
            continue
        created.append(relation.to_dict(include_objects=True))
        if target_id_full:
            source_linked_id_fulls.add(target_id_full)

    if created:
        db.session.commit()
    else:
        db.session.rollback()

    return jsonify({
        'sourceId': source_id,
        'created': created,
        'errors': errors,
        'summary': {
            'requested': len(relations),
            'created': len(created),
            'failed': len(errors)
        }
    }), 207 if errors else 201


@bp.route('/<int:relation_id>', methods=['DELETE'])
def delete_relation(relation_id):
    """Delete a relation by ID
    ---
    tags:
      - Relations
    summary: Ta bort relation
    parameters:
      - name: relation_id
        in: path
        type: integer
        required: true
        description: Relationens ID
    responses:
      200:
        description: Relation borttagen
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
    relation = ObjectRelation.query.get_or_404(relation_id)
    db.session.delete(relation)
    db.session.commit()
    return jsonify({'message': 'Relation deleted successfully'}), 200
