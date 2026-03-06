"""
Migration: Add managed_list_links and managed_list_item_links tables and seed examples.
"""
from sqlalchemy import inspect, text
import logging

logger = logging.getLogger(__name__)


def _get_or_create_list(db, name, description=None):
    row = db.session.execute(
        text("SELECT id FROM managed_lists WHERE lower(name) = lower(:name) LIMIT 1"),
        {'name': name}
    ).fetchone()
    if row:
        return int(row[0])

    db.session.execute(
        text("""
            INSERT INTO managed_lists (name, description, language_codes, additional_language_code, is_active, created_at, updated_at)
            VALUES (:name, :description, :language_codes, :additional_language_code, 1, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
        """),
        {
            'name': name,
            'description': description,
            'language_codes': '["sv","en"]',
            'additional_language_code': 'en',
        }
    )
    row = db.session.execute(
        text("SELECT id FROM managed_lists WHERE lower(name) = lower(:name) LIMIT 1"),
        {'name': name}
    ).fetchone()
    return int(row[0])


def _get_or_create_item(db, list_id, value, translations=None, sort_order=0):
    row = db.session.execute(
        text("""
            SELECT id FROM managed_list_items
            WHERE list_id = :list_id AND lower(value) = lower(:value)
            LIMIT 1
        """),
        {'list_id': list_id, 'value': value}
    ).fetchone()
    if row:
        return int(row[0])

    db.session.execute(
        text("""
            INSERT INTO managed_list_items (list_id, value, value_translations, sort_order, is_active, created_at, updated_at)
            VALUES (:list_id, :value, :value_translations, :sort_order, 1, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
        """),
        {
            'list_id': list_id,
            'value': value,
            'value_translations': translations or '{}',
            'sort_order': sort_order,
        }
    )
    row = db.session.execute(
        text("""
            SELECT id FROM managed_list_items
            WHERE list_id = :list_id AND lower(value) = lower(:value)
            LIMIT 1
        """),
        {'list_id': list_id, 'value': value}
    ).fetchone()
    return int(row[0])


def _get_or_create_list_link(db, parent_list_id, child_list_id, relation_key='depends_on'):
    row = db.session.execute(
        text("""
            SELECT id FROM managed_list_links
            WHERE parent_list_id = :parent_list_id
              AND child_list_id = :child_list_id
              AND relation_key = :relation_key
            LIMIT 1
        """),
        {
            'parent_list_id': parent_list_id,
            'child_list_id': child_list_id,
            'relation_key': relation_key,
        }
    ).fetchone()
    if row:
        return int(row[0])

    db.session.execute(
        text("""
            INSERT INTO managed_list_links (parent_list_id, child_list_id, relation_key, is_active, created_at, updated_at)
            VALUES (:parent_list_id, :child_list_id, :relation_key, 1, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
        """),
        {
            'parent_list_id': parent_list_id,
            'child_list_id': child_list_id,
            'relation_key': relation_key,
        }
    )
    row = db.session.execute(
        text("""
            SELECT id FROM managed_list_links
            WHERE parent_list_id = :parent_list_id
              AND child_list_id = :child_list_id
              AND relation_key = :relation_key
            LIMIT 1
        """),
        {
            'parent_list_id': parent_list_id,
            'child_list_id': child_list_id,
            'relation_key': relation_key,
        }
    ).fetchone()
    return int(row[0])


def _get_or_create_item_link(db, list_link_id, parent_item_id, child_item_id):
    row = db.session.execute(
        text("""
            SELECT id FROM managed_list_item_links
            WHERE list_link_id = :list_link_id
              AND parent_item_id = :parent_item_id
              AND child_item_id = :child_item_id
            LIMIT 1
        """),
        {
            'list_link_id': list_link_id,
            'parent_item_id': parent_item_id,
            'child_item_id': child_item_id,
        }
    ).fetchone()
    if row:
        return int(row[0])

    db.session.execute(
        text("""
            INSERT INTO managed_list_item_links (list_link_id, parent_item_id, child_item_id, is_active, created_at, updated_at)
            VALUES (:list_link_id, :parent_item_id, :child_item_id, 1, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
        """),
        {
            'list_link_id': list_link_id,
            'parent_item_id': parent_item_id,
            'child_item_id': child_item_id,
        }
    )
    row = db.session.execute(
        text("""
            SELECT id FROM managed_list_item_links
            WHERE list_link_id = :list_link_id
              AND parent_item_id = :parent_item_id
              AND child_item_id = :child_item_id
            LIMIT 1
        """),
        {
            'list_link_id': list_link_id,
            'parent_item_id': parent_item_id,
            'child_item_id': child_item_id,
        }
    ).fetchone()
    return int(row[0])


def seed_example_data(db):
    # Example hierarchy that can be extended to any number of levels.
    category_list_id = _get_or_create_list(
        db,
        'EXAMPLE_Category',
        'Top level category for dynamic managed-list graph example',
    )
    subcategory_list_id = _get_or_create_list(
        db,
        'EXAMPLE_Subcategory',
        'Child list connected to EXAMPLE_Category',
    )
    detail_list_id = _get_or_create_list(
        db,
        'EXAMPLE_Subsubcategory',
        'Child list connected to EXAMPLE_Subcategory',
    )

    category_to_subcategory = _get_or_create_list_link(db, category_list_id, subcategory_list_id)
    subcategory_to_detail = _get_or_create_list_link(db, subcategory_list_id, detail_list_id)

    cat_envelope = _get_or_create_item(db, category_list_id, 'Envelope', '{"sv":"Klimatskal","en":"Envelope"}', 1)
    cat_mep = _get_or_create_item(db, category_list_id, 'Installations', '{"sv":"Installationer","en":"Installations"}', 2)

    sub_wall = _get_or_create_item(db, subcategory_list_id, 'Exterior Wall', '{"sv":"Yttervägg","en":"Exterior Wall"}', 1)
    sub_roof = _get_or_create_item(db, subcategory_list_id, 'Roof', '{"sv":"Tak","en":"Roof"}', 2)
    sub_hvac = _get_or_create_item(db, subcategory_list_id, 'Ventilation', '{"sv":"Ventilation","en":"Ventilation"}', 3)

    detail_timber = _get_or_create_item(db, detail_list_id, 'Timber Stud Wall', '{"sv":"Träregelvägg","en":"Timber Stud Wall"}', 1)
    detail_concrete = _get_or_create_item(db, detail_list_id, 'Concrete Wall', '{"sv":"Betongvägg","en":"Concrete Wall"}', 2)
    detail_flat_roof = _get_or_create_item(db, detail_list_id, 'Flat Roof', '{"sv":"Platt tak","en":"Flat Roof"}', 3)
    detail_ftx = _get_or_create_item(db, detail_list_id, 'FTX Unit', '{"sv":"FTX-aggregat","en":"FTX Unit"}', 4)

    _get_or_create_item_link(db, category_to_subcategory, cat_envelope, sub_wall)
    _get_or_create_item_link(db, category_to_subcategory, cat_envelope, sub_roof)
    _get_or_create_item_link(db, category_to_subcategory, cat_mep, sub_hvac)

    _get_or_create_item_link(db, subcategory_to_detail, sub_wall, detail_timber)
    _get_or_create_item_link(db, subcategory_to_detail, sub_wall, detail_concrete)
    _get_or_create_item_link(db, subcategory_to_detail, sub_roof, detail_flat_roof)
    _get_or_create_item_link(db, subcategory_to_detail, sub_hvac, detail_ftx)


def run_migration(db):
    """Create list-link tables if missing and seed example data."""
    try:
        engine = db.session.get_bind()
        inspector = inspect(engine)
        tables = set(inspector.get_table_names())

        if 'managed_list_links' not in tables:
            db.session.execute(text("""
                CREATE TABLE managed_list_links (
                    id INTEGER PRIMARY KEY,
                    parent_list_id INTEGER NOT NULL,
                    child_list_id INTEGER NOT NULL,
                    relation_key VARCHAR(64) NOT NULL DEFAULT 'depends_on',
                    is_active BOOLEAN NOT NULL DEFAULT 1,
                    created_at DATETIME,
                    updated_at DATETIME,
                    FOREIGN KEY(parent_list_id) REFERENCES managed_lists(id) ON DELETE CASCADE,
                    FOREIGN KEY(child_list_id) REFERENCES managed_lists(id) ON DELETE CASCADE,
                    UNIQUE(parent_list_id, child_list_id, relation_key)
                )
            """))
            logger.info("Created managed_list_links table")

        if 'managed_list_item_links' not in tables:
            db.session.execute(text("""
                CREATE TABLE managed_list_item_links (
                    id INTEGER PRIMARY KEY,
                    list_link_id INTEGER NOT NULL,
                    parent_item_id INTEGER NOT NULL,
                    child_item_id INTEGER NOT NULL,
                    is_active BOOLEAN NOT NULL DEFAULT 1,
                    created_at DATETIME,
                    updated_at DATETIME,
                    FOREIGN KEY(list_link_id) REFERENCES managed_list_links(id) ON DELETE CASCADE,
                    FOREIGN KEY(parent_item_id) REFERENCES managed_list_items(id) ON DELETE CASCADE,
                    FOREIGN KEY(child_item_id) REFERENCES managed_list_items(id) ON DELETE CASCADE,
                    UNIQUE(list_link_id, parent_item_id, child_item_id)
                )
            """))
            logger.info("Created managed_list_item_links table")

        # Add indexes if they don't exist (idempotent checks via pragma on sqlite are cumbersome, use try).
        try:
            db.session.execute(text("CREATE INDEX idx_managed_list_links_parent ON managed_list_links(parent_list_id)"))
        except Exception:
            pass
        try:
            db.session.execute(text("CREATE INDEX idx_managed_list_links_child ON managed_list_links(child_list_id)"))
        except Exception:
            pass
        try:
            db.session.execute(text("CREATE INDEX idx_managed_list_item_links_parent ON managed_list_item_links(parent_item_id)"))
        except Exception:
            pass
        try:
            db.session.execute(text("CREATE INDEX idx_managed_list_item_links_child ON managed_list_item_links(child_item_id)"))
        except Exception:
            pass

        seed_example_data(db)

        db.session.commit()
        logger.info("Managed list links migration completed successfully")
    except Exception as e:
        db.session.rollback()
        logger.error(f"Error running managed list links migration: {str(e)}")
        raise
