import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/types/database.types";
import { disponibilitatePachet, readBundleConfig } from "@/lib/bundles";
import { storeBaseUrl } from "@/lib/seo";
import { articolelePentruProdus, type ContextArticole, type ProdusPepita } from "./articole";
import { caleaCategoriilor, type RandCategorie } from "./categorii";
import { citesteConfig } from "./config";
import { produsXml, stocXml } from "./serializare";
import { ANTET, INCHEIERE } from "./xml";
import type { PepitaConfig } from "./types";

/**
 * Cele doua feeduri, scrise IN FLUX.
 *
 * ═══ ⚠ DE CE IN FLUX SI NU DINTR-UN SIR ═══
 *
 * Vercel refuza raspunsurile peste 4,5 MB, cu 413, INAINTE sa ruleze vreun rand din
 * cod. Un feed de zece mii de produse trece lejer de prag. Documentatia lor spune
 * ca raspunsurile in flux nu au limita asta („streaming functions, which don't have
 * this limit"), deci feedul se scrie pagina cu pagina si pleaca pe masura ce se
 * construieste. Ca bonus, nu exista niciodata tot catalogul in memorie.
 *
 * ═══ ⚠ SI ASTA E CHIAR ATOMICITATEA ═══
 *
 * `</Catalog>` se scrie NUMAI dupa ce ultima pagina a iesit cu bine. O pana la
 * mijloc lasa un XML neinchis, deci invalid, deci Pepita il respinge intreg si
 * pastreaza ce avea. Inchis intr-un `finally`, un feed taiat de o cadere a bazei ar
 * fi devenit un feed VALID cu jumatate de catalog, adica jumatate de magazin scos
 * de la vanzare fara ca nimeni sa afle.
 *
 * ⚠ De aceea generatorul de mai jos NU are `try/finally` in jurul buclei. Daca il
 * capata vreodata, se pierde exact proprietatea asta.
 */

type Db = SupabaseClient<Database>;

/** Cate produse se citesc odata. Sub plafonul PostgREST de 1000. */
const PAGINA = 500;

/**
 * Coloanele de care are nevoie hotararea din `articole.ts`. Niciuna in plus.
 *
 * ⚠ SE EXPORTA, si panoul o foloseste pe ACEASTA. O a doua lista scrisa acolo s-ar fi
 * departat la prima schimbare, iar panoul ar fi judecat produsul dupa alte campuri decat
 * generatorul: „toate pleaca" despre un feed care sare produse.
 */
export const COLOANE_PRODUS = "id, name, slug, description, price, compare_at_price, sku, images, category, "
  + "track_inventory, stock_quantity, weight_grams, page_sections, is_bundle, updated_at, is_active";

interface RandListare {
  product_id: string;
  inclus: boolean;
  safety_stock: number | null;
  pret_override: number | null;
}

export interface PregatireFeed {
  ctx: ContextArticole;
  config: PepitaConfig;
  listari: Map<string, RandListare>;
}

/**
 * Tot ce se citeste INAINTE de a incepe raspunsul.
 *
 * ⚠ Aici e singurul loc unde o cadere se poate inca transforma intr-un 503 cinstit.
 * Dupa ce primul octet a plecat, codul de stare e deja trimis si nu se mai poate lua
 * inapoi.
 */
export async function pregateste(admin: Db, businessId: string): Promise<PregatireFeed | null> {
  const { data: biz, error: eBiz } = await admin
    .from("businesses")
    .select("id, slug, custom_domain, store_name, business_name, is_published")
    .eq("id", businessId).maybeSingle();
  if (eBiz) throw eBiz;
  const business = biz as {
    id: string; slug: string; custom_domain: string | null;
    store_name: string | null; business_name: string; is_published: boolean;
  } | null;
  if (!business) return null;

  const { data: setari, error: eSet } = await admin
    .from("store_settings")
    .select("pepita_config, vat_enabled, vat_rate, prices_include_vat")
    .eq("business_id", businessId).maybeSingle();
  if (eSet) throw eSet;

  const config = citesteConfig((setari as { pepita_config?: unknown } | null)?.pepita_config);
  /*
   * ⚠ INTEGRAREA OPRITA INSEAMNA FEED INCHIS, nu feed gol.
   *
   * Un `<Catalog>` gol i-ar spune lui Pepita „nu mai am niciun produs", adica exact
   * ce ii spune si un magazin care si-a inchis pravalia: ei ar scoate tot de la
   * vanzare. Ruta raspunde 404, si atunci ei pastreaza ce au si raporteaza o eroare
   * de sursa, care se vede si se repara.
   */
  if (!config.activ) return null;

  const { data: cat, error: eCat } = await admin
    .from("categories").select("id, name, parent_id").eq("business_id", businessId);
  if (eCat) throw eCat;

  const listari = new Map<string, RandListare>();
  for (let de = 0; ; de += 1000) {
    const { data, error } = await admin
      .from("pepita_listari").select("product_id, inclus, safety_stock, pret_override")
      .eq("business_id", businessId).order("product_id").range(de, de + 999);
    if (error) throw error;
    const randuri = (data ?? []) as RandListare[];
    for (const r of randuri) listari.set(r.product_id, r);
    if (randuri.length < 1000) break;
  }

  const s = (setari ?? {}) as { vat_enabled?: boolean; vat_rate?: number; prices_include_vat?: boolean };
  const ctx: ContextArticole = {
    business,
    config,
    magazin: {
      vat_enabled: s.vat_enabled ?? false,
      vat_rate: Number(s.vat_rate ?? 0),
      /* ⚠ Implicit ADEVARAT, ca peste tot in checkout: un magazin fara setarea scrisa tine
         preturile cu TVA inauntru, si a presupune altfel ar adauga TVA a doua oara. */
      prices_include_vat: s.prices_include_vat ?? true,
    },
    caleCategorie: caleaCategoriilor((cat ?? []) as RandCategorie[]),
    baza: storeBaseUrl(business),
  };

  return { ctx, config, listari };
}

/** Produsul intra in feed? */
function inclus(p: { id: string; is_active: boolean }, pre: PregatireFeed): boolean {
  if (!p.is_active) return false;
  const rand = pre.listari.get(p.id);
  if (pre.config.mod_includere === "toate") return rand ? rand.inclus : true;
  return rand ? rand.inclus : false;
}

/**
 * Feedul, bucata cu bucata.
 *
 * `fel` alege intre feedul intreg de produse si cel scurt de stoc. Structura
 * paginarii e aceeasi, si asta e dinadins: doua bucle ar fi ajuns sa raspunda
 * diferit la „ce produse pleaca", iar atunci stocul s-ar fi actualizat pentru
 * articole care nu exista la ei si nu s-ar fi actualizat pentru cele care exista.
 */
export async function* scrieFeed(
  admin: Db, businessId: string, pre: PregatireFeed, fel: "produse" | "stoc",
): AsyncGenerator<string> {
  yield ANTET;

  for (let de = 0; ; de += PAGINA) {
    const { data, error } = await admin
      .from("products").select(COLOANE_PRODUS)
      .eq("business_id", businessId).eq("is_active", true)
      .order("id").range(de, de + PAGINA - 1);
    /*
     * ⚠ SE ARUNCA. Fluxul se rupe, `</Catalog>` nu se mai scrie, iar Pepita
     * primeste XML invalid. E raspunsul corect: alternativa ar fi un feed valid
     * caruia ii lipsesc produsele de dupa pana.
     */
    if (error) throw error;

    const produse = (data ?? []) as unknown as (ProdusPepita & { is_active: boolean })[];
    if (produse.length === 0) break;

    const alese = produse.filter((p) => inclus(p, pre));
    if (alese.length > 0) {
      const disponibilPachet = await disponibilitateaPachetelor(admin, businessId, alese);
      for (const p of alese) {
        const rand = pre.listari.get(p.id);
        const { articole } = articolelePentruProdus(
          {
            ...p,
            /* ⚠ Suprascrierea de pret intra INAINTE de strategie: asa se poate spune „pe Pepita
               produsul asta costa exact atat", si tot se aplica adaosul general peste el. */
            price: rand?.pret_override ?? p.price,
            pachetDisponibil: p.is_bundle ? disponibilPachet.get(p.id) : undefined,
          },
          { ...pre.ctx, safetyStock: rand?.safety_stock ?? pre.config.safety_stock },
        );
        for (const a of articole) yield fel === "produse" ? produsXml(a) : stocXml(a);
      }
    }

    if (produse.length < PAGINA) break;
  }

  yield INCHEIERE;
}

/**
 * Disponibilitatea pachetelor din pagina curenta, din componentele lor.
 *
 * ⚠ COMPONENTELE POT FI IN ALTA PAGINA. De-aia se citesc dupa id, nu se cauta in
 * pagina: cautate acolo, orice pachet ale carui componente cad in alta pagina ar fi
 * iesit „indisponibil", si tocmai pachetele sunt produsele cu marja cea mai buna.
 *
 * ⚠ SI PACHETELE SE SCRIU CU `track_inventory: false`, deci fara pasul asta ar fi
 * plecat toate ca „pe stoc", inclusiv cele cu componentele sterse.
 */
async function disponibilitateaPachetelor(
  admin: Db, businessId: string, produse: { id: string; is_bundle?: boolean; page_sections?: unknown }[],
): Promise<Map<string, boolean>> {
  const out = new Map<string, boolean>();
  const pachete = produse.filter((p) => p.is_bundle);
  if (pachete.length === 0) return out;

  const idComponente = [...new Set(
    pachete.flatMap((p) => (readBundleConfig(p.page_sections)?.items ?? []).map((i) => i.product_id)),
  )];
  const componente = new Map<string, { is_active: boolean; track_inventory: boolean; stock_quantity: number | null }>();

  /*
   * ⚠ `.in()` pleaca IN ADRESA, iar adresa are o limita: peste vreo sapte sute de
   * id-uri cererea cade. Se taie in felii, ca peste tot in proiect.
   */
  for (let i = 0; i < idComponente.length; i += 200) {
    const felie = idComponente.slice(i, i + 200);
    const { data, error } = await admin
      .from("products").select("id, is_active, track_inventory, stock_quantity")
      .eq("business_id", businessId).in("id", felie);
    if (error) throw error;
    for (const c of (data ?? []) as { id: string; is_active: boolean; track_inventory: boolean; stock_quantity: number | null }[]) {
      componente.set(c.id, c);
    }
  }

  for (const p of pachete) {
    const stare = (readBundleConfig(p.page_sections)?.items ?? []).map((it) => {
      const c = componente.get(it.product_id);
      return {
        quantity: it.quantity,
        vandabila: !!c && c.is_active,
        track_inventory: !!c?.track_inventory,
        stock_quantity: c?.stock_quantity ?? null,
      };
    });
    out.set(p.id, disponibilitatePachet(stare).inStock);
  }
  return out;
}
