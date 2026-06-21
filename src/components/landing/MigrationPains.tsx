"use client";

import { motion } from "framer-motion";
import { Banknote, Clock, TrendingUp, AlertCircle } from "lucide-react";

const PAINS = [
  {
    icon: Banknote,
    title: "Platesti comisioane la fiecare vanzare?",
    desc: "Fiecare comanda iti ia un procent din profit, luna de luna.",
  },
  {
    icon: Clock,
    title: "Suportul raspunde dupa zile?",
    desc: "Cand ai o problema urgenta, astepti zile pentru un raspuns.",
  },
  {
    icon: TrendingUp,
    title: "Pretul abonamentului a crescut fara sa fii intrebat?",
    desc: "Te trezesti ca platesti mai mult, fara nicio explicatie.",
  },
];

const fadeUp = {
  hidden: { opacity: 0, y: 20 },
  show: { opacity: 1, y: 0, transition: { duration: 0.5, ease: [0.22, 1, 0.36, 1] as const } },
};

export function MigrationPains() {
  return (
    <section className="px-4 pt-16 pb-16 max-w-5xl mx-auto">
      <motion.div
        initial="hidden"
        whileInView="show"
        viewport={{ once: true, margin: "-80px" }}
        variants={fadeUp}
        className="text-center mb-10"
      >
        <h2 className="text-2xl sm:text-3xl font-bold text-gray-900">Iti suna cunoscut?</h2>
        <p className="mt-2 text-gray-500">Problemele cu care se confrunta majoritatea magazinelor online.</p>
      </motion.div>

      <motion.div
        initial="hidden"
        whileInView="show"
        viewport={{ once: true, margin: "-60px" }}
        transition={{ staggerChildren: 0.1 }}
        className="grid gap-4 md:grid-cols-3"
      >
        {PAINS.map(({ icon: Icon, title, desc }) => (
          <motion.div
            key={title}
            variants={fadeUp}
            whileHover={{ y: -4 }}
            transition={{ type: "spring", stiffness: 300, damping: 22 }}
            className="group relative overflow-hidden rounded-2xl border border-gray-100 bg-white p-6 shadow-[0_1px_3px_rgba(16,24,40,0.04)] transition-shadow hover:shadow-[0_12px_30px_-12px_rgba(239,68,68,0.28)]"
          >
            {/* Top accent line */}
            <span className="absolute inset-x-0 top-0 h-1 bg-red-400/70" />

            <div className="flex items-center justify-between">
              <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-red-50 text-red-500 ring-1 ring-red-100">
                <Icon className="h-5 w-5" />
              </div>
              <AlertCircle className="h-4 w-4 text-red-300 transition-colors group-hover:text-red-400" />
            </div>

            <p className="mt-4 text-base font-semibold text-gray-900 leading-snug">{title}</p>
            <p className="mt-2 text-sm text-gray-500">{desc}</p>
          </motion.div>
        ))}
      </motion.div>
    </section>
  );
}
