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


def _sqlite_datetime_to_iso(value):
    if not value:
        return None
    text = str(value).strip()
    if not text:
        return None
    try:
        return datetime.fromisoformat(text).isoformat()
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

    managed_list_rows = cur.execute(
        """
        SELECT id, code, name, description, allow_multiselect,
               language_codes, additional_language_code, is_active,
               created_at, updated_at
        FROM managed_lists
        ORDER BY id ASC
        """
    ).fetchall()

    managed_lists = []
    for managed_list in managed_list_rows:
        items = cur.execute(
            """
            SELECT id, list_id, code, label, description, value, parent_item_id,
                   level, value_translations, node_metadata, sort_order,
                   is_active, is_selectable, created_at, updated_at
            FROM managed_list_items
            WHERE list_id = ?
            ORDER BY sort_order ASC, id ASC
            """,
            (managed_list['id'],),
        ).fetchall()

        managed_lists.append({
            'id': managed_list['id'],
            'code': managed_list['code'],
            'name': managed_list['name'],
            'description': managed_list['description'],
            'allow_multiselect': bool(managed_list['allow_multiselect']),
            'language_codes': _normalize_json(managed_list['language_codes']) or [],
            'additional_language_code': managed_list['additional_language_code'],
            'is_active': bool(managed_list['is_active']),
            'created_at': _sqlite_datetime_to_iso(managed_list['created_at']),
            'updated_at': _sqlite_datetime_to_iso(managed_list['updated_at']),
            'items': [
                {
                    'id': item['id'],
                    'list_id': item['list_id'],
                    'code': item['code'],
                    'label': item['label'],
                    'description': item['description'],
                    'value': item['value'],
                    'parent_item_id': item['parent_item_id'],
                    'level': item['level'],
                    'value_translations': _normalize_json(item['value_translations']) or {},
                    'node_metadata': _normalize_json(item['node_metadata']) or {},
                    'sort_order': item['sort_order'],
                    'is_active': bool(item['is_active']),
                    'is_selectable': bool(item['is_selectable']),
                    'created_at': _sqlite_datetime_to_iso(item['created_at']),
                    'updated_at': _sqlite_datetime_to_iso(item['updated_at']),
                }
                for item in items
            ],
        })

    managed_list_link_rows = cur.execute(
        """
        SELECT id, parent_list_id, child_list_id, relation_key, is_active, created_at, updated_at
        FROM managed_list_links
        ORDER BY id ASC
        """
    ).fetchall()
    managed_list_links = [
        {
            'id': row['id'],
            'parent_list_id': row['parent_list_id'],
            'child_list_id': row['child_list_id'],
            'relation_key': row['relation_key'],
            'is_active': bool(row['is_active']),
            'created_at': _sqlite_datetime_to_iso(row['created_at']),
            'updated_at': _sqlite_datetime_to_iso(row['updated_at']),
        }
        for row in managed_list_link_rows
    ]

    managed_list_item_link_rows = cur.execute(
        """
        SELECT id, list_link_id, parent_item_id, child_item_id, is_active, created_at, updated_at
        FROM managed_list_item_links
        ORDER BY id ASC
        """
    ).fetchall()
    managed_list_item_links = [
        {
            'id': row['id'],
            'list_link_id': row['list_link_id'],
            'parent_item_id': row['parent_item_id'],
            'child_item_id': row['child_item_id'],
            'is_active': bool(row['is_active']),
            'created_at': _sqlite_datetime_to_iso(row['created_at']),
            'updated_at': _sqlite_datetime_to_iso(row['updated_at']),
        }
        for row in managed_list_item_link_rows
    ]

    field_list_binding_rows = cur.execute(
        """
        SELECT id, object_type, field_name, list_id, selection_mode,
               allow_only_leaf_selection, is_required, created_at, updated_at
        FROM field_list_bindings
        ORDER BY object_type COLLATE NOCASE ASC, field_name COLLATE NOCASE ASC, id ASC
        """
    ).fetchall()
    field_list_bindings = [
        {
            'id': row['id'],
            'object_type': row['object_type'],
            'field_name': row['field_name'],
            'list_id': row['list_id'],
            'selection_mode': row['selection_mode'],
            'allow_only_leaf_selection': bool(row['allow_only_leaf_selection']),
            'is_required': bool(row['is_required']),
            'created_at': _sqlite_datetime_to_iso(row['created_at']),
            'updated_at': _sqlite_datetime_to_iso(row['updated_at']),
        }
        for row in field_list_binding_rows
    ]

    field_template_rows = cur.execute(
        """
        SELECT id, template_name, field_name, display_name, display_name_translations,
               field_type, field_options, is_required, lock_required_setting,
               force_presence_on_all_objects, is_table_visible, help_text,
               help_text_translations, is_active, created_at, updated_at
        FROM field_templates
        ORDER BY template_name COLLATE NOCASE ASC, id ASC
        """
    ).fetchall()
    field_templates = [
        {
            'id': row['id'],
            'template_name': row['template_name'],
            'field_name': row['field_name'],
            'display_name': row['display_name'],
            'display_name_translations': _normalize_json(row['display_name_translations']) or {},
            'field_type': row['field_type'],
            'field_options': _normalize_json(row['field_options']),
            'is_required': bool(row['is_required']),
            'lock_required_setting': bool(row['lock_required_setting']),
            'force_presence_on_all_objects': bool(row['force_presence_on_all_objects']),
            'is_table_visible': bool(row['is_table_visible']),
            'help_text': row['help_text'],
            'help_text_translations': _normalize_json(row['help_text_translations']) or {},
            'is_active': bool(row['is_active']),
            'created_at': _sqlite_datetime_to_iso(row['created_at']),
            'updated_at': _sqlite_datetime_to_iso(row['updated_at']),
        }
        for row in field_template_rows
    ]

    instance_type_field_rows = cur.execute(
        """
        SELECT id, instance_type_key, field_template_id, display_order,
               is_required, created_at, updated_at
        FROM instance_type_fields
        ORDER BY instance_type_key COLLATE NOCASE ASC, display_order ASC, id ASC
        """
    ).fetchall()
    field_template_id_to_name = {
        row['id']: row['template_name']
        for row in field_template_rows
    }
    instance_type_fields = [
        {
            'id': row['id'],
            'instance_type_key': row['instance_type_key'],
            'field_template_id': row['field_template_id'],
            'field_template_name': field_template_id_to_name.get(row['field_template_id']),
            'display_order': row['display_order'],
            'is_required': bool(row['is_required']),
            'created_at': _sqlite_datetime_to_iso(row['created_at']),
            'updated_at': _sqlite_datetime_to_iso(row['updated_at']),
        }
        for row in instance_type_field_rows
    ]

    classification_system_rows = cur.execute(
        """
        SELECT id, name, description, version, is_active, created_at, updated_at
        FROM classification_systems
        ORDER BY id ASC
        """
    ).fetchall()
    classification_systems = [
        {
            'id': row['id'],
            'name': row['name'],
            'description': row['description'],
            'version': row['version'],
            'is_active': bool(row['is_active']),
            'created_at': _sqlite_datetime_to_iso(row['created_at']),
            'updated_at': _sqlite_datetime_to_iso(row['updated_at']),
        }
        for row in classification_system_rows
    ]

    category_node_rows = cur.execute(
        """
        SELECT id, system_id, parent_id, code, name, level, description,
               sort_order, is_active, created_at, updated_at
        FROM category_nodes
        ORDER BY system_id ASC, level ASC, sort_order ASC, id ASC
        """
    ).fetchall()
    classification_system_names = {
        row['id']: row['name']
        for row in classification_system_rows
    }
    category_nodes = [
        {
            'id': row['id'],
            'system_id': row['system_id'],
            'system_name': classification_system_names.get(row['system_id']),
            'parent_id': row['parent_id'],
            'code': row['code'],
            'name': row['name'],
            'level': row['level'],
            'description': row['description'],
            'sort_order': row['sort_order'],
            'is_active': bool(row['is_active']),
            'created_at': _sqlite_datetime_to_iso(row['created_at']),
            'updated_at': _sqlite_datetime_to_iso(row['updated_at']),
        }
        for row in category_node_rows
    ]

    object_category_assignment_rows = cur.execute(
        """
        SELECT id, object_id, category_node_id, is_primary, created_at
        FROM object_category_assignments
        ORDER BY id ASC
        """
    ).fetchall()
    object_category_assignments = [
        {
            'id': row['id'],
            'object_id': row['object_id'],
            'object_seed_key': object_id_to_seed_key.get(row['object_id']),
            'category_node_id': row['category_node_id'],
            'is_primary': bool(row['is_primary']),
            'created_at': _sqlite_datetime_to_iso(row['created_at']),
        }
        for row in object_category_assignment_rows
    ]

    instance_rows = cur.execute(
        """
        SELECT id, parent_object_id, child_object_id, instance_type, quantity,
               unit, formula, role, position, waste_factor,
               installation_sequence, optional, metadata_json, created_at, updated_at
        FROM instances
        ORDER BY id ASC
        """
    ).fetchall()
    instances = [
        {
            'id': row['id'],
            'parent_object_id': row['parent_object_id'],
            'parent_object_seed_key': object_id_to_seed_key.get(row['parent_object_id']),
            'child_object_id': row['child_object_id'],
            'child_object_seed_key': object_id_to_seed_key.get(row['child_object_id']),
            'instance_type': row['instance_type'],
            'quantity': row['quantity'],
            'unit': row['unit'],
            'formula': row['formula'],
            'role': row['role'],
            'position': row['position'],
            'waste_factor': row['waste_factor'],
            'installation_sequence': row['installation_sequence'],
            'optional': bool(row['optional']),
            'metadata_json': _normalize_json(row['metadata_json']),
            'created_at': _sqlite_datetime_to_iso(row['created_at']),
            'updated_at': _sqlite_datetime_to_iso(row['updated_at']),
        }
        for row in instance_rows
    ]

    document_rows = cur.execute(
        """
        SELECT id, object_id, filename, original_filename, file_path,
               file_size, mime_type, uploaded_at, uploaded_by
        FROM documents
        ORDER BY id ASC
        """
    ).fetchall()
    documents = [
        {
            'id': row['id'],
            'object_id': row['object_id'],
            'object_seed_key': object_id_to_seed_key.get(row['object_id']),
            'filename': row['filename'],
            'original_filename': row['original_filename'],
            'file_path': row['file_path'],
            'file_size': row['file_size'],
            'mime_type': row['mime_type'],
            'uploaded_at': _sqlite_datetime_to_iso(row['uploaded_at']),
            'uploaded_by': row['uploaded_by'],
        }
        for row in document_rows
    ]

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
        'managed_lists': managed_lists,
        'managed_list_links': managed_list_links,
        'managed_list_item_links': managed_list_item_links,
        'field_list_bindings': field_list_bindings,
        'field_templates': field_templates,
        'instance_type_fields': instance_type_fields,
        'classification_systems': classification_systems,
        'category_nodes': category_nodes,
        'object_category_assignments': object_category_assignments,
        'instances': instances,
        'documents': documents,
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
