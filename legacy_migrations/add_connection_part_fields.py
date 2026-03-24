"""
Migration: Ensure connection object types have required Del A / Del B fields.
"""
import logging
from models import ObjectType, ObjectField

logger = logging.getLogger(__name__)


def _normalize(value):
    return ''.join(ch for ch in (value or '').lower() if ch.isalnum())


def _is_connection_type(type_name):
    return 'anslutning' in _normalize(type_name)


def _find_field(fields, aliases):
    alias_keys = {_normalize(alias) for alias in aliases}
    for field in fields:
        if _normalize(field.field_name) in alias_keys:
            return field
    return None


def run_migration(db):
    """Ensure Del A and Del B required text fields exist on connection object types."""
    try:
        updated = 0
        object_types = ObjectType.query.all()

        for object_type in object_types:
            if not _is_connection_type(object_type.name):
                continue

            fields = list(ObjectField.query.filter_by(object_type_id=object_type.id).all())
            max_order = max([(field.display_order or 0) for field in fields], default=0)

            for canonical_name, display_name, aliases in [
                ('del_a', 'Del A', ['del_a', 'dela', 'del a']),
                ('del_b', 'Del B', ['del_b', 'delb', 'del b'])
            ]:
                field = _find_field(fields, aliases)
                if field:
                    changed = False
                    if field.field_name != canonical_name:
                        field.field_name = canonical_name
                        changed = True
                    if field.display_name != display_name:
                        field.display_name = display_name
                        changed = True
                    if field.field_type != 'text':
                        field.field_type = 'text'
                        changed = True
                    if field.is_required is not True:
                        field.is_required = True
                        changed = True
                    if hasattr(field, 'is_table_visible') and field.is_table_visible is not True:
                        field.is_table_visible = True
                        changed = True

                    if changed:
                        updated += 1
                    continue

                max_order += 1
                new_field = ObjectField(
                    object_type_id=object_type.id,
                    field_name=canonical_name,
                    display_name=display_name,
                    field_type='text',
                    is_required=True,
                    is_table_visible=True,
                    help_text='Används för att autogenerera namn på anslutningen',
                    display_order=max_order
                )
                db.session.add(new_field)
                updated += 1

        db.session.commit()
        logger.info("Connection part fields migration completed successfully (updated=%s)", updated)
    except Exception as e:
        db.session.rollback()
        logger.error("Error running connection part fields migration: %s", str(e))
        raise
