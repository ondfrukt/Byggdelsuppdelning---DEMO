import re
from models import db, RelationTypeRule, RelationType, ObjectType


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
    'uses_object': {'source': None, 'target': None},
    'references_object': {'source': None, 'target': None},
    'applies_to': {'source': None, 'target': None},
    'connects_to': {'source': None, 'target': None},
    'contains': {'source': None, 'target': None},
}

DEFAULT_RELATION_TYPE = 'uses_object'


def _matches_type_name(obj, canonical_type_name):
    if not obj or not getattr(obj, 'object_type', None):
        return False

    object_type_name = getattr(obj.object_type, 'name', '')
    normalized_type_name = _normalize(object_type_name)
    aliases = OBJECT_TYPE_ALIASES.get(canonical_type_name) or {canonical_type_name}
    normalized_aliases = {_normalize(alias) for alias in aliases}

    return normalized_type_name in normalized_aliases


def get_available_relation_types():
    configured_keys = []
    try:
        configured_keys = [
            str(item.key or '').strip().lower()
            for item in RelationType.query.order_by(RelationType.key.asc()).all()
            if str(item.key or '').strip()
        ]
    except Exception:
        configured_keys = []
    source_keys = configured_keys if configured_keys else list(RELATION_TYPE_RULES.keys())
    ordered = [DEFAULT_RELATION_TYPE]
    for key in source_keys:
        if key and key not in ordered:
            ordered.append(key)
    return ordered


def get_relation_type_scope_rules():
    """
    Return relation-type scope definitions.
    Prefers DB-backed relation_types rows, falls back to static defaults.
    """
    rules = {}

    try:
        for relation_type in RelationType.query.all():
            key = str(relation_type.key or '').strip().lower()
            if not key:
                continue
            rules[key] = {
                'source_object_type_id': relation_type.source_object_type_id,
                'target_object_type_id': relation_type.target_object_type_id,
            }
    except Exception:
        rules = {}

    # Backward compatibility fallback for environments where relation_types
    # is not fully populated yet.
    for key, rule in RELATION_TYPE_RULES.items():
        normalized_key = str(key).strip().lower()
        if normalized_key in rules:
            continue
        rules[normalized_key] = {
            'source': rule.get('source'),
            'target': rule.get('target'),
        }

    return rules


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


def enforce_pair_relation_type(relation_type, source_object, target_object, fallback=DEFAULT_RELATION_TYPE):
    """
    Enforce one allowed relation type per source/target type pair.
    Returns tuple: (effective_relation_type, error_message_or_none).
    """
    rule = get_configured_relation_rule(source_object, target_object)
    requested = str(relation_type or '').strip().lower()

    if rule:
        if rule.is_allowed is False:
            source_type = source_object.object_type.name if source_object and source_object.object_type else 'Unknown'
            target_type = target_object.object_type.name if target_object and target_object.object_type else 'Unknown'
            return None, f'Linking is disabled between {source_type} and {target_type}'

        expected = str(rule.relation_type or '').strip().lower() or fallback
        if not requested or requested == 'auto':
            requested = expected

        if requested != expected:
            return None, f"Only relation type '{expected}' is allowed for this source/target type pair"
        return requested, None

    if not requested or requested == 'auto':
        return infer_relation_type(source_object, target_object, fallback=fallback), None
    return requested, None


def validate_relation_type_scope(relation_type, source_object, target_object):
    """Return an error message when relation_type violates SOURCE/TARGET rules; otherwise None."""
    key = str(relation_type or '').strip().lower()
    rule = get_relation_type_scope_rules().get(key)
    if not rule:
        return None

    source_type_id_constraint = rule.get('source_object_type_id')
    target_type_id_constraint = rule.get('target_object_type_id')

    if source_type_id_constraint and getattr(source_object, 'object_type_id', None) != source_type_id_constraint:
        source_type = getattr(getattr(source_object, 'object_type', None), 'name', 'Unknown')
        return (
            f"Invalid source type '{source_type}' for relation type '{key}'. "
            f"Expected SOURCE object_type_id={source_type_id_constraint}."
        )

    if target_type_id_constraint and getattr(target_object, 'object_type_id', None) != target_type_id_constraint:
        target_type = getattr(getattr(target_object, 'object_type', None), 'name', 'Unknown')
        return (
            f"Invalid target type '{target_type}' for relation type '{key}'. "
            f"Expected TARGET object_type_id={target_type_id_constraint}."
        )

    # Legacy name-based fallback constraints.
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

    source_object_type_id = getattr(source_object, 'object_type_id', None)
    target_object_type_id = getattr(target_object, 'object_type_id', None)

    for key, rule in get_relation_type_scope_rules().items():
        source_type_id_constraint = rule.get('source_object_type_id')
        target_type_id_constraint = rule.get('target_object_type_id')

        if source_type_id_constraint and source_object_type_id != source_type_id_constraint:
            continue
        if target_type_id_constraint and target_object_type_id != target_type_id_constraint:
            continue

        # Legacy name-based fallback constraints.
        source_constraint = rule.get('source')
        target_constraint = rule.get('target')
        if source_constraint and not _matches_type_name(source_object, source_constraint):
            continue
        if target_constraint and not _matches_type_name(target_object, target_constraint):
            continue

        # Prefer specific SOURCE/TARGET constraints over generic Any-rules.
        score = 0
        if source_type_id_constraint or source_constraint:
            score += 2
        if target_type_id_constraint or target_constraint:
            score += 1

        if score > best_score:
            best_score = score
            best_key = key

    return best_key or fallback
