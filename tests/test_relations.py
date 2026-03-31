"""
Tester för relationer mellan objekt (/api/objects/{id}/relations).

Täcker: lista relationer, skapa relation, dubblettskydd.
OBS: Alla objekt kräver `data: {"namn": "..."}` pga automatiskt namn-fält.
"""
import pytest

_REQUIRED_DATA = {"namn": "Relationstestobjekt"}


@pytest.fixture(scope="module")
def two_objects(client, simple_object_type):
    """Skapar två objekt att använda för relationstester."""
    payload = {"object_type_id": simple_object_type["id"], "data": _REQUIRED_DATA}
    r1 = client.post("/api/objects", json=payload)
    r2 = client.post("/api/objects", json=payload)
    assert r1.status_code == 201, f"Kunde inte skapa obj1: {r1.get_json()}"
    assert r2.status_code == 201, f"Kunde inte skapa obj2: {r2.get_json()}"
    return r1.get_json(), r2.get_json()


class TestGetRelations:
    def test_returns_200(self, client, first_object):
        assert client.get(f"/api/objects/{first_object['id']}/relations").status_code == 200

    def test_returns_list(self, client, first_object):
        assert isinstance(
            client.get(f"/api/objects/{first_object['id']}/relations").get_json(), list
        )

    def test_returns_error_for_nonexistent_object(self, client):
        assert client.get("/api/objects/999999/relations").status_code == 404


class TestCreateRelation:
    def test_create_relation_between_two_objects(self, client, two_objects):
        src, tgt = two_objects
        resp = client.post(
            f"/api/objects/{src['id']}/relations",
            json={"target_object_id": tgt["id"]},
        )
        assert resp.status_code == 201
        assert "id" in resp.get_json()

    def test_relation_appears_in_list(self, client, two_objects):
        src, tgt = two_objects
        relations = client.get(f"/api/objects/{src['id']}/relations").get_json()
        all_ids = set()
        for r in relations:
            all_ids.add(r.get("source_object_id"))
            all_ids.add(r.get("target_object_id"))
        assert tgt["id"] in all_ids

    def test_missing_target_returns_400(self, client, two_objects):
        src, _ = two_objects
        assert client.post(f"/api/objects/{src['id']}/relations", json={}).status_code == 400

    def test_invalid_target_returns_400(self, client, two_objects):
        src, _ = two_objects
        resp = client.post(
            f"/api/objects/{src['id']}/relations",
            json={"target_object_id": 999999},
        )
        assert resp.status_code == 400

    def test_duplicate_relation_returns_409(self, client, simple_object_type):
        """Samma par objekt ska inte kunna ha duplicerade relationer av samma typ."""
        payload = {"object_type_id": simple_object_type["id"], "data": _REQUIRED_DATA}
        r1 = client.post("/api/objects", json=payload)
        r2 = client.post("/api/objects", json=payload)
        assert r1.status_code == 201
        assert r2.status_code == 201
        src_id = r1.get_json()["id"]
        tgt_id = r2.get_json()["id"]

        rel_payload = {"target_object_id": tgt_id}
        first = client.post(f"/api/objects/{src_id}/relations", json=rel_payload)
        assert first.status_code == 201
        second = client.post(f"/api/objects/{src_id}/relations", json=rel_payload)
        assert second.status_code == 409
