from flask import Blueprint, jsonify, request
from sqlalchemy import or_
from models import db, Object, ObjectRelation
from routes.relation_type_rules import validate_relation_type_scope, infer_relation_type, is_relation_blocked

bp = Blueprint('relation_entities', __name__, url_prefix='/api/relations')
DEFAULT_RELATION_TYPE = 'relaterad'


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
    """List all relation entities, optional filter by object_id."""
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
    """Create relation entity between two objects."""
    data = request.get_json() or {}

    source_object_id = data.get('source_object_id') or data.get('objectA_id')
    target_object_id = data.get('target_object_id') or data.get('objectB_id')
    relation_type = (data.get('relation_type') or DEFAULT_RELATION_TYPE).strip().lower() or DEFAULT_RELATION_TYPE

    if not source_object_id or not target_object_id:
        return jsonify({'error': 'source_object_id/objectA_id and target_object_id/objectB_id are required'}), 400

    if source_object_id == target_object_id:
        return jsonify({'error': 'Self-relations are not allowed'}), 400

    source_object = Object.query.get(source_object_id)
    target_object = Object.query.get(target_object_id)

    if not source_object or not target_object:
        return jsonify({'error': 'Invalid object IDs'}), 400

    if is_relation_blocked(source_object, target_object):
        source_type = source_object.object_type.name if source_object.object_type else 'Unknown'
        target_type = target_object.object_type.name if target_object.object_type else 'Unknown'
        return jsonify({'error': f'Linking is disabled between {source_type} and {target_type}'}), 422

    if relation_type == 'auto':
        relation_type = infer_relation_type(source_object, target_object, fallback=DEFAULT_RELATION_TYPE)

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
    """Create relation entities in batch format."""
    data = request.get_json() or {}

    source_id = data.get('sourceId')
    relations = data.get('relations', [])

    if not source_id or not isinstance(relations, list):
        return jsonify({'error': 'sourceId and relations[] are required'}), 400

    source_object = Object.query.get(source_id)
    if not source_object:
        return jsonify({'error': 'Invalid sourceId'}), 400

    existing_linked_id_fulls = get_linked_id_fulls(source_id)
    batch_linked_id_fulls = set()

    created = []
    errors = []

    for index, relation_data in enumerate(relations):
        target_id = relation_data.get('targetId')
        relation_type = (relation_data.get('relationType') or DEFAULT_RELATION_TYPE).strip().lower() or DEFAULT_RELATION_TYPE
        metadata = relation_data.get('metadata') or {}

        if not target_id:
            errors.append({'index': index, 'targetId': target_id, 'error': 'targetId is required'})
            continue

        if source_id == target_id:
            errors.append({'index': index, 'targetId': target_id, 'error': 'Self-relations are not allowed'})
            continue

        target_object = Object.query.get(target_id)
        if not target_object:
            errors.append({'index': index, 'targetId': target_id, 'error': 'Target object not found'})
            continue

        if is_relation_blocked(source_object, target_object):
            source_type = source_object.object_type.name if source_object.object_type else 'Unknown'
            target_type = target_object.object_type.name if target_object.object_type else 'Unknown'
            errors.append({
                'index': index,
                'targetId': target_id,
                'error': f'Linking is disabled between {source_type} and {target_type}'
            })
            continue

        if relation_type == 'auto':
            relation_type = infer_relation_type(source_object, target_object, fallback=DEFAULT_RELATION_TYPE)

        relation_scope_error = validate_relation_type_scope(relation_type, source_object, target_object)
        if relation_scope_error:
            errors.append({'index': index, 'targetId': target_id, 'error': relation_scope_error})
            continue

        target_id_full = normalize_id_full(target_object.id_full)
        if target_id_full and (target_id_full in existing_linked_id_fulls or target_id_full in batch_linked_id_fulls):
            errors.append({
                'index': index,
                'targetId': target_id,
                'error': f'An object with full ID {target_object.id_full} is already linked'
            })
            continue

        duplicate = ObjectRelation.query.filter_by(
            source_object_id=source_id,
            target_object_id=target_id,
            relation_type=relation_type
        ).first()
        if duplicate:
            errors.append({'index': index, 'targetId': target_id, 'error': 'Relation already exists'})
            continue

        relation = ObjectRelation(
            source_object_id=source_id,
            target_object_id=target_id,
            relation_type=relation_type,
            relation_metadata=metadata,
            description=metadata.get('description') if isinstance(metadata, dict) else None
        )
        db.session.add(relation)
        db.session.flush()
        created.append(relation.to_dict(include_objects=True))
        if target_id_full:
            batch_linked_id_fulls.add(target_id_full)

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
    relation = ObjectRelation.query.get_or_404(relation_id)
    db.session.delete(relation)
    db.session.commit()
    return jsonify({'message': 'Relation deleted successfully'}), 200
