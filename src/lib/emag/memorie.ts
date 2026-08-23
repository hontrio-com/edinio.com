/**
 * Nomenclatoarele eMAG, ținute minte.
 *
 * ═══ ⚠ CE PROBLEMĂ REZOLVĂ ═══
 *
 * `aduCategorii()` paginează până la 60 de pagini la 3 cereri pe secundă, iar ecranul
 * de mapare o cheamă la fiecare apăsare pe „Sugerează". Adică până la douăzeci de
 * secunde de așteptare — și, mai rău, douăzeci de secunde în care ritmul magazinului
 * e ocupat cu un ecran în loc de coadă: aceleași 3 cereri pe secundă de care are
 * nevoie o mișcare de stoc după o vânzare.
 *
 * ═══ ⚠ CE NU E ═══
 *
 * Nu e o memorie „până se schimbă ceva". eMAG nu ne spune când își schimbă raftul, iar
 * o listă veche nu strică nimic: sugestiile se ARATĂ, nu se aplică, iar la salvare se
 * cere oricum categoria proaspătă de la ei (`aduCategorie`). Deci prospețimea e o
 * alegere de comoditate, nu de corectitudine — cu o singură excepție, mai jos.
 *
 * ⚠ EXCEPȚIA: o listă TRUNCHIATĂ e altceva. Ea înseamnă că potrivirea nu vede jumătate
 * din raft și sugerează categoria greșită cu încredere mare. Ținută minte o săptămână,
 * ar fi mințit o săptămână. De aceea are prag propriu, mult mai scurt.
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/types/database.types";
import { logError } from "@/lib/error-logger";
import { EMAG_TARA_IMPLICITA, type EmagTara } from "./types";

type Db = SupabaseClient<Database>;

/** Ce fel de nomenclator. Intră în cheia primară, deci se scrie o dată. */
export type FelNomenclator = "categorii" | "categorie" | "tva" | "timpi";

/**
 * Cât timp e bună o amintire, pe fel.
 *
 * ⚠ Cotele de TVA și timpii de pregătire se schimbă mai rar decât raftul, dar toate
 * trei sunt liste mici pe care nu costă nimic să le reciteșți o dată pe săptămână.
 * Detaliul unei categorii stă mai puțin: din el ies caracteristicile obligatorii, iar
 * o cerință nouă neluată în seamă se plătește în oferte respinse.
 */
export const PRAG: Record<FelNomenclator, number> = {
  categorii: 7 * 24 * 60 * 60 * 1000,
  categorie: 24 * 60 * 60 * 1000,
  tva: 7 * 24 * 60 * 60 * 1000,
  timpi: 7 * 24 * 60 * 60 * 1000,
};

/**
 * ⚠ Pragul unei liste INCOMPLETE, oricare ar fi felul ei.
 *
 * Șase ore, nu șapte zile. O listă ciuntită înghețată o săptămână ar sugera categoria
 * greșită cu încredere mare, iar comerciantul n-are de unde ști că lipsește ceva.
 */
export const PRAG_TRUNCHIAT = 6 * 60 * 60 * 1000;

export interface CheieMemorie {
  businessId: string;
  tara?: EmagTara;
  /** Utilizatorul de API cu care s-a adus. Vezi `citesteAmintirea`. */
  cont?: string | null;
  fel: FelNomenclator;
  /** Id-ul categoriei la `fel: "categorie"`. Gol în rest. */
  cheie?: string;
}

/** Ce a venit de la eMAG, gata de pus deoparte. */
export interface Adusa<T> {
  date: T;
  cate: number;
  trunchiat: boolean;
  /** `null` când citirea a reușit. */
  eroare: string | null;
}

export interface Rezultat<T> {
  date: T | null;
  adusLa: number | null;
  trunchiat: boolean;
  /** A venit din memorie, sau s-a cerut acum de la ei? */
  dinMemorie: boolean;
  /** Ce n-a mers, chiar dacă s-a servit ceva din memorie. */
  eroare: string | null;
}

/* ═══════════════════════════════════════════════════════════════════════════
   DECIZIILE, PURE
   ═══════════════════════════════════════════════════════════════════════════ */

/**
 * E amintirea încă bună?
 *
 * ⚠ O listă trunchiată îmbătrânește de douăzeci și opt de ori mai repede. Vezi
 * `PRAG_TRUNCHIAT`.
 */
export function eProaspata(
  adusLaMs: number,
  trunchiat: boolean,
  fel: FelNomenclator,
  acum: number = Date.now(),
): boolean {
  if (!Number.isFinite(adusLaMs)) return false;
  const prag = trunchiat ? PRAG_TRUNCHIAT : PRAG[fel];
  return acum - adusLaMs < prag;
}

/**
 * Se păstrează amintirea VECHE, în loc să se scrie cea nouă?
 *
 * ═══ ⚠ TREI SITUAȚII ÎN CARE NOUL E MAI RĂU DECÂT VECHIUL ═══
 *
 * O citire căzută nu e o listă goală. Scrisă peste, ar fi șters raftul întreg și
 * ecranul ar fi arătat „nicio categorie" — iar comerciantul ar fi crezut că nu are
 * acces nicăieri.
 *
 * Zero rânduri dintr-o citire care a REUȘIT înseamnă aproape sigur altceva decât „nu
 * mai ai categorii": un filtru schimbat la ei, o formă nouă de răspuns. Peste o listă
 * care exista, tot o pierdere ar fi.
 *
 * Iar o listă proaspătă dar CIUNTITĂ e strict mai proastă decât una veche și
 * întreagă, tocmai fiindcă sugestiile se caută în ea: mai bine căutăm în tot raftul
 * de săptămâna trecută decât în jumătatea de azi.
 */
export function pastreazaVechea(
  veche: { cate: number; trunchiat: boolean } | null,
  noua: { cate: number; trunchiat: boolean; eroare: string | null },
): boolean {
  if (noua.eroare != null) return true;
  if (!veche) return false;
  if (noua.cate === 0 && veche.cate > 0) return true;
  if (!veche.trunchiat && noua.trunchiat && noua.cate <= veche.cate) return true;
  return false;
}

/* ═══════════════════════════════════════════════════════════════════════════
   BAZA
   ═══════════════════════════════════════════════════════════════════════════ */

function cheiaLui(k: CheieMemorie) {
  return {
    business_id: k.businessId,
    tara: k.tara ?? EMAG_TARA_IMPLICITA,
    fel: k.fel,
    cheie: k.cheie ?? "",
  };
}

interface RandMemorie {
  date: unknown;
  cate: number;
  trunchiat: boolean;
  adus_la: string;
  cont: string | null;
}

/**
 * Ce ținem minte, sau `null`.
 *
 * ⚠ CONTUL NEPOTRIVIT ÎNSEAMNĂ „N-AM MEMORIE". `is_allowed` e per vânzător: un
 * comerciant care și-a schimbat utilizatorul de API poate avea alt raft. Servită
 * oricum, lista veche i-ar fi arătat categorii în care nu mai are voie să vândă — iar
 * produsele trimise acolo se resping cu o eroare de documentație care nu pomenește
 * nimic despre acces.
 *
 * ⚠ Orice eroare de citire dă `null` și se scrie în jurnal. Așa, un tabel lipsă
 * (migrație neaplicată încă) degradează în „adu de la ei", nu în ecran rupt.
 */
export async function citesteAmintirea<T>(
  db: Db,
  k: CheieMemorie,
  acum: number = Date.now(),
): Promise<{ date: T; adusLa: number; trunchiat: boolean; proaspata: boolean } | null> {
  const c = cheiaLui(k);
  const { data, error } = await db.from("emag_nomenclatoare")
    .select("date, cate, trunchiat, adus_la, cont")
    .eq("business_id", c.business_id).eq("tara", c.tara).eq("fel", c.fel).eq("cheie", c.cheie)
    .maybeSingle();

  if (error) {
    void logError({
      action: "emag.memorie.citire",
      message: error.message,
      details: { ...c },
      businessId: k.businessId,
      severity: "warning",
    });
    return null;
  }
  if (!data) return null;

  const r = data as RandMemorie;
  if (k.cont != null && r.cont != null && r.cont !== k.cont) return null;

  const adusLa = Date.parse(r.adus_la);
  return {
    date: r.date as T,
    adusLa,
    trunchiat: r.trunchiat,
    proaspata: eProaspata(adusLa, r.trunchiat, k.fel, acum),
  };
}

/** Pune deoparte, dacă noul chiar e mai bun decât vechiul. */
export async function scrieAmintirea<T>(db: Db, k: CheieMemorie, v: Adusa<T>): Promise<void> {
  const c = cheiaLui(k);

  const { data } = await db.from("emag_nomenclatoare")
    .select("cate, trunchiat")
    .eq("business_id", c.business_id).eq("tara", c.tara).eq("fel", c.fel).eq("cheie", c.cheie)
    .maybeSingle();

  const veche = data ? { cate: (data as { cate: number }).cate, trunchiat: (data as { trunchiat: boolean }).trunchiat } : null;
  if (pastreazaVechea(veche, v)) return;

  const { error } = await db.from("emag_nomenclatoare").upsert({
    ...c,
    cont: k.cont ?? null,
    date: v.date as never,
    cate: v.cate,
    trunchiat: v.trunchiat,
    adus_la: new Date().toISOString(),
  } as never, { onConflict: "business_id,tara,fel,cheie" });

  if (error) {
    void logError({
      action: "emag.memorie.scriere",
      message: error.message,
      details: { ...c },
      businessId: k.businessId,
      severity: "warning",
    });
  }
}

/**
 * Uită tot ce știm despre un magazin.
 *
 * ⚠ Se cheamă la conectare ȘI la deconectare. La conectare fiindcă utilizatorul sau
 * țara s-au putut schimba, iar raftul e altul; la deconectare fiindcă nu ținem minte
 * despre un cont care nu mai e legat.
 */
export async function uitaAmintirile(db: Db, businessId: string): Promise<void> {
  const { error } = await db.from("emag_nomenclatoare").delete().eq("business_id", businessId);
  if (error) {
    void logError({
      action: "emag.memorie.uitare",
      message: error.message,
      details: { businessId },
      businessId,
      severity: "warning",
    });
  }
}

/**
 * Din memorie dacă se poate, de la ei dacă nu.
 *
 * ⚠ CÂND CITIREA CADE DAR AVEM O AMINTIRE, SE SERVEȘTE AMINTIREA — ȘI SE SPUNE. Un
 * ecran gol cu „eMAG nu răspunde" e mai rău decât o listă de acum trei zile cu o notă
 * lângă ea: prima îl blochează pe comerciant, a doua îl lasă să lucreze.
 */
export async function cuMemorie<T>(
  db: Db,
  k: CheieMemorie,
  adu: () => Promise<Adusa<T>>,
  optiuni: { fortat?: boolean } = {},
): Promise<Rezultat<T>> {
  const amintire = optiuni.fortat ? null : await citesteAmintirea<T>(db, k);

  if (amintire?.proaspata) {
    return {
      date: amintire.date,
      adusLa: amintire.adusLa,
      trunchiat: amintire.trunchiat,
      dinMemorie: true,
      eroare: null,
    };
  }

  const adusa = await adu();

  if (adusa.eroare != null) {
    const veche = amintire ?? (optiuni.fortat ? await citesteAmintirea<T>(db, k) : null);
    if (veche) {
      return {
        date: veche.date,
        adusLa: veche.adusLa,
        trunchiat: veche.trunchiat,
        dinMemorie: true,
        eroare: adusa.eroare,
      };
    }
    return { date: null, adusLa: null, trunchiat: false, dinMemorie: false, eroare: adusa.eroare };
  }

  await scrieAmintirea(db, k, adusa);
  return {
    date: adusa.date,
    adusLa: Date.now(),
    trunchiat: adusa.trunchiat,
    dinMemorie: false,
    eroare: null,
  };
}
