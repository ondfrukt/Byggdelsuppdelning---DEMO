"""Migration: add relation_type_rules table for fixed source/target mappings."""
from sqlalchemy import inspect, text
import logging

logger = logging.getLogger(__name__)


def run_migration(db):
    """Create relation_type_rules table if missing."""
    try:
        engine = db.session.get_bind()
        inspector = inspect(engine)
        existing_tables = set(inspector.get_table_names())
        dialect = engine.dialect.name
        id_column = "SERIAL PRIMARY KEY" if dialect == "postgresql" else "INTEGER PRIMARY KEY"

        if 'relation_type_rules' not in existing_tables:
            db.session.execute(text(f"""
                CREATE TABLE relation_type_rules (
                    id {id_column},
                    source_object_type_id INTEGER NOT NULL REFERENCES object_types(id) ON DELETE CASCADE,
                    target_object_type_id INTEGER NOT NULL REFERENCES object_types(id) ON DELETE CASCADE,
                    relation_type VARCHAR(100) NOT NULL,
                    is_allowed BOOLEAN NOT NULL DEFAULT TRUE,
                    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                    CONSTRAINT uq_relation_type_rules_source_target
                        UNIQUE (source_object_type_id, target_object_type_id)
                )
            """))
            logger.info("Created relation_type_rules table")

        db.session.execute(text(
            "CREATE INDEX IF NOT EXISTS idx_relation_type_rules_source_target "
            "ON relation_type_rules(source_object_type_id, target_object_type_id)"
        ))

        db.session.commit()
        logger.info("Relation type rules migration completed successfully")
    except Exception as e:
        db.session.rollback()
        logger.error(f"Error running relation_type_rules migration: {str(e)}")
        raise
