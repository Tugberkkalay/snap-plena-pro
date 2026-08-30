"""Tests for QR share page (/api/share/{id}) and image download (?dl=1)."""
import os

import pytest
import requests
from dotenv import dotenv_values

frontend_env = dotenv_values("/app/frontend/.env")
base_url = os.environ.get("REACT_APP_BACKEND_URL") or frontend_env.get("REACT_APP_BACKEND_URL")
if not base_url:
    raise RuntimeError("REACT_APP_BACKEND_URL is missing")
BASE_URL = base_url.rstrip("/")
API = f"{BASE_URL}/api"


@pytest.fixture(scope="module")
def creation_id():
    r = requests.get(f"{API}/creations", timeout=30)
    assert r.status_code == 200, r.text[:300]
    data = r.json()
    assert isinstance(data, list) and len(data) > 0, "No creations to test with"
    assert "_id" not in data[0], "MongoDB _id leaked in /api/creations response"
    return data[0]["id"]


# --- share page ---
class TestSharePage:
    def test_share_page_valid(self, creation_id):
        r = requests.get(f"{API}/share/{creation_id}", timeout=30)
        assert r.status_code == 200, r.text[:300]
        assert "text/html" in r.headers.get("content-type", "")
        html = r.text
        assert "PLENA" in html
        assert f"/api/images/{creation_id}" in html
        assert f"/api/images/{creation_id}?dl=1" in html
        assert "JPG Olarak" in html

    def test_share_page_invalid_id_404(self):
        r = requests.get(f"{API}/share/does-not-exist-1234", timeout=30)
        assert r.status_code == 404, f"expected 404 got {r.status_code}: {r.text[:200]}"

    def test_share_page_image_resolves(self, creation_id):
        r = requests.get(f"{API}/images/{creation_id}", timeout=60)
        assert r.status_code == 200
        assert r.headers.get("content-type", "").startswith("image/")
        assert len(r.content) > 1000


# --- download header behaviour ---
class TestImageDownload:
    def test_dl_param_sets_attachment(self, creation_id):
        r = requests.get(f"{API}/images/{creation_id}?dl=1", timeout=60)
        assert r.status_code == 200
        cd = r.headers.get("content-disposition")
        assert cd is not None, "Missing Content-Disposition with dl=1"
        assert "attachment" in cd.lower()
        assert f"plena-snap-{creation_id}.jpg" in cd

    def test_no_dl_param_no_attachment(self, creation_id):
        r = requests.get(f"{API}/images/{creation_id}", timeout=60)
        assert r.status_code == 200
        assert r.headers.get("content-disposition") is None, (
            f"Unexpected Content-Disposition: {r.headers.get('content-disposition')}"
        )

    def test_dl_zero_no_attachment(self, creation_id):
        r = requests.get(f"{API}/images/{creation_id}?dl=0", timeout=60)
        assert r.status_code == 200
        assert r.headers.get("content-disposition") is None

    def test_invalid_image_404(self):
        r = requests.get(f"{API}/images/nope-invalid-id?dl=1", timeout=30)
        assert r.status_code == 404
