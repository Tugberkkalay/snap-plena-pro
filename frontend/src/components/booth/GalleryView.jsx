import { useEffect, useState } from "react";
import { motion } from "framer-motion";
import { ArrowLeft, DownloadSimple, LockKey, Printer, Trash, X } from "@phosphor-icons/react";
import { toast } from "sonner";
import { Input } from "@/components/ui/input";
import { API, api } from "@/lib/api";

export default function GalleryView({ onBack, onPrint }) {
  const [creations, setCreations] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState(null);
  const [deleteMode, setDeleteMode] = useState(false);
  const [pin, setPin] = useState("");
  const [deleting, setDeleting] = useState(false);

  const closeDetail = () => {
    setSelected(null);
    setDeleteMode(false);
    setPin("");
  };

  const confirmDelete = async () => {
    setDeleting(true);
    try {
      await api.delete(`/creations/${selected.id}`, { headers: { "X-Admin-Pin": pin } });
      setCreations((prev) => prev.filter((c) => c.id !== selected.id));
      closeDetail();
      toast.success("Karikatür silindi");
    } catch (err) {
      if (err?.response?.status === 401) setPin("");
      toast.error(
        err?.response?.status === 401
          ? "Geçersiz yönetici PIN'i"
          : err?.response?.status === 429
          ? "Çok fazla deneme, lütfen biraz bekleyin"
          : "Silme başarısız"
      );
    } finally {
      setDeleting(false);
    }
  };

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
            onClick={closeDetail}
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
            <button
              data-testid="gallery-delete-btn"
              onClick={() => setDeleteMode((v) => !v)}
              className="h-13 px-5 py-3 rounded-full bg-[#FF3B30]/15 text-[#FF3B30] font-medium flex items-center gap-2 active:scale-95 transition-transform"
            >
              <Trash size={20} weight="bold" />
              Sil
            </button>
          </div>
          {deleteMode && (
            <div className="mt-4 w-full max-w-sm glass-dock rounded-2xl p-4" data-testid="delete-confirm-panel">
              <p className="text-sm text-white/70 mb-3">Silmek için yönetici PIN'i girin:</p>
              <div className="flex gap-2">
                <div className="flex-1 flex items-center gap-2 rounded-xl border border-white/10 bg-white/5 px-3">
                  <LockKey size={18} weight="duotone" color="#FF3B30" />
                  <Input
                    data-testid="delete-pin-input"
                    type="password"
                    inputMode="numeric"
                    autoComplete="off"
                    placeholder="Yönetici PIN'i"
                    value={pin}
                    onChange={(e) => setPin(e.target.value)}
                    className="border-0 bg-transparent text-white placeholder:text-white/30 focus-visible:ring-0"
                  />
                </div>
                <button
                  data-testid="confirm-delete-btn"
                  onClick={confirmDelete}
                  disabled={!pin || deleting}
                  className="h-11 px-5 rounded-xl bg-[#FF3B30] text-white font-semibold active:scale-95 transition-transform disabled:opacity-40"
                >
                  {deleting ? "Siliniyor..." : "Onayla"}
                </button>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
