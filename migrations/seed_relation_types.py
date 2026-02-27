"""Seed default relation types used by relation entities."""
import logging
import re
from models import db, ObjectType, RelationType

logger = logging.getLogger(__name__)


def _norm(value):
    return re.sub(r'[^a-z0-9]+', '', str(value or '').strip().lower())


def _find_object_type_id(aliases):
    if not aliases:
        return None
    normalized_aliases = {_norm(alias) for alias in aliases if alias}
    if not normalized_aliases:
        return None

    object_types = ObjectType.query.all()
    for object_type in object_types:
        if _norm(object_type.name) in normalized_aliases:
            return object_type.id
    return None


def _title_from_key(key):
    return str(key or '').replace('_', ' ').strip().title()


def run_migration(_db):
    """Create or update default relation types (idempotent)."""
    try:
        relation_type_specs = [
            {
                'key': 'has_requirement',
                'display_name': 'Has Requirement',
                'description': 'Any object can reference requirements.',
                'source_aliases': None,
                'target_aliases': ['Requirement', 'Kravställning', 'Kravstallning'],
                'cardinality': 'many_to_many',
                'is_directed': True,
                'is_composition': False,
                'inverse_key': None,
            },
            {
                'key': 'uses_product',
                'display_name': 'Uses Product',
                'description': 'Any object can use products.',
                'source_aliases': None,
                'target_aliases': ['Product', 'Produkt'],
                'cardinality': 'many_to_many',
                'is_directed': True,
                'is_composition': False,
                'inverse_key': None,
            },
            {
                'key': 'has_document',
                'display_name': 'Has Document',
                'description': 'Owned/composed document relation.',
                'source_aliases': None,
                'target_aliases': ['Document', 'Filobjekt', 'Ritningsobjekt', 'Dokumentobjekt'],
                'cardinality': 'one_to_many',
                'is_directed': True,
                'is_composition': True,
                'inverse_key': None,
            },
            {
                'key': 'references_document',
                'display_name': 'References Document',
                'description': 'Reference relation to documents.',
                'source_aliases': None,
                'target_aliases': ['Document', 'Filobjekt', 'Ritningsobjekt', 'Dokumentobjekt'],
                'cardinality': 'many_to_many',
                'is_directed': True,
                'is_composition': False,
                'inverse_key': None,
            },
            {
                'key': 'has_build_up_line',
                'display_name': 'Has Build Up Line',
                'description': 'Building part composition to build-up lines.',
                'source_aliases': ['BuildingPart', 'Byggdel'],
                'target_aliases': ['BuildUpLine', 'Build Up Line', 'Uppbyggnadsrad', 'Uppbyggnadslinje'],
                'cardinality': 'one_to_many',
                'is_directed': True,
                'is_composition': True,
                'inverse_key': None,
            },
            {
                'key': 'build_up_line_product',
                'display_name': 'Build Up Line Product',
                'description': 'Build-up line to product relation.',
                'source_aliases': ['BuildUpLine', 'Build Up Line', 'Uppbyggnadsrad', 'Uppbyggnadslinje'],
                'target_aliases': ['Product', 'Produkt'],
                'cardinality': 'one_to_one',
                'is_directed': True,
                'is_composition': False,
                'inverse_key': None,
            },
            {
                'key': 'connects',
                'display_name': 'Connects',
                'description': 'Connection relates to building parts.',
                'source_aliases': ['Connection', 'Anslutning'],
                'target_aliases': ['BuildingPart', 'Byggdel'],
                'cardinality': 'one_to_many',
                'is_directed': False,
                'is_composition': False,
                'inverse_key': None,
            },
            {
                'key': 'related',
                'display_name': 'Related',
                'description': 'Generic undirected relation.',
                'source_aliases': None,
                'target_aliases': None,
                'cardinality': 'many_to_many',
                'is_directed': False,
                'is_composition': False,
                'inverse_key': None,
            },
        ]

        relation_types_by_key = {item.key: item for item in RelationType.query.all()}
        created = 0
        updated = 0

        for spec in relation_type_specs:
            relation_type = relation_types_by_key.get(spec['key'])
            is_new = relation_type is None
            if is_new:
                relation_type = RelationType(key=spec['key'])
                db.session.add(relation_type)
                created += 1
            else:
                updated += 1

            relation_type.display_name = spec.get('display_name') or _title_from_key(spec['key'])
            relation_type.description = spec.get('description')
            relation_type.source_object_type_id = _find_object_type_id(spec.get('source_aliases'))
            relation_type.target_object_type_id = _find_object_type_id(spec.get('target_aliases'))
            relation_type.cardinality = spec['cardinality']
            relation_type.is_directed = bool(spec['is_directed'])
            relation_type.is_composition = bool(spec['is_composition'])
            relation_type.inverse_relation_type_id = None

            relation_types_by_key[spec['key']] = relation_type

        db.session.flush()

        # Resolve inverse relations by key if introduced later.
        for spec in relation_type_specs:
            inverse_key = spec.get('inverse_key')
            if not inverse_key:
                continue
            relation_type = relation_types_by_key.get(spec['key'])
            inverse_relation_type = relation_types_by_key.get(inverse_key)
            if relation_type and inverse_relation_type:
                relation_type.inverse_relation_type_id = inverse_relation_type.id

        db.session.commit()
        logger.info(f"Seeded relation types successfully (created={created}, updated={updated})")
    except Exception as e:
        db.session.rollback()
        logger.error(f"Error seeding relation types: {str(e)}")
        raise
