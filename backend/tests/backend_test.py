"""KarikaBooth backend API tests.

All tests live in one class so pytest-xdist loadscope pins them to a single worker
(shared server-side state: event logo + creations) and they execute in definition order.
Real Gemini caricature generation is expensive/slow -> limited to 2 calls (module-scoped).
"""
import base64
import io

import pytest
from PIL import Image

from conftest import API, make_logo_png


@pytest.fixture(scope="module")
def state():
    return {}


class TestKarikaBooth:
    # ---------- root ----------
    def test_root(self, api_client):
        r = api_client.get(f"{API}/", timeout=30)
        assert r.status_code == 200, r.text[:300]
        assert r.json() == {"message": "KarikaBooth API"}

    # ---------- event logo settings ----------
    def test_upload_event_logo(self, api_client, logo_bytes):
        r = api_client.post(
            f"{API}/settings/logo",
            files={"file": ("TEST_logo.png", logo_bytes, "image/png")},
            timeout=90,
        )
        assert r.status_code == 200, r.text[:300]
        assert r.json().get("ok") is True

    def test_logo_status_exists(self, api_client):
        r = api_client.get(f"{API}/settings/logo", timeout=30)
        assert r.status_code == 200
        assert r.json() == {"exists": True}

    def test_logo_image_served(self, api_client, logo_bytes):
        r = api_client.get(f"{API}/logo-image", timeout=60)
        assert r.status_code == 200
        assert r.headers["Content-Type"].startswith("image/")
        img = Image.open(io.BytesIO(r.content))
        assert img.size == Image.open(io.BytesIO(logo_bytes)).size

    def test_upload_non_image_rejected(self, api_client):
        r = api_client.post(
            f"{API}/settings/logo",
            files={"file": ("TEST_bad.txt", b"not-an-image", "text/plain")},
            timeout=60,
        )
        assert r.status_code == 400, r.text[:300]

    # ---------- validation (no LLM cost) ----------
    def test_caricature_invalid_base64(self, api_client):
        r = api_client.post(f"{API}/caricature", json={"image_base64": "!!!not-base64!!!"}, timeout=60)
        assert r.status_code == 400, f"expected 400, got {r.status_code}: {r.text[:300]}"

    def test_caricature_missing_field(self, api_client):
        r = api_client.post(f"{API}/caricature", json={}, timeout=60)
        assert r.status_code == 422, r.text[:300]

    # ---------- real generation with event logo ----------
    def test_caricature_with_event_logo(self, api_client, face_b64, state):
        r = api_client.post(
            f"{API}/caricature",
            json={"image_base64": face_b64, "use_event_logo": True},
            timeout=240,
        )
        assert r.status_code == 200, f"status={r.status_code} body={r.text[:300]}"
        data = r.json()
        assert set(["id", "created_at", "image_base64"]).issubset(data.keys())
        assert isinstance(data["id"], str) and len(data["id"]) > 10
        raw = base64.b64decode(data["image_base64"])
        img = Image.open(io.BytesIO(raw))
        assert img.format == "JPEG"
        assert img.size == (1200, 1800), f"unexpected size {img.size}"
        state["event_id"] = data["id"]

    # ---------- real generation with custom logo ----------
    def test_caricature_with_custom_logo(self, api_client, face_b64, state):
        custom = base64.b64encode(make_logo_png(color=(255, 59, 48, 255))).decode()
        r = api_client.post(
            f"{API}/caricature",
            json={"image_base64": face_b64, "use_event_logo": False, "logo_base64": custom},
            timeout=240,
        )
        assert r.status_code == 200, f"status={r.status_code} body={r.text[:300]}"
        data = r.json()
        img = Image.open(io.BytesIO(base64.b64decode(data["image_base64"])))
        assert img.format == "JPEG" and img.size == (1200, 1800)
        state["custom_id"] = data["id"]

    # ---------- creations listing ----------
    def test_list_creations_contains_new(self, api_client, state):
        r = api_client.get(f"{API}/creations", timeout=60)
        assert r.status_code == 200, r.text[:300]
        items = r.json()
        assert isinstance(items, list) and len(items) >= 1
        assert all(set(i.keys()) == {"id", "created_at"} for i in items), items[:2]
        ids = [i["id"] for i in items]
        for key in ("event_id", "custom_id"):
            if state.get(key):
                assert state[key] in ids
        dates = [i["created_at"] for i in items]
        assert dates == sorted(dates, reverse=True), "creations not newest-first"

    def test_get_image_ok(self, api_client, state):
        cid = state.get("event_id")
        if not cid:
            r = api_client.get(f"{API}/creations", timeout=60)
            cid = r.json()[0]["id"]
        r = api_client.get(f"{API}/images/{cid}", timeout=90)
        assert r.status_code == 200
        assert r.headers["Content-Type"] == "image/jpeg"
        img = Image.open(io.BytesIO(r.content))
        assert img.size == (1200, 1800)

    def test_get_image_not_found(self, api_client):
        r = api_client.get(f"{API}/images/nonexistent", timeout=60)
        assert r.status_code == 404, r.text[:300]

    def test_delete_creation_soft_delete(self, api_client, state):
        cid = state.get("custom_id")
        if not cid:
            pytest.skip("no creation available to delete")
        r = api_client.delete(f"{API}/creations/{cid}", timeout=60)
        assert r.status_code == 200 and r.json().get("ok") is True
        assert api_client.get(f"{API}/images/{cid}", timeout=60).status_code == 404
        ids = [i["id"] for i in api_client.get(f"{API}/creations", timeout=60).json()]
        assert cid not in ids

    def test_delete_creation_not_found(self, api_client):
        r = api_client.delete(f"{API}/creations/TEST_missing", timeout=60)
        assert r.status_code == 404, r.text[:300]

    # ---------- logo removal + restore (must stay last) ----------
    def test_delete_event_logo(self, api_client):
        r = api_client.delete(f"{API}/settings/logo", timeout=60)
        assert r.status_code == 200
        assert api_client.get(f"{API}/settings/logo", timeout=30).json() == {"exists": False}
        assert api_client.get(f"{API}/logo-image", timeout=30).status_code == 404

    def test_zz_restore_event_logo_for_frontend(self, api_client, logo_bytes):
        r = api_client.post(
            f"{API}/settings/logo",
            files={"file": ("TEST_logo.png", logo_bytes, "image/png")},
            timeout=90,
        )
        assert r.status_code == 200
        assert api_client.get(f"{API}/settings/logo", timeout=30).json() == {"exists": True}
