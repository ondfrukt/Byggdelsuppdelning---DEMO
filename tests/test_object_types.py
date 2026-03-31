"""
Tester för objekttyps-API:t (/api/object-types).

Täcker: lista, hämta enskild, skapa ny, validering.
"""


class TestListObjectTypes:
    def test_returns_200(self, client):
        resp = client.get("/api/object-types")
        assert resp.status_code == 200

    def test_returns_list(self, client):
        data = client.get("/api/object-types").get_json()
        assert isinstance(data, list)

    def test_seeded_types_present(self, client):
        data = client.get("/api/object-types").get_json()
        assert len(data) >= 1, "Minst en objekttyp ska finnas efter seeding"

    def test_each_type_has_required_keys(self, client):
        for ot in client.get("/api/object-types").get_json():
            assert "id" in ot
            assert "name" in ot

    def test_include_fields_flag(self, client):
        resp = client.get("/api/object-types?include_fields=true")
        assert resp.status_code == 200
        for ot in resp.get_json():
            assert "fields" in ot, "include_fields=true ska inkludera 'fields'"


class TestGetObjectType:
    def test_returns_200_for_existing(self, client, first_object_type):
        resp = client.get(f"/api/object-types/{first_object_type['id']}")
        assert resp.status_code == 200

    def test_returns_fields(self, client, first_object_type):
        resp = client.get(f"/api/object-types/{first_object_type['id']}")
        assert "fields" in resp.get_json()

    def test_returns_error_for_nonexistent(self, client):
        resp = client.get("/api/object-types/999999")
        assert resp.status_code == 404


class TestCreateObjectType:
    def test_create_minimal(self, client):
        payload = {"name": "_TestTyp_A", "description": "Skapad av systemtest", "id_prefix": "TST"}
        resp = client.post("/api/object-types", json=payload)
        assert resp.status_code == 201
        data = resp.get_json()
        assert data["name"] == "_TestTyp_A"
        assert "id" in data

    def test_create_with_color(self, client):
        resp = client.post(
            "/api/object-types",
            json={"name": "_TestTyp_B", "id_prefix": "TSB", "color": "#0EA5E9"},
        )
        assert resp.status_code == 201

    def test_create_missing_name_returns_400(self, client):
        resp = client.post("/api/object-types", json={"id_prefix": "XX"})
        assert resp.status_code == 400

    def test_duplicate_name_returns_error(self, client):
        # Routen returnerar 400 (inte 409) för duplikatnamn
        payload = {"name": "_TestTyp_Duplikat", "id_prefix": "DUP"}
        client.post("/api/object-types", json=payload)
        resp = client.post("/api/object-types", json=payload)
        assert resp.status_code >= 400
