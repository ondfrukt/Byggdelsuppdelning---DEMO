"""
Tester för upprättande av relationer mellan objekt.

Täcker tre API-ytor:

  1. /api/objects/<id>/relations  – objekt-scoped relation (POST/GET)
  2. /api/relations               – fristående relation (POST/GET, DELETE)
  3. /api/relations/batch         – batch-skapande av relationer (POST)
  4. /api/instances               – strukturella förälder/barn-instanser (POST/GET)

Enskilda och batch-scenarion testas separat och inkluderar:
  - Lyckade anrop (201)
  - Partiell framgång (207 med errors-lista)
  - Dubblettskydd (409 / errors i batch)
  - Validering av felaktiga ingångsvärden (400)
  - Direktionsfält och svarstruktur
"""
import pytest

_DATA = {"namn": "Relationstestobjekt"}


# ─── Helpers ──────────────────────────────────────────────────────────────────

def _create_obj(client, simple_object_type):
    """Hjälpfunktion: skapa ett objekt och returnera dess JSON."""
    resp = client.post(
        "/api/objects",
        json={"object_type_id": simple_object_type["id"], "data": _DATA},
    )
    assert resp.status_code == 201, f"Kunde inte skapa testobjekt: {resp.get_json()}"
    return resp.get_json()


# ─── Fixtures ─────────────────────────────────────────────────────────────────

@pytest.fixture(scope="module")
def obj_a(client, simple_object_type):
    """Primärt källobjekt för alla relationstester i modulen."""
    return _create_obj(client, simple_object_type)


@pytest.fixture(scope="module")
def obj_b(client, simple_object_type):
    return _create_obj(client, simple_object_type)


@pytest.fixture(scope="module")
def obj_c(client, simple_object_type):
    return _create_obj(client, simple_object_type)


@pytest.fixture(scope="module")
def obj_d(client, simple_object_type):
    return _create_obj(client, simple_object_type)


# ══════════════════════════════════════════════════════════════════════════════
# 1. ENSKILD RELATION VIA /api/objects/<id>/relations
# ══════════════════════════════════════════════════════════════════════════════

class TestObjectScopedRelation:
    """Tester för POST /api/objects/<id>/relations."""

    def test_create_returns_201(self, client, obj_a, obj_b):
        resp = client.post(
            f"/api/objects/{obj_a['id']}/relations",
            json={"target_object_id": obj_b["id"]},
        )
        assert resp.status_code == 201

    def test_create_returns_relation_id(self, client, obj_a, obj_b):
        # Relationen skapades redan ovan; hämta den via GET
        relations = client.get(f"/api/objects/{obj_a['id']}/relations").get_json()
        assert any(r.get("id") for r in relations)

    def test_create_response_has_required_keys(self, client, simple_object_type):
        """Svarsobjektet ska innehålla source, target och relation_type."""
        x = _create_obj(client, simple_object_type)
        y = _create_obj(client, simple_object_type)
        resp = client.post(
            f"/api/objects/{x['id']}/relations",
            json={"target_object_id": y["id"]},
        )
        data = resp.get_json()
        assert "id" in data
        assert "source_object_id" in data
        assert "target_object_id" in data
        assert "relation_type" in data

    def test_create_with_description(self, client, simple_object_type):
        x = _create_obj(client, simple_object_type)
        y = _create_obj(client, simple_object_type)
        resp = client.post(
            f"/api/objects/{x['id']}/relations",
            json={"target_object_id": y["id"], "description": "Testar beskrivningsfältet"},
        )
        assert resp.status_code == 201
        assert resp.get_json().get("description") == "Testar beskrivningsfältet"

    def test_create_missing_target_returns_400(self, client, obj_a):
        resp = client.post(f"/api/objects/{obj_a['id']}/relations", json={})
        assert resp.status_code == 400

    def test_create_invalid_target_returns_400(self, client, obj_a):
        resp = client.post(
            f"/api/objects/{obj_a['id']}/relations",
            json={"target_object_id": 999999},
        )
        assert resp.status_code == 400

    def test_create_duplicate_returns_409(self, client, simple_object_type):
        x = _create_obj(client, simple_object_type)
        y = _create_obj(client, simple_object_type)
        payload = {"target_object_id": y["id"]}
        r1 = client.post(f"/api/objects/{x['id']}/relations", json=payload)
        assert r1.status_code == 201
        r2 = client.post(f"/api/objects/{x['id']}/relations", json=payload)
        assert r2.status_code == 409

    def test_relation_appears_in_get(self, client, simple_object_type):
        x = _create_obj(client, simple_object_type)
        y = _create_obj(client, simple_object_type)
        client.post(
            f"/api/objects/{x['id']}/relations",
            json={"target_object_id": y["id"]},
        )
        relations = client.get(f"/api/objects/{x['id']}/relations").get_json()
        linked_ids = {r.get("target_object_id") for r in relations} | {r.get("source_object_id") for r in relations}
        assert y["id"] in linked_ids


# ══════════════════════════════════════════════════════════════════════════════
# 2. ENSKILD RELATION VIA /api/relations (fristående endpoint)
# ══════════════════════════════════════════════════════════════════════════════

class TestStandaloneRelationCreate:
    """Tester för POST /api/relations."""

    def test_create_with_source_target_ids(self, client, simple_object_type):
        x = _create_obj(client, simple_object_type)
        y = _create_obj(client, simple_object_type)
        resp = client.post(
            "/api/relations",
            json={"source_object_id": x["id"], "target_object_id": y["id"]},
        )
        assert resp.status_code == 201
        data = resp.get_json()
        assert "id" in data

    def test_create_with_alternative_naming(self, client, simple_object_type):
        """objectA_id / objectB_id ska fungera som alias."""
        x = _create_obj(client, simple_object_type)
        y = _create_obj(client, simple_object_type)
        resp = client.post(
            "/api/relations",
            json={"objectA_id": x["id"], "objectB_id": y["id"]},
        )
        assert resp.status_code == 201

    def test_create_with_description(self, client, simple_object_type):
        x = _create_obj(client, simple_object_type)
        y = _create_obj(client, simple_object_type)
        resp = client.post(
            "/api/relations",
            json={
                "source_object_id": x["id"],
                "target_object_id": y["id"],
                "description": "Fristående relation med beskrivning",
            },
        )
        assert resp.status_code == 201
        assert resp.get_json().get("description") == "Fristående relation med beskrivning"

    def test_create_with_metadata(self, client, simple_object_type):
        x = _create_obj(client, simple_object_type)
        y = _create_obj(client, simple_object_type)
        resp = client.post(
            "/api/relations",
            json={
                "source_object_id": x["id"],
                "target_object_id": y["id"],
                "metadata": {"prioritet": "hög"},
            },
        )
        assert resp.status_code == 201

    def test_self_relation_returns_400(self, client, obj_a):
        resp = client.post(
            "/api/relations",
            json={"source_object_id": obj_a["id"], "target_object_id": obj_a["id"]},
        )
        assert resp.status_code == 400

    def test_missing_source_returns_400(self, client, obj_a):
        resp = client.post("/api/relations", json={"target_object_id": obj_a["id"]})
        assert resp.status_code == 400

    def test_missing_target_returns_400(self, client, obj_a):
        resp = client.post("/api/relations", json={"source_object_id": obj_a["id"]})
        assert resp.status_code == 400

    def test_invalid_source_id_returns_400(self, client, obj_a):
        resp = client.post(
            "/api/relations",
            json={"source_object_id": 999999, "target_object_id": obj_a["id"]},
        )
        assert resp.status_code == 400

    def test_duplicate_returns_409(self, client, simple_object_type):
        x = _create_obj(client, simple_object_type)
        y = _create_obj(client, simple_object_type)
        payload = {"source_object_id": x["id"], "target_object_id": y["id"]}
        r1 = client.post("/api/relations", json=payload)
        assert r1.status_code == 201
        r2 = client.post("/api/relations", json=payload)
        assert r2.status_code == 409


class TestStandaloneRelationList:
    """Tester för GET /api/relations."""

    def test_list_returns_200(self, client):
        assert client.get("/api/relations").status_code == 200

    def test_list_returns_list(self, client):
        assert isinstance(client.get("/api/relations").get_json(), list)

    def test_filter_by_object_id(self, client, simple_object_type):
        x = _create_obj(client, simple_object_type)
        y = _create_obj(client, simple_object_type)
        client.post("/api/relations", json={"source_object_id": x["id"], "target_object_id": y["id"]})

        results = client.get(f"/api/relations?object_id={x['id']}").get_json()
        assert isinstance(results, list)
        assert len(results) >= 1

    def test_filter_adds_direction_field(self, client, simple_object_type):
        x = _create_obj(client, simple_object_type)
        y = _create_obj(client, simple_object_type)
        client.post("/api/relations", json={"source_object_id": x["id"], "target_object_id": y["id"]})

        results = client.get(f"/api/relations?object_id={x['id']}").get_json()
        for r in results:
            assert "direction" in r
            assert r["direction"] in ("outgoing", "incoming")

    def test_outgoing_direction_for_source(self, client, simple_object_type):
        x = _create_obj(client, simple_object_type)
        y = _create_obj(client, simple_object_type)
        client.post("/api/relations", json={"source_object_id": x["id"], "target_object_id": y["id"]})

        results = client.get(f"/api/relations?object_id={x['id']}").get_json()
        own_relation = next(
            (r for r in results if r.get("target_object_id") == y["id"]), None
        )
        assert own_relation is not None
        assert own_relation["direction"] == "outgoing"


class TestStandaloneRelationDelete:
    """Tester för DELETE /api/relations/<id>."""

    def test_delete_returns_200(self, client, simple_object_type):
        x = _create_obj(client, simple_object_type)
        y = _create_obj(client, simple_object_type)
        rel = client.post(
            "/api/relations",
            json={"source_object_id": x["id"], "target_object_id": y["id"]},
        ).get_json()
        resp = client.delete(f"/api/relations/{rel['id']}")
        assert resp.status_code == 200
        assert "message" in resp.get_json()

    def test_delete_removes_relation(self, client, simple_object_type):
        x = _create_obj(client, simple_object_type)
        y = _create_obj(client, simple_object_type)
        rel = client.post(
            "/api/relations",
            json={"source_object_id": x["id"], "target_object_id": y["id"]},
        ).get_json()
        client.delete(f"/api/relations/{rel['id']}")

        # Ska inte längre synas i lista
        results = client.get(f"/api/relations?object_id={x['id']}").get_json()
        assert not any(r["id"] == rel["id"] for r in results)

    def test_delete_nonexistent_returns_error(self, client):
        resp = client.delete("/api/relations/999999")
        assert resp.status_code == 404


# ══════════════════════════════════════════════════════════════════════════════
# 3. BATCH-SKAPANDE VIA /api/relations/batch
# ══════════════════════════════════════════════════════════════════════════════

class TestBatchRelationCreate:
    """
    Tester för POST /api/relations/batch.

    Svarskoder:
      201 – alla relationer i batchen skapades
      207 – delvis framgång (minst ett fel)
      400 – ogiltig förfrågan (sourceId saknas etc.)
    """

    def test_all_succeed_returns_201(self, client, simple_object_type):
        src = _create_obj(client, simple_object_type)
        t1 = _create_obj(client, simple_object_type)
        t2 = _create_obj(client, simple_object_type)

        resp = client.post(
            "/api/relations/batch",
            json={
                "sourceId": src["id"],
                "relations": [
                    {"targetId": t1["id"]},
                    {"targetId": t2["id"]},
                ],
            },
        )
        assert resp.status_code == 201

    def test_all_succeed_response_structure(self, client, simple_object_type):
        src = _create_obj(client, simple_object_type)
        t1 = _create_obj(client, simple_object_type)
        t2 = _create_obj(client, simple_object_type)

        data = client.post(
            "/api/relations/batch",
            json={
                "sourceId": src["id"],
                "relations": [{"targetId": t1["id"]}, {"targetId": t2["id"]}],
            },
        ).get_json()

        assert "sourceId" in data
        assert "created" in data
        assert "errors" in data
        assert "summary" in data

    def test_all_succeed_summary_counts(self, client, simple_object_type):
        src = _create_obj(client, simple_object_type)
        targets = [_create_obj(client, simple_object_type) for _ in range(3)]

        data = client.post(
            "/api/relations/batch",
            json={
                "sourceId": src["id"],
                "relations": [{"targetId": t["id"]} for t in targets],
            },
        ).get_json()

        summary = data["summary"]
        assert summary["requested"] == 3
        assert summary["created"] == 3
        assert summary["failed"] == 0
        assert len(data["created"]) == 3
        assert len(data["errors"]) == 0

    def test_created_relations_have_correct_source(self, client, simple_object_type):
        src = _create_obj(client, simple_object_type)
        t1 = _create_obj(client, simple_object_type)

        data = client.post(
            "/api/relations/batch",
            json={"sourceId": src["id"], "relations": [{"targetId": t1["id"]}]},
        ).get_json()

        for rel in data["created"]:
            # source eller target ska vara src (riktning kan normaliseras)
            assert src["id"] in (rel.get("source_object_id"), rel.get("target_object_id"))

    def test_partial_success_returns_207(self, client, simple_object_type):
        """Om en relation redan finns ska batchen ge 207."""
        src = _create_obj(client, simple_object_type)
        existing = _create_obj(client, simple_object_type)
        fresh = _create_obj(client, simple_object_type)

        # Skapa relationen i förväg
        client.post(
            "/api/relations",
            json={"source_object_id": src["id"], "target_object_id": existing["id"]},
        )

        resp = client.post(
            "/api/relations/batch",
            json={
                "sourceId": src["id"],
                "relations": [
                    {"targetId": existing["id"]},   # finns redan → fel
                    {"targetId": fresh["id"]},       # ny → lyckas
                ],
            },
        )
        assert resp.status_code == 207

    def test_partial_success_summary(self, client, simple_object_type):
        src = _create_obj(client, simple_object_type)
        existing = _create_obj(client, simple_object_type)
        fresh = _create_obj(client, simple_object_type)

        client.post(
            "/api/relations",
            json={"source_object_id": src["id"], "target_object_id": existing["id"]},
        )

        data = client.post(
            "/api/relations/batch",
            json={
                "sourceId": src["id"],
                "relations": [
                    {"targetId": existing["id"]},
                    {"targetId": fresh["id"]},
                ],
            },
        ).get_json()

        assert data["summary"]["requested"] == 2
        assert data["summary"]["created"] == 1
        assert data["summary"]["failed"] == 1
        assert len(data["errors"]) == 1
        assert len(data["created"]) == 1

    def test_error_item_has_index_and_target_id(self, client, simple_object_type):
        src = _create_obj(client, simple_object_type)
        existing = _create_obj(client, simple_object_type)
        fresh = _create_obj(client, simple_object_type)

        client.post(
            "/api/relations",
            json={"source_object_id": src["id"], "target_object_id": existing["id"]},
        )

        data = client.post(
            "/api/relations/batch",
            json={
                "sourceId": src["id"],
                "relations": [{"targetId": existing["id"]}, {"targetId": fresh["id"]}],
            },
        ).get_json()

        err = data["errors"][0]
        assert "index" in err
        assert "error" in err

    def test_within_batch_duplicate_triggers_error(self, client, simple_object_type):
        """Samma target-ID två gånger i en batch – andra ska ge fel."""
        src = _create_obj(client, simple_object_type)
        t1 = _create_obj(client, simple_object_type)

        data = client.post(
            "/api/relations/batch",
            json={
                "sourceId": src["id"],
                "relations": [
                    {"targetId": t1["id"]},   # index 0 – lyckas
                    {"targetId": t1["id"]},   # index 1 – duplikat i batchen
                ],
            },
        ).get_json()

        assert data["summary"]["created"] == 1
        assert data["summary"]["failed"] == 1

    def test_self_relation_in_batch_gives_error(self, client, simple_object_type):
        src = _create_obj(client, simple_object_type)
        fresh = _create_obj(client, simple_object_type)

        data = client.post(
            "/api/relations/batch",
            json={
                "sourceId": src["id"],
                "relations": [
                    {"targetId": src["id"]},   # själv-relation → fel
                    {"targetId": fresh["id"]}, # ok
                ],
            },
        ).get_json()

        assert data["summary"]["failed"] >= 1
        assert any("self" in e["error"].lower() for e in data["errors"])

    def test_nonexistent_target_in_batch_gives_error(self, client, simple_object_type):
        src = _create_obj(client, simple_object_type)
        fresh = _create_obj(client, simple_object_type)

        data = client.post(
            "/api/relations/batch",
            json={
                "sourceId": src["id"],
                "relations": [
                    {"targetId": 999999},       # finns inte
                    {"targetId": fresh["id"]},
                ],
            },
        ).get_json()

        assert data["summary"]["failed"] >= 1

    def test_missing_source_id_returns_400(self, client, obj_b):
        resp = client.post(
            "/api/relations/batch",
            json={"relations": [{"targetId": obj_b["id"]}]},
        )
        assert resp.status_code == 400

    def test_invalid_source_id_returns_400(self, client, obj_b):
        resp = client.post(
            "/api/relations/batch",
            json={"sourceId": 999999, "relations": [{"targetId": obj_b["id"]}]},
        )
        assert resp.status_code == 400

    def test_missing_target_id_in_item_gives_error(self, client, simple_object_type):
        src = _create_obj(client, simple_object_type)
        fresh = _create_obj(client, simple_object_type)

        data = client.post(
            "/api/relations/batch",
            json={
                "sourceId": src["id"],
                "relations": [
                    {},                            # saknar targetId → fel
                    {"targetId": fresh["id"]},
                ],
            },
        ).get_json()

        assert data["summary"]["failed"] >= 1

    def test_all_fail_returns_207(self, client, simple_object_type):
        """Även om alla misslyckas ska svaret vara 207 (inte 400)."""
        src = _create_obj(client, simple_object_type)
        t1 = _create_obj(client, simple_object_type)

        # Skapa relationen i förväg
        client.post(
            "/api/relations",
            json={"source_object_id": src["id"], "target_object_id": t1["id"]},
        )

        resp = client.post(
            "/api/relations/batch",
            json={"sourceId": src["id"], "relations": [{"targetId": t1["id"]}]},
        )
        # API returnerar 207 när det finns errors (oavsett om created är tomt)
        assert resp.status_code == 207
        data = resp.get_json()
        assert data["summary"]["created"] == 0
        assert data["summary"]["failed"] == 1

    def test_empty_relations_list_returns_201(self, client, simple_object_type):
        src = _create_obj(client, simple_object_type)

        resp = client.post(
            "/api/relations/batch",
            json={"sourceId": src["id"], "relations": []},
        )
        # Tom lista: inga relationer skapade, inga fel → 201
        assert resp.status_code == 201
        data = resp.get_json()
        assert data["summary"]["requested"] == 0
        assert data["summary"]["created"] == 0


# ══════════════════════════════════════════════════════════════════════════════
# 4. STRUKTURELLA INSTANSER VIA /api/instances
# ══════════════════════════════════════════════════════════════════════════════

class TestInstanceCreate:
    """
    Tester för POST /api/instances (förälder/barn-kopplingar).

    OBS: ALLOWED_INSTANCE_TYPES = {assembly_to_product, assembly_to_assembly,
    connection_to_product, module_to_assembly, space_to_product,
    space_to_assembly, space_to_module, subsys_to_product, sys_to_subsys}.
    API:t validerar inte att objekttyperna matchar scope-definitionen.
    """

    _VALID_TYPE = "assembly_to_assembly"

    def test_create_returns_201(self, client, obj_c, obj_d):
        resp = client.post(
            "/api/instances",
            json={
                "parent_object_id": obj_c["id"],
                "child_object_id": obj_d["id"],
                "instance_type": self._VALID_TYPE,
            },
        )
        assert resp.status_code == 201

    def test_create_response_has_required_keys(self, client, simple_object_type):
        p = _create_obj(client, simple_object_type)
        c = _create_obj(client, simple_object_type)
        data = client.post(
            "/api/instances",
            json={
                "parent_object_id": p["id"],
                "child_object_id": c["id"],
                "instance_type": self._VALID_TYPE,
            },
        ).get_json()
        assert "id" in data
        assert "parent_object_id" in data
        assert "child_object_id" in data
        assert "instance_type" in data

    def test_create_with_quantity(self, client, simple_object_type):
        p = _create_obj(client, simple_object_type)
        c = _create_obj(client, simple_object_type)
        resp = client.post(
            "/api/instances",
            json={
                "parent_object_id": p["id"],
                "child_object_id": c["id"],
                "instance_type": self._VALID_TYPE,
                "quantity": 5.0,
                "unit": "st",
            },
        )
        assert resp.status_code == 201
        data = resp.get_json()
        assert data["quantity"] == 5.0
        assert data["unit"] == "st"

    def test_create_with_full_metadata(self, client, simple_object_type):
        p = _create_obj(client, simple_object_type)
        c = _create_obj(client, simple_object_type)
        resp = client.post(
            "/api/instances",
            json={
                "parent_object_id": p["id"],
                "child_object_id": c["id"],
                "instance_type": self._VALID_TYPE,
                "quantity": 2.0,
                "unit": "m",
                "waste_factor": 0.1,
                "installation_sequence": 3,
                "optional": True,
                "role": "bärande",
                "position": "vänster",
                "metadata_json": {"färg": "röd"},
            },
        )
        assert resp.status_code == 201
        data = resp.get_json()
        assert data["waste_factor"] == pytest.approx(0.1)
        assert data["installation_sequence"] == 3
        assert data["optional"] is True

    def test_self_instance_returns_400(self, client, obj_c):
        resp = client.post(
            "/api/instances",
            json={
                "parent_object_id": obj_c["id"],
                "child_object_id": obj_c["id"],
                "instance_type": self._VALID_TYPE,
            },
        )
        assert resp.status_code == 400

    def test_invalid_instance_type_returns_400(self, client, obj_c, obj_d):
        resp = client.post(
            "/api/instances",
            json={
                "parent_object_id": obj_c["id"],
                "child_object_id": obj_d["id"],
                "instance_type": "inte_en_giltig_typ",
            },
        )
        assert resp.status_code == 400

    def test_missing_instance_type_returns_400(self, client, obj_c, obj_d):
        resp = client.post(
            "/api/instances",
            json={"parent_object_id": obj_c["id"], "child_object_id": obj_d["id"]},
        )
        assert resp.status_code == 400

    def test_missing_parent_returns_400(self, client, obj_d):
        resp = client.post(
            "/api/instances",
            json={"child_object_id": obj_d["id"], "instance_type": self._VALID_TYPE},
        )
        assert resp.status_code == 400

    def test_invalid_parent_id_returns_400(self, client, obj_d):
        resp = client.post(
            "/api/instances",
            json={
                "parent_object_id": 999999,
                "child_object_id": obj_d["id"],
                "instance_type": self._VALID_TYPE,
            },
        )
        assert resp.status_code == 400

    def test_duplicate_instance_returns_409(self, client, simple_object_type):
        p = _create_obj(client, simple_object_type)
        c = _create_obj(client, simple_object_type)
        payload = {
            "parent_object_id": p["id"],
            "child_object_id": c["id"],
            "instance_type": self._VALID_TYPE,
        }
        r1 = client.post("/api/instances", json=payload)
        assert r1.status_code == 201
        r2 = client.post("/api/instances", json=payload)
        assert r2.status_code == 409

    def test_negative_quantity_returns_400(self, client, simple_object_type):
        p = _create_obj(client, simple_object_type)
        c = _create_obj(client, simple_object_type)
        resp = client.post(
            "/api/instances",
            json={
                "parent_object_id": p["id"],
                "child_object_id": c["id"],
                "instance_type": self._VALID_TYPE,
                "quantity": -1,
            },
        )
        assert resp.status_code == 400

    def test_all_valid_instance_types_accepted(self, client, simple_object_type):
        """Varje värde i ALLOWED_INSTANCE_TYPES ska accepteras av API:t."""
        from utils.instance_types import ALLOWED_INSTANCE_TYPES

        for instance_type in sorted(ALLOWED_INSTANCE_TYPES):
            p = _create_obj(client, simple_object_type)
            c = _create_obj(client, simple_object_type)
            resp = client.post(
                "/api/instances",
                json={
                    "parent_object_id": p["id"],
                    "child_object_id": c["id"],
                    "instance_type": instance_type,
                },
            )
            assert resp.status_code == 201, (
                f"instance_type '{instance_type}' nekades oväntat: {resp.get_json()}"
            )


class TestInstanceList:
    """Tester för GET /api/instances."""

    def test_list_returns_200(self, client):
        assert client.get("/api/instances").status_code == 200

    def test_list_returns_list(self, client):
        assert isinstance(client.get("/api/instances").get_json(), list)

    def test_filter_by_object_id(self, client, simple_object_type):
        p = _create_obj(client, simple_object_type)
        c = _create_obj(client, simple_object_type)
        client.post(
            "/api/instances",
            json={"parent_object_id": p["id"], "child_object_id": c["id"], "instance_type": "assembly_to_assembly"},
        )
        results = client.get(f"/api/instances?object_id={p['id']}").get_json()
        assert isinstance(results, list)
        assert len(results) >= 1

    def test_filter_adds_direction_field(self, client, simple_object_type):
        p = _create_obj(client, simple_object_type)
        c = _create_obj(client, simple_object_type)
        client.post(
            "/api/instances",
            json={"parent_object_id": p["id"], "child_object_id": c["id"], "instance_type": "assembly_to_assembly"},
        )
        results = client.get(f"/api/instances?object_id={p['id']}").get_json()
        for item in results:
            assert "direction" in item
            assert item["direction"] in ("outgoing", "incoming")

    def test_parent_direction_is_outgoing(self, client, simple_object_type):
        p = _create_obj(client, simple_object_type)
        c = _create_obj(client, simple_object_type)
        client.post(
            "/api/instances",
            json={"parent_object_id": p["id"], "child_object_id": c["id"], "instance_type": "assembly_to_assembly"},
        )
        results = client.get(f"/api/instances?object_id={p['id']}").get_json()
        parent_side = [r for r in results if r.get("parent_object_id") == p["id"]]
        assert all(r["direction"] == "outgoing" for r in parent_side)

    def test_child_direction_is_incoming(self, client, simple_object_type):
        p = _create_obj(client, simple_object_type)
        c = _create_obj(client, simple_object_type)
        client.post(
            "/api/instances",
            json={"parent_object_id": p["id"], "child_object_id": c["id"], "instance_type": "assembly_to_assembly"},
        )
        results = client.get(f"/api/instances?object_id={c['id']}").get_json()
        child_side = [r for r in results if r.get("child_object_id") == c["id"]]
        assert all(r["direction"] == "incoming" for r in child_side)
