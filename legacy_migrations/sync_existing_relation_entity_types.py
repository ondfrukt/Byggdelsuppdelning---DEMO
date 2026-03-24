"""Migration: sync existing object_relations.relation_type with relation_type_rules."""
import logging
from sqlalchemy.orm import joinedload
from models import ObjectRelation, RelationTypeRule

logger = logging.getLogger(__name__)


def _normalize(value):
    return str(value or '').strip().lower()


def run_migration(db):
    """
    Update existing relation entities so their relation_type matches the configured
    relation_type_rules for each source/target object type pair.
    """
    try:
        rules_by_pair = {}
        for rule in RelationTypeRule.query.all():
            if rule.is_allowed is False:
                continue
            normalized_type = _normalize(rule.relation_type)
            if not normalized_type:
                continue
            pair_key = (rule.source_object_type_id, rule.target_object_type_id)
            rules_by_pair[pair_key] = normalized_type

        if not rules_by_pair:
            logger.info("No relation type rules available for syncing relation entities")
            return 0

        updated = 0
        relations = ObjectRelation.query.options(
            joinedload(ObjectRelation.source_object),
            joinedload(ObjectRelation.target_object)
        ).all()

        for relation in relations:
            source = relation.source_object
            target = relation.target_object
            if not source or not target:
                continue

            expected_type = rules_by_pair.get((source.object_type_id, target.object_type_id))
            if not expected_type:
                continue

            current_type = _normalize(relation.relation_type)
            if current_type == expected_type:
                continue

            relation.relation_type = expected_type
            updated += 1

        if updated > 0:
            db.session.commit()
            logger.info(f"Synced relation entity types: updated={updated}")
        else:
            logger.info("Relation entity types already aligned with relation_type_rules")

        return updated
    except Exception as e:
        db.session.rollback()
        logger.error(f"Error syncing relation entity types: {str(e)}")
        raise
