import { useRef, useState } from "react";
import { ArrowCounterClockwise, Flag, FilmStrip, MagicWand, Monitor, Square, Stamp, TShirt, UploadSimple } from "@phosphor-icons/react";
import { toast } from "sonner";
import { Input } from "@/components/ui/input";
import { API } from "@/lib/api";

const PLACEMENTS = [
  { key: "corner", label: "Köşe Damgası", icon: Stamp },
  { key: "flag", label: "Bayrak Tutsun", icon: Flag },
  { key: "banner", label: "Sahne Ekranında", icon: Monitor },
  { key: "tshirt", label: "Tişört Baskısı", icon: TShirt },
];

function Pill({ active, disabled, onClick, icon: Icon, testId, children }) {
  return (
    <button
      data-testid={testId}
      disabled={disabled}
      onClick={onClick}
      className={`h-11 px-4 rounded-full text-sm font-medium flex items-center gap-2 transition-colors active:scale-95 ${
        active
          ? "bg-[#00E5FF] text-black"
          : disabled
          ? "bg-white/5 text-white/30 cursor-not-allowed"
          : "glass-dock text-white"
      }`}
    >
      {Icon && <Icon size={16} weight={active ? "bold" : "duotone"} />}
      {children}
    </button>
  );
}

export default function ConfirmView({ photo, eventLogoExists, onGenerate, onRetake }) {
  const [logoMode, setLogoMode] = useState(eventLogoExists ? "event" : "none");
  const [customLogoB64, setCustomLogoB64] = useState(null);
  const [placement, setPlacement] = useState("corner");
  const [frame, setFrame] = useState(false);
  const [name, setName] = useState("");
  const fileRef = useRef(null);

  const handleLogoFile = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!file.type.startsWith("image/")) {
      toast.error("Lütfen bir görsel dosyası seçin");
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      setCustomLogoB64(reader.result);
      setLogoMode("custom");
    };
    reader.readAsDataURL(file);
    e.target.value = "";
  };

  const options = [
    { key: "event", label: "Etkinlik Logosu", disabled: !eventLogoExists },
    { key: "custom", label: "Özel Logo" },
    { key: "none", label: "Logosuz" },
  ];

  return (
    <div className="h-full w-full flex flex-col px-5 pt-5 pb-6 overflow-y-auto" data-testid="confirm-view">
      <div className="flex items-center justify-between mb-4">
        <span className="text-xs tracking-[0.25em] uppercase text-[#A1A1AA]">Önizleme</span>
        <span className="text-xs text-[#00E5FF] tracking-wide">Adım 2 / 3</span>
      </div>

      <div className="flex-1 min-h-0 flex items-center justify-center">
        {frame ? (
          <div
            data-testid="frame-preview"
            className="h-full max-w-full aspect-[3/4] bg-white flex flex-col rounded-md shadow-[0_0_40px_rgba(255,255,255,0.12)] p-[2.5%]"
          >
            <div className="flex-1 min-h-0 overflow-hidden">
              <img src={photo} alt="Çekilen fotoğraf" data-testid="captured-photo" className="h-full w-full object-cover" />
            </div>
            <div className="h-[9.4%] shrink-0 flex items-center justify-between gap-2 pt-[2%]">
              {logoMode === "custom" && customLogoB64 ? (
                <img src={customLogoB64} alt="Logo" className="h-3/5 max-w-[38%] object-contain" />
              ) : logoMode === "event" && eventLogoExists ? (
                <img src={`${API}/logo-image`} alt="Logo" className="h-3/5 max-w-[38%] object-contain" />
              ) : (
                <span />
              )}
              <span className="text-[8px] sm:text-[10px] font-bold text-neutral-700 tracking-wide whitespace-nowrap">
                {"PLENA SNAP · HR VISION '26"}
              </span>
            </div>
          </div>
        ) : (
          <img
            src={photo}
            alt="Çekilen fotoğraf"
            data-testid="captured-photo"
            className="max-h-full max-w-full rounded-2xl object-contain border border-white/10"
          />
        )}
      </div>

      <div className="mt-5">
        <p className="text-sm text-[#A1A1AA] mb-3">Baskıya eklenecek logo:</p>
        <div className="flex flex-wrap gap-2">
          {options.map((opt) => (
            <Pill
              key={opt.key}
              testId={`logo-mode-${opt.key}`}
              active={logoMode === opt.key}
              disabled={opt.disabled}
              onClick={() => {
                if (opt.key === "custom" && !customLogoB64) fileRef.current?.click();
                else setLogoMode(opt.key);
              }}
            >
              {opt.label}
            </Pill>
          ))}
          {logoMode === "custom" && customLogoB64 && (
            <button
              data-testid="change-custom-logo-btn"
              onClick={() => fileRef.current?.click()}
              className="h-11 px-4 rounded-full glass-dock text-sm flex items-center gap-2 active:scale-95 transition-transform"
            >
              <UploadSimple size={16} weight="bold" />
              <img src={customLogoB64} alt="Özel logo" className="h-6 w-6 object-contain rounded" />
            </button>
          )}
        </div>
        {!eventLogoExists && (
          <p className="text-xs text-white/40 mt-2">
            İpucu: Ayarlardan etkinlik logosu yüklerseniz her baskıya otomatik eklenir.
          </p>
        )}
      </div>

      {logoMode !== "none" && (
        <div className="mt-4">
          <p className="text-sm text-[#A1A1AA] mb-3">Logo nerede görünsün?</p>
          <div className="flex flex-wrap gap-2">
            {PLACEMENTS.map((p) => (
              <Pill
                key={p.key}
                testId={`placement-${p.key}`}
                active={placement === p.key}
                onClick={() => setPlacement(p.key)}
                icon={p.icon}
              >
                {p.label}
              </Pill>
            ))}
          </div>
          <p className="text-xs text-white/60 mt-2">
            {placement === "corner"
              ? "Logo, baskının sağ alt köşesine net ve bozulmadan eklenir."
              : "Yapay zekâ logoyu sahnenin içine çizer — sonuç her üretimde biraz farklılık gösterebilir."}
          </p>
        </div>
      )}

      <div className="mt-4">
        <p className="text-sm text-[#A1A1AA] mb-3">Baskı stili</p>
        <div className="flex flex-wrap gap-2">
          <Pill testId="frame-off" active={!frame} onClick={() => setFrame(false)} icon={Square}>
            Tam Kare
          </Pill>
          <Pill testId="frame-on" active={frame} onClick={() => setFrame(true)} icon={FilmStrip}>
            Instax Çerçevesi
          </Pill>
        </div>
        {frame && (
          <p className="text-xs text-white/60 mt-2">
            İnce beyaz kenarlık + altta Plena logolu film şeridi eklenir.
          </p>
        )}
      </div>

      <div className="mt-4">
        <p className="text-sm text-[#A1A1AA] mb-2">
          Kütüphane ismi <span className="text-white/30">(fotoğrafta görünmez)</span>
        </p>
        <Input
          data-testid="snap-name-input"
          value={name}
          onChange={(e) => setName(e.target.value)}
          maxLength={40}
          placeholder="ör. Ayşe & Mehmet"
          className="h-12 rounded-xl bg-white/5 border-white/10 text-white placeholder:text-white/25"
        />
      </div>

      <div className="flex gap-3 mt-6">
        <button
          data-testid="retake-btn"
          onClick={onRetake}
          className="h-14 px-6 rounded-full glass-dock flex items-center gap-2 text-sm font-medium active:scale-95 transition-transform"
        >
          <ArrowCounterClockwise size={18} weight="bold" />
          Yeniden Çek
        </button>
        <button
          data-testid="generate-btn"
          onClick={() => onGenerate({ logoMode, customLogoB64, placement, name, frame })}
          className="flex-1 h-14 rounded-full bg-[#00E5FF] text-black font-semibold flex items-center justify-center gap-2 active:scale-95 transition-transform"
        >
          <MagicWand size={20} weight="bold" />
          Karikatür Oluştur
        </button>
      </div>
      <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={handleLogoFile} data-testid="custom-logo-input" />
    </div>
  );
}
