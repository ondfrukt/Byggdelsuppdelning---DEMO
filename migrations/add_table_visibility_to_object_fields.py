"""
Migration: add is_table_visible to object_fields
"""
from sqlalchemy import inspect, text
import logging

logger = logging.getLogger(__name__)


def run_migration(db):
    """Add is_table_visible column to object_fields when missing."""
    try:
        engine = db.session.get_bind()
        inspector = inspect(engine)
        existing_columns = {c["name"] for c in inspector.get_columns("object_fields")}

        if "is_table_visible" not in existing_columns:
            db.session.execute(
                text("ALTER TABLE object_fields ADD COLUMN is_table_visible BOOLEAN NOT NULL DEFAULT 1")
            )
            logger.info("Added 'is_table_visible' column to object_fields")

        db.session.commit()
        logger.info("Table visibility migration completed successfully")
    except Exception as e:
        db.session.rollback()
        logger.error(f"Error running table visibility migration: {str(e)}")
        raise

