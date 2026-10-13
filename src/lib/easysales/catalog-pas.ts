import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/types/database.types";
import { logError } from "@/lib/error-logger";
import type { ContextEasySales } from "./client";
import {
  amprentaMediului, catalogulPoateLucra, golesteCoadaCatalogului, improspateazaSkuDuplicate, incarcaMediul,
  problemaMediului, puneCatalogulInPauza, type OptiuniLucru, type PoateLucra,
} from "./catalog";
import type { EasySalesConfig } from "./tipuri";
import { pasulVerificarii, pauzaWebsiteRedenumit, pornesteVerificarea, websiteulExista } from "./verificare";
import { bucla, impinge, pasulDerivei, prelucreazaExternele } from "./bucla";

/**
 * Trecerea cronului pe un magazin cu catalogul pornit (planul, §7.5).
 *
 *   1. mediul: moneda (D29) si cota de TVA; o problema pune catalogul in pauza, cu anunt;
 *   2. amprenta mediului: domeniul, permalinkurile, TVA-ul sau setarile catalogului s-au schimbat ->
 *      tot catalogul inapoi in coada (continut si pret), fara chemari scrise in fiecare drum;
 *   3. cererea lor de reimprospatare (`products-refresh-requested`), cel mult o data pe ora, numai
 *      dupa ce numele website-ului e confirmat in lista lor (paza retrimiterii in masa);
 *   4. SKU-urile duplicate, socotite pe tot catalogul cel mult o data pe ora;
 *   5. coada catalogului, pe operatii, cat tine bugetul;
 *   6. verificarea (tintita sau completa, pe felii); cu bucla de stoc pornita, intai comenzile altor
 *      canale (`extern_citeste`), apoi stocul (in coada catalogului), iar dupa verificare deriva;
 *   7. incarcarea initiala: cand coada continutului s-a golit, jobul se inchide si porneste o
 *      trecere completa de verificare.
 *
 * Nu arunca: eroarea unui magazin nu opreste trecerea pentru celelalte.
 */

type Admin = SupabaseClient<Database>;
const ORA = 3600_000;

export async function pasulCatalogului(
  admin: Admin, ctx: ContextEasySales, maiAreTimp: () => boolean, probe: Omit<OptiuniLucru, "maiAreTimp"> = {},
): Promise<void> {
  const poarta: (cfg: EasySalesConfig) => PoateLucra = probe.poarta ?? catalogulPoateLucra;
  const b = ctx.businessId;
  if (!poarta(ctx.cfg).da) return;
  try {
    const mediu = await incarcaMediul(admin, b, ctx.cfg);
    const problema = problemaMediului(mediu);
    if (problema) {
      await puneCatalogulInPauza(admin, ctx, problema.startsWith("Magazinul vinde") ? "moneda" : "cota-tva", problema);
      return;
    }

    const amprenta = amprentaMediului(mediu);
    if (ctx.cfg.catalog_amprenta_mediu && ctx.cfg.catalog_amprenta_mediu !== amprenta) {
      const { error } = await admin.rpc("easysales_pune_catalogul_in_coada", { p_business: b, p_ops: ["articol_continut", "articol_pret"] });
      if (error) throw new Error(`catalogul in coada: ${error.message}`);
    }
    if (ctx.cfg.catalog_amprenta_mediu !== amprenta) {
      await ctx.dep.peticConfig(b, { catalog_amprenta_mediu: amprenta });
      ctx.cfg.catalog_amprenta_mediu = amprenta;
    }

    const ceruta = ctx.cfg.reimprospatare_catalog_ceruta_la ? Date.parse(ctx.cfg.reimprospatare_catalog_ceruta_la) : 0;
    const facuta = ctx.cfg.catalog_reimprospatat_la ? Date.parse(ctx.cfg.catalog_reimprospatat_la) : 0;
    if (ceruta > facuta && Date.now() - facuta > ORA && maiAreTimp()) {
      const w = await websiteulExista(ctx);
      if (w === "nu") {
        await pauzaWebsiteRedenumit(admin, ctx);
        return;
      }
      if (w === "da") {
        await retrimiteCatalogulIntreg(admin, b);
        const acum = new Date().toISOString();
        await ctx.dep.peticConfig(b, { catalog_reimprospatat_la: acum });
        ctx.cfg.catalog_reimprospatat_la = acum;
      }
    }

    await improspateazaSkuDuplicate(admin, ctx);
    /* Bucla de stoc (E4): intai vanzarile altor canale, ca stocul care pleaca sa le cuprinda. */
    const optBucla = { maiAreTimp, poarta: probe.poartaBuclei };

    /* Cererea lor de stoc intreg (`stock-refresh-requested`, reactivarea contului), cel mult o data pe ora. */
    const cerutStoc = ctx.cfg.reimprospatare_stoc_ceruta_la ? Date.parse(ctx.cfg.reimprospatare_stoc_ceruta_la) : 0;
    const facutStoc = ctx.cfg.stoc_reimprospatat_la ? Date.parse(ctx.cfg.stoc_reimprospatat_la) : 0;
    if (cerutStoc > facutStoc && Date.now() - facutStoc > ORA && impinge((probe.poartaBuclei ?? bucla)(ctx.cfg))) {
      await admin.from("easysales_produse").update({ stoc_trimis: null, updated_at: new Date().toISOString() })
        .eq("business_id", b).in("stare", ["trimis", "confirmat"]);
      await admin.rpc("easysales_pune_catalogul_in_coada", { p_business: b, p_ops: ["articol_stoc"] });
      const acum = new Date().toISOString();
      await ctx.dep.peticConfig(b, { stoc_reimprospatat_la: acum });
      ctx.cfg.stoc_reimprospatat_la = acum;
    }
    if (maiAreTimp()) await prelucreazaExternele(admin, ctx, optBucla);
    if (maiAreTimp()) await golesteCoadaCatalogului(admin, ctx, { ...probe, maiAreTimp, poarta });
    if (maiAreTimp()) await pasulVerificarii(admin, ctx, maiAreTimp);
    if (maiAreTimp()) await pasulDerivei(admin, ctx, optBucla);
    await inchideIncarcarea(admin, b);
  } catch (e) {
    await logError({ action: "easysales.catalog", severity: "warning", businessId: b, message: `trecerea catalogului: ${(e as Error).message}` });
  }
}

/**
 * Tot catalogul, retrimis: amprentele se sterg (altfel Save-ul ar sari peste tot ce n-a schimbat
 * Edinio), iar produsele intra in coada. ⚠ Apelantul a confirmat deja website-ul in lista lor.
 */
export async function retrimiteCatalogulIntreg(admin: Admin, businessId: string): Promise<void> {
  const { error } = await admin.from("easysales_produse").update({ amprenta: null, updated_at: new Date().toISOString() })
    .eq("business_id", businessId).in("stare", ["trimis", "confirmat", "respins"]);
  if (error) throw new Error(`amprentele: ${error.message}`);
  const { error: e2 } = await admin.rpc("easysales_pune_catalogul_in_coada", { p_business: businessId, p_ops: ["articol_continut"] });
  if (e2) throw new Error(`catalogul in coada: ${e2.message}`);
}

/** Incarcarea initiala se inchide cand coada continutului e goala; atunci porneste verificarea. */
async function inchideIncarcarea(admin: Admin, businessId: string): Promise<void> {
  const { data: job } = await admin.from("easysales_joburi").select("id")
    .eq("business_id", businessId).eq("fel", "incarcare").eq("stare", "in_lucru").maybeSingle();
  if (!job) return;
  const { count, error } = await admin.from("easysales_sync_queue").select("id", { count: "exact", head: true })
    .eq("business_id", businessId).in("op", ["articol_continut", "categorie"]).is("abandonat_la", null);
  if (error || (count ?? 1) > 0) return;
  const acum = new Date().toISOString();
  await admin.from("easysales_joburi").update({ stare: "gata", terminat_la: acum, actualizat_la: acum }).eq("id", (job as { id: string }).id);
  await pornesteVerificarea(admin, businessId);
}
