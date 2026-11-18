"use client";

import { useEffect } from "react";
import { mktrEvent } from "@/lib/marketing";
import { iaPentruTheMarketer } from "@/lib/themarketer/comanda-browser";

/**
 * `__sm__order` pe pagina de multumire (developers.themarketer.com: „For any payment method, the function
 * must be called on the Thank You page”).
 *
 * `corp` vine de la server si NU are date personale (numar, sume, produse cu SKU). Omul se adauga aici, din
 * ce a scris chiar el la checkout (`comanda-browser.ts`). Fara el, evenimentul nu pleaca: pluginul lor face
 * la fel (fara email si telefon nu trimite comanda), iar comanda ajunge oricum prin `save_order`.
 *
 * ⚠ O singura data pe comanda, ca la `FbPurchaseEvent`: o reincarcare nu trimite a doua comanda.
 * ⚠ Se randeaza NUMAI pentru o vanzare confirmata (ramburs, sau plata incasata).
 */
export function ComandaTheMarketer({ orderId, corp }: { orderId: string; corp: Record<string, unknown> }) {
  useEffect(() => {
    if (!orderId) return;
    const cheie = `edinio_tm_trimisa_${orderId}`;
    try {
      if (localStorage.getItem(cheie)) return;
    } catch { /* stocare blocata: se merge mai departe, datele pastrate dispar oricum dupa o folosire */ }
    const persoana = iaPentruTheMarketer(orderId);
    if (!persoana || (!persoana.email_address && !persoana.phone)) return;
    try { localStorage.setItem(cheie, String(Date.now())); } catch { /* idem */ }
    mktrEvent("__sm__order", { ...corp, ...persoana });
    // `corp` e calculat pe server o data pe randare; comanda e cheia.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [orderId]);
  return null;
}
