"""Normalize all relations to the configured object-pair rules."""

from pathlib import Path
import sys

ROOT_DIR = Path(__file__).resolve().parents[1]
if str(ROOT_DIR) not in sys.path:
    sys.path.insert(0, str(ROOT_DIR))

from app import app
from models import db, ObjectRelation
from routes.relation_type_rules import get_configured_relation_rule, normalize_relation_direction
from utils.instance_types import ALLOWED_INSTANCE_TYPES
from scripts.backfill_missing_instances import backfill_missing_instances


def get_expected_allowed_rule(source_object, target_object):
    forward_rule = get_configured_relation_rule(source_object, target_object)
    if forward_rule and forward_rule.is_allowed is True:
        relation_type = str(forward_rule.relation_type or '').strip().lower()
        if relation_type:
            return relation_type

    reverse_rule = get_configured_relation_rule(target_object, source_object)
    if reverse_rule and reverse_rule.is_allowed is True:
        relation_type = str(reverse_rule.relation_type or '').strip().lower()
        if relation_type:
            return relation_type

    return None


def merge_relation_payload(target_relation, source_relation):
    if not target_relation.description and source_relation.description:
        target_relation.description = source_relation.description
    if not target_relation.relation_metadata and source_relation.relation_metadata:
        target_relation.relation_metadata = source_relation.relation_metadata
    if target_relation.max_targets_per_source is None and source_relation.max_targets_per_source is not None:
        target_relation.max_targets_per_source = source_relation.max_targets_per_source
    if target_relation.max_sources_per_target is None and source_relation.max_sources_per_target is not None:
        target_relation.max_sources_per_target = source_relation.max_sources_per_target


def normalize_relations_to_pair_rules():
    updated = []
    deleted_duplicates = []

    with app.app_context():
        relations = ObjectRelation.query.order_by(ObjectRelation.id.asc()).all()
        for relation in relations:
            source_object = relation.source_object
            target_object = relation.target_object
            if not source_object or not target_object:
                continue

            expected_type = get_expected_allowed_rule(source_object, target_object)
            if not expected_type:
                continue

            _, normalized_source, normalized_target, _ = normalize_relation_direction(
                relation_type=expected_type,
                source_object=source_object,
                target_object=target_object,
            )

            current_type = str(relation.relation_type or '').strip().lower()
            already_normalized = (
                relation.source_object_id == normalized_source.id
                and relation.target_object_id == normalized_target.id
                and current_type == expected_type
            )
            if already_normalized:
                continue

            duplicate = ObjectRelation.query.filter(
                ObjectRelation.id != relation.id,
                ObjectRelation.source_object_id == normalized_source.id,
                ObjectRelation.target_object_id == normalized_target.id,
                ObjectRelation.relation_type == expected_type,
            ).first()

            if duplicate:
                merge_relation_payload(duplicate, relation)
                db.session.delete(relation)
                deleted_duplicates.append({
                    'deleted_relation_id': int(relation.id),
                    'kept_relation_id': int(duplicate.id),
                    'expected_type': expected_type,
                    'source_object_id': int(normalized_source.id),
                    'target_object_id': int(normalized_target.id),
                })
                continue

            relation.source_object_id = normalized_source.id
            relation.target_object_id = normalized_target.id
            relation.relation_type = expected_type
            updated.append({
                'relation_id': int(relation.id),
                'source_object_id': int(normalized_source.id),
                'target_object_id': int(normalized_target.id),
                'expected_type': expected_type,
                'structural': expected_type in ALLOWED_INSTANCE_TYPES,
            })

        if updated or deleted_duplicates:
            db.session.commit()

    created_instances = backfill_missing_instances()
    return {
        'updated_relations': updated,
        'deleted_duplicates': deleted_duplicates,
        'created_instances': created_instances,
    }


if __name__ == '__main__':
    result = normalize_relations_to_pair_rules()
    print(f"Updated relations: {len(result['updated_relations'])}")
    for row in result['updated_relations']:
        print(row)
    print(f"Deleted duplicate relations: {len(result['deleted_duplicates'])}")
    for row in result['deleted_duplicates']:
        print(row)
    print(f"Created instances: {len(result['created_instances'])}")
    for row in result['created_instances']:
        print(row)
