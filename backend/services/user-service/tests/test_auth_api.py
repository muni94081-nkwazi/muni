def test_register_success(client):
    payload = {
        "firstName": "John",
        "lastName": "Doe",
        "email": "john.doe@example.ug",
        "phoneNumber": "+256701234567",
        "password": "Password123",
    }
    resp = client.post("/api/v1/auth/register", json=payload)
    assert resp.status_code == 201
    body = resp.json()
    assert body["success"] is True
    assert body["data"]["user"]["email"] == "john.doe@example.ug"
    assert "passwordHash" not in body["data"]["user"]
    assert body["data"]["accessToken"] is not None
    assert body["data"]["refreshToken"] is not None


def test_register_duplicate_email(client):
    payload = {
        "firstName": "Alice",
        "lastName": "Smith",
        "email": "alice@example.ug",
        "password": "Password123",
    }
    resp1 = client.post("/api/v1/auth/register", json=payload)
    assert resp1.status_code == 201

    resp2 = client.post("/api/v1/auth/register", json=payload)
    assert resp2.status_code == 409
    assert resp2.json()["message"] == "An account with this email already exists"


def test_register_duplicate_phone(client):
    payload1 = {
        "firstName": "Bob",
        "lastName": "One",
        "email": "bob1@example.ug",
        "phoneNumber": "+256781234567",
        "password": "Password123",
    }
    client.post("/api/v1/auth/register", json=payload1)

    payload2 = {
        "firstName": "Bob",
        "lastName": "Two",
        "email": "bob2@example.ug",
        "phoneNumber": "+256781234567",
        "password": "Password123",
    }
    resp = client.post("/api/v1/auth/register", json=payload2)
    assert resp.status_code == 409
    assert resp.json()["message"] == "An account with this phone number already exists"


def test_register_validation_failure(client):
    payload = {
        "firstName": "Bad",
        "lastName": "User",
        "email": "bad@example.ug",
        "phoneNumber": "not-a-phone",
        "password": "weak",
    }
    resp = client.post("/api/v1/auth/register", json=payload)
    assert resp.status_code == 400
    assert resp.json()["message"] == "Validation failed"


def test_login_flow(client):
    reg = {
        "firstName": "Charlie",
        "lastName": "Brown",
        "email": "charlie@example.ug",
        "password": "Password123",
    }
    client.post("/api/v1/auth/register", json=reg)

    # Valid login
    login_resp = client.post("/api/v1/auth/login", json={"email": "charlie@example.ug", "password": "Password123"})
    assert login_resp.status_code == 200
    data = login_resp.json()["data"]
    assert data["accessToken"] is not None

    # Invalid password
    bad_login = client.post("/api/v1/auth/login", json={"email": "charlie@example.ug", "password": "WrongPassword"})
    assert bad_login.status_code == 401
    assert bad_login.json()["message"] == "Invalid email or password"


def test_refresh_token_rotation(client):
    reg = {
        "firstName": "Dave",
        "lastName": "Miller",
        "email": "dave@example.ug",
        "password": "Password123",
    }
    reg_resp = client.post("/api/v1/auth/register", json=reg)
    refresh_token = reg_resp.json()["data"]["refreshToken"]

    ref_resp = client.post("/api/v1/auth/refresh", json={"refreshToken": refresh_token})
    assert ref_resp.status_code == 200
    new_refresh_token = ref_resp.json()["data"]["refreshToken"]
    assert new_refresh_token != refresh_token

    # Reusing old revoked refresh token should fail with 401
    reuse_resp = client.post("/api/v1/auth/refresh", json={"refreshToken": refresh_token})
    assert reuse_resp.status_code == 401


def test_logout(client):
    reg = {
        "firstName": "Eve",
        "lastName": "Online",
        "email": "eve@example.ug",
        "password": "Password123",
    }
    reg_resp = client.post("/api/v1/auth/register", json=reg)
    refresh_token = reg_resp.json()["data"]["refreshToken"]

    logout_resp = client.post("/api/v1/auth/logout", json={"refreshToken": refresh_token})
    assert logout_resp.status_code == 200

    # Token now revoked
    ref_resp = client.post("/api/v1/auth/refresh", json={"refreshToken": refresh_token})
    assert ref_resp.status_code == 401


def test_forgot_and_reset_password_endpoints(client, db):
    from app.models.tokens import PasswordResetToken
    from app.core.security import hash_opaque_token

    reg = {
        "firstName": "Grace",
        "lastName": "Hopper",
        "email": "grace.forgot@example.ug",
        "password": "Password123",
    }
    client.post("/api/v1/auth/register", json=reg)

    # 1. Forgot password request
    forgot_resp = client.post("/api/v1/auth/forgot-password", json={"email": "grace.forgot@example.ug"})
    assert forgot_resp.status_code == 200
    assert forgot_resp.json()["message"] == "If an account exists for this email, password reset instructions have been sent."

    # Unknown email returns exact same message (prevent account enumeration)
    unknown_resp = client.post("/api/v1/auth/forgot-password", json={"email": "unknown@example.ug"})
    assert unknown_resp.status_code == 200
    assert unknown_resp.json()["message"] == "If an account exists for this email, password reset instructions have been sent."

    # Look up the created token record
    reset_record = db.query(PasswordResetToken).order_by(PasswordResetToken.createdAt.desc()).first()
    assert reset_record is not None
    assert reset_record.usedAt is None

    # Find the raw token from DB test helper: for testing, let's create a known raw token
    from app.core.security import generate_opaque_token
    from datetime import datetime, timezone, timedelta
    raw, token_hash = generate_opaque_token()
    test_rec = PasswordResetToken(
        userId=reset_record.userId,
        tokenHash=token_hash,
        expiresAt=datetime.now(timezone.utc) + timedelta(minutes=30),
    )
    db.add(test_rec)
    db.commit()

    # 2. Reset password using the valid raw token
    reset_resp = client.post("/api/v1/auth/reset-password", json={"token": raw, "newPassword": "NewPassword456"})
    assert reset_resp.status_code == 200
    assert reset_resp.json()["message"] == "Password has been reset"

    # Old password no longer works
    old_login = client.post("/api/v1/auth/login", json={"email": "grace.forgot@example.ug", "password": "Password123"})
    assert old_login.status_code == 401

    # New password works
    new_login = client.post("/api/v1/auth/login", json={"email": "grace.forgot@example.ug", "password": "NewPassword456"})
    assert new_login.status_code == 200

    # Reusing the reset token fails
    reuse_resp = client.post("/api/v1/auth/reset-password", json={"token": raw, "newPassword": "AnotherPassword789"})
    assert reuse_resp.status_code == 400
    assert reuse_resp.json()["message"] == "This reset link is invalid or has expired"


def test_validation_error_message_normalization(client):
    # Test missing required fields
    resp = client.post("/api/v1/auth/register", json={})
    assert resp.status_code == 400
    body = resp.json()
    assert body["success"] is False
    assert body["message"] == "Validation failed"
    details = {d["field"]: d["message"] for d in body["details"]}

    # Ensure no "Value error, " prefix exists
    for msg in details.values():
        assert not msg.startswith("Value error")

    assert details.get("firstName") == "First name is required"
    assert details.get("lastName") == "Last name is required"
    assert details.get("email") == "Enter a valid email address"
    assert details.get("password") == "Password is required"

    # Test invalid format custom validator
    bad_phone_resp = client.post("/api/v1/auth/register", json={
        "firstName": "Valid",
        "lastName": "User",
        "email": "valid@example.ug",
        "phoneNumber": "12345",
        "password": "Password123",
    })
    assert bad_phone_resp.status_code == 400
    phone_details = {d["field"]: d["message"] for d in bad_phone_resp.json()["details"]}
    assert phone_details.get("phoneNumber") == "Enter a valid Ugandan phone number"
