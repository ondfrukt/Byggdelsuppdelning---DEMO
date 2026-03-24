"""clear field data for bim produktkategori material

Revision ID: remove_missing_list_field_data
Revises: ca1e9af733ce
Create Date: 2026-03-24 20:03:21.808715

Removes ObjectData rows for fields whose managed lists don't exist in the
database (BIM-information, produktkategori, material). The objects themselves
are kept intact.
"""
from alembic import op
from sqlalchemy import text

# revision identifiers, used by Alembic.
revision = 'remove_missing_list_field_data'
down_revision = 'ca1e9af733ce'
branch_labels = None
depends_on = None

FIELD_NAMES = ['BIM-information', 'produktkategori', 'material']


def upgrade():
    conn = op.get_bind()
    for field_name in FIELD_NAMES:
        result = conn.execute(
            text("SELECT id FROM object_fields WHERE LOWER(field_name) = LOWER(:name)"),
            {'name': field_name}
        ).fetchall()
        field_ids = [row[0] for row in result]
        if not field_ids:
            continue
        conn.execute(
            text("DELETE FROM object_data WHERE field_id = ANY(:ids)"),
            {'ids': field_ids}
        )


def downgrade():
    pass
