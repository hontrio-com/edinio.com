import { caText, camp, foaie, numeCuData, suma } from "@/lib/csv";
import { formatDateShort } from "@/lib/utils/format";
import type { Customer } from "@/lib/customers";
import { NUMELE_SEGMENTULUI, numeleCanalului } from "./filtre";

/**
 * ═══════════════════════════════════════════════════════════════════════════
 * SELECTIA IN MASA SI CE SE POATE FACE CU EA                    (21.09.2026)
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * Cerut de proprietar: „posibilitatea de selectare in masa si de a face anumite
 * actiuni in masa". A ales trei: stergerea/anonimizarea, adaugarea intr-un
 * segment, si descarcarea celor bifati.
 *
 * ⚠⚠ SE BIFEAZA NUMAI DE PE PAGINA DE ACUM, si asta se SPUNE pe ecran. Pagina
 * aduce cincizeci de clienti odata; un „bifeaza tot" care ar pretinde ca a luat
 * toti cei 358 ar fi fost o minciuna cu urmari — omul apasa „șterge datele" si
 * crede ca a curatat tot magazinul, cand a curatat o pagina.
 *
 * ⚠ Si de-aia nici nu exista „bifeaza toti cei filtrati": ar cere ca actiunea sa
 * afle singura cheile pe server, iar confirmarea de pe ecran („ștergi datele a
 * 50 de clienți?") n-ar mai vorbi despre aceeasi multime ca apasarea.
 */

/** Descarcarea celor bifati: coloanele, in ordinea lor. */
export const COLOANE_CSV_CLIENTI = [
  "Client", "Telefon", "Email", "Oraș", "Județ",
  "Comenzi valide", "Comenzi totale", "Anulate", "Rambursate",
  "Valoarea comenzilor", "Total încasat", "Valoare medie",
  "Prima comandă", "Ultima comandă", "Canal", "Sursă contact",
] as const;

/**
 * ⚠ CE SE SCRIE IN COLOANA „Sursă contact": de unde vine omul. `null` inseamna
 * CUMPARATOR (n-are rand in `customers`), nu „nu stim" — si se scrie pe litere,
 * fiindca un gol in coloana aceea ar arata a date lipsa.
 */
function sursaContactului(source: string | null): string {
  if (source === "manual") return "adăugat manual";
  if (source === "import") return "importat";
  if (source === "checkout") return "din magazin";
  if (!source) return "a comandat";
  return source;
}

export function csvulClientilor(clienti: readonly Customer[]): string {
  const randuri = clienti.map((c) => [
    camp(c.name),
    /* ⚠ Telefonul ca TEXT: altfel Excel taie zeroul din fata. Vezi `lib/csv.ts`. */
    caText(c.phone),
    camp(c.email ?? ""),
    camp(c.city ?? ""),
    camp(c.county ?? ""),
    /*
      ⚠ CELE DOUA NUMERE DE COMENZI SUNT AMANDOUA IN FISIER, si asta nu e
      prisos: „5 comenzi · 1.240 lei" din lista vorbea despre multimi diferite
      (cele cinci pot cuprinde doua anulate, pe cand suma le scoate). Intr-un
      fisier pe care omul il deschide singur, fara explicatia de pe ecran,
      diferenta trebuie sa se vada in coloane.
    */
    camp(c.validOrderCount),
    camp(c.orderCount),
    camp(c.cancelledCount),
    camp(c.refundedCount),
    suma(c.ordersValue),
    suma(c.collectedTotal),
    suma(c.aov),
    camp(c.firstOrderAt ? formatDateShort(c.firstOrderAt) : ""),
    camp(c.lastOrderAt ? formatDateShort(c.lastOrderAt) : ""),
    camp(c.canal ? numeleCanalului(c.canal) : ""),
    camp(sursaContactului(c.source)),
  ]);
  return foaie(COLOANE_CSV_CLIENTI, randuri);
}

/** Cum se cheama fisierul descarcat. */
export function numeleFisieruluiDeClienti(acum: Date = new Date()): string {
  return numeCuData("clienti", acum);
}

/* ── Selectia ───────────────────────────────────────────────────────────── */

/**
 * Rezumatul a ce e bifat, pentru bara de actiuni.
 *
 * ⚠ SE SPUNE SI CATI AU COMENZI. Butonul face doua lucruri deosebite dupa cum e
 * omul (contactele se sterg, cumparatorii se anonimizeaza), iar comerciantul are
 * dreptul sa stie ce amesteca inainte sa apese, nu dupa.
 */
export function rezumatSelectiei(alesi: readonly Customer[]): {
  cati: number;
  cumparatori: number;
  contacte: number;
  valoare: number;
} {
  const cumparatori = alesi.filter((c) => c.orderCount > 0).length;
  return {
    cati: alesi.length,
    cumparatori,
    contacte: alesi.length - cumparatori,
    valoare: alesi.reduce((s, c) => s + Number(c.ordersValue || 0), 0),
  };
}

/**
 * Ce scrie pe bara, despre ce se intampla la apasare.
 *
 * ⚠ Cele doua drumuri se numesc pe nume. „Ștergi 12 clienți" ar fi fost fals
 * pentru zece dintre ei, care se anonimizeaza si raman in rapoarte.
 */
export function cumSeSterge(r: { cumparatori: number; contacte: number }): string {
  const p: string[] = [];
  if (r.contacte) {
    p.push(`${r.contacte} ${r.contacte === 1 ? "contact se șterge" : "contacte se șterg"} de tot`);
  }
  if (r.cumparatori) {
    p.push(
      `${r.cumparatori} ${r.cumparatori === 1 ? "cumpărător își pierde" : "cumpărători își pierd"}`
      + " datele, dar comenzile rămân",
    );
  }
  return p.join(" · ");
}

/**
 * Bifarea/debifarea unui rand.
 *
 * ⚠ SE TINE PE CHEIE, nu pe pozitie in lista. Pe pozitie, o reincarcare a
 * paginii (o sortare schimbata, un client nou) ar fi mutat bifele pe alti oameni
 * — iar apoi s-ar fi apasat „șterge datele" peste ei.
 */
export function comuta(alese: ReadonlySet<string>, cheie: string): Set<string> {
  const noua = new Set(alese);
  if (noua.has(cheie)) noua.delete(cheie); else noua.add(cheie);
  return noua;
}

/**
 * Bifele care mai au un rand pe pagina.
 *
 * ⚠ CURATAREA E OBLIGATORIE la fiecare schimbare de pagina sau de filtru. Fara
 * ea, bifele de pe pagina 1 ar fi ramas in stare si ar fi plecat la actiune
 * impreuna cu cele de pe pagina 2 — iar bara ar fi aratat „63 selectați" intr-o
 * lista de cincizeci.
 */
export function doarCeleDePePagina(
  alese: ReadonlySet<string>,
  clienti: readonly Customer[],
): Set<string> {
  const pePagina = new Set(clienti.map((c) => c.key));
  return new Set([...alese].filter((k) => pePagina.has(k)));
}

/** Segmentul din care s-a facut selectia, ca text pentru numele propus. */
export function numePropusPentruSegment(segment: string, cati: number): string {
  const s = NUMELE_SEGMENTULUI[segment as keyof typeof NUMELE_SEGMENTULUI];
  return s && segment !== "toti" ? `${s} (${cati})` : `Listă de ${cati}`;
}
