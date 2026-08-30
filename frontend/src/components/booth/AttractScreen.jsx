import { motion } from "framer-motion";
import { GearSix, Images, SignOut } from "@phosphor-icons/react";
import SnapMark from "@/components/booth/SnapMark";

export default function AttractScreen({ onStart, onGallery, onSettings, onLogout }) {
  return (
    <div className="relative h-full w-full flex flex-col" data-testid="attract-screen">
      <div className="absolute inset-0 opacity-30 pointer-events-none"
        style={{
          background:
            "radial-gradient(ellipse 80% 50% at 50% -10%, rgba(0,229,255,0.25), transparent), radial-gradient(ellipse 60% 40% at 80% 110%, rgba(255,59,48,0.12), transparent)",
        }}
      />
      <header className="relative z-10 flex items-center justify-between px-6 pt-6">
        <div className="flex items-center gap-2">
          <SnapMark size={22} />
          <span className="font-display tracking-tighter text-lg font-bold">
            PLENA <span className="text-[#00E5FF]">SNAP</span>
          </span>
        </div>
        <div className="flex items-center gap-3">
          <button
            data-testid="gallery-btn"
            onClick={onGallery}
            className="h-11 w-11 rounded-full glass-dock flex items-center justify-center active:scale-95 transition-transform"
          >
            <Images size={20} weight="duotone" color="#fff" />
          </button>
          <button
            data-testid="settings-btn"
            onClick={onSettings}
            className="h-11 w-11 rounded-full glass-dock flex items-center justify-center active:scale-95 transition-transform"
          >
            <GearSix size={20} weight="duotone" color="#fff" />
          </button>
          <button
            data-testid="logout-btn"
            onClick={onLogout}
            className="h-11 w-11 rounded-full glass-dock flex items-center justify-center active:scale-95 transition-transform"
          >
            <SignOut size={20} weight="duotone" color="#FF3B30" />
          </button>
        </div>
      </header>

      <button
        data-testid="tap-to-start"
        onClick={onStart}
        className="relative z-10 flex-1 flex flex-col items-start justify-center px-6 sm:px-12 text-left cursor-pointer"
      >
        <motion.p
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          className="text-white/60 tracking-[0.4em] text-xs sm:text-sm mb-4 uppercase"
        >
          Plena Studio presents
        </motion.p>
        <motion.h1
          className="font-display font-black tracking-tighter leading-none text-4xl sm:text-5xl lg:text-6xl attract-glow flex items-center gap-3 sm:gap-4"
        >
          <span className="flex">
            {"SNAP".split("").map((ch, i) => (
              <motion.span
                key={i}
                initial={{ opacity: 0, scale: 0, rotate: -15, y: 20 }}
                animate={{ opacity: 1, scale: 1, rotate: 0, y: 0 }}
                transition={{ delay: 0.25 + i * 0.13, type: "spring", stiffness: 380, damping: 13 }}
                className="inline-block"
              >
                {ch}
              </motion.span>
            ))}
          </span>
          <motion.span
            initial={{ opacity: 0, scale: 0 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ delay: 0.85, type: "spring", stiffness: 300, damping: 12 }}
            className="inline-flex"
          >
            <SnapMark size={52} className="snap-mark-hero" />
          </motion.span>
        </motion.h1>
        <motion.div
          className="pointer-events-none fixed inset-0 z-30 bg-white"
          initial={{ opacity: 0 }}
          animate={{ opacity: [0, 0, 0.55, 0] }}
          transition={{ duration: 1.5, times: [0, 0.7, 0.78, 1] }}
        />
        <motion.p
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.2 }}
          className="text-[#00E5FF] tracking-[0.3em] text-xs sm:text-sm mt-4 uppercase"
        >
          {"HR Vision '26 Experience"}
        </motion.p>
        <motion.p
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.3 }}
          className="text-[#A1A1AA] text-base mt-6 max-w-md font-light"
        >
          Fotoğrafını çek, yapay zekâ seni karikatüre çevirsin, logolu 10x15 baskını anında al.
        </motion.p>

        <motion.div
          initial={{ opacity: 0, scale: 0.9 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ delay: 0.4 }}
          className="relative mt-10"
        >
          <span className="absolute inset-0 rounded-full bg-[#00E5FF] pulse-ring" />
          <span className="relative inline-flex items-center gap-3 h-14 px-8 rounded-full bg-[#00E5FF] text-black font-semibold text-base">
            BAŞLAMAK İÇİN DOKUN
          </span>
        </motion.div>
      </button>

      <footer className="relative z-10 px-6 pb-6 text-[#A1A1AA] text-xs tracking-wide">
        PLENA STUDIO · AI destekli · 10x15 cm baskıya hazır
      </footer>
    </div>
  );
}
