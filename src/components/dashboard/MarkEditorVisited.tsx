"use client";

import { useEffect } from "react";
import { EDITOR_VISITED_KEY } from "@/lib/activation";

/**
 * Marcheaza local ca utilizatorul a ajuns pe pagina "Editeaza magazinul",
 * pentru a bifa pasul "Personalizeaza magazinul" din checklist-ul de activare.
 * Nu randeaza nimic vizibil.
 */
export function MarkEditorVisited() {
  useEffect(() => {
    try { localStorage.setItem(EDITOR_VISITED_KEY, "1"); } catch { /* localStorage indisponibil */ }
  }, []);
  return null;
}
