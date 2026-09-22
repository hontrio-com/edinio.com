"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { dupaRaspuns } from "@/lib/marketplace/dupa-raspuns";
import { enqueueTrendyolInventoryMany } from "@/lib/trendyol/queue";
import { enqueueEmagStocMany } from "@/lib/emag/queue";
import { enqueueAboutYouStockMany } from "@/lib/aboutyou/queue";
import { enqueueGmcSyncMany } from "@/lib/google-merchant/queue";
import { logError } from "@/lib/error-logger";
import { PRAG_STOC_SCAZUT } from "@/lib/stoc-prag";

/*
  ═══════════════════════════════════════════════════════════════════════════════
  STOCUL SCAZUT: CITIREA LISTEI SI COMPLETAREA STOCULUI DIN PANOUL PRINCIPAL
  ═══════════════════════════════════════════════════════════════════════════════

  ⚠ STOCUL NU STA INTR-UN SINGUR LOC, si de aici vine toata grija fisierului.

  - produs simplu        -> `products.stock_quantity`;
  - produs cu variante   -> fiecare combinatie din
    `products.page_sections.variants.combinations[]`, cu `stock_quantity` al ei.
    Totalul produsului il recalculeaza declansatorul `sync_product_stock_from_variants`,
    deci a scrie direct in `products.stock_quantity` la un produs cu variante
    inseamna o valoare care dispare la prima atingere a variantelor.
  - produs fara urmarirea stocului (`track_inventory = false`) -> nu are stoc, si
    nu apare nicaieri aici.

  De aceea scrierea merge pe doua cai, exact ca la feedul de stoc
  (`lib/import/stock-feed/applier.ts`): `update` obisnuit pentru produsele simple,
  si RPC `scrie_variante_daca_neschimbat` pentru variante, care scrie NUMAI daca
  intre citire si scriere nu s-a schimbat nimic. Fara verificarea asta, doi oameni
  care completeaza stocul in acelasi timp isi sterg unul altuia munca, tacut.

  ⚠ SI MARKETPLACE-URILE AFLA. Defectul din 22.08.2026 (vezi
  `stock-feed/committer.ts`) a fost tocmai o cale de scriere care nu anunta pe
  nimeni: in Edinio stocul se schimba, la Trendyol ramanea cel de la listare.
*/

/** Cate randuri acceptam intr-o singura apasare. Peste atat, omul lucreaza din lista de produse. */
const MAX_MODIFICARI = 100;

export interface VariantaSubPrag {
  id: string;
  eticheta: string;
  sku: string | null;
  stoc: number;
}

export interface ProdusSubPrag {
  id: string;
  nume: string;
  imagine: string | null;
  /** Stocul produsului. La cele cu variante e suma variantelor aprinse. */
  stoc: number;
  /** Gol la produsele simple. */
  variante: VariantaSubPrag[];
}

type Combinatie = {
  id?: unknown;
  sku?: unknown;
  stock_quantity?: unknown;
  enabled?: unknown;
  label?: unknown;
  title?: unknown;
  name?: unknown;
  options?: unknown;
};

function numar(v: unknown): number {
  const n = typeof v === "number" ? v : Number(v);
  return Number.isFinite(n) ? n : 0;
}

function combinatii(pageSections: unknown): Combinatie[] {
  if (!pageSections || typeof pageSections !== "object") return [];
  const v = (pageSections as Record<string, unknown>).variants;
  if (!v || typeof v !== "object") return [];
  const c = (v as Record<string, unknown>).combinations;
  return Array.isArray(c) ? (c as Combinatie[]) : [];
}

/**
 * Produsele sub prag ale magazinului, cu variantele lor.
 *
 * Panoul principal arata doar primele cinci; modalul deschide lista, de aceea
 * citirea e separata si se face abia la deschidere.
 *
 * ⚠⚠ NU SUNT TOATE, SI ASTA SE SPUNE PE ECRAN (23.09.2026).
 *
 * Aici scria „modalul le arata pe toate”. Nu le arata: `produse_sub_prag` se
 * incheie cu `limit 200`, iar modalul desena ce primea si atat. La un catalog de
 * 3.351 de produse cu urmarirea stocului pornita, „sub cinci bucati” trece de
 * doua sute fara nicio greutate, iar comerciantul completa doua sute de randuri
 * crezand ca a terminat.
 *
 * Un comentariu care spune altceva decat face codul e mai rau decat niciunul: e
 * chiar motivul pentru care nimeni nu s-a uitat la corpul functiei din baza.
 *
 * De aceea se cere si numarul ADEVARAT, cu a doua functie (`numar_produse_sub_prag`,
 * care nu are plafon), si taierea se spune deschis in modal. Restul nu se pierde:
 * dupa ce se completeaza stocurile, randurile ies de sub prag si lista urmatoare
 * aduce ce era dedesubt.
 */
export async function citesteProduseSubPrag(
  businessId: string,
): Promise<{ produse: ProdusSubPrag[]; cateSunt: number } | { error: string }> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: "Neautorizat" };

  const { data: biz } = await supabase
    .from("businesses").select("id").eq("id", businessId).eq("user_id", user.id).single();
  if (!biz) return { error: "Magazin negasit" };

  const [{ data, error }, { data: numarate }] = await Promise.all([
    supabase.rpc("produse_sub_prag", {
      p_business: businessId,
      p_prag: PRAG_STOC_SCAZUT,
    }),
    supabase.rpc("numar_produse_sub_prag", {
      p_business: businessId,
      p_prag: PRAG_STOC_SCAZUT,
    }),
  ]);

  if (error) return { error: "Nu am putut citi produsele. Incearca din nou." };

  /*
    ⚠ Lista vine din baza, nu dintr-un filtru pe `stock_quantity`.

    Un produs cu variante poate avea 17 bucati in total si o varianta pe ZERO:
    clientul care o vrea nu poate cumpara, iar produsul nu aparea nicaieri cat
    timp filtrul se uita doar la total. Conditia „macar o varianta aprinsa e sub
    prag" se pune pe elementele unui tablou JSON, iar PostgREST nu stie s-o
    exprime: din aplicatie ar fi insemnat sa aducem tot catalogul si sa alegem in
    JavaScript. De aceea e o functie in baza (`produse_sub_prag`), cu RLS in
    vigoare, fiindca ruleaza cu drepturile celui care o cheama.
  */
  const produse: ProdusSubPrag[] = (data ?? []).map(r => ({
    id: r.id,
    nume: r.nume,
    imagine: r.imagine,
    stoc: r.stoc,
    variante: (Array.isArray(r.variante) ? r.variante : []).map(v => {
      const o = (v ?? {}) as Record<string, unknown>;
      return {
        id: String(o.id ?? ""),
        eticheta: typeof o.eticheta === "string" && o.eticheta.trim() ? o.eticheta : String(o.id ?? ""),
        sku: typeof o.sku === "string" && o.sku.trim() ? o.sku : null,
        stoc: numar(o.stoc),
      };
    }).filter(v => v.id !== ""),
  }));

  /*
    ⚠ Daca numaratoarea cade, NU se pune `produse.length` in locul ei: ar fi exact
    minciuna reparata aici, scrisa cu alte cuvinte („200 sub prag”, cand sunt 340).
    Zero inseamna „nu stim”, si modalul nu spune nimic despre total.
  */
  const cateSunt = Number(numarate?.[0]?.sub_prag ?? 0);

  return { produse, cateSunt };
}

export type Modificare =
  | { fel: "produs"; productId: string; cantitate: number }
  | { fel: "varianta"; productId: string; variantId: string; cantitate: number };

export type ModScriere = "adauga" | "seteaza";

/**
 * Completeaza stocul pentru produsele si variantele alese.
 *
 * `adauga` creste cu `cantitate` fata de valoarea de acum (marfa primita),
 * `seteaza` scrie exact valoarea (inventar). Stocul nu coboara sub zero.
 */
export async function actualizeazaStocuri(
  businessId: string,
  modificari: Modificare[],
  mod: ModScriere,
): Promise<{ actualizate: number; esuate: { productId: string; mesaj: string }[] } | { error: string }> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: "Neautorizat" };

  if (!Number.isFinite(modificari.length) || modificari.length === 0) {
    return { error: "Nu ai ales niciun produs." };
  }
  if (modificari.length > MAX_MODIFICARI) {
    return { error: `Poti actualiza cel mult ${MAX_MODIFICARI} randuri odata.` };
  }
  if (modificari.some(m => !Number.isFinite(m.cantitate) || m.cantitate < 0 || m.cantitate > 1_000_000)) {
    return { error: "Cantitatea trebuie sa fie un numar intre 0 si 1.000.000." };
  }

  const { data: biz } = await supabase
    .from("businesses").select("id").eq("id", businessId).eq("user_id", user.id).single();
  if (!biz) return { error: "Magazin negasit" };

  const esuate: { productId: string; mesaj: string }[] = [];
  const atinse = new Set<string>();

  // ── Produsele simple: o citire, o scriere ────────────────────────────────
  const simple = modificari.filter(m => m.fel === "produs");
  for (const m of simple) {
    const { data: p, error: errCitire } = await supabase
      .from("products").select("stock_quantity")
      .eq("id", m.productId).eq("business_id", businessId).single();

    if (errCitire || !p) {
      esuate.push({ productId: m.productId, mesaj: "Produsul nu mai exista" });
      continue;
    }

    const nou = mod === "adauga" ? numar(p.stock_quantity) + m.cantitate : m.cantitate;
    const { error: errScriere } = await supabase
      .from("products")
      .update({ stock_quantity: Math.max(0, Math.round(nou)), updated_at: new Date().toISOString() })
      .eq("id", m.productId).eq("business_id", businessId);

    if (errScriere) esuate.push({ productId: m.productId, mesaj: errScriere.message });
    else atinse.add(m.productId);
  }

  // ── Variantele: citeste, modifica, scrie DACA nu s-a schimbat intre timp ──
  const peProdus = new Map<string, Extract<Modificare, { fel: "varianta" }>[]>();
  for (const m of modificari) {
    if (m.fel !== "varianta") continue;
    const lista = peProdus.get(m.productId) ?? [];
    lista.push(m);
    peProdus.set(m.productId, lista);
  }

  /*
    ⚠ DE CE CLIENT DE SISTEM DOAR AICI, si de ce NU se largesc drepturile.

    `scrie_variante_daca_neschimbat` e `security definer` si e data doar cheii de
    serviciu. Motivul e in chiar corpul ei: primeste `p_business` de la apelant si
    NU verifica cine e omul, deci un `grant ... to authenticated` ar fi insemnat
    ca orice utilizator logat poate scrie in variantele oricarui magazin, daca ii
    afla id-ul. (Masurat: prima varianta a codului asta a primit
    „permission denied for function", si bine a facut.)

    Poarta ramane deci in aplicatie, si e cea de mai sus: magazinul trebuie sa fie
    al utilizatorului. Sub ea, fiecare scriere e legata de `businessId`.
  */
  const admin = peProdus.size > 0 ? createAdminClient() : null;

  for (const [productId, schimbari] of peProdus) {
    let scris = false;
    let mesaj = "Produsul a fost modificat in acelasi timp de altcineva";

    /* Trei incercari, ca la feedul de stoc: intre citire si scriere poate intra
       o comanda care scade stocul, si atunci se reia cu valoarea proaspata. */
    for (let incercare = 0; incercare < 3 && !scris; incercare++) {
      const { data: p, error: errCitire } = await supabase
        .from("products").select("page_sections")
        .eq("id", productId).eq("business_id", businessId).single();

      if (errCitire || !p) { mesaj = "Produsul nu mai exista"; break; }

      const radacina = (p.page_sections && typeof p.page_sections === "object" && !Array.isArray(p.page_sections)
        ? { ...(p.page_sections as Record<string, unknown>) }
        : {}) as Record<string, unknown>;
      const variante = (radacina.variants && typeof radacina.variants === "object"
        ? { ...(radacina.variants as Record<string, unknown>) }
        : {}) as Record<string, unknown>;
      const combos = combinatii(p.page_sections);

      let gasite = 0;
      const combosNoi = combos.map(c => {
        const schimbare = schimbari.find(s => s.variantId === c.id);
        if (!schimbare) return c;
        gasite += 1;
        const acum = numar(c.stock_quantity);
        const nou = mod === "adauga" ? acum + schimbare.cantitate : schimbare.cantitate;
        return { ...c, stock_quantity: Math.max(0, Math.round(nou)) };
      });

      if (gasite === 0) { mesaj = "Variantele nu mai exista in produs"; break; }

      variante.combinations = combosNoi;
      radacina.variants = variante;

      const { data: fel, error: errRpc } = await admin!.rpc("scrie_variante_daca_neschimbat", {
        p_business: businessId,
        p_product: productId,
        p_asteptat: p.page_sections as never,
        p_nou: radacina as never,
      });

      if (errRpc) { mesaj = errRpc.message; break; }
      if (fel === "scris") { scris = true; break; }
      if (fel === "lipsa") { mesaj = "Produsul nu mai exista"; break; }
      // `schimbat`: se reia bucla, cu o citire proaspata.
    }

    if (scris) atinse.add(productId);
    else esuate.push({ productId, mesaj });
  }

  /*
    ⚠ MARKETPLACE-URILE AFLA CE S-A SCHIMBAT, ca la orice alta cale de scriere a
    stocului. Se anunta doar produsele CHIAR scrise. `dupaRaspuns` + `void`: o pana
    la un marketplace n-are voie sa rupa completarea stocului, iar esecul lui se
    scrie in `error_logs`.
  */
  const idAtinse = [...atinse];
  if (idAtinse.length > 0) {
    dupaRaspuns(() => enqueueTrendyolInventoryMany(businessId, idAtinse), "enqueueTrendyolInventoryMany", businessId);
    dupaRaspuns(() => enqueueEmagStocMany(businessId, idAtinse), "enqueueEmagStocMany", businessId);
    dupaRaspuns(() => enqueueAboutYouStockMany(businessId, idAtinse), "enqueueAboutYouStockMany", businessId);
    /* GMC nu tine cantitatea, dar tine DISPONIBILITATEA: un produs care iese din
       zero trebuie sa redevina „in stoc" in feed. */
    dupaRaspuns(() => enqueueGmcSyncMany(businessId, idAtinse), "enqueueGmcSyncMany", businessId);
  }

  if (esuate.length > 0) {
    await logError({
      action: "actualizeazaStocuri",
      message: `${esuate.length} din ${modificari.length} randuri nu s-au scris`,
      details: { esuate: esuate.slice(0, 20) },
      userId: user.id,
      businessId,
      severity: "warning",
    });
  }

  revalidatePath("/dashboard");
  revalidatePath("/dashboard/products");

  return { actualizate: idAtinse.length, esuate };
}
