#!/usr/bin/env python3
import json
import sqlite3
from datetime import datetime
from pathlib import Path


def _normalize_json(value):
    if isinstance(value, str):
        try:
            return json.loads(value)
        except Exception:
            return value
    return value


def _sqlite_date_to_iso(value):
    if not value:
        return None
    text = str(value).strip()
    if not text:
        return None
    try:
        return datetime.fromisoformat(text).date().isoformat()
    except ValueError:
        return text


def _make_object_seed_key(row):
    full_id = str(row['id_full'] or '').strip()
    main_id = str(row['main_id'] or '').strip()
    version = str(row['version'] or '').strip()

    if full_id:
        return f"id_full:{full_id}"
    if main_id and version:
        return f"main_version:{main_id}:{version}"
    return f"legacy_id:{row['id']}"


def export_defaults(db_path, output_path):
    conn = sqlite3.connect(db_path)
    conn.row_factory = sqlite3.Row
    cur = conn.cursor()

    object_types = []
    object_type_rows = cur.execute(
        """
        SELECT id, name, description, icon, id_prefix, color, is_system
        FROM object_types
        ORDER BY name COLLATE NOCASE ASC
        """
    ).fetchall()

    id_to_name = {row['id']: row['name'] for row in object_type_rows}

    for object_type in object_type_rows:
        field_rows = cur.execute(
            """
            SELECT field_name, display_name, field_type, field_options,
                   is_required, lock_required_setting, force_presence_on_all_objects,
                   is_table_visible, is_detail_visible, help_text, display_order, detail_width
            FROM object_fields
            WHERE object_type_id = ?
            ORDER BY COALESCE(display_order, 999), id
            """,
            (object_type['id'],),
        ).fetchall()

        fields = []
        for field in field_rows:
            field_options = field['field_options']
            if isinstance(field_options, str):
                try:
                    field_options = json.loads(field_options)
                except Exception:
                    pass

            fields.append({
                'field_name': field['field_name'],
                'display_name': field['display_name'],
                'field_type': field['field_type'],
                'field_options': field_options,
                'is_required': bool(field['is_required']),
                'lock_required_setting': bool(field['lock_required_setting']),
                'force_presence_on_all_objects': bool(field['force_presence_on_all_objects']),
                'is_table_visible': bool(field['is_table_visible']),
                'is_detail_visible': bool(field['is_detail_visible']),
                'help_text': field['help_text'],
                'display_order': field['display_order'],
                'detail_width': field['detail_width'],
            })

        object_types.append({
            'name': object_type['name'],
            'description': object_type['description'],
            'icon': object_type['icon'],
            'id_prefix': object_type['id_prefix'],
            'color': object_type['color'],
            'is_system': bool(object_type['is_system']),
            'fields': fields,
        })

    object_rows = cur.execute(
        """
        SELECT id, object_type_id, created_at, updated_at, created_by, status, version, main_id, id_full
        FROM objects
        ORDER BY id ASC
        """
    ).fetchall()

    objects = []
    object_id_to_seed_key = {}
    field_cache = {}

    for object_row in object_rows:
        object_type_name = id_to_name.get(object_row['object_type_id'])
        if not object_type_name:
            continue

        if object_row['object_type_id'] not in field_cache:
            field_cache[object_row['object_type_id']] = {
                row['id']: {
                    'field_name': row['field_name'],
                    'field_type': row['field_type'],
                }
                for row in cur.execute(
                    """
                    SELECT id, field_name, field_type
                    FROM object_fields
                    WHERE object_type_id = ?
                    """,
                    (object_row['object_type_id'],),
                ).fetchall()
            }

        object_seed_key = _make_object_seed_key(object_row)
        object_id_to_seed_key[object_row['id']] = object_seed_key

        data_rows = cur.execute(
            """
            SELECT field_id, value_text, value_number, value_date, value_boolean, value_json
            FROM object_data
            WHERE object_id = ?
            ORDER BY field_id ASC
            """,
            (object_row['id'],),
        ).fetchall()

        data_payload = {}
        for data_row in data_rows:
            field_meta = field_cache[object_row['object_type_id']].get(data_row['field_id'])
            if not field_meta:
                continue

            field_name = field_meta['field_name']
            field_type = field_meta['field_type']
            value = None
            if field_type == 'number':
                value = float(data_row['value_number']) if data_row['value_number'] is not None else None
            elif field_type == 'date':
                value = _sqlite_date_to_iso(data_row['value_date'])
            elif field_type == 'boolean':
                value = None if data_row['value_boolean'] is None else bool(data_row['value_boolean'])
            else:
                value_json = _normalize_json(data_row['value_json'])
                value = value_json if value_json is not None else data_row['value_text']

            data_payload[field_name] = value

        objects.append({
            'seed_key': object_seed_key,
            'object_type': object_type_name,
            'created_at': object_row['created_at'],
            'updated_at': object_row['updated_at'],
            'created_by': object_row['created_by'],
            'status': object_row['status'],
            'version': object_row['version'],
            'main_id': object_row['main_id'],
            'id_full': object_row['id_full'],
            'data': data_payload,
        })

    relation_type_rows = cur.execute(
        """
        SELECT id, key, display_name, description, source_object_type_id, target_object_type_id,
               cardinality, is_directed, is_composition, inverse_relation_type_id
        FROM relation_types
        ORDER BY key ASC
        """
    ).fetchall()
    relation_id_to_key = {row['id']: row['key'] for row in relation_type_rows}

    relation_types = []
    for relation_type in relation_type_rows:
        relation_types.append({
            'key': relation_type['key'],
            'display_name': relation_type['display_name'],
            'description': relation_type['description'],
            'source_object_type': id_to_name.get(relation_type['source_object_type_id']),
            'target_object_type': id_to_name.get(relation_type['target_object_type_id']),
            'cardinality': relation_type['cardinality'],
            'is_directed': bool(relation_type['is_directed']),
            'is_composition': bool(relation_type['is_composition']),
            'inverse_key': relation_id_to_key.get(relation_type['inverse_relation_type_id']),
        })

    relation_rule_rows = cur.execute(
        """
        SELECT source_object_type_id, target_object_type_id, relation_type, is_allowed
        FROM relation_type_rules
        ORDER BY source_object_type_id, target_object_type_id
        """
    ).fetchall()

    relation_type_rules = []
    for rule in relation_rule_rows:
        relation_type_rules.append({
            'source_object_type': id_to_name.get(rule['source_object_type_id']),
            'target_object_type': id_to_name.get(rule['target_object_type_id']),
            'relation_type': rule['relation_type'],
            'is_allowed': bool(rule['is_allowed']),
        })

    relation_rows = cur.execute(
        """
        SELECT id, source_object_id, target_object_id, relation_type, description, relation_metadata, created_at
        FROM object_relations
        ORDER BY id ASC
        """
    ).fetchall()

    object_relations = []
    for relation_row in relation_rows:
        source_seed_key = object_id_to_seed_key.get(relation_row['source_object_id'])
        target_seed_key = object_id_to_seed_key.get(relation_row['target_object_id'])
        if not source_seed_key or not target_seed_key:
            continue

        object_relations.append({
            'source_object_seed_key': source_seed_key,
            'target_object_seed_key': target_seed_key,
            'relation_type': relation_row['relation_type'],
            'description': relation_row['description'],
            'relation_metadata': _normalize_json(relation_row['relation_metadata']),
            'created_at': relation_row['created_at'],
        })

    payload = {
        'version': 1,
        'object_types': object_types,
        'objects': objects,
        'object_relations': object_relations,
        'relation_types': relation_types,
        'relation_type_rules': relation_type_rules,
    }

    output_path.parent.mkdir(parents=True, exist_ok=True)
    output_path.write_text(json.dumps(payload, ensure_ascii=False, indent=2) + "\n", encoding='utf-8')
    print(f"Exported defaults to {output_path}")


def main():
    repo_root = Path(__file__).resolve().parent.parent
    db_path = repo_root / 'plm.db'
    output_path = repo_root / 'defaults' / 'plm-defaults.json'
    export_defaults(db_path, output_path)


if __name__ == '__main__':
    main()
