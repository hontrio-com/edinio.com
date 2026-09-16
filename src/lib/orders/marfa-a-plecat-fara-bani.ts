import { PAYMENT_PROCESSOR_TYPES } from "@/lib/payment-methods";
import { baniiAuIntrat } from "@/lib/billing/incasare";

/**
 * ⚠⚠ MARFA A PLECAT SI BANII NU S-AU CONFIRMAT.
 *
 * ═══ DE CE EXISTA ═══
 *
 * Netopia nu are nicio plasa, si ei o spun: `/operation/status` e in specificatia lor cu
 * descrierea „will be available at a future date". Deci starea unei plati NU se poate interoga.
 * Daca notificarea nu ajunge, plata se pierde tacut si nimic din platforma n-o mai gaseste.
 *
 * ⚠ Masurat pe 16.09.2026, si asta a scos regula din discutie: doua comenzi EXPEDIATE si
 * neplatite, cu id de tranzactie Netopia, la `suporti-numar`: `#0104` (105,50 lei, de 32 de zile)
 * si `#0156` (65,00 lei, de 22). Ori clientul a platit si notificarea nu a ajuns (banii sunt la
 * procesator, noi nu stim), ori n-a platit si marfa a plecat oricum. Nu se poate lamuri din
 * platforma; se lamureste din contul procesatorului, de catre comerciant.
 *
 * Nu putem repara cauza. Putem sa nu mai lasam paguba TACUTA.
 *
 * ═══ ⚠ DE CE REGULA E AICI SI VERIFICAREA E INTR-UN CRON ═══
 *
 * O comanda ajunge „expediata" pe PESTE DOUAZECI de drumuri: fiecare dintre cele saptesprezece
 * cronuri de urmarire o muta cand coletul intra in retea, plus panoul, loturile si ingestia din
 * marketplace. O verificare pusa la momentul expedierii ar fi trebuit lipita in fiecare, adica
 * exact „acelasi lucru in douazeci de copii": a douazeci si una ar fi aparut fara ea.
 *
 * Cronul le prinde pe toate prin constructie, oricum ar fi ajuns comanda acolo.
 *
 * ═══ ⚠ CE NU SEMNALEAZA, SI DE CE ═══
 *
 * 1. **Rambursul.** La plata la livrare „neplatit" e starea NORMALA a unei comenzi vii: marfa
 *    pleaca tocmai ca sa fie platita la usa. Ar fi zgomot pe fiecare colet.
 * 2. **Comenzile restituite.** Acolo banii AU intrat si au iesit inapoi, deliberat. `baniiAuIntrat`
 *    raspunde `false` si pentru ele, deci se taie anume, altfel fiecare retur ar suna o alarma.
 * 3. **Comenzile care n-au plecat inca** (`pending`, `confirmed`, `processing`). Cat timp marfa e
 *    la comerciant, plata neconfirmata nu e o paguba: e o comanda in asteptare, si de ea se
 *    ocupa maturatoarea de cupoane.
 * 4. **Comenzile anulate.** Nu mai e nimic de aparat.
 */

/** Starile in care marfa a IESIT deja de la comerciant. */
const MARFA_A_PLECAT = new Set(["shipped", "delivered"]);

/**
 * Starile de plata in care banii au fost si s-au intors, deliberat.
 *
 * ⚠ Tinut separat de `baniiAuIntrat`: acolo intrebarea e „sunt banii la comerciant ACUM", si
 * raspunsul e corect `false` pentru o restituire. Aici intrebarea e alta: „s-a pierdut ceva?",
 * iar la o restituire raspunsul e nu.
 */
const BANII_S_AU_INTORS = new Set(["refunded", "partially_refunded"]);

export type ComandaDeVerificat = {
  payment_method: string | null | undefined;
  payment_status: string | null | undefined;
  status: string | null | undefined;
};

/**
 * Comanda asta a plecat fara bani confirmati?
 *
 * ⚠ PURA SI EXPORTATA, ca sa poata fi probata fara baza si fara retea. Singurul loc care
 * hotaraste; cronul doar o cheama.
 */
export function marfaAPlecatFaraBani(o: ComandaDeVerificat): boolean {
  const metoda = (o.payment_method ?? "").trim();
  /*
   * ⚠ Numai procesatoarele online, si lista NU se rescrie aici: `PAYMENT_PROCESSOR_TYPES` e
   * aceeasi multime folosita de checkout si de pregatirea metodelor de plata. Scrisa a doua
   * oara, s-ar fi despartit de prima la primul procesator nou.
   */
  if (!(PAYMENT_PROCESSOR_TYPES as readonly string[]).includes(metoda)) return false;

  if (!MARFA_A_PLECAT.has((o.status ?? "").trim())) return false;
  if (BANII_S_AU_INTORS.has((o.payment_status ?? "").trim())) return false;

  return !baniiAuIntrat({ payment_status: o.payment_status });
}

/** Ce i se spune comerciantului. Scurt, cu numarul si suma, si cu pasul urmator. */
export function mesajulPentruComerciant(p: {
  orderNumber: string | number | null | undefined;
  total: unknown;
  metoda: string;
}): string {
  const numar = String(p.orderNumber ?? "").trim() || "fara numar";
  /*
   * ⚠ `Number(null)` e ZERO, nu `NaN`, si `Number("")` la fel.
   *
   * Prima varianta scria `Number.isFinite(Number(p.total))`, deci o comanda fara total ar fi
   * aparut in notificare drept „0.00 lei": comerciantul ar fi citit ca marfa a plecat pe gratis,
   * cand de fapt noi nu stim suma. Prins de proba, nu de citit codul. Vezi memoria
   * `feeduri-facebook-pretmax-zero`, unde aceeasi capcana a golit feedurile.
   */
  const suma = p.total === null || p.total === undefined || p.total === "" ? Number.NaN : Number(p.total);
  const bani = Number.isFinite(suma) ? `${suma.toFixed(2)} lei` : "suma necunoscuta";
  return (
    `Comanda ${numar} (${bani}) a fost expediata, dar plata prin ${p.metoda} NU e confirmata la noi. `
    + "Verifica in contul tau de procesator daca banii au intrat: daca da, marcheaza comanda platita "
    + "din pagina ei; daca nu, marfa a plecat neplatita."
  );
}
