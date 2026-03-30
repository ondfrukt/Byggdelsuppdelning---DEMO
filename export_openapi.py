"""
export_openapi.py
-----------------
Startar Flask-appen i testläge och exporterar OpenAPI-spec till openapi.yaml.

Användning:
    python export_openapi.py [--output openapi.yaml] [--format yaml|json]

Beroenden:
    - Alla projektberoenden installerade (se requirements.txt)
    - SQLite används om DATABASE_URL inte är satt (testläge, ingen riktig DB krävs)

Notera:
    Appen försöker köra databasmigrationer vid uppstart. Om du inte har en
    fullständig databas konfigurerad kan du sätta miljövariabeln
    SKIP_MIGRATIONS=1 för att hoppa över det steget och bara exportera specen.
"""

import argparse
import json
import os
import sys

import yaml


def _patch_app_for_export():
    """Patcha create_app för att skippa databasmigrationer och seed vid export."""
    if os.environ.get("SKIP_MIGRATIONS", "").lower() in ("1", "true", "yes"):
        import flask_migrate

        original_upgrade = flask_migrate.upgrade

        def noop_upgrade(*args, **kwargs):
            pass

        flask_migrate.upgrade = noop_upgrade

        # Patcha seed_data
        import new_database

        new_database._original_seed_data = new_database.seed_data
        new_database.seed_data = lambda app: None

        return original_upgrade, new_database
    return None, None


def build_app():
    """Bygg Flask-appen och returnera den."""
    _patch_app_for_export()
    from app import create_app

    return create_app()


def get_spec(app):
    """Hämta den genererade OpenAPI-specen som dict."""
    swagger_config = app.config.get("SWAGGER", {})
    specs_cfg = swagger_config.get("specs", [{"route": "/apispec.json"}])

    with app.test_client() as client:
        for spec_cfg in specs_cfg:
            route = spec_cfg.get("route", "/apispec.json")
            response = client.get(route)
            if response.status_code == 200:
                return response.get_json()

    raise RuntimeError(
        "Kunde inte hämta OpenAPI-spec. "
        "Kontrollera att Swagger(app, ...) kallas i create_app() och att "
        "SWAGGER_CONFIG innehåller en giltig 'specs'-lista."
    )


def export_spec(spec: dict, output_path: str, fmt: str = "yaml"):
    """Skriv specen till fil."""
    output_path = os.path.abspath(output_path)
    if fmt == "json":
        content = json.dumps(spec, ensure_ascii=False, indent=2)
    else:
        content = yaml.dump(spec, allow_unicode=True, sort_keys=False, default_flow_style=False)

    with open(output_path, "w", encoding="utf-8") as fh:
        fh.write(content)

    print(f"OpenAPI-spec exporterad till: {output_path}")
    print(f"  Format : {fmt.upper()}")
    print(f"  Titel  : {spec.get('info', {}).get('title', '–')}")
    print(f"  Version: {spec.get('info', {}).get('version', '–')}")
    paths = spec.get("paths", {})
    print(f"  Paths  : {len(paths)} endpoints")


def main():
    parser = argparse.ArgumentParser(
        description="Exportera OpenAPI-spec från Byggdelsuppdelning-appen."
    )
    parser.add_argument(
        "--output",
        default="openapi.yaml",
        help="Utdatafilens sökväg (default: openapi.yaml i projektets rot)",
    )
    parser.add_argument(
        "--format",
        choices=["yaml", "json"],
        default="yaml",
        help="Utdataformat: yaml (default) eller json",
    )
    args = parser.parse_args()

    # Sätt arbetskatalog till projektets rot
    project_root = os.path.dirname(os.path.abspath(__file__))
    os.chdir(project_root)
    if project_root not in sys.path:
        sys.path.insert(0, project_root)

    # Sätt SQLite som fallback-databas om ingen DATABASE_URL finns
    if not os.environ.get("DATABASE_URL"):
        sqlite_path = os.path.join(project_root, "export_tmp.db")
        os.environ["DATABASE_URL"] = f"sqlite:///{sqlite_path}"
        _cleanup_sqlite = sqlite_path
    else:
        _cleanup_sqlite = None

    try:
        print("Bygger Flask-app…")
        app = build_app()

        print("Hämtar OpenAPI-spec…")
        spec = get_spec(app)

        # Bestäm utdatafil
        output_path = args.output
        if not os.path.isabs(output_path):
            output_path = os.path.join(project_root, output_path)

        export_spec(spec, output_path, fmt=args.format)

    finally:
        # Städa upp temporär SQLite-fil
        if _cleanup_sqlite and os.path.exists(_cleanup_sqlite):
            try:
                os.remove(_cleanup_sqlite)
            except OSError:
                pass


if __name__ == "__main__":
    main()
