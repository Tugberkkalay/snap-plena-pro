"""Tests for Instax Çerçevesi optional print frame feature."""
import io
import os

import pytest
import requests
from dotenv import dotenv_values
from PIL import Image

frontend_env = dotenv_values("/app/frontend/.env")
base_url = os.environ.get("REACT_APP_BACKEND_URL") or frontend_env.get("REACT_APP_BACKEND_URL")
if not base_url:
    raise RuntimeError("REACT_APP_BACKEND_URL is missing")
BASE_URL = base_url.rstrip("/")
API = f"{BASE_URL}/api"

UNFRAMED_ID = "2eeec593-1f60-4b45-9d57-794558f0db42"  # Test Misafir (older, unframed)


def _get_creations():
    r = requests.get(f"{API}/creations", timeout=30)
    assert r.status_code == 200
    return r.json()


def _fetch_img(cid):
    r = requests.get(f"{API}/images/{cid}", timeout=60)
    assert r.status_code == 200, f"{cid} -> {r.status_code}"
    img = Image.open(io.BytesIO(r.content))
    return img


class TestFramedCreation:
    def test_newest_creation_named_cerceve_testi(self):
        data = _get_creations()
        assert len(data) > 0
        newest = data[0]  # backend returns newest-first
        assert newest.get("name") == "Çerçeve Testi", f"newest name is {newest.get('name')}, id={newest.get('id')}"

    def test_framed_image_has_white_border_and_strip(self):
        data = _get_creations()
        newest = data[0]
        assert newest.get("name") == "Çerçeve Testi"
        img = _fetch_img(newest["id"]).convert("RGB")
        assert img.size == (1200, 1600)

        # Border pixel (5,5) should be pure white
        px_border = img.getpixel((5, 5))
        assert px_border == (255, 255, 255), f"border pixel expected white, got {px_border}"

        # Bottom strip pixel (600, 1590) should be near-white
        px_strip = img.getpixel((600, 1590))
        assert all(c >= 240 for c in px_strip), f"strip pixel near-white expected, got {px_strip}"

        # Photo area pixel (600, 800) should NOT be white
        px_photo = img.getpixel((600, 800))
        assert px_photo != (255, 255, 255), "photo area unexpectedly pure white"


class TestUnframedCreation:
    def test_older_unframed_has_non_white_corner(self):
        img = _fetch_img(UNFRAMED_ID).convert("RGB")
        assert img.size == (1200, 1600)
        px = img.getpixel((5, 5))
        # Should not be pure white (proves frame is optional)
        assert px != (255, 255, 255), f"expected non-white corner for unframed creation, got {px}"


class TestCaricatureRequestFrameValidation:
    def test_invalid_base64_with_frame_true_returns_400_no_crash(self):
        payload = {
            "image": "not-a-valid-base64!!!",
            "name": "TEST_should_not_persist",
            "frame": True,
        }
        r = requests.post(f"{API}/caricature", json=payload, timeout=30)
        # Should be 400 (bad request), NOT 500 (crash in compose path)
        assert r.status_code in (400, 422), f"expected 400/422, got {r.status_code}: {r.text[:200]}"

    def test_frame_field_accepts_boolean_false(self):
        # We still expect it to fail before generation because of invalid base64
        payload = {
            "image": "bad-image",
            "name": "TEST_no_persist",
            "frame": False,
        }
        r = requests.post(f"{API}/caricature", json=payload, timeout=30)
        assert r.status_code in (400, 422)
