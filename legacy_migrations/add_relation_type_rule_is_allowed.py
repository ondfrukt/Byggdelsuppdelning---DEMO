"""Migration: add is_allowed column to relation_type_rules."""
from sqlalchemy import inspect, text
import logging

logger = logging.getLogger(__name__)


def run_migration(db):
    try:
        engine = db.session.get_bind()
        inspector = inspect(engine)
        tables = set(inspector.get_table_names())
        if 'relation_type_rules' not in tables:
            return

        columns = {column['name'] for column in inspector.get_columns('relation_type_rules')}
        if 'is_allowed' not in columns:
            db.session.execute(text("ALTER TABLE relation_type_rules ADD COLUMN is_allowed BOOLEAN NOT NULL DEFAULT TRUE"))
            logger.info("Added is_allowed to relation_type_rules")

        db.session.commit()
    except Exception as e:
        db.session.rollback()
        logger.error(f"Error adding is_allowed to relation_type_rules: {str(e)}")
        raise
