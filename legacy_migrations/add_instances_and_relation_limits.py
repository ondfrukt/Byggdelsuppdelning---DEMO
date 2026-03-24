"""Migration: add instances table and limit columns for object_relations."""
from sqlalchemy import inspect, text
import logging

logger = logging.getLogger(__name__)


def _column_names(inspector, table_name):
    return {column['name'] for column in inspector.get_columns(table_name)}


def run_migration(db):
    try:
        engine = db.session.get_bind()
        inspector = inspect(engine)
        tables = set(inspector.get_table_names())
        dialect = engine.dialect.name
        id_column = "SERIAL PRIMARY KEY" if dialect == "postgresql" else "INTEGER PRIMARY KEY"

        if 'instances' not in tables:
            db.session.execute(text(f"""
                CREATE TABLE instances (
                    id {id_column},
                    parent_object_id INTEGER NOT NULL REFERENCES objects(id) ON DELETE CASCADE,
                    child_object_id INTEGER NOT NULL REFERENCES objects(id) ON DELETE CASCADE,
                    instance_type VARCHAR(100) NOT NULL,
                    quantity FLOAT NULL,
                    unit VARCHAR(50) NULL,
                    formula VARCHAR(255) NULL,
                    role VARCHAR(100) NULL,
                    position VARCHAR(100) NULL,
                    waste_factor FLOAT NULL,
                    installation_sequence INTEGER NULL,
                    optional BOOLEAN NOT NULL DEFAULT FALSE,
                    metadata_json TEXT NULL,
                    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
                )
            """))
            logger.info("Created instances table")

        if 'object_relations' in tables:
            relation_columns = _column_names(inspector, 'object_relations')
            if 'max_targets_per_source' not in relation_columns:
                db.session.execute(text("ALTER TABLE object_relations ADD COLUMN max_targets_per_source INTEGER"))
            if 'max_sources_per_target' not in relation_columns:
                db.session.execute(text("ALTER TABLE object_relations ADD COLUMN max_sources_per_target INTEGER"))

        db.session.execute(text("CREATE INDEX IF NOT EXISTS idx_instances_parent ON instances(parent_object_id)"))
        db.session.execute(text("CREATE INDEX IF NOT EXISTS idx_instances_child ON instances(child_object_id)"))
        db.session.execute(text("CREATE INDEX IF NOT EXISTS idx_instances_type ON instances(instance_type)"))

        db.session.commit()
        logger.info("Instances migration completed successfully")
    except Exception as e:
        db.session.rollback()
        logger.error(f"Error running instances migration: {str(e)}")
        raise
