"""
Migration script to add id_prefix column to object_types table
and display_name, help_text columns to object_fields table
"""
from sqlalchemy import text
import logging

logger = logging.getLogger(__name__)

def run_migration(db):
    """Run the migration"""
    try:
        # Add id_prefix column to object_types
        logger.info("Adding id_prefix column to object_types table...")
        db.session.execute(text("""
            ALTER TABLE object_types 
            ADD COLUMN IF NOT EXISTS id_prefix VARCHAR(10)
        """))
        
        # Add display_name column to object_fields
        logger.info("Adding display_name column to object_fields table...")
        db.session.execute(text("""
            ALTER TABLE object_fields 
            ADD COLUMN IF NOT EXISTS display_name VARCHAR(200)
        """))
        
        # Add help_text column to object_fields
        logger.info("Adding help_text column to object_fields table...")
        db.session.execute(text("""
            ALTER TABLE object_fields 
            ADD COLUMN IF NOT EXISTS help_text VARCHAR(500)
        """))
        
        db.session.commit()
        logger.info("Migration completed successfully")
        return True
    except Exception as e:
        db.session.rollback()
        logger.error(f"Migration failed: {str(e)}")
        return False
