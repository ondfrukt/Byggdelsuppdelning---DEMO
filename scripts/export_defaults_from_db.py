#!/usr/bin/env python3
import json
import sqlite3
from pathlib import Path


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

    payload = {
        'version': 1,
        'object_types': object_types,
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
