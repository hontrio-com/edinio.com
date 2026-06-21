"use client";

import { motion } from "framer-motion";
import { PackageCheck, Wrench, Lock, BadgePercent, ArrowRight, Phone } from "lucide-react";
import { BackgroundBeams } from "@/components/ui/background-beams";
import { Logo } from "@/components/ui/Logo";

const PHONE_DISPLAY = "0750 456 809";
const PHONE_TEL = "+40750456809";
const WHATSAPP_URL = "https://wa.me/40750456809";

function WhatsAppIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" className={className} aria-hidden="true">
      <path d="M.057 24l1.687-6.163a11.867 11.867 0 0 1-1.587-5.946C.16 5.335 5.495 0 12.05 0a11.817 11.817 0 0 1 8.413 3.488 11.824 11.824 0 0 1 3.48 8.414c-.003 6.557-5.338 11.892-11.893 11.892a11.9 11.9 0 0 1-5.688-1.448L.057 24zm6.597-3.807c1.676.995 3.276 1.591 5.392 1.592 5.448 0 9.886-4.434 9.889-9.885.002-5.462-4.415-9.89-9.881-9.892-5.452 0-9.887 4.434-9.889 9.884a9.86 9.86 0 0 0 1.51 5.26l-.999 3.648 3.748-.983zm11.387-5.464c-.074-.124-.272-.198-.57-.347-.297-.149-1.758-.868-2.031-.967-.272-.099-.47-.149-.669.149-.198.297-.768.967-.941 1.165-.173.198-.347.223-.644.074-.297-.149-1.255-.462-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.297-.347.446-.521.151-.172.2-.296.3-.495.099-.198.05-.372-.025-.521-.075-.148-.669-1.611-.916-2.206-.242-.579-.487-.501-.669-.51l-.57-.01c-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.263.489 1.694.626.712.226 1.36.194 1.872.118.571-.085 1.758-.719 2.006-1.413.248-.695.248-1.29.173-1.414z" />
    </svg>
  );
}

const HERO_BADGES = [
  { icon: PackageCheck, label: "Migrare gratuita" },
  { icon: Wrench, label: "Mentenanta gratuita pe viata" },
  { icon: Lock, label: "Pret fix, nu creste niciodata" },
  { icon: BadgePercent, label: "0% comision per vanzare" },
];

const container = {
  hidden: {},
  show: {
    transition: { staggerChildren: 0.08, delayChildren: 0.05 },
  },
};

const fadeUp = {
  hidden: { opacity: 0, y: 18 },
  show: { opacity: 1, y: 0, transition: { duration: 0.55, ease: [0.22, 1, 0.36, 1] as const } },
};

export function MigrationHero() {
  return (
    <section className="relative overflow-hidden bg-white border-b border-gray-100">
      {/* Animated beams background */}
      <BackgroundBeams />

      {/* Top bar: logo + contact actions */}
      <div className="relative z-20 flex items-center justify-between gap-3 px-4 sm:px-6 pt-5 max-w-6xl mx-auto">
        <Logo size="md" />
        <div className="flex items-center gap-2">
          <a
            href={`tel:${PHONE_TEL}`}
            className="inline-flex items-center gap-2 rounded-full border border-gray-200 bg-white/90 backdrop-blur px-3.5 py-2 text-sm font-semibold text-gray-800 shadow-sm transition-colors hover:border-primary hover:text-primary"
            aria-label={`Suna la ${PHONE_DISPLAY}`}
          >
            <Phone className="h-4 w-4" />
            <span className="hidden sm:inline">{PHONE_DISPLAY}</span>
          </a>
          <a
            href={WHATSAPP_URL}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-2 rounded-full bg-[#25D366] px-3.5 py-2 text-sm font-semibold text-white shadow-sm transition-opacity hover:opacity-90"
            aria-label="Scrie-ne pe WhatsApp"
          >
            <WhatsAppIcon className="h-4 w-4" />
            <span className="hidden sm:inline">WhatsApp</span>
          </a>
        </div>
      </div>

      <motion.div
        variants={container}
        initial="hidden"
        animate="show"
        className="relative z-10 pt-10 sm:pt-16 pb-14 px-4 text-center max-w-3xl mx-auto"
      >
        <motion.h1
          variants={fadeUp}
          className="text-3xl sm:text-4xl lg:text-[3.25rem] font-bold text-gray-900 tracking-tight leading-[1.1]"
        >
          Muta-ti magazinul la Edinio.
          <br className="hidden sm:block" />{" "}
          <span className="text-primary">Noi ne ocupam de tot.</span>
        </motion.h1>

        <motion.p variants={fadeUp} className="mt-5 text-lg text-gray-500 max-w-2xl mx-auto">
          Iti migram toate produsele gratuit, in 24 de ore. Fara comisioane, fara costuri ascunse, fara batai de cap.
        </motion.p>

        {/* Benefit badges */}
        <motion.div
          variants={fadeUp}
          className="mt-9 grid grid-cols-2 gap-3 max-w-xl mx-auto sm:flex sm:flex-wrap sm:justify-center"
        >
          {HERO_BADGES.map(({ icon: Icon, label }, i) => (
            <motion.div
              key={label}
              initial={{ opacity: 0, scale: 0.92, y: 10 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              transition={{ delay: 0.3 + i * 0.08, duration: 0.4, ease: [0.22, 1, 0.36, 1] as const }}
              whileHover={{ y: -3 }}
              className="flex items-center gap-2.5 px-3.5 py-2.5 rounded-2xl bg-white border border-gray-100 shadow-[0_2px_12px_-4px_rgba(16,24,40,0.12)] text-left transition-shadow hover:shadow-[0_8px_24px_-8px_rgba(26,181,84,0.35)]"
            >
              <span className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-xl bg-primary">
                <Icon className="h-4 w-4 text-white" />
              </span>
              <span className="text-xs sm:text-[13px] font-semibold text-gray-800 leading-tight">{label}</span>
            </motion.div>
          ))}
        </motion.div>

        {/* Animated CTA */}
        <motion.div variants={fadeUp} className="mt-10">
          <motion.a
            href="#formular"
            animate={{ scale: [1, 1.035, 1] }}
            transition={{ duration: 2.4, ease: "easeInOut", repeat: Infinity }}
            whileHover={{ scale: 1.06 }}
            whileTap={{ scale: 0.96 }}
            className="migrare-btn-glow group inline-flex items-center gap-2 px-8 py-4 rounded-2xl bg-primary text-white font-semibold"
          >
            Vreau migrare gratuita
            <ArrowRight className="h-4 w-4 transition-transform duration-300 group-hover:translate-x-1" />
          </motion.a>
          <p className="mt-3 text-xs text-gray-400">Te sunam noi. Fara obligatii.</p>
        </motion.div>
      </motion.div>
    </section>
  );
}
