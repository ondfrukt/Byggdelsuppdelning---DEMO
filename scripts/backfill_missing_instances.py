"""Backfill structural instances from structural relation entities."""

from pathlib import Path
import sys

ROOT_DIR = Path(__file__).resolve().parents[1]
if str(ROOT_DIR) not in sys.path:
    sys.path.insert(0, str(ROOT_DIR))

from app import app
from models import db, Instance, ObjectRelation
from routes.relation_type_rules import normalize_relation_direction
from utils.instance_types import ALLOWED_INSTANCE_TYPES, get_instance_type_specs


def resolve_instance_type_from_relation(relation):
    relation_type = str(relation.relation_type or '').strip().lower()
    if relation_type in ALLOWED_INSTANCE_TYPES:
        return relation_type

    if relation_type != 'ingår_i':
        return None

    source_object = relation.source_object
    target_object = relation.target_object
    source_type = str(source_object.object_type.name if source_object and source_object.object_type else '').strip()
    target_type = str(target_object.object_type.name if target_object and target_object.object_type else '').strip()

    for spec in get_instance_type_specs():
        if spec.get('parent_scope') == source_type and spec.get('child_scope') == target_type:
            return str(spec.get('key') or '').strip().lower() or None

    return None


def backfill_missing_instances():
    created = []

    with app.app_context():
        existing = {
            (int(instance.parent_object_id), int(instance.child_object_id), str(instance.instance_type or '').strip().lower())
            for instance in Instance.query.all()
        }

        for relation in ObjectRelation.query.order_by(ObjectRelation.id.asc()).all():
            instance_type = resolve_instance_type_from_relation(relation)
            if not instance_type:
                continue

            parent_object = relation.source_object
            child_object = relation.target_object
            if not parent_object or not child_object:
                continue

            _, normalized_parent, normalized_child, _ = normalize_relation_direction(
                relation_type=instance_type,
                source_object=parent_object,
                target_object=child_object,
            )

            key = (
                int(normalized_parent.id),
                int(normalized_child.id),
                instance_type
            )
            if key in existing:
                continue

            instance = Instance(
                parent_object_id=normalized_parent.id,
                child_object_id=normalized_child.id,
                instance_type=instance_type,
            )
            db.session.add(instance)
            existing.add(key)
            created.append({
                'relation_id': int(relation.id),
                'parent_object_id': int(normalized_parent.id),
                'child_object_id': int(normalized_child.id),
                'instance_type': instance_type,
            })

        if created:
            db.session.commit()

    return created


if __name__ == '__main__':
    created_rows = backfill_missing_instances()
    print(f'Created {len(created_rows)} missing instances')
    for row in created_rows:
        print(row)
