/**
 * Motivul pentru care eMAG a respins o ofertă, cules din răspunsul lor.
 *
 * ═══ ⚠ DE CE EXISTĂ (audit 24.08.2026) ═══
 *
 * 154 de oferte ale unui comerciant sunt respinse de eMAG: 114 cu documentația
 * respinsă, 34 blocate, 6 cu EAN respins. La **toate 154**, `doc_errors` e gol.
 *
 * Deci omul are 154 de produse refuzate și nu-i arătăm niciun motiv pentru niciunul.
 * E chiar greșeala scrisă în planul integrării ca fiind de evitat — lecția Trendyol,
 * unde motivul n-a fost arătat și produsele au stat „în aprobare" la nesfârșit, cu
 * comerciantul convins că noi le ținem pe loc.
 *
 * ═══ ⚠ UNDE STĂ MOTIVUL, DE FAPT (măsurat pe cele 154 de respinse) ═══
 *
 * `doc_errors` la nivel de ofertă e gol la TOATE 154. Motivul e îngropat la:
 *
 *     validation_status[].errors.errors[].message.ro_RO
 *     validation_status[].errors.warnings[].message.ro_RO
 *
 * Prima formă a funcției se uita numai la chei de NIVEL ÎNTÂI, deci nu-l atingea
 * niciodată. Iar ecranul scria omului „eMAG nu trimite motivul prin API" — ceea ce era
 * fals: îl trimiseseră, era la noi, netranscris.
 *
 * ⚠ Și sunt mesaje pe care le poate FOLOSI, scrise în română: „Marime — Te rugăm să
 * adaugi mărimea produsului…" (×32), „Tip Produs — …" (×14), „Produsul a fost încadrat
 * într-o categorie greșită… îți recomandăm: Botine damă, Ghete damă" (×8).
 *
 * ⚠ Se citesc ȘI avertismentele, nu doar erorile. Din 114 oferte cu documentația
 * respinsă, 49 au erori și 27 au NUMAI avertismente — iar acelea sunt la fel de
 * acționabile: „Brand invalid (Pentru ca aceasta informatie sa fie salvata pe produs,
 * te rugam sa o corectezi)". Citite doar erorile, cele 27 ar fi rămas tot fără motiv.
 *
 * ⚠ Culesul generic pe chei de nivel întâi RĂMÂNE dedesubt. Răspunsul lui
 * `product_offer/read` nu e în schema lor (`ApiResponse` generic), iar ziua în care
 * `ownership` a venit `boolean` acolo unde documentația scrie 1/2 a arătat cât valorează
 * o presupunere. Calea de mai sus e măsurată; plasa de dedesubt e pentru ce n-am văzut.
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

/**
 * Ordinea limbilor. Româna întâi: comerciantul e român, iar ei trimit toate trei.
 *
 * ⚠ Fără alegerea asta, un mesaj ar fi ajuns pe ecran de trei ori, în trei limbi — și
 * niciuna sigur prima.
 */
const LIMBI = ["ro_RO", "ro", "en_GB", "en", "hu_HU", "bg_BG"] as const;

/** Un obiect ale cărui chei sunt TOATE etichete de limbă: `{ro_RO: …, en_GB: …}`. */
function eHartaDeLimbi(o: Record<string, unknown>): boolean {
  const chei = Object.keys(o);
  return chei.length > 0 && chei.every((k) => /^[a-z]{2}(_[A-Z]{2})?$/.test(k));
}

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

    /* ⚠ `{ro_RO: …, en_GB: …, bg_BG: …}` e UN mesaj în trei limbi, nu trei motive. */
    if (eHartaDeLimbi(o)) {
      for (const l of LIMBI) {
        const t = textDin(o[l], adanc + 1);
        if (t.length > 0) return [t[0]];
      }
      return Object.values(o).flatMap((x) => textDin(x, adanc + 1)).slice(0, 1);
    }
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

function lista(v: unknown): Record<string, unknown>[] {
  return Array.isArray(v) ? v.filter((x): x is Record<string, unknown> => !!x && typeof x === "object") : [];
}

/**
 * Un motiv adus la o singură propoziție: textul lor, plus lămurirea când există.
 *
 * ⚠ `extraInfo` se lipește ANUME. Mesajul „Caracteristica/Caracteristici mandatory
 * lipsă" e adevărat și nefolositor: nu spune CARE. `extraInfo` spune — „The product must
 * have both size and converted size values" — și e singura parte care îi arată omului
 * ce să facă. Sunt 20 de rânduri cu ea, exact cele mai greu de ghicit.
 */
function unMotiv(er: Record<string, unknown>): string | null {
  const text = textDin(er.message, 1)[0] ?? textDin(er.description, 1)[0] ?? null;
  const extra = typeof er.extraInfo === "string" ? er.extraInfo.trim() : "";
  if (!text) return extra || (typeof er.code === "string" ? er.code : null);
  return extra ? `${text} (${extra})` : text;
}

/**
 * Motivele din locul MĂSURAT: `validation_status[].errors.{errors,warnings}[]`.
 *
 * ⚠ Erorile întâi, avertismentele după — asta e și ordinea în care le citește omul, și
 * ordinea gravității. Un avertisment nu blochează singur, dar când erori nu există el e
 * tot ce ne-au spus.
 */
function motiveDinValidare(o: Record<string, unknown>): string[] {
  const iesire: string[] = [];
  for (const cheie of ["errors", "warnings"] as const) {
    for (const vs of lista(o.validation_status)) {
      const cutie = vs.errors;
      if (!cutie || typeof cutie !== "object") continue;
      for (const er of lista((cutie as Record<string, unknown>)[cheie])) {
        const t = unMotiv(er);
        if (t) iesire.push(t);
      }
    }
  }
  return iesire;
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
  /* ⚠ Locul măsurat întâi, plasa generică după: vezi antetul fișierului. */
  const brute = [...motiveDinValidare(o), ...CHEI.flatMap((k) => textDin(o[k]))];

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
