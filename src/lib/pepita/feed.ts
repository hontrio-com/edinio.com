import "server-only";
import { createHash } from "node:crypto";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/types/database.types";
import { disponibilitatePachet, readBundleConfig } from "@/lib/bundles";
import { storeBaseUrl } from "@/lib/seo";
import { logError } from "@/lib/error-logger";
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
  /** Cand s-a atins ultima oara listarea. Intra in `<LastMod>`: vezi nota de la `pragMagazin`. */
  actualizat_la: string | null;
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
    .select("id, slug, custom_domain, store_name, business_name, is_published, updated_at")
    .eq("id", businessId).maybeSingle();
  if (eBiz) throw eBiz;
  const business = biz as {
    id: string; slug: string; custom_domain: string | null;
    store_name: string | null; business_name: string; is_published: boolean;
    updated_at: string | null;
  } | null;
  if (!business) return null;

  const { data: setari, error: eSet } = await admin
    .from("store_settings")
    .select("pepita_config, vat_enabled, vat_rate, prices_include_vat, currency")
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

  /*
   * ⚠ PAGINAT, ca `pepita_listari` de mai jos. PostgREST intoarce cel mult 1000 de randuri, iar
   * o citire fara paginare taia tacut arborele: la peste 1000 de categorii, caile din feed ar
   * fi iesit gresite sau goale, fara nicio eroare.
   */
  const categorii: RandCategorie[] = [];
  let dupaCategorie: string | null = null;
  for (;;) {
    let qc = admin
      .from("categories").select("id, name, parent_id, updated_at")
      .eq("business_id", businessId).order("id").limit(1000);
    if (dupaCategorie) qc = qc.gt("id", dupaCategorie);
    const { data, error: eCat } = await qc;
    if (eCat) throw eCat;
    const randuri = (data ?? []) as (RandCategorie & { updated_at: string | null })[];
    if (randuri.length === 0) break;
    dupaCategorie = randuri[randuri.length - 1].id;
    categorii.push(...randuri);
    if (randuri.length < 1000) break;
  }

  /* ⚠ Pe cheie, ca produsele: un rand sarit de o fereastra mutata ar scoate tacut produsul din
     feed pe modul „doar cele alese", sau i-ar pierde pretul propriu pe modul „toate". */
  const listari = new Map<string, RandListare>();
  let dupaListare: string | null = null;
  for (;;) {
    let ql = admin
      .from("pepita_listari").select("product_id, inclus, safety_stock, pret_override, actualizat_la")
      .eq("business_id", businessId).order("product_id").limit(1000);
    if (dupaListare) ql = ql.gt("product_id", dupaListare);
    const { data, error } = await ql;
    if (error) throw error;
    const randuri = (data ?? []) as RandListare[];
    if (randuri.length === 0) break;
    dupaListare = randuri[randuri.length - 1].product_id;
    for (const r of randuri) listari.set(r.product_id, r);
    if (randuri.length < 1000) break;
  }

  const s = (setari ?? {}) as {
    vat_enabled?: boolean; vat_rate?: number; prices_include_vat?: boolean; currency?: string | null;
    pepita_config?: Record<string, unknown> | null;
  };

  /*
   * ═══ ⚠ PRAGUL DE JOS AL LUI `<LastMod>` ═══
   *
   * `LastMod` venea DOAR din `products.updated_at`, si asta il facea sa minta: feedul se
   * schimba si fara ca produsul sa fie atins. Strategia de pret, stocul de siguranta, garantia,
   * termenul si pretul de livrare, cota de TVA, numele magazinului, adresa lui, arborele de
   * categorii: toate intra in XML, si niciuna nu urca `products.updated_at`. Pepita ar fi vazut
   * o data veche pe un produs al carui pret tocmai se schimbase.
   *
   * ⚠ NU SE FOLOSESTE `store_settings.updated_at`, si asta a fost prima incercare, gresita.
   * Coloana aceea urca la FIECARE COMANDA: numerotarea secventiala face
   * `update store_settings set order_counter = order_counter + 1`, iar pe tabela din spatele
   * vederii sta un declansator care pune `updated_at = now()` neconditionat. Deci pragul ar fi
   * fost „acum" in fiecare zi, pe tot catalogul, si `<LastMod>` n-ar mai fi insemnat nimic:
   * corect, dar fara nicio informatie.
   *
   * ⚠ IN LOC, O AMPRENTA A CAMPURILOR CARE CHIAR AJUNG IN FEED. Se socoteste la fiecare citire
   * a feedului; cand difera de cea pastrata, se scrie una noua impreuna cu clipa de acum.
   * Stampila e deci clipa in care s-a OBSERVAT schimbarea, nu cea in care s-a facut: mereu mai
   * tarziu decat schimbarea, niciodata mai devreme, deci nu poate ingheta un pret vechi.
   *
   * TVA-ul intra si el in amprenta, desi nu are stampila proprie nicaieri: el schimba pretul
   * brut din feed, deci lasat pe dinafara ar fi fost tocmai schimbarea care nu ajunge la ei.
   */
  const clipa = (v: string | null | undefined): number => {
    const t = v ? new Date(v).getTime() : NaN;
    return Number.isFinite(t) ? Math.floor(t / 1000) : 0;
  };
  const stampilaSetari = await stampilaConfigurarii(admin, businessId, s, config);
  const pragMagazin = Math.max(
    clipa(business.updated_at),
    clipa(stampilaSetari),
    ...categorii.map((c) => clipa((c as { updated_at?: string | null }).updated_at)),
    0,
  );
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
    caleCategorie: caleaCategoriilor(categorii),
    baza: storeBaseUrl(business),
    pragMagazin,
  };

  return { ctx, config, listari };
}

/**
 * Clipa ultimei schimbari a configurarilor care ajung in feed.
 *
 * ⚠ NU ARUNCA NICIODATA. E o imbunatatire a lui `<LastMod>`, nu o parte din feed: o pana la
 * scriere intoarce clipa de acum, adica „proaspat", care e directia care nu strica nimic.
 */
async function stampilaConfigurarii(
  admin: Db,
  businessId: string,
  setari: { vat_enabled?: boolean; vat_rate?: number; prices_include_vat?: boolean; currency?: string | null; pepita_config?: Record<string, unknown> | null },
  config: PepitaConfig,
): Promise<string> {
  const acum = new Date().toISOString();
  const brut = setari.pepita_config ?? {};

  /*
   * ⚠ NUMAI CE AJUNGE IN XML. `activ` si cheile nu intra: pornirea integrarii nu schimba
   * niciun camp al vreunui produs, iar o rotire de cheie cu atat mai putin.
   */
  const amprenta = createHash("sha256").update(JSON.stringify([
    setari.vat_enabled === true,
    Number(setari.vat_rate ?? 0),
    setari.prices_include_vat !== false,
    /* ⚠ `store_settings.currency` NU intra: in XML pleaca moneda PIETEI Pepita, nu a magazinului. */
    config.piata,
    config.strategie_pret,
    config.safety_stock,
    config.shipping_delay,
    config.shipping_price,
    config.garantie,
    config.mod_includere,
  ])).digest("hex").slice(0, 16);

  const veche = typeof brut.feed_amprenta === "string" ? brut.feed_amprenta : null;
  const stampila = typeof brut.feed_stamp === "string" ? brut.feed_stamp : null;
  if (veche === amprenta && stampila) return stampila;

  try {
    const { error } = await admin.rpc("jsonb_merge_config", {
      p_business_id: businessId,
      p_column: "pepita_config",
      p_patch: { feed_amprenta: amprenta, feed_stamp: acum } as never,
    });
    if (error) throw error;
  } catch (e) {
    await logError({
      action: "pepita/feed-stampila",
      message: `stampila configurarii nu s-a putut scrie: ${e instanceof Error ? e.message : String(e)}`,
      businessId, severity: "warning",
    });
  }
  return acum;
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

  /* Ce s-a trimis in pagina curenta, scris in baza dupa fiecare pagina. */
  const trimise: ArticolTrimis[] = [];

  /*
   * ⚠ PLIMBARE PE CHEIE, nu pe offset. `products.id` e uuid aleator, iar `.range()` numara
   * randurile DUPA ordonare: un import care ruleaza in acelasi timp si insereaza un produs cu
   * id mai mic muta fereastra si SARE un produs. Aici asta inseamna un produs care lipseste din
   * feedul trimis lui Pepita — si, pe deasupra, articolele lui raman in evidenta si sunt
   * numarate ORFANE la urmatoarea verificare.
   *
   * Aceeasi lectie e scrisa la `includeToateActive` si la `verificaProdusePepita`.
   */
  let dupaId: string | null = null;
  for (;;) {
    let q = admin
      .from("products").select(COLOANE_PRODUS)
      .eq("business_id", businessId).eq("is_active", true)
      .order("id").limit(PAGINA);
    if (dupaId) q = q.gt("id", dupaId);
    const { data, error } = await q;
    /*
     * ⚠ SE ARUNCA. Fluxul se rupe, `</Catalog>` nu se mai scrie, iar Pepita
     * primeste XML invalid. E raspunsul corect: alternativa ar fi un feed valid
     * caruia ii lipsesc produsele de dupa pana.
     */
    if (error) throw error;

    const produse = (data ?? []) as unknown as (ProdusPepita & { is_active: boolean })[];
    if (produse.length === 0) break;
    dupaId = produse[produse.length - 1].id;

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
          {
            ...pre.ctx,
            safetyStock: rand?.safety_stock ?? pre.config.safety_stock,
            /* Reglajele per produs se schimba fara ca produsul sa fie atins: vezi `pragMagazin`. */
            listareAtinsaLa: rand?.actualizat_la ?? null,
          },
        );
        for (const a of articole) {
          /* ⚠ Perechea (produs, combinatie) se tine minte pentru drumul INAPOI: vezi
             `tineMinteArticolele`. `a.id` e chiar ce pleaca in `<Id>`. */
          if (fel === "produse") trimise.push({ productId: p.id, combinatie: a.combinatie, articolId: a.id });
          yield fel === "produse" ? produsXml(a) : stocXml(a);
        }
      }
      await tineMinteArticolele(admin, businessId, trimise);
      trimise.length = 0;
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

interface ArticolTrimis { productId: string; combinatie: string; articolId: string }

/**
 * Tine minte ce `<Id>` a plecat pentru fiecare produs si combinatie.
 *
 * ═══ ⚠ DE CE E NEVOIE, DESI `<Id>`-UL SE POATE RECALCULA ═══
 *
 * Recalcularea porneste de la titlurile de ACUM. O comanda care soseste dupa ce comerciantul
 * a redenumit o varianta poarta `<Id>`-ul VECHI, si atunci nicio amprenta recalculata nu se
 * mai potriveste: linia ajungea in carantina fara sa stim macar despre ce produs e vorba.
 * Cu randul scris aici, cautarea e exacta si raspunsul e precis.
 *
 * ⚠ SE SCRIE DOAR PE FEEDUL DE PRODUSE, nu si pe cel de stoc. Ids-urile sunt aceleasi, dar
 * stocul se citeste de douazeci si patru de ori mai des, iar randurile ar fi identice: ar fi
 * douazeci si trei de scrieri pe zi fara niciun castig.
 *
 * ⚠ NU ARUNCA NICIODATA. Se cheama din mijlocul unui flux deja pornit; o exceptie ar rupe
 * feedul si ar lasa XML-ul neinchis, adica ar transforma o scriere ratata de evidenta intr-un
 * feed picat. Evidenta se poate reface la trecerea urmatoare; feedul nu.
 */
async function tineMinteArticolele(admin: Db, businessId: string, trimise: ArticolTrimis[]): Promise<void> {
  if (trimise.length === 0) return;
  try {
    const { error } = await admin.from("pepita_articole").upsert(
      trimise.map((t) => ({
        business_id: businessId,
        product_id: t.productId,
        combinatie: t.combinatie,
        articol_id: t.articolId,
      })) as never,
      /* ⚠ `ignoreDuplicates`: randul exista deja de la trecerea trecuta si nu are ce sa se
         schimbe. Un update ar fi rescris zilnic tot catalogul, degeaba. */
      { onConflict: "business_id,articol_id", ignoreDuplicates: true },
    );
    if (error) throw error;
  } catch (e) {
    await logError({
      action: "pepita/articole",
      message: `evidenta articolelor trimise nu s-a putut scrie: ${e instanceof Error ? e.message : String(e)}`,
      details: { cate: trimise.length }, businessId, severity: "warning",
    });
  }
}
