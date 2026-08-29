import { useRef, useState } from "react";
import { LockKey, Trash, UploadSimple } from "@phosphor-icons/react";
import { toast } from "sonner";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { API, api } from "@/lib/api";

export default function SettingsSheet({ open, onOpenChange, eventLogoExists, refreshLogo }) {
  const fileRef = useRef(null);
  const [uploading, setUploading] = useState(false);
  const [pin, setPin] = useState("");
  const [cacheBust, setCacheBust] = useState(Date.now());

  const errMsg = (e, fallback) =>
    e?.response?.status === 401
      ? "Geçersiz yönetici PIN'i"
      : e?.response?.status === 429
      ? "Çok fazla deneme, lütfen biraz bekleyin"
      : e?.response?.data?.detail || fallback;

  const handleFile = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!file.type.startsWith("image/")) {
      toast.error("Lütfen bir görsel dosyası seçin");
      return;
    }
    setUploading(true);
    try {
      const form = new FormData();
      form.append("file", file);
      await api.post("/settings/logo", form, { headers: { "X-Admin-Pin": pin } });
      await refreshLogo();
      setCacheBust(Date.now());
      toast.success("Etkinlik logosu kaydedildi");
    } catch (err) {
      toast.error(errMsg(err, "Logo yüklenemedi"));
    } finally {
      setUploading(false);
      e.target.value = "";
    }
  };

  const removeLogo = async () => {
    try {
      await api.delete("/settings/logo", { headers: { "X-Admin-Pin": pin } });
      await refreshLogo();
      toast.success("Logo kaldırıldı");
    } catch (err) {
      toast.error(errMsg(err, "Logo kaldırılamadı"));
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="bg-[#111112] border-white/10 text-white max-w-md" data-testid="settings-dialog">
        <DialogHeader>
          <DialogTitle className="font-display tracking-tighter">Etkinlik Ayarları</DialogTitle>
          <DialogDescription className="text-[#A1A1AA]">
            Buraya yüklediğiniz logo, tüm karikatür baskılarına otomatik eklenir.
          </DialogDescription>
        </DialogHeader>

        {eventLogoExists ? (
          <div className="flex items-center gap-4 rounded-xl border border-white/10 bg-white/5 p-4">
            <img
              src={`${API}/logo-image?t=${cacheBust}`}
              alt="Etkinlik logosu"
              data-testid="event-logo-preview"
              className="h-16 w-16 object-contain rounded bg-white/10 p-1"
            />
            <div className="flex-1">
              <p className="text-sm font-medium">Etkinlik logosu aktif</p>
              <p className="text-xs text-[#A1A1AA]">Tüm baskılara ekleniyor</p>
            </div>
            <button
              data-testid="remove-logo-btn"
              onClick={removeLogo}
              disabled={!pin}
              className="h-10 w-10 rounded-full bg-[#FF3B30]/15 flex items-center justify-center active:scale-95 transition-transform disabled:opacity-40"
            >
              <Trash size={18} weight="duotone" color="#FF3B30" />
            </button>
          </div>
        ) : (
          <p className="text-sm text-white/40">Henüz logo yüklenmedi.</p>
        )}

        <div className="flex items-center gap-2 rounded-xl border border-white/10 bg-white/5 px-3">
          <LockKey size={18} weight="duotone" color="#00E5FF" />
          <Input
            data-testid="admin-pin-input"
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
          data-testid="upload-logo-btn"
          onClick={() => fileRef.current?.click()}
          disabled={uploading || !pin}
          className="h-13 py-3 w-full rounded-full bg-[#00E5FF] text-black font-semibold flex items-center justify-center gap-2 active:scale-95 transition-transform disabled:opacity-50"
        >
          <UploadSimple size={20} weight="bold" />
          {uploading ? "Yükleniyor..." : eventLogoExists ? "Logoyu Değiştir" : "Logo Yükle"}
        </button>
        <p className="text-xs text-white/30">Logo değişiklikleri yönetici PIN'i gerektirir · PNG (şeffaf) önerilir · max 8MB</p>
        <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={handleFile} data-testid="logo-file-input" />
      </DialogContent>
    </Dialog>
  );
}
