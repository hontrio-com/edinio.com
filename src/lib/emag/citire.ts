/**
 * „Randul nu exista” si „n-am putut intreba baza” nu sunt acelasi lucru.
 *
 * ═══ ⚠ DE CE E UN FISIER INTREG PENTRU ATATA LUCRU ═══
 *
 * PostgREST NU arunca la refuz: intoarce `{ data: null, error }`. Deci tiparul
 *
 *     const { data } = await admin.from("products").select(…).maybeSingle();
 *     if (!data) return { verdict: "sarit", mesaj: "Produsul nu mai există." };
 *
 * are DOUA intelesuri complet diferite sub aceeasi forma:
 *
 *   interogare reusita, zero randuri  → produsul chiar nu mai e. Corect sa se sara.
 *   interogare PICATA                 → nu se stie nimic. Nu e voie sa se hotarasca.
 *
 * Iar in coada, „sarit” e TERMINAL: elementul se sterge. Deci o pana de o clipa a bazei,
 * exact in clipa in care cronul trece printr-un produs, ii sterge lucrarea din coada — si
 * nimeni nu mai afla vreodata ca modificarea aceea n-a plecat la eMAG.
 *
 * ⚠ Aceeasi clasa de defect a fost gasita in proiect de patru ori pana acum, de fiecare
 * data din alt unghi: `configPentruCoada`, maparea codurilor Trendyol, `domains-reconcile`
 * si numaratoarea ofertelor. De aceea nu se mai repara caz cu caz: se face o REGULA, iar
 * `citire.test.ts` o pazeste peste tot in `src/lib/emag`.
 *
 * ═══ ⚠ SI DE CE NU E DOAR `if (error) throw` ═══
 *
 * `.single()` raspunde `PGRST116` cand pur si simplu nu exista randul, iar un uuid
 * stalcit da `22P02`. Amandoua sunt RASPUNSURI, nu caderi — ridicate la „reincearca”, ar
 * pune in bucla vesnica exact elementele care n-au ce cauta in coada. Deosebirea o face
 * `citireCazuta`, care exista deja in casa si e scrisa chiar pentru asta.
 */

import { citireCazuta } from "@/lib/supabase/citire";

/**
 * Baza n-a raspuns. Elementul de coada NU se sterge; se reia.
 *
 * ⚠ Se prinde intr-un singur loc, la marginea lui `trimiteElement`, si devine verdictul
 * `trecatoare` — cel care nu arde nicio incercare. Prinsa mai adanc, fiecare citire ar fi
 * trebuit sa stie ce sa faca, si una uitata ar fi lasat gaura la loc.
 */
export class EroareCitireBaza extends Error {
  /**
   * ⚠ Campul se declara si se atribuie SEPARAT, nu ca `constructor(public unde: string)`.
   *
   * Probele ruleaza pe dezbracarea de tipuri a lui Node (`--experimental-strip-types`),
   * care doar STERGE adnotarile: nu poate genera codul pe care il presupune un camp
   * declarat in lista de argumente. Scris asa, tot fisierul cade cu
   * `ERR_UNSUPPORTED_TYPESCRIPT_SYNTAX` — si nu doar proba lui, ci fiecare fisier care il
   * importa, adica trei deodata. `tsc` trecea linistit.
   */
  readonly unde: string;

  constructor(unde: string, mesaj: string) {
    super(`citirea „${unde}” a picat: ${mesaj}`);
    this.name = "EroareCitireBaza";
    this.unde = unde;
  }
}

/** Raspunsul unei citiri PostgREST, cat ne trebuie din el. */
interface RaspunsCitire<T> {
  data: T | null;
  error: { message: string; code?: string } | null;
}

/**
 * Un rand, sau `null` — dar NUMAI daca intrebarea chiar a primit raspuns.
 *
 * ⚠ Arunca `EroareCitireBaza` la o cadere reala. Cine cheama functia asta nu mai poate
 * confunda cele doua intelesuri, fiindca al doilea nici nu mai ajunge la el.
 */
export function randCitit<T>(unde: string, r: RaspunsCitire<T>): T | null {
  if (citireCazuta(r.error, r.data)) {
    throw new EroareCitireBaza(unde, r.error?.message ?? "motiv necunoscut");
  }
  return r.data ?? null;
}

/**
 * O lista, sau `[]` — dar NUMAI daca intrebarea chiar a primit raspuns.
 *
 * ⚠ Lista goala e cea mai inselatoare forma a defectului: `(data ?? [])` peste o citire
 * picata da exact ce da o citire reusita fara randuri, iar buclele de dedesubt nu ruleaza
 * niciodata. Nimic nu pare stricat — pur si simplu nu se intampla nimic.
 */
export function randuriCitite<T>(unde: string, r: RaspunsCitire<T[]>): T[] {
  if (citireCazuta(r.error, r.data)) {
    throw new EroareCitireBaza(unde, r.error?.message ?? "motiv necunoscut");
  }
  return r.data ?? [];
}
