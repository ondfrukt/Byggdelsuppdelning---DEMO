from models import db, ObjectType, ObjectField
from utils.default_seed_loader import load_default_seed_payload
import logging

logger = logging.getLogger(__name__)


def init_db(app):
    """Initialize the database"""
    with app.app_context():
        db.create_all()
        logger.info("Database tables created successfully")


def _normalize_field_payload(field_payload):
    return {
        'field_name': field_payload.get('field_name'),
        'display_name': field_payload.get('display_name'),
        'field_type': field_payload.get('field_type') or 'text',
        'field_options': field_payload.get('field_options'),
        'is_required': bool(field_payload.get('is_required')),
        'lock_required_setting': bool(field_payload.get('lock_required_setting')),
        'force_presence_on_all_objects': bool(field_payload.get('force_presence_on_all_objects')),
        'is_table_visible': bool(field_payload.get('is_table_visible', True)),
        'is_detail_visible': bool(field_payload.get('is_detail_visible', True)),
        'help_text': field_payload.get('help_text'),
        'display_order': field_payload.get('display_order'),
        'detail_width': field_payload.get('detail_width'),
    }


def seed_data(app):
    """Populate database defaults if object types are missing."""
    with app.app_context():
        if ObjectType.query.first() is not None:
            logger.info("Database already contains data, skipping seed")
            return

        payload = load_default_seed_payload()
        object_type_specs = payload.get('object_types') if isinstance(payload, dict) else None
        if not isinstance(object_type_specs, list) or not object_type_specs:
            logger.warning("No object type defaults found in defaults/plm-defaults.json; skipping seed")
            return

        logger.info("Seeding object types and fields from defaults/plm-defaults.json...")

        try:
            created_types = 0
            created_fields = 0

            for object_type_payload in object_type_specs:
                name = str(object_type_payload.get('name') or '').strip()
                if not name:
                    continue

                object_type = ObjectType(
                    name=name,
                    description=object_type_payload.get('description'),
                    icon=object_type_payload.get('icon'),
                    id_prefix=object_type_payload.get('id_prefix'),
                    color=object_type_payload.get('color'),
                    is_system=bool(object_type_payload.get('is_system', True)),
                )
                db.session.add(object_type)
                db.session.flush()
                created_types += 1

                fields = object_type_payload.get('fields') or []
                for field_payload in fields:
                    normalized = _normalize_field_payload(field_payload)
                    field_name = str(normalized.get('field_name') or '').strip()
                    if not field_name:
                        continue

                    object_field = ObjectField(
                        object_type_id=object_type.id,
                        **normalized,
                    )
                    db.session.add(object_field)
                    created_fields += 1

            db.session.commit()
            logger.info(
                "Seeded defaults successfully (object_types=%s, object_fields=%s)",
                created_types,
                created_fields,
            )
        except Exception as exc:
            db.session.rollback()
            logger.error(f"Error seeding defaults: {str(exc)}")
            raise
