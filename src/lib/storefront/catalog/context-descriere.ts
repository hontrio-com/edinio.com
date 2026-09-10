import { cache } from "react";
import { createAdminClient } from "@/lib/supabase/admin";
import { fetchAllRows } from "@/lib/supabase/fetch-all";
import { proiectieDb, type RandProiectie } from "@/lib/storefront/catalog/din-proiectie";
import { categoriiVizibile, numeCategoriiAscunse } from "@/lib/categories/vizibilitate";
import type { Fateta } from "@/lib/storefront/catalog/facets";
import {
  orfaneCuProduse, ramuriCuProduse, subarboreReunit,
  type ContextDescriere, type ContinutPagina,
} from "@/lib/storefront/catalog/descriere-generata";

/**
 * Datele din care se scrie descrierea paginii de catalog si a categoriilor.
 *
 * ═══ UN SINGUR INCARCATOR, CU `cache()` ═══
 *
 * Descrierea o cer DOUA locuri din aceeasi randare: `<head>`-ul (metadata) si nodul
 * `CollectionPage` din pagina. Calculata de doua ori, din doua citiri, prima
 * nepotrivire ar fi fost o pagina care se descrie altfel sus decat jos. Cu `cache`
 * din React, a doua cerere cu aceleasi argumente ia raspunsul primei, pe durata UNEI
 * cereri (nu intre cereri, deci nu se invecheste nimic).
 *
 * ⚠ Toate argumentele sunt PRIMITIVE. `cache` compara argumentele dupa identitate:
 * un obiect construit din nou la fiecare apel ar fi ratat cache-ul de fiecare data, si
 * randarea ar fi platit inca o data aceleasi citiri.
 *
 * ⚠ Sub `node --test`, `cache` din `react` doar trece mai departe (fara memorare).
 * Probele verifica deci CE se cere, nu de cate ori.
 */

/** Randul de categorie, exact coloanele din `select`. */
export interface CategorieMagazin {
  id: string;
  name: string;
  parent_id: string | null;
  image_url: string | null;
  sort_order: number;
  is_active: boolean;
}

export interface CategoriiMagazin {
  /** Tot tabelul, cu `is_active` nefiltrat: din el se deduc subarborii stinsi. */
  toate: CategorieMagazin[];
  /** Fara subarborii stinsi, in ordinea din panou (`sort_order`, `id`). */
  vizibile: CategorieMagazin[];
  /** Numele care nu au voie sa apara in magazin (vezi `numeCategoriiAscunse`). */
  stinse: ReadonlySet<string>;
}

/**
 * Categoriile magazinului, ordonate ca la randare.
 *
 * Ordinea (`sort_order`, `id`) nu e cosmetica: subcategoriile din descriere se scriu
 * in ordinea din panou, iar metadata le citea fara nicio ordine.
 */
export const categoriiMagazin = cache(async (businessId: string): Promise<CategoriiMagazin> => {
  const admin = createAdminClient();
  const toate: CategorieMagazin[] = await fetchAllRows("storefront.magazin.categories", (from, to) =>
    admin
      .from("categories")
      // `is_active` vine INTREAGA, nefiltrata: subarborele unei categorii
      // stinse se calculeaza in `lib/categories/vizibilitate.ts`, iar el nu se
      // mai poate deduce dupa ce randul a fost scos din lista.
      .select("id, name, parent_id, image_url, sort_order, is_active")
      .eq("business_id", businessId)
      .order("sort_order")
      .order("id")
      .range(from, to));
  return { toate, vizibile: categoriiVizibile(toate), stinse: numeCategoriiAscunse(toate) };
});

/** Randul de rezumat, exact coloanele din `select`. */
export interface RezumatMagazin {
  total: number;
  price_min: number;
  price_max: number;
  categorii: string[];
  fatete: { jetoane?: string[]; fatete?: Fateta[] };
}

/**
 * Randul de rezumat al magazinului, pentru comutatoarele LUI.
 *
 * ⚠ Filtrul e pe AMBELE comutatoare. `catalog_rezumat` are PATRU randuri pe magazin,
 * cate unul pentru fiecare combinatie (`rezumaRanduri`). Fara filtru, `maybeSingle`
 * primeste patru randuri si intoarce EROARE, nu primul rand; cu un singur comutator,
 * doua randuri, aceeasi eroare. Si ar fi fost o eroare tacuta: `null` inseamna aici
 * „nu stim", deci descrierea ar fi pierdut subcategoriile pe toate magazinele.
 *
 * `null` = rezumatul lipseste (magazin nou, pana la prima trecere a cronului) sau
 * n-a putut fi citit.
 */
export const rezumatMagazin = cache(async (
  businessId: string,
  faraImagini: boolean,
  faraStocAscuns: boolean,
): Promise<RezumatMagazin | null> => {
  try {
    const { data, error } = await proiectieDb()
      .from("catalog_rezumat")
      .select("total, price_min, price_max, categorii, fatete")
      .eq("business_id", businessId)
      .eq("fara_imagini", faraImagini)
      .eq("fara_stoc_ascuns", faraStocAscuns)
      .maybeSingle();
    if (error) {
      console.error(`[descriere] rezumatul lui ${businessId} n-a putut fi citit:`, error.message);
      return null;
    }
    return (data ?? null) as unknown as RezumatMagazin | null;
  } catch (e) {
    console.error(`[descriere] rezumatul lui ${businessId} n-a putut fi citit:`, e instanceof Error ? e.message : e);
    return null;
  }
});

/** Cate nume de produs cere apelul A. Descrierea nu incape oricum cu mai multe. */
const PRODUSE_NUMITE = 3;

/**
 * Cate randuri cere apelul B, ca sa gaseasca primul produs CU oferta.
 *
 * ⚠ Nu unul singur: `catalog_pagina` nu filtreaza dupa `fara_oferta`, iar un produs fara
 * oferta are si el un `price_min`, adesea cel mai mic (la eSAFE, 493 de randuri intre
 * 0,64 si 11.626,5 lei, sub cel mai mic pret cumparabil, de 0,94). Azi sunt toate
 * epuizate, deci nu ajung in B; primul care ar reveni pe stoc ar fi sters „de la X" din
 * descrierea categoriei lui, fara nicio eroare. Cu mai multe produse fara oferta decat
 * atat inaintea primului cumparabil, pretul lipseste: nu stim, deci nu afirmam.
 */
const RANDURI_PRET = 20;

type RaspunsPagina = { total?: number | string | null; randuri?: Partial<RandProiectie>[] | null };

/**
 * Ce arata grila paginii, din `catalog_pagina`: acelasi RPC, aceleasi filtre si
 * aceeasi regula de vizibilitate ca grila insasi. O a doua copie a regulii in
 * TypeScript ar fi dat „251 de produse" peste o grila cu 232 (vezi `rezumat.ts`).
 *
 *   - A: filtrele paginii, sortarea EFECTIVA a grilei, 3 randuri. Da `total` (exact
 *     numarul de pe pagina) si numele primelor produse, chiar primele din grila.
 *   - B: aceleasi filtre plus `stoc: true`, `price_asc`, cel mult `RANDURI_PRET` randuri,
 *     din care conteaza PRIMUL cu oferta. Da cel mai mic pret la care se poate CUMPARA:
 *     un produs epuizat de 26 de lei nu e „de la 26 lei", iar unul fara oferta n-are pret.
 *
 * ⚠ `categorii` pleaca TABLOU. Un sir (sau orice altceva) e citit de SQL drept `null`,
 * adica TOT magazinul (`jsonb_typeof(...) = 'array'`), deci categoria ar fi primit
 * numarul si pretul intregului catalog, fara nicio eroare.
 *
 * ⚠ La orice eroare: `console.error` si `null`, niciodata „0 produse".
 */
async function continutPagina(
  businessId: string,
  f: { categorii: string[] | null; faraImagini: boolean; faraStocAscuns: boolean; reduceri: boolean; sortare: string },
): Promise<ContinutPagina | null> {
  try {
    const db = proiectieDb();
    const filtre = {
      categorii: f.categorii,
      faraImagini: f.faraImagini,
      faraStocAscuns: f.faraStocAscuns,
      reduceri: f.reduceri,
    };
    const [a, b] = await Promise.all([
      db.rpc("catalog_pagina", {
        p_business: businessId,
        p_filtre: { ...filtre, sortare: f.sortare },
        p_limit: PRODUSE_NUMITE,
        p_offset: 0,
      }),
      db.rpc("catalog_pagina", {
        p_business: businessId,
        p_filtre: { ...filtre, stoc: true, sortare: "price_asc" },
        p_limit: RANDURI_PRET,
        p_offset: 0,
      }),
    ]);
    const pa = (a.data ?? null) as RaspunsPagina | null;
    const pb = (b.data ?? null) as RaspunsPagina | null;
    // ⚠ `Number(null)` e ZERO: un `total` lipsa ar fi devenit „categorie goala".
    const total = pa?.total == null ? NaN : Number(pa.total);
    if (a.error || b.error || !pa || !pb || !Number.isFinite(total) || total < 0) {
      console.error(
        `[descriere] catalog_pagina a esuat pentru ${businessId}:`,
        a.error?.message ?? b.error?.message ?? "raspuns fara total",
      );
      return null;
    }
    const randuri = Array.isArray(pa.randuri) ? pa.randuri : [];
    // Primul produs CU oferta (`din-proiectie.ts`): fara oferta, `price_min` nu e un pret
    // de vanzare. `interval` se ia de pe ACELASI rand, altfel „de la" ar vorbi despre alt
    // produs. Vezi `RANDURI_PRET`.
    const ieftin = Array.isArray(pb.randuri) ? pb.randuri.find((r) => r?.fara_oferta === false) : undefined;
    const pret = ieftin ? Number(ieftin.price_min) : NaN;
    return {
      numar: total,
      pretMinim: Number.isFinite(pret) && pret > 0 ? pret : null,
      interval: ieftin?.has_range === true,
      produse: randuri.map((r) => (typeof r?.name === "string" ? r.name : "")).filter(Boolean),
    };
  } catch (e) {
    console.error(`[descriere] catalog_pagina a esuat pentru ${businessId}:`, e instanceof Error ? e.message : e);
    return null;
  }
}

/**
 * Contextul descrierii unei pagini de catalog (`numeCategorie` gol) sau de categorie.
 *
 * `sortare` e sortarea efectiva a grilei CANONICALULUI (`sortareEfectivaGrila` cu
 * sirul gol ca sortare din adresa): produsele numite in descriere sunt chiar primele
 * de pe pagina. `faraTva` vine din `preturiFaraTva`.
 *
 * Pasii:
 *   - subarborele: REUNIUNEA subarborilor tuturor categoriilor vizibile cu acel nume;
 *   - subcategoriile: doar cele cu produse, dupa `rezumat.categorii`; pe catalog,
 *     categoriile de sus cu produse plus numele orfane;
 *   - apelurile A si B (vezi `continutPagina`), in paralel cu rezumatul.
 *
 * Nu arunca niciodata: la o eroare, `continut: null`; fara rezumat, `subcategorii: []`.
 */
export const contextDescriere = cache(async (
  businessId: string,
  numeCategorie: string,
  faraImagini: boolean,
  faraStocAscuns: boolean,
  reduceri: boolean,
  sortare: string,
  faraTva: boolean,
): Promise<ContextDescriere> => {
  try {
    const rezumatCerut = rezumatMagazin(businessId, faraImagini, faraStocAscuns);
    const cat = await categoriiMagazin(businessId);
    const nume = numeCategorie.trim();
    const sub = nume ? subarboreReunit(cat.vizibile, nume) : null;
    const [rezumat, continut] = await Promise.all([
      rezumatCerut,
      continutPagina(businessId, { categorii: sub ? sub.nume : null, faraImagini, faraStocAscuns, reduceri, sortare }),
    ]);
    const cuProduse = rezumat && Array.isArray(rezumat.categorii) ? new Set(rezumat.categorii) : null;
    const subcategorii = sub
      ? ramuriCuProduse(cat.vizibile, sub.idsPagina, cuProduse)
      : [...ramuriCuProduse(cat.vizibile, null, cuProduse), ...orfaneCuProduse(cat.toate, cat.stinse, cuProduse)];
    return { parinte: sub?.parinte ?? null, subcategorii, continut, faraTva, reduceri };
  } catch (e) {
    console.error(`[descriere] contextul lui ${businessId} n-a putut fi citit:`, e instanceof Error ? e.message : e);
    return { parinte: null, subcategorii: [], continut: null, faraTva, reduceri };
  }
});
