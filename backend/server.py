import asyncio
import base64
import io
import logging
import os
import time
import uuid
from collections import defaultdict, deque
from datetime import datetime, timezone
from hmac import compare_digest
from pathlib import Path
from typing import List, Literal, Optional

import requests
from dotenv import load_dotenv
from fastapi import APIRouter, FastAPI, File, Header, HTTPException, Request, UploadFile
from fastapi.responses import HTMLResponse, Response
from motor.motor_asyncio import AsyncIOMotorClient
from PIL import Image, ImageDraw
from pydantic import BaseModel
from starlette.middleware.cors import CORSMiddleware

from emergentintegrations.llm.chat import LlmChat, UserMessage, ImageContent

ROOT_DIR = Path(__file__).parent
load_dotenv(ROOT_DIR / '.env')

mongo_url = os.environ['MONGO_URL']
client = AsyncIOMotorClient(mongo_url)
db = client[os.environ['DB_NAME']]

app = FastAPI()
api_router = APIRouter(prefix="/api")

logging.basicConfig(level=logging.INFO, format='%(asctime)s - %(name)s - %(levelname)s - %(message)s')
logger = logging.getLogger(__name__)

STORAGE_BASE = (os.environ.get("INTEGRATION_PROXY_URL") or "").strip() or "https://integrations.emergentagent.com"
STORAGE_URL = STORAGE_BASE.rstrip("/") + "/objstore/api/v1/storage"
EMERGENT_KEY = os.environ.get("EMERGENT_LLM_KEY")
APP_NAME = "karika-booth"
storage_key = None
ADMIN_PIN = os.environ.get("ADMIN_PIN")

RATE_BUCKETS = defaultdict(deque)


def check_rate_limit(request: Request, key: str, limit: int, window: int = 60):
    ip = (request.headers.get("x-forwarded-for") or (request.client.host if request.client else "?")).split(",")[0].strip()
    bucket = RATE_BUCKETS[f"{key}:{ip}"]
    now = time.monotonic()
    while bucket and now - bucket[0] > window:
        bucket.popleft()
    if len(bucket) >= limit:
        raise HTTPException(status_code=429, detail="Çok fazla istek, lütfen biraz bekleyip tekrar deneyin")
    bucket.append(now)


def verify_admin_pin(request: Request, supplied_pin: Optional[str]):
    check_rate_limit(request, "admin", 10)
    if not ADMIN_PIN or not compare_digest(supplied_pin or "", ADMIN_PIN):
        raise HTTPException(status_code=401, detail="Geçersiz yönetici PIN'i")

CANVAS_W, CANVAS_H = 1200, 1800  # 4x6 inch portrait @ 300 DPI

CARICATURE_PROMPT = (
    "Transform the person or people in this photo into a premium hand-drawn caricature illustration. "
    "Playfully exaggerate their facial features - bigger smiles, expressive eyes, slightly oversized heads "
    "on smaller bodies - while keeping every person clearly recognizable. "
    "Art style: vibrant modern digital cartoon, clean bold ink outlines, smooth cel shading, rich saturated "
    "colors, soft studio lighting. Replace the background with a festive technology product launch "
    "celebration: confetti in the air, glowing bokeh stage lights, subtle futuristic neon accents. "
    "Portrait orientation composition (2:3 aspect ratio). High detail, poster quality. "
    "Do not add any text, letters, numbers, watermarks or logos to the image."
)

PLACEMENT_PROMPTS = {
    "flag": (
        "The second image is the official brand logo. Draw the main person proudly holding up and waving "
        "a small hand flag on a stick; the flag is clean white fabric displaying this exact logo, "
        "large and clearly readable."
    ),
    "banner": (
        "The second image is the official brand logo. In the stage background, add a large glowing LED "
        "screen banner prominently displaying this exact logo on a light background, clearly readable."
    ),
    "tshirt": (
        "The second image is the official brand logo. Dress the main person in a clean white t-shirt "
        "with this exact logo printed large on the chest, clearly readable."
    ),
}


def init_storage(force: bool = False):
    global storage_key
    if storage_key and not force:
        return storage_key
    resp = requests.post(f"{STORAGE_URL}/init", json={"emergent_key": EMERGENT_KEY}, timeout=30)
    resp.raise_for_status()
    storage_key = resp.json()["storage_key"]
    return storage_key


def put_object(path: str, data: bytes, content_type: str) -> dict:
    key = init_storage()
    resp = requests.put(
        f"{STORAGE_URL}/objects/{path}",
        headers={"X-Storage-Key": key, "Content-Type": content_type},
        data=data, timeout=120,
    )
    if resp.status_code == 404:
        key = init_storage(force=True)
        resp = requests.put(
            f"{STORAGE_URL}/objects/{path}",
            headers={"X-Storage-Key": key, "Content-Type": content_type},
            data=data, timeout=120,
        )
    resp.raise_for_status()
    return resp.json()


def get_object(path: str) -> tuple:
    key = init_storage()
    resp = requests.get(f"{STORAGE_URL}/objects/{path}", headers={"X-Storage-Key": key}, timeout=60)
    if resp.status_code == 404:
        key = init_storage(force=True)
        resp = requests.get(f"{STORAGE_URL}/objects/{path}", headers={"X-Storage-Key": key}, timeout=60)
    resp.raise_for_status()
    return resp.content, resp.headers.get("Content-Type", "application/octet-stream")


async def generate_caricature(photo_b64: str, logo_b64: Optional[str] = None, placement: str = "corner") -> bytes:
    prompt = CARICATURE_PROMPT
    files = [ImageContent(photo_b64)]
    if logo_b64 and placement in PLACEMENT_PROMPTS:
        prompt += (
            " EXCEPTION to the no-logo rule: " + PLACEMENT_PROMPTS[placement] +
            " Reproduce the logo exactly as provided: same colors, same text, same proportions. "
            "Do not distort, recolor, redraw or misspell it."
        )
        files.append(ImageContent(logo_b64))
    chat = LlmChat(
        api_key=EMERGENT_KEY,
        session_id=str(uuid.uuid4()),
        system_message="You are an expert caricature illustrator.",
    )
    chat.with_model("gemini", "gemini-3.1-flash-image-preview").with_params(modalities=["image", "text"])
    msg = UserMessage(text=prompt, file_contents=files)
    text, images = await chat.send_message_multimodal_response(msg)
    if not images:
        logger.error(f"Gemini returned no image. Text: {str(text)[:200]}")
        raise HTTPException(status_code=502, detail="AI görsel üretemedi, lütfen tekrar deneyin")
    return base64.b64decode(images[0]["data"])


def compose_print_image(caricature_bytes: bytes, logo_bytes: Optional[bytes]) -> bytes:
    img = Image.open(io.BytesIO(caricature_bytes)).convert("RGB")
    w, h = img.size
    scale = max(CANVAS_W / w, CANVAS_H / h)
    img = img.resize((round(w * scale), round(h * scale)), Image.LANCZOS)
    left = (img.width - CANVAS_W) // 2
    top = (img.height - CANVAS_H) // 2
    canvas = img.crop((left, top, left + CANVAS_W, top + CANVAS_H))

    if logo_bytes:
        logo = Image.open(io.BytesIO(logo_bytes)).convert("RGBA")
        target_w = int(CANVAS_W * 0.24)
        ratio = target_w / logo.width
        logo = logo.resize((target_w, max(1, round(logo.height * ratio))), Image.LANCZOS)
        if logo.height > int(CANVAS_H * 0.14):
            ratio = int(CANVAS_H * 0.14) / logo.height
            logo = logo.resize((max(1, round(logo.width * ratio)), int(CANVAS_H * 0.14)), Image.LANCZOS)
        pad = 20
        plate = Image.new("RGBA", (logo.width + pad * 2, logo.height + pad * 2), (0, 0, 0, 0))
        d = ImageDraw.Draw(plate)
        d.rounded_rectangle([0, 0, plate.width - 1, plate.height - 1], radius=22, fill=(255, 255, 255, 235))
        plate.paste(logo, (pad, pad), logo)
        pos = (CANVAS_W - plate.width - 40, CANVAS_H - plate.height - 40)
        canvas.paste(plate, pos, plate)

    out = io.BytesIO()
    canvas.save(out, format="JPEG", quality=92, dpi=(300, 300))
    return out.getvalue()


class CaricatureRequest(BaseModel):
    image_base64: str
    use_event_logo: bool = True
    logo_base64: Optional[str] = None
    logo_placement: Literal["corner", "flag", "banner", "tshirt"] = "corner"


class GestureVerifyRequest(BaseModel):
    image_base64: str


GESTURE_VERIFY_PROMPT = (
    "Look at this photo. Is a person making an 'L' hand sign with one hand: index finger extended "
    "upward and thumb extended sideways (roughly 90 degrees between them), while the middle, ring "
    "and pinky fingers are folded down? The hand may be mirrored or slightly rotated. "
    "Reply with exactly one word: YES or NO."
)


class CreationOut(BaseModel):
    id: str
    created_at: str


@api_router.get("/")
async def root():
    return {"message": "KarikaBooth API"}


@api_router.post("/caricature")
async def create_caricature(request: Request, req: CaricatureRequest):
    check_rate_limit(request, "caricature", 5)
    try:
        raw = base64.b64decode(req.image_base64)
        if len(raw) > 15 * 1024 * 1024:
            raise HTTPException(status_code=400, detail="Fotoğraf çok büyük (max 15MB)")
        Image.open(io.BytesIO(raw)).verify()
    except HTTPException:
        raise
    except Exception:
        raise HTTPException(status_code=400, detail="Geçersiz görsel verisi")

    logo_bytes = None
    if req.logo_base64:
        try:
            logo_bytes = base64.b64decode(req.logo_base64)
            if len(logo_bytes) > 8 * 1024 * 1024:
                raise ValueError("too large")
            Image.open(io.BytesIO(logo_bytes)).verify()
        except Exception:
            raise HTTPException(status_code=400, detail="Geçersiz logo verisi")
    elif req.use_event_logo:
        setting = await db.settings.find_one({"key": "event_logo", "is_deleted": False})
        if setting:
            logo_bytes, _ = await asyncio.to_thread(get_object, setting["storage_path"])

    logo_b64 = base64.b64encode(logo_bytes).decode("utf-8") if logo_bytes else None
    caricature_bytes = await generate_caricature(req.image_base64, logo_b64, req.logo_placement)

    corner_logo = logo_bytes if req.logo_placement == "corner" else None
    final_jpg = compose_print_image(caricature_bytes, corner_logo)

    creation_id = str(uuid.uuid4())
    path = f"{APP_NAME}/creations/{creation_id}.jpg"
    result = await asyncio.to_thread(put_object, path, final_jpg, "image/jpeg")
    created_at = datetime.now(timezone.utc).isoformat()
    await db.creations.insert_one({
        "id": creation_id,
        "storage_path": result["path"],
        "created_at": created_at,
        "is_deleted": False,
    })
    return {
        "id": creation_id,
        "created_at": created_at,
        "image_base64": base64.b64encode(final_jpg).decode("utf-8"),
    }


@api_router.get("/creations", response_model=List[CreationOut])
async def list_creations():
    docs = await db.creations.find({"is_deleted": False}, {"_id": 0}).sort("created_at", -1).to_list(100)
    return [CreationOut(id=d["id"], created_at=d["created_at"]) for d in docs]


@api_router.api_route("/images/{creation_id}", methods=["GET", "HEAD"])
async def get_creation_image(creation_id: str, dl: int = 0):
    doc = await db.creations.find_one({"id": creation_id, "is_deleted": False})
    if not doc:
        raise HTTPException(status_code=404, detail="Görsel bulunamadı")
    data, content_type = await asyncio.to_thread(get_object, doc["storage_path"])
    headers = {"Cache-Control": "public, max-age=86400, immutable"}
    if dl:
        headers["Content-Disposition"] = f'attachment; filename="plena-snap-{creation_id}.jpg"'
    return Response(content=data, media_type="image/jpeg", headers=headers)


SHARE_PAGE = """<!doctype html>
<html lang="tr"><head><meta charset="utf-8"/>
<meta name="viewport" content="width=device-width, initial-scale=1"/>
<title>PLENA SNAP · HR VISION '26</title>
<meta property="og:title" content="PLENA SNAP · HR VISION '26"/>
<meta property="og:description" content="SNAP'ini görüntüle ve indir — PLENA STUDIO presents SNAP"/>
<meta property="og:image" content="{base}/api/images/{cid}"/>
<meta name="twitter:card" content="summary_large_image"/>
<style>
body{{margin:0;background:#0A0A0A;color:#fff;font-family:system-ui,sans-serif;display:flex;flex-direction:column;align-items:center;padding:28px 20px;min-height:100vh;box-sizing:border-box}}
.brand{{display:flex;align-items:center;gap:8px;font-weight:700;font-size:18px;letter-spacing:-0.5px;margin-bottom:4px}}
.brand .cy{{color:#00E5FF}}
.sub{{color:#00E5FF;font-size:11px;letter-spacing:3px;text-transform:uppercase;margin-bottom:22px}}
img.snap{{max-width:100%;max-height:68vh;border-radius:16px;border:1px solid rgba(255,255,255,.12)}}
a.dl{{display:block;margin-top:22px;background:#00E5FF;color:#000;font-weight:600;padding:15px 40px;border-radius:999px;text-decoration:none;font-size:15px}}
.foot{{color:rgba(255,255,255,.35);font-size:11px;margin-top:18px;letter-spacing:1px}}
</style></head><body>
<div class="brand"><svg width="20" height="20" viewBox="0 0 48 48"><rect x="21" y="3" width="6" height="15" rx="3" fill="#2E6BF0" transform="rotate(45 24 24)"/><rect x="21" y="3" width="6" height="15" rx="3" fill="#F2B21B" transform="rotate(135 24 24)"/><rect x="21" y="3" width="6" height="15" rx="3" fill="#3BA55D" transform="rotate(225 24 24)"/><rect x="21" y="3" width="6" height="15" rx="3" fill="#E5443C" transform="rotate(315 24 24)"/></svg>PLENA&nbsp;<span class="cy">SNAP</span></div>
<div class="sub">HR Vision '26 Experience</div>
<img class="snap" src="/api/images/{cid}" alt="SNAP"/>
<a class="dl" href="/api/images/{cid}?dl=1">JPG Olarak İndir</a>
<div class="foot">PLENA STUDIO presents SNAP</div>
</body></html>"""


@api_router.get("/share/{creation_id}")
async def share_page(request: Request, creation_id: str):
    doc = await db.creations.find_one({"id": creation_id, "is_deleted": False})
    if not doc:
        raise HTTPException(status_code=404, detail="Görsel bulunamadı")
    base = str(request.base_url).rstrip("/")
    if base.startswith("http://") and "localhost" not in base:
        base = "https://" + base[len("http://"):]
    return HTMLResponse(content=SHARE_PAGE.format(cid=creation_id, base=base))


@api_router.delete("/creations/{creation_id}")
async def delete_creation(request: Request, creation_id: str, x_admin_pin: Optional[str] = Header(None)):
    verify_admin_pin(request, x_admin_pin)
    res = await db.creations.update_one({"id": creation_id}, {"$set": {"is_deleted": True}})
    if res.matched_count == 0:
        raise HTTPException(status_code=404, detail="Görsel bulunamadı")
    return {"ok": True}


@api_router.post("/auth/verify-pin")
async def auth_verify_pin(request: Request, x_admin_pin: Optional[str] = Header(None)):
    verify_admin_pin(request, x_admin_pin)
    return {"ok": True}


@api_router.post("/auth/verify-gesture")
async def auth_verify_gesture(request: Request, req: GestureVerifyRequest):
    check_rate_limit(request, "gesture", 12)
    try:
        raw = base64.b64decode(req.image_base64)
        if len(raw) > 8 * 1024 * 1024:
            raise ValueError("too large")
        Image.open(io.BytesIO(raw)).verify()
    except Exception:
        raise HTTPException(status_code=400, detail="Geçersiz görsel verisi")
    chat = LlmChat(
        api_key=EMERGENT_KEY,
        session_id=str(uuid.uuid4()),
        system_message="You are a strict hand-gesture verifier. Answer only YES or NO.",
    )
    chat.with_model("gemini", "gemini-3-flash-preview")
    msg = UserMessage(text=GESTURE_VERIFY_PROMPT, file_contents=[ImageContent(req.image_base64)])
    try:
        resp = await chat.send_message(msg)
    except Exception as e:
        logger.error(f"Gesture verify failed: {e}")
        raise HTTPException(status_code=502, detail="Doğrulama servisi yanıt vermedi, tekrar deneyin")
    ok = "YES" in str(resp).strip().upper()
    return {"ok": ok}


@api_router.post("/settings/logo")
async def upload_event_logo(request: Request, file: UploadFile = File(...), x_admin_pin: Optional[str] = Header(None)):
    verify_admin_pin(request, x_admin_pin)
    data = await file.read()
    if len(data) > 8 * 1024 * 1024:
        raise HTTPException(status_code=400, detail="Dosya çok büyük (max 8MB)")
    try:
        pil = Image.open(io.BytesIO(data))
        pil.verify()
        fmt = (pil.format or "").lower()
    except Exception:
        raise HTTPException(status_code=400, detail="Geçersiz görsel dosyası")
    if fmt not in ("png", "jpeg", "webp"):
        raise HTTPException(status_code=400, detail="Sadece PNG, JPEG veya WebP yüklenebilir")
    ext = "jpg" if fmt == "jpeg" else fmt
    content_type = f"image/{fmt}"
    path = f"{APP_NAME}/logo/{uuid.uuid4()}.{ext}"
    result = await asyncio.to_thread(put_object, path, data, content_type)
    await db.settings.update_many({"key": "event_logo"}, {"$set": {"is_deleted": True}})
    await db.settings.insert_one({
        "key": "event_logo",
        "storage_path": result["path"],
        "content_type": content_type,
        "is_deleted": False,
        "created_at": datetime.now(timezone.utc).isoformat(),
    })
    return {"ok": True}


@api_router.get("/settings/logo")
async def get_event_logo_status():
    setting = await db.settings.find_one({"key": "event_logo", "is_deleted": False})
    return {"exists": setting is not None}


@api_router.get("/logo-image")
async def get_event_logo_image():
    setting = await db.settings.find_one({"key": "event_logo", "is_deleted": False})
    if not setting:
        raise HTTPException(status_code=404, detail="Logo bulunamadı")
    data, content_type = await asyncio.to_thread(get_object, setting["storage_path"])
    return Response(content=data, media_type=setting.get("content_type", content_type))


@api_router.delete("/settings/logo")
async def delete_event_logo(request: Request, x_admin_pin: Optional[str] = Header(None)):
    verify_admin_pin(request, x_admin_pin)
    await db.settings.update_many({"key": "event_logo"}, {"$set": {"is_deleted": True}})
    return {"ok": True}


app.include_router(api_router)

app.add_middleware(
    CORSMiddleware,
    allow_origins=os.environ.get('CORS_ORIGINS', '*').split(','),
    allow_methods=["GET", "POST", "DELETE", "OPTIONS"],
    allow_headers=["Content-Type", "X-Admin-Pin"],
)


@app.on_event("startup")
async def startup():
    try:
        init_storage()
        logger.info("Storage initialized")
    except Exception as e:
        logger.error(f"Storage init failed: {e}")


@app.on_event("shutdown")
async def shutdown_db_client():
    client.close()
