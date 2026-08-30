import { useEffect, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { X } from "@phosphor-icons/react";
import { API, api } from "@/lib/api";
import SnapMark from "@/components/booth/SnapMark";

export default function SlideshowView({ onExit }) {
  const [creations, setCreations] = useState([]);
  const [index, setIndex] = useState(0);

  useEffect(() => {
    const load = () =>
      api.get("/creations").then((r) => setCreations(r.data)).catch(() => {});
    load();
    const t = setInterval(load, 60000);
    return () => clearInterval(t);
  }, []);

  useEffect(() => {
    if (creations.length < 2) return;
    const t = setInterval(() => setIndex((i) => (i + 1) % creations.length), 6000);
    return () => clearInterval(t);
  }, [creations.length]);

  useEffect(() => {
    document.documentElement.requestFullscreen?.().catch(() => {});
    const onKey = (e) => e.key === "Escape" && onExit();
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("keydown", onKey);
      if (document.fullscreenElement) document.exitFullscreen?.().catch(() => {});
    };
  }, [onExit]);

  useEffect(() => {
    if (!creations.length) return;
    const next = creations[(index + 1) % creations.length];
    if (next) {
      const img = new Image();
      img.src = `${API}/images/${next.id}`;
    }
  }, [index, creations]);

  const current = creations.length ? creations[index % creations.length] : null;

  return (
    <div className="fixed inset-0 z-50 bg-black overflow-hidden" data-testid="slideshow-view" onClick={onExit}>
      <AnimatePresence>
        {current && (
          <motion.img
            key={current.id}
            src={`${API}/images/${current.id}`}
            alt="SNAP"
            initial={{ opacity: 0, scale: 1 }}
            animate={{ opacity: 1, scale: 1.06 }}
            exit={{ opacity: 0 }}
            transition={{ opacity: { duration: 1 }, scale: { duration: 6.5, ease: "linear" } }}
            className="absolute inset-0 h-full w-full object-contain"
          />
        )}
      </AnimatePresence>
      {!current && (
        <div className="absolute inset-0 flex items-center justify-center">
          <p className="text-[#A1A1AA]" data-testid="slideshow-empty">Henüz SNAP yok — ilk fotoğrafı çekin!</p>
        </div>
      )}

      <div className="absolute bottom-6 left-6 flex items-center gap-3 glass-dock rounded-full px-5 py-3 pointer-events-none">
        <SnapMark size={22} />
        <div className="leading-tight">
          <p className="font-display font-bold tracking-tighter text-sm">
            PLENA <span className="text-[#00E5FF]">SNAP</span>
          </p>
          <p className="text-[10px] tracking-[0.25em] uppercase text-white/50">{"HR Vision '26"}</p>
        </div>
        {creations.length > 0 && (
          <span className="text-xs text-white/40 ml-2" data-testid="slideshow-counter">
            {(index % creations.length) + 1} / {creations.length}
          </span>
        )}
      </div>

      <button
        data-testid="slideshow-exit"
        onClick={(e) => {
          e.stopPropagation();
          onExit();
        }}
        className="absolute top-5 right-5 h-11 w-11 rounded-full glass-dock flex items-center justify-center active:scale-95 transition-transform"
      >
        <X size={20} weight="bold" color="#fff" />
      </button>
    </div>
  );
}
