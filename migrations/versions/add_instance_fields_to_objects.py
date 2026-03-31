"""Add per-object instance fields to object_fields table

Revision ID: add_instance_fields_to_objects
Revises: add_file_data_bytea
Create Date: 2026-03-31

Allows individual object instances to carry their own custom fields by
adding a nullable object_id FK on object_fields. The object_type_id column
is relaxed to nullable so a field row can belong to either a type OR an
object — never both.
"""
from alembic import op
import sqlalchemy as sa

revision = 'add_instance_fields_to_objects'
down_revision = 'add_file_data_bytea'
branch_labels = None
depends_on = None


def upgrade():
    with op.batch_alter_table('object_fields', schema=None) as batch_op:
        batch_op.add_column(sa.Column('object_id', sa.Integer(), nullable=True))
        batch_op.alter_column('object_type_id', existing_type=sa.Integer(), nullable=True)
        batch_op.create_foreign_key(
            'fk_object_fields_object_id',
            'objects', ['object_id'], ['id'],
            ondelete='CASCADE'
        )
        batch_op.create_index('idx_object_fields_object_id', ['object_id'])


def downgrade():
    with op.batch_alter_table('object_fields', schema=None) as batch_op:
        batch_op.drop_index('idx_object_fields_object_id')
        batch_op.drop_constraint('fk_object_fields_object_id', type_='foreignkey')
        batch_op.drop_column('object_id')
        batch_op.alter_column('object_type_id', existing_type=sa.Integer(), nullable=False)
