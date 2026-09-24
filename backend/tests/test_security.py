"""Security hardening tests: admin PIN, rate limiting, image validation, CORS.

IMPORTANT: rate limit buckets are per-IP in-memory (admin=10/min, caricature=5/min).
TestAdminPinAndUpload is ordered so the deliberate 429 burst runs LAST and the real
Plena logo is (re)uploaded before the budget is exhausted.
"""
import io
import os

import pytest
import requests
from dotenv import dotenv_values
from PIL import Image

from conftest import API, BASE_URL  # noqa: F401

ADMIN_PIN = dotenv_values("/app/backend/.env").get("ADMIN_PIN") or os.environ.get("ADMIN_PIN")
PLENA_LOGO = "/app/assets/plena_logo.png"


def _gif_bytes():
    img = Image.new("RGB", (60, 60), (10, 200, 120))
    out = io.BytesIO()
    img.save(out, format="GIF")
    return out.getvalue()


# ---------------- Admin PIN protection + upload validation ----------------
class TestAdminPinAndUpload:
    def test_01_pin_available(self):
        assert ADMIN_PIN, "ADMIN_PIN missing from /app/backend/.env"

    def test_02_delete_logo_without_pin_401(self, api_client):
        r = api_client.delete(f"{API}/settings/logo")
        assert r.status_code == 401, r.text
        assert "PIN" in r.json().get("detail", "")

    def test_03_delete_logo_wrong_pin_401(self, api_client):
        r = api_client.delete(f"{API}/settings/logo", headers={"X-Admin-Pin": "000000"})
        assert r.status_code == 401, r.text

    def test_04_upload_logo_without_pin_401(self, api_client, logo_bytes):
        r = api_client.post(f"{API}/settings/logo", files={"file": ("l.png", logo_bytes, "image/png")})
        assert r.status_code == 401, r.text

    def test_05_upload_spoofed_content_type_rejected(self, api_client):
        payload = b"<script>alert(1)</script>" * 20
        r = api_client.post(
            f"{API}/settings/logo",
            headers={"X-Admin-Pin": ADMIN_PIN},
            files={"file": ("evil.png", payload, "image/png")},
        )
        assert r.status_code == 400, r.text
        assert r.json()["detail"] == "Geçersiz görsel dosyası"

    def test_06_real_gif_rejected(self, api_client):
        r = api_client.post(
            f"{API}/settings/logo",
            headers={"X-Admin-Pin": ADMIN_PIN},
            files={"file": ("a.gif", _gif_bytes(), "image/png")},
        )
        assert r.status_code == 400, r.text
        assert "PNG" in r.json()["detail"]

    def test_07_upload_real_plena_logo_with_correct_pin(self, api_client):
        with open(PLENA_LOGO, "rb") as f:
            data = f.read()
        r = api_client.post(
            f"{API}/settings/logo",
            headers={"X-Admin-Pin": ADMIN_PIN},
            files={"file": ("plena_logo.png", data, "image/png")},
        )
        assert r.status_code == 200, r.text
        assert r.json() == {"ok": True}
        # verify persistence
        s = api_client.get(f"{API}/settings/logo")
        assert s.status_code == 200 and s.json()["exists"] == True
        img = api_client.get(f"{API}/logo-image")
        assert img.status_code == 200
        assert img.headers["content-type"].startswith("image/")
        assert len(img.content) == len(data)
        assert Image.open(io.BytesIO(img.content)).format == "PNG"

    def test_08_admin_rate_limit_429(self, api_client):
        """Runs LAST: burns remaining admin budget until 429."""
        statuses = []
        got_429 = False
        for _ in range(14):
            r = api_client.delete(f"{API}/settings/logo", headers={"X-Admin-Pin": "000000"})
            statuses.append(r.status_code)
            if r.status_code == 429:
                got_429 = True
                assert "Çok fazla istek" in r.json()["detail"]
                break
        assert got_429, f"no 429 after burst; statuses={statuses}"
        assert statuses.count(401) <= 10, statuses


# ---------------- Caricature rate limiting (no LLM spend) ----------------
class TestCaricatureRateLimit:
    def test_invalid_body_then_429(self, api_client):
        statuses = []
        for _ in range(9):
            r = api_client.post(f"{API}/caricature", json={"image_base64": "!!notb64!!"})
            statuses.append(r.status_code)
            if r.status_code == 429:
                break
        assert 429 in statuses, f"no 429 from caricature bucket; statuses={statuses}"
        first = statuses[: statuses.index(429)]
        assert all(s == 400 for s in first), statuses
        assert len(first) <= 5, statuses


# ---------------- CORS ----------------
class TestCors:
    def test_preflight_allows_admin_pin_no_credentials(self):
        # NOTE: the preview edge proxy (cloudflare/ingress) rewrites CORS headers to
        # `*` / GET,POST,PUT,DELETE,OPTIONS,HEAD,PATCH on the public URL, so the app's
        # own CORS config can only be asserted against the app directly.
        r = requests.options(
            "http://localhost:8001/api/settings/logo",
            headers={
                "Origin": "https://example.com",
                "Access-Control-Request-Method": "POST",
                "Access-Control-Request-Headers": "X-Admin-Pin, Content-Type",
            },
            timeout=30,
        )
        assert r.status_code in (200, 204), r.text
        allow_headers = r.headers.get("access-control-allow-headers", "").lower()
        assert "x-admin-pin" in allow_headers
        allow_methods = r.headers.get("access-control-allow-methods", "").upper()
        assert "POST" in allow_methods
        assert "PUT" not in allow_methods and "PATCH" not in allow_methods
        assert "access-control-allow-credentials" not in {k.lower() for k in r.headers}


# ---------------- Free regression ----------------
class TestRegression:
    def test_root(self, api_client):
        r = api_client.get(f"{API}/")
        assert r.status_code == 200
        assert r.json()["message"] == "KarikaBooth API"

    def test_logo_status_and_image(self, api_client):
        r = api_client.get(f"{API}/settings/logo")
        assert r.status_code == 200
        assert r.json()["exists"] == True
        img = api_client.get(f"{API}/logo-image")
        assert img.status_code == 200 and len(img.content) > 1000

    def test_creations_and_image(self, api_client):
        r = api_client.get(f"{API}/creations")
        assert r.status_code == 200
        items = r.json()
        assert isinstance(items, list)
        if not items:
            pytest.skip("no creations seeded")
        first = items[0]
        assert set(first.keys()) == {"id", "created_at"}
        img = api_client.get(f"{API}/images/{first['id']}")
        assert img.status_code == 200
        assert img.headers["content-type"] == "image/jpeg"

    def test_image_404(self, api_client):
        r = api_client.get(f"{API}/images/does-not-exist-xyz")
        assert r.status_code == 404
