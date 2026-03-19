"""Seed canonical semantic relation types without overwriting pair rules."""
import logging

from models import db, RelationType

logger = logging.getLogger(__name__)


RELATION_TYPE_SPECS = [
    {
        'key': 'connects_to',
        'display_name': 'Connects To',
        'description': 'Links two objects through a physical or logical connection without implying hierarchy or ownership.',
        'category': 'semantisk',
        'cardinality': 'many_to_many',
        'is_directed': False,
        'is_composition': False,
    },
    {
        'key': 'has_requirement',
        'display_name': 'Has Requirement',
        'description': 'Links an object to a requirement that governs, constrains, or specifies it.',
        'category': 'semantisk',
        'cardinality': 'many_to_many',
        'is_directed': True,
        'is_composition': False,
    },
    {
        'key': 'has_document',
        'display_name': 'Has Document',
        'description': 'Links an object to a document that describes, proves, or accompanies it.',
        'category': 'semantisk',
        'cardinality': 'many_to_many',
        'is_directed': True,
        'is_composition': False,
    },
    {
        'key': 'has_property',
        'display_name': 'Has Property',
        'description': 'Links an object to a property, characteristic, or attribute definition associated with it.',
        'category': 'semantisk',
        'cardinality': 'many_to_many',
        'is_directed': True,
        'is_composition': False,
    },
    {
        'key': 'references_object',
        'display_name': 'References Object',
        'description': 'Generic semantic traceability link between two objects.',
        'category': 'semantisk',
        'cardinality': 'many_to_many',
        'is_directed': True,
        'is_composition': False,
    },
]


def run_migration(_db):
    """Synchronize semantic relation types with the canonical set."""
    try:
        specs_by_key = {item['key']: item for item in RELATION_TYPE_SPECS}
        existing_by_key = {
            str(item.key or '').strip().lower(): item
            for item in RelationType.query.all()
            if str(item.key or '').strip()
        }

        created = 0
        updated = 0
        deleted = 0

        for key, relation_type in list(existing_by_key.items()):
            if key in specs_by_key:
                continue
            db.session.delete(relation_type)
            deleted += 1

        for key, spec in specs_by_key.items():
            relation_type = existing_by_key.get(key)
            if relation_type is None:
                relation_type = RelationType(key=key)
                db.session.add(relation_type)
                created += 1
            else:
                updated += 1

            relation_type.display_name = spec['display_name']
            relation_type.description = spec['description']
            relation_type.category = spec.get('category') or 'semantisk'
            relation_type.source_object_type_id = None
            relation_type.target_object_type_id = None
            relation_type.cardinality = spec['cardinality']
            relation_type.is_directed = bool(spec['is_directed'])
            relation_type.is_composition = bool(spec['is_composition'])
            relation_type.inverse_relation_type_id = None

        db.session.commit()
        logger.info(
            "Seeded canonical relation types successfully (created=%s, updated=%s, deleted=%s)",
            created,
            updated,
            deleted,
        )
    except Exception as e:
        db.session.rollback()
        logger.error(f"Error seeding canonical relation types: {str(e)}")
        raise
