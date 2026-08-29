import base64
import io
import os

import pytest
import requests
from dotenv import dotenv_values
from PIL import Image, ImageDraw

frontend_env = dotenv_values("/app/frontend/.env")
_base = os.environ.get("REACT_APP_BACKEND_URL") or frontend_env.get("REACT_APP_BACKEND_URL")
if not _base:
    raise RuntimeError("REACT_APP_BACKEND_URL missing")
BASE_URL = _base.rstrip("/")
API = BASE_URL + "/api"


def make_face_png(size=(512, 640)) -> bytes:
    """Synthetic simple 'face' photo for caricature input."""
    img = Image.new("RGB", size, (235, 220, 205))
    d = ImageDraw.Draw(img)
    cx, cy = size[0] // 2, size[1] // 2 - 40
    d.ellipse([cx - 130, cy - 170, cx + 130, cy + 170], fill=(245, 205, 180), outline=(120, 90, 70), width=4)
    d.ellipse([cx - 75, cy - 50, cx - 25, cy - 10], fill=(255, 255, 255), outline=(40, 40, 40), width=3)
    d.ellipse([cx + 25, cy - 50, cx + 75, cy - 10], fill=(255, 255, 255), outline=(40, 40, 40), width=3)
    d.ellipse([cx - 60, cy - 40, cx - 40, cy - 20], fill=(30, 30, 30))
    d.ellipse([cx + 40, cy - 40, cx + 60, cy - 20], fill=(30, 30, 30))
    d.line([cx, cy - 10, cx, cy + 40], fill=(160, 120, 100), width=5)
    d.arc([cx - 60, cy + 40, cx + 60, cy + 110], start=10, end=170, fill=(180, 70, 70), width=8)
    d.ellipse([cx - 145, cy - 195, cx + 145, cy - 120], fill=(60, 60, 70))
    d.rectangle([cx - 170, cy + 200, cx + 170, size[1]], fill=(40, 60, 110))
    out = io.BytesIO()
    img.save(out, format="PNG")
    return out.getvalue()


def make_logo_png(color=(0, 229, 255, 255)) -> bytes:
    img = Image.new("RGBA", (400, 160), (0, 0, 0, 0))
    d = ImageDraw.Draw(img)
    d.rounded_rectangle([0, 0, 399, 159], radius=24, fill=color)
    d.ellipse([20, 40, 100, 120], fill=(10, 10, 10, 255))
    out = io.BytesIO()
    img.save(out, format="PNG")
    return out.getvalue()


@pytest.fixture(scope="session")
def api_client():
    s = requests.Session()
    return s


@pytest.fixture(scope="session")
def face_b64():
    return base64.b64encode(make_face_png()).decode()


@pytest.fixture(scope="session")
def logo_bytes():
    return make_logo_png()
