"""Fix datamodel integrity: relation_type FK, cardinality columns, parent_item FK

Revision ID: fix_datamodel_integrity
Revises: fix_select_fields_missing_lists
Create Date: 2026-03-27

Changes:
1. Infogar saknade relationstyp-nycklar i relation_types (Problem 1 pre-req)
2. Lägger till max_targets_per_source / max_sources_per_target på relation_types (Problem 2)
3. Migrerar kardinalitetsdata från object_relations till relation_types (Problem 2)
4. Tar bort max_targets_per_source / max_sources_per_target från object_relations (Problem 2)
5. Lägger till FK: object_relations.relation_type -> relation_types.key (Problem 1)
6. Lägger till FK: managed_list_items.parent_item_id -> managed_list_items.id (Problem 3)
7. Normaliserar id_full för alla existerande objekt
"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy import text

revision = 'fix_datamodel_integrity'
down_revision = 'fix_select_fields_missing_lists'
branch_labels = None
depends_on = None

# Relationstyper som finns i object_relations men saknas i relation_types.
# Dessa är strukturella typer som används av Instance-systemet men felaktigt
# även lagrats i object_relations.
MISSING_RELATION_TYPES = [
    {
        'key': 'assembly_to_product',
        'display_name': 'Sammansättning innehåller produkt',
        'category': 'strukturell',
        'cardinality': 'many_to_many',
        'is_directed': True,
        'is_composition': True,
    },
    {
        'key': 'connection_to_product',
        'display_name': 'Anslutning till produkt',
        'category': 'strukturell',
        'cardinality': 'many_to_many',
        'is_directed': True,
        'is_composition': False,
    },
    {
        'key': 'sys_to_subsys',
        'display_name': 'System till delsystem',
        'category': 'strukturell',
        'cardinality': 'one_to_many',
        'is_directed': True,
        'is_composition': True,
    },
]


def upgrade():
    conn = op.get_bind()
    dialect = conn.dialect.name  # 'postgresql' or 'sqlite'

    # ------------------------------------------------------------------ #
    # 1. Infoga saknade relationstyper så FK-constraint kan läggas till    #
    # ------------------------------------------------------------------ #
    existing_keys = {
        row[0]
        for row in conn.execute(text('SELECT key FROM relation_types')).fetchall()
    }
    for rt in MISSING_RELATION_TYPES:
        if rt['key'] not in existing_keys:
            conn.execute(
                text(
                    "INSERT INTO relation_types (key, display_name, category, cardinality, is_directed, is_composition) "
                    "VALUES (:key, :display_name, :category, :cardinality, :is_directed, :is_composition)"
                ),
                rt,
            )

    # ------------------------------------------------------------------ #
    # 2. Lägg till kardinalitetskolumner på relation_types                #
    # ------------------------------------------------------------------ #
    op.add_column('relation_types', sa.Column('max_targets_per_source', sa.Integer(), nullable=True))
    op.add_column('relation_types', sa.Column('max_sources_per_target', sa.Integer(), nullable=True))

    # ------------------------------------------------------------------ #
    # 3. Migrera kardinalitetsdata från object_relations → relation_types  #
    #    Ta det maximala värdet per relationstyp.                          #
    # ------------------------------------------------------------------ #
    rows = conn.execute(
        text(
            "SELECT relation_type, MAX(max_targets_per_source), MAX(max_sources_per_target) "
            "FROM object_relations "
            "WHERE max_targets_per_source IS NOT NULL OR max_sources_per_target IS NOT NULL "
            "GROUP BY relation_type"
        )
    ).fetchall()

    for rel_type, max_t, max_s in rows:
        if max_t is not None:
            conn.execute(
                text("UPDATE relation_types SET max_targets_per_source = :v WHERE key = :k"),
                {'v': max_t, 'k': rel_type},
            )
        if max_s is not None:
            conn.execute(
                text("UPDATE relation_types SET max_sources_per_target = :v WHERE key = :k"),
                {'v': max_s, 'k': rel_type},
            )

    # ------------------------------------------------------------------ #
    # 4. Ta bort kardinalitetskolumner från object_relations               #
    # ------------------------------------------------------------------ #
    with op.batch_alter_table('object_relations', schema=None) as batch_op:
        batch_op.drop_column('max_targets_per_source')
        batch_op.drop_column('max_sources_per_target')

    # ------------------------------------------------------------------ #
    # 5. FK: object_relations.relation_type -> relation_types.key         #
    #    Rensa upp eventuella orphan-rader innan constraint läggs till.    #
    # ------------------------------------------------------------------ #
    orphans = conn.execute(
        text(
            "SELECT DISTINCT relation_type FROM object_relations "
            "WHERE relation_type NOT IN (SELECT key FROM relation_types)"
        )
    ).fetchall()
    if orphans:
        conn.execute(
            text(
                "DELETE FROM object_relations "
                "WHERE relation_type NOT IN (SELECT key FROM relation_types)"
            )
        )

    with op.batch_alter_table('object_relations', schema=None) as batch_op:
        batch_op.create_foreign_key(
            'fk_object_relations_relation_type',
            'relation_types',
            ['relation_type'],
            ['key'],
            ondelete='RESTRICT',
        )

    # ------------------------------------------------------------------ #
    # 6. FK: managed_list_items.parent_item_id -> managed_list_items.id   #
    #    Nulla ut parent_item_ids som pekar på poster som inte existerar.  #
    # ------------------------------------------------------------------ #
    conn.execute(
        text(
            "UPDATE managed_list_items SET parent_item_id = NULL "
            "WHERE parent_item_id IS NOT NULL "
            "AND parent_item_id NOT IN (SELECT id FROM managed_list_items)"
        )
    )

    with op.batch_alter_table('managed_list_items', schema=None) as batch_op:
        batch_op.create_foreign_key(
            'fk_managed_list_items_parent',
            'managed_list_items',
            ['parent_item_id'],
            ['id'],
            ondelete='SET NULL',
        )

    # ------------------------------------------------------------------ #
    # 7. Normalisera id_full för alla befintliga objekt                   #
    #    Format: {PREFIX}-{N}.{version}  ex. BYG-3.v1                     #
    # ------------------------------------------------------------------ #
    objects = conn.execute(
        text("SELECT id, main_id, version FROM objects")
    ).fetchall()

    import re
    base_pattern = re.compile(r'^([A-Za-z0-9_]+)-(\d+)(?:\..*)?$')

    for obj_id, main_id, version in objects:
        # Normalize base_id
        source = str(main_id or '').strip().split('.')[0]
        m = base_pattern.match(source)
        if m:
            base_id = f"{m.group(1).upper()}-{int(m.group(2))}"
        else:
            base_id = source

        # Normalize version
        raw_v = str(version or '').strip().lower()
        if not raw_v:
            raw_v = 'v1'
        if raw_v.startswith('v'):
            raw_v = raw_v[1:]
        raw_v = raw_v.lstrip('0') or '0'
        norm_version = f"v{raw_v}"

        norm_full_id = f"{base_id}.{norm_version}" if base_id else norm_version

        conn.execute(
            text("UPDATE objects SET id_full = :full_id, version = :ver WHERE id = :id"),
            {'full_id': norm_full_id, 'ver': norm_version, 'id': obj_id},
        )


def downgrade():
    # Återställ kardinalitetskolumner på object_relations
    with op.batch_alter_table('object_relations', schema=None) as batch_op:
        batch_op.drop_constraint('fk_object_relations_relation_type', type_='foreignkey')
        batch_op.add_column(sa.Column('max_targets_per_source', sa.Integer(), nullable=True))
        batch_op.add_column(sa.Column('max_sources_per_target', sa.Integer(), nullable=True))

    # Återställ managed_list_items FK
    with op.batch_alter_table('managed_list_items', schema=None) as batch_op:
        batch_op.drop_constraint('fk_managed_list_items_parent', type_='foreignkey')

    # Ta bort kardinalitetskolumner från relation_types
    with op.batch_alter_table('relation_types', schema=None) as batch_op:
        batch_op.drop_column('max_targets_per_source')
        batch_op.drop_column('max_sources_per_target')
