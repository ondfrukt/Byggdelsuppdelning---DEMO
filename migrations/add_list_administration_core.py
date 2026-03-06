"""
Migration: Add core list-administration fields and field_list_bindings table.
"""
from sqlalchemy import inspect, text
import logging
import re

logger = logging.getLogger(__name__)


def slugify(value):
    base = re.sub(r'[^a-z0-9]+', '_', str(value or '').strip().lower()).strip('_')
    return base[:100] if base else ''


def run_migration(db):
    try:
        engine = db.session.get_bind()
        inspector = inspect(engine)
        tables = set(inspector.get_table_names())

        if 'managed_lists' in tables:
            list_columns = {column['name'] for column in inspector.get_columns('managed_lists')}
            if 'code' not in list_columns:
                db.session.execute(text("ALTER TABLE managed_lists ADD COLUMN code VARCHAR(100)"))
            if 'allow_multiselect' not in list_columns:
                db.session.execute(text("ALTER TABLE managed_lists ADD COLUMN allow_multiselect BOOLEAN NOT NULL DEFAULT 0"))

            rows = db.session.execute(text("SELECT id, name, code FROM managed_lists")).fetchall()
            used_codes = set()
            for row in rows:
                row_id = int(row[0])
                current_code = str(row[2] or '').strip().lower()
                if current_code:
                    used_codes.add(current_code)
                    continue
                base = slugify(row[1]) or f'list_{row_id}'
                candidate = base
                suffix = 2
                while candidate in used_codes:
                    candidate = f"{base}_{suffix}"
                    suffix += 1
                used_codes.add(candidate)
                db.session.execute(
                    text("UPDATE managed_lists SET code = :code WHERE id = :id"),
                    {'id': row_id, 'code': candidate}
                )
            try:
                db.session.execute(text("CREATE UNIQUE INDEX uix_managed_lists_code ON managed_lists(code)"))
            except Exception:
                pass

        if 'managed_list_items' in tables:
            item_columns = {column['name'] for column in inspector.get_columns('managed_list_items')}
            if 'code' not in item_columns:
                db.session.execute(text("ALTER TABLE managed_list_items ADD COLUMN code VARCHAR(100)"))
            if 'label' not in item_columns:
                db.session.execute(text("ALTER TABLE managed_list_items ADD COLUMN label VARCHAR(255)"))
            if 'description' not in item_columns:
                db.session.execute(text("ALTER TABLE managed_list_items ADD COLUMN description TEXT"))
            if 'level' not in item_columns:
                db.session.execute(text("ALTER TABLE managed_list_items ADD COLUMN level INTEGER NOT NULL DEFAULT 0"))
            if 'is_selectable' not in item_columns:
                db.session.execute(text("ALTER TABLE managed_list_items ADD COLUMN is_selectable BOOLEAN NOT NULL DEFAULT 1"))

            db.session.execute(text("UPDATE managed_list_items SET label = COALESCE(label, value) WHERE label IS NULL OR label = ''"))

        if 'field_list_bindings' not in tables:
            db.session.execute(text("""
                CREATE TABLE field_list_bindings (
                    id INTEGER PRIMARY KEY,
                    object_type VARCHAR(100) NOT NULL,
                    field_name VARCHAR(100) NOT NULL,
                    list_id INTEGER NOT NULL,
                    selection_mode VARCHAR(20) NOT NULL DEFAULT 'single',
                    allow_only_leaf_selection BOOLEAN NOT NULL DEFAULT 0,
                    is_required BOOLEAN NOT NULL DEFAULT 0,
                    created_at DATETIME,
                    updated_at DATETIME,
                    FOREIGN KEY(list_id) REFERENCES managed_lists(id) ON DELETE CASCADE,
                    UNIQUE(object_type, field_name)
                )
            """))

        try:
            db.session.execute(text("CREATE INDEX idx_field_list_bindings_list_id ON field_list_bindings(list_id)"))
        except Exception:
            pass
        try:
            db.session.execute(text("CREATE INDEX idx_managed_list_items_list_parent ON managed_list_items(list_id, parent_item_id)"))
        except Exception:
            pass

        db.session.commit()
        logger.info("List administration core migration completed")
    except Exception as e:
        db.session.rollback()
        logger.error(f"Error in list administration core migration: {str(e)}")
        raise
