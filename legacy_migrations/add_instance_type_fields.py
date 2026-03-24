"""Migration: add instance_type_fields table for configurable metadata per instance type."""
import logging
from sqlalchemy import inspect, text

logger = logging.getLogger(__name__)


def run_migration(db):
    try:
        inspector = inspect(db.engine)
        existing_tables = inspector.get_table_names()

        if 'instance_type_fields' not in existing_tables:
            db.session.execute(text("""
                CREATE TABLE instance_type_fields (
                    id INTEGER PRIMARY KEY,
                    instance_type_key VARCHAR(120) NOT NULL,
                    field_template_id INTEGER NOT NULL,
                    display_order INTEGER NOT NULL DEFAULT 0,
                    is_required BOOLEAN NOT NULL DEFAULT FALSE,
                    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                    CONSTRAINT fk_instance_type_fields_template
                        FOREIGN KEY(field_template_id)
                        REFERENCES field_templates(id)
                        ON DELETE CASCADE,
                    CONSTRAINT uq_instance_type_field_key_template
                        UNIQUE (instance_type_key, field_template_id)
                )
            """))
            logger.info("Created instance_type_fields table")

        db.session.execute(text("CREATE INDEX IF NOT EXISTS idx_instance_type_fields_key ON instance_type_fields(instance_type_key)"))
        db.session.execute(text("CREATE INDEX IF NOT EXISTS idx_instance_type_fields_template ON instance_type_fields(field_template_id)"))
        db.session.execute(text("CREATE INDEX IF NOT EXISTS idx_instance_type_fields_order ON instance_type_fields(instance_type_key, display_order)"))

        db.session.commit()
        logger.info("Instance type fields migration completed successfully")
    except Exception as error:
        db.session.rollback()
        logger.error(f"Error running instance_type_fields migration: {error}")
        raise
