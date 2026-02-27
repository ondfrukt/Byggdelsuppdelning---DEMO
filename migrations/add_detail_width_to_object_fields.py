"""Migration: add detail_width column to object_fields."""
import logging
from sqlalchemy import inspect, text

logger = logging.getLogger(__name__)


def run_migration(db):
    try:
        inspector = inspect(db.engine)
        tables = inspector.get_table_names()
        if 'object_fields' not in tables:
            return

        columns = {column['name'] for column in inspector.get_columns('object_fields')}
        if 'detail_width' not in columns:
            db.session.execute(text("ALTER TABLE object_fields ADD COLUMN detail_width VARCHAR(10)"))
            db.session.commit()
            logger.info("Added detail_width to object_fields")
    except Exception as e:
        db.session.rollback()
        logger.error(f"Error adding detail_width column: {str(e)}")
        raise
