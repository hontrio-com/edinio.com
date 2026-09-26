import type { TonEticheta } from "@/components/ui/eticheta-stare";

/*
  ═══════════════════════════════════════════════════════════════════════════
  TICHETELE DE SUPORT: CATEGORIILE, STARILE SI CINE ARE DE RASPUNS  (25.09.2026)
  ═══════════════════════════════════════════════════════════════════════════

  Pana azi fiecare ecran isi tinea propriul dictionar de etichete: lista
  comerciantului, pagina tichetului, cele doua ecrane de admin si emailul catre
  suport. Cinci copii ale aceleiasi liste, si deja nu mai spuneau acelasi lucru
  („Cerere functionalitate" intr-un loc, „Functionalitate" in altul). Acum e
  una singura, aici.
*/

/* ─── Categoriile ─────────────────────────────────────────────────────────── */

/**
 * Cele opt categorii pe care le poate alege comerciantul, in ordinea din
 * formular. Cerute de el pe 25.09.2026.
 *
 * ⚠ Aceeasi lista sta si in constrangerea din baza
 * (`migrations/2026-09-25-suport-categorii.sql`); proba
 * `tichete.test.ts` le tine la fel.
 */
export const CATEGORII = [
  { cheie: "store_design", eticheta: "Magazin și design", descriere: "Aspect, pagini, domeniu, meniu" },
  { cheie: "products", eticheta: "Produse", descriere: "Catalog, variante, stoc, import" },
  { cheie: "orders", eticheta: "Comenzi", descriere: "Comenzi, livrare, AWB, retururi" },
  { cheie: "customers", eticheta: "Clienți", descriere: "Clienți, conturi, segmente" },
  { cheie: "payments", eticheta: "Plăți", descriere: "Plata cu cardul, ramburs, facturi" },
  { cheie: "integrations", eticheta: "Integrări", descriere: "Curieri, marketplace, marketing" },
  { cheie: "account", eticheta: "Cont și abonament", descriere: "Abonament, facturare Edinio, acces" },
  { cheie: "technical", eticheta: "Probleme tehnice", descriere: "Erori, pagini care nu merg" },
] as const;

export type CategorieTichet = (typeof CATEGORII)[number]["cheie"];

/**
 * ⚠ Cheile de dinainte de 25.09.2026. Nu se mai pot alege, dar tichetele vechi
 * le poarta (in productie: 7 tichete, toate inchise), deci trebuie sa aiba in
 * continuare un nume pe ecran. `technical` nu e aici: e si categorie noua.
 */
const CATEGORII_VECHI: Record<string, string> = {
  billing: "Facturare",
  feature: "Sugestie",
  other: "Altele",
};

const CHEI_NOI = new Set<string>(CATEGORII.map((c) => c.cheie));

/** Daca o categorie se poate alege pentru un tichet NOU. */
export function esteCategorieDeAles(cheie: unknown): cheie is CategorieTichet {
  return typeof cheie === "string" && CHEI_NOI.has(cheie);
}

/** Numele unei categorii, noua sau veche. O cheie necunoscuta se arata asa cum e. */
export function numeleCategoriei(cheie: string): string {
  return CATEGORII.find((c) => c.cheie === cheie)?.eticheta ?? CATEGORII_VECHI[cheie] ?? cheie;
}

/** Toate cheile pe care baza le accepta: cele opt noi si cele trei vechi. */
export const TOATE_CHEILE_ACCEPTATE: readonly string[] = [...CHEI_NOI, ...Object.keys(CATEGORII_VECHI)];

/* ─── Prioritatea ─────────────────────────────────────────────────────────── */

export const PRIORITATI = [
  { cheie: "low", eticheta: "Scăzută", descriere: "O întrebare, fără grabă" },
  { cheie: "normal", eticheta: "Normală", descriere: "Ceva nu merge cum ar trebui" },
  { cheie: "high", eticheta: "Mare", descriere: "Îmi încurcă vânzările" },
  { cheie: "urgent", eticheta: "Urgentă", descriere: "Magazinul sau comenzile sunt oprite" },
] as const;

export type PrioritateTichet = (typeof PRIORITATI)[number]["cheie"];

export function estePrioritate(cheie: unknown): cheie is PrioritateTichet {
  return typeof cheie === "string" && PRIORITATI.some((p) => p.cheie === cheie);
}

export function numelePrioritatii(cheie: string): string {
  return PRIORITATI.find((p) => p.cheie === cheie)?.eticheta ?? cheie;
}

/* ─── Starea, asa cum o vede comerciantul ─────────────────────────────────── */

/**
 * ⚠⚠ „ASTEAPTA RASPUNSUL TAU" NU E `has_unread_reply`.
 *
 * Cardul se numea „Raspunsuri noi" si numara `has_unread_reply`, adica „a venit
 * ceva ce n-ai deschis". Se stinge in clipa in care deschizi tichetul, chiar
 * daca nu raspunzi, si atunci tichetul la care echipa te intreaba ceva dispare
 * din cifra desi mingea e tot la tine. Cerut de el: cifra sa spuna unde e
 * mingea.
 *
 * Deci se judeca dupa ULTIMUL MESAJ: daca l-a scris echipa, iar tichetul nu e
 * rezolvat sau inchis, asteapta raspunsul tau. Altfel e la noi.
 *
 * ⚠ `status` din baza NU spune asta: „in_progress" se pune de admin cand
 * raspunde, si ramane asa si dupa ce comerciantul scrie inapoi.
 */
export type StareaTichetului = "raspunsul_tau" | "la_noi" | "rezolvat" | "inchis";

export function stareaTichetului(t: {
  status: string;
  ultimulMesajDe: "user" | "agent" | null;
}): StareaTichetului {
  if (t.status === "closed") return "inchis";
  if (t.status === "resolved") return "rezolvat";
  if (t.ultimulMesajDe === "agent") return "raspunsul_tau";
  return "la_noi";
}

export const DESPRE_STARE: Record<StareaTichetului, { text: string; ton: TonEticheta; explicatie: string }> = {
  raspunsul_tau: {
    text: "Așteaptă răspunsul tău",
    ton: "asteptare",
    explicatie: "Echipa Edinio ți-a scris ultima. Tichetul merge mai departe când răspunzi.",
  },
  la_noi: {
    text: "La echipa Edinio",
    ton: "lucru",
    explicatie: "Ultimul mesaj e al tău. Echipa se uită și îți răspunde aici și pe email.",
  },
  rezolvat: {
    text: "Rezolvat",
    ton: "bun",
    explicatie: "Marcat ca rezolvat. Dacă scrii din nou, tichetul se redeschide.",
  },
  inchis: {
    text: "Închis",
    ton: "neutru",
    explicatie: "Tichetul e închis. Pentru o problemă nouă, deschide alt tichet.",
  },
};

/* ─── Timpul de raspuns ───────────────────────────────────────────────────── */

/**
 * Cat a durat pana la PRIMUL raspuns al echipei, pe fiecare tichet care l-a
 * primit. Tichetele fara raspuns nu intra: nu au inca un timp.
 */
export function timpiDePrimRaspuns(
  tichete: { created_at: string; mesaje: { sender_type: string; created_at: string }[] }[],
): number[] {
  const timpi: number[] = [];
  for (const t of tichete) {
    const primul = t.mesaje
      .filter((m) => m.sender_type === "agent")
      .map((m) => new Date(m.created_at).getTime())
      .sort((a, b) => a - b)[0];
    if (primul === undefined) continue;
    const ms = primul - new Date(t.created_at).getTime();
    if (Number.isFinite(ms) && ms >= 0) timpi.push(ms);
  }
  return timpi;
}

/**
 * ⚠ MEDIANA, nu media. Un singur tichet deschis vineri seara si raspuns luni
 * ar fi tras media spre „2 zile" pentru cineva caruia i s-a raspuns in rest in
 * cateva minute. Mediana spune „jumatate din tichetele tale au primit raspuns
 * mai repede de atat", adica ce vrea omul sa stie.
 */
export function mediana(valori: number[]): number | null {
  if (valori.length === 0) return null;
  const s = [...valori].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
}

/** O durata scrisa scurt, pentru un card: „12 min", „3 ore", „2 zile". */
export function durataScurta(ms: number): { valoare: string; unitate: string } {
  const minute = Math.max(1, Math.round(ms / 60_000));
  if (minute < 60) return { valoare: String(minute), unitate: "min" };
  const ore = Math.round(minute / 60);
  if (ore < 24) return { valoare: String(ore), unitate: ore === 1 ? "oră" : "ore" };
  const zile = Math.round(ore / 24);
  return { valoare: String(zile), unitate: zile === 1 ? "zi" : "zile" };
}

/** Numarul scurt al tichetului, cum se arata pe ecran si se da la telefon. */
export function numarulTichetului(id: string): string {
  return `#${id.slice(0, 8).toUpperCase()}`;
}
