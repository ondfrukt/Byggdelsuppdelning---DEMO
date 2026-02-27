from flask import Blueprint, jsonify, request
from models import db, RelationTypeRule, RelationType, ObjectType
from routes.relation_type_rules import get_available_relation_types, ensure_complete_relation_rule_matrix

bp = Blueprint('relation_type_rules_api', __name__, url_prefix='/api/relation-type-rules')


def _normalize_relation_type(value):
    candidate = str(value or '').strip().lower()
    allowed = set(get_available_relation_types())
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
def list_relation_type_rules():
    created = ensure_complete_relation_rule_matrix()
    if created > 0:
        db.session.commit()

    rules = RelationTypeRule.query.order_by(RelationTypeRule.id.asc()).all()
    relation_types = RelationType.query.order_by(RelationType.key.asc()).all()
    return jsonify({
        'items': [_serialize_rule(rule) for rule in rules],
        'available_relation_types': get_available_relation_types(),
        'relation_types': [relation_type.to_dict() for relation_type in relation_types]
    }), 200


@bp.route('', methods=['POST'])
def upsert_relation_type_rule():
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

    source_type = ObjectType.query.get(source_object_type_id)
    target_type = ObjectType.query.get(target_object_type_id)
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

    source_type = ObjectType.query.get(source_object_type_id)
    target_type = ObjectType.query.get(target_object_type_id)
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
    rule = RelationTypeRule.query.get_or_404(rule_id)
    db.session.delete(rule)
    db.session.commit()
    return jsonify({'message': 'Relation type rule deleted successfully'}), 200
