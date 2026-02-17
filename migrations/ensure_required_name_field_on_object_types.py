"""
Migration: ensure every object type has a required 'namn' field.
"""
import logging
from models import ObjectType, ObjectField

logger = logging.getLogger(__name__)


def _normalize_field_name(value):
    return (value or '').strip().lower()


def run_migration(db):
    """Ensure all object types have a required/table-visible namn field."""
    try:
        object_types = ObjectType.query.all()

        for object_type in object_types:
            fields = list(object_type.fields or [])
            exact_name_field = next((f for f in fields if f.field_name == 'namn'), None)
            normalized_name_fields = [f for f in fields if _normalize_field_name(f.field_name) == 'namn']

            target_field = exact_name_field
            if target_field is None and normalized_name_fields:
                target_field = normalized_name_fields[0]
                target_field.field_name = 'namn'
                logger.info("Renamed name field to 'namn' for object type %s", object_type.name)

            if target_field is None:
                max_order = max((f.display_order or 0) for f in fields) if fields else 0
                target_field = ObjectField(
                    object_type_id=object_type.id,
                    field_name='namn',
                    display_name='Namn',
                    field_type='text',
                    is_required=True,
                    is_table_visible=True,
                    display_order=max_order + 1
                )
                db.session.add(target_field)
                logger.info("Added required 'namn' field for object type %s", object_type.name)

            target_field.is_required = True
            target_field.is_table_visible = True
            if not target_field.display_name:
                target_field.display_name = 'Namn'

        db.session.commit()
        logger.info("Required namn-field migration completed successfully")
    except Exception as e:
        db.session.rollback()
        logger.error(f"Error running required namn-field migration: {str(e)}")
        raise

