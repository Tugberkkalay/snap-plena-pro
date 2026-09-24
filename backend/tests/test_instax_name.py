"""Tests for Instax Mini output: creation name field, 1200x1600 canvas, slugified download filename."""
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

NAMED_ID = "b1bd9672-390e-4c78-8217-6ba7c81eacb7"
EXPECTED_NAME = "Instax Test Ali"
EXPECTED_FILENAME = "Instax-Test-Ali-b1bd9672.jpg"


class TestCreationsListName:
    def test_named_creation_in_list_with_name(self):
        r = requests.get(f"{API}/creations", timeout=30)
        assert r.status_code == 200
        data = r.json()
        assert isinstance(data, list) and len(data) > 0
        # No mongodb _id leak
        for item in data:
            assert "_id" not in item
            assert "id" in item and "created_at" in item
            # 'name' key should exist on every item (Optional)
            assert "name" in item
        match = next((d for d in data if d["id"] == NAMED_ID), None)
        assert match is not None, f"named creation {NAMED_ID} not found"
        assert match["name"] == EXPECTED_NAME

    def test_at_least_one_creation_without_name(self):
        r = requests.get(f"{API}/creations", timeout=30)
        data = r.json()
        # find any old one without a name (used for fallback filename test)
        without = [d for d in data if not d.get("name") and d["id"] != NAMED_ID]
        # not strictly required but likely present
        if not without:
            pytest.skip("No unnamed creation present to test fallback filename")
        return without[0]["id"]


class TestNamedDownloadFilename:
    def test_dl_uses_slugified_name(self):
        r = requests.get(f"{API}/images/{NAMED_ID}?dl=1", timeout=60)
        assert r.status_code == 200
        cd = r.headers.get("content-disposition", "")
        assert "attachment" in cd.lower()
        assert EXPECTED_FILENAME in cd, f"expected {EXPECTED_FILENAME} in {cd}"

    def test_no_dl_no_disposition(self):
        r = requests.get(f"{API}/images/{NAMED_ID}", timeout=60)
        assert r.status_code == 200
        assert r.headers.get("content-disposition") is None

    def test_unnamed_creation_filename_starts_plena_snap(self):
        r = requests.get(f"{API}/creations", timeout=30)
        data = r.json()
        unnamed = [d for d in data if not d.get("name") and d["id"] != NAMED_ID]
        if not unnamed:
            pytest.skip("No unnamed creation to check")
        cid = unnamed[0]["id"]
        r2 = requests.get(f"{API}/images/{cid}?dl=1", timeout=60)
        assert r2.status_code == 200
        cd = r2.headers.get("content-disposition", "")
        expected = f"plena-snap-{cid[:8]}.jpg"
        assert expected in cd, f"expected {expected} in {cd}"


class TestInstaxDimensions:
    def test_named_image_is_1200x1600_jpeg(self):
        r = requests.get(f"{API}/images/{NAMED_ID}", timeout=60)
        assert r.status_code == 200
        ct = r.headers.get("content-type", "")
        assert ct.startswith("image/"), ct
        img = Image.open(io.BytesIO(r.content))
        assert img.format == "JPEG", img.format
        assert img.size == (1200, 1600), f"expected 1200x1600, got {img.size}"
