import type { ContinutCiorna } from "@/lib/storefront/design/continut-ciorna";
import type { UrmaDateDemo } from "./import-demo";

/*
  ═══════════════════════════════════════════════════════════════════════════
  „ȘTERGE DATELE DEMO” (etapa 18.4 din `docs/editor-magazin/PLAN.md`)
  ═══════════════════════════════════════════════════════════════════════════

  Inversul importului, dupa urma lui (`page_content.date_demo`): produsele cu sursa demo, categoriile create de import
  ramase goale, bannerele si randurile adaugate, textele demo ramase neschimbate in design (`Tema.faraTexteleDemo`).
  Ce a adaugat sau a schimbat omul ramane al lui. Le foloseste actiunea `stergeDateleDemo` (`store-design.actions.ts`).
*/

const eDinUrma = (lista: readonly string[], x: unknown) => typeof x === "string" && lista.includes(x);

/**
 * Bannerele si randurile de produse fara cele adaugate de import, ca un continut de ciorna: trece prin „Publică”, deci
 * intra in Istoric. Doar cheile care chiar se schimba; niciuna = nimic de publicat pentru ele.
 */
export function continutFaraDateleDemo(pc: Record<string, unknown>, urma: UrmaDateDemo): ContinutCiorna {
  const chei: Record<string, unknown> = {};
  const imagini = Array.isArray(pc.hero_banners) ? pc.hero_banners : [];
  if (imagini.some((x) => eDinUrma(urma.bannere, x))) {
    // Imaginile si linkurile merg pereche (`bannereDupaImport`): perechea iese intreaga, ca linkurile lui sa nu se mute.
    const linkuri = Array.isArray(pc.hero_banner_links) ? pc.hero_banner_links : [];
    const raman = imagini.map((x, i) => [x, linkuri[i] ?? ""] as const).filter(([x]) => !eDinUrma(urma.bannere, x));
    chei.hero_banners = raman.map(([x]) => x);
    chei.hero_banner_links = raman.map(([, l]) => l);
  }
  const randuri = Array.isArray(pc.product_sections) ? pc.product_sections : [];
  const randDemo = (r: unknown) => !!r && typeof r === "object" && eDinUrma(urma.randuri, (r as { id?: unknown }).id);
  if (randuri.some(randDemo)) chei.product_sections = randuri.filter((r) => !randDemo(r));
  return { pc: chei, magazin: {} };
}

export interface CategorieMagazin {
  id: string;
  parent_id: string | null;
  name: string;
}

/**
 * Categoriile create de import care se pot sterge: cele din urma care mai exista, fara produse (legate prin NUME, ca in
 * restul magazinului) si fara subcategorii care raman.
 *
 * ⚠ `categories.parent_id` e `on delete cascade`: un parinte sters ar fi luat cu el si o subcategorie pusa de om sub
 * el, cu tot cu legatura produselor ei. Deci un parinte iese doar impreuna cu toti copiii lui. `categorii` trebuie sa
 * cuprinda si copiii celor din urma (ai lui, nu doar cei creati de import).
 */
export function categoriiDemoDeSters(
  urma: UrmaDateDemo,
  categorii: readonly CategorieMagazin[],
  numeCuProduse: ReadonlySet<string>,
): string[] {
  const deSters = new Set(urma.categorii.filter((id) => categorii.some((c) => c.id === id)));
  for (const c of categorii) if (deSters.has(c.id) && numeCuProduse.has(c.name)) deSters.delete(c.id);
  // Pana nu se mai schimba nimic: un copil pastrat isi pastreaza parintele, si asa mai departe in sus.
  for (let schimbat = true; schimbat;) {
    schimbat = false;
    for (const c of categorii) {
      if (deSters.has(c.id) && categorii.some((k) => k.parent_id === c.id && !deSters.has(k.id))) {
        deSters.delete(c.id);
        schimbat = true;
      }
    }
  }
  return categorii.filter((c) => deSters.has(c.id)).map((c) => c.id);
}
