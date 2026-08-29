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
  advertCommand, createAdvert, deleteAdvert, getAdvert, getAdvertStatistics, getModerationReason,
  isOlxError, listAdverts, updateAdvert,
  type OlxResult,
} from "./client";
import { isProductSellable, toOlxAdvertBody, type MappableBusiness, type MappableProduct } from "./mapping";
import type { GpsrConfig } from "@/lib/gpsr";
import type { OlxAdvert, OlxConfig } from "./types";
import { logError } from "@/lib/error-logger";

type Db = SupabaseClient<Database>;

/*
 * ⚠ `page_sections` E IN LISTA PENTRU GPSR (30.08.2026). Acolo sta suprascrierea de pe produs —
 * producatorul altui brand, la un revanzator. Fara coloana in citire, `gpsrEfectiv` ar fi primit
 * mereu `undefined` si ar fi cazut tacut pe setarile magazinului: o declaratie legala GRESITA,
 * spusa cu incredere.
 */
export const PRODUCT_FIELDS =
  "id, name, slug, description, price, compare_at_price, images, category, is_active, track_inventory, stock_quantity, page_sections";

export interface OlxSyncContext {
  token: string;
  config: OlxConfig;
  business: MappableBusiness;
  /**
   * Producatorul si persoana responsabila din UE, din setarile magazinului.
   *
   * ⚠ Se citeste O DATA, la incarcarea contextului, si se duce mai departe: citita in
   * `toOlxAdvertBody`, ar fi fost o cerere la baza pentru fiecare produs dintr-o publicare in masa.
   */
  gpsr: GpsrConfig | null;
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
  /**
   * Clipa in care s-au gasit DOUA anunturi vii pentru acelasi produs vandabil.
   *
   * ⚠ Cat timp e scrisa, sincronizarea nu atinge niciunul: care dintre ele e „cel bun" nu poate
   * hotari un cron. Unul poate purta istoricul, mesajele si o promovare platita.
   */
  conflict_la: string | null;
  conflict_iduri: number[] | null;
}

export type SyncOutcome =
  | { ok: true; action: "created" | "updated" | "deactivated" | "activated" | "deleted" | "skipped"; status?: string; url?: string | null }
  | { ok: false; permanent: boolean; error: string; asteptare?: number };

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
    .from("store_settings").select("olx_config, gpsr_config").eq("business_id", businessId).single();
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
  return {
    stare: "gata",
    ctx: {
      token: tok.token,
      config: tok.config,
      business: biz as MappableBusiness,
      gpsr: (ss?.gpsr_config as GpsrConfig) ?? null,
    },
  };
}

// Retryable = network, rate-limit, auth hiccup, 5xx. Permanent = validation.
/**
 * Politica de reluare, intr-un singur loc.
 *
 * ═══ O ASTEPTARE NU E UN ESEC (31.08.2026) ═══
 *
 * `429` ardea o incercare, ca orice alta pana. Dar cele cinci incercari se consuma in
 * 1+2+4+8 minute, deci o limitare OLX de un sfert de ora facea SCRISORI MOARTE din toata munca
 * unui magazin — schimbari de pret si de stoc care nu mai plecau niciodata:
 *
 *     omul schimba pretul la treizeci de produse
 *     OLX ne limiteaza (au dreptul, si o spun limpede prin `Retry-After`)
 *     cinci refuzuri in cincisprezece minute -> `abandonat_la`
 *     -> limitarea trece, dar nimic nu se mai reia
 *
 * DEOSEBIREA E INTRE „N-A MERS" SI „NU ACUM". Un refuz spune ceva despre lucrare; o limitare
 * spune ceva despre CLIPA. Numai primul are voie sa consume din rabdarea noastra.
 *
 * Dar nici asteptarea nu e fara capat: cronul pune si o limita de varsta, ca o lucrare sa nu stea
 * amanata la nesfarsit fara ca nimeni sa afle. Vezi `VIATA_MAXIMA_MS` in cron.
 */
const ASTEPTARE_IMPLICITA_MS = 60_000;

/** Cat ne-au cerut EI sa asteptam, daca ne-au cerut. */
export function asteptareaLor(res: { status: number; retryAfterMs?: number }): number | undefined {
  if (res.retryAfterMs != null) return res.retryAfterMs;
  return res.status === 429 ? ASTEPTARE_IMPLICITA_MS : undefined;
}

export function classify(res: { error: string; status: number; retryAfterMs?: number }): { permanent: boolean; asteptare?: number } {
  /* Un `400` ramane refuz chiar daca poarta `Retry-After`: peticul e gresit, si intors peste un
     minut va fi tot gresit. Asteptarea nu repara o cerere pe care ei au inteles-o si au respins-o. */
  if (res.status === 400) return { permanent: true };
  return { permanent: false, asteptare: asteptareaLor(res) };
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
    .from("olx_adverts").select("id, olx_advert_id, status, offer_id, sters_de_om_la, dezactivat_de, conflict_la, conflict_iduri")
    .eq("business_id", businessId).eq("offer_id", offerId).maybeSingle();
  if (error) throw new CitireOlxEsuata(`randul OLX nu s-a putut citi: ${error.message}`);
  return (data as OlxAdvertRow) ?? null;
}

/**
 * Scrie pe rand motivul pentru care lucrarea n-a mers, ca omul sa-l vada in ecran.
 *
 * ═══ UN REFUZ AL CARUI MOTIV NU S-A SCRIS E UN PRODUS CARE TACE (31.08.2026) ═══
 *
 * Scrierea mergea oarba. Iar cine cheama iesea cu `permanent: true`, deci cronul stergea elementul
 * din coada — si nimic nu mai reincerca:
 *
 *     OLX refuza anuntul (categorie nemapata, atribut lipsa)
 *     scrierea motivului pica -> nimeni n-o afla
 *     elementul se sterge din coada
 *     -> produsul pur si simplu NU apare pe OLX, si ecranul nu spune de ce
 *
 * Cine cheama intoarce acum `permanent: false` daca scrierea a picat. Costa cel mult cinci cereri
 * in plus catre OLX pentru un produs oricum stricat — iar in schimb motivul nu se mai pierde: ori
 * se scrie la a doua incercare, ori ramane in `last_error` pe scrisoarea moarta.
 *
 * Si reluarea e sigura pe toate cele patru cai: la actualizare e idempotenta, iar la creare paza
 * anti-duplicat (`GET /adverts?external_id=`) intreaba OLX inainte de fiecare `POST`.
 */
async function saveError(
  admin: Db, businessId: string, offerId: string, productId: string | null, message: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const now = new Date().toISOString();
  const { error } = await admin.from("olx_adverts").upsert(
    {
      business_id: businessId, offer_id: offerId, product_id: productId,
      status: "error", error: message.slice(0, 500), updated_at: now,
    } as never,
    { onConflict: "business_id,offer_id" },
  );
  return error ? { ok: false, error: error.message } : { ok: true };
}

// ── Delete / deactivate / activate ──────────────────────────────────────────────

/**
 * Stinge si sterge un anunt LA EI, fara sa atinga nimic local.
 *
 * ⚠ Se foloseste pentru anunturile in plus gasite dupa `external_id`, care n-au rand local si nici
 * n-au de ce sa capete unul: nu sunt „al produsului", sunt duplicate de sters.
 *
 * ⚠ Aceleasi doua ingaduinte ca la retragerea obisnuita: `400` la dezactivare inseamna „deja
 * inactiv", `404` la stergere inseamna „nu mai e". Amandoua fac reluarea sigura.
 */
async function retrageLaEi(
  ctx: OlxSyncContext, advertId: number, status: string,
): Promise<{ ok: true } | { ok: false; esec: SyncOutcome }> {
  if (["active", "new", "unconfirmed", "limited"].includes(status)) {
    const dez = await advertCommand(ctx.token, advertId, "deactivate", { sAVandut: false });
    if (isOlxError(dez) && dez.status !== 400) {
      return {
        ok: false,
        esec: {
          ok: false, permanent: false, asteptare: asteptareaLor(dez),
          error: `Nu am putut dezactiva anuntul in plus ${advertId}: ${dez.error}`,
        },
      };
    }
  }
  const res = await deleteAdvert(ctx.token, advertId);
  if (isOlxError(res) && res.status !== 404) {
    return {
      ok: false,
      esec: {
        ok: false, permanent: false, asteptare: asteptareaLor(res),
        error: `OLX nu a sters anuntul in plus ${advertId} (${res.status}): ${res.error}`,
      },
    };
  }
  return { ok: true };
}

/**
 * Stinge un anunt LA EI, fara sa-l stearga si fara sa atinga nimic local.
 *
 * ⚠ Pentru anunturile IN PLUS gasite dupa `external_id` cand produsul devine nevandabil: ele n-au
 * rand local, si nici n-au de ce sa capete unul — dar n-au voie sa ramana la vanzare.
 *
 * ⚠ `400` inseamna „deja inactiv", deci reluarea e sigura.
 */
/**
 * Stinge un anunt LA EI, si CONFIRMA din starea lor.
 *
 * ═══ UN `400` NU E O DOVADA DE STARE (01.09.2026) ═══
 *
 * Prima varianta socotea orice `400` drept „gata, e deja inactiv". Dar `400` e familia intreaga de
 * refuzuri de validare la ei: un camp gresit, o cerere prost formata, o comanda nepermisa in
 * categoria aceea. Din codul HTTP nu se poate deduce ca starea dorita a fost atinsa — iar aici
 * concluzia „e stins" opreste o lucrare care apara marfa de la a se vinde cand nu exista.
 *
 * ⚠ Deci pe `400` se INTREABA, exact ca `deactivateRemote`. Doua functii care fac acelasi lucru
 * n-au voie sa aiba doua politici.
 */
async function stingeLaEi(
  ctx: OlxSyncContext, advertId: number,
): Promise<{ ok: true } | { ok: false; esec: SyncOutcome }> {
  const dez = await advertCommand(ctx.token, advertId, "deactivate", { sAVandut: false });
  if (!isOlxError(dez)) return { ok: true };
  /* `404` = nu mai e acolo. Starea dorita e atinsa, cu varf. */
  if (dez.status === 404) return { ok: true };
  if (dez.status !== 400) {
    return {
      ok: false,
      esec: {
        ok: false, permanent: false, asteptare: asteptareaLor(dez),
        error: `Nu am putut stinge anuntul in plus ${advertId}: ${dez.error}`,
      },
    };
  }
  const lor = await stareaLorAcum(ctx, advertId);
  if (!lor.ok) return { ok: false, esec: lor.esec };
  if (NU_E_LA_VANZARE.includes(lor.stare)) return { ok: true };
  return {
    ok: false,
    esec: {
      ok: false, permanent: false,
      error: `OLX a refuzat stingerea anuntului in plus ${advertId}, iar el e in continuare „${lor.stare}": ${dez.error}`,
    },
  };
}

/** Cate anunturi se cer pe o pagina cand cautam dupa `external_id`. */
const PAGINA_EXTERNAL_ID = 50;
/**
 * Plafon de siguranta la cautarea dupa `external_id`.
 *
 * ⚠ Doua duplicate sunt deja o anomalie; cinci sute inseamna altceva — un filtru pe care ei nu-l
 * mai respecta, sau un cont in care s-a intamplat ceva ce nu intelegem. Se opreste si se striga,
 * nu se macina la nesfarsit.
 */
const MAX_EXTERNAL_ID = 500;

/**
 * TOATE anunturile lor care poarta chiar `external_id`-ul cerut, prin toate paginile.
 *
 * ⚠ DOI MARTORI, ca la adoptare: daca ei ignora filtrul, raspunsul e primele anunturi ale contului
 * — si am atinge anunturi STRAINE, care n-au nicio treaba cu produsul nostru.
 *
 * ⚠ SI TOATE PAGINILE. O curatenie exhaustiva n-are voie sa se sprijine pe un numar maxim pe care
 * API-ul lor nu l-a promis niciodata: `external_id` e un filtru de lista, nu o cheie unica.
 */
async function anunturileLorPentru(
  ctx: OlxSyncContext, externalId: string, viiDoar: boolean,
): Promise<{ ok: true; anunturi: OlxAdvert[] } | { ok: false; esec: SyncOutcome }> {
  const MOARTE = ["removed_by_moderator", "moderated", "blocked", "deleted", "removed"];
  const anunturi: OlxAdvert[] = [];
  for (let deLa = 0; deLa < MAX_EXTERNAL_ID; deLa += PAGINA_EXTERNAL_ID) {
    const res = await listAdverts(ctx.token, { external_id: externalId, offset: deLa, limit: PAGINA_EXTERNAL_ID });
    if (isOlxError(res)) {
      return {
        ok: false,
        esec: {
          ok: false, permanent: false, asteptare: asteptareaLor(res),
          error: `nu am putut verifica ce anunturi are produsul la OLX: ${res.error}`,
        },
      };
    }
    const pagina = res.data ?? [];
    for (const a of pagina) {
      if (!a?.id) continue;
      const ext = (a as unknown as { external_id?: unknown }).external_id;
      if (typeof ext !== "string" || ext !== externalId) continue;
      const stare = String(a.status ?? "").toLowerCase();
      if (viiDoar ? VIU_LA_EI.includes(stare) : !MOARTE.includes(stare)) anunturi.push(a);
    }
    if (pagina.length < PAGINA_EXTERNAL_ID) return { ok: true, anunturi };
  }
  /*
   * ═══ COMENTARIUL SPUNEA UN LUCRU, `return`-UL FACEA ALTUL (01.09.2026) ═══
   *
   * Scria „nu se pretinde ca lista e completa" — si intorcea `ok: true`, adica exact asta. Iar cine
   * cheama foloseste raspunsul ca sa RETRAGA sau sa STINGA tot ce e al produsului. O curatenie
   * „exhaustiva" pe o lista despre care stim chiar noi ca poate fi incompleta lasa anunturi vii, si
   * apoi raporteaza ca a terminat.
   *
   * ⚠ Se opreste lucrarea. Cinci sute de anunturi cu acelasi `external_id` nu e o intarziere, e o
   * situatie pe care n-o intelegem — si atunci nu se atinge nimic pana nu se uita un om.
   */
  await logError({
    action: "olx.anunturileLor", severity: "critical",
    message: `cautarea dupa external_id a atins plafonul de ${MAX_EXTERNAL_ID}; lucrarea se opreste`,
    details: { externalId, gasite: anunturi.length },
  });
  return {
    ok: false,
    esec: {
      ok: false, permanent: true,
      error: `Produsul are peste ${MAX_EXTERNAL_ID} anunțuri cu același identificator la OLX. `
        + "Lucrarea s-a oprit ca să nu atingem o listă pe care nu o putem citi întreagă.",
    },
  };
}

/**
 * Stinge TOATE anunturile produsului la ei, si scrie starea pe randul canonic.
 *
 * ═══ INTENTIA E ASUPRA PRODUSULUI, NU A UNUI `olx_advert_id` (01.09.2026) ═══
 *
 * Cand produsul devine nevandabil — sau cand omul apasa „Dezactivează" — regula nu e „stinge
 * anuntul pe care il stim", ci „niciun anunt al produsului nu ramane la vanzare". Pana azi calea
 * cu rand cunoscut iesea din prima:
 *
 *     OLX:    111 ACTIVE (external_id = P)  si  222 ACTIVE (external_id = P)
 *     Edinio: `olx_adverts` -> 111
 *     stoc 10 -> 0  ->  se stingea 111 si se intorcea
 *     -> 222 ramanea la vanzare, si marfa se vindea cand nu mai era
 *
 * ⚠ SE INTREABA INTAI, SI ABIA APOI SE STINGE. Daca intrebarea pica, nu se atinge nimic si se
 * reia: o stingere pe jumatate, urmata de o lucrare incheiata, e chiar defectul.
 *
 * ⚠ Randul CANONIC (cel din `olx_adverts`, sau primul gasit) trece prin `deactivateRemote`, care
 * scrie si starea locala si motivul. Cele in plus n-au rand si nici nu pot capata unul —
 * `olx_adverts` are o singura linie pe produs — deci se sting de-a dreptul.
 */
async function stingeTotulPentruProdus(
  admin: Db, ctx: OlxSyncContext, businessId: string, offerId: string,
  row: OlxAdvertRow | null, sursa: SursaDezactivarii, productId: string | null,
): Promise<SyncOutcome> {
  const lor = await anunturileLorPentru(ctx, offerId, true);
  if (!lor.ok) return lor.esec;

  const cunoscut = row?.olx_advert_id ?? null;
  const inPlus = lor.anunturi.filter((a) => a.id !== cunoscut);

  if (lor.anunturi.length > 1 || (cunoscut != null && inPlus.length > 0)) {
    await logError({
      action: "olx.stingere", severity: "critical",
      message: `produsul are ${lor.anunturi.length} anunturi vii cu acelasi external_id; se sting toate`,
      details: { offerId, cunoscut, iduri: lor.anunturi.map((a) => a.id) }, businessId,
    });
  }
  for (const a of inPlus) {
    const r = await stingeLaEi(ctx, a.id);
    if (!r.ok) return r.esec;
  }

  /* Randul cunoscut isi urmeaza calea obisnuita: el poarta si motivul. */
  if (row?.olx_advert_id) return deactivateRemote(admin, ctx, row, sursa);

  /* Fara rand: primul dintre ale lor devine canonic, ca sa ramana o urma si un motiv scris. */
  const canonic = lor.anunturi[0];
  if (!canonic?.id) return { ok: true, action: "skipped" };
  await logError({
    action: "olx.stingere", severity: "warning",
    message: `produsul nevandabil avea un anunt VIU la OLX (${canonic.id}), necunoscut la noi; se leaga si se stinge`,
    details: { offerId, advertId: canonic.id, status: canonic.status }, businessId,
  });
  const acum = new Date().toISOString();
  const { error: eLegat } = await admin.from("olx_adverts").upsert(
    { business_id: businessId, offer_id: offerId, product_id: productId, ...advertPatch(canonic, acum) } as never,
    { onConflict: "business_id,offer_id" },
  );
  if (eLegat) {
    return {
      ok: false, permanent: false,
      error: `anuntul ${canonic.id} nu s-a putut lega inainte de dezactivare: ${eLegat.message}`,
    };
  }
  const proaspat = await getRow(admin, businessId, offerId);
  if (!proaspat) return { ok: true, action: "skipped" };
  return deactivateRemote(admin, ctx, proaspat, sursa);
}

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
        /* Verdictul ramane al ramurii; se adauga doar asteptarea, ca un `429` sa nu arda o incercare. */
        return { ok: false, permanent: false, asteptare: asteptareaLor(dez), error: `Nu am putut dezactiva anuntul inainte de stergere: ${dez.error}` };
      }
    }
    const res = await deleteAdvert(ctx.token, row.olx_advert_id);
    if (isOlxError(res) && res.status !== 404) {
      return {
        ok: false, permanent: false, asteptare: asteptareaLor(res),
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
      /*
       * ⚠ `olx_url`, NU `url` (31.08.2026). Coloana `url` nu exista in `olx_adverts`, iar `as never`
       * de mai jos opreste tocmai verificarea care ar fi prins-o. PostgREST respinge INTREAGA
       * scriere cu `PGRST204`, deci piatra nu s-a scris NICIODATA:
       *
       *     omul apasa „Șterge anunțul" -> anuntul chiar dispare la OLX
       *     scrierea pietrei pica -> i se arata o eroare, desi la ei s-a facut
       *     iar din coada, aceeasi lucrare moare dupa cinci incercari
       *
       * Masurat pe productie: `url` -> `PGRST204: Could not find the 'url' column`; `olx_url` trece.
       */
      olx_advert_id: null, status: "sters_de_om", olx_url: null, error: null,
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

/**
 * Starile in care un anunt NU e la vanzare la ei.
 *
 * `removed_by_user` e ce lasa in urma chiar comanda noastra de dezactivare. Celelalte inseamna
 * altceva — expirat, oprit de moderator — si de-aia se deosebesc mai jos.
 */
const STINS_LA_EI = ["removed_by_user", "outdated", "removed_by_moderator", "moderated", "blocked", "disabled"];
/** Starile in care anuntul chiar e (sau tocmai devine) vizibil. */
const VIU_LA_EI = ["active", "new", "unconfirmed"];
/**
 * Starile in care anuntul NU e la vanzare — mai larg decat `STINS_LA_EI`.
 *
 * ⚠ `limited` (cota gratuita epuizata) si `unpaid` inseamna un anunt care EXISTA la ei dar nu se
 * vede. Pentru intrebarea „mai trebuie dezactivat?" raspunsul e nu, si de-aia intra aici.
 *
 * ⚠ Fara ele, un magazin ajuns peste cota gratuita ar fi intrat in bucla: fiecare produs fara stoc
 * cu anunt `limited` cere `deactivate` -> `400` -> starea lor e tot `limited` -> se reia. Cinci
 * incercari, apoi scrisoare moarta — si asta la FIECARE editare de pret sau stoc. Adica tocmai
 * magazinul care a atins limita ar fi vazut contorul de esecuri umplandu-se singur.
 */
const NU_E_LA_VANZARE = [...STINS_LA_EI, "limited", "unpaid"];

/**
 * Ce zice OLX ca e acum, cand a refuzat comanda noastra cu `400`.
 *
 * ═══ RELUAREA TREBUIE SA STIE CE INCERCA, NU DOAR CE A PATIT (31.08.2026) ═══
 *
 * Dupa „la ei a mers, la noi n-a intrat", a doua incercare loveste un anunt care e DEJA in starea
 * ceruta — iar OLX raspunde `400`. Pana azi asta se citea ca „gata, n-am ce face", si starea locala
 * ramanea nescrisa pentru totdeauna:
 *
 *     stoc 5 -> 0, `deactivateRemote("stoc")`
 *     OLX dezactiveaza ✅, scrierea lui `dezactivat_de = "stoc"` PICA ❌ -> se reia (bine)
 *     a doua incercare: `400`, fiindca e deja inactiv
 *     -> se scria doar `last_status_at`, iar `dezactivat_de` ramanea NULL
 *     -> sondarea vede `removed_by_user` peste un rand care spunea `active` si fara motiv scris,
 *        deci il socoteste hotararea OMULUI si scrie `dezactivat_de = "om"`
 *     -> stocul se intoarce, si anuntul nu se mai aprinde NICIODATA
 *
 * ⚠ Deci un `400` nu inseamna „esec" si nici „gata": inseamna „intreaba-i cum e". Se citeste starea
 * lor si se scrie ADEVARUL — o singura cerere in plus, si numai pe drumul rar.
 */
async function stareaLorAcum(
  ctx: OlxSyncContext, olxAdvertId: number,
): Promise<{ ok: true; stare: string } | { ok: false; esec: SyncOutcome }> {
  const res = await getAdvert(ctx.token, olxAdvertId);
  if (isOlxError(res)) {
    /* ⚠ Nu putem confirma: nu se pretinde nimic, se reia. */
    return {
      ok: false,
      esec: {
        ok: false, permanent: false, asteptare: asteptareaLor(res),
        error: `OLX a refuzat comanda si nu am putut citi starea anuntului: ${res.error}`,
      },
    };
  }
  return { ok: true, stare: res.data?.status || "" };
}


/**
 * Scrie starea locala DUPA un efect remote reusit, si spune daca a intrat.
 *
 * ═══ ⚠ „S-A FACUT LA EI, DAR NU S-A SCRIS LA NOI" NU E UN SUCCES (30.08.2026, tarziu) ═══
 *
 * Scrierile de dupa un apel reusit mergeau oarbe, iar functia raporta `ok`. Cronul stergea atunci
 * elementul din coada — deci nimic nu mai reincerca, si starea locala ramanea in urma pentru
 * totdeauna. Cel mai scump exemplu, chiar din leacul de ieri:
 *
 *     stoc 5 -> 0 -> OLX dezactiveaza ✅
 *     scrierea lui `dezactivat_de = "stoc"` PICA ❌ -> se raporteaza `ok`, coada se goleste
 *     mai tarziu randul spune `removed_by_user` cu `dezactivat_de` NULL
 *     iar `null` se citeste prudent, ca „omul a hotarat"
 *     -> stocul se intoarce, anuntul NU se mai reactiveaza niciodata
 *
 * Adica exact insusirea reparata ieri, pierduta printr-o singura eroare de baza.
 *
 * ⚠ `permanent: false` INSEAMNA „SE REIA", si reluarea e sigura: comenzile OLX de mai sus sunt
 * idempotente — a dezactiva un anunt deja dezactivat raspunde `400 invalid status`, pe care il
 * tratam ca „gata".
 */
async function scrieStareaLocala(
  admin: Db, rowId: string, patch: Record<string, unknown>, ce: string,
): Promise<{ ok: true } | { ok: false; permanent: false; error: string }> {
  const { error } = await admin.from("olx_adverts").update(patch as never).eq("id", rowId);
  if (!error) return { ok: true };
  return {
    ok: false, permanent: false,
    error: `${ce} a reusit la OLX, dar starea locala nu s-a putut salva: ${error.message}`,
  };
}

async function deactivateRemote(
  admin: Db, ctx: OlxSyncContext, row: OlxAdvertRow, sursa: SursaDezactivarii,
): Promise<SyncOutcome> {
  if (!row.olx_advert_id) return { ok: true, action: "skipped" };
  /* ⚠ `sAVandut: false`: niciunul din motivele noastre nu e o vanzare. Vezi `advertCommand`. */
  const res = await advertCommand(ctx.token, row.olx_advert_id, "deactivate", { sAVandut: false });
  const now = new Date().toISOString();
  if (!isOlxError(res)) {
    const scris = await scrieStareaLocala(admin, row.id, {
      status: "removed_by_user", dezactivat_de: sursa, error: null, last_status_at: now, updated_at: now,
    }, "Dezactivarea");
    if (!scris.ok) return scris;
    return { ok: true, action: "deactivated", status: "removed_by_user" };
  }
  if (res.status === 400) {
    /* ⚠ „Deja inactiv" e cel mai des raspunsul la o RELUARE a propriei noastre comenzi. Vezi nota
       de la `stareaLorAcum`: se intreaba, nu se ghiceste. */
    const lor = await stareaLorAcum(ctx, row.olx_advert_id);
    if (!lor.ok) return lor.esec;
    if (NU_E_LA_VANZARE.includes(lor.stare)) {
      /*
       * ⚠ MOTIVUL OMULUI NU SE CALCA. Daca randul spunea deja „om", anuntul fusese stins de el, iar
       * comanda noastra doar a picat peste o hotarare care exista. Altfel, ce a stins anuntul e
       * chiar intentia pe care o duceam — si ea trebuie scrisa, altfel nimeni n-o mai afla.
       */
      /*
       * ⚠ MOTIVUL SE SCRIE NUMAI PE O DEZACTIVARE ADEVARATA. `limited` nu e o dezactivare, e o
       * cota epuizata: pus acolo, `dezactivat_de` ar face ca la intoarcerea stocului sa incercam
       * o reactivare pe care ei o refuza oricum.
       *
       * ⚠ Si motivul OMULUI nu se calca: daca randul spunea deja „om", anuntul fusese stins de el,
       * iar comanda noastra doar a picat peste o hotarare care exista.
       */
      /*
       * ⚠ NUMAI `removed_by_user` (01.09.2026). `dezactivat_de` raspunde la intrebarea „cine a
       * facut `removed_by_user`?" — nu la „ce incercam noi cand am primit refuzul". Un anunt
       * `outdated` (expirat singur la ei) sau oprit de moderator n-a fost stins de stocul nostru,
       * si un motiv scris acolo ar fi o minciuna care se citeste mai tarziu ca adevar.
       */
      const eStins = lor.stare === "removed_by_user";
      const patch: Record<string, unknown> = {
        status: lor.stare, error: null, last_status_at: now, updated_at: now,
        ...(eStins && row.dezactivat_de !== "om" ? { dezactivat_de: sursa } : {}),
      };
      const scris = await scrieStareaLocala(admin, row.id, patch, "Dezactivarea");
      if (!scris.ok) return scris;
      return { ok: true, action: "deactivated", status: lor.stare };
    }
    /* ⚠ Anuntul e VIU si totusi ne-au refuzat: `400` venea din altceva. Nu e o dezactivare reusita. */
    return { ok: false, permanent: false, error: `OLX a refuzat dezactivarea (anuntul e „${lor.stare}"): ${res.error}` };
  }
  if (res.status === 404) {
    /*
     * ⚠ A TREIA USA CU ACELASI INTELES. Sondarea si actualizarea invatasera deja ca un `404`
     * inseamna „omul l-a sters de mana pe OLX"; dezactivarea nu stia, si se reincerca de cinci ori
     * pana devenea scrisoare moarta. Piatra e aceeasi, si hotararea lui la fel.
     */
    const { error: ePiatra } = await admin.from("olx_adverts").update({
      olx_advert_id: null, status: "sters_de_om", olx_url: null, error: null,
      sters_de_om_la: now, last_status_at: now, updated_at: now,
    } as never).eq("id", row.id);
    if (ePiatra) {
      return {
        ok: false, permanent: false,
        error: `Anuntul nu mai exista pe OLX, dar piatra nu s-a putut scrie: ${ePiatra.message}`,
      };
    }
    return { ok: true, action: "skipped" };
  }
  return { ok: false, permanent: false, asteptare: asteptareaLor(res), error: res.error };
}

async function activateRemote(admin: Db, ctx: OlxSyncContext, row: OlxAdvertRow): Promise<SyncOutcome> {
  if (!row.olx_advert_id) return { ok: true, action: "skipped" };
  const res = await advertCommand(ctx.token, row.olx_advert_id, "activate");
  const now = new Date().toISOString();
  if (!isOlxError(res)) {
    /*
     * ═══ ⚠ SI MOTIVUL DEZACTIVARII SE STINGE (30.08.2026, tarziu) ═══
     *
     * Lasat, `dezactivat_de` ramanea „stoc" pe un anunt care e acum ACTIV. Iar daca mai tarziu
     * comerciantul intra pe OLX si il dezactiveaza EL, de mana, sondarea vede `removed_by_user`
     * peste un `dezactivat_de` invechit — si il reactivam noi, desfacand hotararea lui.
     *
     * Motivul apartine dezactivarii curente. Cand ea se incheie, motivul se duce cu ea.
     */
    // Activation may pass through moderation again — poll will settle it.
    const scris = await scrieStareaLocala(admin, row.id, {
      status: "new", dezactivat_de: null, error: null, last_status_at: null, updated_at: now,
    }, "Activarea");
    if (!scris.ok) return scris;
    return { ok: true, action: "activated", status: "new" };
  }
  if (res.status === 400 && /limit|packet|pachet/i.test(res.error)) {
    /* ⚠ Aici scrierea NU schimba verdictul: oricum iesim cu un refuz permanent, si mesajul lui e
       ce conteaza pentru om. Dar se citeste, ca o pana sa nu treaca tacut. */
    const { error: eLimita } = await admin.from("olx_adverts")
      .update({ status: "limited", updated_at: now } as never).eq("id", row.id);
    if (eLimita) {
      await logError({
        action: "olx.activare", severity: "warning",
        message: `starea „limited" nu s-a putut scrie: ${eLimita.message}`,
        details: { rowId: row.id },
      });
    }
    return { ok: false, permanent: true, error: "Cota de anunturi gratuite este epuizata. Cumpara un pachet OLX si activeaza anuntul." };
  }
  if (res.status === 400) {
    /*
     * ⚠ IN OGLINDA FATA DE DEZACTIVARE, si la fel de important. Un `400` care nu e despre pachete
     * inseamna, cel mai des, „anuntul e deja activ" — adica exact reluarea comenzii noastre dupa ce
     * scrierea locala picase. Tratat ca refuz PERMANENT (asa facea `classify`), elementul se stergea
     * din coada si starea locala ramanea „stins" peste un anunt VIU la ei: produsul aparea in ecran
     * ca dezactivat, si nimic nu-l mai indrepta.
     */
    const lor = await stareaLorAcum(ctx, row.olx_advert_id);
    if (!lor.ok) return lor.esec;
    if (VIU_LA_EI.includes(lor.stare)) {
      const scris = await scrieStareaLocala(admin, row.id, {
        status: lor.stare, dezactivat_de: null, error: null, last_status_at: null, updated_at: now,
      }, "Activarea");
      if (!scris.ok) return scris;
      return { ok: true, action: "activated", status: lor.stare };
    }
    /* Chiar e stins acolo, si tot ne-au refuzat: refuzul e adevarat. */
    return { ok: false, ...classify(res), error: res.error };
  }
  return { ok: false, ...classify(res), error: res.error };
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

  /*
   * ⚠ CAT TIMP E CONFLICT, NU SE ATINGE NIMIC. Altfel am rescrie cu datele produsului anuntul pe
   * care omul poate tocmai il pastreaza — sau, mai rau, l-am dubla inca o data. Iesirea e din ecran.
   */
  if (row?.conflict_la) {
    return { ok: false, permanent: true, error: "Există mai multe anunțuri OLX pentru acest produs. Alege pe care îl păstrezi." };
  }

  // Inactive or out of stock -> deactivate but keep the advert for later.
  if (!isProductSellable(product)) {
    /*
     * ⚠ O SINGURA REGULA, PE AMANDOUA CAILE. Inainte, calea cu rand cunoscut iesea din prima si
     * nu mai cauta duplicatele; calea fara rand le cauta. Doua politici pentru acelasi adevar
     * remote inseamna, mai devreme sau mai tarziu, o marfa care se vinde cand nu mai exista.
     */
    const areRost = (row?.olx_advert_id && ["active", "new", "unconfirmed"].includes(row.status)) || !row?.olx_advert_id;
    if (!areRost) return { ok: true, action: "skipped" };
    return stingeTotulPentruProdus(
      admin, ctx, businessId, offerId, row,
      product.is_active ? "stoc" : "produs-inactiv", product.id,
    );
  }

  const entry = product.category ? ctx.config.category_map?.[product.category] : undefined;
  if (!entry) {
    if (!row) return { ok: true, action: "skipped" };
    const motiv = "Categoria produsului nu este mapata la o categorie OLX.";
    const scris = await saveError(admin, businessId, offerId, product.id, motiv);
    if (!scris.ok) return { ok: false, permanent: false, error: `${motiv} (motivul nu s-a putut scrie: ${scris.error})` };
    return { ok: false, permanent: true, error: motiv };
  }

  const body = toOlxAdvertBody(ctx.business, product, ctx.config, entry, ctx.gpsr);
  const now = new Date().toISOString();

  if (row?.olx_advert_id) {
    const res: OlxResult<OlxAdvert> = await updateAdvert(ctx.token, row.olx_advert_id, body);
    if (isOlxError(res)) {
      if (res.status === 404) {
        /*
         * ═══ ACEEASI HOTARARE, DOUA RASPUNSURI DEOSEBITE (31.08.2026) ═══
         *
         * Sondarea invatase deja ca un `404` inseamna „omul l-a sters de mana pe OLX" si punea o
         * piatra. Aici scria pe dos: stergea legatura si il RECREA la trecerea urmatoare.
         *
         * Iar ramura asta o ia inaintea celeilalte, mereu: sondarea vine din doua in doua ore, pe
         * cand coada se umple la FIECARE editare de pret sau de stoc. Deci reparatia de ieri era
         * ocolita in practica de aproape fiecare data:
         *
         *     omul sterge anuntul in contul lui de OLX
         *     mai schimba o data pretul in Edinio (sau intra o comanda)
         *     `PUT /adverts/{id}` -> 404 -> „va fi recreat"
         *     -> anuntul REAPARE, impotriva a ceea ce a facut el
         *
         * OLX nu sterge anunturi singur: ce expira primeste starea `outdated`, nu un `404`. Deci un
         * `404` aici nu poate insemna decat hotararea lui. Iesirea e tot „Postează pe OLX".
         */
        const { error: ePiatra } = await admin.from("olx_adverts").update({
          olx_advert_id: null, status: "sters_de_om", olx_url: null, error: null,
          sters_de_om_la: now, last_status_at: now, updated_at: now,
        } as never).eq("id", row.id);
        if (ePiatra) {
          return {
            ok: false, permanent: false,
            error: `Anuntul nu mai exista pe OLX, dar piatra nu s-a putut scrie: ${ePiatra.message}`,
          };
        }
        return { ok: true, action: "skipped" };
      }
      const v = classify(res);
      if (v.permanent) {
        const scris = await saveError(admin, businessId, offerId, product.id, res.error);
        if (!scris.ok) return { ok: false, permanent: false, error: `${res.error} (motivul nu s-a putut scrie: ${scris.error})` };
      }
      return { ok: false, ...v, error: res.error };
    }
    const advert = res.data ?? ({ id: row.olx_advert_id, status: row.status } as OlxAdvert);
    /*
     * S-A DUS LA EI, DECI TREBUIE SA SE SCRIE SI LA NOI. Scrierea asta mergea oarba, iar mai jos se
     * intorcea `ok` — deci cronul golea coada, si pretul nou, starea si `last_synced_at` ramaneau in
     * urma pentru totdeauna. Reluarea e ieftina: `PUT` pe acelasi anunt e idempotent.
     */
    const { error: eProaspat } = await admin.from("olx_adverts").upsert(
      { business_id: businessId, offer_id: offerId, product_id: product.id, ...advertPatch(advert, now) } as never,
      { onConflict: "business_id,offer_id" },
    );
    if (eProaspat) {
      return {
        ok: false, permanent: false,
        error: `Anuntul s-a actualizat la OLX, dar starea locala nu s-a scris: ${eProaspat.message}`,
      };
    }
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
      if (freshRow) {
        /*
         * ═══ REZULTATUL REACTIVARII SE CITESTE (31.08.2026) ═══
         *
         * Se chema si se arunca, iar mai jos se intorcea `ok`. Deci cronul stergea lucrarea din
         * coada, si tocmai drumul cel mai obisnuit ramanea neterminat:
         *
         *     stoc 10 -> 0   -> OLX dezactiveaza, `dezactivat_de = "stoc"`
         *     stoc 0  -> 10  -> `PUT` reuseste ✅, reactivarea da 429 sau 500 ❌
         *     -> se raporteaza `ok`, coada se goleste
         *     -> produsul e vandabil la noi si anuntul ramane STINS la ei
         *
         * ⚠ Si nimic nu-l mai aprinde: sondarea de stare vede `removed_by_user` cu
         * `dezactivat_de` scris, adica exact ce se astepta sa vada. Numai o noua atingere a
         * produsului ar reincerca — poate niciodata.
         *
         * ⚠ Reluarea e ieftina si sigura: `PUT`-ul de mai sus e idempotent, iar o comanda de
         * activare pe un anunt deja activ raspunde `400 invalid status`, pe care il tratam ca gata.
         */
        const activare = await activateRemote(admin, ctx, freshRow);
        if (!activare.ok) return activare;
      }
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
  /*
   * ⚠ ACELASI REZOLVITOR CA PESTE TOT (01.09.2026). Aici se chema `listAdverts` cu `limit: 20`,
   * deci un anunt aflat pe pozitia douazeci si unu nu se vedea — si atunci paza anti-duplicat il
   * rata tocmai pe cel de care ne temem. Sase locuri care intreaba acelasi lucru n-au voie sa aiba
   * sase raspunsuri: `anunturileLorPentru` pagineaza, cere doi martori, si se opreste la plafon.
   */
  const existente = await anunturileLorPentru(ctx, product.id, false);
  if (existente.ok) {
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
    /* Doi martori si starile moarte le filtreaza deja `anunturileLorPentru`. */
    const candidati = existente.anunturi;
    /*
     * ═══ DOUA ANUNTURI VII: SE INTREABA OMUL, NU SE ALEGE (01.09.2026) ═══
     *
     * `candidati[0]` insemna „cel intors primul de ei". Dar cand produsul e VANDABIL, intrebarea
     * „care dintre ele e cel bun?" n-are raspuns tehnic:
     *
     *     anunt 111 — activ, 1.240 de vizualizari, doua conversatii, promovare platita
     *     anunt 222 — activ, 17 vizualizari, nimic
     *
     * Un cron n-are cum sa stie asta. Se scrie conflictul, se opreste publicarea pe produsul acela,
     * si omul alege din ecran — o data, si pentru totdeauna.
     *
     * ⚠ Deosebirea fata de nevandabil si de stergere, unde le atingem pe toate fara sa intrebam:
     * acolo raspunsul e acelasi pentru oricare — niciunul nu ramane la vanzare. Aici unul TREBUIE
     * sa ramana, si tocmai alegerea lui e ce nu putem face noi.
     */
    if (candidati.length > 1) {
      const iduri = candidati.map((a) => a.id);
      await logError({
        action: "olx.conflict", severity: "critical",
        message: `produsul are ${candidati.length} anunturi vii cu acelasi external_id; publicarea se opreste pana alege omul`,
        details: { businessId, offerId, iduri }, businessId,
      });
      const { error: eConflict } = await admin.from("olx_adverts").upsert(
        {
          business_id: businessId, offer_id: offerId, product_id: product.id,
          status: "conflict", conflict_la: now, conflict_iduri: iduri,
          error: `Există ${candidati.length} anunțuri OLX pentru acest produs. Alege pe care îl păstrezi.`,
          updated_at: now,
        } as never,
        { onConflict: "business_id,offer_id" },
      );
      if (eConflict) {
        return { ok: false, permanent: false, error: `conflictul nu s-a putut scrie: ${eConflict.message}` };
      }
      return { ok: false, permanent: true, error: `Există ${candidati.length} anunțuri OLX pentru acest produs. Alege pe care îl păstrezi.` };
    }
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
        return { ok: false, ...classify(dupaAdoptare), error: dupaAdoptare.error };
      }
      const proaspat = dupaAdoptare.data ?? gasit;
      /*
       * ⚠ SI ASTA ISI CITESTE RASPUNSUL. Corpul proaspat a plecat deja la OLX; nescrisa local,
       * legatura ramane pe valorile de dinainte, iar noi raportam `ok` — deci coada se goleste si
       * nimeni nu mai reia. `permanent: false` face reluarea, iar adoptarea o regaseste.
       */
      const { error: eProaspat } = await admin.from("olx_adverts").upsert(
        { business_id: businessId, offer_id: offerId, product_id: product.id, ...advertPatch(proaspat, now) } as never,
        { onConflict: "business_id,offer_id" },
      );
      if (eProaspat) {
        return {
          ok: false, permanent: false,
          error: `anuntul s-a actualizat la OLX, dar legatura locala nu s-a putut scrie: ${eProaspat.message}`,
        };
      }
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
  if (!existente.ok) return existente.esec;

  const res: OlxResult<OlxAdvert> = await createAdvert(ctx.token, body);
  if (isOlxError(res)) {
    const v = classify(res);
    if (v.permanent) {
      const scris = await saveError(admin, businessId, offerId, product.id, res.error);
      if (!scris.ok) return { ok: false, permanent: false, error: `${res.error} (motivul nu s-a putut scrie: ${scris.error})` };
    }
    return { ok: false, ...v, error: res.error };
  }
  const advert = res.data;
  if (!advert?.id) {
    const motiv = "Raspuns OLX fara ID de anunt.";
    const scris = await saveError(admin, businessId, offerId, product.id, motiv);
    if (!scris.ok) return { ok: false, permanent: false, error: `${motiv} (motivul nu s-a putut scrie: ${scris.error})` };
    return { ok: false, permanent: true, error: motiv };
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
  /** Capatul de sus al asteptarilor. `revendica_din_coada` intoarce randul intreg. */
  created_at: string;
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

/**
 * Sterge anuntul de la OLX — dar numai dupa ce se vede ca produsul chiar a disparut.
 *
 * ═══ INTENTIA DE RETRAGERE SE SCRIE INAINTE DE STERGERE, SI POATE RAMANE SINGURA (31.08.2026) ═══
 *
 * `deleteProduct` si stergerea in masa scriu intai lucrarea de retragere in coada — dinadins,
 * ca un produs sters sa nu ramana la vanzare pe OLX. Dar cele doua nu sunt legate tranzactional:
 *
 *     retragerea se scrie in coada ✅
 *     `DELETE` pe `products` PICA (timeout, constrangere, RLS) ❌
 *     omul vede „Eroare la stergere", si produsul e tot acolo
 *     cronul executa oricum lucrarea: dezactiveaza, STERGE anuntul, si pune piatra
 *     -> produs viu in Edinio, anunt sters la OLX, si republicarea automata blocata
 *
 * ⚠ La stergerea IN MASA e si mai rau: `DELETE` merge pe bucati de 200, iar o bucata picata la
 * mijloc lasa sute de produse vii cu retragerea deja scrisa pentru toate.
 *
 * ⚠ PAZA STA LA LUCRATOR, NU LA CHEMATOR, si asta e alegerea. O tranzactie ar cere sa se mute in
 * baza cinci cozi de marketplace deodata; paza de aici acopera si orice chemator viitor, si tot
 * ce s-a scris deja in coada. Iar stergerea unui anunt e singurul efect din integrare care nu se
 * poate desface: merita intrebat inca o data.
 *
 * ⚠ NU ATINGE BUTONUL „Șterge anunțul". Acela cheama `deleteAdvertNow` DIRECT, fara coada — acolo
 * omul chiar vrea anuntul sters cu produsul pastrat. `op: "delete"` din coada are un singur
 * inteles: „produsul nu mai exista". `offer_id` E id-ul produsului, pentru toate cele doua cai
 * care pun lucrari de stergere.
 */
async function stergeDacaProdusulChiarNuMaiE(
  admin: Db, ctx: OlxSyncContext, item: OlxQueueItem,
): Promise<SyncOutcome> {
  const { data: inca, error: eProdus } = await admin
    .from("products").select("id")
    .eq("business_id", item.business_id).eq("id", item.offer_id).maybeSingle();
  /* ⚠ Daca nu putem INTREBA, nu stergem. Aceeasi regula ca la paza anti-duplicat de la creare. */
  if (eProdus) {
    return {
      ok: false, permanent: false,
      error: `nu am putut verifica daca produsul mai exista, deci nu stergem anuntul: ${eProdus.message}`,
    };
  }
  if (inca) {
    /*
     * ═══ „INCA EXISTA" INSEAMNA „NU INCA", NU „NU E NIMIC DE FACUT" (31.08.2026) ═══
     *
     * Prima varianta intorcea `ok`. Gresit, si tocmai pe dos fata de rostul lucrarii: `ok` face
     * cronul sa STEARGA randul din coada — adica arunca chiar intentia durabila scrisa INAINTE de
     * `DELETE`, care exista ca sa nu se piarda. Doua ferestre reale o pierdeau:
     *
     *   (a) STERGEREA IN MASA scrie retragerile pentru toate id-urile deodata, apoi sterge pe
     *       bucati de cate sase sute — secunde bune. Cronul porneste in fiecare minut si nu e
     *       sincronizat cu nimic: o trecere cazuta la mijlocul buclei vede produsele inca
     *       nesterse, arunca retragerile, iar `DELETE`-ul lor reuseste o clipa mai tarziu.
     *       -> anunturi VII la OLX pentru produse care nu mai exista.
     *
     *   (b) MAGAZINELE CU `auto_sync` STINS. Retragerea dinaintea stergerii ignora dinadins
     *       comutatorul; amandoua plasele de DUPA stergere ies devreme pe el. Deci acolo randul
     *       asta e SINGURA retragere care va exista vreodata.
     *
     * ⚠ Se AMANA, deci. Nu arde incercari — nu e un esec, e o stare care inca nu s-a asezat — iar
     * capatul de varsta al cronului o face scrisoare moarta vizibila daca stergerea chiar n-a mers
     * niciodata. Si nu costa nimic la ei: pe ramura asta nu se atinge OLX.
     */
    return {
      ok: false, permanent: false, asteptare: 5 * 60_000,
      error: "produsul inca exista in magazin, deci retragerea se amana",
    };
  }
  const rand = await getRow(admin, item.business_id, item.offer_id);

  /*
   * ═══ UN RAND LEGAT NU DOVEDESTE CA E SINGURUL (01.09.2026) ═══
   *
   * Pana azi, daca aveam un `olx_advert_id` local ieseam direct pe retragerea obisnuita — deci
   * cautarea duplicatelor se facea DOAR cand nu stiam nimic. Dar starea cea mai probabila a unui
   * duplicat istoric e tocmai cealalta: unul legat, celalalt orfan.
   *
   *     OLX:    anunt 111 (external_id = P)  si  anunt 222 (external_id = P)
   *     Edinio: `olx_adverts` -> 111
   *     omul sterge produsul -> se retrage 111, lucrarea se incheie
   *     -> 222 ramane la vanzare, si nimic nu-l mai gaseste: reconcilierea nu atinge
   *        un anunt al carui produs nu mai exista
   *
   * ⚠ SE INTREABA INTAI, SI ABIA APOI SE RETRAGE. Daca intrebarea pica, nu se face nimic si se
   * reia: o retragere pe jumatate, urmata de o lucrare incheiata, e chiar defectul de mai sus.
   * `external_id` n-are constrangere de unicitate la ei, deci numarul lor nu se poate presupune.
   */
  const lor = await anunturileLorPentru(ctx, item.offer_id, false);
  if (!lor.ok) return lor.esec;

  const cunoscut = rand?.olx_advert_id ?? null;
  const inPlus = lor.anunturi.filter((a) => a.id !== cunoscut);
  if (inPlus.length > 0 && (cunoscut != null || inPlus.length > 1)) {
    await logError({
      action: "olx.stergere", severity: "critical",
      message: `produsul sters are ${lor.anunturi.length} anunturi cu acelasi external_id; se retrag toate`,
      details: { offerId: item.offer_id, cunoscut, iduri: lor.anunturi.map((a) => a.id) },
      businessId: item.business_id,
    });
  }

  /* Randul legat isi urmeaza calea obisnuita: el poarta si piatra hotararii. */
  if (cunoscut != null) {
    for (const a of inPlus) {
      const r = await retrageLaEi(ctx, a.id, String(a.status ?? ""));
      if (!r.ok) return r.esec;
    }
    return removeRemote(admin, ctx, item.business_id, rand);
  }

  /*
   * Fara rand local: unul dintre ele se leaga (ca sa ramana o urma si sa se scrie piatra), restul
   * se retrag de-a dreptul.
   */
  if (lor.anunturi.length === 0) return { ok: true, action: "skipped" };
  const orfan = lor.anunturi[0];
  for (const a of lor.anunturi.slice(1)) {
    const r = await retrageLaEi(ctx, a.id, String(a.status ?? ""));
    if (!r.ok) return r.esec;
  }
  await logError({
    action: "olx.stergere", severity: "warning",
    message: `produsul sters lasase un anunt viu la OLX (${orfan.id}), necunoscut la noi; se retrage`,
    details: { offerId: item.offer_id, advertId: orfan.id, status: orfan.status },
    businessId: item.business_id,
  });
  const acum = new Date().toISOString();
  const { error: eLegat } = await admin.from("olx_adverts").upsert(
    { business_id: item.business_id, offer_id: item.offer_id, product_id: null, ...advertPatch(orfan, acum) } as never,
    { onConflict: "business_id,offer_id" },
  );
  if (eLegat) {
    return {
      ok: false, permanent: false,
      error: `anuntul orfan ${orfan.id} nu s-a putut lega inainte de retragere: ${eLegat.message}`,
    };
  }
  return removeRemote(admin, ctx, item.business_id, await getRow(admin, item.business_id, item.offer_id));
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
      return stergeDacaProdusulChiarNuMaiE(admin, ctx, item);
    case "deactivate": {
      /* ⚠ Tot o apasare a omului, deci tot asupra PRODUSULUI: si aici duplicatele se sting. */
      const row = await getRow(admin, item.business_id, item.offer_id);
      return stingeTotulPentruProdus(admin, ctx, item.business_id, item.offer_id, row, "om", item.offer_id);
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
  /*
   * ⚠ SI APASAREA OMULUI E ASUPRA PRODUSULUI. El vede un produs si un buton „Dezactivează", nu un
   * `olx_advert_id`. Daca produsul are un duplicat istoric, „am dezactivat" trebuie sa insemne ca
   * nu mai e vandabil nicaieri — altfel ii spunem ceva ce nu e adevarat.
   */
  return faraCitiriPicate(async () =>
    stingeTotulPentruProdus(admin, ctx, businessId, productId,
      await getRow(admin, businessId, productId), "om", productId));
}

export async function activateProductNow(admin: Db, ctx: OlxSyncContext, businessId: string, productId: string): Promise<SyncOutcome> {
  return faraCitiriPicate(async () => {
    const row = await getRow(admin, businessId, productId);
    return row ? activateRemote(admin, ctx, row) : { ok: true, action: "skipped" };
  });
}

/**
 * Sterge TOATE anunturile produsului la ei, si pune piatra pe randul canonic.
 *
 * ═══ SI APASAREA „ȘTERGE ANUNȚUL" E ASUPRA PRODUSULUI (01.09.2026) ═══
 *
 * Sora ei, `stingeTotulPentruProdus`, invatase deja asta. Aici ramasese vechiul drum: `getRow` si
 * un singur `olx_advert_id`. Deci pe un produs cu duplicat istoric:
 *
 *     OLX:    111 ACTIVE (external_id = P)  si  222 ACTIVE (external_id = P)
 *     Edinio: `olx_adverts` -> 111
 *     omul apasa „Șterge anunțul" -> 111 dispare, 222 RAMANE la vanzare
 *
 * Iar butonul ii promite textual „Acțiunea nu poate fi anulată" — deci ii spunem ca s-a terminat
 * ceva ce nu s-a terminat.
 *
 * ⚠ SE INTREABA INTAI, SI ABIA APOI SE STERGE. Daca intrebarea pica, nu se atinge nimic si se reia.
 */
async function stergeTotulPentruProdus(
  admin: Db, ctx: OlxSyncContext, businessId: string, offerId: string, row: OlxAdvertRow | null,
): Promise<SyncOutcome> {
  const lor = await anunturileLorPentru(ctx, offerId, false);
  if (!lor.ok) return lor.esec;

  const cunoscut = row?.olx_advert_id ?? null;
  const inPlus = lor.anunturi.filter((a) => a.id !== cunoscut);
  if (inPlus.length > 0) {
    await logError({
      action: "olx.stergere", severity: "critical",
      message: `produsul are ${lor.anunturi.length} anunturi cu acelasi external_id; se sterg toate`,
      details: { offerId, cunoscut, iduri: lor.anunturi.map((a) => a.id) }, businessId,
    });
    for (const a of inPlus) {
      const r = await retrageLaEi(ctx, a.id, String(a.status ?? ""));
      if (!r.ok) return r.esec;
    }
  }
  /* Randul cunoscut isi urmeaza calea obisnuita: el poarta si piatra hotararii. */
  return removeRemote(admin, ctx, businessId, row);
}

export async function deleteAdvertNow(admin: Db, ctx: OlxSyncContext, businessId: string, offerId: string): Promise<SyncOutcome> {
  return faraCitiriPicate(async () =>
    stergeTotulPentruProdus(admin, ctx, businessId, offerId, await getRow(admin, businessId, offerId)));
}

// Refresh one advert's status from OLX (used by the cron poll).
export async function refreshAdvertStatus(
  admin: Db, ctx: OlxSyncContext, rowId: string, olxAdvertId: number,
  /** Ce stiam despre rand INAINTE de sondare. Vezi cele doua note de mai jos. */
  inainte?: { status?: string | null; dezactivat_de?: string | null },
): Promise<void> {
  const now = new Date().toISOString();
  const res = await getAdvert(ctx.token, olxAdvertId);
  if (isOlxError(res)) {
    if (res.status === 404) {
      /*
       * ═══ ⚠ `404` INSEAMNA CA OMUL L-A STERS PE OLX, NU CA N-A EXISTAT (30.08.2026, tarziu) ═══
       *
       * Randul se STERGEA, iar cu el si singura urma a hotararii lui. Coada OLX se umple dupa
       * fiecare editare de pret sau stoc, deci la prima atingere a produsului `getRow` nu gasea
       * nimic, se intra pe ramura de creare, si anuntul REAPAREA — impotriva a ceea ce facuse el,
       * de mana, in contul lui.
       *
       * ⚠ Aceeasi piatra ca la „Șterge anunțul" din ecranul nostru: nu conteaza pe ce usa a intrat
       * hotararea, ci ca a fost a lui. Iesirea e tot „Postează pe OLX".
       */
      const { error: ePiatra } = await admin.from("olx_adverts").update({
        olx_advert_id: null, status: "sters_de_om", olx_url: null, error: null,
        sters_de_om_la: now, last_status_at: now, updated_at: now,
      } as never).eq("id", rowId);
      if (ePiatra) {
        await logError({
          action: "olx.sondare", severity: "warning",
          message: `anuntul nu mai exista la OLX, dar piatra nu s-a putut scrie: ${ePiatra.message}`,
          details: { rowId, olxAdvertId },
        });
      }
      return;
    }
    /* ⚠ O pana trecatoare: se amana sondarea, dar nu se pretinde ca stim ceva despre anunt. */
    const { error: eAmanare } = await admin.from("olx_adverts")
      .update({ last_status_at: now } as never).eq("id", rowId);
    if (eAmanare) {
      await logError({
        action: "olx.sondare", severity: "warning",
        message: `marcajul de sondare nu s-a putut scrie: ${eAmanare.message}`,
        details: { rowId, olxAdvertId },
      });
    }
    return;
  }
  const advert = res.data;
  const stareaLor = advert.status || "new";

  /*
   * ⚠ CAND STAREA SPUNE „RESPINS", SE INTREABA DE CE. Aici, in sondare, fiindca aici aflam prima
   * data ca s-a intamplat — si fiindca `inainte` ne spune daca e o veste NOUA sau una pe care am
   * intrebat-o deja.
   */
  if (RESPINSE.includes(stareaLor) && inainte?.status !== stareaLor) {
    await ceruMotivulRespingerii(admin, ctx, rowId, olxAdvertId);
  }

  /*
   * ═══ ⚠ O DEZACTIVARE FACUTA DIRECT PE OLX E TOT A OMULUI (30.08.2026, tarziu) ═══
   *
   * Daca noi am stins anuntul, `deactivateRemote` a scris deja si `dezactivat_de`. Deci un
   * `removed_by_user` care apare AICI, peste un rand care nu era asa si n-are motiv scris, nu poate
   * veni decat din contul lui: a intrat pe OLX si a apasat „Dezactivează".
   *
   * Fara insemnarea asta, `dezactivat_de` ramanea NULL — iar `null` se citeste prudent ca „om", deci
   * azi n-ar strica nimic. Dar prudenta aia e o presupunere, si ea tine doar cat timp nimeni nu
   * scrie altceva acolo. Scris pe nume, adevarul nu mai depinde de o conventie.
   */
  const aStinsElInsusi = stareaLor === "removed_by_user"
    && inainte?.status !== "removed_by_user"
    && (inainte?.dezactivat_de ?? null) === null;

  const { error: eStare } = await admin.from("olx_adverts").update({
    status: stareaLor,
    olx_url: advert.url ?? null,
    valid_to: advert.valid_to ? new Date(advert.valid_to.replace(" ", "T") + "+03:00").toISOString() : null,
    /*
     * ⚠ SI MOTIVUL SE STINGE CAND DEZACTIVAREA S-A INCHEIAT (31.08.2026). Daca ei spun ca anuntul
     * NU mai e stins, orice motiv scris e de la o dezactivare trecuta — iar lasat acolo, ar face
     * ca o dezactivare viitoare facuta de OM sa fie citita ca fiind a noastra, si s-o desfacem.
     * Aceeasi regula pe care `activateRemote` o scrie de mult pe nume.
     */
    ...(aStinsElInsusi
      ? { dezactivat_de: "om" }
      : stareaLor !== "removed_by_user" ? { dezactivat_de: null } : {}),
    last_status_at: now,
    updated_at: now,
  } as never).eq("id", rowId);
  if (eStare) {
    /*
     * ⚠ Nescrisa, starea ramane cea veche si sondarea se reia — ceea ce e ieftin si idempotent.
     * Dar tacut, un rand care nu se mai actualizeaza niciodata n-ar avea cum sa fie observat.
     */
    await logError({
      action: "olx.sondare", severity: "warning",
      message: `starea citita de la OLX nu s-a putut scrie: ${eStare.message}`,
      details: { rowId, olxAdvertId, stareaLor },
    });
  }
}

/** Cate anunturi se cer intr-o trecere de reconciliere. */
export const RECONCILE_PAGINA = 50;

/** Ce se face cu un anunt gasit in contul lor. */
export type HotarareReconciliere =
  /** E legat deja la un rand de-al nostru: sondarea de stare se ocupa de el. */
  | { fel: "stim" }
  /** `external_id` nu e un produs al magazinului: e anuntul LUI, sau un produs sters. */
  | { fel: "nu-e-al-nostru" }
  /** Omul l-a sters de la noi, dar la ei traieste: hotararea lui ramane in picioare. */
  | { fel: "sters-de-om" }
  /** Produsul are deja alt anunt legat: doua anunturi, si nu alege un cron care. */
  | { fel: "duplicat"; legat: number }
  /** E al nostru si nelegat: se leaga inapoi. */
  | { fel: "leaga" };

/**
 * Ce se face cu un anunt gasit in contul lor. Pura dinadins: se poate proba fara retea.
 *
 * ⚠ ORDINEA E CHIAR REGULA, si fiecare pas de mai devreme e o poarta inchisa pentru cel de dupa:
 *
 *   1. il stim deja            -> nimic
 *   2. nu e produsul nostru    -> NU se atinge. Contul lui de OLX e al lui.
 *   3. omul l-a sters la noi   -> nu se readuce, oricat ar parea de „lipsa"
 *   4. produsul are alt anunt  -> se scrie, nu se alege
 *   5. altfel                  -> se leaga
 *
 * ⚠ Nicaieri „se sterge". Stergerea unui anunt e singurul efect din tot marketplace-ul care nu se
 * poate desface de la noi, si o reconciliere care sterge pe o presupunere e cel mai scump fel de a
 * gresi.
 */
export function hotarareaReconcilierii(a: {
  advertId: number;
  /** `external_id` e chiar id-ul unui produs al magazinului. */
  eAlNostru: boolean;
  /** Id-ul asta e deja scris pe un rand de-al nostru. */
  cunoscut: boolean;
  randul?: { olx_advert_id: number | null; sters_de_om_la: string | null };
}): HotarareReconciliere {
  if (a.cunoscut) return { fel: "stim" };
  if (!a.eAlNostru) return { fel: "nu-e-al-nostru" };
  if (a.randul?.sters_de_om_la) return { fel: "sters-de-om" };
  const legat = a.randul?.olx_advert_id;
  if (legat != null && legat !== a.advertId) return { fel: "duplicat", legat };
  return { fel: "leaga" };
}

/**
 * Trece prin anunturile din contul lor si leaga inapoi ce e al nostru si a ramas nelegat.
 *
 * ═══ CE E VIU LA EI SI NECUNOSCUT LA NOI NU SE VEDE DE NICAIERI (31.08.2026) ═══
 *
 * Sondarea de stare (pasul 2 din cron) intreaba despre randurile pe care le AVEM. Deci un anunt viu
 * la OLX fara rand la noi e invizibil pentru totdeauna:
 *
 *     crearea reuseste la ei, dar scrierea legaturii pica
 *     lucrarea se reia... si moare dupa cinci incercari
 *     -> anuntul ramane ACTIV la OLX, si nimeni nu-l mai atinge
 *     -> stocul ajunge la zero si el vinde mai departe, fiindca noi nu stim de el
 *
 * ⚠ SE ADOPTA DOAR CE E LIMPEDE AL NOSTRU. `external_id` trebuie sa fie chiar id-ul unui produs
 * de-al magazinului. Contul lui de OLX e al lui: poate avea acolo zeci de anunturi puse de mana,
 * care n-au nicio treaba cu Edinio, iar noi n-avem voie nici sa le atingem, nici sa le socotim ale
 * noastre.
 *
 * ⚠ SI NU SE STERGE NIMIC. Ce nu se potriveste se SCRIE in jurnal, ca sa se uite un om. Stergerea
 * unui anunt e singurul efect din tot marketplace-ul care nu se poate desface de la noi — vezi nota
 * de la paza anti-duplicat — iar o reconciliere care sterge singura, pe o presupunere, e cel mai
 * scump fel de a gresi.
 */
export async function reconciliazaAnunturile(
  admin: Db, ctx: OlxSyncContext, businessId: string, deLa: number,
): Promise<{ ok: true; urmatorul: number; adoptate: number } | { ok: false; error: string }> {
  const lor = await listAdverts(ctx.token, { offset: deLa, limit: RECONCILE_PAGINA });
  if (isOlxError(lor)) return { ok: false, error: `lista de anunturi nu s-a putut citi: ${lor.error}` };
  const anunturi = (lor.data ?? []).filter((a) => a?.id);

  /*
   * ⚠ Pagina goala inseamna „am ajuns la capat", deci roata se intoarce la zero. Fara asta,
   * cursorul ar creste la nesfarsit si reconcilierea ar citi vesnic pagini goale.
   */
  if (anunturi.length === 0) return { ok: true, urmatorul: 0, adoptate: 0 };
  const urmatorul = anunturi.length < RECONCILE_PAGINA ? 0 : deLa + anunturi.length;

  /* Numai anunturile care poarta un `external_id` — restul sunt ale lui, puse de mana. */
  const alenoastre = anunturi.filter((a) => typeof a.external_id === "string" && a.external_id.length > 0);
  if (alenoastre.length === 0) return { ok: true, urmatorul, adoptate: 0 };

  const idsProduse = [...new Set(alenoastre.map((a) => a.external_id as string))];
  const { data: randuri, error: eRanduri } = await admin
    .from("olx_adverts")
    .select("id, offer_id, olx_advert_id, sters_de_om_la")
    .eq("business_id", businessId)
    .in("offer_id", idsProduse);
  /* ⚠ Fara randurile noastre, „necunoscut la noi" ar fi un neadevar despre TOATE. */
  if (eRanduri) return { ok: false, error: `randurile locale nu s-au putut citi: ${eRanduri.message}` };

  const { data: produse, error: eProduse } = await admin
    .from("products").select("id").eq("business_id", businessId).in("id", idsProduse);
  if (eProduse) return { ok: false, error: `produsele nu s-au putut citi: ${eProduse.message}` };
  const aleMele = new Set((produse ?? []).map((p) => p.id));

  const dupaOferta = new Map((randuri ?? []).map((r) => [r.offer_id, r]));
  const idLegate = new Set((randuri ?? []).map((r) => r.olx_advert_id).filter((x): x is number => x != null));

  const now = new Date().toISOString();
  let adoptate = 0;
  for (const a of alenoastre) {
    const produs = a.external_id as string;
    const randul = dupaOferta.get(produs);
    const hot = hotarareaReconcilierii({
      advertId: a.id,
      eAlNostru: aleMele.has(produs),
      cunoscut: idLegate.has(a.id),
      randul,
    });
    if (hot.fel === "stim") continue;
    if (hot.fel === "nu-e-al-nostru") {
      /*
       * ⚠ Anunt viu la ei, pentru un produs care nu e al magazinului. NU se sterge: poate fi un
       * produs sters, un import care a schimbat id-uri, sau chiar un `external_id` pus de mana.
       */
      await logError({
        action: "olx.reconciliere", severity: "warning",
        message: `anuntul OLX ${a.id} arata catre un produs care nu e in magazin`,
        details: { businessId, advertId: a.id, externalId: produs, status: a.status }, businessId,
      });
      continue;
    }
    if (hot.fel === "sters-de-om") {
      /* ⚠ Ca sa fie viu la ei desi omul l-a sters de la noi inseamna ca stergerea n-a mers pana la
         capat — dar hotararea lui ramane in picioare, deci nu-l adoptam inapoi. */
      await logError({
        action: "olx.reconciliere", severity: "warning",
        message: `anuntul OLX ${a.id} e viu la ei, desi omul l-a sters de la noi`,
        details: { businessId, advertId: a.id, offerId: produs }, businessId,
      });
      continue;
    }
    if (hot.fel === "duplicat") {
      /* ⚠ DOUA anunturi pentru acelasi produs. Se scrie, nu se alege: care dintre ele e „cel bun"
         nu poate hotari un cron — unul are istoric, mesaje, poate si o vanzare in curs. */
      await logError({
        action: "olx.reconciliere", severity: "critical",
        message: `produsul are DOUA anunturi la OLX: ${hot.legat} (legat) si ${a.id} (nelegat)`,
        details: { businessId, offerId: produs, legat: hot.legat, nelegat: a.id }, businessId,
      });
      continue;
    }
    /* Randul exista dar e nelegat, sau nu exista deloc: in amandoua cazurile, se leaga. */
    const { error: eLegat } = await admin.from("olx_adverts").upsert(
      { business_id: businessId, offer_id: produs, product_id: produs, ...advertPatch(a, now) } as never,
      { onConflict: "business_id,offer_id" },
    );
    if (eLegat) {
      await logError({
        action: "olx.reconciliere", severity: "error",
        message: `anuntul OLX ${a.id} n-a putut fi legat inapoi: ${eLegat.message}`,
        details: { businessId, advertId: a.id, offerId: produs }, businessId,
      });
      continue;
    }
    adoptate++;
    await logError({
      action: "olx.reconciliere", severity: "warning",
      message: `anuntul OLX ${a.id} era viu la ei si necunoscut la noi; a fost legat inapoi la produs`,
      details: { businessId, advertId: a.id, offerId: produs, status: a.status }, businessId,
    });
  }
  return { ok: true, urmatorul, adoptate };
}

/**
 * Omul a ales care anunt se pastreaza. Restul se retrag, si conflictul se stinge.
 *
 * ═══ ALEGEREA E A LUI, EXECUTIA E A NOASTRA ═══
 *
 * Cand un produs vandabil are doua anunturi vii, publicarea se opreste si se scrie conflictul
 * (vezi `upsertRemote`). Aici se duce la capat ce a hotarat el: cel ales se leaga, ceilalti se
 * retrag de-a dreptul.
 *
 * ⚠ SE VERIFICA CA ALEGEREA LUI E INCA ADEVARATA. Intre clipa in care a vazut ecranul si apasare
 * pot trece minute: un anunt poate fi sters intre timp de la ei, sau starea se poate schimba. Se
 * cere lista din nou, si daca cel ales nu mai e printre ele, nu se face nimic.
 *
 * ⚠ Retragerile se fac INAINTEA legarii: daca una pica, conflictul ramane scris si omul mai poate
 * incerca. Legat intai, am fi ramas cu un produs „rezolvat" si un anunt inca viu.
 */
export async function rezolvaConflictul(
  admin: Db, ctx: OlxSyncContext, businessId: string, offerId: string, pastreazaId: number,
): Promise<SyncOutcome> {
  return faraCitiriPicate(async () => {
    const row = await getRow(admin, businessId, offerId);
    if (!row?.conflict_la) return { ok: true, action: "skipped" };

    const lor = await anunturileLorPentru(ctx, offerId, false);
    if (!lor.ok) return lor.esec;
    const ales = lor.anunturi.find((a) => a.id === pastreazaId);
    if (!ales) {
      return {
        ok: false, permanent: true,
        error: "Anunțul ales nu mai există la OLX. Reîncarcă pagina ca să vezi situația actuală.",
      };
    }

    for (const a of lor.anunturi) {
      if (a.id === pastreazaId) continue;
      const r = await retrageLaEi(ctx, a.id, String(a.status ?? ""));
      if (!r.ok) return r.esec;
    }

    const acum = new Date().toISOString();
    const { error: eLegat } = await admin.from("olx_adverts").upsert(
      {
        business_id: businessId, offer_id: offerId, product_id: row.offer_id,
        conflict_la: null, conflict_iduri: null,
        ...advertPatch(ales, acum),
      } as never,
      { onConflict: "business_id,offer_id" },
    );
    if (eLegat) {
      return { ok: false, permanent: false, error: `alegerea nu s-a putut scrie: ${eLegat.message}` };
    }
    await logError({
      action: "olx.conflict", severity: "warning",
      message: `conflictul de anunturi s-a rezolvat: se pastreaza ${pastreazaId}, s-au retras ${lor.anunturi.length - 1}`,
      details: { offerId, pastreazaId, retrase: lor.anunturi.filter((a) => a.id !== pastreazaId).map((a) => a.id) },
      businessId,
    });
    return { ok: true, action: "updated", status: ales.status, url: ales.url ?? null };
  });
}

/* ── De ce a fost respins, si cati s-au uitat ─────────────────────────────── */

/** Starile in care OLX chiar are ce sa ne spuna despre o respingere. */
const RESPINSE = ["moderated", "blocked", "disabled", "removed_by_moderator"];

/**
 * Cere motivul respingerii si il scrie pe rand.
 *
 * ═══ „DE CE NU APARE PRODUSUL MEU PE OLX?" (01.09.2026) ═══
 *
 * Pana azi comerciantul vedea „Moderat" sau „Eroare", si atat. OLX are o ruta separata care spune
 * EXACT ce n-a mers — categoria nu se potriveste, lipseste un atribut, continutul nu e permis —
 * si n-o intrebam. Singurul drum al omului era suportul, care nu stia nici el.
 *
 * ⚠ SE CERE NUMAI CAND STAREA O SPUNE. Pe un anunt sanatos ruta raspunde gol sau `404`, iar o
 * cerere in plus pentru fiecare anunt la fiecare sondare ar dubla traficul degeaba.
 *
 * ⚠ SI SE SCRIE CE AU SPUS EI, cuvant cu cuvant. Reformulat, motivul ar deveni presupunerea
 * noastra despre ce au vrut sa zica — iar omul ar corecta altceva decat trebuie.
 *
 * ⚠ Clipa se scrie si cand n-au avut ce spune: fara ea n-am deosebi „am intrebat si nimic" de
 * „n-am intrebat inca", si am reintreba la fiecare trecere.
 */
export async function ceruMotivulRespingerii(
  admin: Db, ctx: OlxSyncContext, rowId: string, olxAdvertId: number,
): Promise<void> {
  const now = new Date().toISOString();
  const res = await getModerationReason(ctx.token, olxAdvertId);
  if (isOlxError(res)) {
    /* Nu stim de ce; se marcheaza doar ca am intrebat, ca sa nu batem in ei la fiecare sondare. */
    await admin.from("olx_adverts").update({ moderation_la: now } as never).eq("id", rowId);
    return;
  }
  const m = res.data ?? {};
  const bucati = [
    m.reason ?? m.message ?? "",
    ...(m.fields ?? []).map((f) => [f.field, f.message].filter(Boolean).join(": ")),
  ].filter(Boolean);
  const { error } = await admin.from("olx_adverts").update({
    moderation_cod: m.code ?? null,
    moderation_text: bucati.length > 0 ? bucati.join(" · ").slice(0, 1000) : null,
    moderation_la: now,
    updated_at: now,
  } as never).eq("id", rowId);
  if (error) {
    await logError({
      action: "olx.moderare", severity: "warning",
      message: `motivul respingerii nu s-a putut scrie: ${error.message}`,
      details: { rowId, olxAdvertId },
    });
  }
}

/**
 * Cere statisticile unui anunt si le scrie: ultima valoare pe rand, si o linie pe zi in istoric.
 *
 * ⚠ O LINIE PE ZI, NU PE CERERE. Cheia primara pe (magazin, anunt, zi) face din a doua trecere o
 * actualizare. Fara ea, un cron care trece de trei ori pe zi ar face din „vizualizari" un grafic
 * cu trei puncte pe zi si nicio poveste.
 *
 * ⚠ NU SE INVENTEAZA ZERO. Un camp care lipseste din raspunsul lor ramane `null`: zero inseamna
 * „nimeni nu s-a uitat", ceea ce e cu totul altceva decat „nu stim".
 */
export async function ceruStatisticile(
  admin: Db, ctx: OlxSyncContext, businessId: string, rowId: string, olxAdvertId: number,
): Promise<void> {
  const now = new Date().toISOString();
  const res = await getAdvertStatistics(ctx.token, olxAdvertId);
  if (isOlxError(res)) {
    await admin.from("olx_adverts").update({ stat_la: now } as never).eq("id", rowId);
    return;
  }
  const st = res.data ?? {};
  const vizualizari = typeof st.advert_views === "number" ? st.advert_views : null;
  const telefon = typeof st.phone_views === "number" ? st.phone_views : null;
  const urmaritori = typeof st.users_observing === "number" ? st.users_observing : null;

  await admin.from("olx_adverts").update({
    stat_vizualizari: vizualizari, stat_telefon: telefon, stat_urmaritori: urmaritori,
    stat_la: now, updated_at: now,
  } as never).eq("id", rowId);

  const { error } = await admin.from("olx_statistici_zilnice").upsert(
    {
      business_id: businessId, olx_advert_id: olxAdvertId, zi: now.slice(0, 10),
      vizualizari, telefon, urmaritori, actualizat_la: now,
    } as never,
    { onConflict: "business_id,olx_advert_id,zi" },
  );
  if (error) {
    await logError({
      action: "olx.statistici", severity: "warning",
      message: `statisticile zilnice nu s-au putut scrie: ${error.message}`,
      details: { rowId, olxAdvertId }, businessId,
    });
  }
}
