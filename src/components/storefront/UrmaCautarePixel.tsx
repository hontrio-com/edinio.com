"use client";

import { useEffect } from "react";
import { fbTrack } from "@/lib/marketing";

/**
 * Evenimentul standard Meta `Search`, pe pagina de cautare a magazinului.
 *
 * ⚠ LIPSEA (17.09.2026). Referinta pixelului: „`Search`: When a search is made. A person searches for a
 * product on your website.” Shopify il trimite; noi nu trimiteam nimic, deci cautarile nu intrau nici in
 * audiente, nici in reclamele de catalog („Required for Advantage+ catalog ads: `contents` or `content_ids`”).
 *
 * ⚠ FARA `content_type`, dinadins: rezultatele amesteca produse simple (ID de articol) cu produse cu
 * variante (ID de grup), iar „If no `content_type` is provided, Meta will match the event to every item that
 * has the same ID, independent of its type.”
 *
 * ⚠ O singura data pe termen: o re-randare nu trebuie sa numere a doua cautare.
 */
export function UrmaCautarePixel({ termen, rezultate }: {
  termen: string;
  /** Primele rezultate, cu pretul lor. Gol cand cautarea se face abia in browser. */
  rezultate: { id: string; pret: number }[];
}) {
  const semnatura = `${termen}|${rezultate.map((r) => r.id).join(",")}`;
  useEffect(() => {
    const t = termen.trim();
    if (!t) return;
    const primele = rezultate.slice(0, 10);
    fbTrack("Search", {
      search_string: t.slice(0, 200),
      currency: "RON",
      ...(primele.length ? {
        content_ids: primele.map((r) => r.id),
        contents: primele.map((r) => ({ id: r.id, quantity: 1, item_price: Math.round((Number(r.pret) || 0) * 100) / 100 })),
      } : {}),
    });
    // `semnatura` acopera termenul si rezultatele; enumerate, tabloul ar fi o dependinta noua la fiecare randare.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [semnatura]);
  return null;
}
