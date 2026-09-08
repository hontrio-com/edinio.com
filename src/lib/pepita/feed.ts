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
import { produsXml, stocDisparutXml, stocXml } from "./serializare";
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
    const ultimaCategorie = randuri[randuri.length - 1].id;
    if (ultimaCategorie === dupaCategorie) break;
    dupaCategorie = ultimaCategorie;
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
    const ultimaListare = randuri[randuri.length - 1].product_id;
    if (ultimaListare === dupaListare) break;
    dupaListare = ultimaListare;
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
   * ⚠ TOATE `<Id>`-urile plecate in trecerea ASTA, si numai pentru feedul de stoc.
   *
   * De ele atarna pietrele de mormant de la sfarsit: ce e in evidenta si nu e aici a disparut
   * din catalog. Se tine un `Set` de siruri — la un catalog de douazeci si cinci de mii de
   * articole inseamna in jur de doi megaocteti, iar alternativa (o a doua trecere prin catalog)
   * ar fi costat inca o data toata munca.
   */
  const plecateAzi = new Set<string>();

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
    /* ⚠ Cursorul care nu inainteaza opreste bucla: altfel feedul nu s-ar mai termina niciodata. */
    const ultimulProdus = produse[produse.length - 1].id;
    if (ultimulProdus === dupaId) break;
    dupaId = ultimulProdus;

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
          else plecateAzi.add(a.id);
          yield fel === "produse" ? produsXml(a) : stocXml(a);
        }
      }
      await tineMinteArticolele(admin, businessId, trimise);
      trimise.length = 0;
    }

    if (produse.length < PAGINA) break;
  }

  /*
   * ⚠ ABIA AICI, SI TOCMAI DE-AIA E AICI.
   *
   * Randul asta se atinge NUMAI dupa ce plimbarea prin catalog s-a terminat de la sine. Orice
   * citire cazuta de mai sus ARUNCA, deci generatorul moare si nu se ajunge niciodata pana
   * jos. Asta e chiar paza pe care o cere intrebarea „dar daca trecerea a fost incompleta?":
   * nu e un steag pe care sa-l uite cineva, e forma codului.
   *
   * Fara ea, un feed taiat la jumatate ar fi declarat orfan tot ce n-a apucat sa treaca —
   * adica ar fi scos din vanzare jumatate de magazin, cu Available=false, in tacere.
   */
  if (fel === "stoc") yield* pietreDeMormant(admin, businessId, plecateAzi);

  yield INCHEIERE;
}

/** Cate pagini de evidenta se plimba cel mult intr-o trecere. 100 × 1000 = 100.000 de articole. */
const PAGINI_EVIDENTA = 100;

/** Unde a ramas plimbarea prin evidenta, ca urmatoarea sa continue de acolo. */
async function cursorulPietrelor(admin: Db, businessId: string): Promise<string | null> {
  try {
    const { data, error } = await admin
      .from("store_settings").select("pepita_config").eq("business_id", businessId).maybeSingle();
    if (error) throw error;
    const cfg = (data as { pepita_config?: Record<string, unknown> } | null)?.pepita_config ?? {};
    const c = cfg.cursor_pietre;
    return typeof c === "string" && c ? c : null;
  } catch {
    /*
     * ⚠ O citire cazuta REIA DE LA INCEPUT, nu opreste ingroparea. Pornirea de la capat e o
     * pierdere de vreme, nu o greseala: se ingroapa aceleasi articole, doar in alta ordine.
     */
    return null;
  }
}

/** Tine minte unde s-a ramas, sau sterge semnul cand s-a ajuns la capat. */
async function scrieCursorul(admin: Db, businessId: string, cursor: string | null): Promise<void> {
  try {
    const { error } = await admin.rpc("jsonb_merge_config", {
      p_business_id: businessId,
      p_column: "pepita_config",
      p_patch: { cursor_pietre: cursor } as never,
    });
    if (error) throw error;
  } catch (e) {
    /*
     * ⚠ NU RUPE FEEDUL. Un semn nescris inseamna ca trecerea urmatoare o ia de la inceput —
     * acelasi lucru care se intampla azi, la fiecare trecere. Nu merita un feed pierdut.
     */
    await logError({
      action: "pepita/pietre-de-mormant",
      message: `semnul de continuare nu s-a putut scrie: ${e instanceof Error ? e.message : String(e)}`,
      businessId, severity: "warning",
    });
  }
}

/**
 * `Available=false, Quantity=0` pentru fiecare `<Id>` trimis candva si care azi nu mai e in feed.
 *
 * ═══ ⚠ CE REPARA ═══
 *
 * Panoul stia deja sa NUMERE articolele ramase la ei si scria negru pe alb ca „pastreaza ultimul
 * pret si ultimul stoc trimise si se pot vinde in continuare". Adica stiam de problema si o
 * aratam, dar nu faceam nimic in privinta ei: un produs sters la noi ramanea la Pepita cu „mai
 * am 5 bucati", si comanda venea. Tiparul e cel mai urat cu putinta — nu se vede in QA, se vede
 * peste doua saptamani ca „am sters produsul si a mai intrat o comanda".
 *
 * ═══ ⚠ CE NU FACE, SI DE CE ═══
 *
 * NU sterge randul din `pepita_articole`. Articolul ramane la ei chiar si dupa ce l-am pus pe
 * zero, deci evidenta lui e in continuare singura dovada ca a plecat vreodata — si tot de ea
 * atarna legarea unei comenzi intarziate de produsul ei.
 *
 * ⚠ SI NU ARUNCA. Aici suntem DUPA tot catalogul: o citire cazuta ar rupe fluxul, `</Catalog>`
 * n-ar mai fi scris, si Pepita ar respinge un feed care era bun pentru TOT restul magazinului.
 * Alegerea e intre „orfanii mai stau o ora pe stocul vechi" si „nimeni nu primeste stocul de
 * azi". Prima e mai ieftina, si se repara singura la trecerea urmatoare.
 */
async function* pietreDeMormant(
  admin: Db, businessId: string, plecateAzi: Set<string>,
): AsyncGenerator<string> {
  /*
   * ═══ ⚠ PLIMBAREA SE RELUA DE LA CAPAT, DECI COADA NU AJUNGEA NICIODATA (09.09.2026) ═══
   *
   * Plafonul de o suta de pagini exista ca sa nu tina ruta ocupata la nesfarsit, si e bun. Dar
   * bucla pornea mereu de la primul articol: la un magazin cu peste 100.000 de articole in
   * evidenta, cele de dupa nu erau vizitate NICIODATA. Un produs sters de acolo ramanea la Pepita
   * cu `Available=true`, pe veci, iar jurnalul spunea doar „s-a depasit plafonul" — o data pe ora,
   * pana nu se mai uita nimeni la el.
   *
   * Acum se tine minte unde s-a ramas. Fiecare trecere continua de acolo; cand se ajunge la capat,
   * semnul se sterge si urmatoarea porneste iar de la inceput.
   *
   * ⚠ MULTIMEA „CE A PLECAT AZI" E INTREAGA ORICUM. Plimbarea prin CATALOG se face de fiecare data
   * in intregime — reluarea priveste doar EVIDENTA. Deci o piatra pusa pe felia de azi e la fel de
   * intemeiata ca una pusa pe prima felie.
   *
   * ⚠ SI NU SE SCRIE NIMIC CAND NU E NEVOIE: un magazin sub plafon nu atinge configurarea deloc.
   * Cheia nu intra in amprenta feedului (vezi `stampilaConfigurarii`), deci nu misca `<LastMod>`.
   */
  let dupaArticol: string | null = await cursorulPietrelor(admin, businessId);
  let ingropate = 0;

  try {
    for (let pagina = 0; pagina < PAGINI_EVIDENTA; pagina++) {
      let q = admin
        .from("pepita_articole").select("articol_id")
        .eq("business_id", businessId).order("articol_id").limit(1000);
      if (dupaArticol) q = q.gt("articol_id", dupaArticol);
      const { data, error } = await q;
      if (error) throw error;

      const randuri = (data ?? []) as { articol_id: string }[];
      if (randuri.length === 0) return;

      /* ⚠ Cursorul care nu inainteaza opreste plimbarea; altfel n-ar mai avea capat. */
      const ultimul = randuri[randuri.length - 1].articol_id;
      if (ultimul === dupaArticol) { await scrieCursorul(admin, businessId, null); return; }
      dupaArticol = ultimul;

      for (const r of randuri) {
        if (plecateAzi.has(r.articol_id)) continue;
        ingropate++;
        yield stocDisparutXml(r.articol_id);
      }

      if (randuri.length < 1000) { await scrieCursorul(admin, businessId, null); return; }
    }

    /*
     * ⚠ S-A ATINS PLAFONUL: se tine minte unde, ca trecerea urmatoare sa continue de acolo. Fara
     * randul asta, ultimele articole ale unui magazin foarte mare n-ar fi ingropate niciodata.
     */
    await scrieCursorul(admin, businessId, dupaArticol);
    await logError({
      action: "pepita/pietre-de-mormant",
      message: `evidenta articolelor depaseste ${PAGINI_EVIDENTA * 1000} de randuri intr-o trecere; `
        + "restul se continua la trecerea urmatoare, de unde s-a ramas",
      details: { ingropate, dupaArticol }, businessId, severity: "info",
    });
  } catch (e) {
    await logError({
      action: "pepita/pietre-de-mormant",
      message: `articolele disparute nu s-au putut marca indisponibile: ${e instanceof Error ? e.message : String(e)}`,
      details: { ingropate }, businessId, severity: "warning",
    });
  }
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
      /*
       * ═══ ⚠ AICI ERA `ignoreDuplicates: true`, SI A DEVENIT GRESIT (09.09.2026) ═══
       *
       * Argumentul de atunci era ca „randul exista deja si n-are ce sa se schimbe". Era adevarat
       * cat timp `<Id>`-ul se derivа din titlu: acelasi articol insemna acelasi titlu.
       *
       * De cand combinatia are identitate STABILA, un articol isi poate schimba numele fara sa-si
       * schimbe `<Id>`-ul — chiar asta am facut cu o zi inainte. Cu `ignoreDuplicates`, evidenta
       * ramanea pe numele VECHI pentru totdeauna, iar ingestul, care cauta intai dupa numele scris,
       * nu-l mai gasea printre combinatiile de azi: comanda intra in carantina si stocul nu se
       * scadea. Adica reparatia de ieri isi crea singura urmatorul defect.
       *
       * ⚠ COSTUL, PE FATA: acum evidenta se rescrie la fiecare trecere a feedului de produse, adica
       * o data pe zi. Randurile se trimiteau oricum toate — se schimba doar ce face baza cu ele —
       * si sunt zeci de mii, nu milioane. Un nume invechit costa o comanda in carantina; o
       * rescriere zilnica nu costa nimic.
       */
      { onConflict: "business_id,articol_id" },
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
