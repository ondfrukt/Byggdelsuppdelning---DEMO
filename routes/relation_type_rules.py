import re
from models import db, RelationTypeRule, ObjectType


def _normalize(value):
    return re.sub(r'[^a-z0-9]+', '', str(value or '').strip().lower())


OBJECT_TYPE_ALIASES = {
    'Requirement': {'requirement', 'kravstallning', 'kravställning'},
    'Product': {'product', 'produkt'},
    'Document': {'document', 'filobjekt', 'ritningsobjekt', 'dokumentobjekt'},
    'BuildingPart': {'buildingpart', 'byggdel'},
    'BuildUpLine': {'buildupline', 'build up line', 'uppbyggnadsrad', 'uppbyggnadslinje'},
    'Connection': {'connection', 'anslutning'},
}


RELATION_TYPE_RULES = {
    'has_requirement': {'source': None, 'target': 'Requirement'},
    'uses_product': {'source': None, 'target': 'Product'},
    'has_document': {'source': None, 'target': 'Document'},
    'references_document': {'source': None, 'target': 'Document'},
    'has_build_up_line': {'source': 'BuildingPart', 'target': 'BuildUpLine'},
    'build_up_line_product': {'source': 'BuildUpLine', 'target': 'Product'},
    'connects': {'source': 'Connection', 'target': 'BuildingPart'},
}

DEFAULT_RELATION_TYPE = 'relaterad'


def _matches_type_name(obj, canonical_type_name):
    if not obj or not getattr(obj, 'object_type', None):
        return False

    object_type_name = getattr(obj.object_type, 'name', '')
    normalized_type_name = _normalize(object_type_name)
    aliases = OBJECT_TYPE_ALIASES.get(canonical_type_name) or {canonical_type_name}
    normalized_aliases = {_normalize(alias) for alias in aliases}

    return normalized_type_name in normalized_aliases


def get_available_relation_types():
    return [DEFAULT_RELATION_TYPE, *RELATION_TYPE_RULES.keys()]


def ensure_complete_relation_rule_matrix(default_relation_type=DEFAULT_RELATION_TYPE, default_is_allowed=True):
    """
    Ensure all directed object type pairs (source != target) have a relation rule row.
    Returns number of created rows; does not commit automatically.
    """
    object_type_ids = [item.id for item in ObjectType.query.order_by(ObjectType.id.asc()).all()]
    if len(object_type_ids) < 2:
        return 0

    existing_pairs = {
        (rule.source_object_type_id, rule.target_object_type_id)
        for rule in RelationTypeRule.query.all()
    }

    created = 0
    for source_id in object_type_ids:
        for target_id in object_type_ids:
            if source_id == target_id:
                continue
            pair = (source_id, target_id)
            if pair in existing_pairs:
                continue

            db.session.add(RelationTypeRule(
                source_object_type_id=source_id,
                target_object_type_id=target_id,
                relation_type=default_relation_type,
                is_allowed=bool(default_is_allowed)
            ))
            existing_pairs.add(pair)
            created += 1

    return created


def get_configured_relation_rule(source_object, target_object):
    """Return fixed configured rule for source/target object type pair."""
    source_type_id = getattr(source_object, 'object_type_id', None)
    target_type_id = getattr(target_object, 'object_type_id', None)
    if not source_type_id or not target_type_id:
        return None

    rule = RelationTypeRule.query.filter_by(
        source_object_type_id=source_type_id,
        target_object_type_id=target_type_id
    ).first()
    return rule


def get_configured_relation_type(source_object, target_object):
    """Return fixed configured relation_type for source/target object type pair."""
    rule = get_configured_relation_rule(source_object, target_object)
    if not rule or rule.is_allowed is False:
        return None

    relation_type = str(rule.relation_type or '').strip().lower()
    return relation_type or None


def is_relation_blocked(source_object, target_object):
    rule = get_configured_relation_rule(source_object, target_object)
    return bool(rule and rule.is_allowed is False)


def validate_relation_type_scope(relation_type, source_object, target_object):
    """Return an error message when relation_type violates SOURCE/TARGET rules; otherwise None."""
    key = str(relation_type or '').strip().lower()
    rule = RELATION_TYPE_RULES.get(key)
    if not rule:
        return None

    source_constraint = rule.get('source')
    target_constraint = rule.get('target')

    if source_constraint and not _matches_type_name(source_object, source_constraint):
        source_type = getattr(getattr(source_object, 'object_type', None), 'name', 'Unknown')
        return (
            f"Invalid source type '{source_type}' for relation type '{key}'. "
            f"Expected SOURCE '{source_constraint}'."
        )

    if target_constraint and not _matches_type_name(target_object, target_constraint):
        target_type = getattr(getattr(target_object, 'object_type', None), 'name', 'Unknown')
        return (
            f"Invalid target type '{target_type}' for relation type '{key}'. "
            f"Expected TARGET '{target_constraint}'."
        )

    return None


def infer_relation_type(source_object, target_object, fallback=DEFAULT_RELATION_TYPE):
    """Infer best matching relation type from SOURCE/TARGET rules."""
    configured = get_configured_relation_type(source_object, target_object)
    if configured:
        return configured

    best_key = None
    best_score = -1

    for key, rule in RELATION_TYPE_RULES.items():
        source_constraint = rule.get('source')
        target_constraint = rule.get('target')

        if source_constraint and not _matches_type_name(source_object, source_constraint):
            continue
        if target_constraint and not _matches_type_name(target_object, target_constraint):
            continue

        # Prefer specific SOURCE/TARGET constraints over generic Any-rules.
        score = 0
        if source_constraint:
            score += 2
        if target_constraint:
            score += 1

        if score > best_score:
            best_score = score
            best_key = key

    return best_key or fallback
