import { motion } from "framer-motion";
import { Camera, DownloadSimple, House, Images, Printer } from "@phosphor-icons/react";
import { QRCodeSVG } from "qrcode.react";
import { API } from "@/lib/api";
import { saveImage, slugify } from "@/lib/download";

const RESULT_POP = { initial: { opacity: 0, scale: 0.92 }, animate: { opacity: 1, scale: 1 } };

export default function ResultView({ result, onPrint, onNew, onHome, onGallery }) {
  const dataUrl = `data:image/jpeg;base64,${result.image_base64}`;

  const download = async () => {
    const blob = await (await fetch(dataUrl)).blob();
    await saveImage({
      blob,
      filename: `${slugify(result.name)}-${result.id.slice(0, 8)}.jpg`,
      fallbackUrl: `${API}/images/${result.id}?dl=1`,
    });
  };

  return (
    <div className="h-full w-full flex flex-col px-5 pt-5 pb-6 overflow-y-auto" data-testid="result-view">
      <div className="flex items-center justify-between mb-4">
        <span className="text-xs tracking-[0.25em] uppercase text-[#00E5FF]">{"SNAP'in Hazır!"}</span>
        <button
          data-testid="result-home-btn"
          onClick={onHome}
          className="h-10 w-10 rounded-full glass-dock flex items-center justify-center active:scale-95 transition-transform"
        >
          <House size={18} weight="duotone" color="#fff" />
        </button>
      </div>

      <div className="flex-1 min-h-0 flex items-center justify-center">
        <motion.div
          {...RESULT_POP}
          className="aspect-[3/4] max-h-full rounded-2xl overflow-hidden border border-[#00E5FF]/30 shadow-[0_0_60px_rgba(0,229,255,0.15)]"
        >
          <img
            src={dataUrl}
            alt="Karikatür sonucu"
            data-testid="result-image"
            className="h-full w-full object-cover"
          />
        </motion.div>
      </div>

      <p className="text-center text-xs text-white/40 mt-3">
        {result.name ? `${result.name} · ` : ""}Instax Mini (46x62 mm) · 3:4 · Baskıya hazır
      </p>

      <div className="flex items-center justify-center gap-4 mt-4" data-testid="qr-share">
        <div className="bg-white p-2 rounded-xl shrink-0">
          <QRCodeSVG value={`${API}/share/${result.id}`} size={84} />
        </div>
        <p className="text-xs text-[#A1A1AA] max-w-[150px] leading-relaxed">
          Telefonuna indirmek için kamerayla QR kodu okut
        </p>
      </div>

      <div className="grid grid-cols-2 gap-3 mt-4 w-full max-w-xl mx-auto">
        <button
          data-testid="print-btn"
          onClick={() => onPrint(dataUrl)}
          className="h-14 rounded-full bg-[#00E5FF] text-black font-semibold flex items-center justify-center gap-2 active:scale-95 transition-transform"
        >
          <Printer size={20} weight="bold" />
          Yazdır
        </button>
        <button
          data-testid="download-btn"
          onClick={download}
          className="h-14 rounded-full glass-dock font-medium flex items-center justify-center gap-2 active:scale-95 transition-transform"
        >
          <DownloadSimple size={20} weight="bold" />
          JPG İndir
        </button>
        <button
          data-testid="new-photo-btn"
          onClick={onNew}
          className="h-14 rounded-full glass-dock font-medium flex items-center justify-center gap-2 active:scale-95 transition-transform"
        >
          <Camera size={20} weight="duotone" />
          Yeni Fotoğraf
        </button>
        <button
          data-testid="result-gallery-btn"
          onClick={onGallery}
          className="h-14 rounded-full glass-dock font-medium flex items-center justify-center gap-2 active:scale-95 transition-transform"
        >
          <Images size={20} weight="duotone" />
          Galeri
        </button>
      </div>
    </div>
  );
}
