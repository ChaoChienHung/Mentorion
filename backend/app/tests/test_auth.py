import pytest
from fastapi.testclient import TestClient
from backend.app.main import app

@pytest.fixture
def client():
    with TestClient(app) as c:
        yield c

def test_register_user(client):
    response = client.post(
        "/api/v1/auth/register",
        json={"username": "testuser", "email": "test@example.com", "password": "securepassword"}
    )
    assert response.status_code == 201, response.text
    data = response.json()
    assert data["email"] == "test@example.com"
    assert "id" in data

    # Test duplicate registration
    response_dup = client.post(
        "/api/v1/auth/register",
        json={"username": "testuser", "email": "test@example.com", "password": "securepassword"}
    )
    assert response_dup.status_code == 400

def test_login_user(client):
    # First register
    client.post(
        "/api/v1/auth/register",
        json={"username": "loginuser", "email": "login@example.com", "password": "mypassword"}
    )
    
    # Then login by email
    response = client.post(
        "/api/v1/auth/login",
        data={"username": "login@example.com", "password": "mypassword"}
    )
    assert response.status_code == 200, response.text
    data = response.json()
    assert "access_token" in data
    assert data["token_type"] == "bearer"
    
    # Also test login by username
    response_username = client.post(
        "/api/v1/auth/login",
        data={"username": "loginuser", "password": "mypassword"}
    )
    assert response_username.status_code == 200, response_username.text
    assert "access_token" in response_username.json()

def test_test_token(client):
    # Register and login
    client.post(
        "/api/v1/auth/register",
        json={"username": "tokenuser", "email": "token@example.com", "password": "mypassword"}
    )
    login_response = client.post(
        "/api/v1/auth/login",
        data={"username": "token@example.com", "password": "mypassword"}
    )
    token = login_response.json()["access_token"]
    
    headers = {"Authorization": f"Bearer {token}"}
    response = client.post("/api/v1/auth/test-token", headers=headers)
    assert response.status_code == 200, response.text
    assert response.json()["email"] == "token@example.com"
