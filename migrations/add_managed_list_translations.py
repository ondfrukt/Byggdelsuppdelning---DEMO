"""
Migration: Add translation support to managed lists
"""
from sqlalchemy import inspect, text
import logging

logger = logging.getLogger(__name__)


def run_migration(db):
    """Add translation-related columns for managed lists/items if missing."""
    try:
        engine = db.session.get_bind()
        inspector = inspect(engine)

        list_columns = {column['name'] for column in inspector.get_columns('managed_lists')}
        item_columns = {column['name'] for column in inspector.get_columns('managed_list_items')}

        if 'additional_language_code' not in list_columns:
            db.session.execute(text("ALTER TABLE managed_lists ADD COLUMN additional_language_code VARCHAR(10) NOT NULL DEFAULT 'fi'"))
            logger.info("Added additional_language_code to managed_lists")

        if 'language_codes' not in list_columns:
            db.session.execute(text("ALTER TABLE managed_lists ADD COLUMN language_codes JSON"))
            logger.info("Added language_codes to managed_lists")

        if 'value_translations' not in item_columns:
            db.session.execute(text("ALTER TABLE managed_list_items ADD COLUMN value_translations JSON"))
            logger.info("Added value_translations to managed_list_items")

        db.session.commit()
        logger.info("Managed list translation migration completed successfully")
    except Exception as e:
        db.session.rollback()
        logger.error(f"Error running managed list translation migration: {str(e)}")
        raise
