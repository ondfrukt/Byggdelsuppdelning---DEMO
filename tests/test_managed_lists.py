"""
Tester för hanterade listor (/api/managed-lists).

Täcker: lista, hämta enskild med items, skapa ny, validering.

OBS: Seeddatan (plm-defaults.json) seedar objekttyper och objekt men
INTE managed lists. Listan är tom efter seeding – tester skapar
egna listor där det behövs.
"""
import pytest


class TestListManagedLists:
    def test_returns_200(self, client):
        resp = client.get("/api/managed-lists")
        assert resp.status_code == 200

    def test_returns_list(self, client):
        assert isinstance(client.get("/api/managed-lists").get_json(), list)

    def test_each_list_has_required_keys(self, client):
        for ml in client.get("/api/managed-lists").get_json():
            assert "id" in ml
            assert "name" in ml


@pytest.fixture(scope="module")
def created_list(client):
    """Skapar en managed list som kan användas av flera tester i modulen."""
    resp = client.post("/api/managed-lists", json={"name": "_Testlista_System", "language_codes": ["sv"]})
    assert resp.status_code == 201, f"Kunde inte skapa testlista: {resp.get_json()}"
    return resp.get_json()


class TestGetManagedList:
    def test_returns_200(self, client, created_list):
        resp = client.get(f"/api/managed-lists/{created_list['id']}")
        assert resp.status_code == 200

    def test_has_items_key(self, client, created_list):
        data = client.get(f"/api/managed-lists/{created_list['id']}").get_json()
        assert "items" in data

    def test_returns_404_or_error_for_nonexistent(self, client):
        resp = client.get("/api/managed-lists/999999")
        assert resp.status_code >= 400


class TestCreateManagedList:
    def test_create_minimal(self, client):
        resp = client.post("/api/managed-lists", json={"name": "_Testlista_A", "language_codes": ["sv"]})
        assert resp.status_code == 201
        data = resp.get_json()
        assert data["name"] == "_Testlista_A"
        assert "id" in data

    def test_create_missing_name_returns_400(self, client):
        resp = client.post("/api/managed-lists", json={})
        assert resp.status_code == 400
