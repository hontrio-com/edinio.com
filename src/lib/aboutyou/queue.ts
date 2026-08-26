import { createAdminClient } from "@/lib/supabase/admin";
import { bucatiDeIduri } from "@/lib/supabase/id-chunks";
import { logError } from "@/lib/error-logger";
import { randCitit } from "@/lib/supabase/rand-citit";
import type { AboutYouConfig } from "./types";

/*
 * ═══ ⚠ NICIO CITIRE SI NICIO SCRIERE DE AICI NU MAI PICA IN TACERE (26.08.2026) ═══
 *
 * PostgREST NU arunca la refuz: intoarce `{ data: null, error }`. Tot fisierul asta era scris ca
 * si cum ar arunca — `catch`-urile lui cheama `scrieEsecul`, care e scris bine si are deasupra
 * chiar povestea celor 1051 de preturi pierdute — dar nu se executau NICIODATA, fiindca nu era
 * nimic de prins. Nota despre defect era in fisier; leacul, nu.
 *
 * ⚠ CITIRILE ERAU MAI GRAVE DECAT SCRIERILE. O scriere picata inseamna „nu s-a intamplat"; o
 * citire picata inseamna ca s-a luat o HOTARARE gresita:
 *
 *     `data: null`  citit ca „magazinul nu e conectat"      -> nu se pune nimic la coada
 *     `count: null` citit ca „produsul nu e listat"          -> retragerea nu pleaca NICIODATA
 *     `data: null`  citit ca „nu e comanda About You"        -> AWB-ul nu ajunge la ei
 *
 * Iar a doua e cea mai urata: produsul sters ramane ACTIV pe About You si primeste comenzi pentru
 * marfa care nu mai exista — si nici nu se poate repara de mana, fiindca listarea supravietuieste
 * cu `product_id` NULL (cheia straina e `on delete set null`), iar panoul porneste de la
 * `products`. Comerciantul n-are nici buton, nici rand de apasat.
 *
 * ⚠ LEACUL E `randCitit`, care exista in casa tocmai pentru asta si pe care `src/lib/aboutyou`
 * nu-l importa nicaieri. Arunca `EroareCitireBaza`, deci fiecare citire cade in `catch`-ul care
 * era deja acolo, iar `scrieEsecul` incepe in sfarsit sa scrie.
 */

/*
 * Care dintre produse au deja o listare — citit PE BUCATI.
 *
 * `.in()` pleaca in ADRESA cererii: peste vreo sase-sapte sute de identificatori,
 * PostgREST refuza. Apelantii vin din actiunile de comanda si pot aduce mii de
 * produse dintr-o operatie in masa, iar eroarea era si INGHITITA (`data` null
 * citit ca „niciunul listat"), deci nu se punea nimic la coada: pretul sau stocul
 * schimbat in masa nu mai ajungea niciodata pe About You, tacut.
 */
async function idsListate(
  admin: ReturnType<typeof createAdminClient>, businessId: string, ids: string[],
): Promise<Set<string>> {
  const gasite = new Set<string>();
  for (const bucata of bucatiDeIduri(ids)) {
    const { data, error } = await admin
      .from("aboutyou_listings").select("product_id").eq("business_id", businessId).in("product_id", bucata);
    if (error) {
      /*
       * ⚠ SE OPRESTE TOT LOTUL, NU SE SARE BUCATA (26.08.2026).
       *
       * Aici era `continue`, si arata ca o tratare a erorii — dar era a treia forma a aceluiasi
       * defect: o bucata picata din zece inseamna ca produsele ei nu ajung in `listedIds`, deci
       * se filtreaza afara mai jos, deci se pune la coada un SUBSET tacut. `rows.length` nu iese
       * zero, deci nici lipsa nu bate la ochi.
       *
       * Aruncat, lotul intreg cade in `catch`-ul apelantului si `scrieEsecul` il scrie — ca la
       * Trendyol, unde acelasi loc face `if (error) throw error`.
       */
      await logError({
        action: "aboutyou.enqueueMany", message: `nu am putut citi listarile: ${error.message}`,
        details: { businessId, cate: bucata.length }, businessId, severity: "error",
      });
      throw new Error(`listarile nu s-au putut citi: ${error.message}`);
    }
    for (const r of data ?? []) if (r.product_id) gasite.add(r.product_id);
  }
  return gasite;
}

// Enqueue an About You sync for a product when the store has About You connected
// with auto-sync on. Fire-and-forget: never throws into the caller (used from
// product/order actions, which must not break if About You is down).
/**
 * ⚠ ESECURILE DE AICI SE SCRIU, NU SE INGHIT.
 *
 * Punerea la coada e „fire-and-forget": n-are voie sa arunce in apelant, fiindca
 * o pana la marketplace nu trebuie sa impiedice salvarea unui produs in magazin.
 * Dar „nu arunca" a insemnat multa vreme `catch {}` gol, adica un esec fara
 * nicio urma nicaieri.
 *
 * S-a vazut ce costa: un comerciant a schimbat pretul la 1051 de produse
 * (21.08), cererea de punere la coada a cazut, si nimeni n-a aflat. Preturile
 * s-au schimbat in magazin, la marketplace au ramas cele vechi, iar in panou nu
 * scria nimic. A fost gasit abia cand a intrebat el, dupa o zi.
 */
function scrieEsecul(unde: string, businessId: string, e: unknown): void {
  void logError({
    action: `aboutyou.queue.${unde}`,
    message: e instanceof Error ? e.message : "Eroare necunoscuta la punerea in coada",
    details: { businessId },
    businessId,
    severity: "error",
  });
}

export async function enqueueAboutYouSync(
  businessId: string,
  productId: string | null,
  offerId: string,
  op: "upsert" | "delete",
): Promise<void> {
  try {
    const admin = createAdminClient();
    const ss = randCitit<{ aboutyou_config: unknown }>("aboutyou.configPentruCoada", await admin
      .from("store_settings").select("aboutyou_config").eq("business_id", businessId).single());
    const config = (ss?.aboutyou_config as AboutYouConfig) ?? {};
    if (!config.connected || !config.api_key) return;
    /*
     * `auto_sync` oprit inseamna „nu trimite MODIFICARILE mele", nu „lasa
     * produsele sterse sa se vanda mai departe".
     *
     * Ieșirea era inainte de examinarea operatiei, deci prinsese si `delete`. Iar
     * cheia straina e `on delete set null`, deci listarea supravietuia cu
     * `product_id` NULL — iar panoul porneste de la `products`, deci listarea
     * orfana nu se mai afisa niciodata: comerciantul nu avea nici buton, nici rand
     * de apasat, si produsul rămânea ACTIV pe About You, cu comenzi care curgeau.
     * `enqueueAboutYouShip` face deja distincția asta, intenționat.
     */
    if (op === "upsert" && config.auto_sync === false) return;
    // Only enqueue an upsert for products that already have an About You listing
    // (enrichment). Un-enriched products are ignored until the merchant lists them.
    if (op === "upsert" && productId) {
      const { count, error } = await admin
        .from("aboutyou_listings").select("id", { count: "exact", head: true })
        .eq("business_id", businessId).eq("product_id", productId);
      /* ⚠ `count: null` dintr-o pana se citea ca „nu e listat", deci modificarea nu pleca. */
      if (error) throw new Error(`nu am putut afla daca produsul e listat: ${error.message}`);
      if (!count) return;
    }
    /*
     * Stergerea se pune la coada DOAR pentru produse care au chiar o listare.
     *
     * Fara garda, orice produs sters dintr-un magazin cu About You conectat lasa
     * un rand in coada, chiar daca produsul n-a fost listat niciodata — iar cronul
     * il ia, il duce pana la `removeByStyleKey`, primeste „skipped" si abia atunci
     * il sterge. Cu un import in masa curatat, coada se umple degeaba.
     *
     * Se verifica pe `style_key`, nu pe `product_id`: la momentul apelului cheia
     * straina a pus deja `product_id` pe NULL (`on delete set null`), iar `offerId`
     * ESTE `style_key`-ul.
     */
    if (op === "delete") {
      const { count, error } = await admin
        .from("aboutyou_listings").select("id", { count: "exact", head: true })
        .eq("business_id", businessId).eq("style_key", offerId);
      /*
       * ⚠ CEA MAI URATA DINTRE TOATE. `count: null` dintr-o pana se citea ca „produsul n-a fost
       * listat niciodata", deci RETRAGEREA nu intra in coada — iar produsul ramane activ pe About
       * You si primeste comenzi pentru marfa care nu mai exista. Si nici nu se poate repara de
       * mana: listarea supravietuieste cu `product_id` NULL, iar panoul porneste de la `products`.
       */
      if (error) throw new Error(`nu am putut afla daca produsul are listare: ${error.message}`);
      if (!count) return;
    }
    const { error: eCoada } = await admin.from("aboutyou_sync_queue").upsert(
      { business_id: businessId, product_id: productId, offer_id: offerId, op },
      { onConflict: "business_id,offer_id,op" },
    );
    if (eCoada) throw new Error(`punerea la coada a picat: ${eCoada.message}`);
  } catch (e) {
    scrieEsecul("coada", businessId, e);
  }
}

// Batch upsert-enqueue (one config check). Used after orders (stock changes on
// several products at once). Non-throwing; only enqueues products already listed.
export async function enqueueAboutYouSyncMany(businessId: string, productIds: (string | null | undefined)[]): Promise<void> {
  try {
    const ids = [...new Set(productIds.filter((x): x is string => !!x))];
    if (ids.length === 0) return;
    const admin = createAdminClient();
    const ss = randCitit<{ aboutyou_config: unknown }>("aboutyou.configPentruCoada", await admin
      .from("store_settings").select("aboutyou_config").eq("business_id", businessId).single());
    const config = (ss?.aboutyou_config as AboutYouConfig) ?? {};
    if (!config.connected || !config.api_key || config.auto_sync === false) return;
    // Restrict to products that already have an About You listing.
    const listedIds = await idsListate(admin, businessId, ids);
    const rows = ids.filter((id) => listedIds.has(id)).map((id) => ({ business_id: businessId, product_id: id, offer_id: id, op: "upsert" as const }));
    if (rows.length === 0) return;
    /* ⚠ Chiar calea celor 1051 de preturi din 21.08: fara `error`, un lot intreg pica in tacere. */
    const { error: eCoada } = await admin.from("aboutyou_sync_queue")
      .upsert(rows, { onConflict: "business_id,offer_id,op" });
    if (eCoada) throw new Error(`punerea la coada a ${rows.length} produse a picat: ${eCoada.message}`);
  } catch (e) {
    scrieEsecul("coada", businessId, e);
  }
}

// Enqueue a dedicated stock push (op "stock") for listed products — used after
// orders decrement stock. Lighter than a full upsert. Non-throwing.
export async function enqueueAboutYouStockMany(businessId: string, productIds: (string | null | undefined)[]): Promise<void> {
  try {
    const ids = [...new Set(productIds.filter((x): x is string => !!x))];
    if (ids.length === 0) return;
    const admin = createAdminClient();
    const ss = randCitit<{ aboutyou_config: unknown }>("aboutyou.configPentruCoada", await admin
      .from("store_settings").select("aboutyou_config").eq("business_id", businessId).single());
    const config = (ss?.aboutyou_config as AboutYouConfig) ?? {};
    if (!config.connected || !config.api_key || config.auto_sync === false) return;
    /* ⚠ Prin `idsListate`, care taie pe bucati. Calea asta cerea toate id-urile
       deodata: peste ~650 adresa e respinsa la margine si nu se pune nimic in
       coada. Acelasi defect a lasat o zi intreaga preturile nesincronizate la
       Trendyol (21.08); acolo l-a gasit un comerciant, aici o proba. */
    const listedIds = await idsListate(admin, businessId, ids);
    const rows = ids.filter((id) => listedIds.has(id)).map((id) => ({ business_id: businessId, product_id: id, offer_id: id, op: "stock" as const }));
    if (rows.length === 0) return;
    /* ⚠ Stocul e cel mai scump de pierdut: nepus la coada, se vinde marfa care nu mai exista. */
    const { error: eCoada } = await admin.from("aboutyou_sync_queue")
      .upsert(rows, { onConflict: "business_id,offer_id,op" });
    if (eCoada) throw new Error(`punerea la coada a stocului (${rows.length}) a picat: ${eCoada.message}`);
  } catch (e) {
    scrieEsecul("coada", businessId, e);
  }
}

// Enqueue an About You shipment push (op "ship") after a courier AWB is generated
// for an order. No-op unless the order is an About You order. Non-throwing.
export async function enqueueAboutYouShip(businessId: string, orderId: string): Promise<void> {
  try {
    if (!orderId) return;
    const admin = createAdminClient();
    const ss = randCitit<{ aboutyou_config: unknown }>("aboutyou.configPentruCoada", await admin
      .from("store_settings").select("aboutyou_config").eq("business_id", businessId).single());
    const config = (ss?.aboutyou_config as AboutYouConfig) ?? {};
    if (!config.connected || !config.api_key) return;
    /*
     * ⚠ `data: null` dintr-o pana se citea ca „nu e comanda About You", deci AWB-ul nu pleca
     * NICIODATA. Iar comanda nu ajunge nici pe `ship_failed` — starea aia se scrie doar din cron,
     * pentru elemente care AU intrat in coada — deci nici butonul „Reîncearcă expedierea" nu se
     * aprinde. Comanda ramane neexpediata la marketplace: intarziere, penalizare, anulare.
     */
    const ay = randCitit<{ id: string }>("aboutyou.comandaPentruExpediere", await admin
      .from("aboutyou_orders").select("id").eq("business_id", businessId).eq("order_id", orderId).maybeSingle());
    if (!ay) return;
    const { error: eCoada } = await admin.from("aboutyou_sync_queue").upsert(
      { business_id: businessId, product_id: null, offer_id: orderId, op: "ship" },
      { onConflict: "business_id,offer_id,op" },
    );
    if (eCoada) throw new Error(`expedierea nu s-a putut pune la coada: ${eCoada.message}`);
  } catch (e) {
    scrieEsecul("coada", businessId, e);
  }
}
