"""
Migration script to add list view configuration columns to view_configurations table
"""
from sqlalchemy import inspect, text
import logging

logger = logging.getLogger(__name__)

def run_migration(db):
    """Run the migration to add list view columns"""
    try:
        logger.info("Adding list view columns to view_configurations table...")

        engine = db.session.get_bind()
        dialect = engine.dialect.name
        inspector = inspect(engine)
        existing_columns = {c["name"] for c in inspector.get_columns("view_configurations")}
        json_type = "JSONB" if dialect == "postgresql" else "JSON"

        if 'visible_columns' not in existing_columns:
            logger.info("Adding visible_columns column...")
            db.session.execute(text(f"ALTER TABLE view_configurations ADD COLUMN visible_columns {json_type}"))

        if 'column_order' not in existing_columns:
            logger.info("Adding column_order column...")
            db.session.execute(text(f"ALTER TABLE view_configurations ADD COLUMN column_order {json_type}"))

        if 'column_widths' not in existing_columns:
            logger.info("Adding column_widths column...")
            db.session.execute(text(f"ALTER TABLE view_configurations ADD COLUMN column_widths {json_type}"))

        db.session.commit()
        logger.info("List view columns migration completed successfully")
        return True
    except Exception as e:
        db.session.rollback()
        logger.error(f"List view columns migration failed: {str(e)}")
        return False
