import { useEffect, useRef, useState } from "react";
import { ArrowLeft, Camera, CameraRotate, UploadSimple } from "@phosphor-icons/react";
import { toast } from "sonner";

export default function CameraView({ onCapture, onBack }) {
  const videoRef = useRef(null);
  const streamRef = useRef(null);
  const fileRef = useRef(null);
  const [facingMode, setFacingMode] = useState("user");
  const [cameraReady, setCameraReady] = useState(false);
  const [flash, setFlash] = useState(false);

  useEffect(() => {
    let cancelled = false;
    const start = async () => {
      setCameraReady(false);
      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode, width: { ideal: 1920 }, height: { ideal: 1080 } },
          audio: false,
        });
        if (cancelled) {
          stream.getTracks().forEach((t) => t.stop());
          return;
        }
        streamRef.current = stream;
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          await videoRef.current.play();
        }
        setCameraReady(true);
      } catch (e) {
        console.error(e);
        toast.error("Kameraya erişilemedi. Galeriden fotoğraf yükleyebilirsiniz.");
      }
    };
    start();
    return () => {
      cancelled = true;
      if (streamRef.current) streamRef.current.getTracks().forEach((t) => t.stop());
    };
  }, [facingMode]);

  const capture = () => {
    const video = videoRef.current;
    if (!video || !cameraReady) return;
    setFlash(true);
    setTimeout(() => setFlash(false), 320);
    const canvas = document.createElement("canvas");
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    const ctx = canvas.getContext("2d");
    if (facingMode === "user") {
      ctx.translate(canvas.width, 0);
      ctx.scale(-1, 1);
    }
    ctx.drawImage(video, 0, 0);
    onCapture(canvas.toDataURL("image/jpeg", 0.92));
  };

  const handleFile = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!file.type.startsWith("image/")) {
      toast.error("Lütfen bir görsel dosyası seçin");
      return;
    }
    const reader = new FileReader();
    reader.onload = () => onCapture(reader.result);
    reader.readAsDataURL(file);
    e.target.value = "";
  };

  return (
    <div className="relative h-full w-full" data-testid="camera-view">
      <video
        ref={videoRef}
        playsInline
        muted
        className="absolute inset-0 h-full w-full object-cover"
        style={{ transform: facingMode === "user" ? "scaleX(-1)" : "none" }}
      />
      {!cameraReady && (
        <div className="absolute inset-0 flex items-center justify-center bg-[#0A0A0A]">
          <p className="text-[#A1A1AA] text-sm tracking-wide">Kamera başlatılıyor...</p>
        </div>
      )}
      {flash && <div className="absolute inset-0 bg-white z-50 shutter-flash" />}

      <div className="absolute top-0 left-0 right-0 flex items-center justify-between px-5 pt-5 z-10">
        <button
          data-testid="camera-back-btn"
          onClick={onBack}
          className="h-11 w-11 rounded-full glass-dock flex items-center justify-center active:scale-95 transition-transform"
        >
          <ArrowLeft size={20} weight="bold" color="#fff" />
        </button>
        <span className="glass-dock rounded-full px-4 py-2 text-xs tracking-[0.2em] uppercase">
          Fotoğraf Çek
        </span>
        <span className="w-11" />
      </div>

      <div className="absolute bottom-0 left-0 right-0 flex justify-center pb-8 z-10" style={{ paddingBottom: "calc(2rem + env(safe-area-inset-bottom))" }}>
        <div className="glass-dock rounded-full px-6 py-4 flex items-center gap-8">
          <button
            data-testid="upload-photo-btn"
            onClick={() => fileRef.current?.click()}
            className="h-12 w-12 rounded-full bg-white/10 flex items-center justify-center active:scale-95 transition-transform"
          >
            <UploadSimple size={22} weight="duotone" color="#fff" />
          </button>
          <button
            data-testid="shutter-btn"
            onClick={capture}
            className="h-[72px] w-[72px] rounded-full bg-[#00E5FF] flex items-center justify-center border-4 border-white/30 active:scale-90 transition-transform"
          >
            <Camera size={30} weight="bold" color="#0A0A0A" />
          </button>
          <button
            data-testid="flip-camera-btn"
            onClick={() => setFacingMode((m) => (m === "user" ? "environment" : "user"))}
            className="h-12 w-12 rounded-full bg-white/10 flex items-center justify-center active:scale-95 transition-transform"
          >
            <CameraRotate size={22} weight="duotone" color="#fff" />
          </button>
        </div>
      </div>
      <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={handleFile} data-testid="photo-file-input" />
    </div>
  );
}
