"use client";

import { useEffect } from "react";
import { mktrEvent } from "@/lib/marketing";

/**
 * Un eveniment de pagina theMarketer (`__sm__view_homepage`, `__sm__view_category`, `__sm__view_brand`),
 * trimis o data la afisarea paginii. Paginile sunt ale serverului; asta e doar mana care pune evenimentul in
 * coada din browser (`mktrEvent`), de unde pleaca numai dupa acordul pentru marketing.
 *
 * ⚠ O data pe SEMNATURA (eveniment + date): o re-randare nu numara a doua vizita, dar navigarea spre alta
 * categorie, da.
 */
export function EvenimentTheMarketer({ event, date }: { event: string; date?: Record<string, string> }) {
  const semnatura = JSON.stringify([event, date ?? null]);
  useEffect(() => {
    mktrEvent(event, date);
    // `semnatura` acopera evenimentul si datele; obiectul `date` ar fi o dependinta noua la fiecare randare.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [semnatura]);
  return null;
}
