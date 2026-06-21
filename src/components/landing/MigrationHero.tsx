"use client";

import { motion } from "framer-motion";
import { PackageCheck, Wrench, Lock, BadgePercent, ArrowRight } from "lucide-react";
import { BackgroundBeams } from "@/components/ui/background-beams";

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

      <motion.div
        variants={container}
        initial="hidden"
        animate="show"
        className="relative z-10 pt-16 sm:pt-24 pb-14 px-4 text-center max-w-3xl mx-auto"
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
            whileHover={{ scale: 1.03 }}
            whileTap={{ scale: 0.97 }}
            transition={{ type: "spring", stiffness: 400, damping: 17 }}
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
