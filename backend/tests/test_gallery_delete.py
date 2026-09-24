"""Iteration 4: gallery delete + image caching/perf verification (no LLM calls)."""
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


@pytest.fixture(scope="module")
def client():
    s = requests.Session()
    return s


@pytest.fixture(scope="module")
def creations(client):
    r = client.get(f"{API}/creations", timeout=30)
    assert r.status_code == 200, r.text
    data = r.json()
    assert isinstance(data, list)
    return data


# --- GET /api/creations ---
def test_list_creations(creations):
    assert len(creations) > 0, "expected seeded creations"
    for c in creations[:5]:
        assert isinstance(c["id"], str) and c["id"]
        assert "created_at" in c


# --- GET /api/images/{id} caching header + perf ---
def test_image_cache_control_and_payload(client, creations):
    cid = creations[0]["id"]
    t0 = time.time()
    r = client.get(f"{API}/images/{cid}", timeout=60)
    elapsed = time.time() - t0
    assert r.status_code == 200
    assert r.headers.get("content-type", "").startswith("image/jpeg")
    cc = r.headers.get("cache-control", "")
    if "public" not in cc:
        # Preview edge (Cloudflare) rewrites Cache-Control to no-store; verify at origin instead.
        origin = requests.get(f"http://localhost:8001/api/images/{cid}", timeout=60)
        assert origin.status_code == 200
        occ = origin.headers.get("cache-control", "")
        assert "public" in occ and "max-age=86400" in occ and "immutable" in occ, f"origin cache-control={occ!r}"
        print(f"NOTE: edge overrides Cache-Control ({cc!r}); origin sends {occ!r}")
    else:
        assert "max-age=86400" in cc and "immutable" in cc, f"cache-control={cc!r}"
    assert len(r.content) > 1000
    print(f"image fetch {elapsed:.2f}s size={len(r.content)}")


def test_image_404_for_unknown_id(client):
    r = client.get(f"{API}/images/does-not-exist-xyz", timeout=30)
    assert r.status_code == 404


# --- GET /api/settings/logo (free, no PIN) ---
def test_logo_status_still_set(client):
    r = client.get(f"{API}/settings/logo", timeout=30)
    assert r.status_code == 200
    assert r.json().get("exists") == True


# --- DELETE /api/creations/{id} security (uses 1 admin-bucket slot) ---
def test_delete_without_pin_unauthorized(client, creations):
    cid = creations[-1]["id"]
    r = client.delete(f"{API}/creations/{cid}", timeout=30)
    assert r.status_code == 401, f"{r.status_code} {r.text}"
    # item must still be listed
    lst = client.get(f"{API}/creations", timeout=30).json()
    assert cid in [c["id"] for c in lst]
