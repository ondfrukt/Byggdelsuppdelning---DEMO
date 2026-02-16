"""
Migration: Add metadata fields to objects table
Adds Status, Version, MainID, and ID fields
"""
from sqlalchemy import inspect, text
import logging

logger = logging.getLogger(__name__)

def run_migration(db):
    """Add metadata fields to objects table"""
    try:
        engine = db.session.get_bind()
        inspector = inspect(engine)
        existing_columns = {c["name"] for c in inspector.get_columns("objects")}

        if 'status' not in existing_columns:
            db.session.execute(text("ALTER TABLE objects ADD COLUMN status VARCHAR(50) DEFAULT 'In work'"))
            logger.info("Added 'status' column to objects table")

        if 'version' not in existing_columns:
            db.session.execute(text("ALTER TABLE objects ADD COLUMN version VARCHAR(20) DEFAULT '001'"))
            logger.info("Added 'version' column to objects table")

        if 'main_id' not in existing_columns:
            db.session.execute(text("ALTER TABLE objects ADD COLUMN main_id VARCHAR(50)"))
            logger.info("Added 'main_id' column to objects table")

        if 'id_full' not in existing_columns:
            db.session.execute(text("ALTER TABLE objects ADD COLUMN id_full VARCHAR(100)"))
            logger.info("Added 'id_full' column to objects table")
        
        db.session.commit()
        logger.info("Metadata fields migration completed successfully")
        
    except Exception as e:
        db.session.rollback()
        logger.error(f"Error running metadata fields migration: {str(e)}")
        raise
