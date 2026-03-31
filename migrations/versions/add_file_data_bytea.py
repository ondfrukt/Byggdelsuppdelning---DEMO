"""Store document file contents as BYTEA in database

Revision ID: add_file_data_bytea
Revises: fix_datamodel_integrity
Create Date: 2026-03-31

Adds a file_data column (BYTEA) to the documents table so that uploaded
files are stored directly in PostgreSQL instead of on the ephemeral local
filesystem. Also relaxes the NOT NULL constraint on file_path since it is
no longer used for storage.
"""
from alembic import op
import sqlalchemy as sa

revision = 'add_file_data_bytea'
down_revision = 'fix_datamodel_integrity'
branch_labels = None
depends_on = None


def upgrade():
    with op.batch_alter_table('documents', schema=None) as batch_op:
        batch_op.add_column(sa.Column('file_data', sa.LargeBinary(), nullable=True))
        batch_op.alter_column('file_path', existing_type=sa.String(length=500), nullable=True)


def downgrade():
    with op.batch_alter_table('documents', schema=None) as batch_op:
        batch_op.drop_column('file_data')
        batch_op.alter_column('file_path', existing_type=sa.String(length=500), nullable=False)
