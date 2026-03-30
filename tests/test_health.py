"""
Grundläggande systemkontroller – health-endpoint och startsida.
"""


def test_health_returns_ok(client):
    resp = client.get("/health")
    assert resp.status_code == 200
    data = resp.get_json()
    assert data["status"] == "healthy"


def test_index_renders(client):
    resp = client.get("/")
    assert resp.status_code == 200
    # Innehåller HTML
    assert b"<html" in resp.data.lower() or b"<!doctype" in resp.data.lower()


def test_unknown_route_returns_404(client):
    resp = client.get("/api/finns-inte")
    assert resp.status_code == 404
