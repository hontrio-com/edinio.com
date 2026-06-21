"use client";

import { motion } from "framer-motion";
import { Boxes, CalendarX, Clock, Lock, Wrench, Headphones, Sparkles } from "lucide-react";

const OFFER = [
  {
    icon: Boxes,
    title: "Migrare completa a produselor",
    desc: "O facem noi, de la cap la coada.",
  },
  {
    icon: CalendarX,
    title: "Fara contract pe termen lung",
    desc: "Platesti lunar, anulezi oricand.",
  },
  {
    icon: Clock,
    title: "Magazin live in 24 de ore",
    desc: "Online rapid, fara asteptare.",
  },
  {
    icon: Lock,
    title: "Pret fix pe viata",
    desc: "Nu creste niciodata. Garantat.",
  },
  {
    icon: Wrench,
    title: "Mentenanta gratuita pe viata",
    desc: "Ne ocupam noi de tot, mereu.",
  },
  {
    icon: Headphones,
    title: "Suport 7 zile din 7",
    desc: "Raspuns in ore, nu in zile.",
  },
];

const fadeUp = {
  hidden: { opacity: 0, y: 20 },
  show: { opacity: 1, y: 0, transition: { duration: 0.5, ease: [0.22, 1, 0.36, 1] as const } },
};

export function MigrationOffer() {
  return (
    <section className="px-4 pb-16 max-w-3xl mx-auto">
      <motion.div
        initial="hidden"
        whileInView="show"
        viewport={{ once: true, margin: "-80px" }}
        transition={{ staggerChildren: 0.08 }}
        className="rounded-3xl border border-gray-200 bg-white p-6 sm:p-10 shadow-[0_1px_3px_rgba(16,24,40,0.04)]"
      >
        <motion.h2
          variants={fadeUp}
          className="text-2xl sm:text-3xl font-bold text-gray-900 text-center"
        >
          Ce primesti cand migrezi la Edinio
        </motion.h2>

        <div className="mt-8 grid gap-3 sm:grid-cols-2">
          {OFFER.map(({ icon: Icon, title, desc }) => (
            <motion.div
              key={title}
              variants={fadeUp}
              className="flex items-start gap-3 rounded-2xl border border-gray-100 bg-gray-50/60 p-4 transition-colors hover:border-primary/30 hover:bg-primary/5"
            >
              <span className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary ring-1 ring-primary/15">
                <Icon className="h-5 w-5" />
              </span>
              <div>
                <p className="text-sm font-semibold text-gray-900 leading-snug">{title}</p>
                <p className="mt-0.5 text-[13px] text-gray-500">{desc}</p>
              </div>
            </motion.div>
          ))}
        </div>

        <motion.div
          variants={fadeUp}
          className="mt-6 flex items-center justify-center gap-2.5 rounded-2xl bg-primary px-5 py-4 text-center"
        >
          <Sparkles className="h-5 w-5 flex-shrink-0 text-white/90" />
          <p className="text-sm sm:text-base font-bold text-white">
            Fara perioada de tranzitie. Fara batai de cap. Fara sa pierzi nimic.
          </p>
        </motion.div>
      </motion.div>
    </section>
  );
}
