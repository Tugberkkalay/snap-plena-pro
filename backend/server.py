import base64
import io
import logging
import os
import uuid
from datetime import datetime, timezone
from pathlib import Path
from typing import List, Optional

import requests
from dotenv import load_dotenv
from fastapi import APIRouter, FastAPI, File, HTTPException, UploadFile
from fastapi.responses import Response
from motor.motor_asyncio import AsyncIOMotorClient
from PIL import Image
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


async def generate_caricature(photo_b64: str) -> bytes:
    chat = LlmChat(
        api_key=EMERGENT_KEY,
        session_id=str(uuid.uuid4()),
        system_message="You are an expert caricature illustrator.",
    )
    chat.with_model("gemini", "gemini-3.1-flash-image-preview").with_params(modalities=["image", "text"])
    msg = UserMessage(text=CARICATURE_PROMPT, file_contents=[ImageContent(photo_b64)])
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
        pos = (CANVAS_W - logo.width - 48, CANVAS_H - logo.height - 48)
        canvas.paste(logo, pos, logo)

    out = io.BytesIO()
    canvas.save(out, format="JPEG", quality=92, dpi=(300, 300))
    return out.getvalue()


class CaricatureRequest(BaseModel):
    image_base64: str
    use_event_logo: bool = True
    logo_base64: Optional[str] = None


class CreationOut(BaseModel):
    id: str
    created_at: str


@api_router.get("/")
async def root():
    return {"message": "KarikaBooth API"}


@api_router.post("/caricature")
async def create_caricature(req: CaricatureRequest):
    try:
        raw = base64.b64decode(req.image_base64)
        if len(raw) > 15 * 1024 * 1024:
            raise HTTPException(status_code=400, detail="Fotoğraf çok büyük (max 15MB)")
        Image.open(io.BytesIO(raw)).verify()
    except HTTPException:
        raise
    except Exception:
        raise HTTPException(status_code=400, detail="Geçersiz görsel verisi")

    caricature_bytes = await generate_caricature(req.image_base64)

    logo_bytes = None
    if req.logo_base64:
        try:
            logo_bytes = base64.b64decode(req.logo_base64)
        except Exception:
            raise HTTPException(status_code=400, detail="Geçersiz logo verisi")
    elif req.use_event_logo:
        setting = await db.settings.find_one({"key": "event_logo", "is_deleted": False})
        if setting:
            logo_bytes, _ = get_object(setting["storage_path"])

    final_jpg = compose_print_image(caricature_bytes, logo_bytes)

    creation_id = str(uuid.uuid4())
    path = f"{APP_NAME}/creations/{creation_id}.jpg"
    result = put_object(path, final_jpg, "image/jpeg")
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


@api_router.get("/images/{creation_id}")
async def get_creation_image(creation_id: str):
    doc = await db.creations.find_one({"id": creation_id, "is_deleted": False})
    if not doc:
        raise HTTPException(status_code=404, detail="Görsel bulunamadı")
    data, content_type = get_object(doc["storage_path"])
    return Response(content=data, media_type="image/jpeg")


@api_router.delete("/creations/{creation_id}")
async def delete_creation(creation_id: str):
    res = await db.creations.update_one({"id": creation_id}, {"$set": {"is_deleted": True}})
    if res.matched_count == 0:
        raise HTTPException(status_code=404, detail="Görsel bulunamadı")
    return {"ok": True}


@api_router.post("/settings/logo")
async def upload_event_logo(file: UploadFile = File(...)):
    if not (file.content_type or "").startswith("image/"):
        raise HTTPException(status_code=400, detail="Sadece görsel dosyaları yüklenebilir")
    data = await file.read()
    if len(data) > 8 * 1024 * 1024:
        raise HTTPException(status_code=400, detail="Dosya çok büyük (max 8MB)")
    ext = (file.filename or "logo.png").rsplit(".", 1)[-1].lower()
    if ext not in ("png", "jpg", "jpeg", "webp"):
        ext = "png"
    path = f"{APP_NAME}/logo/{uuid.uuid4()}.{ext}"
    result = put_object(path, data, file.content_type)
    await db.settings.update_many({"key": "event_logo"}, {"$set": {"is_deleted": True}})
    await db.settings.insert_one({
        "key": "event_logo",
        "storage_path": result["path"],
        "content_type": file.content_type,
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
    data, content_type = get_object(setting["storage_path"])
    return Response(content=data, media_type=setting.get("content_type", content_type))


@api_router.delete("/settings/logo")
async def delete_event_logo():
    await db.settings.update_many({"key": "event_logo"}, {"$set": {"is_deleted": True}})
    return {"ok": True}


app.include_router(api_router)

app.add_middleware(
    CORSMiddleware,
    allow_credentials=True,
    allow_origins=os.environ.get('CORS_ORIGINS', '*').split(','),
    allow_methods=["*"],
    allow_headers=["*"],
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
