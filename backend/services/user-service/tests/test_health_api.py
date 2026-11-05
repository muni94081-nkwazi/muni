def test_health_endpoints(client):
    live = client.get("/health/live")
    assert live.status_code == 200
    assert live.json()["status"] == "up"
    assert live.json()["service"] == "user-service"

    ready = client.get("/health/ready")
    assert ready.status_code == 200
    assert ready.json()["ready"] is True
    assert ready.json()["db"] == "up"

    plain = client.get("/health")
    assert plain.status_code == 200
    assert plain.json()["status"] == "ok"


def test_unmatched_route_404_compatibility(client):
    # Test GET on unknown path
    resp_get = client.get("/api/v1/unknown-route")
    assert resp_get.status_code == 404
    body = resp_get.json()
    assert body["success"] is False
    assert body["message"] == "Route not found: GET /api/v1/unknown-route"

    # Test POST on unknown path
    resp_post = client.post("/random/nonexistent")
    assert resp_post.status_code == 404
    body_post = resp_post.json()
    assert body_post["success"] is False
    assert body_post["message"] == "Route not found: POST /random/nonexistent"
