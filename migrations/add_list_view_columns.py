"""
Migration script to add list view configuration columns to view_configurations table
"""
from sqlalchemy import text
import logging

logger = logging.getLogger(__name__)

def run_migration(db):
    """Run the migration to add list view columns"""
    try:
        logger.info("Adding list view columns to view_configurations table...")
        
        # Check if columns already exist
        result = db.session.execute(text("""
            SELECT column_name 
            FROM information_schema.columns 
            WHERE table_name = 'view_configurations' 
            AND column_name IN ('visible_columns', 'column_order', 'column_widths')
        """))
        existing_columns = [row[0] for row in result]
        
        # Add visible_columns if it doesn't exist
        if 'visible_columns' not in existing_columns:
            logger.info("Adding visible_columns column...")
            db.session.execute(text("""
                ALTER TABLE view_configurations 
                ADD COLUMN visible_columns JSONB
            """))
        
        # Add column_order if it doesn't exist
        if 'column_order' not in existing_columns:
            logger.info("Adding column_order column...")
            db.session.execute(text("""
                ALTER TABLE view_configurations 
                ADD COLUMN column_order JSONB
            """))
        
        # Add column_widths if it doesn't exist
        if 'column_widths' not in existing_columns:
            logger.info("Adding column_widths column...")
            db.session.execute(text("""
                ALTER TABLE view_configurations 
                ADD COLUMN column_widths JSONB
            """))
        
        db.session.commit()
        logger.info("List view columns migration completed successfully")
        return True
    except Exception as e:
        db.session.rollback()
        logger.error(f"List view columns migration failed: {str(e)}")
        return False
