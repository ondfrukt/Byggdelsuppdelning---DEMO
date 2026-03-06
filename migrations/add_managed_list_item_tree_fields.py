"""
Migration: Add parent_item_id and node_metadata to managed_list_items.
"""
from sqlalchemy import inspect, text
import logging

logger = logging.getLogger(__name__)


def run_migration(db):
    """Add tree-related fields for managed list items (idempotent)."""
    try:
        engine = db.session.get_bind()
        inspector = inspect(engine)
        tables = set(inspector.get_table_names())

        if 'managed_list_items' not in tables:
            logger.info("managed_list_items table missing; skipping tree field migration")
            return

        columns = {column['name'] for column in inspector.get_columns('managed_list_items')}

        if 'parent_item_id' not in columns:
            db.session.execute(text("ALTER TABLE managed_list_items ADD COLUMN parent_item_id INTEGER"))
            logger.info("Added parent_item_id to managed_list_items")

        if 'node_metadata' not in columns:
            db.session.execute(text("ALTER TABLE managed_list_items ADD COLUMN node_metadata JSON"))
            logger.info("Added node_metadata to managed_list_items")

        try:
            db.session.execute(text("CREATE INDEX idx_managed_list_items_parent_item_id ON managed_list_items(parent_item_id)"))
        except Exception:
            pass

        db.session.commit()
        logger.info("Managed list item tree field migration completed")
    except Exception as e:
        db.session.rollback()
        logger.error(f"Error in managed list item tree field migration: {str(e)}")
        raise
