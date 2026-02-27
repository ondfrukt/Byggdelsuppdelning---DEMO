"""Seed canonical relation types used by relation entities."""
import logging
import re
from models import db, ObjectType, RelationType, RelationTypeRule

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


def run_migration(_db):
    """Reset and seed canonical relation types (idempotent)."""
    try:
        relation_type_specs = [
            {
                'key': 'uses_object',
                'display_name': 'Använder',
                'description': 'Används när source använder, innehåller, består av eller på annat sätt nyttjar target som en del av sin lösning. Target är återanvändbar och ägs inte av source. Target kan användas av flera olika objekt samtidigt. Typiska exempel: Byggdel använder Produkt, Modul använder Produkt, Anslutning använder Produkt.',
                'source_aliases': None,
                'target_aliases': None,
                'cardinality': 'm2m',
                'is_directed': True,
                'is_composition': False,
                'inverse_key': None,
            },
            {
                'key': 'references_object',
                'display_name': 'Refererar till',
                'description': 'Används när source hänvisar till target som information, dokumentation, relaterad entitet eller klassificering, utan att target är en fysisk del av source. Relation innebär spårbarhet eller kontext, inte användning eller ägande. Typiska exempel: Produkt refererar till Filobjekt, Byggdel refererar till Dokument, Objekt refererar till System.',
                'source_aliases': None,
                'target_aliases': None,
                'cardinality': 'm2m',
                'is_directed': True,
                'is_composition': False,
                'inverse_key': None,
            },
            {
                'key': 'applies_to',
                'display_name': 'Gäller för',
                'description': 'Används när source representerar ett krav, regel, anvisning eller annan styrande information som ska tolkas som att den gäller för target. Source kan gälla flera target och target kan omfattas av flera krav eller anvisningar. Typiska exempel: Kravställning gäller för Byggdel, Anvisning gäller för Modul, Regel gäller för System.',
                'source_aliases': None,
                'target_aliases': None,
                'cardinality': 'm2m',
                'is_directed': True,
                'is_composition': False,
                'inverse_key': None,
            },
            {
                'key': 'connects_to',
                'display_name': 'Ansluter till',
                'description': 'Används när två objekt är kopplade via en fysisk eller logisk anslutning eller gränssnitt. Relation beskriver ett nätverk eller graf snarare än en hierarki. Ingen part äger den andra genom denna relation. Typiska exempel: Byggdel ansluter till Byggdel, System ansluter till System, Objekt är kopplat till annat objekt via anslutning.',
                'source_aliases': None,
                'target_aliases': None,
                'cardinality': 'm2m',
                'is_directed': False,
                'is_composition': False,
                'inverse_key': None,
            },
            {
                'key': 'contains',
                'display_name': 'Innehåller',
                'description': 'Används när target är en strukturell del av source och ingår i dess interna uppbyggnad. Detta beskriver en hierarkisk relation där target normalt inte existerar som del av flera olika parents samtidigt. Typiska exempel: Teknisk beskrivning innehåller Tekniskt kapittel, Filobjekt innehåller Fil.',
                'source_aliases': None,
                'target_aliases': None,
                'cardinality': '1toN',
                'is_directed': True,
                'is_composition': True,
                'inverse_key': None,
            },
        ]

        spec_keys = {spec['key'] for spec in relation_type_specs}
        relation_types_by_key = {item.key: item for item in RelationType.query.all()}
        created = 0
        updated = 0
        deleted = 0

        # Hard reset: remove relation types not part of canonical set.
        for key, relation_type in list(relation_types_by_key.items()):
            if key in spec_keys:
                continue
            db.session.delete(relation_type)
            relation_types_by_key.pop(key, None)
            deleted += 1

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
            relation_type.cardinality = _normalize_cardinality(spec['cardinality'])
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

        allowed_keys = set(spec_keys)
        default_relation_type = 'uses_object'
        for rule in RelationTypeRule.query.all():
            current_type = str(rule.relation_type or '').strip().lower()
            if current_type in allowed_keys:
                continue
            rule.relation_type = default_relation_type

        db.session.commit()
        logger.info(f"Seeded relation types successfully (created={created}, updated={updated}, deleted={deleted})")
    except Exception as e:
        db.session.rollback()
        logger.error(f"Error seeding relation types: {str(e)}")
        raise
