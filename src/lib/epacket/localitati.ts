import { codAutoAlJudetului } from "@/lib/ro/judete";
import { normalizeCountyName, sectorBucuresti } from "@/lib/utils/ro-address";
import type { LocalitateEpacket } from "./client";

/**
 * Localitatea comenzii -> id-ul din nomenclatorul e-packet (`locality_id`, obligatoriu la tarif
 * si la AWB).
 *
 * ═══ CE S-A MASURAT, pe 07.10.2026 ═══
 *
 * Nomenclatorul: 14.179 de localitati in 42 de judete, numele FARA diacritice, cand cu majuscule
 * („CLUJ NAPOCA"), cand nu („Campia turzii"). Satele poarta comuna in paranteza („Victoria
 * (Hlipiceni)"). Acelasi nume apare in mai multe judete („Sfantu Gheorghe" in CV, IL, MS, TL), deci
 * JUDETUL e obligatoriu la potrivire; si de 6 ori de doua ori in ACELASI judet („Salistea" in VL).
 *
 * ⚠ BUCURESTIUL NU EXISTA CA LOCALITATE: sunt sase, „Sectorul 1 (Bucuresti)" ... „Sectorul 6".
 * Iar cautarea lor dupa „sector 3" NU gaseste nimic; trebuie „Sectorul 3".
 *
 * Pe 600 de comenzi reale (ultimele 120 de zile, productie): in afara capitalei, 447 din 477 cu
 * judet cunoscut se potrivesc pe O SINGURA localitate, 7 pe mai multe, 23 pe niciuna (texte ca
 * „com Olari sat Olarii Vechi", „Dr Tr Severin", „Rimnicu Vilcea"). In capitala, 90 din 101 au
 * sectorul scris undeva (oras, judet sau strada).
 *
 * ⚠ NU SE GHICESTE NICIODATA. Mai multe potriviri sau niciuna = omul alege in fereastra de AWB,
 * dintr-o lista citita de la ei. O localitate gresita trimite coletul in alt colt de tara.
 */

/** Cheia de comparatie: fara diacritice, fara majuscule, cratima si punctul ca spatiul. */
export function cheieLocalitate(s: string | null | undefined): string {
  return (s ?? "")
    .normalize("NFD")
    .replace(/\p{M}+/gu, "")
    .toLowerCase()
    .replace(/[-.,_/]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/** Numele fara paranteza comunei: „Victoria (Hlipiceni)" -> „victoria". */
function baza(nume: string): string {
  return cheieLocalitate(nume.replace(/\s*\(.*\)\s*$/, ""));
}

const PREFIXE = /^(municipiul|municipiu|mun|orasul|oras|or|comuna|com|satul|sat|localitatea|loc|judetul|jud)\s+/;

/**
 * Formele in care se poate cauta orasul scris de om, in ordinea increderii.
 *
 * „com Olari sat Olarii Vechi" -> [„olarii vechi", „olari"]: satul e localitatea, comuna e o
 * rezerva. „Calinesti nr 40" -> [„calinesti"]. „Tg Carbunesti," -> [„tg carbunesti", „targu
 * carbunesti"]. Nimic nu se inventeaza: sunt doar taieturi ale textului lui.
 */
export function formeleOrasului(oras: string | null | undefined, judet?: string | null): string[] {
  /*
   * ⚠ „Sat (Comuna)" e forma pe care o scrie CHECKOUTUL NOSTRU pentru sate („Tantava (Gradinari)",
   * „Lespezi (Comuna Hartiesti)"; 30 din 600 de comenzi reale). Satul e localitatea; comuna se
   * citeste separat (`comunaDinOras`) si alege intre omonime.
   */
  let s = cheieLocalitate((oras ?? "").replace(/\s*\(.*\)\s*$/, ""));
  /* Ce vine dupa un „jud"/„judetul" e judetul, nu orasul; codul postal si „nr 40", la fel. */
  s = s.replace(/\s+(jud|judetul)\s+.*$/, "").replace(/\s+nr\s+\S+.*$/, "").replace(/\b\d{6}\b/g, "").replace(/\s+/g, " ").trim();
  if (!s) return [];

  const forme: string[] = [];
  const adauga = (v: string) => {
    let x = v.trim();
    for (let i = 0; i < 3 && PREFIXE.test(x); i++) x = x.replace(PREFIXE, "").trim();
    if (x && !forme.includes(x)) forme.push(x);
  };

  /* „... sat Y": satul intai. */
  const sat = /\b(?:sat|satul)\s+(.+)$/.exec(s);
  if (sat) adauga(sat[1]);
  const faraSat = s.replace(/\s+(?:sat|satul)\s+.+$/, "");
  /* „Boureni comuna Motca": satul e in fata, comuna dupa. */
  const comuna = /^(.+?)\s+(?:comuna|com)\s+(.+)$/.exec(faraSat);
  if (comuna) { adauga(comuna[1]); adauga(comuna[2]); }
  adauga(faraSat);
  /*
   * Judetul lipit la coada („Rosu Ilfov"), numai daca e CHIAR judetul dat, si numai ca REZERVA,
   * dupa forma intreaga. ⚠ Pusa inaintea ei, taia „Ramnicu Valcea" in „Ramnicu", „Piatra Neamt"
   * in „Piatra", „Curtea de Arges" in „Curtea de": 24 de comenzi reale pierdute la masuratoare.
   */
  const j = cheieLocalitate(normalizeCountyName(judet ?? ""));
  for (const f of [...forme]) {
    if (j && f.endsWith(` ${j}`) && f.length > j.length + 1) adauga(f.slice(0, -(j.length + 1)));
  }
  /* Prescurtarile si grafia veche („î" scris unde azi e „â"), scrise de oameni. Tot rezerve. */
  for (const f of [...forme]) {
    adauga(f
      .replace(/^(tg|tirgu|trg)\s+/, "targu ")
      .replace(/^dr\s+tr\s+/, "drobeta turnu ")
      .replace(/^rm\s+/, "ramnicu ")
      .replace(/^v\s+/, "valea ")
      .replace(/^cimp/, "camp")
      .replace(/^rimnic/, "ramnic")
      .replace(/^risnov\b/, "rasnov")
      .replace(/^sinnicolau\b/, "sannicolau")
      .replace(/\bvilcea\b/, "valcea"));
  }
  return forme;
}

/**
 * Comuna scrisa de om langa sat: „Boureni comuna Motca", „com Olari sat Olarii Vechi", sau in
 * paranteza, cum o scrie checkoutul: „Tantava (Gradinari)", „Lespezi (Comuna Hartiesti)". `null`
 * cand n-a scris-o. Alege intre satele omonime din acelasi judet (`alegeLocalitatea`).
 */
export function comunaDinOras(oras: string | null | undefined): string | null {
  const paranteza = /\(([^)]*)\)\s*$/.exec(oras ?? "");
  if (paranteza) {
    const c = cheieLocalitate(paranteza[1]).replace(PREFIXE, "").trim();
    if (c) return c;
  }
  const s = cheieLocalitate(oras).replace(/\s+(jud|judetul)\s+.*$/, "");
  const m = /\b(?:comuna|com)\s+(.+?)(?:\s+(?:sat|satul)\s+.*)?$/.exec(s);
  return m ? m[1].trim() || null : null;
}

/** Codul de judet al lor (B, CJ, IS...), din ce a scris omul, sau `null` daca nu-l stim. */
export function codJudet(judet: string | null | undefined, oras?: string | null): string | null {
  /* „Judetul Iasi": prefixul il scoate `normalizeCountyName`, potrivirea comuna nu-l stie. */
  const cod = codAutoAlJudetului(judet) ?? codAutoAlJudetului(normalizeCountyName(judet ?? ""));
  if (cod) return cod;
  /* Judetul gol sau necunoscut, dar orasul spune clar capitala (sau un sector). */
  const o = cheieLocalitate(oras);
  if (/\bbucuresti\b|\bbucharest\b/.test(o) || sectorBucuresti(oras) !== null) return "B";
  return null;
}

/**
 * Sectorul unei adrese din capitala: din oras, apoi judet, apoi strada. `null` = nu scrie nicaieri,
 * si atunci NU se ghiceste (aceeasi regula ca `sectorBucuresti`).
 */
export function sectorulAdresei(oras?: string | null, judet?: string | null, strada?: string | null): number | null {
  return sectorBucuresti(oras) ?? sectorBucuresti(judet) ?? sectorBucuresti(strada);
}

/** Textul de cautat pentru un sector: „Sectorul 3" (cu „sector 3" nu gasesc nimic, masurat). */
export function cautareSector(sector: number): string {
  return `Sectorul ${sector}`;
}

export type Potrivire =
  /** Exact una: se foloseste fara intrebare. */
  | { fel: "unica"; localitate: LocalitateEpacket }
  /** Mai multe cu acelasi nume in acelasi judet: alege omul. */
  | { fel: "mai_multe"; candidati: LocalitateEpacket[] }
  /** Niciuna cu numele asta; `candidati` sunt ce au intors ei la cautare, pentru alegere. */
  | { fel: "niciuna"; candidati: LocalitateEpacket[] };

/**
 * Alege localitatea dintr-un raspuns al lor (`GET /localities?search=...&county=...`).
 *
 * ⚠ Cautarea lor prinde SUBSIRURI, si in judet: „cluj" in CJ intoarce si „Agarbiciu (Cluj)",
 * iar „Piatra Neamt" intoarce si „Valeni (Piatra Neamt)". Deci aici se cere EGALITATE pe numele
 * fara paranteza, si numai in judetul cerut.
 */
export function alegeLocalitatea(raspuns: LocalitateEpacket[], cautat: string, judet: string, comuna?: string | null): Potrivire {
  const k = cheieLocalitate(cautat);
  const dinJudet = raspuns.filter((l) => l.judet.toUpperCase() === judet.toUpperCase());
  const exacte = dinJudet.filter((l) => baza(l.nume) === k);
  if (exacte.length === 1) return { fel: "unica", localitate: exacte[0] };
  /*
   * Satele omonime dintr-un judet se deosebesc prin COMUNA din paranteza: „Boureni (Motca)",
   * „Boureni (Bals)". Cand omul a scris comuna, ea alege; altfel alege el.
   */
  const c = cheieLocalitate(comuna);
  if (exacte.length > 1 && c) {
    const dinComuna = exacte.filter((l) => cheieLocalitate(/\(([^)]*)\)/.exec(l.nume)?.[1]) === c);
    if (dinComuna.length === 1) return { fel: "unica", localitate: dinComuna[0] };
  }
  if (exacte.length > 1) return { fel: "mai_multe", candidati: exacte };
  return { fel: "niciuna", candidati: dinJudet.slice(0, 50) };
}

/** Ce se intoarce omului (fereastra) sau lotului. */
export type RezultatLocalitate =
  | { fel: "gasita"; localitate: LocalitateEpacket }
  | { fel: "de_ales"; motiv: string; candidati: LocalitateEpacket[] };

export type CautaLocalitati = (cauta: string, judet: string) => Promise<LocalitateEpacket[]>;

/**
 * Localitatea unei adrese, cu cautari la ei. `cauta` se injecteaza (probe fara retea; cache in
 * actiune). O cautare picata ARUNCA: „nu s-a putut cauta" nu e „nu exista".
 */
export async function rezolvaLocalitatea(
  adresa: { oras?: string | null; judet?: string | null; strada?: string | null },
  cauta: CautaLocalitati,
): Promise<RezultatLocalitate> {
  const judet = codJudet(adresa.judet, adresa.oras);
  if (!judet) {
    return { fel: "de_ales", motiv: `judetul „${(adresa.judet ?? "").trim() || "necompletat"}” nu e recunoscut`, candidati: [] };
  }

  if (judet === "B") {
    const sector = sectorulAdresei(adresa.oras, adresa.judet, adresa.strada);
    if (sector === null) {
      const toate = await cauta("Sectorul", "B");
      return {
        fel: "de_ales",
        motiv: "sectorul nu scrie nicaieri in adresa (e-packet are Bucurestiul pe sectoare)",
        candidati: toate.filter((l) => l.judet === "B"),
      };
    }
    /* Numele lor e „Sectorul 3 (Bucuresti)": `baza` taie paranteza, deci ramane „sectorul 3". */
    const r = alegeLocalitatea(await cauta(cautareSector(sector), "B"), cautareSector(sector), "B");
    return r.fel === "unica"
      ? { fel: "gasita", localitate: r.localitate }
      : { fel: "de_ales", motiv: `sectorul ${sector} nu s-a gasit la e-packet`, candidati: r.candidati };
  }

  const forme = formeleOrasului(adresa.oras, adresa.judet);
  if (forme.length === 0) return { fel: "de_ales", motiv: "localitatea e necompletata", candidati: [] };

  const comuna = comunaDinOras(adresa.oras);
  let deAles: LocalitateEpacket[] = [];
  let motiv = "";
  for (const forma of forme) {
    /* Sub doua litere cererea lor e refuzata (422). */
    if (forma.length < 2) continue;
    const r = alegeLocalitatea(await cauta(forma, judet), forma, judet, comuna);
    if (r.fel === "unica") return { fel: "gasita", localitate: r.localitate };
    if (r.fel === "mai_multe" && !motiv) {
      motiv = `exista mai multe localitati „${(adresa.oras ?? "").trim()}” in judet`;
      deAles = r.candidati;
    } else if (!motiv && deAles.length === 0) {
      deAles = r.candidati;
    }
  }
  return {
    fel: "de_ales",
    motiv: motiv || `localitatea „${(adresa.oras ?? "").trim()}” nu se gaseste in nomenclatorul e-packet`,
    candidati: deAles,
  };
}

/** Cate localitati cu acelasi nume se iau, fara judet. „Victoria" e in sapte judete. */
const MAX_OMONIME_PUNCTE = 4;

/**
 * Localitatile unui ORAS fara judet, pentru lista de puncte din checkout.
 *
 * ⚠ `getLockers` primeste doar orasul (judetul nu intra in semnatura punctelor; vezi
 * `reteaua-punctului.ts`, unde la UPS chiar judetul a costat). Deci:
 *   - „Sector 3" / „Sectorul 3" -> acel sector;
 *   - „Bucuresti" fara sector -> toate cele sase (punctele se aleg dupa adresa lor);
 *   - altfel, localitatile cu EXACT acel nume, din orice judet, cel mult `MAX_OMONIME_PUNCTE`.
 *     Judetul fiecarui punct se vede in lista, deci omul alege punctul din judetul lui.
 */
export async function localitatiPentruOras(oras: string | null | undefined, cauta: CautaLocalitati): Promise<LocalitateEpacket[]> {
  const sector = sectorBucuresti(oras);
  const k = cheieLocalitate(oras);
  if (sector !== null) {
    const r = alegeLocalitatea(await cauta(cautareSector(sector), "B"), cautareSector(sector), "B");
    return r.fel === "unica" ? [r.localitate] : [];
  }
  if (/\bbucuresti\b|\bbucharest\b|\bmunicipiul bucuresti\b/.test(k)) {
    return (await cauta("Sectorul", "B")).filter((l) => l.judet === "B" && /^sectorul [1-6]$/.test(baza(l.nume)));
  }
  for (const forma of formeleOrasului(oras)) {
    if (forma.length < 2) continue;
    const toate = await cauta(forma, "");
    const exacte = toate.filter((l) => baza(l.nume) === forma);
    if (exacte.length > 0) return exacte.slice(0, MAX_OMONIME_PUNCTE);
  }
  return [];
}

/** Numele localitatii pentru lista de puncte: fara judetul din coada lui `display_name`. */
export function numeleLocalitatii(l: LocalitateEpacket): string {
  if (l.judet === "B") return l.nume;
  return l.afisare.replace(/\s*\([^()]*\)\s*$/, "") || l.nume;
}
