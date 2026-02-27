"""Migration: add relation_types table for typed relation definitions."""
from sqlalchemy import inspect, text
import logging

logger = logging.getLogger(__name__)


CARDINALITY_VALUES = ("one_to_one", "one_to_many", "many_to_one", "many_to_many")


def run_migration(db):
    """Create relation_types table if missing."""
    try:
        engine = db.session.get_bind()
        inspector = inspect(engine)
        existing_tables = set(inspector.get_table_names())

        dialect = engine.dialect.name
        id_column = "SERIAL PRIMARY KEY" if dialect == "postgresql" else "INTEGER PRIMARY KEY"

        if 'relation_types' not in existing_tables:
            db.session.execute(text(f"""
                CREATE TABLE relation_types (
                    id {id_column},
                    key VARCHAR(100) NOT NULL UNIQUE,
                    display_name VARCHAR(150) NOT NULL,
                    description TEXT,
                    source_object_type_id INTEGER NULL REFERENCES object_types(id) ON DELETE SET NULL,
                    target_object_type_id INTEGER NULL REFERENCES object_types(id) ON DELETE SET NULL,
                    cardinality VARCHAR(20) NOT NULL DEFAULT 'many_to_many'
                        CHECK (cardinality IN {CARDINALITY_VALUES}),
                    is_directed BOOLEAN NOT NULL DEFAULT TRUE,
                    is_composition BOOLEAN NOT NULL DEFAULT FALSE,
                    inverse_relation_type_id INTEGER NULL REFERENCES relation_types(id) ON DELETE SET NULL
                )
            """))
            logger.info("Created relation_types table")

        db.session.execute(text("CREATE INDEX IF NOT EXISTS idx_relation_types_source_target ON relation_types(source_object_type_id, target_object_type_id)"))
        db.session.execute(text("CREATE INDEX IF NOT EXISTS idx_relation_types_inverse ON relation_types(inverse_relation_type_id)"))
        db.session.execute(text("CREATE INDEX IF NOT EXISTS idx_relation_types_key ON relation_types(key)"))

        db.session.commit()
        logger.info("Relation types migration completed successfully")
    except Exception as e:
        db.session.rollback()
        logger.error(f"Error running relation_types migration: {str(e)}")
        raise
