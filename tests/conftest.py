"""
Pytest configuration och delade fixtures för systemtester.

Sätter upp en isolerad SQLite-databas (tempfil) per testsession
med den normala seeddatan inläst, så att tester körs mot ett
realistiskt systemtillstånd utan att påverka produktionsdatabasen.

Viktiga boostrap-steg (i modulnivå-ordning):
1. Mocka paket som inte finns/fungerar i testmiljön (flasgger, pypdf).
2. Sätt DATABASE_URL-miljövariabeln INNAN Config-klassen importeras.
3. Patcha flask_migrate.upgrade → db.create_all() INNAN app.py importeras
   (app.py gör `from flask_migrate import upgrade` på modulnivå och
   anropar create_app() direkt vid import).
"""
import os
import sys
import tempfile
from unittest.mock import MagicMock

# ── 1. Mocka ej tillgängliga / kraschar paket ─────────────────────────────────
# pypdf importerar cryptography (Rust/pyo3) som kraschar i denna miljö.
# Mocket måste sättas INNAN något annat försöker importera dessa.

def _inject_mock(module_name: str, *extra_submodules: str) -> None:
    """Ersätt module_name (och undermoduler) med MagicMock-stubb."""
    mock = MagicMock()
    sys.modules[module_name] = mock
    for sub in extra_submodules:
        sys.modules[sub] = mock


_inject_mock("flasgger")
_inject_mock(
    "pypdf",
    "pypdf._crypt_providers",
    "pypdf._crypt_providers._cryptography",
)

# ── 2. Testdatabas (SQLite tempfil) ───────────────────────────────────────────
_db_fd, _db_path = tempfile.mkstemp(suffix=".db")
os.environ["DATABASE_URL"] = f"sqlite:///{_db_path}"

# ── 3. Patcha flask_migrate.upgrade → db.create_all() ────────────────────────
# app.py importerar `upgrade` från flask_migrate på modulnivå och anropar den
# direkt i create_app(). Patchningen måste ske INNAN app.py importeras.

import flask_migrate as _fm  # noqa: E402


def _create_db_tables() -> None:
    """Körs i stället för Alembic-migrationer: skapar schema med SQLAlchemy."""
    from models import db
    db.create_all()


_fm.upgrade = _create_db_tables  # app.py hämtar denna referens vid import

# ── Fixtures ──────────────────────────────────────────────────────────────────

import pytest  # noqa: E402


@pytest.fixture(scope="session")
def app():
    """
    Skapar Flask-testapplikationen.

    Eftersom app.py kör create_app() på modulnivå räcker det att importera
    modulen – vi återanvänder den redan skapade Flask-instansen.
    """
    import app as _app_module  # noqa: PLC0415

    test_app = _app_module.app
    test_app.config["TESTING"] = True
    yield test_app

    # Städa upp tempfilen
    try:
        os.close(_db_fd)
    except OSError:
        pass
    try:
        os.unlink(_db_path)
    except OSError:
        pass


@pytest.fixture(scope="session")
def client(app):
    """Flask-testklient, delad under hela testsessionen."""
    return app.test_client()


@pytest.fixture(scope="session")
def first_object_type(client):
    """Returnerar första objekttypen från seeddatan (används i read-tester)."""
    resp = client.get("/api/object-types")
    types = resp.get_json()
    assert types, "Ingen seedad objekttyp hittades – kontrollera seed_data()"
    return types[0]


@pytest.fixture(scope="session")
def simple_object_type(client):
    """
    Skapar en enkel objekttyp utan obligatoriska fält för create/update-tester.
    Seeddatans typer (Assembly m.fl.) har obligatoriska fält som krånglar med
    minimala test-payloads.
    """
    resp = client.post(
        "/api/object-types",
        json={
            "name": "_TestTyp_Enkel",
            "id_prefix": "EKL",
            "description": "Intern typ för systemtester – inga obligatoriska fält",
        },
    )
    assert resp.status_code == 201, f"Kunde inte skapa testobjekttyp: {resp.get_json()}"
    return resp.get_json()


@pytest.fixture(scope="session")
def first_object(client):
    """Returnerar första objektet från seeddatan."""
    resp = client.get("/api/objects")
    objects = resp.get_json()
    assert objects and isinstance(objects, list), (
        "Inga seedade objekt hittades – kontrollera seed_data()"
    )
    return objects[0]
