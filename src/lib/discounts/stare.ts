/**
 * ═══════════════════════════════════════════════════════════════════════════
 * IN CE STARE E UN COD DE DISCOUNT                              (21.09.2026)
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * Pana acum ecranul arata DOUA stari („Activ" / „Inactiv"), si calcula pe loc,
 * in mijlocul randului din tabel, daca a expirat sau s-a epuizat. Adevaratele
 * stari sunt cinci, iar comerciantul are de facut altceva la fiecare.
 *
 * ⚠ REGULA STA AICI, INTR-UN SINGUR LOC, fiindca o va intreba si lista, si
 * filtrul, si sertarul, si cardurile din cap. Scrisa de patru ori, s-ar fi
 * despartit — si atunci filtrul „expirate" ar fi aratat alte coduri decat cele
 * scrise „Expirat" in tabel.
 */

/** Ce tine un cod din a fi folosit acum. `activ` inseamna ca nimic nu-l tine. */
export const STARI = ["activ", "oprit", "programat", "expirat", "epuizat"] as const;
export type StareCod = (typeof STARI)[number];

/** Cat stie regula despre un cod. Numai atat — ca sa poata fi probata cu numere. */
export interface CodDeJudecat {
  is_active: boolean;
  starts_at?: string | null;
  expires_at: string | null;
  max_uses: number | null;
  uses_count: number;
}

function clipa(iso: string | null | undefined): number | null {
  if (!iso) return null;
  const t = new Date(iso).getTime();
  return Number.isFinite(t) ? t : null;
}

/**
 * Starea unui cod, dintr-o singura privire.
 *
 * ⚠⚠ ORDINEA E CEA A LUCRULUI DE FACUT, nu una intamplatoare. Un cod poate fi
 * deodata oprit, expirat SI epuizat; pe rand incape o singura eticheta, si
 * trebuie sa fie cea care ii spune comerciantului ce are de facut:
 *
 *   1. `oprit`     comutatorul e pe nu. Se repara dintr-o apasare, si e singura
 *                  stare pusa de om — deci prima care trebuie stiuta.
 *   2. `expirat`   a trecut data. Se repara schimband data.
 *   3. `epuizat`   s-a atins `max_uses`. Se repara urcand limita.
 *   4. `programat` nu e nimic de reparat: porneste singur.
 *   5. `activ`     nimic nu-l tine.
 *
 * ⚠ Si de-aia sertarul arata TOATE motivele (`toateMotivele`), nu doar primul:
 * cine reaprinde un cod oprit si expirat trebuie sa afle acum ca mai are un pas,
 * nu dupa ce apasa si nu se intampla nimic.
 */
export function stareaCodului(d: CodDeJudecat, acum: number = Date.now()): StareCod {
  if (!d.is_active) return "oprit";

  const pana = clipa(d.expires_at);
  if (pana !== null && pana < acum) return "expirat";

  if (d.max_uses !== null && d.uses_count >= d.max_uses) return "epuizat";

  const de = clipa(d.starts_at);
  if (de !== null && de > acum) return "programat";

  return "activ";
}

/** Toate motivele pentru care un cod nu se poate folosi, nu doar primul. */
export function toateMotivele(d: CodDeJudecat, acum: number = Date.now()): StareCod[] {
  const out: StareCod[] = [];
  if (!d.is_active) out.push("oprit");

  const pana = clipa(d.expires_at);
  if (pana !== null && pana < acum) out.push("expirat");

  if (d.max_uses !== null && d.uses_count >= d.max_uses) out.push("epuizat");

  const de = clipa(d.starts_at);
  if (de !== null && de > acum) out.push("programat");

  return out;
}

/** Se poate folosi acum de un cumparator? */
export function sePoateFolosi(d: CodDeJudecat, acum: number = Date.now()): boolean {
  return toateMotivele(d, acum).length === 0;
}

/**
 * ═══════════════════════════════════════════════════════════════════════════
 * CINE MAI INTREABA „E BUN CODUL ASTA ACUM?"                     (21.09.2026)
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * ⚠⚠ NU DOAR ECRANUL DE DISCOUNTURI. Automatizarea de cos abandonat alege un
 * cod ca sa-l puna intr-un email, iar pana azi il alegea cu un filtru scris pe
 * loc, care se uita NUMAI la `expires_at` (`abandoned-cart.actions.ts:340`).
 *
 * Pana ieri filtrul acela era aproape bun, fiindca `is_active` tinea loc de
 * restul. De azi NU MAI E: un cod programat pentru Black Friday e `is_active =
 * true` de pe acum, deci ar fi intrat in lista, ar fi plecat intr-un email
 * trimis azi, iar cumparatorul care da clic pe linkul de recuperare ar fi
 * primit `ESEC_CUPON` — fara niciun mesaj, fiindca auto-aplicarea inghite
 * esecul. Omul plateste intreg dupa ce i s-a promis o reducere in scris, iar
 * campania programata se scurge in public inaintea datei ei.
 *
 * ⚠ SI COLOANELE SE CER DE AICI. Cerute pe loc la fiecare apelant, una uitata
 * n-ar da nicio eroare: campul ar fi `undefined`, `stareaCodului` ar sari
 * poarta lui, si codul ar parea bun. Exact asa se pierduse `starts_at`.
 */
export const COLOANELE_STARII = "is_active, starts_at, expires_at, max_uses, uses_count";

/** Din randurile aduse, doar cele care chiar merg acum. */
export function doarFolosibile<T extends CodDeJudecat>(
  randuri: readonly T[] | null | undefined,
  acum: number = Date.now(),
): T[] {
  return (randuri ?? []).filter((d) => sePoateFolosi(d, acum));
}

/**
 * Tonul fiecarei stari, pentru `EtichetaStare`.
 *
 * ⚠ SE TRECE TONUL, NU CULOAREA. Ecranele spun „stare de asteptare", nu
 * „galben": daca maine „Programat" trebuie sa arate altfel, se schimba intr-un
 * singur loc, in `eticheta-stare.tsx`.
 *
 * ⚠ „Oprit" e NEUTRU, nu rosu: un cod pe care comerciantul l-a inchis dinadins
 * nu e un defect. Rosul ramane pentru ce s-a terminat fara voia lui — expirat
 * si epuizat, cele doua care opresc o campanie in mijlocul ei.
 */
export const TONUL_STARII = {
  activ: "bun",
  oprit: "neutru",
  programat: "info",
  expirat: "rau",
  epuizat: "rau",
} as const;

export const DESPRE_STARE: Record<StareCod, { text: string; explicatie: string }> = {
  activ: {
    text: "Activ",
    explicatie: "Poate fi folosit acum de cumpărători.",
  },
  oprit: {
    text: "Oprit",
    explicatie: "L-ai oprit tu din comutator. Pornește-l la loc ca să poată fi folosit.",
  },
  programat: {
    text: "Programat",
    explicatie: "Pornește singur la data pe care ai pus-o. Până atunci nu se poate folosi.",
  },
  expirat: {
    text: "Expirat",
    explicatie: "A trecut data până la care era valabil. Schimbă data ca să-l folosești din nou.",
  },
  epuizat: {
    text: "Epuizat",
    explicatie: "S-a atins numărul maxim de utilizări. Urcă limita ca să meargă mai departe.",
  },
};

/**
 * Ce a facut un cod, asa cum raspunde `discount_stats`.
 *
 * ⚠ `baniDati` e ZERO la codurile de transport gratuit, si nu e un defect:
 * economia sta in `shipping_cost`, care ajunge 0 si nu pastreaza nicaieri cat ar
 * fi fost. De-aia exista si `comenziCuTransportOferit`: se poate spune CATE
 * comenzi, nu CATI lei. Vezi `migrations/2026-09-21-discounturi-cifrele.sql`.
 */
export interface CifreleCodului {
  comenziTotal: number;
  comenziValide: number;
  comenziCazute: number;
  baniDati: number;
  vanzari: number;
  comenziCuTransportOferit: number;
}

/* ── Cele doua numere de utilizari ──────────────────────────────────────── */

/**
 * ⚠⚠ „UTILIZARI" RASPUNDEA LA ALTA INTREBARE DECAT PAREA.
 *
 * `uses_count` SCADE inapoi cand o comanda se anuleaza (`release_order_discount`),
 * fiindca utilizarea se da inapoi campaniei. Masurat pe demo: `BINEAIVENIT10`
 * scria 26, dar codul e pe 30 de comenzi — patru anulate.
 *
 * ⚠ MASURAT DUPA ACEEA, si e mai curat decat credeam: `uses_count` e EXACT
 * numarul comenzilor care n-au cazut. Verificat pe toate cele sapte coduri
 * folosite din magazinul de demo — `uses_count = comenzi_valide` la fiecare.
 *
 * Deci cele doua cifre sunt:
 *   `uses_count`     comenzile VALIDE. E cifra corecta pentru `max_uses`:
 *                    „26 din 100" inseamna ca mai sunt 74 de utilizari libere.
 *   `comenzi_total`  toate comenzile, cu tot cu cele anulate sau rambursate.
 *
 * Hotararea lui: se arata amandoua, iar a doua numai cand difera — ca sa nu se
 * adauge zgomot pe codurile fara anulari.
 */
export function utilizarile(
  d: { uses_count: number; max_uses: number | null },
  comenziInTotal: number | null,
): { principal: string; langa: string | null } {
  const principal = d.max_uses !== null
    ? `${d.uses_count} din ${d.max_uses}`
    : `${d.uses_count}`;

  const langa = comenziInTotal !== null && comenziInTotal !== d.uses_count
    ? `${comenziInTotal} în total`
    : null;

  return { principal, langa };
}

/**
 * Explicatia celor doua cifre, aratata acolo unde e loc de ea.
 *
 * ⚠ Se scrie de ce difera, nu doar ca difera. „26 folosite · 30 în total" fara
 * lamurire il pune pe comerciant sa creada ca una dintre ele e stricata.
 */
export const DE_CE_DOUA_CIFRE =
  "Prima cifră arată câte utilizări sunt consumate acum — ea se compară cu limita. "
  + "A doua arată de câte ori a fost folosit codul, cu tot cu comenzile anulate: "
  + "la o anulare, utilizarea se dă înapoi campaniei.";
