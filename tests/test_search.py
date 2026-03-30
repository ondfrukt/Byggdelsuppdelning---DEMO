"""
Tester för sökning och statistik (/api/search, /api/stats).
"""


class TestSearch:
    def test_search_returns_200(self, client):
        resp = client.get("/api/search?q=a")
        assert resp.status_code == 200

    def test_search_returns_list(self, client):
        resp = client.get("/api/search?q=a")
        assert isinstance(resp.get_json(), list)

    def test_empty_query_returns_list(self, client):
        # Tom söksträng ska returnera lista (kan vara tom eller alla objekt)
        resp = client.get("/api/search?q=")
        assert resp.status_code == 200
        assert isinstance(resp.get_json(), list)

    def test_search_result_has_expected_keys(self, client):
        resp = client.get("/api/search?q=a")
        results = resp.get_json()
        for obj in results[:3]:
            assert "id" in obj
            assert "id_full" in obj

    def test_filter_by_type(self, client, first_object_type):
        type_name = first_object_type["name"]
        resp = client.get(f"/api/search?q=&type={type_name}")
        assert resp.status_code == 200
        for obj in resp.get_json():
            assert obj["object_type"]["name"] == type_name


class TestStats:
    def test_stats_returns_200(self, client):
        resp = client.get("/api/stats")
        assert resp.status_code == 200

    def test_stats_has_object_count(self, client):
        data = client.get("/api/stats").get_json()
        # Ska innehålla något mått på antal objekt
        assert any(
            key in data for key in ("total_objects", "objects", "object_count")
        ), f"Stats saknar objektantal, fick: {list(data.keys())}"
