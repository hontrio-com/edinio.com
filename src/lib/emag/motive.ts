/**
 * Motivul pentru care eMAG a respins o ofertă, cules din răspunsul lor.
 *
 * ═══ ⚠ DE CE EXISTĂ (audit 24.08.2026) ═══
 *
 * 152 de oferte ale unui comerciant sunt respinse de eMAG: 112 cu documentația
 * respinsă, 34 blocate, 6 cu EAN respins. La **toate 152**, `doc_errors` e gol.
 *
 * Deci omul are 152 de produse refuzate și nu-i arătăm niciun motiv pentru niciunul.
 * E chiar greșeala scrisă în planul integrării ca fiind de evitat — lecția Trendyol,
 * unde motivul n-a fost arătat și produsele au stat „în aprobare" la nesfârșit, cu
 * comerciantul convins că noi le ținem pe loc.
 *
 * ═══ ⚠ DE CE SE CAUTĂ ÎN MAI MULTE LOCURI, ÎN LOC SĂ ȘTIM UNUL ═══
 *
 * Răspunsul lui `product_offer/read` **nu e în schema lor** — e `ApiResponse` generic.
 * `doc_errors` a fost o presupunere de-a noastră, exact ca `ownership`, care s-a
 * dovedit `boolean` acolo unde documentația lor scrie 1/2.
 *
 * Așa că nu se mai ghicește o cheie. Se caută în toate formele plauzibile, se ia ce se
 * găsește, iar răspunsul întreg se păstrează în `raspuns_brut` pentru ofertele
 * respinse — ca data viitoare să existe dovadă, nu o a doua presupunere.
 */

/** Stările în care eMAG a spus „nu": marcă, EAN, documentație, blocat, actualizare. */
export const EMAG_VALIDARE_RESPINSA: readonly number[] = [5, 6, 8, 10, 12] as const;

export function eRespinsaDeEmag(validationStatus: number | null | undefined): boolean {
  return validationStatus != null && EMAG_VALIDARE_RESPINSA.includes(validationStatus);
}

/**
 * Cheile sub care am văzut sau am putea vedea un motiv.
 *
 * ⚠ Ordinea nu contează: se adună din toate, apoi se dedublează. Un motiv repetat sub
 * două chei e același motiv, nu două.
 */
const CHEI = [
  "doc_errors", "docErrors", "errors", "validation_errors", "validationErrors",
  "messages", "message", "errors_list", "reasons", "observations",
] as const;

function textDin(v: unknown, adanc = 0): string[] {
  if (v == null || adanc > 3) return [];
  if (typeof v === "string") {
    const t = v.trim();
    return t ? [t] : [];
  }
  if (typeof v === "number" || typeof v === "boolean") return [String(v)];
  if (Array.isArray(v)) return v.flatMap((x) => textDin(x, adanc + 1));
  if (typeof v === "object") {
    const o = v as Record<string, unknown>;
    /*
     * ⚠ La un obiect se caută întâi câmpurile care poartă text pentru OM. Luat întreg
     * și serializat, motivul ar fi ajuns pe ecran ca `{"field":"ean","code":17}` — o
     * formă pe care comerciantul nu are ce să facă.
     */
    const alese = ["message", "error", "text", "description", "reason", "value"]
      .flatMap((k) => textDin(o[k], adanc + 1));
    if (alese.length > 0) return alese;
    return Object.values(o).flatMap((x) => textDin(x, adanc + 1));
  }
  return [];
}

/**
 * Ce a spus eMAG despre oferta asta, în cuvinte.
 *
 * ⚠ Întoarce lista goală când n-au spus nimic — și asta e o informație, nu o lipsă.
 * O ofertă respinsă fără niciun motiv scris înseamnă că motivul e numai în panoul lor,
 * iar ecranul trebuie să spună chiar asta, nu să tacă.
 */
export function motiveDeLaEi(oferta: unknown): string[] {
  if (!oferta || typeof oferta !== "object") return [];
  const o = oferta as Record<string, unknown>;
  const brute = CHEI.flatMap((k) => textDin(o[k]));

  const vazute = new Set<string>();
  const iesire: string[] = [];
  for (const t of brute) {
    /* ⚠ Se taie la o lungime pe care o poate citi cineva. Un motiv de trei mii de
       caractere nu e un motiv, e un fișier lipit într-un câmp. */
    const scurt = t.length > 400 ? `${t.slice(0, 400)}…` : t;
    if (vazute.has(scurt)) continue;
    vazute.add(scurt);
    iesire.push(scurt);
  }
  return iesire;
}
