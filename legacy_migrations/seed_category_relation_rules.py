"""Seed RelationTypeRule entries for the classification/category system."""
import logging
from sqlalchemy import text

from models import db, RelationTypeRule, ObjectType

logger = logging.getLogger(__name__)

# Rules to seed: (source_type_name, target_type_name, relation_type_key, is_allowed)
# source/target names must match ObjectType.name in the database.
# 'category_node' and 'classification_system' are added by add_classification_system migration.
CATEGORY_RULE_SPECS = [
    # Tree structure
    ('category_node',          'category_node', 'has_parent',          True),
    ('classification_system',  'category_node', 'contains_node',       True),
    # Classification of objects
    ('Assembly',               'category_node', 'classified_as',       True),
    ('Requirement',            'category_node', 'applies_to_category', True),
    ('Instruction',            'category_node', 'applies_to_category', True),
    # Blocked combinations
    ('Assembly',               'Assembly',      'has_parent',          False),
    ('category_node',          'Assembly',      'classified_as',       False),
]


def run_migration(_db):
    """Upsert category-related RelationTypeRule entries."""
    try:
        # Build ObjectType lookup by name (case-insensitive)
        all_types = {ot.name.lower(): ot for ot in ObjectType.query.all() if ot.name}

        created = 0
        updated = 0
        skipped = 0

        for src_name, tgt_name, rel_type, is_allowed in CATEGORY_RULE_SPECS:
            src = all_types.get(src_name.lower())
            tgt = all_types.get(tgt_name.lower())

            if src is None or tgt is None:
                missing = []
                if src is None:
                    missing.append(f"source='{src_name}'")
                if tgt is None:
                    missing.append(f"target='{tgt_name}'")
                logger.warning(
                    "Skipping category relation rule (%s → %s : %s) — ObjectType not found: %s",
                    src_name, tgt_name, rel_type, ', '.join(missing)
                )
                skipped += 1
                continue

            existing = RelationTypeRule.query.filter_by(
                source_object_type_id=src.id,
                target_object_type_id=tgt.id,
            ).first()

            if existing is None:
                rule = RelationTypeRule(
                    source_object_type_id=src.id,
                    target_object_type_id=tgt.id,
                    relation_type=rel_type,
                    is_allowed=is_allowed,
                )
                db.session.add(rule)
                created += 1
            else:
                # Only update if relation_type or is_allowed has changed
                if existing.relation_type != rel_type or existing.is_allowed != is_allowed:
                    existing.relation_type = rel_type
                    existing.is_allowed = is_allowed
                    updated += 1

        db.session.commit()
        logger.info(
            "Seeded category relation rules (created=%s, updated=%s, skipped=%s)",
            created, updated, skipped,
        )
    except Exception as e:
        db.session.rollback()
        logger.error(f"Error seeding category relation rules: {str(e)}")
        raise
