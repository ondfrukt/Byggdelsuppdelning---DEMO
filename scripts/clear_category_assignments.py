"""
clear_category_assignments.py
Rensar kategorikopplingar för alla Assembly-, Space- och System-objekt.

Kör utan argument för att se vad som kommer att ändras (dry-run).
Kör med --apply för att genomföra ändringarna.
"""

import sqlite3
import argparse
import os

DB_PATH = os.path.join(os.path.dirname(__file__), '..', 'plm.db')

TARGET_TYPES = ('Assembly', 'Space', 'System')


def main(apply: bool):
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    c = conn.cursor()

    # Hämta ID:n för de aktuella objekttyperna
    placeholders = ','.join('?' * len(TARGET_TYPES))
    c.execute(f"SELECT id, name FROM object_types WHERE name IN ({placeholders})", TARGET_TYPES)
    type_rows = c.fetchall()
    type_ids = [r['id'] for r in type_rows]
    type_map = {r['id']: r['name'] for r in type_rows}

    if not type_ids:
        print('Hittade inga matchande objekttyper.')
        return

    print('Hittade objekttyper:')
    for tid, tname in type_map.items():
        print(f'  [{tid}] {tname}')

    # Hämta alla objekt av dessa typer
    ph = ','.join('?' * len(type_ids))
    c.execute(f"SELECT id, id_full, object_type_id FROM objects WHERE object_type_id IN ({ph})", type_ids)
    objects = c.fetchall()
    obj_ids = [o['id'] for o in objects]

    print(f'\nHittade {len(objects)} objekt totalt:')
    for o in objects:
        print(f'  [{o["id"]}] {o["id_full"]}  ({type_map[o["object_type_id"]]})')

    if not obj_ids:
        print('Inget att rensa.')
        return

    # Visa vad som rensas: object_category_assignments
    ph2 = ','.join('?' * len(obj_ids))
    c.execute(
        f"SELECT oca.id, oca.object_id, cn.code, cn.name as node_name "
        f"FROM object_category_assignments oca "
        f"LEFT JOIN category_nodes cn ON cn.id = oca.category_node_id "
        f"WHERE oca.object_id IN ({ph2})",
        obj_ids
    )
    assignments = c.fetchall()

    # Visa vad som rensas: category_node-fältvärden i object_data
    c.execute(
        f"SELECT od.id, od.object_id, of2.field_name, od.value_text "
        f"FROM object_data od "
        f"JOIN object_fields of2 ON of2.id = od.field_id "
        f"WHERE of2.field_type = 'category_node' "
        f"AND od.object_id IN ({ph2}) "
        f"AND (od.value_text IS NOT NULL AND od.value_text != '')",
        obj_ids
    )
    field_values = c.fetchall()

    print(f'\n--- Vad som kommer att tas bort ---')
    print(f'\nobject_category_assignments: {len(assignments)} rader')
    for a in assignments:
        print(f'  obj_id={a["object_id"]}  nod={a["code"]} – {a["node_name"]}')

    print(f'\nobject_data (category_node-fält): {len(field_values)} rader')
    for fv in field_values:
        print(f'  obj_id={fv["object_id"]}  fält={fv["field_name"]}  värde={fv["value_text"]}')

    if not apply:
        print('\n[DRY-RUN] Inga ändringar gjordes. Kör med --apply för att genomföra.')
        conn.close()
        return

    # --- Genomför ändringarna ---
    print('\nGenomför ändringar...')

    if assignments:
        c.execute(f"DELETE FROM object_category_assignments WHERE object_id IN ({ph2})", obj_ids)
        print(f'  Raderade {c.rowcount} rader ur object_category_assignments.')

    if field_values:
        c.execute(
            f"UPDATE object_data SET value_text = NULL "
            f"WHERE object_id IN ({ph2}) "
            f"AND field_id IN (SELECT id FROM object_fields WHERE field_type = 'category_node')",
            obj_ids
        )
        print(f'  Nollställde {c.rowcount} fältvärden i object_data.')

    conn.commit()
    conn.close()
    print('\nKlart! Alla kategorikopplingar är borttagna.')
    print('Objekt kan nu öppnas och tilldelas ny kategori i UI:t.')


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description='Rensa kategorikopplingar')
    parser.add_argument('--apply', action='store_true', help='Genomför ändringarna (annars dry-run)')
    args = parser.parse_args()
    main(apply=args.apply)
