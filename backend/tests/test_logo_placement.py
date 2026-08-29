"""Tests for the NEW logo_placement feature on POST /api/caricature.

STRICT LLM BUDGET: this module makes exactly ONE real Gemini generation call
(backward-compat / corner-overlay verification). Scene placements ('flag' verified
by main agent, 'banner' verified via the frontend E2E run) are asserted here only
against already-generated artifacts to avoid extra paid calls.
"""
import base64
import io

import pytest
from PIL import Image

from conftest import API


def _plate_probe(img):
    """Return mean RGB of a small patch inside where the corner white plate would be.

    Plate geometry from compose_print_image with the 1515x570 event logo:
    logo 288x108 + 20px pad -> plate 328x148 at (832, 1612)-(1160, 1760).
    Probe the plate's top-left inner corner (white padding, no logo ink).
    """
    patch = img.convert("RGB").crop((840, 1620, 860, 1636))
    px = list(patch.getdata())
    n = len(px)
    return tuple(sum(c[i] for c in px) / n for i in range(3))


class TestLogoPlacement:
    # ---------- schema / validation (no LLM cost) ----------
    def test_logo_placement_accepted_in_schema(self, api_client):
        """Invalid image + valid placement -> 400 (image error), proving the field is accepted."""
        for placement in ("corner", "flag", "banner", "tshirt"):
            r = api_client.post(
                f"{API}/caricature",
                json={"image_base64": "!!!bad!!!", "logo_placement": placement},
                timeout=60,
            )
            assert r.status_code == 400, f"{placement}: {r.status_code} {r.text[:200]}"

    def test_logo_placement_wrong_type_rejected(self, api_client, face_b64):
        r = api_client.post(
            f"{API}/caricature",
            json={"image_base64": face_b64, "logo_placement": 123},
            timeout=60,
        )
        assert r.status_code == 422, r.text[:300]

    # ---------- ONE real generation: no logo_placement field (backward compat) ----------
    def test_backward_compat_default_corner_overlay(self, api_client, face_b64, state_pl):
        payload = {"image_base64": face_b64, "use_event_logo": True}  # no logo_placement
        r = api_client.post(f"{API}/caricature", json=payload, timeout=280)
        assert r.status_code == 200, f"status={r.status_code} body={r.text[:300]}"
        data = r.json()
        assert set(["id", "created_at", "image_base64"]).issubset(data.keys())
        img = Image.open(io.BytesIO(base64.b64decode(data["image_base64"])))
        assert img.format == "JPEG"
        assert img.size == (1200, 1800), f"unexpected size {img.size}"
        mean = _plate_probe(img)
        assert min(mean) > 225, f"expected white corner plate, probe mean={mean}"
        state_pl["corner_id"] = data["id"]

    def test_corner_result_persisted_and_served(self, api_client, state_pl):
        cid = state_pl.get("corner_id")
        if not cid:
            pytest.skip("corner generation did not run")
        r = api_client.get(f"{API}/images/{cid}", timeout=90)
        assert r.status_code == 200
        img = Image.open(io.BytesIO(r.content))
        assert img.size == (1200, 1800)
        assert min(_plate_probe(img)) > 225

    # ---------- scene placement verified against artifact from frontend E2E run ----------
    def test_scene_placement_has_no_corner_overlay(self, api_client):
        """Reads /tmp/scene_creation_id.txt written by the frontend E2E run (banner/flag)."""
        try:
            cid = open("/tmp/scene_creation_id.txt").read().strip()
        except OSError:
            pytest.skip("no scene-placement artifact available (frontend run not executed)")
        r = api_client.get(f"{API}/images/{cid}", timeout=90)
        assert r.status_code == 200
        img = Image.open(io.BytesIO(r.content))
        assert img.size == (1200, 1800)
        mean = _plate_probe(img)
        assert min(mean) <= 225, f"corner plate should NOT be applied for scene placement, probe={mean}"


@pytest.fixture(scope="module")
def state_pl():
    return {}
