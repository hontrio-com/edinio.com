import { createAdminClient } from "@/lib/supabase/admin";
import { bucatiDeIduri } from "@/lib/supabase/id-chunks";
import { logError } from "@/lib/error-logger";
import type { TrendyolConfig } from "./types";
import { noteazaIntentia } from "@/lib/marketplace/intentie-publicare";

/**
 * Ce se pune la zero cand vine o CERERE NOUA peste un element care exista deja.
 *
 * ═══ ⚠ FARA ASTA, ABANDONUL AR FI FOST O USA FARA CLANTA ═══
 *
 * De cand lucratorul marcheaza `abandonat_la` in loc sa stearga randul (vezi cronul), un
 * element oprit dupa cinci refuzuri e sarit de `revendica_din_coada`. Daca punerea la coada
 * n-ar sterge marcajul, atunci comerciantul ar putea repara chiar cauza refuzului — ar pune
 * atributul lipsa, ar lega categoria — si produsul tot n-ar mai pleca NICIODATA.
 *
 * ⚠ SI CONTOARELE, SI MOTIVUL VECHI. `attempts` pastrat ar fi facut ca produsul abia reparat
 * sa mai aiba o singura incercare; `last_error` pastrat ar fi aratat in panou motivul unei
 * incercari care nu mai are nicio legatura cu ce e in coada acum.
 *
 * ⚠ E IN REGULA SA FIE NECONDITIONAT, si s-a verificat: TOTI apelantii cozii Trendyol sunt
 * drumuri pe care le porneste omul — salvarea produsului, actiunile in masa, importul, si
 * miscarea de stoc de dupa o vanzare. Reconcilierea NU trece pe aici; ea cheama direct
 * `syncProductNow`. La eMAG, unde plasele chiar pun la coada, deosebirea a trebuit facuta
 * anume — altfel contorul se stergea la fiecare trecere si pragul nu se atingea niciodata.
 */
const CERERE_NOUA = {
  attempts: 0,
  next_retry_at: null,
  abandonat_la: null,
  last_error: null,
} as const;

/**
 * ⚠ ESECURILE DE AICI SE SCRIU, NU SE INGHIT.
 *
 * Punerea la coada e „fire-and-forget": n-are voie sa arunce in apelant, fiindca
 * o pana la Trendyol nu trebuie sa impiedice salvarea unui produs in magazin.
 * Dar „nu arunca" a insemnat multa vreme `catch {}` gol, adica un esec care nu
 * lasa nicio urma nicaieri.
 *
 * S-a vazut ce costa: VetDepo a schimbat preturile la 1051 de produse (21.08),
 * cererea de punere la coada a cazut, si NIMENI n-a aflat. Preturile s-au
 * schimbat in magazin, la Trendyol au ramas cele vechi, iar in panou nu scria
 * nimic. A fost gasit abia cand a intrebat comerciantul, dupa o zi.
 */
function inghiteDarScrie(unde: string, businessId: string, e: unknown, detalii?: Record<string, unknown>): void {
  void logError({
    action: `trendyol.queue.${unde}`,
    message: e instanceof Error ? e.message : "Eroare necunoscuta la punerea in coada",
    details: { businessId, ...detalii },
    severity: "error",
  });
}

// Enqueue a Trendyol sync when the store has Trendyol connected with auto-sync on.
// Fire-and-forget: never throws into the caller (used from product/order actions).
// offer_id == productMainId == the Edinio product id.
export async function enqueueTrendyolSync(
  businessId: string,
  productId: string | null,
  offerId: string,
  op: "upsert" | "delete",
  /**
   * Produs abia creat in magazin. DOAR asa se poate declansa publicarea automata.
   *
   * Fara distinctia asta, „Publicare automată" ar insemna cu totul altceva decat
   * scrie pe eticheta: orice atingere a unui produs — o marire de pret in masa, o
   * schimbare de categorie, o activare — ar trimite pe Trendyol tot ce a atins,
   * adica intreg catalogul dintr-o apasare.
   */
  produsNou = false,
): Promise<void> {
  try {
    const admin = createAdminClient();
    const { data: ss, error: eConfig } = await admin
      .from("store_settings").select("trendyol_config").eq("business_id", businessId).single();

    /*
     * ═══ ⚠ „N-AM PUTUT CITI" NU E „NU E CONECTAT" ═══
     *
     * `error` nu se citea deloc. La o pana de o clipa, `ss` vine `null`, configul iese gol, si
     * functia se opreste exact ca pentru un magazin FARA Trendyol. Miscarea nu intra in coada
     * NICIODATA: nimeni n-o reincearca, fiindca nimeni nu stie ca s-a pierdut.
     *
     * ⚠ E chiar tiparul care a costat 1051 de produse VetDepo pe 21.08 — un `catch {}` gol.
     * Aici nu era gol, era mai rau: arata ca o hotarare.
     */
    if (eConfig) {
      inghiteDarScrie("unul", businessId, eConfig, { productId, offerId, op, unde: "config" });
      return;
    }

    const config = (ss?.trendyol_config as TrendyolConfig) ?? {};
    if (!config.connected || !config.api_key) return;

    /*
     * ═══ ⚠ „TRIMITE AUTOMAT" NU E „PUBLICA PRODUSELE NOI" (26.08.2026) ═══
     *
     * Panoul are DOUA comutatoare, si sunt independente: se poate stinge unul si lasa celalalt
     * aprins. Dar taietura se facea la `auto_sync`, iar `auto_publish` se citea abia mai jos —
     * deci nu apuca sa fie intrebat niciodata.
     *
     * ⚠ CE INSEMNA PENTRU COMERCIANT: cel care spune „preturile le conduc eu din panoul
     * Trendyol, dar produsele noi sa plece singure" — o combinatie pe care interfata i-o
     * ingaduie — nu primea NIMIC. Nici in coada, nici in jurnal: iesirea era un `return` gol.
     *
     * ⚠ ACEEASI GAURA A FOST INCHISA LA eMAG CU O ZI INAINTE, cu aceleasi cuvinte. Aici a
     * ramas pana a gasit-o auditul Trendyol.
     *
     * ⚠ RETRAGEREA TRECE ORICUM: „mi-am stins sincronizarea automata" nu inseamna „lasa
     * produsul sters din magazin la vanzare pe Trendyol".
     */
    const publicareCeruta = op === "upsert" && produsNou && config.auto_publish === true;

    /*
     * ═══ ⚠ INTENTIA SE SCRIE INAINTEA COZII (26.08.2026) ═══
     *
     * Punerea la coada e un efect lateral al unei salvari deja facute. Refuzata — plan depasit,
     * politica, o pana de o clipa — produsul ramanea nepublicat pentru totdeauna: n-are listare,
     * iar „produs fara listare, deci publica-l" nu se poate presupune, fiindca cele mai multe
     * produse fara listare sunt chiar cele pe care comerciantul nu le-a vrut acolo.
     *
     * ⚠ INAINTE, nu dupa. Invers, o pana intre cele doua ar pierde exact cazul pentru care
     * exista tabela.
     */
    if (publicareCeruta && productId) {
      await noteazaIntentia(admin, {
        businessId, productIds: [productId], marketplace: "trendyol", sursa: "auto_publish",
      });
    }
    if (config.auto_sync === false && op !== "delete" && !publicareCeruta) return;
    /*
     * In mod normal se pun la coada doar produsele care au deja o listare pe
     * Trendyol: un produs nou nu se trimite nicaieri pana nu-l pregateste
     * comerciantul.
     *
     * Cu „Publicare automată" pornita, regula se inverseaza — produsul nou intra
     * in coada, iar `syncProductNow` ii construieste listarea din maparea
     * categoriei. Daca nu are categoria mapata, elementul esueaza cu un mesaj
     * clar si e vizibil in coada; nu se trimite nimic gresit la Trendyol.
     */
    if (op === "upsert" && productId && !(config.auto_publish && produsNou)) {
      const { count, error: eNumar } = await admin
        .from("trendyol_listings").select("id", { count: "exact", head: true })
        .eq("business_id", businessId).eq("product_id", productId);

      /*
       * ═══ ⚠ O CITIRE PICATA DA `count: null`, IAR `!null` E `true` ═══
       *
       * Adica o pana de o clipa a bazei arata IDENTIC cu „produsul n-are nicio listare", si
       * miscarea se arunca tacut: nici in coada, nici in jurnal. Aceeasi forma a fost
       * inchisa la eMAG pe 25.08.2026, cu aceleasi cuvinte.
       *
       * ⚠ La eroare se LASA SA TREACA, nu se opreste: mai bine un element in coada care se
       * opreste zgomotos la `syncProductNow` (care isi are paza lui), decat unul aruncat in
       * tacere. Un produs nelistat nu se strica de o punere la coada in plus.
       */
      if (eNumar) {
        inghiteDarScrie("unul", businessId, eNumar, { productId, offerId, op, unde: "numar-listari" });
      } else if (!count) {
        return;
      }
    }
    /*
     * ═══ ⚠ SCRIEREA ASTA NU ERA VERIFICATA (26.08.2026) ═══
     *
     * PostgREST NU arunca: la refuz raspunde `{ data: null, error }`, iar `await` se termina
     * linistit. Deci un refuz — plan depasit, politica, o pana de o clipa — insemna: omul
     * schimba pretul, `await` trece, in coada nu intra nimic, in jurnal nu scrie nimic. Pretul
     * ramanea vechi pe Trendyol si nimeni n-avea de unde sa afle.
     *
     * ⚠ Fratele ei de mai jos (`enqueueMany`) verifica de la inceput. Asta a scapat — chiar
     * forma de defect pe care casa o vaneaza de o luna, si tot intr-o coada.
     *
     * ⚠ `throw` merge in `catch`-ul de dedesubt, deci ajunge la `inghiteDarScrie`: pierderea
     * ramane pierdere, dar inceteaza sa fie TACUTA. O punere la coada nu are cui sa-i fie
     * intoarsa — cine a chemat-o e un efect lateral al unei salvari deja facute.
     */
    const { error: eCoada } = await admin.from("trendyol_sync_queue").upsert(
      {
        business_id: businessId, product_id: productId, offer_id: offerId, op,
        ...CERERE_NOUA,
      },
      { onConflict: "business_id,offer_id,op" },
    );
    if (eCoada) throw eCoada;
  } catch (e) {
    inghiteDarScrie("unul", businessId, e, { productId, offerId, op });
  }
}

/**
 * Punerea la coada a mai multor produse deodata.
 *
 * ═══ ⚠ ID-URILE SE TAIE PE BUCATI. AICI A FOST DEFECTUL ═══
 *
 * `.in("product_id", ids)` NU pleaca in corpul cererii, ci in ADRESA. Fiecare
 * UUID adauga 37 de semne, iar marginea respinge cererea cand adresa devine prea
 * lunga. Masuratoarea e in `supabase/id-chunks.ts`, facuta pe proiectul real:
 * pragul e intre 600 si 700 de id-uri, iar raspunsul e un 400 in text simplu,
 * care nu spune nimic despre id-uri.
 *
 * Defectul (gasit 21.08): VetDepo a schimbat pretul la 1051 de produse dintr-o
 * actiune in masa. `bulkProductAction` isi taia deja propriile cereri pe bucati
 * si chiar avertizeaza in comentariu despre pragul asta — dar chema coada asta
 * cu toate cele 1051 de id-uri deodata. Cererea a picat, `catch {}` a inghitit-o,
 * si nu s-a pus in coada NIMIC. Preturile s-au schimbat in magazin, la Trendyol
 * au ramas cele vechi, si nu s-a vazut nicaieri.
 *
 * ⚠ `bucatiDeIduri` se aplica DOAR citirii. Scrierea de la sfarsit e un `upsert`
 * cu corp, deci nu atinge limita de adresa; taiata si ea, ar fi insemnat mai
 * multe cereri fara niciun castig.
 */
async function enqueueMany(businessId: string, productIds: (string | null | undefined)[], op: "upsert" | "inventory" | "livrare"): Promise<void> {
  try {
    const ids = [...new Set(productIds.filter((x): x is string => !!x))];
    if (ids.length === 0) return;
    const admin = createAdminClient();
    /* ⚠ Picata, citirea da `config = {}`, iar `!config.connected` iese adevarat: tot lotul se
       arunca tacut, ca si cum magazinul n-ar fi legat. `throw` il duce in `inghiteDarScrie`. */
    const { data: ss, error: eSetari } = await admin
      .from("store_settings").select("trendyol_config").eq("business_id", businessId).single();
    if (eSetari) throw eSetari;
    const config = (ss?.trendyol_config as TrendyolConfig) ?? {};
    if (!config.connected || !config.api_key || config.auto_sync === false) return;
    // Actiunile in masa NU auto-publica: ele ating produse existente, iar
    // „publicare automată" e despre produsele noi. Vezi comentariul de mai sus.
    const listedIds = new Set<string>();
    for (const bucata of bucatiDeIduri(ids)) {
      const { data: listed, error } = await admin
        .from("trendyol_listings").select("product_id").eq("business_id", businessId).in("product_id", bucata);
      if (error) throw error;
      for (const r of listed ?? []) {
        const pid = (r as { product_id: string | null }).product_id;
        if (pid) listedIds.add(pid);
      }
    }
    const rows = ids.filter((id) => listedIds.has(id))
      .map((id) => ({ business_id: businessId, product_id: id, offer_id: id, op, ...CERERE_NOUA }));
    if (rows.length === 0) return;
    const { error } = await admin.from("trendyol_sync_queue").upsert(rows, { onConflict: "business_id,offer_id,op" });
    if (error) throw error;
  } catch (e) {
    inghiteDarScrie("multe", businessId, e, { cate: productIds.length, op });
  }
}

/**
 * Produsele NOI dintr-un import, pe calea de publicare.
 *
 * ═══ ⚠ „NOU" SI „ATINS" NU SE ANUNTA LA FEL (26.08.2026) ═══
 *
 * `enqueueTrendyolSyncMany` pune la coada numai produsele care au DEJA o listare la ei — asa
 * si trebuie, altfel orice atingere in masa ar publica tot catalogul. Dar un produs NOU dintr-un
 * import n-are inca listare, deci pica prin filtru si nu se publica niciodata.
 *
 * ⚠ CE INSEMNA PENTRU COMERCIANT: bifa „Publicare automată" pornita, un CSV cu 500 de produse
 * noi importat — si la Trendyol zero. Nicio eroare, nicaieri. Din formular mergea; din CSV nu.
 *
 * ⚠ ACEEASI GAURA A FOST INCHISA LA eMAG CU O ZI INAINTE (`publicaPeEmagMany`). Aici a ramas
 * pana a gasit-o auditul.
 *
 * ⚠ INTREBAREA E `auto_publish`, NU `auto_sync`. Cine spune „preturile le conduc eu din panoul
 * Trendyol, dar produsele noi sa plece singure" — o combinatie pe care panoul i-o ingaduie —
 * trebuie sa primeasca exact asta.
 */
export async function publicaProduseNoiTrendyolMany(
  businessId: string, productIds: (string | null | undefined)[],
): Promise<void> {
  try {
    const ids = [...new Set(productIds.filter((x): x is string => !!x))];
    if (ids.length === 0) return;
    const admin = createAdminClient();
    const { data: ss, error: eSetari } = await admin
      .from("store_settings").select("trendyol_config").eq("business_id", businessId).single();
    /* ⚠ O citire picata NU se citeste ca „bifa e stinsa": ar fi aruncat tacut tot lotul, iar
       plasa de siguranta nu-l prinde — cere `last_synced_at`, si un produs nepublicat n-are. */
    if (eSetari) throw eSetari;
    const config = (ss?.trendyol_config as TrendyolConfig) ?? {};
    if (!config.connected || !config.api_key) return;
    if (config.auto_publish !== true) return;

    /* ⚠ Si la lotul din import, din acelasi motiv: o scriere picata aici ar fi lasat cinci sute
       de produse nepublicate, fara nicio urma a cererii. */
    await noteazaIntentia(admin, {
      businessId, productIds: ids, marketplace: "trendyol", sursa: "import",
    });

    /*
     * ⚠ FARA FILTRUL DE LISTARE, si tocmai asta e rostul: produsele astea NU au listare, si de-aia
     * sunt aici. `syncProductNow` le construieste listarea din maparea categoriei; cele fara
     * categorie mapata esueaza zgomotos in coada, cu mesaj, si nu pleaca nimic gresit la ei.
     */
    const rows = ids.map((id) => ({
      business_id: businessId, product_id: id, offer_id: id, op: "upsert" as const, ...CERERE_NOUA,
    }));
    const { error } = await admin
      .from("trendyol_sync_queue").upsert(rows, { onConflict: "business_id,offer_id,op" });
    if (error) throw error;
  } catch (e) {
    inghiteDarScrie("multe", businessId, e, { cate: productIds.length, op: "publicare" });
  }
}

// Full re-push (product create/update). Used after product edits.
export function enqueueTrendyolSyncMany(businessId: string, productIds: (string | null | undefined)[]): Promise<void> {
  return enqueueMany(businessId, productIds, "upsert");
}
// Dedicated inventory push. Used after orders decrement stock.
export function enqueueTrendyolInventoryMany(businessId: string, productIds: (string | null | undefined)[]): Promise<void> {
  return enqueueMany(businessId, productIds, "inventory");
}

/**
 * Retragerea IN MASA a produselor sterse. Vezi nota geamana din `google-merchant/queue.ts`:
 * erau 340 de chemari pe integrare, fiecare cu citirea ei de config, si toate dupa raspuns — deci
 * ce nu apuca sa se termine se TAIA, iar produsul ramanea la vanzare acolo.
 *
 * ⚠ `product_id` E NULL: randul se scrie DUPA stergere, deci o legatura spre produs ar arata catre
 * un rand care nu mai exista.
 */
export async function enqueueTrendyolStergereMany(businessId: string, productIds: (string | null | undefined)[]): Promise<void> {
  try {
    const ids = [...new Set(productIds.filter((x): x is string => !!x))];
    if (ids.length === 0) return;
    const admin = createAdminClient();
    const { data: ss, error: eSetari } = await admin
      .from("store_settings").select("trendyol_config").eq("business_id", businessId).single();
    if (eSetari) throw eSetari;
    const config = (ss?.trendyol_config as TrendyolConfig) ?? {};
    if (!config.connected || !config.api_key) return;
    /*
     * ⚠ NU se cere `auto_sync` aici, si e o deosebire de fond. „Sincronizare automata" e despre
     * a IMPINGE modificari; retragerea unui produs sters e altceva — marfa nu mai exista, iar
     * lasata la vanzare produce comenzi pe care nimeni nu le poate onora. Aceeasi hotarare ca la
     * `enqueueTrendyolRetragereInainteDeStergere`, daca exista.
     */
    /*
     * ═══ ⚠ FILTRUL DUPA `product_id` NU POATE FUNCTIONA AICI (27.08.2026, noaptea tarziu) ═══
     *
     * Randurile se scriu DUPA `DELETE FROM products`, iar `trendyol_listings.product_id` e
     * `ON DELETE SET NULL` — deci in clipa apelului e deja NULL pentru toate produsele sterse.
     * Filtrul intorcea multimea goala, `rows` iesea `[]`, si NU pleca nicio retragere: produsul
     * disparea din magazin si ramanea la vanzare pe Trendyol.
     *
     * ⚠ GASIT LA ABOUT YOU, unde e acelasi defect si l-am masurat pe baza adevarata. Aici era
     * copiat, si nu l-a semnalat nimeni — n-a fost in niciun audit.
     *
     * ⚠ SE SCOATE FILTRUL, nu se muta pe alta coloana. La About You exista `style_key`, egal cu
     * `product_id`-ul nostru, deci filtrul se poate pastra; `trendyol_listings` n-are un asemenea
     * geaman, iar calea de stergere a UNUI produs nici nu filtreaza — `enqueueTrendyolSync` cere
     * listarea doar pentru `upsert`. Deci asta o aduce in acord cu ea, nu inventeaza altceva.
     *
     * ⚠ CE COSTA: un produs care n-a fost niciodata listat lasa un rand in coada, pe care
     * lucratorul il rezolva ca „sarit". La o curatenie in masa, cateva randuri degeaba — mult mai
     * ieftin decat marfa lasata la vanzare.
     */
    const rows = ids
      .map((id) => ({ business_id: businessId, product_id: null, offer_id: id, op: "delete", ...CERERE_NOUA }));
    if (rows.length === 0) return;
    const { error } = await admin.from("trendyol_sync_queue").upsert(rows, { onConflict: "business_id,offer_id,op" });
    if (error) throw error;
  } catch (e) {
    inghiteDarScrie("stergere-multe", businessId, e, { cate: productIds.length });
  }
}

/**
 * Termenul de expediere s-a schimbat: se duce la produsele DEJA listate.
 *
 * ═══ ⚠ FARA ASTA, SETAREA N-AR FACE NIMIC (27.08.2026) ═══
 *
 * `deliveryOption` pleaca in incarcatura de produs — dar aia se trimite doar cand produsul se
 * modifica din alt motiv. Comerciantul schimba termenul in setari, salveaza, si la Trendyol ramane
 * cel vechi pana cand atinge produsul din alta parte. Poate niciodata.
 *
 * ⚠ E CHIAR DEFECTUL REPARAT AZI LA ABOUT YOU, unde o schimbare de curs nu ajungea la preturi. Se
 * repeta fiindca e usor de scapat: setarea SE SALVEAZA, deci pare ca a mers.
 *
 * ⚠ `livrare`, NU `upsert`: `upsert` trimite continutul intreg si trece produsul din nou prin
 * revizuia lor. Termenul are ruta lui, `delivery-info-bulk-update`, care nu atinge continutul.
 * Aceeasi regula ca la eMAG: ruta cea mai usoara pentru intentia avuta.
 */
export function enqueueTrendyolLivrareMany(businessId: string, productIds: (string | null | undefined)[]): Promise<void> {
  return enqueueMany(businessId, productIds, "livrare");
}
