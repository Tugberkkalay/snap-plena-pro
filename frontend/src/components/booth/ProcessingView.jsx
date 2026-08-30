import { useEffect, useState } from "react";

const MESSAGES = [
  "Yüz hatları analiz ediliyor...",
  "Karikatür çizgileri oluşturuluyor...",
  "Renkler ve gölgeler ekleniyor...",
  "Lansman sahnesi hazırlanıyor...",
  "Baskı formatına dönüştürülüyor...",
];

export default function ProcessingView({ photo }) {
  const [msgIndex, setMsgIndex] = useState(0);

  useEffect(() => {
    const t = setInterval(() => setMsgIndex((i) => (i + 1) % MESSAGES.length), 3500);
    return () => clearInterval(t);
  }, []);

  return (
    <div className="h-full w-full flex flex-col items-center justify-center px-6" data-testid="processing-view">
      <div className="relative tracing-border rounded-3xl overflow-hidden max-h-[55vh]">
        <img src={photo} alt="İşlenen fotoğraf" className="max-h-[55vh] max-w-full object-contain opacity-70" />
        <div className="absolute inset-0 scanline-overlay" />
        <div className="scan-beam" />
      </div>
      <h2 className="font-display font-bold tracking-tighter text-lg md:text-lg mt-8 text-[#00E5FF]">
        SNAP Hazırlanıyor
      </h2>
      <p className="text-[#A1A1AA] text-sm mt-2 h-5" data-testid="processing-message">
        {MESSAGES[msgIndex]}
      </p>
      <p className="text-white/30 text-xs mt-4">Bu işlem 20-40 saniye sürebilir</p>
    </div>
  );
}
