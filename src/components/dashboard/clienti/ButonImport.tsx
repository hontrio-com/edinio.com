"use client";

import { useState } from "react";
import { Upload } from "lucide-react";

import { CustomerImportModal } from "../CustomerImportModal";

/**
 * Butonul de import, scos aparte ca sa poata fi pus si in fila „Importuri”, nu
 * doar in antetul listei.
 *
 * ⚠ ACELASI MODAL, nu unul care seamana. Doua ferestre de import ar fi divergat
 * la prima schimbare de reguli, iar comerciantul ar fi avut doua feluri de a
 * importa aceiasi clienti, cu rezultate deosebite.
 */
export function ButonImport() {
  const [deschis, setDeschis] = useState(false);

  return (
    <>
      <button
        type="button"
        onClick={() => setDeschis(true)}
        className="inline-flex flex-shrink-0 items-center gap-2 rounded-xl bg-card px-3 py-2 text-sm font-semibold text-foreground ring-1 ring-foreground/10 transition-colors hover:bg-muted"
      >
        <Upload className="h-4 w-4" /> <span className="hidden sm:inline">Importă clienți</span>
      </button>
      {deschis && <CustomerImportModal onClose={() => setDeschis(false)} />}
    </>
  );
}
