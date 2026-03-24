"""
Migration: Remove legacy auto_id column from objects.

New identifier model:
- main_id: BaseID shared across versions
- version: version token (v1, v2, ...)
- id_full: unique object identifier in UI/API
"""

import logging
from sqlalchemy import text

logger = logging.getLogger(__name__)


def _sqlite_columns(db):
    rows = db.session.execute(text("PRAGMA table_info('objects')")).fetchall()
    return [row[1] for row in rows]


def _has_auto_id_column(db):
    return 'auto_id' in _sqlite_columns(db)


def run_migration(db):
    bind = db.session.get_bind()
    dialect = bind.dialect.name

    try:
        if dialect == 'sqlite':
            if not _has_auto_id_column(db):
                logger.info("auto_id column already removed from objects (sqlite)")
                return 0

            db.session.execute(text("PRAGMA foreign_keys=OFF"))
            db.session.execute(text("""
                CREATE TABLE objects_new (
                    id INTEGER NOT NULL PRIMARY KEY,
                    object_type_id INTEGER NOT NULL,
                    created_at DATETIME,
                    updated_at DATETIME,
                    created_by VARCHAR(100),
                    status VARCHAR(50),
                    version VARCHAR(20),
                    main_id VARCHAR(50),
                    id_full VARCHAR(100),
                    FOREIGN KEY(object_type_id) REFERENCES object_types (id) ON DELETE RESTRICT
                )
            """))
            db.session.execute(text("""
                INSERT INTO objects_new (id, object_type_id, created_at, updated_at, created_by, status, version, main_id, id_full)
                SELECT id, object_type_id, created_at, updated_at, created_by, status, version, main_id, id_full
                FROM objects
            """))
            db.session.execute(text("DROP TABLE objects"))
            db.session.execute(text("ALTER TABLE objects_new RENAME TO objects"))
            db.session.execute(text("CREATE UNIQUE INDEX IF NOT EXISTS uq_objects_id_full ON objects(id_full)"))
            db.session.execute(text("PRAGMA foreign_keys=ON"))
            db.session.commit()
            logger.info("Removed auto_id column from objects (sqlite)")
            return 1

        db.session.execute(text("ALTER TABLE objects DROP COLUMN IF EXISTS auto_id"))
        db.session.execute(text("CREATE UNIQUE INDEX IF NOT EXISTS uq_objects_id_full ON objects(id_full)"))
        db.session.commit()
        logger.info("Removed auto_id column from objects")
        return 1
    except Exception:
        db.session.rollback()
        logger.exception("Failed removing auto_id column from objects")
        raise
