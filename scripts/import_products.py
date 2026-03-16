#!/usr/bin/env python3
import argparse
import csv
import sys
from pathlib import Path

PROJECT_ROOT = Path(__file__).resolve().parents[1]
if str(PROJECT_ROOT) not in sys.path:
    sys.path.insert(0, str(PROJECT_ROOT))

from app import create_app
from models import db, ManagedListItem, Object, ObjectData, ObjectType
from routes.objects import set_object_data_value
from utils.auto_id_generator import compose_full_id, generate_base_id


DEFAULT_INPUT = PROJECT_ROOT / "defaults" / "product-imports" / "generic-products.tsv"


def normalize_text(value):
    return " ".join(str(value or "").strip().split()).casefold()


def load_rows(path):
    raw = Path(path).read_text(encoding="utf-8-sig")
    sample = raw[:2048]
    try:
        dialect = csv.Sniffer().sniff(sample, delimiters=",;\t")
    except csv.Error:
        dialect = csv.excel_tab

    reader = csv.DictReader(raw.splitlines(), dialect=dialect)
    rows = []
    for row in reader:
        normalized = {str(key or "").strip().lower(): str(value or "").strip() for key, value in row.items()}
        if not any(normalized.values()):
            continue
        rows.append(
            {
                "name": normalized.get("name", ""),
                "description": normalized.get("description", ""),
                "category": normalized.get("category", ""),
                "manufacturer": normalized.get("manufacturer", "") or normalized.get("manufacutre", ""),
            }
        )
    return rows


def get_product_setup():
    product_type = ObjectType.query.filter_by(name="Product").first()
    if not product_type:
        raise RuntimeError("Object type 'Product' saknas i databasen.")

    fields = {field.field_name: field for field in product_type.fields}
    required_fields = ["namn", "description - short", "tillverkare", "produktkategori"]
    missing = [field_name for field_name in required_fields if field_name not in fields]
    if missing:
        raise RuntimeError(f"Product saknar fält: {', '.join(missing)}")

    category_options = fields["produktkategori"].field_options or {}
    if not isinstance(category_options, dict) or int(category_options.get("list_id") or 0) <= 0:
        raise RuntimeError("Fältet 'produktkategori' är inte kopplat till en giltig managed list.")

    return product_type, fields, int(category_options["list_id"])


def ensure_categories(list_id, rows):
    category_map = {}
    existing_items = (
        ManagedListItem.query.filter_by(list_id=list_id)
        .order_by(ManagedListItem.sort_order.asc(), ManagedListItem.id.asc())
        .all()
    )
    next_sort_order = max((int(item.sort_order or 0) for item in existing_items), default=0) + 1

    for item in existing_items:
        category_map[normalize_text(item.value)] = item

    created = []
    for category_name in sorted({row["category"] for row in rows if row["category"]}, key=str.casefold):
        key = normalize_text(category_name)
        if key in category_map:
            continue

        item = ManagedListItem(
            list_id=list_id,
            value=category_name,
            label=category_name,
            code=category_name.lower().replace(" ", "_"),
            sort_order=next_sort_order,
            is_active=True,
            is_selectable=True,
            level=0,
        )
        next_sort_order += 1
        db.session.add(item)
        db.session.flush()
        category_map[key] = item
        created.append(category_name)

    return category_map, created


def build_existing_signatures(category_lookup):
    signatures = set()
    product_type = ObjectType.query.filter_by(name="Product").first()
    products = Object.query.filter_by(object_type_id=product_type.id).all()
    category_id_to_name = {str(item.id): normalize_text(item.value) for item in category_lookup.values()}

    for product in products:
        data = product.data or {}
        category_value = str(data.get("produktkategori") or "").strip()
        normalized_category = category_id_to_name.get(category_value, normalize_text(category_value))
        signatures.add(
            (
                normalize_text(data.get("namn")),
                normalize_text(data.get("description - short")),
                normalized_category,
                normalize_text(data.get("tillverkare")),
            )
        )

    return signatures


def import_rows(rows):
    product_type, fields, category_list_id = get_product_setup()
    category_lookup, created_categories = ensure_categories(category_list_id, rows)
    existing_signatures = build_existing_signatures(category_lookup)

    created_products = []
    skipped_products = []

    for row in rows:
        signature = (
            normalize_text(row["name"]),
            normalize_text(row["description"]),
            normalize_text(row["category"]),
            normalize_text(row["manufacturer"]),
        )
        if signature in existing_signatures:
            skipped_products.append(row["name"])
            continue

        base_id = generate_base_id(product_type.name)
        obj = Object(
            object_type_id=product_type.id,
            created_by="codex-import",
            status="In work",
            version="v1",
            main_id=base_id,
            id_full=compose_full_id(base_id, "v1"),
        )
        db.session.add(obj)
        db.session.flush()

        payload_by_field = {
            "namn": row["name"],
            "description - short": row["description"],
            "tillverkare": row["manufacturer"],
            "produktkategori": str(category_lookup[normalize_text(row["category"])].id),
        }

        for field_name, value in payload_by_field.items():
            record = ObjectData(object_id=obj.id, field_id=fields[field_name].id)
            set_object_data_value(record, fields[field_name].field_type, value, fields[field_name].field_options)
            db.session.add(record)

        existing_signatures.add(signature)
        created_products.append(obj.id_full)

    db.session.commit()
    return created_categories, created_products, skipped_products


def main():
    parser = argparse.ArgumentParser(description="Importera produkter till Product-objekttypen.")
    parser.add_argument(
        "--file",
        default=str(DEFAULT_INPUT),
        help="Sökväg till CSV/TSV-fil med kolumnerna name, description, category, manufacturer/manufacutre.",
    )
    args = parser.parse_args()

    rows = load_rows(args.file)
    if not rows:
        raise SystemExit("Ingen data hittades i importfilen.")

    app = create_app()
    with app.app_context():
        created_categories, created_products, skipped_products = import_rows(rows)

    print(f"Imported products: {len(created_products)}")
    print(f"Skipped existing products: {len(skipped_products)}")
    print(f"Created categories: {', '.join(created_categories) if created_categories else '0'}")


if __name__ == "__main__":
    main()
