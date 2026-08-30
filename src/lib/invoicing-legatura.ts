import { logError } from "@/lib/error-logger";

/**
 * „Documentul fiscal exista la furnizor, dar comanda nu-l stie."
 *
 * ═══ DE CE ═══
 *
 * Scrierile care leaga numarul facturii de comanda erau facute asa:
 *
 *     await supabase.from("orders").update({ ..._invoice_number: ... }).eq("id", orderId);
 *
 * fara sa se citeasca nici macar `error`. Iar acelasi fisier aplica de mult
 * tiparul corect pe storno si pe toate AWB-urile de curieri. Consecinta e scrisa
 * chiar in cod, la proforme: documentul emis ramane ORFAN in contul furnizorului,
 * iar pasul urmator (conversia proformei, stornoul, retrimiterea pe email) nu-l
 * mai gaseste, fiindca randul comenzii nu-i stie numarul.
 *
 * De cand emiterea trece prin registrul de operatii externe, urmarea nu mai e „mai
 * emit o factura" — a doua apasare ADOPTA documentul existent si rescrie legatura.
 * Dar asta se intampla numai daca cineva apasa. Pe calea automata (facturarea dupa
 * plata) nu exista niciun om, deci fara semnal legatura ramane rupta la nesfarsit.
 *
 * ═══ DE CE NU SE INTOARCE EROARE ═══
 *
 * Documentul fiscal EXISTA. O eroare l-ar trimite pe om sa apese din nou, iar
 * pentru caile care nu au cheie de registru (adoptarea unei facturi emise manual
 * din contul furnizorului, anularea unei proforme) a doua apasare nu e idempotenta.
 * Se logheaza critical si se raporteaza succes.
 */
export async function verificaLegaturaDocumentului(p: {
  /** `smartbill.factura`, `oblio.proforma`, … — intra ca `action` in `error_logs`. */
  actiune: string;
  /** Ce document e vorba, ca sa poata fi cautat la furnizor: serie + numar. */
  document: string;
  orderId: string;
  businessId: string;
  eroare: { message: string; code?: string } | null;
  randuri: unknown[] | null;
}): Promise<void> {
  if (!p.eroare && p.randuri && p.randuri.length > 0) return;
  await logError({
    action: p.actiune,
    message: `Documentul ${p.document} a fost emis la furnizor, dar comanda NU s-a actualizat: ${p.eroare?.message ?? "niciun rand modificat"}`,
    details: { orderId: p.orderId, businessId: p.businessId, document: p.document, code: p.eroare?.code },
    businessId: p.businessId,
    severity: "critical",
  });
}
