"""fix select fields referencing missing managed lists

Revision ID: fix_select_fields_missing_lists
Revises: remove_missing_list_field_data
Create Date: 2026-03-24

Finds object_fields with field_type='select' whose field_options reference a
managed_list list_id that does not exist in the managed_lists table.
Changes those fields to field_type='text' and clears field_options so they no
longer trigger 404 errors when the UI tries to load the missing list.
"""
from alembic import op
from sqlalchemy import text
import json

revision = 'fix_select_fields_missing_lists'
down_revision = 'remove_missing_list_field_data'
branch_labels = None
depends_on = None


def upgrade():
    conn = op.get_bind()

    # Load all existing managed list IDs
    existing_list_ids = {
        row[0]
        for row in conn.execute(text("SELECT id FROM managed_lists")).fetchall()
    }

    # Find all select fields that reference a managed_list source
    rows = conn.execute(
        text("SELECT id, field_options FROM object_fields WHERE field_type = 'select' AND field_options IS NOT NULL")
    ).fetchall()

    broken_ids = []
    for row in rows:
        field_id, raw_options = row[0], row[1]
        try:
            options = raw_options if isinstance(raw_options, dict) else json.loads(raw_options or '{}')
        except (ValueError, TypeError):
            continue
        if options.get('source') != 'managed_list':
            continue
        list_id = options.get('list_id')
        try:
            list_id = int(list_id)
        except (TypeError, ValueError):
            continue
        if list_id not in existing_list_ids:
            broken_ids.append(field_id)

    if not broken_ids:
        return

    # Change to text type and clear options for each broken field
    for field_id in broken_ids:
        conn.execute(
            text("UPDATE object_fields SET field_type = 'text', field_options = NULL WHERE id = :id"),
            {'id': field_id}
        )


def downgrade():
    pass
