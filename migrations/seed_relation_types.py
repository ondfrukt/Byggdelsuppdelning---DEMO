"""Seed relation types and relation rules from repository defaults."""
import logging
import re
from models import db, ObjectType, RelationType, RelationTypeRule
from utils.default_seed_loader import load_default_seed_payload

logger = logging.getLogger(__name__)


DEFAULT_RELATION_TYPE = 'uses_object'


def _norm(value):
    return re.sub(r'[^a-z0-9]+', '', str(value or '').strip().lower())


def _title_from_key(key):
    return str(key or '').replace('_', ' ').strip().title()


def _normalize_cardinality(value):
    mapping = {
        'm2m': 'many_to_many',
        'many_to_many': 'many_to_many',
        '1ton': 'one_to_many',
        'one_to_many': 'one_to_many',
        'nto1': 'many_to_one',
        'many_to_one': 'many_to_one',
        '1to1': 'one_to_one',
        'one_to_one': 'one_to_one',
    }
    return mapping.get(str(value or '').strip().lower(), 'many_to_many')


def _object_type_name_to_id_map():
    return {
        _norm(item.name): item.id
        for item in ObjectType.query.all()
    }


def run_migration(_db):
    """Seed relation types and matrix rules (idempotent)."""
    payload = load_default_seed_payload()
    relation_type_specs = payload.get('relation_types') if isinstance(payload, dict) else None
    relation_rule_specs = payload.get('relation_type_rules') if isinstance(payload, dict) else None

    if not isinstance(relation_type_specs, list) or not relation_type_specs:
        logger.warning('No relation type defaults found; skipping relation type seed')
        return

    try:
        object_type_ids = _object_type_name_to_id_map()

        spec_keys = {
            str(spec.get('key') or '').strip().lower()
            for spec in relation_type_specs
            if str(spec.get('key') or '').strip()
        }

        relation_types_by_key = {
            str(item.key or '').strip().lower(): item
            for item in RelationType.query.all()
            if str(item.key or '').strip()
        }

        created = 0
        updated = 0
        deleted = 0

        for key, relation_type in list(relation_types_by_key.items()):
            if key in spec_keys:
                continue
            db.session.delete(relation_type)
            relation_types_by_key.pop(key, None)
            deleted += 1

        for spec in relation_type_specs:
            key = str(spec.get('key') or '').strip().lower()
            if not key:
                continue

            relation_type = relation_types_by_key.get(key)
            if relation_type is None:
                relation_type = RelationType(key=key)
                db.session.add(relation_type)
                created += 1
            else:
                updated += 1

            source_name = str(spec.get('source_object_type') or '').strip()
            target_name = str(spec.get('target_object_type') or '').strip()

            relation_type.display_name = spec.get('display_name') or _title_from_key(key)
            relation_type.description = spec.get('description')
            relation_type.source_object_type_id = object_type_ids.get(_norm(source_name)) if source_name else None
            relation_type.target_object_type_id = object_type_ids.get(_norm(target_name)) if target_name else None
            relation_type.cardinality = _normalize_cardinality(spec.get('cardinality'))
            relation_type.is_directed = bool(spec.get('is_directed', True))
            relation_type.is_composition = bool(spec.get('is_composition', False))
            relation_type.inverse_relation_type_id = None

            relation_types_by_key[key] = relation_type

        db.session.flush()

        for spec in relation_type_specs:
            key = str(spec.get('key') or '').strip().lower()
            inverse_key = str(spec.get('inverse_key') or '').strip().lower()
            if not key or not inverse_key:
                continue
            relation_type = relation_types_by_key.get(key)
            inverse_relation_type = relation_types_by_key.get(inverse_key)
            if relation_type and inverse_relation_type:
                relation_type.inverse_relation_type_id = inverse_relation_type.id

        if not isinstance(relation_rule_specs, list):
            relation_rule_specs = []

        existing_rules = {
            (rule.source_object_type_id, rule.target_object_type_id): rule
            for rule in RelationTypeRule.query.all()
        }

        for spec in relation_rule_specs:
            source_name = str(spec.get('source_object_type') or '').strip()
            target_name = str(spec.get('target_object_type') or '').strip()
            source_id = object_type_ids.get(_norm(source_name))
            target_id = object_type_ids.get(_norm(target_name))
            if not source_id or not target_id or source_id == target_id:
                continue

            relation_type_key = str(spec.get('relation_type') or DEFAULT_RELATION_TYPE).strip().lower() or DEFAULT_RELATION_TYPE
            is_allowed = bool(spec.get('is_allowed', True))
            key = (source_id, target_id)

            rule = existing_rules.get(key)
            if not rule:
                rule = RelationTypeRule(
                    source_object_type_id=source_id,
                    target_object_type_id=target_id,
                )
                db.session.add(rule)
                existing_rules[key] = rule

            rule.relation_type = relation_type_key
            rule.is_allowed = is_allowed

        db.session.commit()
        logger.info(
            'Seeded relation defaults successfully (relation_types_created=%s, relation_types_updated=%s, relation_types_deleted=%s, relation_rules=%s)',
            created,
            updated,
            deleted,
            len(relation_rule_specs),
        )
    except Exception as e:
        db.session.rollback()
        logger.error(f"Error seeding relation defaults: {str(e)}")
        raise
