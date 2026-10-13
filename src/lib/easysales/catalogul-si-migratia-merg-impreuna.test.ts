import { test } from "node:test";
import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/types/database.types";
import { CATALOG_PORNIT, STOC_PORNIT } from "./constante";
import { catalogulPoateLucra, prelucreazaLotulCatalogului } from "./catalog";
import { pasulCatalogului } from "./catalog-pas";
import {
  excludeArticolul, pornesteCatalogul, raportulMagazinului, reiaCatalogul, retrimiteArticolul, retrimiteTot, stareaCatalogului,
} from "./catalog-actiuni";
import { depozitFals } from "./fals-easysales";
import type { ContextEasySales } from "./client";
import type { ElementCoada } from "./coada-element";

/*
 * ═══ COMUTATORUL CATALOGULUI SI MIGRATIA 74 MERG IMPREUNA ═══
 *
 * Migratia catalogului (`2026-10-13-easysales-catalog.sql`) se aplica pe productie numai cand porneste
 * E3, dupa masuratorile E0. Pana atunci sta in `docs/marketplace/` (in `migrations/` intra numai ce e
 * deja in productie, iar CI-ul cade altfel), iar codul catalogului ramane oprit de `CATALOG_PORNIT`.
 *
 * Doua lucruri trebuie sa fie adevarate, si proba le cere pe amandoua:
 *
 *   1. comutatorul si locul fisierului se schimba IMPREUNA: pornit = fisierul in `migrations/`;
 *   2. cu comutatorul oprit, NICIUN drum al catalogului nu atinge tabelele sau functiile migratiei:
 *      pe productie ele nu exista, iar o citire ar arunca 42P01 in cronul tuturor magazinelor.
 */

const IN_ASTEPTARE = "docs/marketplace/2026-10-13-easysales-catalog.sql";
const IN_MIGRATII = "migrations/2026-10-13-easysales-catalog.sql";

/** Ce aduce migratia 74: tabelele si functiile ei. */
const OBIECTE_74 = [
  "easysales_categorii", "easysales_caracteristici", "easysales_joburi",
  "easysales_pune_catalogul_in_coada", "easysales_revendica_catalogul", "easysales_fara_stoc", "easysales_variante_pe",
];

test("comutatorul si migratia: oprit = fisierul in asteptare; pornit = fisierul in `migrations/`", () => {
  if (CATALOG_PORNIT) {
    assert.ok(existsSync(IN_MIGRATII), `CATALOG_PORNIT cere ${IN_MIGRATII} (aplicata pe productie, cu baseline-ul regenerat)`);
    assert.ok(!existsSync(IN_ASTEPTARE), `${IN_ASTEPTARE} trebuia mutat, nu copiat`);
  } else {
    assert.ok(existsSync(IN_ASTEPTARE), `migratia catalogului lipseste din ${IN_ASTEPTARE}`);
    assert.ok(!existsSync(IN_MIGRATII), `${IN_MIGRATII} e in \`migrations/\`, dar catalogul e oprit: CI-ul o cere in productie`);
  }
  assert.ok(!STOC_PORNIT || CATALOG_PORNIT, "bucla de stoc (E4) nu porneste fara catalog (E3)");
});

test("poarta fara comutator (`poartaMagazinului`) n-o da mai departe niciun fisier al aplicatiei, numai probele", async () => {
  const { readdirSync, readFileSync, statSync } = await import("node:fs");
  const { join } = await import("node:path");
  const gasite: string[] = [];
  const umbla = (dir: string) => {
    for (const n of readdirSync(dir)) {
      const cale = join(dir, n);
      if (statSync(cale).isDirectory()) { umbla(cale); continue; }
      if (!/\.(ts|tsx)$/.test(n) || /\.test\.tsx?$/.test(n)) continue;
      const text = readFileSync(cale, "utf8");
      const unix = cale.split("\\").join("/");
      if (/poartaMagazinului/.test(text) && !unix.endsWith("src/lib/easysales/catalog.ts")) gasite.push(unix);
    }
  };
  umbla("src");
  assert.deepEqual(gasite, []);
});

/** Un client Supabase fals: raspunde gol la orice si tine minte ce tabele si functii s-au atins. */
function adminFals() {
  const atinse = new Set<string>();
  const rezultat = (unic: boolean, tabela: string) => ({
    data: unic ? (tabela === "businesses" ? { slug: "magazin", custom_domain: null } : null) : [],
    error: null, count: 0,
  });
  const lant = (tabela: string): unknown => {
    let unic = false;
    const p: Record<string, unknown> = {};
    const intoarce = () => proxy;
    const proxy: unknown = new Proxy(p, {
      get(_t, nume: string) {
        if (nume === "then") {
          return (rezolva: (v: unknown) => unknown, respinge?: (e: unknown) => unknown) =>
            Promise.resolve(rezultat(unic, tabela)).then(rezolva, respinge);
        }
        if (nume === "maybeSingle" || nume === "single") return () => { unic = true; return proxy; };
        return intoarce;
      },
    });
    return proxy;
  };
  const admin = {
    from(t: string) { atinse.add(t); return lant(t); },
    rpc(f: string) { atinse.add(f); return lant(f); },
  } as unknown as SupabaseClient<Database>;
  return { admin, atinse };
}

const B = "11111111-1111-4111-8111-111111111111";

test("⚠ cu comutatorul oprit, niciun drum al catalogului nu atinge tabelele sau functiile migratiei 74", { skip: CATALOG_PORNIT }, async () => {
  const { admin, atinse } = adminFals();
  const cfg = { connected: true, catalog_activ: true, website_nume: "Edinio" };
  const dep = depozitFals({ [B]: cfg });
  const ctx: ContextEasySales = { dep, businessId: B, cfg: dep.configuri.get(B)! };
  assert.equal(catalogulPoateLucra(ctx.cfg).da, false);

  await pasulCatalogului(admin, ctx, () => true);
  const el = { id: "e1", business_id: B, op: "articol_continut", cheie: "p1", incercari: 0, pauze: 0, created_at: new Date().toISOString(), generation: 2 } as ElementCoada;
  for (const op of ["articol_continut", "articol_pret", "articol_stoc", "articol_sterge", "categorie"]) {
    const [s] = await prelucreazaLotulCatalogului(admin, ctx, op, [{ ...el, op }], { maiAreTimp: () => true });
    assert.equal(s, "gata", `${op}: lucrarea se sterge (catalogul e oprit)`);
  }
  await stareaCatalogului(admin, B, ctx.cfg);
  for (const r of [await pornesteCatalogul(admin, ctx), await reiaCatalogul(admin, ctx), await retrimiteTot(admin, ctx), await retrimiteArticolul(admin, ctx, 1), await excludeArticolul(admin, ctx, 1)]) {
    assert.equal(r.ok, false, "fara comutator, omul primeste motivul, nu o lucrare");
  }
  await raportulMagazinului(admin, B, ctx.cfg);

  const ale74 = [...atinse].filter((x) => OBIECTE_74.includes(x));
  assert.deepEqual(ale74, [], `atinse fara comutator: ${ale74.join(", ")}`);
  assert.ok(atinse.has("products"), "raportul chiar citeste produsele (proba nu e goala)");
  assert.ok(atinse.has("easysales_sync_queue"), "lucrarile catalogului chiar se sterg din coada");
});
