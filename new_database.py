from datetime import date, datetime

from models import db, ObjectType, ObjectField, Object, ObjectData, ObjectRelation
from models import ClassificationSystem, CategoryNode, ObjectCategoryAssignment
from utils.default_seed_loader import load_default_seed_payload
from sqlalchemy import text
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


def _coerce_date(value):
    if value in (None, ''):
        return None
    if isinstance(value, date):
        return value
    text = str(value).strip()
    if not text:
        return None
    return datetime.fromisoformat(text).date()


def _assign_object_data(object_record, field_record, value):
    payload = {
        'object_id': object_record.id,
        'field_id': field_record.id,
    }

    field_type = field_record.field_type or 'text'
    if field_type == 'number':
        payload['value_number'] = value
    elif field_type == 'date':
        payload['value_date'] = _coerce_date(value)
    elif field_type == 'boolean':
        payload['value_boolean'] = None if value is None else bool(value)
    elif field_type in {'json', 'select', 'file'} and isinstance(value, (dict, list)):
        payload['value_json'] = value
    else:
        payload['value_json'] = value if isinstance(value, (dict, list)) else None
        payload['value_text'] = None if isinstance(value, (dict, list)) else (None if value is None else str(value))

    db.session.add(ObjectData(**payload))


def seed_data(app):
    """Populate database defaults if object types are missing."""
    with app.app_context():
        if ObjectType.query.first() is not None:
            logger.info("Database already contains data, skipping seed")
            return

        payload = load_default_seed_payload()
        object_type_specs = payload.get('object_types') if isinstance(payload, dict) else None
        object_specs = payload.get('objects') if isinstance(payload, dict) else None
        relation_specs = payload.get('object_relations') if isinstance(payload, dict) else None
        classification_system_specs = payload.get('classification_systems') if isinstance(payload, dict) else None
        category_node_specs = payload.get('category_nodes') if isinstance(payload, dict) else None
        if not isinstance(object_type_specs, list) or not object_type_specs:
            logger.warning("No object type defaults found in defaults/plm-defaults.json; skipping seed")
            return

        logger.info("Seeding object types, fields, objects and relations from defaults/plm-defaults.json...")

        try:
            created_types = 0
            created_fields = 0
            created_objects = 0
            created_relations = 0
            object_types_by_name = {}
            fields_by_type_and_name = {}
            seeded_objects = {}

            # Seed classification systems with preserved IDs so category_node field
            # references (stored as numeric IDs in object data) remain valid.
            if isinstance(classification_system_specs, list):
                engine = db.session.get_bind()
                for sys_spec in classification_system_specs:
                    sys_id = sys_spec.get('id')
                    if not sys_id:
                        continue
                    db.session.execute(text("""
                        INSERT INTO classification_systems
                            (id, name, description, version, is_active, created_at, updated_at)
                        VALUES
                            (:id, :name, :description, :version, :is_active,
                             CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
                    """), {
                        'id': sys_id,
                        'name': sys_spec.get('name'),
                        'description': sys_spec.get('description'),
                        'version': sys_spec.get('version'),
                        'is_active': bool(sys_spec.get('is_active', True)),
                    })
                db.session.flush()
                if engine.dialect.name == 'postgresql':
                    db.session.execute(text(
                        "SELECT setval('classification_systems_id_seq',"
                        " (SELECT MAX(id) FROM classification_systems))"
                    ))
                logger.info("Seeded %d classification systems", len(classification_system_specs))

            # Seed category nodes with preserved IDs (ordered by level to satisfy FK).
            if isinstance(category_node_specs, list):
                engine = db.session.get_bind()
                nodes_ordered = sorted(category_node_specs, key=lambda n: (n.get('level', 1), n.get('id', 0)))
                for node_spec in nodes_ordered:
                    node_id = node_spec.get('id')
                    if not node_id:
                        continue
                    db.session.execute(text("""
                        INSERT INTO category_nodes
                            (id, system_id, parent_id, code, name, level,
                             description, sort_order, is_active, created_at, updated_at)
                        VALUES
                            (:id, :system_id, :parent_id, :code, :name, :level,
                             :description, :sort_order, :is_active,
                             CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
                    """), {
                        'id': node_id,
                        'system_id': node_spec.get('system_id'),
                        'parent_id': node_spec.get('parent_id'),
                        'code': node_spec.get('code'),
                        'name': node_spec.get('name'),
                        'level': node_spec.get('level', 1),
                        'description': node_spec.get('description'),
                        'sort_order': node_spec.get('sort_order', 0),
                        'is_active': bool(node_spec.get('is_active', True)),
                    })
                db.session.flush()
                if engine.dialect.name == 'postgresql':
                    db.session.execute(text(
                        "SELECT setval('category_nodes_id_seq',"
                        " (SELECT MAX(id) FROM category_nodes))"
                    ))
                logger.info("Seeded %d category nodes", len(category_node_specs))

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
                object_types_by_name[name] = object_type
                fields_by_type_and_name[name] = {}

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
                    db.session.flush()
                    fields_by_type_and_name[name][field_name] = object_field
                    created_fields += 1

            # Track pending category assignments: (object_record, node_id)
            pending_category_assignments = []

            if isinstance(object_specs, list):
                for object_payload in object_specs:
                    object_type_name = str(object_payload.get('object_type') or '').strip()
                    object_type = object_types_by_name.get(object_type_name)
                    if object_type is None:
                        continue

                    object_record = Object(
                        object_type_id=object_type.id,
                        created_by=object_payload.get('created_by'),
                        status=object_payload.get('status') or 'In work',
                        version=object_payload.get('version') or 'v1',
                        main_id=object_payload.get('main_id'),
                        id_full=object_payload.get('id_full'),
                    )
                    db.session.add(object_record)
                    db.session.flush()
                    created_objects += 1

                    object_data = object_payload.get('data') or {}
                    if isinstance(object_data, dict):
                        for field_name, value in object_data.items():
                            field_record = fields_by_type_and_name.get(object_type_name, {}).get(str(field_name))
                            if field_record is None:
                                continue
                            _assign_object_data(object_record, field_record, value)
                            if field_record.field_type == 'category_node' and value is not None:
                                raw_val = str(value).strip()
                                if raw_val.isdigit():
                                    pending_category_assignments.append((object_record, int(raw_val)))

                    seed_key = str(object_payload.get('seed_key') or '').strip()
                    if seed_key:
                        seeded_objects[seed_key] = object_record

            # Create object_category_assignments so the tree-view can find objects
            for obj_rec, node_id in pending_category_assignments:
                db.session.add(ObjectCategoryAssignment(
                    object_id=obj_rec.id,
                    category_node_id=node_id,
                    is_primary=True,
                ))
            if pending_category_assignments:
                logger.info("Created %d category assignments", len(pending_category_assignments))

            if isinstance(relation_specs, list):
                for relation_payload in relation_specs:
                    source_seed_key = str(relation_payload.get('source_object_seed_key') or '').strip()
                    target_seed_key = str(relation_payload.get('target_object_seed_key') or '').strip()
                    source_object = seeded_objects.get(source_seed_key)
                    target_object = seeded_objects.get(target_seed_key)
                    if source_object is None or target_object is None:
                        continue

                    db.session.add(ObjectRelation(
                        source_object_id=source_object.id,
                        target_object_id=target_object.id,
                        relation_type=relation_payload.get('relation_type') or 'uses_object',
                        description=relation_payload.get('description'),
                        relation_metadata=relation_payload.get('relation_metadata'),
                    ))
                    created_relations += 1

            db.session.commit()
            logger.info(
                "Seeded defaults successfully (object_types=%s, object_fields=%s, objects=%s, object_relations=%s)",
                created_types,
                created_fields,
                created_objects,
                created_relations,
            )
        except Exception as exc:
            db.session.rollback()
            logger.error(f"Error seeding defaults: {str(exc)}")
            raise
