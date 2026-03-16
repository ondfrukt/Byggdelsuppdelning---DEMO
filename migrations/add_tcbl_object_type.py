"""
Migration: ensure the TCBL object type exists with required fields.
"""
import logging

from models import ObjectType, ObjectField

logger = logging.getLogger(__name__)


OBJECT_TYPE_NAME = 'TCBL'


def _find_field(fields, field_name):
    return next((field for field in fields if str(field.field_name or '').strip().lower() == field_name), None)


def _upsert_field(fields, object_type_id, field_name, display_name, field_type, display_order, **overrides):
    field = _find_field(fields, field_name)
    if field is None:
        field = ObjectField(
            object_type_id=object_type_id,
            field_name=field_name,
            display_name=display_name,
            field_type=field_type,
            display_order=display_order,
            is_required=bool(overrides.get('is_required', False)),
            lock_required_setting=bool(overrides.get('lock_required_setting', False)),
            force_presence_on_all_objects=bool(overrides.get('force_presence_on_all_objects', False)),
            is_table_visible=bool(overrides.get('is_table_visible', True)),
            is_detail_visible=bool(overrides.get('is_detail_visible', True)),
            help_text=overrides.get('help_text'),
            detail_width=overrides.get('detail_width'),
        )
        db_fields = fields
        db_fields.append(field)
        return field, True

    changed = False
    for attr, value in {
        'display_name': display_name,
        'field_type': field_type,
        'display_order': display_order,
        'is_required': bool(overrides.get('is_required', False)),
        'lock_required_setting': bool(overrides.get('lock_required_setting', False)),
        'force_presence_on_all_objects': bool(overrides.get('force_presence_on_all_objects', False)),
        'is_table_visible': bool(overrides.get('is_table_visible', True)),
        'is_detail_visible': bool(overrides.get('is_detail_visible', True)),
        'help_text': overrides.get('help_text'),
        'detail_width': overrides.get('detail_width'),
    }.items():
        if getattr(field, attr, None) != value:
            setattr(field, attr, value)
            changed = True

    return field, changed


def run_migration(db):
    """
    Add/update the TCBL object type in existing databases.

    On a brand-new database this migration intentionally does nothing before the
    default seed runs, otherwise the initial seed would be skipped.
    """
    try:
        if ObjectType.query.first() is None:
            logger.info("Skipping TCBL migration on empty database before default seed")
            return

        object_type = ObjectType.query.filter_by(name=OBJECT_TYPE_NAME).first()
        created = False
        if object_type is None:
            object_type = ObjectType(
                name=OBJECT_TYPE_NAME,
                description="Represents a reusable content block within a technical chapter, typically holding a chapter number and rich text content.",
                icon=None,
                id_prefix='TCBL',
                color='#0f766e',
                is_system=False,
            )
            db.session.add(object_type)
            db.session.flush()
            created = True
        else:
            object_type.description = "Represents a reusable content block within a technical chapter, typically holding a chapter number and rich text content."
            object_type.id_prefix = 'TCBL'
            object_type.color = '#0f766e'
            object_type.is_system = False

        fields = list(ObjectField.query.filter_by(object_type_id=object_type.id).all())
        changed_fields = 0

        for field_name, display_name, field_type, display_order, options in [
            ('namn', 'Name', 'text', 1, {
                'is_required': True,
                'lock_required_setting': True,
                'force_presence_on_all_objects': True,
                'is_table_visible': True,
                'is_detail_visible': True,
                'help_text': 'Primary name for the object.',
                'detail_width': None,
            }),
            ('kapitelnummer', 'Chapter Number', 'text', 2, {
                'is_required': True,
                'lock_required_setting': False,
                'force_presence_on_all_objects': False,
                'is_table_visible': True,
                'is_detail_visible': True,
                'help_text': 'AMA-style chapter or subchapter number.',
                'detail_width': None,
            }),
            ('innehall', 'Content', 'richtext', 3, {
                'is_required': False,
                'lock_required_setting': False,
                'force_presence_on_all_objects': False,
                'is_table_visible': False,
                'is_detail_visible': True,
                'help_text': 'Rich text content for the chapter block.',
                'detail_width': 'full',
            }),
        ]:
            field, changed = _upsert_field(
                fields,
                object_type.id,
                field_name,
                display_name,
                field_type,
                display_order,
                **options,
            )
            if field.id is None:
                db.session.add(field)
            if changed:
                changed_fields += 1

        db.session.commit()
        logger.info(
            "TCBL object type migration completed successfully (created=%s, changed_fields=%s)",
            created,
            changed_fields,
        )
    except Exception as e:
        db.session.rollback()
        logger.error("Error running TCBL object type migration: %s", str(e))
        raise
