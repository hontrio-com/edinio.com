"use client";

import { motion } from "framer-motion";
import { ShieldCheck } from "lucide-react";
import { MigrationForm } from "@/components/landing/MigrationForm";

const fadeUp = {
  hidden: { opacity: 0, y: 20 },
  show: { opacity: 1, y: 0, transition: { duration: 0.5, ease: [0.22, 1, 0.36, 1] as const } },
};

export function MigrationFormSection() {
  return (
    <motion.section
      id="formular"
      initial="hidden"
      whileInView="show"
      viewport={{ once: true, margin: "-80px" }}
      transition={{ staggerChildren: 0.1 }}
      className="px-4 pb-16 max-w-md mx-auto scroll-mt-8"
    >
      <motion.div variants={fadeUp} className="text-center mb-8">
        <h2 className="text-2xl sm:text-3xl font-bold text-gray-900">Completeaza si te sunam noi</h2>
        <p className="mt-2 text-gray-500">
          Lasa-ne numarul tau si un specialist te contacteaza pentru migrarea gratuita.
        </p>
      </motion.div>

      <motion.div
        variants={fadeUp}
        className="bg-white border border-gray-200 rounded-3xl p-6 sm:p-8 shadow-sm"
      >
        <MigrationForm />
      </motion.div>

      {/* Garantie */}
      <motion.div
        variants={fadeUp}
        className="mt-6 flex items-start gap-3 rounded-2xl bg-primary/5 border border-primary/15 p-5"
      >
        <ShieldCheck className="h-6 w-6 text-primary flex-shrink-0" />
        <div>
          <p className="text-sm font-semibold text-gray-900">Garantie 30 de zile</p>
          <p className="mt-1 text-sm text-gray-600">
            Daca in 30 de zile nu esti multumit, iti returnam banii. Fara intrebari.
          </p>
        </div>
      </motion.div>
    </motion.section>
  );
}
