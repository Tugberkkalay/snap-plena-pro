import { useEffect, useState } from "react";
import { motion } from "framer-motion";
import { ArrowLeft, DownloadSimple, Printer, X } from "@phosphor-icons/react";
import { toast } from "sonner";
import { API, api } from "@/lib/api";

export default function GalleryView({ onBack, onPrint }) {
  const [creations, setCreations] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState(null);

  useEffect(() => {
    api
      .get("/creations")
      .then((res) => setCreations(res.data))
      .catch(() => toast.error("Galeri yüklenemedi"))
      .finally(() => setLoading(false));
  }, []);

  const download = async (id) => {
    try {
      const res = await api.get(`/images/${id}`, { responseType: "blob" });
      const url = URL.createObjectURL(res.data);
      const a = document.createElement("a");
      a.href = url;
      a.download = `karikatur-${id}.jpg`;
      a.click();
      URL.revokeObjectURL(url);
    } catch {
      toast.error("İndirme başarısız");
    }
  };

  return (
    <div className="h-full w-full flex flex-col px-5 pt-5 pb-6" data-testid="gallery-view">
      <div className="flex items-center gap-4 mb-5">
        <button
          data-testid="gallery-back-btn"
          onClick={onBack}
          className="h-11 w-11 rounded-full glass-dock flex items-center justify-center active:scale-95 transition-transform"
        >
          <ArrowLeft size={20} weight="bold" color="#fff" />
        </button>
        <h2 className="font-display font-bold tracking-tighter text-lg md:text-lg">Son Karikatürler</h2>
      </div>

      <div className="flex-1 overflow-y-auto">
        {loading ? (
          <p className="text-[#A1A1AA] text-sm">Yükleniyor...</p>
        ) : creations.length === 0 ? (
          <div className="h-full flex flex-col items-center justify-center text-center" data-testid="gallery-empty">
            <p className="text-[#A1A1AA] text-base">Henüz karikatür oluşturulmadı.</p>
            <p className="text-white/30 text-sm mt-2">İlk fotoğrafını çek ve başla!</p>
          </div>
        ) : (
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
            {creations.map((c, i) => (
              <motion.button
                key={c.id}
                data-testid={`gallery-item-${c.id}`}
                initial={{ opacity: 0, y: 16 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: Math.min(i * 0.05, 0.5) }}
                onClick={() => setSelected(c)}
                className="aspect-[2/3] rounded-xl overflow-hidden border border-white/10 active:scale-95 transition-transform"
              >
                <img src={`${API}/images/${c.id}`} alt="Karikatür" loading="lazy" className="h-full w-full object-cover" />
              </motion.button>
            ))}
          </div>
        )}
      </div>

      {selected && (
        <div className="fixed inset-0 z-50 bg-black/85 flex flex-col items-center justify-center p-5" data-testid="gallery-detail-modal">
          <button
            data-testid="gallery-detail-close"
            onClick={() => setSelected(null)}
            className="absolute top-5 right-5 h-11 w-11 rounded-full glass-dock flex items-center justify-center active:scale-95 transition-transform"
          >
            <X size={20} weight="bold" color="#fff" />
          </button>
          <img
            src={`${API}/images/${selected.id}`}
            alt="Karikatür detay"
            className="max-h-[70vh] rounded-2xl border border-white/10 object-contain"
          />
          <div className="flex gap-3 mt-5">
            <button
              data-testid="gallery-print-btn"
              onClick={() => onPrint(`${API}/images/${selected.id}`)}
              className="h-13 px-6 py-3 rounded-full bg-[#00E5FF] text-black font-semibold flex items-center gap-2 active:scale-95 transition-transform"
            >
              <Printer size={20} weight="bold" />
              Yazdır
            </button>
            <button
              data-testid="gallery-download-btn"
              onClick={() => download(selected.id)}
              className="h-13 px-6 py-3 rounded-full glass-dock font-medium flex items-center gap-2 active:scale-95 transition-transform"
            >
              <DownloadSimple size={20} weight="bold" />
              İndir
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
