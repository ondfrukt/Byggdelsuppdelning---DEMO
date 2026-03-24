"""Migrate legacy direct object links (children/parentId) into relation entities."""

from models import db, ObjectField, ObjectData, ObjectRelation


def _parse_id_list(raw_value):
    if raw_value is None:
        return []
    text = str(raw_value).strip()
    if not text:
        return []

    # Accept comma-separated and JSON-like array payloads
    cleaned = text.replace('[', '').replace(']', '').replace('"', '').replace("'", '')
    values = []
    for token in cleaned.split(','):
        token = token.strip()
        if token.isdigit():
            values.append(int(token))
    return values


def run_migration(db_instance=db):
    session = db_instance.session

    parent_fields = ObjectField.query.filter(ObjectField.field_name.in_(['parentId', 'parent_id'])).all()
    children_fields = ObjectField.query.filter(ObjectField.field_name.in_(['children', 'childIds', 'child_ids'])).all()

    created = 0

    # parentId -> relation(parent -> child)
    for field in parent_fields:
        entries = ObjectData.query.filter_by(field_id=field.id).all()
        for entry in entries:
            parent_candidates = _parse_id_list(entry.value_text)
            if not parent_candidates:
                continue

            parent_id = parent_candidates[0]
            child_id = entry.object_id

            exists = ObjectRelation.query.filter_by(
                source_object_id=parent_id,
                target_object_id=child_id,
                relation_type='ingår_i'
            ).first()
            if exists:
                continue

            session.add(ObjectRelation(
                source_object_id=parent_id,
                target_object_id=child_id,
                relation_type='ingår_i',
                relation_metadata={'migrated_from': field.field_name}
            ))
            created += 1

    # children -> relation(parent -> child)
    for field in children_fields:
        entries = ObjectData.query.filter_by(field_id=field.id).all()
        for entry in entries:
            parent_id = entry.object_id
            child_ids = _parse_id_list(entry.value_text)

            for child_id in child_ids:
                exists = ObjectRelation.query.filter_by(
                    source_object_id=parent_id,
                    target_object_id=child_id,
                    relation_type='ingår_i'
                ).first()
                if exists:
                    continue

                session.add(ObjectRelation(
                    source_object_id=parent_id,
                    target_object_id=child_id,
                    relation_type='ingår_i',
                    relation_metadata={'migrated_from': field.field_name}
                ))
                created += 1

    session.commit()
    return created
