/*
  ═══════════════════════════════════════════════════════════════════════════
  GRAFICUL DE VANZARI: intelesurile, intr-un singur loc
  ═══════════════════════════════════════════════════════════════════════════

  Modul curat (fara "use server", fara componente), ca sa poata fi citit si de
  pagina de pe server, si de componenta din browser. Aici stau DOAR numele si
  formele; socoteala e in baza, in `vanzari_panou` (vezi
  migrations/2026-09-20-vanzari-panou.sql).

  ⚠ Nimic din ce se afla aici nu recalculeaza cifre. Daca ar exista si aici o
  impartire sau o scadere de perioade, ar fi a doua sursa de adevar, iar cele
  doua s-ar desparti tacut la prima schimbare din SQL. Singura socoteala
  ingaduita e cea de AFISARE: media pe bucata si procentul fata de perioada
  precedenta, ambele facute din numerele venite din baza.
*/

import { MARKETPLACE_ORIGINI } from "@/lib/orders/origin";

export type FelPerioada = "7z" | "30z" | "90z" | "luna" | "an" | "custom";
export type Masura = "vanzari" | "comenzi" | "medie";
export type Granulatie = "zi" | "saptamana" | "luna";

export type PunctVanzari = {
  /** Prima zi a bucatii (zi, saptamana sau luna), in forma `2026-09-14`. */
  bucata: string;
  vanzari: number;
  comenzi: number;
};

export type Interval = { de_la: string; pana_la: string };

export type DateVanzari = {
  granulatie: Granulatie;
  interval: Interval;
  interval_anterior: Interval;
  serie: PunctVanzari[];
  serie_anterioara: PunctVanzari[];
  total: { vanzari: number; comenzi: number };
  total_anterior: { vanzari: number; comenzi: number };
};

export const PERIOADE: { fel: FelPerioada; eticheta: string }[] = [
  { fel: "7z", eticheta: "Ultimele 7 zile" },
  { fel: "30z", eticheta: "Ultimele 30 de zile" },
  { fel: "90z", eticheta: "Ultimele 90 de zile" },
  { fel: "luna", eticheta: "Luna aceasta" },
  { fel: "an", eticheta: "Anul acesta" },
  { fel: "custom", eticheta: "Perioada personalizata" },
];

export const MASURI: { masura: Masura; eticheta: string; bani: boolean }[] = [
  { masura: "vanzari", eticheta: "Vanzari", bani: true },
  { masura: "comenzi", eticheta: "Comenzi", bani: false },
  { masura: "medie", eticheta: "Valoare medie comanda", bani: true },
];

/** Numele canalului asa cum il stie comerciantul. `magazin` = vitrina proprie. */
export function numeCanal(canal: string): string {
  if (canal === "magazin") return "Magazinul meu";
  const stiut = MARKETPLACE_ORIGINI[canal];
  if (stiut) return stiut.label;
  /* Un marketplace adaugat maine, inainte sa ajunga in lista de mai sus, tot
     trebuie sa aiba un nume citibil in filtru. */
  return canal.charAt(0).toUpperCase() + canal.slice(1);
}

/** Un rand din grafic: aceeasi pozitie din perioada aleasa si din cea precedenta. */
export type RandGrafic = {
  eticheta: string;
  acum: number | null;
  inainte: number | null;
  isoAcum: string | null;
  isoInainte: string | null;
};

/**
 * Randurile graficului.
 *
 * ⚠ CELE DOUA PERIOADE SE SUPRAPUN PE POZITIE, NU PE DATA.
 * Ziua 1 a perioadei alese sta peste ziua 1 a celei precedente, ziua 2 peste
 * ziua 2. Asta vrea omul sa vada: cum merge luna asta fata de cum mergea luna
 * trecuta la aceeasi zi. Asezate dupa data adevarata, cele doua serii n-ar avea
 * niciun punct comun si n-ar fi nimic de comparat.
 *
 * ⚠ Bucata care lipseste dintr-o serie mai scurta ramane `null`, NU `0`: un zero
 * ar desena o cadere la podea care nu s-a intamplat.
 */
export function randuriGrafic(date: DateVanzari, masura: Masura, comparatie: boolean): RandGrafic[] {
  const n = comparatie
    ? Math.max(date.serie.length, date.serie_anterioara.length)
    : date.serie.length;

  return Array.from({ length: n }, (_, i) => {
    const a = date.serie[i];
    const b = date.serie_anterioara[i];
    return {
      eticheta: a ? etichetaBucata(a.bucata, date.granulatie) : "",
      acum: a ? valoare(a, masura) : null,
      inainte: comparatie && b ? valoare(b, masura) : null,
      isoAcum: a?.bucata ?? null,
      isoInainte: comparatie && b ? b.bucata : null,
    };
  });
}

/**
 * Cat face masura ceruta intr-o bucata.
 *
 * ⚠ Media se calculeaza PE BUCATA, din cele doua numere ale bucatii, nu ca medie
 * a mediilor. O zi cu o comanda de 1000 lei si una cu zece de 100 nu au aceeasi
 * greutate, iar media mediilor ar spune ca da.
 */
export function valoare(p: PunctVanzari, masura: Masura): number {
  if (masura === "comenzi") return p.comenzi;
  if (masura === "medie") return p.comenzi > 0 ? p.vanzari / p.comenzi : 0;
  return p.vanzari;
}

export function valoareTotal(t: { vanzari: number; comenzi: number }, masura: Masura): number {
  if (masura === "comenzi") return t.comenzi;
  if (masura === "medie") return t.comenzi > 0 ? t.vanzari / t.comenzi : 0;
  return t.vanzari;
}

/**
 * Cresterea fata de perioada precedenta, in procente, sau `null`.
 *
 * ⚠ `null` cand perioada precedenta e ZERO, si nu 100%: dintr-o luna fara nicio
 * vanzare in una cu trei nu exista o crestere procentuala, iar „+100%" ar fi o
 * cifra inventata. Ecranul scrie atunci ca nu are cu ce compara.
 */
export function crestere(acum: number, inainte: number): number | null {
  if (!Number.isFinite(acum) || !Number.isFinite(inainte) || inainte === 0) return null;
  return ((acum - inainte) / inainte) * 100;
}

/** „ultimele 7 zile vs. cele 7 zile anterioare" si celelalte. */
export function etichetaComparatie(fel: FelPerioada, d: DateVanzari): string {
  const zile = numaraZile(d.interval);
  switch (fel) {
    case "luna":
      return "luna aceasta vs. aceleasi zile din luna trecuta";
    case "an":
      return "anul acesta vs. aceeasi perioada din anul trecut";
    case "custom":
      return `${intervalScris(d.interval)} vs. ${intervalScris(d.interval_anterior)}`;
    default:
      return `ultimele ${zile} zile vs. cele ${zile} zile anterioare`;
  }
}

export function numaraZile(i: Interval): number {
  const a = Date.parse(`${i.de_la}T12:00:00Z`);
  const b = Date.parse(`${i.pana_la}T12:00:00Z`);
  if (!Number.isFinite(a) || !Number.isFinite(b)) return 0;
  return Math.round((b - a) / 86400000) + 1;
}

/** „1 sep - 20 sep 2026" */
export function intervalScris(i: Interval): string {
  const a = ziua(i.de_la);
  const b = ziua(i.pana_la);
  if (!a || !b) return "";
  const acelasiAn = a.getFullYear() === b.getFullYear();
  const format = (d: Date, cuAn: boolean) =>
    d.toLocaleDateString("ro-RO", { day: "numeric", month: "short", ...(cuAn ? { year: "numeric" } : {}) });
  return `${format(a, !acelasiAn)} - ${format(b, true)}`;
}

/**
 * Ziua, ca obiect `Date`, citita la AMIAZA.
 *
 * ⚠ `new Date("2026-09-14")` inseamna miezul noptii UTC, care in alt fus cade in
 * ziua dinainte; eticheta de pe grafic ar fi aratat atunci cu o zi mai devreme
 * decat cifra pe care o poarta. La amiaza, nicio deplasare de fus nu muta ziua.
 */
export function ziua(iso: string): Date | null {
  const d = new Date(`${iso}T12:00:00`);
  return Number.isNaN(d.getTime()) ? null : d;
}

/** Eticheta scurta de pe axa: „14 sep", „sep 26". */
export function etichetaBucata(iso: string, g: Granulatie): string {
  const d = ziua(iso);
  if (!d) return iso;
  if (g === "luna") return d.toLocaleDateString("ro-RO", { month: "short", year: "2-digit" });
  return d.toLocaleDateString("ro-RO", { day: "numeric", month: "short" });
}

/** Eticheta lunga, din varful mouse-ului. */
export function etichetaLunga(iso: string, g: Granulatie): string {
  const d = ziua(iso);
  if (!d) return iso;
  if (g === "luna") return d.toLocaleDateString("ro-RO", { month: "long", year: "numeric" });
  const scris = d.toLocaleDateString("ro-RO", { day: "numeric", month: "long", year: "numeric" });
  return g === "saptamana" ? `Saptamana de la ${scris}` : scris;
}

/**
 * Citeste raspunsul functiei din baza, aparandu-se de orice alta forma.
 *
 * ⚠ Raspunsul vine ca `Json`, adica „orice". Un `as DateVanzari` ar fi trecut de
 * TypeScript si ar fi cazut abia in browser, la primul `.map` peste ceva care nu
 * e tablou. Aici, o forma neasteptata da `null`, iar ecranul spune ca nu a putut
 * citi datele.
 */
export function citesteDateVanzari(brut: unknown): DateVanzari | null {
  const o = brut as Partial<DateVanzari> | null;
  if (!o || typeof o !== "object") return null;
  if (!Array.isArray(o.serie) || !Array.isArray(o.serie_anterioara)) return null;
  if (!o.interval?.de_la || !o.interval_anterior?.de_la) return null;
  const g = o.granulatie;
  if (g !== "zi" && g !== "saptamana" && g !== "luna") return null;

  const punct = (p: unknown): PunctVanzari => {
    const x = p as Partial<PunctVanzari>;
    return {
      bucata: String(x?.bucata ?? ""),
      vanzari: Number(x?.vanzari ?? 0),
      comenzi: Number(x?.comenzi ?? 0),
    };
  };
  const total = (t: unknown) => ({
    vanzari: Number((t as { vanzari?: unknown })?.vanzari ?? 0),
    comenzi: Number((t as { comenzi?: unknown })?.comenzi ?? 0),
  });

  return {
    granulatie: g,
    interval: o.interval,
    interval_anterior: o.interval_anterior,
    serie: o.serie.map(punct),
    serie_anterioara: o.serie_anterioara.map(punct),
    total: total(o.total),
    total_anterior: total(o.total_anterior),
  };
}
