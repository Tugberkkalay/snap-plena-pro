import { useEffect, useState, useCallback } from "react";
import "@/App.css";
import { Toaster, toast } from "sonner";
import { api } from "@/lib/api";
import AttractScreen from "@/components/booth/AttractScreen";
import CameraView from "@/components/booth/CameraView";
import ConfirmView from "@/components/booth/ConfirmView";
import ProcessingView from "@/components/booth/ProcessingView";
import ResultView from "@/components/booth/ResultView";
import GalleryView from "@/components/booth/GalleryView";
import SlideshowView from "@/components/booth/SlideshowView";
import SettingsSheet from "@/components/booth/SettingsSheet";
import LoginGate from "@/components/booth/LoginGate";

function App() {
  const [view, setView] = useState("attract");
  const [photo, setPhoto] = useState(null);
  const [result, setResult] = useState(null);
  const [eventLogoExists, setEventLogoExists] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [printSrc, setPrintSrc] = useState(null);
  const [unlocked, setUnlocked] = useState(
    () => sessionStorage.getItem("snap_unlocked") === "1"
  );

  const handleUnlock = () => {
    sessionStorage.setItem("snap_unlocked", "1");
    setUnlocked(true);
  };

  const handleLogout = () => {
    sessionStorage.removeItem("snap_unlocked");
    setUnlocked(false);
    setView("attract");
  };

  const refreshLogo = useCallback(async () => {
    try {
      const res = await api.get("/settings/logo");
      setEventLogoExists(res.data.exists);
    } catch (e) {
      console.error(e);
    }
  }, []);

  useEffect(() => {
    refreshLogo();
  }, [refreshLogo]);

  useEffect(() => {
    if (!printSrc) return;
    const img = new Image();
    img.onload = () => setTimeout(() => window.print(), 150);
    img.onerror = () => toast.error("Yazdırma için görsel yüklenemedi");
    img.src = printSrc;
  }, [printSrc]);

  const handlePrint = (src) => {
    if (printSrc === src) {
      setTimeout(() => window.print(), 100);
    } else {
      setPrintSrc(src);
    }
  };

  const handleCapture = (dataUrl) => {
    setPhoto(dataUrl);
    setView("confirm");
  };

  const handleGenerate = async ({ logoMode, customLogoB64, placement, name, frame }) => {
    setView("processing");
    try {
      const res = await api.post("/caricature", {
        image_base64: photo.split(",")[1],
        use_event_logo: logoMode === "event",
        logo_base64: logoMode === "custom" ? customLogoB64.split(",")[1] : null,
        logo_placement: logoMode === "none" ? "corner" : placement || "corner",
        name: name?.trim() || null,
        frame: !!frame,
      });
      setResult(res.data);
      setView("result");
      toast.success("SNAP'iniz hazır!");
    } catch (e) {
      console.error(e);
      toast.error(e?.response?.data?.detail || "Karikatür oluşturulamadı, lütfen tekrar deneyin");
      setView("confirm");
    }
  };

  return (
    <>
      <div className="app-shell h-[100dvh] w-full overflow-hidden bg-[#0A0A0A] text-white">
        <Toaster position="top-center" richColors />
        {!unlocked ? (
          <LoginGate onUnlock={handleUnlock} />
        ) : (
          <>
        {view === "attract" && (
          <AttractScreen
            onStart={() => setView("capture")}
            onGallery={() => setView("gallery")}
            onSettings={() => setSettingsOpen(true)}
            onLogout={handleLogout}
          />
        )}
        {view === "capture" && (
          <CameraView onCapture={handleCapture} onBack={() => setView("attract")} />
        )}
        {view === "confirm" && (
          <ConfirmView
            photo={photo}
            eventLogoExists={eventLogoExists}
            onGenerate={handleGenerate}
            onRetake={() => setView("capture")}
          />
        )}
        {view === "processing" && <ProcessingView photo={photo} />}
        {view === "result" && (
          <ResultView
            result={result}
            onPrint={handlePrint}
            onNew={() => {
              setPhoto(null);
              setResult(null);
              setView("capture");
            }}
            onHome={() => setView("attract")}
            onGallery={() => setView("gallery")}
          />
        )}
        {view === "gallery" && (
          <GalleryView
            onBack={() => setView("attract")}
            onPrint={handlePrint}
            onSlideshow={() => setView("slideshow")}
          />
        )}
        {view === "slideshow" && <SlideshowView onExit={() => setView("gallery")} />}
        <SettingsSheet
          open={settingsOpen}
          onOpenChange={setSettingsOpen}
          eventLogoExists={eventLogoExists}
          refreshLogo={refreshLogo}
        />
          </>
        )}
      </div>
      <div className="print-area" data-testid="print-area">
        {printSrc && <img src={printSrc} alt="Baskı" />}
      </div>
    </>
  );
}

export default App;
