"""
Migration: Add color column to object_types table
"""
from sqlalchemy import inspect, text
import logging

logger = logging.getLogger(__name__)


DEFAULT_COLOR_BY_TYPE = {
    'Byggdel': '#3498db',
    'Produkt': '#2ecc71',
    'Kravställning': '#e74c3c',
    'Anslutning': '#f39c12',
    'Ritningsobjekt': '#9b59b6',
    'Filobjekt': '#9b59b6',
    'Egenskap': '#1abc9c',
    'Anvisning': '#34495e'
}


def run_migration(db):
    """Add color column for object types and backfill known defaults."""
    try:
        engine = db.session.get_bind()
        inspector = inspect(engine)
        object_type_columns = {c["name"] for c in inspector.get_columns("object_types")}

        if "color" not in object_type_columns:
            db.session.execute(text("ALTER TABLE object_types ADD COLUMN color VARCHAR(7)"))
            logger.info("Added color column to object_types table")

        for type_name, color in DEFAULT_COLOR_BY_TYPE.items():
            db.session.execute(
                text("""
                    UPDATE object_types
                    SET color = :color
                    WHERE name = :name
                      AND (color IS NULL OR color = '')
                """),
                {"name": type_name, "color": color}
            )

        db.session.commit()
        logger.info("Object type color migration completed successfully")
    except Exception as e:
        db.session.rollback()
        logger.error(f"Error running object type color migration: {str(e)}")
        raise
