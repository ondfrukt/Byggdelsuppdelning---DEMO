"""
Migration: Normalize object identifiers to baseID/version/full ID format.

Target format:
- baseID (stored in main_id): PREFIX-<number> without zero padding
- version: v<number> without zero padding
- full ID (id_full): <baseID>.<version>
"""
import logging
import re
from models import Object
from utils.auto_id_generator import compose_full_id, normalize_version, get_object_type_prefix
from sqlalchemy import text

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


def _normalize_base_id(main_id, id_full, fallback_prefix):
    source = str(main_id or id_full or '').strip()
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

        updated = 0

        for obj in objects:
            fallback_prefix = get_object_type_prefix(obj.object_type.name if obj.object_type else '')
            normalized_base = _normalize_base_id(obj.main_id, obj.id_full, fallback_prefix)
            normalized_version = normalize_version(obj.version)
            normalized_full = compose_full_id(normalized_base, normalized_version)

            if (
                obj.main_id != normalized_base
                or obj.version != normalized_version
                or obj.id_full != normalized_full
            ):
                obj.main_id = normalized_base
                obj.version = normalized_version
                obj.id_full = normalized_full
                updated += 1

        if updated:
            db.session.commit()
        else:
            db.session.rollback()

        duplicates = db.session.execute(text("""
            SELECT id_full, COUNT(*) AS c
            FROM objects
            GROUP BY id_full
            HAVING c > 1
        """)).fetchall()
        if duplicates:
            logger.warning("Skipped unique index on objects.id_full due to duplicate values")
            return updated

        indexes = db.session.execute(text("PRAGMA index_list('objects')")).fetchall()
        has_unique_id_full_index = False
        for index in indexes:
            index_name = index[1]
            is_unique = bool(index[2])
            if not is_unique:
                continue
            index_info = db.session.execute(text(f"PRAGMA index_info('{index_name}')")).fetchall()
            columns = [item[2] for item in index_info]
            if columns == ['id_full']:
                has_unique_id_full_index = True
                break

        if not has_unique_id_full_index:
            db.session.execute(text("CREATE UNIQUE INDEX IF NOT EXISTS uq_objects_id_full ON objects(id_full)"))
            db.session.commit()

        logger.info(f"Identifier normalization migration completed; updated={updated}")
        return updated
    except Exception as e:
        db.session.rollback()
        logger.error(f"Error running identifier normalization migration: {str(e)}")
        raise
