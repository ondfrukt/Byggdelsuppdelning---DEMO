"""Add id_prefix/display_name/help_text columns when missing."""
from sqlalchemy import inspect, text
import logging

logger = logging.getLogger(__name__)

def run_migration(db):
    """Run the migration"""
    try:
        engine = db.session.get_bind()
        inspector = inspect(engine)

        object_types_columns = {c["name"] for c in inspector.get_columns("object_types")}
        object_fields_columns = {c["name"] for c in inspector.get_columns("object_fields")}

        if "id_prefix" not in object_types_columns:
            logger.info("Adding id_prefix column to object_types table...")
            db.session.execute(text("ALTER TABLE object_types ADD COLUMN id_prefix VARCHAR(10)"))

        if "display_name" not in object_fields_columns:
            logger.info("Adding display_name column to object_fields table...")
            db.session.execute(text("ALTER TABLE object_fields ADD COLUMN display_name VARCHAR(200)"))

        if "help_text" not in object_fields_columns:
            logger.info("Adding help_text column to object_fields table...")
            db.session.execute(text("ALTER TABLE object_fields ADD COLUMN help_text VARCHAR(500)"))
        
        db.session.commit()
        logger.info("Migration completed successfully")
        return True
    except Exception as e:
        db.session.rollback()
        logger.error(f"Migration failed: {str(e)}")
        return False
