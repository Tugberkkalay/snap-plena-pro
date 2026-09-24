"""Login gate auth tests: /api/auth/verify-gesture (VLM) and /api/auth/verify-pin.

Budget-aware: at most 2 real Gemini VLM calls in this module.
"""
import base64
import os
import time

import pytest
import requests
from dotenv import dotenv_values

frontend_env = dotenv_values("/app/frontend/.env")
base_url = os.environ.get("REACT_APP_BACKEND_URL") or frontend_env.get("REACT_APP_BACKEND_URL")
if not base_url:
    raise RuntimeError("REACT_APP_BACKEND_URL missing")
BASE_URL = base_url.rstrip("/")
API = f"{BASE_URL}/api"
ADMIN_PIN = "574913"

L_SIGN = "/app/assets/l_sign_test.jpg"
LOGO = "/app/assets/plena_logo.png"


def b64(path):
    with open(path, "rb") as f:
        return base64.b64encode(f.read()).decode()


@pytest.fixture(scope="module")
def client():
    s = requests.Session()
    return s


# --- verify-gesture: validation path (no VLM cost) ---
class TestVerifyGestureValidation:
    def test_invalid_base64_returns_400(self, client):
        r = client.post(f"{API}/auth/verify-gesture", json={"image_base64": "!!!not-base64!!!"}, timeout=30)
        assert r.status_code == 400, r.text
        assert "detail" in r.json()

    def test_non_image_base64_returns_400(self, client):
        payload = base64.b64encode(b"this is plain text, not an image").decode()
        r = client.post(f"{API}/auth/verify-gesture", json={"image_base64": payload}, timeout=30)
        assert r.status_code == 400, r.text

    def test_missing_field_returns_422(self, client):
        r = client.post(f"{API}/auth/verify-gesture", json={}, timeout=30)
        assert r.status_code == 422, r.text


# --- verify-gesture: real VLM (2 calls max) ---
class TestVerifyGestureVLM:
    def test_l_sign_image_unlocks(self, client):
        r = client.post(f"{API}/auth/verify-gesture", json={"image_base64": b64(L_SIGN)}, timeout=120)
        assert r.status_code == 200, r.text
        data = r.json()
        assert isinstance(data.get("ok"), bool)
        assert data["ok"] == True, f"L-sign photo should be accepted, got {data}"

    def test_no_hand_image_rejected(self, client):
        r = client.post(f"{API}/auth/verify-gesture", json={"image_base64": b64(LOGO)}, timeout=120)
        assert r.status_code == 200, r.text
        data = r.json()
        assert data.get("ok") == False, f"Logo image should be rejected, got {data}"


# --- verify-pin (shares 'admin' rate bucket 10/min -> paced) ---
class TestVerifyPin:
    def test_no_header_401(self, client):
        r = client.post(f"{API}/auth/verify-pin", timeout=30)
        assert r.status_code == 401, r.text

    def test_wrong_pin_401(self, client):
        time.sleep(1)
        r = client.post(f"{API}/auth/verify-pin", headers={"X-Admin-Pin": "111111"}, timeout=30)
        assert r.status_code == 401, r.text

    def test_correct_pin_200(self, client):
        time.sleep(1)
        r = client.post(f"{API}/auth/verify-pin", headers={"X-Admin-Pin": ADMIN_PIN}, timeout=30)
        assert r.status_code == 200, r.text
        assert r.json() == {"ok": True}
