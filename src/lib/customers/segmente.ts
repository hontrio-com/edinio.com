import { NUMELE_SEGMENTULUI, SEGMENTE, TREPTE_VALOARE, numeleCanalului, segmentValid, treaptaValoare, type Segment } from "./filtre";

/**
 * ═══════════════════════════════════════════════════════════════════════════
 * SEGMENTE SALVATE                                              (21.09.2026)
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * „Segmentele ar aduce cea mai mare valoare comerciala” — analiza lui.
 *
 * ⚠⚠ UN SEGMENT PASTREAZA CRITERIILE, NU OAMENII. Salvat ca lista de clienti,
 * ar fi inghetat in ziua salvarii: cine devine maine inactiv de 90 de zile n-ar
 * mai intra in „Inactivi de 90 de zile”, iar comerciantul ar trimite campanii
 * unei liste moarte, crezand ca e vie. Salvate ca criterii, se recalculeaza la
 * fiecare deschidere — si de-aia un segment nu are nevoie de niciun cron care
 * sa-l tina la zi.
 *
 * ⚠ CRITERIILE VIN DIN `jsonb`, DECI SUNT DATE STRAINE. In baza incape orice;
 * un segment salvat inainte ca un filtru sa fie redenumit ar trimite catre RPC
 * un segment care nu mai exista. `criteriiValide` le trece prin aceleasi
 * validari ca adresa, si tot ce nu se recunoaste cade pe implicit.
 */

export interface CriteriiSegment {
  segment: Segment;
  /** Cheia treptei de valoare, sau `null` cand nu e aleasa niciuna. */
  valoare: string | null;
  /** Cautarea, cand segmentul a fost salvat cu una. */
  q: string;
  /**
   * Judetul si canalul, cand au fost alese.
   *
   * ⚠⚠ ADAUGATE ODATA CU FILTRELE, nu dupa. Un segment salvat cat timp criteriile
   * nu stiau de ele ar fi pastrat numai jumatate din filtru: deschis a doua zi,
   * ar fi aratat TOATA tara sub un nume care spune „Clientii mei din Cluj" — si
   * chiar asta e defectul din pricina caruia n-am legat inca segmentele de
   * campaniile SMS. Nu se face nici aici.
   */
  judet: string | null;
  canal: string | null;
}

export const CRITERII_GOALE: CriteriiSegment = { segment: "toti", valoare: null, q: "", judet: null, canal: null };

/** Cat de lung poate fi numele unui segment. Acelasi numar si in baza. */
export const NUME_MAXIM = 60;

/**
 * Curata orice a venit din `jsonb` (sau din adresa) si scoate criterii cu care
 * se poate chiar interoga.
 *
 * ⚠ NU ARUNCA NICIODATA. Un segment salvat stricat trebuie sa se deschida, nu
 * sa rupa pagina: cade pe „toti clientii”, ceea ce e vizibil si reparabil de om.
 */
export function criteriiValide(x: unknown): CriteriiSegment {
  if (typeof x !== "object" || x === null) return { ...CRITERII_GOALE };
  const o = x as Record<string, unknown>;

  const valoareBruta = typeof o.valoare === "string" ? o.valoare : null;
  return {
    segment: segmentValid(typeof o.segment === "string" ? o.segment : null),
    /* ⚠ Se pastreaza numai o treapta CUNOSCUTA: una scoasa din lista ar fi ajuns
       ca `p_valoare_min` nedefinit si ar fi dat tacut toti clientii. */
    valoare: treaptaValoare(valoareBruta) ? valoareBruta : null,
    q: typeof o.q === "string" ? o.q.trim().slice(0, 80) : "",
    /*
      ⚠ Judetul si canalul NU se verifica dintr-o lista: lista lor e chiar ce
      exista azi in magazin, si se schimba singura. Un judet in care nu mai are
      niciun client da o lista goala — raspuns adevarat, nu defect.
    */
    judet: typeof o.judet === "string" && o.judet.trim() ? o.judet.trim().slice(0, 80) : null,
    canal: typeof o.canal === "string" && o.canal.trim() ? o.canal.trim().slice(0, 40) : null,
  };
}

/** Sunt criteriile astea macar un filtru, sau e tot magazinul? */
export function criteriiGoale(c: CriteriiSegment): boolean {
  return c.segment === "toti" && !c.valoare && c.q === "" && !c.judet && !c.canal;
}

/**
 * Cum se citeste un segment pe ecran, sub numele lui.
 *
 * ⚠ SE SCRIE CE FILTREAZA, nu „3 criterii”. Un nume ales de om („Clientii mei
 * buni") nu spune nimic peste o luna; randul de dedesubt trebuie sa spuna exact
 * pe ce cade, altfel nimeni nu mai stie ce trimite cand trimite campania.
 */
export function descrieCriteriile(c: CriteriiSegment): string {
  const parti: string[] = [NUMELE_SEGMENTULUI[c.segment]];
  const t = treaptaValoare(c.valoare);
  if (t) parti.push(t.eticheta);
  if (c.judet) parti.push(c.judet);
  if (c.canal) parti.push(numeleCanalului(c.canal));
  if (c.q) parti.push(`caută „${c.q}”`);
  return parti.join(" · ");
}

/** Adresa care deschide lista filtrata exact asa. */
export function adresaSegmentului(c: CriteriiSegment): string {
  const p = new URLSearchParams();
  if (c.segment !== "toti") p.set("segment", c.segment);
  if (c.valoare) p.set("valoare", c.valoare);
  if (c.judet) p.set("judet", c.judet);
  if (c.canal) p.set("canal", c.canal);
  if (c.q) p.set("q", c.q);
  const s = p.toString();
  return s ? `/dashboard/customers?${s}` : "/dashboard/customers";
}

/**
 * Segmentele gata facute, aratate ca niste placi cu numarul lor.
 *
 * ⚠ „Toti clientii” NU e intre ele: e lista intreaga, nu un segment, si o placa
 * cu tot magazinul in ea ar fi doar un al doilea drum catre fila de alaturi.
 */
export const SEGMENTE_IMPLICITE: Segment[] = SEGMENTE.filter((s) => s !== "toti");

/** Numarul dintr-un segment, dupa ce baza a raspuns. `null` = inca nu se stie. */
export function catiIn(
  numarate: { segment: string; cati: number }[] | null,
  seg: Segment,
): number | null {
  if (!numarate) return null;
  return numarate.find((n) => n.segment === seg)?.cati ?? 0;
}

/**
 * Numele cerut de la om, curatat.
 *
 * ⚠ Se intoarce si motivul refuzului, nu doar `null`: „nu merge” pe un camp de
 * nume il lasa pe om sa ghiceasca daca e prea lung, gol, sau deja folosit.
 */
export function numeValid(v: string): { nume: string } | { eroare: string } {
  const nume = v.trim().replace(/\s+/g, " ");
  if (nume.length === 0) return { eroare: "Segmentul are nevoie de un nume." };
  if (nume.length > NUME_MAXIM) {
    return { eroare: `Numele e prea lung: maximum ${NUME_MAXIM} de semne.` };
  }
  return { nume };
}

/** Treptele, ca sa nu se importe `filtre` inca o data acolo unde se deseneaza. */
export { TREPTE_VALOARE, NUMELE_SEGMENTULUI };
