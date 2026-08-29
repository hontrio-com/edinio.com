import { createAdminClient } from "@/lib/supabase/admin";
import { logError } from "@/lib/error-logger";
import { bucatiDeIduri } from "@/lib/supabase/id-chunks";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/types/database.types";
import type { OlxConfig } from "./types";

// Enqueue an OLX sync for a product when the store has OLX connected with
// auto-sync on. Fire-and-forget — never throws into the caller (used from
// product/order actions, which must not break if OLX is down).
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
 *
 * ═══ ⚠ SI `catch` NU PRINDEA NIMIC (29.08.2026, noaptea) ═══
 *
 * Nota de mai sus era scrisa de mult si suna ca o problema rezolvata. Nu era: `supabase-js` NU
 * arunca la o eroare PostgREST, o INTOARCE in `{ error }`. Iar niciuna din cele trei functii nu-l
 * citea. Deci `try/catch`-ul de aici pazea doar caderile de retea ale clientului — tocmai cazul
 * rar —, iar un refuz al bazei se scurgea in tacere, exact ca inainte de nota.
 *
 * Cel mai scump drum:
 *
 *     produs sters din Edinio -> trebuie un DELETE la OLX
 *     punerea la coada pica (RLS, coloana, orice) -> `{ error }` intors, nimeni nu-l citeste
 *     produsul dispare din magazin
 *     -> anuntul ramane ACTIV la OLX, si nimic nu mai stie de el ❌
 *
 * ⚠ Si citirea configului la fel: inghitita, `config` iesea `{}`, `connected` iesea fals, si
 * functia se intorcea linistita — adica „magazinul n-are OLX" spus pe baza unei pene.
 */
function scrieEsecul(unde: string, businessId: string, e: unknown): void {
  void logError({
    action: `olx.queue.${unde}`,
    message: e instanceof Error ? e.message : "Eroare necunoscuta la punerea in coada",
    details: { businessId },
    businessId,
    severity: "error",
  });
}

/**
 * Ce se scrie peste un rand care exista deja.
 *
 * ═══ ⚠ SCRISORILE MOARTE NU INVIAU NICIODATA (30.08.2026, tarziu) ═══
 *
 * Dupa cinci incercari, elementul primeste `abandonat_la` si `revendica_din_coada` il ocoleste
 * (`and c.abandonat_la is null`). Bine — dar `upsert`-ul de aici nu atingea campurile alea, deci:
 *
 *     pret 100 -> OLX are o pana lunga -> cinci incercari -> abandonat
 *     peste doua zile: pret 120 -> `upsert` pe acelasi (business, offer, op)
 *     randul ramane abandonat -> pretul nou NU pleaca niciodata ❌
 *
 * Nici macar urmatoarea modificare a produsului nu-l readucea. Iar comentariul de la reconectare
 * spunea „daca omul reconecteaza maine, lucrarile pleaca singure" — si nu era adevarat.
 *
 * ⚠ O INTENTIE NOUA A OMULUI MERITA UN BUGET NOU. Aici ajung doar apasarile lui (salvare de produs,
 * comanda, import), nu reincercarile cronului — alea trec prin `scrieDacaNeschimbat`. Deci
 * resetarea nu poate face o roata perfecta din ceva ce esueaza mereu.
 *
 * ⚠ SI NU ATINGE `generation`: declansatorul `trg_generatie` o creste singur la orice update, deci
 * un lucrator care tocmai revendicase randul vechi nu mai poate scrie peste cel nou.
 */
const REINVIE = { attempts: 0, last_error: null, next_retry_at: null, abandonat_la: null } as const;

/**
 * Ceasul varstei porneste odata cu intentia, nu cu randul.
 *
 * Cronul abandoneaza o lucrare mai batrana de o zi (`VIATA_MAXIMA_MS`). Fara randul asta, un rand
 * vechi de o saptamana, reinviat de o apasare de azi, ar fi fost aruncat la prima trecere — adica
 * tocmai intentia proaspata ar fi murit cel mai repede.
 */
const CEAS_NOU = () => ({ created_at: new Date().toISOString() });

export async function enqueueOlxSync(
  businessId: string,
  productId: string | null,
  offerId: string,
  op: "upsert" | "delete",
): Promise<void> {
  try {
    const admin = createAdminClient();
    const { data: ss, error: eConfig } = await admin
      .from("store_settings").select("olx_config").eq("business_id", businessId).single();
    /* ⚠ O pana nu inseamna „magazinul n-are OLX": aruncam, ca `scrieEsecul` s-o vada. */
    if (eConfig) throw new Error(`configul OLX nu s-a putut citi: ${eConfig.message}`);
    const config = (ss?.olx_config as OlxConfig) ?? {};
    if (!config.connected || !config.refresh_token) return;
    if (config.auto_sync === false) return;
    const { error: eCoada } = await admin.from("olx_sync_queue").upsert(
      { business_id: businessId, product_id: productId, offer_id: offerId, op, ...REINVIE, ...CEAS_NOU() },
      { onConflict: "business_id,offer_id,op" },
    );
    /* ⚠ `supabase-js` NU arunca la o eroare PostgREST: o intoarce. Vezi nota de sus. */
    if (eCoada) throw new Error(`punerea in coada OLX a picat: ${eCoada.message}`);
  } catch (e) {
    scrieEsecul("coada", businessId, e);
  }
}

// Batch upsert-enqueue (one config check). Used after orders (stock changes on
// several products at once). Non-throwing.
export async function enqueueOlxSyncMany(businessId: string, productIds: (string | null | undefined)[]): Promise<void> {
  try {
    const ids = [...new Set(productIds.filter((x): x is string => !!x))];
    if (ids.length === 0) return;
    const admin = createAdminClient();
    const { data: ss, error: eConfig } = await admin
      .from("store_settings").select("olx_config").eq("business_id", businessId).single();
    if (eConfig) throw new Error(`configul OLX nu s-a putut citi: ${eConfig.message}`);
    const config = (ss?.olx_config as OlxConfig) ?? {};
    if (!config.connected || !config.refresh_token || config.auto_sync === false) return;
    const { error: eCoada } = await admin.from("olx_sync_queue").upsert(
      ids.map((id) => ({ business_id: businessId, product_id: id, offer_id: id, op: "upsert", ...REINVIE, ...CEAS_NOU() })),
      { onConflict: "business_id,offer_id,op" },
    );
    /* ⚠ `supabase-js` NU arunca la o eroare PostgREST: o intoarce. Vezi nota de sus. */
    if (eCoada) throw new Error(`punerea in coada OLX a picat: ${eCoada.message}`);
  } catch (e) {
    scrieEsecul("coada", businessId, e);
  }
}

/**
 * Retragerea IN MASA a produselor sterse.
 *
 * ═══ ⚠ ERAU 340 DE CHEMARI, FIECARE CU CITIREA EI DE CONFIG (27.08.2026) ═══
 *
 * Stergerea in masa punea la coada cate un element PE PRODUS, pe fiecare integrare:
 * `for (const id of ids) dupaRaspuns(() => enqueue…(businessId, null, id, "delete"))`. La 340 de
 * produse × 4 integrari inseamna 1360 de chemari, fiecare citind din nou setarile magazinului.
 *
 * ⚠ SI SE INTAMPLA DUPA RASPUNS, cu `after`, care tine instanta pana se termina. Peste durata
 * maxima a functiei, ce n-a apucat se TAIE — iar ce se taie sunt tocmai retragerile: produsul e
 * sters la noi si ramane la vanzare pe marketplace, tacut.
 *
 * O citire de config, un lot de scriere. Aceeasi treaba, de 340 de ori mai putine drumuri.
 *
 * ⚠ `product_id` E NULL, si nu din neglijenta: randul se scrie DUPA ce produsul a fost sters, deci
 * o legatura spre el ar arata catre un rand care nu mai exista. `offer_id` poarta id-ul, si el e
 * tot ce trebuie ca sa se stie ce se retrage.
 */
export async function enqueueOlxStergereMany(businessId: string, productIds: (string | null | undefined)[]): Promise<void> {
  try {
    const ids = [...new Set(productIds.filter((x): x is string => !!x))];
    if (ids.length === 0) return;
    const admin = createAdminClient();
    const { data: ss, error: eConfig } = await admin
      .from("store_settings").select("olx_config").eq("business_id", businessId).single();
    if (eConfig) throw new Error(`configul OLX nu s-a putut citi: ${eConfig.message}`);
    const config = (ss?.olx_config as OlxConfig) ?? {};
    if (!config.connected || !config.refresh_token || config.auto_sync === false) return;
    const { error: eCoada } = await admin.from("olx_sync_queue").upsert(
      ids.map((id) => ({ business_id: businessId, product_id: null, offer_id: id, op: "delete", ...REINVIE, ...CEAS_NOU() })),
      { onConflict: "business_id,offer_id,op" },
    );
    /* ⚠ `supabase-js` NU arunca la o eroare PostgREST: o intoarce. Vezi nota de sus. */
    if (eCoada) throw new Error(`punerea in coada OLX a picat: ${eCoada.message}`);
  } catch (e) {
    scrieEsecul("coada", businessId, e);
  }
}

/** „S-a scris" sau „nu stim daca s-a scris". Nimic altceva n-are voie sa ingaduie o stergere. */
export type RezultatRetragereOlx = { fel: "gata" } | { fel: "nesigur"; motiv: string };

/**
 * Scrie DURABIL intentia de retragere, INAINTE ca produsul sa fie sters din magazin.
 *
 * ═══ ⚠ STERGEREA UNUI PRODUS NU GARANTA RETRAGEREA DE PE OLX (30.08.2026, tarziu) ═══
 *
 * `enqueueOlxSync(..., "delete")` se chema DUPA stergere, si prin `dupaRaspuns` — adica dupa ce
 * raspunsul plecase deja la comerciant. Iar functia e dinadins non-throwing:
 *
 *     produsul se sterge din Edinio ✅
 *     punerea la coada pica -> se scrie in jurnal
 *     dar produsul a DISPARUT deja
 *     -> anuntul ramane ACTIV la OLX, si nimic nu mai stie de el ❌
 *
 * Marfa se vinde in continuare acolo, iar comerciantul afla cand primeste o comanda pentru ceva ce
 * nu mai are.
 *
 * ⚠ NU SE ASTEAPTA DUPA OLX — ar fi o legatura de retea intre „sterg un produs" si „raspunde
 * marketplace-ul". Se asteapta doar ca lucrarea sa fie SCRISA in coada; de acolo cronul o duce
 * singur, cu reincercari. Exact ce face deja eMAG.
 *
 * ⚠ SI SE DESPARTE „NU E CONECTAT" DE „N-AM PUTUT CITI". Puse sub acelasi `null`, o pana de o clipa
 * a bazei arata exact ca un magazin fara OLX — si stergerea merge inainte.
 *
 * ⚠ `auto_sync` STINS NU E UN MOTIV SA NU RETRAGEM. Comutatorul acela spune „nu trimite singur
 * schimbarile mele"; nu spune „lasa anunturile la vanzare dupa ce sterg produsul".
 */
export async function enqueueOlxRetragereInainteDeStergere(
  businessId: string,
  offerIds: string[],
): Promise<RezultatRetragereOlx> {
  const ids = [...new Set((offerIds ?? []).filter(Boolean))];
  if (ids.length === 0) return { fel: "gata" };
  try {
    const admin = createAdminClient();
    const { data: ss, error: eConfig } = await admin
      .from("store_settings").select("olx_config").eq("business_id", businessId).single();
    if (eConfig) {
      return { fel: "nesigur", motiv: "Configurarea OLX a magazinului nu s-a putut citi." };
    }
    const config = (ss?.olx_config as OlxConfig) ?? {};
    /* ⚠ Numai magazinul chiar FARA cont OLX sare peste: acolo n-are ce sa retraga. */
    if (!config.connected || !config.refresh_token) return { fel: "gata" };

    /*
     * ⚠ SI NUMAI PENTRU CE CHIAR ARE UN ANUNT. Un produs nelistat n-are ce retrage, iar un rand de
     * coada pentru el ar fi o lucrare care nu se poate incheia niciodata.
     */
    const cuAnunt: string[] = [];
    for (const bucata of bucatiDeIduri(ids)) {
      const { data, error } = await admin.from("olx_adverts")
        .select("offer_id").eq("business_id", businessId).in("offer_id", bucata);
      if (error) {
        return { fel: "nesigur", motiv: "Anunturile OLX ale produsului nu s-au putut citi." };
      }
      for (const r of (data ?? []) as { offer_id: string }[]) cuAnunt.push(r.offer_id);
    }
    if (cuAnunt.length === 0) return { fel: "gata" };

    for (const bucata of bucatiDeIduri(cuAnunt)) {
      const { error } = await admin.from("olx_sync_queue").upsert(
        bucata.map((id) => ({ business_id: businessId, product_id: null, offer_id: id, op: "delete", ...REINVIE, ...CEAS_NOU() })),
        { onConflict: "business_id,offer_id,op" },
      );
      if (error) return { fel: "nesigur", motiv: `Retragerea nu s-a putut pune in coada: ${error.message}` };
    }
    return { fel: "gata" };
  } catch (e) {
    /*
     * ⚠ AICI NU SE INGHITE, spre deosebire de restul fisierului: cine cheama trebuie sa AFLE, ca sa
     * nu stearga produsul. O punere la coada ratata e o paguba mica; un anunt ramas viu fara produs
     * e una care se vede in comenzi.
     */
    scrieEsecul("retragereInainteDeStergere", businessId, e);
    return { fel: "nesigur", motiv: e instanceof Error ? e.message : "Eroare necunoscuta." };
  }
}

/**
 * Aduce inapoi la lucru tot ce a fost abandonat pentru un magazin.
 *
 * ═══ O SESIUNE EXPIRATA OMOARA TOATA COADA, SI RECONECTAREA N-O INVIA (31.08.2026) ═══
 *
 * `abandonat_la` scoate randul din revendicare pentru totdeauna. Iar cauza cea mai obisnuita nu e
 * un produs stricat, ci sesiunea:
 *
 *     tokenul expira intr-o dimineata
 *     fiecare lucrare din coada esueaza de cinci ori, in cincisprezece minute
 *     tot ce avea magazinul de trimis devine scrisoare moarta
 *     seara omul reconecteaza contul — si NIMIC nu reporneste
 *     -> preturile si stocurile raman vechi la OLX pana cand atinge fiecare produs pe rand
 *
 * ⚠ SE INVIE TOT, fara sa alegem dupa motiv. Motivul sta doar in textul lui `last_error`, iar
 * deosebirile luate din text sunt chiar greseala pe care o ocolim peste tot: un „429" si un
 * „categorie nemapata" arata la fel unei potriviri de sir. Ce nu mai merge va muri iar, la fel de
 * repede, si cu acelasi motiv scris.
 *
 * ⚠ `created_at` REPORNESTE: ceasul de varsta al cronului (`VIATA_MAXIMA_MS`) masoara asteptarea
 * INTENTIEI. Fara asta, o coada moarta de o saptamana s-ar reabandona la prima trecere.
 *
 * ⚠ `revendicat_pana` se sterge: un rand abandonat nu poate fi tinut de nimeni, fiindca
 * `revendica_din_coada` il ocoleste — deci marcajul ramas de la ultima incercare doar l-ar
 * intarzia degeaba.
 */
export async function invieScrisorileMoarteOlx(
  admin: SupabaseClient<Database>, businessId: string,
): Promise<{ ok: true; reluate: number } | { ok: false; error: string }> {
  const { data, error } = await admin
    .from("olx_sync_queue")
    .update({
      attempts: 0, last_error: null, next_retry_at: null, abandonat_la: null,
      revendicat_pana: null, created_at: new Date().toISOString(),
    } as never)
    .eq("business_id", businessId)
    /* ⚠ `not(..., "is", null)` — pe o coloana nulabila, orice filtru de lista sare peste NULL. */
    .not("abandonat_la", "is", null)
    .select("id");
  if (error) return { ok: false, error: error.message };
  return { ok: true, reluate: data?.length ?? 0 };
}
