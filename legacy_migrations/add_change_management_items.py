"""
Migration: Add change_management_items table
"""
from sqlalchemy import inspect, text
import logging

logger = logging.getLogger(__name__)


def run_migration(db):
    """Create change management tables if missing."""
    try:
        engine = db.session.get_bind()
        inspector = inspect(engine)
        tables = set(inspector.get_table_names())

        if 'change_management_items' not in tables:
            db.session.execute(text("""
                CREATE TABLE change_management_items (
                    id INTEGER PRIMARY KEY,
                    item_type VARCHAR(16) NOT NULL,
                    title VARCHAR(255) NOT NULL,
                    description TEXT,
                    status VARCHAR(50) NOT NULL DEFAULT 'Open',
                    created_at DATETIME,
                    updated_at DATETIME
                )
            """))
            logger.info("Created change_management_items table")

        if 'change_management_impacts' not in tables:
            db.session.execute(text("""
                CREATE TABLE change_management_impacts (
                    id INTEGER PRIMARY KEY,
                    change_item_id INTEGER NOT NULL,
                    object_id INTEGER NOT NULL,
                    impact_action VARCHAR(40) NOT NULL DEFAULT 'to_be_replaced',
                    created_at DATETIME,
                    updated_at DATETIME,
                    FOREIGN KEY(change_item_id) REFERENCES change_management_items(id) ON DELETE CASCADE,
                    FOREIGN KEY(object_id) REFERENCES objects(id) ON DELETE CASCADE,
                    CONSTRAINT uq_change_item_object UNIQUE (change_item_id, object_id)
                )
            """))
            logger.info("Created change_management_impacts table")

        db.session.commit()
        logger.info("Change management migration completed successfully")
    except Exception as e:
        db.session.rollback()
        logger.error(f"Error running change management migration: {str(e)}")
        raise
