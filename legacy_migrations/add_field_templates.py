"""Migration: add field_templates table for reusable field definitions."""
import logging
from sqlalchemy import inspect, text

logger = logging.getLogger(__name__)


def run_migration(db):
    """Create field_templates table if missing."""
    try:
        inspector = inspect(db.engine)
        existing_tables = inspector.get_table_names()

        if 'field_templates' not in existing_tables:
            db.session.execute(text("""
                CREATE TABLE field_templates (
                    id INTEGER PRIMARY KEY,
                    template_name VARCHAR(150) NOT NULL UNIQUE,
                    field_name VARCHAR(100) NOT NULL,
                    display_name VARCHAR(200),
                    display_name_translations JSON,
                    field_type VARCHAR(50) NOT NULL,
                    field_options JSON,
                    is_required BOOLEAN DEFAULT FALSE,
                    lock_required_setting BOOLEAN NOT NULL DEFAULT FALSE,
                    force_presence_on_all_objects BOOLEAN NOT NULL DEFAULT FALSE,
                    is_table_visible BOOLEAN NOT NULL DEFAULT TRUE,
                    help_text VARCHAR(500),
                    help_text_translations JSON,
                    is_active BOOLEAN NOT NULL DEFAULT TRUE,
                    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
                )
            """))
            logger.info("Created field_templates table")
        else:
            columns = {column['name'] for column in inspector.get_columns('field_templates')}
            if 'display_name_translations' not in columns:
                db.session.execute(text("ALTER TABLE field_templates ADD COLUMN display_name_translations JSON"))
            if 'help_text_translations' not in columns:
                db.session.execute(text("ALTER TABLE field_templates ADD COLUMN help_text_translations JSON"))
            if 'lock_required_setting' not in columns:
                db.session.execute(text("ALTER TABLE field_templates ADD COLUMN lock_required_setting BOOLEAN NOT NULL DEFAULT FALSE"))
            if 'force_presence_on_all_objects' not in columns:
                db.session.execute(text("ALTER TABLE field_templates ADD COLUMN force_presence_on_all_objects BOOLEAN NOT NULL DEFAULT FALSE"))

        db.session.execute(text("CREATE INDEX IF NOT EXISTS idx_field_templates_active ON field_templates(is_active)"))
        db.session.execute(text("CREATE INDEX IF NOT EXISTS idx_field_templates_field_name ON field_templates(field_name)"))
        db.session.commit()
        logger.info("Field templates migration completed successfully")
    except Exception as e:
        db.session.rollback()
        logger.error(f"Error running field_templates migration: {str(e)}")
        raise
