// Shared OLX sync engine — used by the cron drain (api/cron/olx-sync) and by
// the direct "publish now" server action, so both paths behave identically.
//
// Reconciliation rules per product:
//  - product deleted            -> deactivate + DELETE advert, drop local row
//  - product inactive / stoc 0  -> deactivate advert (kept on OLX, reactivable)
//  - product sellable           -> create or update advert; reactivate if it was
//                                  deactivated/expired; `limited` means the OLX
//                                  free quota is exhausted (buy packet + activate)

import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/types/database.types";
import { ensureMerchantToken } from "./oauth";
import {
  advertCommand, createAdvert, deleteAdvert, getAdvert, isOlxError, listAdverts, updateAdvert,
  type OlxResult,
} from "./client";
import { isProductSellable, toOlxAdvertBody, type MappableBusiness, type MappableProduct } from "./mapping";
import type { OlxAdvert, OlxConfig } from "./types";
import { logError } from "@/lib/error-logger";

type Db = SupabaseClient<Database>;

export const PRODUCT_FIELDS =
  "id, name, slug, description, price, compare_at_price, images, category, is_active, track_inventory, stock_quantity";

export interface OlxSyncContext {
  token: string;
  config: OlxConfig;
  business: MappableBusiness;
}

export interface OlxAdvertRow {
  id: string;
  olx_advert_id: number | null;
  status: string;
  offer_id: string;
  /**
   * Cine a cerut dezactivarea, cand starea e `removed_by_user`.
   *
   * ⚠ Aceeasi stare se scrie si la apasarea omului, si cand stingem noi anuntul fiindca stocul s-a
   * terminat. Fara deosebirea asta, regula „ce a hotarat omul nu se desface singur" ingheata si
   * dezactivarile automate — iar marfa se intoarce pe raft cu anuntul stins.
   *
   * ⚠ `null` la randurile de dinaintea migratiei, si se citeste prudent: ca o hotarare a omului.
   */
  dezactivat_de: "om" | "stoc" | "produs-inactiv" | "inainte-de-stergere" | null;
  /**
   * Clipa in care OMUL a cerut stergerea anuntului.
   *
   * ⚠ Cat timp e scrisa, sincronizarea nu recreeaza anuntul — altfel prima comanda venita de pe
   * alt marketplace l-ar readuce la OLX, impotriva a ceea ce ii promite butonul. Se sterge din
   * „Postează pe OLX", adica tot de catre om.
   */
  sters_de_om_la: string | null;
}

export type SyncOutcome =
  | { ok: true; action: "created" | "updated" | "deactivated" | "activated" | "deleted" | "skipped"; status?: string; url?: string | null }
  | { ok: false; permanent: boolean; error: string };

export function pause(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

/**
 * De ce nu se poate lucra acum cu OLX.
 *
 * ═══ ⚠ `null` INSEMNA CINCI LUCRURI DEOSEBITE (29.08.2026, noaptea) ═══
 *
 * `loadOlxContext` intorcea `null` si pentru „magazinul nu e conectat", si pentru „OLX n-a
 * raspuns la reimprospatarea tokenului", si pentru „baza a picat". Iar cronul citea `null` ca
 * „deconectat" si STERGEA lucrarile revendicate:
 *
 *     OLX are o pana de retea de cinci secunde
 *     reimprospatarea tokenului pica -> `null`
 *     cronul sterge definitiv elementele din coada ❌
 *     -> pretul si stocul raman vechi la OLX, pana cand omul mai atinge produsul
 *
 * ⚠ Deosebirea nu e un rafinament, e chiar hotararea: numai „deconectat" indreptateste stergerea.
 */
export type RezultatContext =
  | { stare: "gata"; ctx: OlxSyncContext }
  /** Magazinul chiar n-are OLX legat: lucrarile ramase n-au unde pleca. */
  | { stare: "deconectat" }
  /** Sesiunea a murit si cere mana omului. Lucrarile ASTEAPTA, nu se arunca. */
  | { stare: "cere-reconectare"; motiv: string }
  /** O pana de-o clipa: retea, OLX, baza. Se reia. */
  | { stare: "trecatoare"; motiv: string };

export async function loadOlxContext(admin: Db, businessId: string): Promise<RezultatContext> {
  const { data: ss, error: eConfig } = await admin
    .from("store_settings").select("olx_config").eq("business_id", businessId).single();
  /* ⚠ O citire picata NU inseamna „nu e conectat": ar duce la stergerea cozii pentru o pana. */
  if (eConfig) return { stare: "trecatoare", motiv: `configul nu s-a putut citi: ${eConfig.message}` };
  const config = (ss?.olx_config as OlxConfig) ?? {};
  if (!config.connected || !config.refresh_token) return { stare: "deconectat" };

  const tok = await ensureMerchantToken(admin, businessId, config);
  if ("error" in tok) {
    /* ⚠ `needsReconnect` e chiar deosebirea pe care ei ne-o spun: `invalid_grant` fata de restul. */
    return tok.needsReconnect
      ? { stare: "cere-reconectare", motiv: tok.error }
      : { stare: "trecatoare", motiv: tok.error };
  }

  const { data: biz, error: eBiz } = await admin
    .from("businesses").select("slug, custom_domain, store_name, business_name").eq("id", businessId).single();
  if (eBiz) return { stare: "trecatoare", motiv: `magazinul nu s-a putut citi: ${eBiz.message}` };
  if (!biz) return { stare: "deconectat" };
  return { stare: "gata", ctx: { token: tok.token, config: tok.config, business: biz as MappableBusiness } };
}

// Retryable = network, rate-limit, auth hiccup, 5xx. Permanent = validation.
function classify(res: { error: string; status: number; validation?: unknown[] }): { permanent: boolean } {
  if (res.status === 400) return { permanent: true };
  return { permanent: false };
}

function advertPatch(advert: OlxAdvert, now: string) {
  return {
    olx_advert_id: advert.id,
    status: advert.status || "new",
    olx_url: advert.url ?? null,
    valid_to: advert.valid_to ? new Date(advert.valid_to.replace(" ", "T") + "+03:00").toISOString() : null,
    error: null,
    last_synced_at: now,
    last_status_at: now,
    updated_at: now,
  };
}

/**
 * ⚠ „Nu exista rand" si „n-am putut citi randul" NU sunt acelasi lucru.
 *
 * Eroarea de citire era inghitita, iar `null` insemna „produsul nu e publicat" —
 * deci un timeout de o secunda pe SELECT, intr-un cron care ruleaza DIN MINUT IN
 * MINUT, facea un produs DEJA publicat sa arate ca nepublicat si il trimitea pe
 * ramura de CREARE: al doilea anunt viu pe OLX. Si mai rau, upsertul de dupa
 * (`onConflict: business_id,offer_id`) suprascria `olx_advert_id` cu anuntul NOU,
 * deci primul — cel cu istoric si mesaje — ramanea orfan.
 *
 * `null` inseamna acum strict „nu exista"; imposibilitatea citirii ARUNCA, iar
 * apelantul o raporteaza ca esec temporar.
 */
class CitireOlxEsuata extends Error {}

async function getRow(admin: Db, businessId: string, offerId: string): Promise<OlxAdvertRow | null> {
  const { data, error } = await admin
    .from("olx_adverts").select("id, olx_advert_id, status, offer_id, sters_de_om_la, dezactivat_de")
    .eq("business_id", businessId).eq("offer_id", offerId).maybeSingle();
  if (error) throw new CitireOlxEsuata(`randul OLX nu s-a putut citi: ${error.message}`);
  return (data as OlxAdvertRow) ?? null;
}

async function saveError(admin: Db, businessId: string, offerId: string, productId: string | null, message: string): Promise<void> {
  const now = new Date().toISOString();
  await admin.from("olx_adverts").upsert(
    {
      business_id: businessId, offer_id: offerId, product_id: productId,
      status: "error", error: message.slice(0, 500), updated_at: now,
    } as never,
    { onConflict: "business_id,offer_id" },
  );
}

// ── Delete / deactivate / activate ──────────────────────────────────────────────

async function removeRemote(admin: Db, ctx: OlxSyncContext, businessId: string, row: OlxAdvertRow | null): Promise<SyncOutcome> {
  if (!row) return { ok: true, action: "skipped" };
  if (row.olx_advert_id) {
    /*
     * ═══ ⚠ PIATRA SE PUNEA SI CAND ANUNTUL RAMANEA VIU (30.08.2026) ═══
     *
     * OLX refuza sa stearga un anunt ACTIV: intoarce `400 Invalid status`. Iar `classify` socoteste
     * orice `400` drept permanent, deci codul trecea mai departe si scria local „șters de tine":
     *
     *     dezactivarea de mai jos pica (rezultatul ei nici nu se citea)
     *     DELETE -> 400 „advert is active"
     *     `permanent` -> se merge mai departe -> local: sters ✅
     *     la OLX: anunt ACTIV, care se vinde in continuare ❌
     *
     * Si de-acum e cu atat mai rau: piatra il si opreste sa fie recreat, deci nimic nu-l mai atinge.
     *
     * ⚠ NUMAI DOUA RASPUNSURI INDREPTATESC PIATRA: stergerea reusita, si `404` (nu mai era acolo).
     * Orice altceva inseamna „poate e inca viu", si atunci se reia — un anunt care se sterge la a
     * doua trecere costa un minut; unul crezut sters, dar viu, se vinde mai departe.
     */
    if (["active", "new", "unconfirmed", "limited"].includes(row.status)) {
      /* ⚠ Si rezultatul dezactivarii se citeste: e chiar cauza celui mai probabil `400` de mai jos. */
      const dez = await advertCommand(ctx.token, row.olx_advert_id, "deactivate", { sAVandut: false });
      if (isOlxError(dez) && dez.status !== 400) {
        /* `400` aici inseamna de obicei „deja inactiv" — se merge mai departe la stergere. */
        return { ok: false, permanent: false, error: `Nu am putut dezactiva anuntul inainte de stergere: ${dez.error}` };
      }
    }
    const res = await deleteAdvert(ctx.token, row.olx_advert_id);
    if (isOlxError(res) && res.status !== 404) {
      return {
        ok: false, permanent: false,
        error: `OLX nu a sters anuntul (${res.status}): ${res.error}`,
      };
    }
  }
  /*
   * ═══ ⚠ RANDUL RAMANE, CU CLIPA HOTARARII (29.08.2026, seara) ═══
   *
   * Sters, randul lua cu el singura urma ca omul a cerut stergerea. Iar coada OLX n-are garda
   * „numai produsele deja listate" (About You si Trendyol o au), si se umple dupa FIECARE editare
   * de pret sau stoc — inclusiv dupa fiecare comanda venita de pe alt marketplace. Deci:
   *
   *     omul apasa „Șterge anunțul" -> anuntul dispare la OLX, randul local se sterge
   *     o comanda de pe Trendyol scade stocul -> produsul intra in coada OLX cu `upsert`
   *     `getRow` nu gaseste nimic -> ramura de CREARE -> anuntul REAPARE la OLX ❌
   *
   * ⚠ Iar butonul ii promite textual „Acțiunea nu poate fi anulată". Deci nu doar ca se desfacea,
   * se desfacea impotriva a ceea ce ii spuneam.
   *
   * ⚠ IESIREA E SCRISA SI EXISTA DEJA: „Postează pe OLX" sterge urma. Hotararea se poate schimba
   * oricand — dar de catre OM.
   */
  const { error: eUrma } = await admin.from("olx_adverts")
    .update({
      olx_advert_id: null, status: "sters_de_om", url: null, error: null,
      sters_de_om_la: new Date().toISOString(), updated_at: new Date().toISOString(),
    } as never)
    .eq("id", row.id);
  if (eUrma) {
    /* ⚠ Fara urma scrisa, trecerea urmatoare recreeaza anuntul. Se reia, nu se raporteaza reusit. */
    return { ok: false, permanent: false, error: `Anuntul s-a sters la OLX, dar nu am putut tine minte asta: ${eUrma.message}` };
  }
  return { ok: true, action: "deleted" };
}

/** Cine a cerut dezactivarea. Vezi migratia 2026-12-19: `removed_by_user` singur nu spune. */
export type SursaDezactivarii = "om" | "stoc" | "produs-inactiv" | "inainte-de-stergere";

async function deactivateRemote(
  admin: Db, ctx: OlxSyncContext, row: OlxAdvertRow, sursa: SursaDezactivarii,
): Promise<SyncOutcome> {
  if (!row.olx_advert_id) return { ok: true, action: "skipped" };
  /* ⚠ `sAVandut: false`: niciunul din motivele noastre nu e o vanzare. Vezi `advertCommand`. */
  const res = await advertCommand(ctx.token, row.olx_advert_id, "deactivate", { sAVandut: false });
  const now = new Date().toISOString();
  if (!isOlxError(res)) {
    await admin.from("olx_adverts")
      .update({ status: "removed_by_user", dezactivat_de: sursa, error: null, last_status_at: now, updated_at: now })
      .eq("id", row.id);
    return { ok: true, action: "deactivated", status: "removed_by_user" };
  }
  // 400 = deja inactiv (invalid status) — force a status refresh instead of failing.
  if (res.status === 400) {
    await admin.from("olx_adverts").update({ last_status_at: null, updated_at: now }).eq("id", row.id);
    return { ok: true, action: "skipped" };
  }
  return { ok: false, permanent: false, error: res.error };
}

async function activateRemote(admin: Db, ctx: OlxSyncContext, row: OlxAdvertRow): Promise<SyncOutcome> {
  if (!row.olx_advert_id) return { ok: true, action: "skipped" };
  const res = await advertCommand(ctx.token, row.olx_advert_id, "activate");
  const now = new Date().toISOString();
  if (!isOlxError(res)) {
    // Activation may pass through moderation again — poll will settle it.
    await admin.from("olx_adverts")
      .update({ status: "new", error: null, last_status_at: null, updated_at: now })
      .eq("id", row.id);
    return { ok: true, action: "activated", status: "new" };
  }
  if (res.status === 400 && /limit|packet|pachet/i.test(res.error)) {
    await admin.from("olx_adverts").update({ status: "limited", updated_at: now }).eq("id", row.id);
    return { ok: false, permanent: true, error: "Cota de anunturi gratuite este epuizata. Cumpara un pachet OLX si activeaza anuntul." };
  }
  const { permanent } = classify(res);
  return { ok: false, permanent, error: res.error };
}

// ── Upsert (create/update + stock reconciliation) ───────────────────────────────

async function upsertRemote(
  admin: Db, ctx: OlxSyncContext, businessId: string,
  offerId: string, product: MappableProduct | null,
): Promise<SyncOutcome> {
  const row = await getRow(admin, businessId, offerId);

  // Product gone (or no longer loadable) -> remove the advert entirely.
  if (!product) return removeRemote(admin, ctx, businessId, row);

  /*
   * ⚠ CE A STERS OMUL NU SE RECREEAZA SINGUR. Vezi nota din `removeRemote`: coada se umple dupa
   * fiecare editare de pret sau stoc, deci fara paza asta prima comanda de pe alt marketplace ar
   * fi readus anuntul la OLX. Urma se sterge din „Postează pe OLX", adica de catre om.
   */
  if (row?.sters_de_om_la) return { ok: true, action: "skipped" };

  // Inactive or out of stock -> deactivate but keep the advert for later.
  if (!isProductSellable(product)) {
    if (row?.olx_advert_id && ["active", "new", "unconfirmed"].includes(row.status)) {
      /*
       * ⚠ SE SCRIE DE CE, nu doar CA. Aceeasi stare `removed_by_user` se scria si aici, si la
       * apasarea omului — iar regula „ce a hotarat omul nu se desface singur" inghetase si
       * dezactivarile automate: stocul se intorcea, anuntul ramanea stins.
       */
      return deactivateRemote(admin, ctx, row, product.is_active ? "stoc" : "produs-inactiv");
    }
    return { ok: true, action: "skipped" };
  }

  const entry = product.category ? ctx.config.category_map?.[product.category] : undefined;
  if (!entry) {
    if (row) await saveError(admin, businessId, offerId, product.id, "Categoria produsului nu este mapata la o categorie OLX.");
    return row
      ? { ok: false, permanent: true, error: "Categoria produsului nu este mapata la o categorie OLX." }
      : { ok: true, action: "skipped" };
  }

  const body = toOlxAdvertBody(ctx.business, product, ctx.config, entry);
  const now = new Date().toISOString();

  if (row?.olx_advert_id) {
    const res: OlxResult<OlxAdvert> = await updateAdvert(ctx.token, row.olx_advert_id, body);
    if (isOlxError(res)) {
      if (res.status === 404) {
        // Advert vanished on OLX (removed manually) — recreate on next attempt.
        await admin.from("olx_adverts").update({ olx_advert_id: null, updated_at: now }).eq("id", row.id);
        return { ok: false, permanent: false, error: "Anuntul nu mai exista pe OLX - va fi recreat." };
      }
      const { permanent } = classify(res);
      if (permanent) await saveError(admin, businessId, offerId, product.id, res.error);
      return { ok: false, permanent, error: res.error };
    }
    const advert = res.data ?? ({ id: row.olx_advert_id, status: row.status } as OlxAdvert);
    await admin.from("olx_adverts").upsert(
      { business_id: businessId, offer_id: offerId, product_id: product.id, ...advertPatch(advert, now) } as never,
      { onConflict: "business_id,offer_id" },
    );
    /*
     * ⚠ SE REACTIVEAZA NUMAI CE A EXPIRAT SINGUR (29.08.2026, seara).
     *
     * `removed_by_user` inseamna chiar „omul a apasat «Dezactivează»" — iar ecranul are un buton
     * „Activează" separat, tocmai pentru intoarcere. Reactivat automat la prima editare de pret,
     * butonul acela n-avea niciun rost, si hotararea omului tinea pana la urmatoarea comanda.
     *
     * ⚠ `outdated` E ALTCEVA: acolo OLX a expirat anuntul singur, si reactivarea automata e chiar
     * ce trebuie. Deosebirea nu e cum arata starea, ci CINE a hotarat-o.
     */
    /*
     * ⚠ SI CE AM STINS NOI SE APRINDE TOT DE NOI. `outdated` inseamna ca OLX l-a expirat singur.
     * `removed_by_user` cu `dezactivat_de` deosebit de `om` inseamna ca l-am stins NOI, fiindca
     * stocul se terminase sau produsul era inactiv — iar acum produsul e iar vandabil, deci motivul
     * a disparut. Numai apasarea OMULUI ramane in picioare pana se razgandeste el.
     *
     * ⚠ `null` (randuri de dinaintea migratiei) se citeste ca „om": greseala ieftina e un anunt
     * care asteapta o apasare, nu unul care porneste singur cand n-ar trebui.
     */
    const stareaAcum = advert.status || row.status;
    const stinsDeNoi = stareaAcum === "removed_by_user"
      && row.dezactivat_de != null && row.dezactivat_de !== "om";
    if (stareaAcum === "outdated" || stinsDeNoi) {
      const freshRow = await getRow(admin, businessId, offerId);
      if (freshRow) await activateRemote(admin, ctx, freshRow);
    }
    return { ok: true, action: "updated", status: advert.status, url: advert.url ?? null };
  }

  /*
   * ═══ INTAI INTREBAM OLX DACA ANUNTUL EXISTA DEJA ═══
   *
   * `createAdvert` e singurul loc din tot marketplace-ul unde efectul e o CREARE
   * UNICA, cu id-ul venit de la furnizor — iar singurul lui martor, `olx_advert_id`,
   * se scria printr-un upsert local caruia nu i se citea eroarea. Deci: anuntul se
   * crea la OLX, scrierea locala pica, iar la minutul urmator nu exista
   * `olx_advert_id` si se crea AL DOILEA anunt. Acelasi lucru se intampla si dupa o
   * deconectare/reconectare, care sterge randurile locale si lasa anunturile vii.
   *
   * `external_id` pleaca de mult la fiecare creare (`toOlxAdvertBody`), iar OLX
   * accepta filtrarea dupa el — doar ca nimeni nu intreba. Cu intrebarea asta,
   * anuntul ramas orfan e ADOPTAT in loc sa fie dublat, si se repara si istoricul,
   * nu doar viitorul.
   *
   * ⚠ NU s-a folosit aici registrul de operatii externe cu cheia pe produs: coada
   * OLX are `upsert` ca ramura implicita si se umple dupa FIECARE editare de pret
   * sau stoc, deci o cheie pe produs ar da `deja` la a doua trecere si ar ingheta
   * tacut pretul si stocul pe marketplace — exact motivul pentru care cablarea
   * marketplace-ului sub registru a fost scoasa (commit a0724b3).
   */
  const existente = await listAdverts(ctx.token, { external_id: product.id, limit: 20 });
  if (!isOlxError(existente)) {
    /*
     * ⚠ NU se ia „primul din lista". Se ia primul care trece DOUA probe.
     *
     * 1. `external_id` sa fie CHIAR al produsului nostru. Daca OLX ignora filtrul
     *    (parametru nesuportat, alt inteles), raspunsul e primele anunturi ale
     *    contului — si am fi legat de produs un anunt strain, apoi l-am fi
     *    suprascris cu datele lui la trecerea urmatoare. Cand `external_id` lipseste
     *    din raspuns, nu adoptam: mai bine un duplicat decat un anunt strain.
     * 2. Anuntul sa fie VIU. Un anunt sters, expirat sau scos de moderator adoptat
     *    inseamna produs care nu mai revine niciodata pe OLX: randul local ar avea
     *    `olx_advert_id`, deci ramura de creare n-ar mai fi atinsa, iar cea de
     *    actualizare ar lovi un anunt mort. `outdated`/`removed_by_user` sunt
     *    reactivabile si se adopta — pentru ele exista deja `activateRemote`.
     */
    const MOARTE = ["removed_by_moderator", "moderated", "blocked", "deleted", "removed"];
    const candidati = (existente.data ?? []).filter((a) => {
      if (!a?.id) return false;
      const ext = (a as unknown as { external_id?: unknown }).external_id;
      if (typeof ext !== "string" || ext !== product.id) return false;
      return !MOARTE.includes(String(a.status ?? "").toLowerCase());
    });
    const gasit = candidati[0];
    if (gasit?.id) {
      const { error: eAdoptare } = await admin.from("olx_adverts").upsert(
        { business_id: businessId, offer_id: offerId, product_id: product.id, ...advertPatch(gasit, now) } as never,
        { onConflict: "business_id,offer_id" },
      );
      if (eAdoptare) {
        return { ok: false, permanent: false, error: `anuntul OLX ${gasit.id} exista deja, dar nu s-a putut lega local: ${eAdoptare.message}` };
      }
      await logError({
        action: "olx.anuntAdoptat",
        message: `Anuntul OLX ${gasit.id} exista deja pentru acest produs si a fost legat inapoi, in loc sa se creeze un duplicat.`,
        details: { businessId, offerId, productId: product.id, advertId: gasit.id, status: gasit.status },
        businessId, severity: "warning",
      });
      /*
       * Corpul proaspat pleaca ACUM, nu „la trecerea urmatoare a cozii": elementul
       * din coada se consuma chiar cu raspunsul asta, deci nu exista o trecere
       * urmatoare care sa duca pretul si stocul. Fara randurile de mai jos,
       * adoptarea ar fi inghetat produsul pe valorile vechi de pe OLX.
       */
      const dupaAdoptare: OlxResult<OlxAdvert> = await updateAdvert(ctx.token, gasit.id, body);
      if (isOlxError(dupaAdoptare)) {
        const { permanent } = classify(dupaAdoptare);
        return { ok: false, permanent, error: dupaAdoptare.error };
      }
      const proaspat = dupaAdoptare.data ?? gasit;
      await admin.from("olx_adverts").upsert(
        { business_id: businessId, offer_id: offerId, product_id: product.id, ...advertPatch(proaspat, now) } as never,
        { onConflict: "business_id,offer_id" },
      );
      return { ok: true, action: "updated", status: proaspat.status, url: proaspat.url ?? null };
    }
  }
  /*
   * ═══ ⚠ PAZA ANTI-DUPLICAT CADEA DESCHIS (30.08.2026) ═══
   *
   * Comentariul de aici spunea ca un esec al interogarii nu trebuie sa opreasca publicarea, „ca sa
   * nu blocheze la fiecare hopa de retea". Suna cuminte, si e chiar pe dos: interogarea asta e
   * SINGURA paza impotriva duplicatelor, iar ea se strica exact atunci cand duplicatul e cel mai
   * probabil — cand OLX are probleme.
   *
   *     POST-ul de acum un minut a REUSIT la OLX, dar scrierea locala a picat
   *     se reia: `GET /adverts?external_id=…` da timeout
   *     „nu blocam publicarea" -> POST din nou
   *     -> DOUA anunturi pentru acelasi produs, si numai unul legat la noi ❌
   *
   * ⚠ CREAREA E SINGURUL EFECT DIN TOT MARKETPLACE-UL CARE NU SE POATE DESFACE de la noi: al doilea
   * anunt are alt id, nu e in `olx_adverts`, si nimeni nu-l mai gaseste vreodata. Fata de asta, o
   * publicare intarziata cu un minut nu e nici macar o paguba.
   *
   * ⚠ Deci: daca nu putem VERIFICA, nu CREAM. Se reia, si atunci se verifica din nou.
   */
  if (isOlxError(existente)) {
    return {
      ok: false, permanent: false,
      error: `Nu am putut verifica daca anuntul exista deja la OLX (${existente.status}): ${existente.error}`,
    };
  }

  const res: OlxResult<OlxAdvert> = await createAdvert(ctx.token, body);
  if (isOlxError(res)) {
    const { permanent } = classify(res);
    if (permanent) await saveError(admin, businessId, offerId, product.id, res.error);
    return { ok: false, permanent, error: res.error };
  }
  const advert = res.data;
  if (!advert?.id) {
    await saveError(admin, businessId, offerId, product.id, "Raspuns OLX fara ID de anunt.");
    return { ok: false, permanent: true, error: "Raspuns OLX fara ID de anunt." };
  }
  const { error: eLegatura } = await admin.from("olx_adverts").upsert(
    { business_id: businessId, offer_id: offerId, product_id: product.id, ...advertPatch(advert, now) } as never,
    { onConflict: "business_id,offer_id" },
  );
  /*
   * ⚠ ANUNTUL EXISTA LA OLX. Daca legatura nu s-a scris, id-ul lui nu are voie sa
   * dispara in tacere: fara el nimeni nu mai poate lega anuntul de produs, iar
   * trecerea urmatoare l-ar recrea. Adoptarea de mai sus il va regasi dupa
   * `external_id`, dar numai daca cineva stie ce s-a intamplat.
   */
  if (eLegatura) {
    await logError({
      action: "olx.anuntNelegat",
      message: `Anuntul OLX ${advert.id} a fost creat, dar nu s-a putut lega de produs: ${eLegatura.message}`,
      details: { businessId, offerId, productId: product.id, advertId: advert.id, url: advert.url },
      businessId, severity: "critical",
    });
    return { ok: false, permanent: false, error: `anuntul a fost creat, dar legatura locala a esuat: ${eLegatura.message}` };
  }
  return { ok: true, action: "created", status: advert.status, url: advert.url ?? null };
}

// ── Public entrypoints ──────────────────────────────────────────────────────────

export interface OlxQueueItem {
  id: string;
  business_id: string;
  product_id: string | null;
  offer_id: string;
  op: string;
  attempts: number;
}

/**
 * O citire picata devine esec TEMPORAR, nu exceptie scapata din cron.
 *
 * `getRow` arunca acum in loc sa raporteze „nu exista" (vezi acolo de ce). Fara
 * invelisul asta, exceptia ar iesi din `processQueueItem` si ar opri intreaga
 * trecere a cronului — adica ar transforma o reparatie intr-o pana mai mare.
 * `permanent: false` inseamna reincercare, deci un hop de retea nu scoate
 * produsul din coada.
 */
async function faraCitiriPicate(fn: () => Promise<SyncOutcome>): Promise<SyncOutcome> {
  try {
    return await fn();
  } catch (e) {
    if (e instanceof CitireOlxEsuata) return { ok: false, permanent: false, error: e.message };
    throw e;
  }
}

export async function processQueueItem(
  admin: Db, ctx: OlxSyncContext, item: OlxQueueItem, product: MappableProduct | null,
): Promise<SyncOutcome> {
  return faraCitiriPicate(() => processQueueItemIntern(admin, ctx, item, product));
}

async function processQueueItemIntern(
  admin: Db, ctx: OlxSyncContext, item: OlxQueueItem, product: MappableProduct | null,
): Promise<SyncOutcome> {
  switch (item.op) {
    case "delete":
      return removeRemote(admin, ctx, item.business_id, await getRow(admin, item.business_id, item.offer_id));
    case "deactivate": {
      const row = await getRow(admin, item.business_id, item.offer_id);
      return row ? deactivateRemote(admin, ctx, row, "om") : { ok: true, action: "skipped" };
    }
    case "activate": {
      const row = await getRow(admin, item.business_id, item.offer_id);
      return row ? activateRemote(admin, ctx, row) : { ok: true, action: "skipped" };
    }
    default:
      return upsertRemote(admin, ctx, item.business_id, item.offer_id, product);
  }
}

// Direct (synchronous) publish used by the dashboard's per-product actions.
export async function syncProductNow(admin: Db, ctx: OlxSyncContext, businessId: string, productId: string): Promise<SyncOutcome> {
  return faraCitiriPicate(async () => {
    const { data, error } = await admin
      .from("products").select(PRODUCT_FIELDS).eq("id", productId).eq("business_id", businessId).maybeSingle();
    /*
     * ⚠ Si aici citirea era oarba, si e mai grava decat pare: `product = null`
     * inseamna, la `upsertRemote`, „produsul nu mai exista" -> STERGE anuntul de pe
     * OLX. Un timeout de o secunda ar fi retras un anunt viu.
     */
    if (error) throw new CitireOlxEsuata(`produsul nu s-a putut citi: ${error.message}`);
    return upsertRemote(admin, ctx, businessId, productId, (data as MappableProduct | null) ?? null);
  });
}

export async function deactivateProductNow(admin: Db, ctx: OlxSyncContext, businessId: string, productId: string): Promise<SyncOutcome> {
  return faraCitiriPicate(async () => {
    const row = await getRow(admin, businessId, productId);
    return row ? deactivateRemote(admin, ctx, row, "om") : { ok: true, action: "skipped" };
  });
}

export async function activateProductNow(admin: Db, ctx: OlxSyncContext, businessId: string, productId: string): Promise<SyncOutcome> {
  return faraCitiriPicate(async () => {
    const row = await getRow(admin, businessId, productId);
    return row ? activateRemote(admin, ctx, row) : { ok: true, action: "skipped" };
  });
}

export async function deleteAdvertNow(admin: Db, ctx: OlxSyncContext, businessId: string, offerId: string): Promise<SyncOutcome> {
  return faraCitiriPicate(async () => removeRemote(admin, ctx, businessId, await getRow(admin, businessId, offerId)));
}

// Refresh one advert's status from OLX (used by the cron poll).
export async function refreshAdvertStatus(
  admin: Db, ctx: OlxSyncContext, rowId: string, olxAdvertId: number,
): Promise<void> {
  const now = new Date().toISOString();
  const res = await getAdvert(ctx.token, olxAdvertId);
  if (isOlxError(res)) {
    if (res.status === 404) {
      // Removed on OLX directly — reflect locally.
      await admin.from("olx_adverts").delete().eq("id", rowId);
      return;
    }
    await admin.from("olx_adverts").update({ last_status_at: now }).eq("id", rowId);
    return;
  }
  const advert = res.data;
  await admin.from("olx_adverts").update({
    status: advert.status || "new",
    olx_url: advert.url ?? null,
    valid_to: advert.valid_to ? new Date(advert.valid_to.replace(" ", "T") + "+03:00").toISOString() : null,
    last_status_at: now,
    updated_at: now,
  }).eq("id", rowId);
}
