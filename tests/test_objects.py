"""
Tester för objekt-API:t (/api/objects).

Täcker: lista, hämta enskilt, skapa, uppdatera, paginering,
filtrering på typ samt versionering (main_id + version).

OBS: Alla objekttyper får automatiskt ett obligatoriskt `namn`-fält.
Skapa-anrop måste därför alltid inkludera `data: {"namn": "..."}`.
`simple_object_type` (skapad i conftest.py) används i skriv-tester;
`first_object_type` (seedad Assembly-typ) används i read-tester.
"""

_REQUIRED_DATA = {"namn": "Testobjekt"}


class TestListObjects:
    def test_returns_200(self, client):
        assert client.get("/api/objects").status_code == 200

    def test_returns_list(self, client):
        assert isinstance(client.get("/api/objects").get_json(), list)

    def test_seeded_objects_present(self, client):
        assert len(client.get("/api/objects").get_json()) >= 1

    def test_each_object_has_required_keys(self, client):
        for obj in client.get("/api/objects").get_json()[:5]:
            assert "id" in obj
            assert "id_full" in obj
            assert "object_type" in obj

    def test_filter_by_type(self, client, first_object_type):
        type_name = first_object_type["name"]
        resp = client.get(f"/api/objects?type={type_name}")
        assert resp.status_code == 200
        for obj in resp.get_json():
            assert obj["object_type"]["name"] == type_name

    def test_pagination_returns_items_key(self, client):
        resp = client.get("/api/objects?page=1&per_page=5")
        assert resp.status_code == 200
        data = resp.get_json()
        assert "items" in data
        assert "total" in data
        assert len(data["items"]) <= 5

    def test_minimal_flag(self, client):
        resp = client.get("/api/objects?minimal=true")
        assert resp.status_code == 200
        assert isinstance(resp.get_json(), list)

    def test_search_filter(self, client):
        resp = client.get("/api/objects?search=test")
        assert resp.status_code == 200
        assert isinstance(resp.get_json(), list)


class TestGetObject:
    def test_returns_200_for_existing(self, client, first_object):
        assert client.get(f"/api/objects/{first_object['id']}").status_code == 200

    def test_returns_correct_id(self, client, first_object):
        data = client.get(f"/api/objects/{first_object['id']}").get_json()
        assert data["id"] == first_object["id"]

    def test_returns_data_dict(self, client, first_object):
        assert "data" in client.get(f"/api/objects/{first_object['id']}").get_json()

    def test_returns_error_for_nonexistent(self, client):
        assert client.get("/api/objects/999999").status_code == 404


class TestCreateObject:
    def test_create_minimal(self, client, simple_object_type):
        resp = client.post(
            "/api/objects",
            json={"object_type_id": simple_object_type["id"], "data": _REQUIRED_DATA},
        )
        assert resp.status_code == 201
        data = resp.get_json()
        assert "id" in data
        assert "id_full" in data

    def test_create_sets_default_status(self, client, simple_object_type):
        resp = client.post(
            "/api/objects",
            json={"object_type_id": simple_object_type["id"], "data": _REQUIRED_DATA},
        )
        assert resp.get_json()["status"] == "In work"

    def test_create_with_custom_status(self, client, simple_object_type):
        resp = client.post(
            "/api/objects",
            json={
                "object_type_id": simple_object_type["id"],
                "status": "Released",
                "data": _REQUIRED_DATA,
            },
        )
        assert resp.status_code == 201
        assert resp.get_json()["status"] == "Released"

    def test_create_without_type_id_returns_400(self, client):
        assert client.post("/api/objects", json={"data": {}}).status_code == 400

    def test_create_with_invalid_type_id_returns_400(self, client):
        assert client.post("/api/objects", json={"object_type_id": 999999}).status_code == 400

    def test_duplicate_id_full_returns_409(self, client, simple_object_type):
        prefix = simple_object_type.get("id_prefix", "X")
        payload = {
            "object_type_id": simple_object_type["id"],
            "main_id": f"{prefix}-DUPTEST",
            "version": "v1",
            "data": _REQUIRED_DATA,
        }
        client.post("/api/objects", json=payload)
        resp = client.post("/api/objects", json=payload)
        assert resp.status_code == 409


class TestVersioning:
    """Testar att versioneringslogiken (main_id + version → id_full) fungerar."""

    def test_new_object_gets_version_v1(self, client, simple_object_type):
        resp = client.post(
            "/api/objects",
            json={"object_type_id": simple_object_type["id"], "data": _REQUIRED_DATA},
        )
        data = resp.get_json()
        assert data["version"] == "v1"
        assert data["id_full"].endswith(".v1")

    def test_explicit_version_is_respected(self, client, simple_object_type):
        prefix = simple_object_type.get("id_prefix", "X")
        resp = client.post(
            "/api/objects",
            json={
                "object_type_id": simple_object_type["id"],
                "main_id": f"{prefix}-VERTEST",
                "version": "v1",
                "data": _REQUIRED_DATA,
            },
        )
        assert resp.status_code == 201
        assert resp.get_json()["id_full"] == f"{prefix}-VERTEST.v1"

    def test_second_version_increments(self, client, simple_object_type):
        prefix = simple_object_type.get("id_prefix", "X")
        base = f"{prefix}-V2TEST"
        r1 = client.post(
            "/api/objects",
            json={
                "object_type_id": simple_object_type["id"],
                "main_id": base,
                "version": "v1",
                "data": _REQUIRED_DATA,
            },
        )
        assert r1.status_code == 201

        r2 = client.post(
            "/api/objects",
            json={"object_type_id": simple_object_type["id"], "main_id": base, "data": _REQUIRED_DATA},
        )
        assert r2.status_code == 201
        assert r2.get_json()["version"] == "v2"


class TestUpdateObject:
    def test_update_status(self, client, simple_object_type):
        create_resp = client.post(
            "/api/objects",
            json={"object_type_id": simple_object_type["id"], "data": _REQUIRED_DATA},
        )
        obj_id = create_resp.get_json()["id"]
        # PUT validerar alltid obligatoriska fält – skicka med data även vid statusbyte
        resp = client.put(
            f"/api/objects/{obj_id}",
            json={"status": "Released", "data": _REQUIRED_DATA},
        )
        assert resp.status_code == 200
        assert resp.get_json()["status"] == "Released"

    def test_update_nonexistent_returns_error(self, client):
        assert client.put("/api/objects/999999", json={"status": "Released"}).status_code == 404
