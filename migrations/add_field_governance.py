"""Migration: add field governance columns and object-level field overrides."""
import logging
from sqlalchemy import inspect, text

logger = logging.getLogger(__name__)


def run_migration(db):
    try:
        inspector = inspect(db.engine)
        existing_tables = inspector.get_table_names()

        if 'object_fields' in existing_tables:
            columns = {column['name'] for column in inspector.get_columns('object_fields')}
            if 'lock_required_setting' not in columns:
                db.session.execute(text("ALTER TABLE object_fields ADD COLUMN lock_required_setting BOOLEAN NOT NULL DEFAULT FALSE"))
            if 'force_presence_on_all_objects' not in columns:
                db.session.execute(text("ALTER TABLE object_fields ADD COLUMN force_presence_on_all_objects BOOLEAN NOT NULL DEFAULT FALSE"))

        if 'object_field_overrides' not in existing_tables:
            db.session.execute(text("""
                CREATE TABLE object_field_overrides (
                    id INTEGER PRIMARY KEY,
                    object_id INTEGER NOT NULL REFERENCES objects(id) ON DELETE CASCADE,
                    field_id INTEGER NOT NULL REFERENCES object_fields(id) ON DELETE CASCADE,
                    is_required_override BOOLEAN NULL,
                    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                    CONSTRAINT uix_object_field_override UNIQUE(object_id, field_id)
                )
            """))

        db.session.execute(text("CREATE INDEX IF NOT EXISTS idx_object_field_overrides_object ON object_field_overrides(object_id)"))
        db.session.execute(text("CREATE INDEX IF NOT EXISTS idx_object_field_overrides_field ON object_field_overrides(field_id)"))
        db.session.commit()
        logger.info("Field governance migration completed successfully")
    except Exception as e:
        db.session.rollback()
        logger.error(f"Error running field governance migration: {str(e)}")
        raise
