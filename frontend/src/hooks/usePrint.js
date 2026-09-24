import { useEffect, useState } from "react";
import { toast } from "sonner";

export function usePrint() {
  const [printSrc, setPrintSrc] = useState(null);

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

  return { printSrc, handlePrint };
}
