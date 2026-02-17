"""
Migration: Add building_part_categories table
"""
from sqlalchemy import inspect, text
import logging

logger = logging.getLogger(__name__)


def run_migration(db):
    """Create building_part_categories table and seed defaults when empty."""
    try:
        engine = db.session.get_bind()
        inspector = inspect(engine)
        tables = set(inspector.get_table_names())

        if 'building_part_categories' not in tables:
            db.session.execute(text("""
                CREATE TABLE building_part_categories (
                    id INTEGER PRIMARY KEY,
                    name VARCHAR(120) NOT NULL UNIQUE,
                    sort_order INTEGER NOT NULL DEFAULT 0,
                    is_active BOOLEAN NOT NULL DEFAULT 1,
                    created_at DATETIME,
                    updated_at DATETIME
                )
            """))
            logger.info("Created building_part_categories table")

        count = db.session.execute(
            text("SELECT COUNT(*) FROM building_part_categories")
        ).scalar() or 0

        if count == 0:
            defaults = [
                (1, 'Yttervägg'),
                (2, 'Innervägg'),
                (3, 'Bjälklag'),
                (4, 'Tak'),
                (5, 'Grund'),
            ]
            for sort_order, name in defaults:
                db.session.execute(
                    text("""
                        INSERT INTO building_part_categories (name, sort_order, is_active, created_at, updated_at)
                        VALUES (:name, :sort_order, 1, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
                    """),
                    {'name': name, 'sort_order': sort_order}
                )
            logger.info("Seeded default building part categories")

        db.session.commit()
        logger.info("Building part categories migration completed successfully")
    except Exception as e:
        db.session.rollback()
        logger.error(f"Error running building part categories migration: {str(e)}")
        raise
