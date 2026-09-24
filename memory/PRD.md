# KarikaBooth — PRD

## Orijinal Problem
Etkinlik/yazılım lansmanı için fotoğraf çekip, o fotoğrafı şirket logolarıyla karikatüre çeviren ve taşınabilir fotoğraf baskı makinesinden çıktı alınabilen, tam responsive web uygulaması. (Türkçe arayüz)

## Kullanıcı Seçimleri
- AI Model: Gemini Nano Banana (gemini-3.1-flash-image-preview, EMERGENT_LLM_KEY)
- Logo: Hem kalıcı etkinlik logosu hem fotoğraf başına özel logo
- Fotoğraf: Kamera (ön/arka) + galeriden yükleme
- Çıktı: Taşınabilir fotoğraf yazıcı → 10x15 cm (4x6") portre, 1200x1800 px @ 300 DPI JPG; tarayıcı yazdırma (@page 4in 6in) + JPG indirme
- Stil: Tek sabit, özenle yazılmış karikatür promptu (lansman/konfeti/sahne temalı)

## Mimari
- Backend: FastAPI (/api prefix), MongoDB (creations + settings, uuid id, soft-delete), Emergent Object Storage (görseller), emergentintegrations LlmChat (Gemini image edit)
- Frontend: React, state machine (attract → capture → confirm → processing → result / gallery), Tailwind + shadcn Dialog + sonner + framer-motion + @phosphor-icons
- Tasarım: /app/design_guidelines.json — dark obsidian (#0A0A0A) + electric cyan (#00E5FF), Cabinet Grotesk / Outfit, glassmorphism dock, scanline/tracing-beam işleme animasyonu
- Baskı: App.js'te global .print-area + @media print (yalnızca 4x6 görsel yazdırılır)

## API Endpoints
- GET /api/ — health
- POST /api/caricature — {image_base64, use_event_logo, logo_base64?} → Gemini karikatür + PIL 1200x1800 kompozit + logo sağ alt → {id, created_at, image_base64}
- GET /api/creations, GET /api/images/{id}, DELETE /api/creations/{id}
- POST/GET/DELETE /api/settings/logo, GET /api/logo-image

## Uygulananlar (29 Haziran 2026 dönemi — MVP)
- ✅ Attract ekranı, kamera (ön/arka, flaş efekti, ayna), galeri yükleme fallback
- ✅ Onay ekranı: logo modu (etkinlik/özel/logosuz)
- ✅ Gemini karikatür üretimi + 4x6 baskı kompoziti + logo bindirme
- ✅ Yazdır (window.print, 4in 6in) + JPG indirme
- ✅ Galeri (son 100), detay modal (yazdır/indir), soft-delete API
- ✅ Etkinlik logosu ayarları (yükle/değiştir/kaldır)
- ✅ Test: iteration_1.json — backend 16/16, frontend %100
- ✅ Geçersiz/aşırı büyük görsel doğrulaması (LLM kredisi koruması)

## Logo Yerleşim Özelliği (2. iterasyon)
- ✅ Plena Pro logosu (1515x570 şeffaf PNG) sabit etkinlik logosu olarak yüklendi
- ✅ logo_placement seçenekleri: corner (PIL, beyaz plaka üstünde köşe damgası) | flag (bayrak tutar) | banner (sahne LED ekranı) | tshirt (tişört baskısı)
- ✅ Sahne yerleşimlerinde logo Gemini'ye 2. referans görsel olarak gönderilir (PLACEMENT_PROMPTS), köşe bindirme yapılmaz
- ✅ Literal enum doğrulaması (geçersiz değer → 422, logosuz baskı riski yok)
- ✅ Test: iteration_2.json — backend 13/13, frontend 10/10 (banner yerleşimi gerçek üretimle E2E doğrulandı)

## Güvenlik Sıkılaştırması (3. iterasyon)
- ✅ Admin PIN koruması: POST/DELETE /api/settings/logo ve DELETE /api/creations/{id} artık X-Admin-Pin header ister (hmac.compare_digest, zamanlama-güvenli). PIN: backend/.env ADMIN_PIN (bkz. test_credentials.md)
- ✅ IP bazlı rate limiting (in-memory): caricature 5/dk, admin işlemleri 10/dk → 429
- ✅ Logo yüklemede PIL ile gerçek bayt doğrulaması (sahte content-type → 400, sadece png/jpeg/webp); caricature logo_base64 de PIL ile doğrulanır
- ✅ CORS: allow_credentials kaldırıldı, metodlar GET/POST/DELETE/OPTIONS, header'lar Content-Type + X-Admin-Pin ile sınırlandı
- ✅ Ayarlar penceresine PIN girişi eklendi; yükle/sil butonları PIN girilmeden devre dışı
- ✅ Test: iteration_3.json — backend 14/14 güvenlik testi, frontend tüm PIN akışları (0 LLM kredisi harcandı)
- Plena logosu kalıcı yedeği: /app/assets/plena_logo.png

## Galeri Silme + Performans (4. iterasyon)
- ✅ Galeri detay modalına PIN korumalı "Sil" butonu (delete-confirm-panel, yanlış PIN'de alan temizlenir)
- ✅ Performans: storage çağrıları asyncio.to_thread'e taşındı (görseller artık paralel yüklenir), /api/images/{id} yanıtlarına Cache-Control eklendi (preview edge'i override eder, production'da etkili)
- ✅ Test: iteration_4.json — backend 5/5, frontend %100 (0 LLM kredisi)

## PLENA SNAP Rebrand (5. iterasyon)
- ✅ Marka hiyerarşisi (hibrit): Açılışta "PLENA STUDIO presents / SNAP / HR VISION '26 Experience", arayüzde kompakt "PLENA SNAP"
- ✅ SnapMark: Plena bar renklerinden (mavi/sarı/yeşil/kırmızı) türetilen flaş/deklanşör SVG işareti (components/booth/SnapMark.jsx + public/snap-icon.svg favicon)
- ✅ Sekme başlığı "PLENA SNAP · HR VISION '26", meta description, favicon
- ✅ Metinler: "SNAP Hazırlanıyor", "SNAP'in Hazır!", "SNAP Galerisi", indirme dosya adı plena-snap-{id}.jpg
- ✅ Baskı çıktısı değişmedi (kullanıcı tercihi: sadece Plena logosu)
- Renk kimliği: koyu + cyan korundu (kullanıcı tercihi)
- İleride: snap.plena.pro özel domain deploy sırasında bağlanabilir

## QR + Slayt + Sinematik (6. iterasyon)
- ✅ QR paylaşım: Sonuç ekranında QR (qrcode.react) → /api/share/{id} markalı HTML sayfası + ?dl=1 ile Content-Disposition indirme; OG meta etiketleri; HEAD desteği
- ✅ Slayt gösterisi: Galeriden "Slayt" → tam ekran, 6 sn döngü + Ken Burns, 60 sn'de bir yeni SNAP'leri çeker, marka imzası + sayaç
- ✅ Açılış sinematiği: SNAP harfleri spring ile tek tek patlar + SnapMark pop + deklanşör flaşı
- ✅ Test: iteration_5.json — backend 7/7, frontend %100 (1 Gemini üretimi)

## Sinematik Login Kapısı (7. iterasyon)
- ✅ Siyah ekran + PLENA SNAP + LOGIN; tıklanınca ÇİFT cyber göz (eye-tracking.jsx, kullanıcının verdiği komponent JSX'e çevrildi)
- ✅ Kamera gizli açılır; gözler MOUSE'u DEĞİL kameradaki ELİ takip eder (externalTarget ref, el yokken idle animasyon)
- ✅ "L" işareti (başparmak+işaret): MediaPipe tasks-vision@1.0.1 landmark geometrisi (isLSign) ~900ms progress → tek kare Gemini VLM teyidi (POST /api/auth/verify-gesture, gemini-3-flash-preview, YES/NO)
- ✅ PIN fallback: "Ekip girişi (PIN)" → POST /api/auth/verify-pin (X-Admin-Pin)
- ✅ Kilit: sessionStorage snap_unlocked; Attract header'da ÇIKIŞ butonu (logout-btn) → kapıya döner
- ✅ Login başarısında ve fotoğraf çekiminde deklanşör: beyaz flaş + WebAudio sentez deklanşör sesi (lib/shutter.js)
- ✅ Test: iteration_6.json — backend 8/8 (VLM: L fotoğrafı YES, logo NO), frontend %100 (oturum kalıcılığı, kilit izolasyonu, regresyon)
- Test görselleri: /app/assets/l_sign_test.jpg, /app/assets/plena_logo.png
- Not: Gerçek L-jesti headless test edilemez — kullanıcı gerçek cihazda deneyecek

## Instax Mini + Mobil İndirme + Kütüphane İsmi (8. iterasyon)
- ✅ Baskı formatı Instax Mini Link'e geçti: 1200x1600 (3:4, 62x46mm / 800x600 native'in 2 katı); prompt 3:4; @page 46mm 62mm; önizleme ve galeri aspect-[3/4]
- ✅ Mobil indirme düzeltildi: Web Share API öncelikli (paylaşım menüsü → doğrudan Instax uygulamasına), fallback /api/images/{id}?dl=1 (Content-Disposition) — lib/download.js
- ✅ Kütüphane ismi: onay ekranında opsiyonel isim (fotoğrafta ASLA görünmez), galeride overlay + modal, dosya adında slug (Türkçe karakterler ASCII'ye çevrilir: Ayşe→Ayse), 40 karakter limit uçtan uca
- ✅ Test: iteration_8.json — backend 6/6, frontend %100 (1 üretim; 3:4 oran ölçüldü 0.750, isim görselde yok doğrulandı)

## Galeri Arama + Instax Çerçevesi (9. iterasyon)
- ✅ Galeri isim arama: anlık client-side filtre, Türkçe locale + aksan-duyarsız (cerceve→Çerçeve), temizle butonu, eşleşme-yok durumu
- ✅ Instax Çerçevesi (opsiyonel, frame:bool): 30px beyaz kenarlık + 150px alt şerit (Plena logosu solda, "PLENA SNAP · HR VISION '26" sağda, Liberation Sans Bold); çerçeve modunda köşe logosu şeride taşınır
- ✅ Onay ekranında "Baskı stili" seçimi: Tam Kare (varsayılan) / Instax Çerçevesi
- ✅ Test: iteration_9.json — backend 5/5 (piksel doğrulama), frontend %100 (0 LLM kredisi)
- Bilinen sınırlamalar: rate limit bellek içi (restart'ta sıfırlanır, tek pod için yeterli); CORS_ORIGINS env'de "*" (preview edge proxy zaten override ediyor, deploy'da domain'e sabitlenebilir)

## Backlog / Sonraki Adımlar
- P1: Kalabalık etkinlik için kiosk/tam ekran kilidi modu
- P1: QR kod ile misafirin karikatürünü telefonuna indirmesi
- P2: Birden fazla karikatür stili seçeneği (admin'den prompt düzenleme)
- P2: Galeri sayfalama (>100), yönetici için toplu silme
- P2: Storage çağrılarını asyncio.to_thread ile event loop dışına alma
- P2: /api/caricature rate limiting

## Notlar
- Auth yok (etkinlik kiosk uygulaması), test_credentials.md boş — geçerli
- Gemini üretimi ~10-40 sn; frontend timeout 180 sn
- Test suite: cd /app/backend && python -m pytest tests/backend_test.py -v (üretim testleri kredi harcar, atlamak için -k 'not caricature_with')
