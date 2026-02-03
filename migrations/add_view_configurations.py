"""
Migration script to create view_configurations table
"""
from sqlalchemy import text
import logging

logger = logging.getLogger(__name__)

def run_migration(db):
    """Run the migration"""
    try:
        # Create view_configurations table
        logger.info("Creating view_configurations table...")
        db.session.execute(text("""
            CREATE TABLE IF NOT EXISTS view_configurations (
                id SERIAL PRIMARY KEY,
                object_type_id INTEGER NOT NULL,
                tree_view_name_field VARCHAR(100),
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                CONSTRAINT fk_view_config_object_type 
                    FOREIGN KEY (object_type_id) 
                    REFERENCES object_types(id) 
                    ON DELETE CASCADE,
                CONSTRAINT uq_view_config_object_type 
                    UNIQUE (object_type_id)
            )
        """))
        
        db.session.commit()
        logger.info("Migration completed successfully")
        return True
    except Exception as e:
        db.session.rollback()
        logger.error(f"Migration failed: {str(e)}")
        return False
