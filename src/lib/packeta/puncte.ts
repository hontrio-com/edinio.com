/**
 * Punctele Packeta si curierii ei, din fluxurile v5.
 *
 * ═══ TREI FLUXURI, TREI INTELESURI ═══
 *
 * | flux | ce contine | ce se pune in `addressId` |
 * |---|---|---|
 * | `branch.json` | punctele fizice Packeta | id-ul PUNCTULUI |
 * | `box.json` | automatele Packeta (Z-BOX) | id-ul PUNCTULUI |
 * | `carrier.json` | curieri externi (livrare la adresa, si unii cu puncte proprii) | id-ul CURIERULUI |
 *
 * ⚠ La punctele de CURIER (nu ale Packetei) trebuie DOUA campuri: `addressId` =
 * id-ul curierului, iar codul punctului merge separat in `carrierPickupPoint`.
 * Punctele acelea stau intr-un flux propriu, pe care nu-l folosim: pentru Romania
 * livrarea la adresa prin Cargus/FAN/DPD/Sameday si punctele Packeta acopera
 * cazurile obisnuite, iar fiecare flux in plus e inca un fisier de descarcat la
 * fiecare cerere de checkout.
 *
 * ═══ ⚠ IN JSON-UL LOR TOTUL E SIR ═══
 *
 * `"id": "12"`, `"latitude": "48.97585"`, `"maxWeight": "15"`, `"displayFrontend":
 * "1"`. Nimic nu e numar, nici macar ce arata a numar. De aia fiecare citire de
 * mai jos trece prin `sir()` sau `numar()`, si niciuna nu se increde in tipul
 * primit.
 *
 * ═══ ⚠ FLUXURILE SUNT MONDIALE ═══
 *
 * Nu exista niciun parametru de tara: fisierele acopera TOATE tarile in care
 * lucreaza Packeta. Filtrarea se face la noi, pe campul `country` (doua litere,
 * minuscule). Fara ea, un magazin romanesc ar tine in memorie punctele din toata
 * Europa, iar cumparatorul ar putea alege un punct din Cehia.
 *
 * ═══ ⚠ STATUSUL PUNCTULUI NU SE IGNORA ═══
 *
 * Un punct inchis temporar ramane in flux, cu `status.statusId` schimbat, si
 * `displayFrontend` spune daca are voie sa fie aratat cumparatorului. Documentatia
 * celor doua fisiere ale lor se CONTRAZICE la intelesul codurilor 2 si 3 — deci nu
 * ne bazam pe numar, ci pe `displayFrontend`, care e neechivoc.
 */

/* ── Citiri care nu se incred in tipuri ───────────────────────────────────── */

function sir(v: unknown): string {
  if (typeof v === "string") return v.trim();
  if (typeof v === "number" && Number.isFinite(v)) return String(v);
  return "";
}

function numar(v: unknown): number | null {
  const t = sir(v);
  if (!t) return null;
  const n = Number(t);
  return Number.isFinite(n) ? n : null;
}

/** „1"/„yes"/„true" → adevarat. Fluxul foloseste toate trei, pe campuri diferite. */
function bifa(v: unknown): boolean {
  const t = sir(v).toLowerCase();
  return t === "1" || t === "yes" || t === "true";
}

/* ── Punctele Packeta (branch + box) ──────────────────────────────────────── */

export interface PunctPacketa {
  /** ⚠ SIR. Merge direct in `addressId`. */
  id: string;
  nume: string;
  strada: string;
  oras: string;
  codPostal: string;
  tara: string;
  lat: number | null;
  lng: number | null;
  /** Greutatea maxima acceptata, in kg. `null` cand fluxul n-o da. */
  maxKg: number | null;
  /** Automatele Z-BOX se deosebesc de punctele fizice: alt program, alte reguli. */
  automat: boolean;
  /** Ramburs acceptat. La automate vine din `codAllowed`; la puncte se presupune da. */
  acceptaRamburs: boolean;
}

/**
 * Normalizeaza un flux de puncte (branch sau box).
 *
 * ⚠ Se pastreaza doar punctele care se pot ARATA (`displayFrontend`) si care sunt
 * in tara ceruta. Un punct ascuns de ei si aratat de noi ar fi o comanda pe care
 * n-o poate ridica nimeni.
 */
export function normalizeazaPuncte(brut: unknown, tara: string, automat: boolean): PunctPacketa[] {
  if (!Array.isArray(brut)) return [];
  const t = tara.trim().toLowerCase();
  const iesire: PunctPacketa[] = [];

  for (const r of brut) {
    if (!r || typeof r !== "object") continue;
    const o = r as Record<string, unknown>;

    const id = sir(o.id);
    if (!id) continue;
    if (sir(o.country).toLowerCase() !== t) continue;
    /* ⚠ `displayFrontend` e neechivoc; codurile de status se contrazic intre
       cele doua fisiere ale documentatiei lor. */
    if (!bifa(o.displayFrontend)) continue;

    iesire.push({
      id,
      nume: sir(o.name) || sir(o.labelName) || `Punct ${id}`,
      strada: sir(o.street),
      oras: sir(o.city),
      codPostal: sir(o.zip),
      tara: t,
      lat: numar(o.latitude),
      lng: numar(o.longitude),
      maxKg: numar(o.maxWeight),
      automat,
      /*
       * La automate steagul e explicit. La punctele fizice documentatia spune ca
       * „support COD", deci lipsa campului inseamna DA — dar daca vine, se crede.
       */
      acceptaRamburs: "codAllowed" in o ? bifa(o.codAllowed) : true,
    });
  }
  return iesire;
}

/* ── Curierii (livrare la adresa) ─────────────────────────────────────────── */

export interface CurierPacketa {
  /** ⚠ SIR. Merge in `addressId` la livrarea la adresa. */
  id: string;
  nume: string;
  tara: string;
  /** `true` cand curierul are retea proprie de puncte (atunci trebuie `carrierPickupPoint`). */
  arePuncte: boolean;
  /** Curierul NU accepta ramburs. Steagul lor: `disallowsCod`. */
  faraRamburs: boolean;
  /** Curierul cere numarul casei SEPARAT de strada. */
  numarSeparat: boolean;
  /** Curierul cere dimensiunile coletului. */
  cereDimensiuni: boolean;
  maxKg: number | null;
  /** Se poate tipari eticheta direct a curierului. */
  etichetaProprie: boolean;
}

/**
 * Normalizeaza `carrier.json`.
 *
 * ⚠ Se pastreaza si curierii cu puncte proprii, dar se marcheaza: `addressId`-ul
 * lor NU e de ajuns, mai trebuie si codul punctului. Cine ii ofera la checkout ca
 * livrare la adresa trimite un colet care nu se poate livra.
 */
export function normalizeazaCurieri(brut: unknown, tara: string): CurierPacketa[] {
  if (!Array.isArray(brut)) return [];
  const t = tara.trim().toLowerCase();
  const iesire: CurierPacketa[] = [];

  for (const r of brut) {
    if (!r || typeof r !== "object") continue;
    const o = r as Record<string, unknown>;
    const id = sir(o.id);
    if (!id) continue;
    if (sir(o.country).toLowerCase() !== t) continue;

    iesire.push({
      id,
      nume: sir(o.name) || `Curier ${id}`,
      tara: t,
      arePuncte: bifa(o.pickupPoints),
      faraRamburs: bifa(o.disallowsCod),
      numarSeparat: bifa(o.separateHouseNumber),
      cereDimensiuni: bifa(o.requiresSize),
      maxKg: numar(o.maxWeight),
      etichetaProprie: bifa(o.apiAllowed),
    });
  }
  return iesire;
}

/**
 * Curierii care se pot oferi ca LIVRARE LA ADRESA.
 *
 * ⚠ Se scot cei cu retea proprie de puncte: ei cer si `carrierPickupPoint`, iar
 * fara el coletul nu are destinatie. Se scot si cei care nu accepta ramburs, cand
 * comanda are ramburs — altfel emiterea ar pica abia la furnizor, dupa ce
 * cumparatorul a plasat comanda.
 */
export function curieriLaAdresa(curieri: CurierPacketa[], cuRamburs: boolean): CurierPacketa[] {
  return curieri.filter((c) => !c.arePuncte && !(cuRamburs && c.faraRamburs));
}

/** Curierul ales, dupa id. Intoarce `null` cand id-ul nu mai e in flux. */
export function curierDupaId(curieri: CurierPacketa[], id: string): CurierPacketa | null {
  const t = sir(id);
  return curieri.find((c) => c.id === t) ?? null;
}

/**
 * Punctele care pot primi coletul.
 *
 * Se filtreaza pe greutate si pe ramburs — cele doua motive pentru care un punct
 * refuza un colet dupa ce a fost ales. `maxKg` lipsa inseamna „nu stim", si atunci
 * nu se exclude nimic: o presupunere ar scoate puncte bune.
 */
export function puncteBune(puncte: PunctPacketa[], greutateKg: number, ramburs: number): PunctPacketa[] {
  const g = Number(greutateKg);
  const cuRamburs = Number(ramburs) > 0;
  return puncte.filter((p) => {
    if (cuRamburs && !p.acceptaRamburs) return false;
    if (p.maxKg !== null && Number.isFinite(g) && g > p.maxKg) return false;
    return true;
  });
}
