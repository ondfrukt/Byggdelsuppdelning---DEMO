"""
Migration: add is_tree_visible to object_fields
"""
from sqlalchemy import inspect, text
import logging

logger = logging.getLogger(__name__)


def run_migration(db):
    """Add is_tree_visible column to object_fields when missing."""
    try:
        engine = db.session.get_bind()
        dialect = engine.dialect.name
        inspector = inspect(engine)
        existing_columns = {c["name"] for c in inspector.get_columns("object_fields")}

        if "is_tree_visible" not in existing_columns:
            default_value = "FALSE" if dialect == "postgresql" else "0"
            db.session.execute(
                text(
                    f"ALTER TABLE object_fields "
                    f"ADD COLUMN is_tree_visible BOOLEAN NOT NULL DEFAULT {default_value}"
                )
            )
            logger.info("Added 'is_tree_visible' column to object_fields")

        db.session.commit()
        logger.info("Tree visibility migration completed successfully")
    except Exception as e:
        db.session.rollback()
        logger.error(f"Error running tree visibility migration: {str(e)}")
        raise
