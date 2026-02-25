"""
Migration: Add managed_lists and managed_list_items tables
"""
from sqlalchemy import inspect, text
import logging

logger = logging.getLogger(__name__)


def run_migration(db):
    """Create managed list tables if missing."""
    try:
        engine = db.session.get_bind()
        inspector = inspect(engine)
        tables = set(inspector.get_table_names())

        if 'managed_lists' not in tables:
            db.session.execute(text("""
                CREATE TABLE managed_lists (
                    id INTEGER PRIMARY KEY,
                    name VARCHAR(120) NOT NULL UNIQUE,
                    description VARCHAR(255),
                    is_active BOOLEAN NOT NULL DEFAULT 1,
                    created_at DATETIME,
                    updated_at DATETIME
                )
            """))
            logger.info("Created managed_lists table")

        if 'managed_list_items' not in tables:
            db.session.execute(text("""
                CREATE TABLE managed_list_items (
                    id INTEGER PRIMARY KEY,
                    list_id INTEGER NOT NULL,
                    value VARCHAR(255) NOT NULL,
                    sort_order INTEGER NOT NULL DEFAULT 0,
                    is_active BOOLEAN NOT NULL DEFAULT 1,
                    created_at DATETIME,
                    updated_at DATETIME,
                    FOREIGN KEY(list_id) REFERENCES managed_lists(id) ON DELETE CASCADE
                )
            """))
            logger.info("Created managed_list_items table")

        db.session.commit()
        logger.info("Managed lists migration completed successfully")
    except Exception as e:
        db.session.rollback()
        logger.error(f"Error running managed lists migration: {str(e)}")
        raise
