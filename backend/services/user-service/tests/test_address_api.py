def test_address_lifecycle(client, make_token):
    token = make_token("user-addr-1", role="CUSTOMER")
    headers = {"Authorization": f"Bearer {token}"}

    # 1. Create first address -> automatically becomes default
    addr1_data = {
        "type": "HOME",
        "contactName": "John Doe",
        "contactPhone": "+256701234567",
        "country": "UG",
        "region": "Central",
        "district": "Kampala",
        "addressLine": "Plot 123 Main St",
        "isDefault": False,  # Should still be forced to True because it's first
    }
    resp1 = client.post("/api/v1/addresses", json=addr1_data, headers=headers)
    assert resp1.status_code == 201
    addr1 = resp1.json()["data"]
    assert addr1["isDefault"] is True
    addr1_id = addr1["id"]

    # 2. Create second address with isDefault=True -> demotes addr1
    addr2_data = {
        "type": "WORK",
        "contactName": "John Office",
        "contactPhone": "+256701234567",
        "country": "UG",
        "region": "Central",
        "district": "Kampala",
        "addressLine": "Office Tower 4B",
        "isDefault": True,
    }
    resp2 = client.post("/api/v1/addresses", json=addr2_data, headers=headers)
    assert resp2.status_code == 201
    addr2 = resp2.json()["data"]
    assert addr2["isDefault"] is True
    addr2_id = addr2["id"]

    # Verify addr1 was demoted
    get1 = client.get(f"/api/v1/addresses/{addr1_id}", headers=headers)
    assert get1.json()["data"]["isDefault"] is False

    # 3. List addresses: default comes first
    list_resp = client.get("/api/v1/addresses", headers=headers)
    assert list_resp.status_code == 200
    items = list_resp.json()["data"]
    assert len(items) == 2
    assert items[0]["id"] == addr2_id

    # 4. Set default back to addr1
    set_def = client.post(f"/api/v1/addresses/{addr1_id}/default", headers=headers)
    assert set_def.status_code == 200
    assert set_def.json()["data"]["isDefault"] is True

    # 5. Delete addr1 -> survivor addr2 promoted to default
    del_resp = client.delete(f"/api/v1/addresses/{addr1_id}", headers=headers)
    assert del_resp.status_code == 204

    get2 = client.get(f"/api/v1/addresses/{addr2_id}", headers=headers)
    assert get2.json()["data"]["isDefault"] is True

    # 6. Internal default endpoint
    int_resp = client.get("/api/v1/internal/users/user-addr-1/default-address")
    assert int_resp.status_code == 200
    assert int_resp.json()["data"]["id"] == addr2_id


def test_pickup_station_validation(client, make_token):
    token = make_token("user-addr-2", role="CUSTOMER")
    headers = {"Authorization": f"Bearer {token}"}

    bad_station = {
        "type": "PICKUP_STATION",
        "contactName": "John Doe",
        "contactPhone": "+256701234567",
        "region": "Central",
        "district": "Kampala",
        "addressLine": "Station Name",
        # pickupStationId missing
    }
    resp = client.post("/api/v1/addresses", json=bad_station, headers=headers)
    assert resp.status_code == 400


def test_max_addresses_limit_boundary(client, make_token):
    token = make_token("user-cap-test", role="CUSTOMER")
    headers = {"Authorization": f"Bearer {token}"}

    # Add 20 addresses (the max)
    for i in range(20):
        addr_data = {
            "type": "HOME",
            "contactName": f"Recipient {i}",
            "contactPhone": "+256701234567",
            "region": "Central",
            "district": "Kampala",
            "addressLine": f"Plot {i} Boundary St",
        }
        res = client.post("/api/v1/addresses", json=addr_data, headers=headers)
        assert res.status_code == 201, f"Failed at address {i}: {res.text}"

    # 21st address must be rejected with 400
    overflow_data = {
        "type": "HOME",
        "contactName": "Overflow Recipient",
        "contactPhone": "+256701234567",
        "region": "Central",
        "district": "Kampala",
        "addressLine": "Plot 21 Overflow St",
    }
    overflow_res = client.post("/api/v1/addresses", json=overflow_data, headers=headers)
    assert overflow_res.status_code == 400
    assert "You can save at most 20 addresses" in overflow_res.json()["message"]
