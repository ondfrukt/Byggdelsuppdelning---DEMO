"""
Migration: Normalize object identifiers to baseID/version/full ID format.

Target format:
- baseID (stored in auto_id and main_id): PREFIX-<number> without zero padding
- version: v<number> without zero padding
- full ID (id_full): <baseID>.<version>
"""
import logging
import re
from models import Object
from utils.auto_id_generator import compose_full_id, normalize_version, get_object_type_prefix

logger = logging.getLogger(__name__)


def _extract_numeric_suffix(identifier, expected_prefix=None):
    text = str(identifier or '').strip()
    if not text:
        return None

    if expected_prefix:
        match = re.match(rf'^{re.escape(expected_prefix)}-(\d+)$', text, flags=re.IGNORECASE)
        if not match:
            return None
        return int(match.group(1))

    generic = re.match(r'^([A-Za-z0-9_]+)-(\d+)$', text)
    if not generic:
        return None
    return int(generic.group(2))


def _normalize_base_id(auto_id, main_id, fallback_prefix):
    source = str(auto_id or main_id or '').strip()
    if not source:
        return f"{fallback_prefix}-1"

    match = re.match(r'^([A-Za-z0-9_]+)-(\d+)$', source)
    if match:
        prefix = match.group(1).upper()
        number = int(match.group(2))
        return f"{prefix}-{number}"

    # Try to recover from strings like "BYG-001.001"
    main_part = source.split('.')[0]
    match = re.match(r'^([A-Za-z0-9_]+)-(\d+)$', main_part)
    if match:
        prefix = match.group(1).upper()
        number = int(match.group(2))
        return f"{prefix}-{number}"

    return f"{fallback_prefix}-1"


def run_migration(db):
    """Normalize object identifiers for all existing objects."""
    try:
        objects = Object.query.order_by(Object.id.asc()).all()
        if not objects:
            logger.info("No objects found for identifier normalization migration")
            return 0

        max_numbers_by_prefix = {}
        for obj in objects:
            candidate = obj.auto_id or obj.main_id
            if not candidate:
                continue
            match = re.match(r'^([A-Za-z0-9_]+)-(\d+)$', str(candidate).split('.')[0].strip(), flags=re.IGNORECASE)
            if not match:
                continue
            prefix = match.group(1).upper()
            number = int(match.group(2))
            max_numbers_by_prefix[prefix] = max(max_numbers_by_prefix.get(prefix, 0), number)

        used_base_ids = set()
        updated = 0

        for obj in objects:
            fallback_prefix = get_object_type_prefix(obj.object_type.name if obj.object_type else '')
            normalized_base = _normalize_base_id(obj.auto_id, obj.main_id, fallback_prefix)
            normalized_version = normalize_version(obj.version)

            # Guarantee uniqueness of base IDs after removing zero padding.
            if normalized_base in used_base_ids:
                prefix = normalized_base.split('-')[0].upper()
                next_number = max_numbers_by_prefix.get(prefix, 0) + 1
                while f"{prefix}-{next_number}" in used_base_ids:
                    next_number += 1
                normalized_base = f"{prefix}-{next_number}"
                max_numbers_by_prefix[prefix] = next_number

            used_base_ids.add(normalized_base)
            normalized_full = compose_full_id(normalized_base, normalized_version)

            if (
                obj.auto_id != normalized_base
                or obj.main_id != normalized_base
                or obj.version != normalized_version
                or obj.id_full != normalized_full
            ):
                obj.auto_id = normalized_base
                obj.main_id = normalized_base
                obj.version = normalized_version
                obj.id_full = normalized_full
                updated += 1

        if updated:
            db.session.commit()
        else:
            db.session.rollback()

        logger.info(f"Identifier normalization migration completed; updated={updated}")
        return updated
    except Exception as e:
        db.session.rollback()
        logger.error(f"Error running identifier normalization migration: {str(e)}")
        raise
