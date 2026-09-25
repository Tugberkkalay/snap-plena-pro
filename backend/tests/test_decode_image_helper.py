"""Regression tests for decode_image_b64 refactor helper.

Verifies both call sites (create_caricature photo+logo, auth_verify_gesture)
still short-circuit with clear 400 messages before any LLM call.
"""
import base64
import io
import os

import requests
from dotenv import dotenv_values
from PIL import Image

frontend_env = dotenv_values("/app/frontend/.env")
base_url = os.environ.get("REACT_APP_BACKEND_URL") or frontend_env.get("REACT_APP_BACKEND_URL")
BASE_URL = base_url.rstrip("/")
API = f"{BASE_URL}/api"


def _valid_png_b64():
    buf = io.BytesIO()
    Image.new("RGB", (64, 64), (128, 90, 40)).save(buf, "PNG")
    return base64.b64encode(buf.getvalue()).decode()


class TestCaricatureDecode:
    def test_invalid_photo_base64_returns_400_gecersiz_gorsel(self):
        r = requests.post(f"{API}/caricature", json={"image_base64": "!!!not-base64!!!"}, timeout=30)
        assert r.status_code == 400, r.text[:300]
        assert "Geçersiz görsel verisi" in r.text, r.text[:300]

    def test_valid_photo_invalid_logo_returns_400_gecersiz_logo(self):
        # photo decodes fine; logo decode must fail BEFORE Gemini
        payload = {
            "image_base64": _valid_png_b64(),
            "use_event_logo": False,
            "logo_base64": "not-base64-!!!",
        }
        r = requests.post(f"{API}/caricature", json=payload, timeout=30)
        assert r.status_code == 400, r.text[:300]
        assert "Geçersiz logo verisi" in r.text, r.text[:300]


class TestVerifyGestureDecode:
    def test_invalid_base64_returns_400(self):
        r = requests.post(f"{API}/auth/verify-gesture", json={"image_base64": "!!!bad!!!"}, timeout=30)
        assert r.status_code == 400, r.text[:300]
