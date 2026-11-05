from app.models.user import User, Role


def test_user_profile_and_preferences(client, db, make_token):
    user = User(
        id="user-profile-1",
        firstName="Grace",
        lastName="Hopper",
        email="grace@example.ug",
        passwordHash="hashed",
        role=Role.CUSTOMER,
    )
    db.add(user)
    db.commit()

    token = make_token("user-profile-1", role="CUSTOMER")
    headers = {"Authorization": f"Bearer {token}"}

    # 1. Get /me
    me_resp = client.get("/api/v1/users/me", headers=headers)
    assert me_resp.status_code == 200
    assert me_resp.json()["data"]["firstName"] == "Grace"

    # 2. Update /me
    patch_resp = client.patch(
        "/api/v1/users/me",
        json={"firstName": "Amazing Grace"},
        headers=headers,
    )
    assert patch_resp.status_code == 200
    assert patch_resp.json()["data"]["firstName"] == "Amazing Grace"

    # 3. Preferences upsert and fetch
    pref_resp = client.get("/api/v1/users/me/preferences", headers=headers)
    assert pref_resp.status_code == 200
    assert pref_resp.json()["data"]["timezone"] == "Africa/Kampala"

    # 4. Update preferences with quiet hours
    update_pref = client.patch(
        "/api/v1/users/me/preferences",
        json={
            "whatsappOptIn": True,
            "quietHoursStart": 22,
            "quietHoursEnd": 7,
        },
        headers=headers,
    )
    assert update_pref.status_code == 200
    assert update_pref.json()["data"]["whatsappOptIn"] is True

    # 5. Invalid quiet hours (only one provided) -> 400
    bad_pref = client.patch(
        "/api/v1/users/me/preferences",
        json={"quietHoursStart": 22},
        headers=headers,
    )
    assert bad_pref.status_code == 400

    # 6. Contact profile lookup
    contact_resp = client.get("/api/v1/users/user-profile-1/contact-profile")
    assert contact_resp.status_code == 200
    data = contact_resp.json()["data"]
    assert data["firstName"] == "Amazing Grace"
    assert data["preferences"]["whatsappOptIn"] is True
