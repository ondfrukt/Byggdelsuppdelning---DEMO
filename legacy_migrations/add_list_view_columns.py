"""
Migration script to add list view configuration columns to view_configurations table
"""
from sqlalchemy import inspect, text
from sqlalchemy.exc import NoSuchTableError
import logging

logger = logging.getLogger(__name__)

def run_migration(db):
    """Run the migration to add list view columns"""
    try:
        logger.info("Adding list view columns to view_configurations table...")

        engine = db.session.get_bind()
        dialect = engine.dialect.name
        inspector = inspect(engine)
        json_type = "JSONB" if dialect == "postgresql" else "JSON"
        timestamp_type = "TIMESTAMP" if dialect == "postgresql" else "DATETIME"
        id_column = "SERIAL PRIMARY KEY" if dialect == "postgresql" else "INTEGER PRIMARY KEY AUTOINCREMENT"

        try:
            existing_columns = {c["name"] for c in inspector.get_columns("view_configurations")}
        except NoSuchTableError:
            logger.info("view_configurations table missing, creating it with list view columns...")
            db.session.execute(text(f"""
                CREATE TABLE IF NOT EXISTS view_configurations (
                    id {id_column},
                    object_type_id INTEGER NOT NULL,
                    tree_view_name_field VARCHAR(100),
                    visible_columns {json_type},
                    column_order {json_type},
                    column_widths {json_type},
                    created_at {timestamp_type} DEFAULT CURRENT_TIMESTAMP,
                    updated_at {timestamp_type} DEFAULT CURRENT_TIMESTAMP,
                    CONSTRAINT fk_view_config_object_type
                        FOREIGN KEY (object_type_id)
                        REFERENCES object_types(id)
                        ON DELETE CASCADE,
                    CONSTRAINT uq_view_config_object_type
                        UNIQUE (object_type_id)
                )
            """))
            db.session.commit()
            logger.info("Created view_configurations table with list view columns")
            return True

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
