"""Migration: add is_detail_visible column to object_fields."""
from sqlalchemy import inspect, text
import logging

logger = logging.getLogger(__name__)


def run_migration(db):
    """Add is_detail_visible column to object_fields when missing."""
    try:
        engine = db.session.get_bind()
        dialect = engine.dialect.name
        inspector = inspect(engine)
        existing_tables = inspector.get_table_names()
        if 'object_fields' not in existing_tables:
            logger.info("Skipping detail visibility migration: object_fields table does not exist")
            return

        existing_columns = {c["name"] for c in inspector.get_columns("object_fields")}

        if "is_detail_visible" not in existing_columns:
            default_value = "TRUE" if dialect == "postgresql" else "1"
            db.session.execute(
                text(
                    f"ALTER TABLE object_fields "
                    f"ADD COLUMN is_detail_visible BOOLEAN NOT NULL DEFAULT {default_value}"
                )
            )
            logger.info("Added 'is_detail_visible' column to object_fields")

        db.session.commit()
        logger.info("Detail visibility migration completed successfully")
    except Exception as e:
        db.session.rollback()
        logger.error(f"Error running detail visibility migration: {str(e)}")
        raise
