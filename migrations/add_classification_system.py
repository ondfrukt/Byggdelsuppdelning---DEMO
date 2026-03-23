"""Migration: add classification_systems, category_nodes, object_category_assignments tables."""
from sqlalchemy import inspect, text
import logging

logger = logging.getLogger(__name__)


def run_migration(db):
    try:
        engine = db.session.get_bind()
        inspector = inspect(engine)
        tables = set(inspector.get_table_names())
        dialect = engine.dialect.name
        id_column = "SERIAL PRIMARY KEY" if dialect == "postgresql" else "INTEGER PRIMARY KEY"

        # --- classification_systems ---
        if 'classification_systems' not in tables:
            db.session.execute(text(f"""
                CREATE TABLE classification_systems (
                    id          {id_column},
                    name        VARCHAR(150) NOT NULL,
                    description TEXT,
                    version     VARCHAR(50),
                    is_active   BOOLEAN NOT NULL DEFAULT TRUE,
                    created_at  TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                    updated_at  TIMESTAMP DEFAULT CURRENT_TIMESTAMP
                )
            """))
            logger.info("Created classification_systems table")

        # --- category_nodes ---
        if 'category_nodes' not in tables:
            db.session.execute(text(f"""
                CREATE TABLE category_nodes (
                    id             {id_column},
                    system_id      INTEGER NOT NULL REFERENCES classification_systems(id) ON DELETE CASCADE,
                    parent_id      INTEGER REFERENCES category_nodes(id) ON DELETE CASCADE,
                    code           VARCHAR(50) NOT NULL,
                    name           VARCHAR(200) NOT NULL,
                    level          INTEGER NOT NULL,
                    revit_category VARCHAR(100),
                    ifc_type       VARCHAR(100),
                    description    TEXT,
                    sort_order     INTEGER NOT NULL DEFAULT 0,
                    is_active      BOOLEAN NOT NULL DEFAULT TRUE,
                    created_at     TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                    updated_at     TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                    UNIQUE (system_id, code)
                )
            """))
            db.session.execute(text(
                "CREATE INDEX IF NOT EXISTS idx_category_nodes_system ON category_nodes(system_id)"
            ))
            db.session.execute(text(
                "CREATE INDEX IF NOT EXISTS idx_category_nodes_parent ON category_nodes(parent_id)"
            ))
            db.session.execute(text(
                "CREATE INDEX IF NOT EXISTS idx_category_nodes_level ON category_nodes(level)"
            ))
            logger.info("Created category_nodes table")

        # --- object_category_assignments ---
        if 'object_category_assignments' not in tables:
            db.session.execute(text(f"""
                CREATE TABLE object_category_assignments (
                    id               {id_column},
                    object_id        INTEGER NOT NULL REFERENCES objects(id) ON DELETE CASCADE,
                    category_node_id INTEGER NOT NULL REFERENCES category_nodes(id) ON DELETE CASCADE,
                    is_primary       BOOLEAN NOT NULL DEFAULT TRUE,
                    created_at       TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                    UNIQUE (object_id, category_node_id)
                )
            """))
            db.session.execute(text(
                "CREATE INDEX IF NOT EXISTS idx_obj_cat_assign_object ON object_category_assignments(object_id)"
            ))
            db.session.execute(text(
                "CREATE INDEX IF NOT EXISTS idx_obj_cat_assign_node ON object_category_assignments(category_node_id)"
            ))
            logger.info("Created object_category_assignments table")

        # --- ObjectType entries for RelationTypeRule compatibility ---
        _ensure_object_type(db, 'classification_system',
                            'Classification System',
                            'System-managed type for classification systems')
        _ensure_object_type(db, 'category_node',
                            'Category Node',
                            'System-managed type for category tree nodes')

        # --- Seed initial "Internt" classification system ---
        _seed_initial_system(db)

        db.session.commit()
        logger.info("Classification system migration completed successfully")
    except Exception as e:
        db.session.rollback()
        logger.error(f"Error running classification system migration: {str(e)}")
        raise


def _ensure_object_type(db, name, display_name, description):
    result = db.session.execute(
        text("SELECT id FROM object_types WHERE name = :name"),
        {'name': name}
    ).fetchone()
    if result is None:
        db.session.execute(
            text("""
                INSERT INTO object_types (name, description, is_system, created_at)
                VALUES (:name, :description, TRUE, CURRENT_TIMESTAMP)
            """),
            {'name': name, 'description': description}
        )
        logger.info(f"Created ObjectType '{name}'")


def _seed_initial_system(db):
    existing = db.session.execute(
        text("SELECT id FROM classification_systems WHERE name = 'Internt'")
    ).fetchone()
    if existing is None:
        db.session.execute(
            text("""
                INSERT INTO classification_systems (name, description, is_active, created_at, updated_at)
                VALUES ('Internt', 'Internt klassifikationssystem', TRUE, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
            """)
        )
        logger.info("Seeded initial 'Internt' classification system")
