import { useCallback, useEffect, useRef, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { CheckCircle, LockKey, Scan } from "@phosphor-icons/react";
import { toast } from "sonner";
import { FilesetResolver, GestureRecognizer } from "@mediapipe/tasks-vision";
import EyeTracking from "@/components/ui/eye-tracking";
import SnapMark from "@/components/booth/SnapMark";
import { Input } from "@/components/ui/input";
import { api } from "@/lib/api";
import { playShutter, unlockAudio } from "@/lib/shutter";

const WASM_URL = "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@1.0.1/wasm";
const MODEL_URL =
  "https://storage.googleapis.com/mediapipe-models/gesture_recognizer/gesture_recognizer/float16/1/gesture_recognizer.task";
const HOLD_MS = 550;

const dist = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);

function isLSign(lm) {
  if (!lm || lm.length < 21) return false;
  const scale = dist(lm[0], lm[9]) || 1e-6;
  const indexExt = dist(lm[8], lm[0]) > dist(lm[6], lm[0]) && lm[8].y < lm[5].y;
  const middleFold = dist(lm[12], lm[0]) < dist(lm[10], lm[0]) * 1.25;
  const ringFold = dist(lm[16], lm[0]) < dist(lm[14], lm[0]) * 1.25;
  const pinkyFold = dist(lm[20], lm[0]) < dist(lm[18], lm[0]) * 1.25;
  const thumbExt = dist(lm[4], lm[5]) > scale * 0.55;
  const ix = lm[8].x - lm[5].x;
  const iy = lm[8].y - lm[5].y;
  const tx = lm[4].x - lm[2].x;
  const ty = lm[4].y - lm[2].y;
  const cos = (ix * tx + iy * ty) / (Math.hypot(ix, iy) * Math.hypot(tx, ty) || 1e-6);
  const angleOk = cos < 0.85;
  return indexExt && middleFold && ringFold && pinkyFold && thumbExt && angleOk;
}

export default function LoginGate({ onUnlock }) {
  const [stage, setStage] = useState("idle");
  const [progress, setProgress] = useState(0);
  const [showPin, setShowPin] = useState(false);
  const [pin, setPin] = useState("");
  const [pinBusy, setPinBusy] = useState(false);
  const videoRef = useRef(null);
  const streamRef = useRef(null);
  const recognizerRef = useRef(null);
  const rafRef = useRef(0);
  const heldRef = useRef(0);
  const lastTsRef = useRef(0);
  const doneRef = useRef(false);
  const verifyRef = useRef(() => {});
  const lastHandRef = useRef(0);
  const handTargetRef = useRef({
    x: typeof window !== "undefined" ? window.innerWidth / 2 : 0,
    y: typeof window !== "undefined" ? window.innerHeight / 2 : 0,
    active: false,
  });

  const cleanup = useCallback(() => {
    cancelAnimationFrame(rafRef.current);
    if (streamRef.current) streamRef.current.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
    recognizerRef.current?.close();
    recognizerRef.current = null;
  }, []);

  useEffect(() => cleanup, [cleanup]);

  const succeed = useCallback(() => {
    if (doneRef.current) return;
    doneRef.current = true;
    cleanup();
    playShutter();
    setStage("success");
    setTimeout(onUnlock, 1200);
  }, [cleanup, onUnlock]);

  const loop = useCallback(() => {
    const video = videoRef.current;
    const rec = recognizerRef.current;
    if (video && rec && video.readyState >= 2) {
      const now = performance.now();
      const dt = lastTsRef.current ? now - lastTsRef.current : 0;
      lastTsRef.current = now;
      try {
        const res = rec.recognizeForVideo(video, now);
        const lm = res.landmarks?.[0]?.[9];
        if (lm) {
          handTargetRef.current = {
            x: (1 - lm.x) * window.innerWidth,
            y: lm.y * window.innerHeight,
            active: true,
          };
          lastHandRef.current = now;
        } else if (now - lastHandRef.current > 800) {
          handTargetRef.current.active = false;
        }
        const g = res.landmarks?.[0];
        if (isLSign(g)) {
          heldRef.current = Math.min(HOLD_MS, heldRef.current + dt);
        } else {
          heldRef.current = Math.max(0, heldRef.current - dt * 0.5);
        }
        const p = heldRef.current / HOLD_MS;
        setProgress(p);
        if (p >= 1) {
          verifyRef.current();
          return;
        }
      } catch (e) {
        // frame error, keep looping
      }
    }
    rafRef.current = requestAnimationFrame(loop);
  }, [succeed]);

  const verifyFrame = useCallback(async () => {
    cancelAnimationFrame(rafRef.current);
    setStage("verifying");
    try {
      const video = videoRef.current;
      if (!video || !video.videoWidth) throw new Error("video not ready");
      const canvas = document.createElement("canvas");
      canvas.width = video.videoWidth;
      canvas.height = video.videoHeight;
      canvas.getContext("2d").drawImage(video, 0, 0);
      const b64 = canvas.toDataURL("image/jpeg", 0.85).split(",")[1];
      const res = await api.post("/auth/verify-gesture", { image_base64: b64 });
      if (res.data.ok) {
        succeed();
        return;
      }
      toast.error("İşaret doğrulanamadı — L işaretini tekrar göster");
    } catch (err) {
      toast.error(err?.response?.data?.detail || "Doğrulama başarısız, tekrar dene");
    }
    heldRef.current = HOLD_MS * 0.5;
    setProgress(0.5);
    setStage("scanning");
    lastTsRef.current = 0;
    rafRef.current = requestAnimationFrame(loop);
  }, [succeed, loop]);

  useEffect(() => {
    verifyRef.current = verifyFrame;
  }, [verifyFrame]);

  const startScan = async () => {
    unlockAudio();
    setStage("scanning");
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: "user", width: { ideal: 640 } },
        audio: false,
      });
      streamRef.current = stream;
      videoRef.current.srcObject = stream;
      await videoRef.current.play();
      const vision = await FilesetResolver.forVisionTasks(WASM_URL);
      const options = {
        baseOptions: { modelAssetPath: MODEL_URL, delegate: "GPU" },
        runningMode: "VIDEO",
        numHands: 1,
        minHandDetectionConfidence: 0.3,
        minHandPresenceConfidence: 0.3,
        minTrackingConfidence: 0.3,
      };
      try {
        recognizerRef.current = await GestureRecognizer.createFromOptions(vision, options);
      } catch (gpuErr) {
        options.baseOptions.delegate = "CPU";
        recognizerRef.current = await GestureRecognizer.createFromOptions(vision, options);
      }
      lastTsRef.current = 0;
      rafRef.current = requestAnimationFrame(loop);
    } catch (e) {
      console.error(e);
      toast.error("Kamera veya el tanıma başlatılamadı — PIN ile giriş yapabilirsiniz");
      setShowPin(true);
    }
  };

  const submitPin = async () => {
    setPinBusy(true);
    try {
      await api.post("/auth/verify-pin", null, { headers: { "X-Admin-Pin": pin } });
      succeed();
    } catch (err) {
      toast.error(
        err?.response?.status === 401
          ? "Geçersiz PIN"
          : err?.response?.status === 429
          ? "Çok fazla deneme, lütfen bekleyin"
          : "Giriş başarısız"
      );
      setPin("");
    } finally {
      setPinBusy(false);
    }
  };

  return (
    <div
      data-testid="login-gate"
      className="relative h-full w-full flex flex-col items-center justify-center bg-black overflow-hidden px-6"
    >
      <video ref={videoRef} playsInline muted className="hidden" />
      <div
        className="absolute inset-0 opacity-25 pointer-events-none"
        style={{
          background:
            "radial-gradient(ellipse 60% 45% at 50% 40%, rgba(0,229,255,0.18), transparent)",
        }}
      />

      <motion.p
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        className="text-white/50 tracking-[0.4em] text-xs uppercase mb-3"
      >
        Plena Studio presents
      </motion.p>
      <motion.div
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        className="flex items-center gap-3"
      >
        <span className="font-display font-black tracking-tighter text-4xl sm:text-5xl attract-glow">
          PLENA <span className="text-[#00E5FF]">SNAP</span>
        </span>
        <SnapMark size={36} />
      </motion.div>

      <AnimatePresence mode="wait">
        {stage === "idle" && (
          <motion.div
            key="idle"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="flex flex-col items-center"
          >
            <button
              data-testid="login-btn"
              onClick={startScan}
              className="relative mt-12 h-14 px-14 rounded-full bg-[#00E5FF] text-black font-semibold tracking-[0.3em] active:scale-95 transition-transform"
            >
              <span className="absolute inset-0 rounded-full bg-[#00E5FF] pulse-ring" />
              <span className="relative">LOGIN</span>
            </button>
          </motion.div>
        )}

        {(stage === "scanning" || stage === "verifying") && (
          <motion.div
            key="scanning"
            initial={{ opacity: 0, scale: 0.9 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0 }}
            className="flex flex-col items-center mt-10"
            data-testid="login-scanning"
          >
            <EyeTracking
              eyeCount={2}
              eyeSize={130}
              gap={36}
              variant="cyber"
              irisColor="#00E5FF"
              irisColorSecondary="#2E6BF0"
              blinkInterval={4200}
              externalTarget={handTargetRef}
              squint={stage === "verifying" ? 1 : progress}
              glow={stage === "verifying"}
            />
            <div className="mt-8 flex items-center gap-2 text-[#A1A1AA] text-sm">
              <Scan size={22} weight="duotone" color="#00E5FF" />
              <span data-testid="gesture-hint">
                {stage === "verifying"
                  ? "Doğrulanıyor..."
                  : "Ne yapman gerektiğini biliyorsun..."}
              </span>
            </div>
            <div className="mt-4 w-56 h-1.5 rounded-full bg-white/10 overflow-hidden">
              <div
                data-testid="gesture-progress"
                className="h-full bg-[#00E5FF] transition-[width] duration-100"
                style={{ width: `${Math.round(progress * 100)}%` }}
              />
            </div>
          </motion.div>
        )}

        {stage === "success" && (
          <motion.div
            key="success"
            initial={{ opacity: 0, scale: 0.8 }}
            animate={{ opacity: 1, scale: 1 }}
            className="flex flex-col items-center mt-12"
            data-testid="login-success"
          >
            <CheckCircle size={64} weight="duotone" color="#00E5FF" />
            <p className="mt-4 text-[#00E5FF] tracking-[0.3em] uppercase text-sm">
              Erişim Onaylandı
            </p>
          </motion.div>
        )}
      </AnimatePresence>

      {stage === "success" && (
        <motion.div
          className="pointer-events-none fixed inset-0 z-40 bg-white"
          initial={{ opacity: 0 }}
          animate={{ opacity: [0, 0.7, 0] }}
          transition={{ duration: 0.7 }}
        />
      )}

      {stage !== "success" && (
        <div className="absolute bottom-8 flex flex-col items-center gap-3">
          {showPin ? (
            <div className="flex gap-2 items-center" data-testid="pin-fallback-panel">
              <div className="flex items-center gap-2 rounded-xl border border-white/10 bg-white/5 px-3">
                <LockKey size={16} weight="duotone" color="#00E5FF" />
                <Input
                  data-testid="login-pin-input"
                  type="password"
                  inputMode="numeric"
                  autoComplete="off"
                  placeholder="Yönetici PIN'i"
                  value={pin}
                  onChange={(e) => setPin(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && pin && submitPin()}
                  className="border-0 bg-transparent text-white placeholder:text-white/30 focus-visible:ring-0 w-36"
                />
              </div>
              <button
                data-testid="login-pin-submit"
                onClick={submitPin}
                disabled={!pin || pinBusy}
                className="h-11 px-5 rounded-xl bg-[#00E5FF] text-black font-semibold active:scale-95 transition-transform disabled:opacity-40"
              >
                {pinBusy ? "..." : "Gir"}
              </button>
            </div>
          ) : (
            <button
              data-testid="pin-fallback-btn"
              onClick={() => setShowPin(true)}
              className="text-xs text-white/30 hover:text-white/60 transition-colors tracking-wide"
            >
              Ekip girişi (PIN)
            </button>
          )}
        </div>
      )}
    </div>
  );
}
