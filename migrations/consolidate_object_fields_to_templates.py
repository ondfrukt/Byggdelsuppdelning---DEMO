"""Migration: link object fields to standardized templates and consolidate legacy field definitions."""
import logging
from sqlalchemy import inspect, text

logger = logging.getLogger(__name__)


def _normalize_name(value):
    return str(value or '').strip().lower()


def _build_template_name(field_name, display_name):
    display = str(display_name or '').strip()
    if display:
        return f"Standard {display}"
    normalized = _normalize_name(field_name).replace('_', ' ').strip()
    if not normalized:
        return "Standardfält"
    return f"Standard {normalized.title()}"


def _next_unique_template_name(base_name, used_names):
    candidate = base_name
    index = 2
    while candidate.lower() in used_names:
        candidate = f"{base_name} ({index})"
        index += 1
    used_names.add(candidate.lower())
    return candidate


def run_migration(db):
    try:
        inspector = inspect(db.engine)
        table_names = set(inspector.get_table_names())

        if 'field_templates' in table_names:
            template_columns = {column['name'] for column in inspector.get_columns('field_templates')}
            if 'lock_required_setting' not in template_columns:
                db.session.execute(text("ALTER TABLE field_templates ADD COLUMN lock_required_setting BOOLEAN NOT NULL DEFAULT FALSE"))
            if 'force_presence_on_all_objects' not in template_columns:
                db.session.execute(text("ALTER TABLE field_templates ADD COLUMN force_presence_on_all_objects BOOLEAN NOT NULL DEFAULT FALSE"))

        if 'object_fields' in table_names:
            field_columns = {column['name'] for column in inspector.get_columns('object_fields')}
            if 'field_template_id' not in field_columns:
                db.session.execute(text("ALTER TABLE object_fields ADD COLUMN field_template_id INTEGER"))
            db.session.execute(text("CREATE INDEX IF NOT EXISTS idx_object_fields_template_id ON object_fields(field_template_id)"))

        db.session.commit()

        if 'field_templates' not in table_names or 'object_fields' not in table_names:
            logger.info("Skipping consolidation migration because required tables are missing")
            return

        from models import FieldTemplate, ObjectField, ObjectData, Object

        templates = FieldTemplate.query.order_by(FieldTemplate.id.asc()).all()
        templates_by_field_name = {}
        used_template_names = set()
        for template in templates:
            normalized = _normalize_name(template.field_name)
            if normalized and normalized not in templates_by_field_name:
                templates_by_field_name[normalized] = template
            used_template_names.add(str(template.template_name or '').strip().lower())

        for field in ObjectField.query.order_by(ObjectField.id.asc()).all():
            normalized_name = _normalize_name(field.field_name)
            if not normalized_name:
                continue

            template = templates_by_field_name.get(normalized_name)
            if not template:
                base_name = _build_template_name(field.field_name, field.display_name)
                template_name = _next_unique_template_name(base_name, used_template_names)
                template = FieldTemplate(
                    template_name=template_name,
                    field_name=normalized_name,
                    display_name=field.display_name or field.field_name,
                    display_name_translations={},
                    field_type=field.field_type or 'text',
                    field_options=field.field_options,
                    is_required=bool(field.is_required),
                    lock_required_setting=bool(field.lock_required_setting),
                    force_presence_on_all_objects=bool(field.force_presence_on_all_objects),
                    is_table_visible=bool(field.is_table_visible),
                    help_text=field.help_text,
                    help_text_translations={},
                    is_active=True
                )
                db.session.add(template)
                db.session.flush()
                templates_by_field_name[normalized_name] = template

            # Canonicalize to the shared template definition.
            field.field_template_id = template.id
            field.field_name = template.field_name
            field.display_name = template.display_name
            field.field_type = template.field_type
            field.field_options = template.field_options
            field.lock_required_setting = bool(template.lock_required_setting)
            field.force_presence_on_all_objects = bool(template.force_presence_on_all_objects)
            field.is_table_visible = bool(template.is_table_visible)
            field.help_text = template.help_text

            if normalized_name == 'namn':
                template.is_required = True
                template.lock_required_setting = True
                template.force_presence_on_all_objects = True
                field.is_required = True
                field.lock_required_setting = True
                field.force_presence_on_all_objects = True

        db.session.flush()

        # Respect force-presence templates by creating missing object_data rows.
        forced_fields = ObjectField.query.filter(ObjectField.force_presence_on_all_objects.is_(True)).all()
        for field in forced_fields:
            object_ids = [item.id for item in Object.query.filter_by(object_type_id=field.object_type_id).all()]
            if not object_ids:
                continue
            existing_rows = ObjectData.query.filter(
                ObjectData.field_id == field.id,
                ObjectData.object_id.in_(object_ids)
            ).all()
            existing_object_ids = {row.object_id for row in existing_rows}
            for object_id in object_ids:
                if object_id in existing_object_ids:
                    continue
                db.session.add(ObjectData(object_id=object_id, field_id=field.id))

        db.session.commit()
        logger.info("Object field/template consolidation migration completed successfully")
    except Exception as e:
        db.session.rollback()
        logger.error(f"Error running object field/template consolidation migration: {str(e)}")
        raise
