"use server";

/**
 * Actiunile de panou ale integrarii eMAG (etapa 1: conectare, deconectare, stare,
 * nomenclatoare).
 *
 * Acelasi tipar ca la Trendyol si About You: o `guard()` care dovedeste
 * proprietatea magazinului, configurarea citita cu SERVICE ROLE si scrisa cu
 * clientul comerciantului, iar in afara nu pleaca niciodata acreditari — numai o
 * previzualizare mascata si booleeni.
 *
 * ⚠ Un modul `"use server"` poate exporta NUMAI functii asincrone. Constantele si
 * ajutoarele de mai jos raman neexportate dinadins: exportate, fiecare ar deveni un
 * endpoint HTTP inregistrat in manifestul global.
 */

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { logError } from "@/lib/error-logger";
import {
  emagGloballyEnabled, emagIpDeAlbit, emagWebhookUrl, iesireEmag, maskSecret, monedaEmag,
} from "@/lib/emag/auth";
import {
  citesteAdrese, citesteConturiCurier, descarcaEtichetaAwb, isEmagError, testeazaConexiunea,
  type EmagAuth, type FormatAwb, citesteFacturi, citesteCategoriiFacturi} from "@/lib/emag/client";
import {
  aduCategorie, aduCategorii, aduCoteTva, aduTimpiPregatire, alegeCotaTva, alegeTimpPregatire,
  caracteristiciLipsa, caracteristiciObligatorii, sugereazaCategorie,
} from "@/lib/emag/taxonomy";
import { fetchAllRowsStrict } from "@/lib/supabase/fetch-all";
import { bucatiDeIduri } from "@/lib/supabase/id-chunks";
import { cuMemorie, uitaAmintirile } from "@/lib/emag/memorie";
import { ceLipsestePentruPublicare, loadEmagContext } from "@/lib/emag/sync";
import { trimiteElement, magazinDin} from "@/lib/emag/trimite";
import { alegereaCurierului, contPotrivit, emiteAwb } from "@/lib/emag/awb";
import { schimbaStareaReturului, treceriPosibile, poateAwbRetur, PICKUP_CURIER_PROPRIU} from "@/lib/emag/rma";
import { aduComenzile, aduIstoricul, type RezultatIstoric } from "@/lib/emag/orders";
import { cuFir, firNou } from "@/lib/emag/jurnal";
import { pretPentruSmartDeals, propuneOferte } from "@/lib/emag/campanii";
/* ⚠ Regula casei pentru „cat incaseaza curierul", scrisa dupa comanda #0033:
   105,50 lei plecati fara nicio cale de incasare. Vezi `orders/ramburs.ts`. */
import { rambursDeIncasat } from "@/lib/orders/ramburs";
import {
  adunaPeCategorii, facturileLorPentruEcran, numeleCategoriilor,
  type FacturaEcran, type TotalPeCategorie,
} from "@/lib/emag/comisioane";
import {
  cePiedicaAreCampania, pregatestePropunerile, type OfertaPentruCampanie,
} from "@/lib/emag/propuneri";
import {
  leagaOferteleNoi, ruleazaImportEmag, SURSA_EMAG, type RezultatImportEmag,
} from "@/lib/emag/import-run";
import { processImport } from "@/lib/import/committer";
import {
  EMAG_ETICHETA_TARA, EMAG_TARA_IMPLICITA, EMAG_TARI,
  type EmagAdresa, type EmagCategorie, type EmagContCurier, type EmagCotaTva, type EmagConfig,
  type EmagIntrareCategorie,
  ceUrmeazaLaRetur, EMAG_ETICHETA_STARE, EMAG_STATUS_RETUR, EMAG_TIP_RETUR, EMAG_VALIDARE,
  type EmagTara, type EmagValoareTimpPregatire, type StareOferta,
} from "@/lib/emag/types";
import { traducereaPoateBloca } from "@/lib/emag/rute";
import { citesteMemoriaDerivei, sursaAdevarului } from "@/lib/emag/deriva";
import { grupeaza, VALIDARE_RA, type GrupProbleme, type Necaz } from "@/lib/emag/probleme";
import { alegeSupplyLeadTime, oferteUsoare, type ProdusDeCartografiat } from "@/lib/emag/mapping";
import { dimensiuniPropuse, type LinieColet, type PropunereDimensiuni } from "@/lib/emag/colete";
import { enqueueEmagPretMany, enqueueEmagStocMany, enqueueEmagSyncMany, publicaPeEmagMany} from "@/lib/emag/queue";

type ServerClient = Awaited<ReturnType<typeof createClient>>;
const FEATURE_PATH = "/dashboard/features/emag";

interface OwnBiz { id: string; slug: string; store_name: string | null; business_name: string }

async function ownedBusiness(supabase: ServerClient, businessId: string, userId: string): Promise<OwnBiz | null> {
  const { data } = await supabase
    .from("businesses").select("id, slug, store_name, business_name")
    .eq("id", businessId).eq("user_id", userId).single();
  return (data as OwnBiz) ?? null;
}

async function guard(businessId: string): Promise<{ supabase: ServerClient; userId: string; biz: OwnBiz } | { error: string }> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: "Neautorizat" };
  const biz = await ownedBusiness(supabase, businessId, user.id);
  if (!biz) return { error: "Magazin negasit" };
  return { supabase, userId: user.id, biz };
}

/*
 * ⚠ CITIREA SE FACE CU SERVICE ROLE, nu cu clientul comerciantului.
 *
 * `privat.decripteaza_config` iese pe prima linie pentru `anon`/`authenticated`,
 * deci pe clientul lui vederea intoarce `password` ca `enc.v1.…`, iar eMAG
 * raspunde 401 la fiecare apel. Asimetria face defectul greu de recunoscut: cronul
 * (service role) ar merge, iar ecranele de nomenclatoare ar cadea — exact cum s-a
 * intamplat la Trendyol.
 *
 * Service role ocoleste RLS, deci proprietatea magazinului TREBUIE dovedita
 * separat. Toti apelantii de mai jos trec prin `guard()` inainte.
 */
/*
 * ⚠ O CITIRE CAZUTA NU ARE VOIE SA ARATE CA O CONFIGURARE GOALA.
 *
 * Forma dinainte ignora `error` si intorcea `{}` cand citirea dadea gres. Iar apelantii
 * fac apoi `saveConfig(...)` cu INTREGUL obiect — deci un gol inchipuit se scria peste
 * acreditari, si integrarea se deconecta singura, fara nicio eroare nicaieri.
 *
 * S-a intamplat: 24.08.2026, un magazin cu Trendyol si 1272 de listari active a ramas
 * cu `trendyol_config = {"reconcile_page": 20}`. Comerciantul n-a atins nimic.
 *
 * ⚠ `maybeSingle`, nu `single`: un magazin FARA rand e o stare legitima (nou creat), si
 * acolo `{}` e chiar raspunsul corect. Ce nu e legitim e sa nu poti citi si sa spui gol.
 * `single` le confunda: lipsa randului iesea tot ca eroare.
 *
 * ⚠ Aruncarea e voita. Apelantii au deja ramuri de esec; un gol tacut n-are.
 */
async function loadConfig(businessId: string): Promise<EmagConfig> {
  const { data, error } = await createAdminClient()
    .from("store_settings").select("emag_config").eq("business_id", businessId).maybeSingle();
  if (error) {
    throw new Error(`Configurarea nu s-a putut citi: ${error.message}`);
  }
  return ((data?.emag_config as EmagConfig) ?? {}) || {};
}

async function saveConfig(supabase: ServerClient, businessId: string, config: EmagConfig): Promise<boolean> {
  const { data: existing } = await supabase
    .from("store_settings").select("id").eq("business_id", businessId).single();
  if (existing) {
    const { error } = await supabase.from("store_settings")
      .update({ emag_config: config as never, updated_at: new Date().toISOString() })
      .eq("business_id", businessId);
    return !error;
  }
  const { error } = await supabase.from("store_settings")
    .insert({ business_id: businessId, emag_config: config as never });
  return !error;
}

function authDinConfig(config: EmagConfig, businessId: string): EmagAuth {
  return {
    username: config.username ?? "",
    password: config.password ?? "",
    tara: config.tara ?? EMAG_TARA_IMPLICITA,
    businessId,
  };
}

/* ═══════════════════════════════════════════════════════════════════════════
   STARE
   ═══════════════════════════════════════════════════════════════════════════ */

export interface StareEmag {
  globallyEnabled: boolean;
  /** ⚠ Fara releu cu IP fix, integrarea nu poate porni deloc. Vezi `auth.ts`. */
  iesireConfigurata: boolean;
  ipDeAlbit: string | null;
  connected: boolean;
  needsReconnect: boolean;
  tara: EmagTara;
  taraEticheta: string;
  moneda: string;
  username: string | null;
  parolaMascata: string | null;
  autoSync: boolean;
  autoPublish: boolean;
  /** Ce mai trebuie ales inainte de prima publicare, daca mai trebuie ceva. */
  lipsaPentruPublicare: string | null;
  /**
   * Adresa la care eMAG poate trimite notificari.
   *
   * ⚠ NU SE INREGISTREAZA PRIN API. Cautat in tot OpenAPI-ul lor: nu exista nicio
   * ruta care sa primeasca un URL de callback. Notificarile exista, dar adresa se
   * pune din partea LOR, la cerere. De aceea se arata pe ecran cu tot cu explicatia
   * — altfel comerciantul ar astepta la nesfarsit ceva ce nimeni nu i-a cerut.
   */
  webhookUrl: string;
  /** Cand a sunat ultima data eMAG cu o notificare. `null` = niciodata. */
  ultimulWebhook: string | null;
  /** Cand s-au adus ultima data comenzile. Marcajul cronului, nu o scriere in plus. */
  ultimaSincronizare: string | null;
  vatId: number | null;
  handlingTime: number | null;
  greenTax: number | null;
  stocRezervat: number | null;
  /** Cate zile ii trebuie magazinului ca sa se reaprovizioneze. `null` = nedeclarat. */
  supplyLeadTime: number | null;
  syncContinut: boolean;
  /**
   * Cine are ultimul cuvânt când ce e pe eMAG nu mai e ce am trimis (§69).
   *
   * ⚠ Două comutatoare, nu unul: aproape orice comerciant vrea ca Edinio să țină
   * STOCUL, dar mulți își țin PREȚUL în panoul eMAG, din campanii.
   */
  derivaPret: "edinio" | "emag";
  derivaStoc: "edinio" | "emag";
  categoriiMapate: number;
  oferte: {
    total: number;
    /** Vandabile la ei: toate cele patru conditii deodata. */
    active: number;
    /** Trimise sau in coada, asteptand verdictul lor. */
    inValidare: number;
    /** Respinse de ei. ⚠ Se citeste din `validation_status`, nu din `status`. */
    respinse: number;
    eroare: number;
    /** Preluate din contul lor la import. Nu li se trimite nimic automat. */
    preluate: number;
    /**
     * Oferte la care ce e pe eMAG nu mai e ce trimitem noi (§68).
     *
     * ⚠ Numărul ăsta e cel mai important din tot panoul, și e și cel mai ușor de
     * trecut cu vederea: ofertele derivate arată perfect sănătoase — publicate,
     * aprobate, fără nicio eroare — dar se vând la alt preț decât crede
     * comerciantul. Până acum nu le număra nimeni.
     */
    derivate: number;
  };
  inCoada: number;
  /**
   * Elemente oprite dupa ce si-au ars toate incercarile.
   *
   * ⚠ NU se sterg. Sterse, nimeni nu le mai putea vedea, numara sau relua — iar
   * panoul ar fi aratat „0 in asteptare" pentru un catalog intreg care nu plecase.
   */
  abandonate: number;
}

export async function getEmagStatus(businessId: string): Promise<StareEmag | { error: string }> {
  const g = await guard(businessId);
  if ("error" in g) return g;

  const config = await loadConfig(businessId);
  const admin = createAdminClient();
  const tara = config.tara ?? EMAG_TARA_IMPLICITA;

  /*
   * ⚠ NUMARATORI, NU RANDURI. Citite ca `select("id")` si numarate in JavaScript,
   * ar fi lovit plafonul TACUT de 1000 al lui PostgREST: un magazin cu 4000 de
   * oferte ar fi vazut in panou 1000, si ar fi crezut ca trei sferturi din catalog
   * n-au ajuns niciodata la eMAG.
   */
  /*
   * ═══ ⚠ STARILE SE SCRIU CU TIPUL, NU CU SIRURI LIBERE ═══
   *
   * Prima forma numara dupa „activ", „in_validare", „respins", „eroare" — nume
   * inventate inainte sa existe `StareOferta`, si care nu se potrivesc cu NICIUNA
   * dintre starile pe care le scrie codul.
   *
   * Deci toate cele patru numaratori intorceau ZERO. Un comerciant cu 400 de oferte
   * publicate ar fi vazut in panou „400 oferte · 0 active · 0 în validare" si ar fi
   * tras singura concluzie cu sens: ca integrarea nu merge. Nicio eroare nicaieri —
   * o interogare care nu gaseste nimic e o interogare reusita.
   *
   * Scrise cu `satisfies StareOferta`, `tsc` refuza de acum orice nume care nu e in
   * uniune. Exact pentru asta a fost facuta uniunea.
   */
  const stare = (s: StareOferta) =>
    admin.from("emag_offers").select("*", { count: "exact", head: true })
      .eq("business_id", businessId).eq("status", s);

  const [total, active, inValidare, respinse, eroare, preluate, derivate, inCoada, abandonate] = await Promise.all([
    admin.from("emag_offers").select("*", { count: "exact", head: true }).eq("business_id", businessId),
    stare("live"),
    admin.from("emag_offers").select("*", { count: "exact", head: true })
      .eq("business_id", businessId).in("status", ["queued", "sent"] satisfies StareOferta[]),
    /* ⚠ Respingerea se citeste din `validation_status`, unde o spun EI, nu din
       `status`, care e al nostru: 5 marca respinsa · 6 EAN respins · 8 documentatie
       respinsa · 10 blocat · 12 actualizare respinsa. */
    admin.from("emag_offers").select("*", { count: "exact", head: true })
      .eq("business_id", businessId).in("validation_status", [5, 6, 8, 10, 12]),
    stare("error"),
    stare("imported"),
    /* ⚠ Se numără pe `deriva is not null`, care are index PARȚIAL: în starea sănătoasă
       indexul e gol, deci numărătoarea nu costă nimic pe un catalog de zeci de mii. */
    admin.from("emag_offers").select("*", { count: "exact", head: true })
      .eq("business_id", businessId).not("deriva", "is", null),
    admin.from("emag_sync_queue").select("*", { count: "exact", head: true })
      .eq("business_id", businessId).is("abandonat_la", null),
    admin.from("emag_sync_queue").select("*", { count: "exact", head: true })
      .eq("business_id", businessId).not("abandonat_la", "is", null),
  ]);

  const iesire = iesireEmag();

  return {
    globallyEnabled: emagGloballyEnabled(),
    iesireConfigurata: iesire.eroare === null,
    ipDeAlbit: emagIpDeAlbit(),
    connected: config.connected === true,
    needsReconnect: config.needs_reconnect === true,
    tara,
    taraEticheta: EMAG_ETICHETA_TARA[tara],
    moneda: monedaEmag(tara),
    username: config.username ?? null,
    parolaMascata: config.password ? maskSecret(config.password) : null,
    autoSync: config.auto_sync !== false,
    autoPublish: config.auto_publish === true,
    lipsaPentruPublicare: ceLipsestePentruPublicare(config),
    webhookUrl: emagWebhookUrl(businessId),
    ultimulWebhook: config.ultimul_webhook ?? null,
    /* ⚠ Se citeste marcajul care EXISTA deja, nu se scrie unul nou la fiecare trecere.
       Un camp „ultima trecere" ar fi insemnat o scriere pe minut si pe magazin, pentru
       o informatie pe care cursorul comenzilor o poarta oricum. */
    ultimaSincronizare: config.orders_synced_at ?? null,
    vatId: config.vat_id ?? null,
    handlingTime: config.handling_time ?? null,
    greenTax: config.green_tax ?? null,
    stocRezervat: config.stoc_rezervat ?? null,
    supplyLeadTime: config.supply_lead_time ?? null,
    /* ⚠ Implicit PORNIT: cine publică din Edinio se așteaptă ca fișa să vină tot de acolo. */
    syncContinut: config.sync_continut !== false,
    /* ⚠ Prin `sursaAdevarului`, nu prin `?? "edinio"`. O valoare stricată în config ar
       fi ajuns pe ecran ca atare, iar comutatorul ar fi arătat altceva decât face
       cronul — care trece oricum valoarea prin aceeași funcție. */
    derivaPret: sursaAdevarului(config.deriva_pret),
    derivaStoc: sursaAdevarului(config.deriva_stoc),
    categoriiMapate: Object.keys(config.category_map ?? {}).length,
    oferte: {
      total: total.count ?? 0,
      active: active.count ?? 0,
      inValidare: inValidare.count ?? 0,
      respinse: respinse.count ?? 0,
      eroare: eroare.count ?? 0,
      preluate: preluate.count ?? 0,
      derivate: derivate.count ?? 0,
    },
    inCoada: inCoada.count ?? 0,
    abandonate: abandonate.count ?? 0,
  };
}

/* ═══════════════════════════════════════════════════════════════════════════
   CONECTARE
   ═══════════════════════════════════════════════════════════════════════════ */

export async function connectEmag(
  businessId: string,
  date: { username: string; password: string; tara: EmagTara; vendorName?: string },
): Promise<{ success: true } | { error: string }> {
  const g = await guard(businessId);
  if ("error" in g) return g;

  if (!emagGloballyEnabled()) {
    return { error: "Integrarea eMAG este momentan indisponibilă." };
  }

  /*
   * ⚠ Se verifica IESIREA INAINTE de acreditari. Fara releu, eMAG raspunde 403 sau
   * nu raspunde deloc, iar mesajul lui nu pomeneste nimic despre IP-uri —
   * comerciantul si-ar fi cautat o zi intreaga o greseala in parola.
   */
  const iesire = iesireEmag();
  if (iesire.eroare) {
    void logError({
      action: "emag.connect",
      message: "iesirea catre eMAG nu e configurata (EMAG_PROXY_URL)",
      businessId,
      userId: g.userId,
      severity: "critical",
    });
    return { error: "Integrarea eMAG nu este pregătită pe platformă. Am fost anunțați; încearcă mai târziu." };
  }

  const username = (date.username ?? "").trim();
  const parolaPrimita = (date.password ?? "").trim();

  if (!username) {
    return { error: "Completează utilizatorul de API din contul tău eMAG (Marketplace API, nu userul de panou)." };
  }
  if (!EMAG_TARI.includes(date.tara)) {
    return { error: "Alege țara contului eMAG." };
  }

  const veche = await loadConfig(businessId);

  /*
   * ⚠ O parola goala inseamna „nu o schimba", nu „sterge-o". Fara regula asta, un
   * comerciant care schimba doar tara si-ar fi sters credentiala fara sa stie —
   * exact defectul descris in `lib/integrari/secrete.ts`.
   */
  const password = parolaPrimita || veche.password || "";
  if (!password) {
    return { error: "Completează parola de API." };
  }

  const auth: EmagAuth = { username, password, tara: date.tara, businessId };
  const proba = await testeazaConexiunea(auth);
  if (!proba.ok) {
    return { error: proba.error };
  }

  const noua: EmagConfig = {
    ...veche,
    connected: true,
    username,
    password,
    tara: date.tara,
    vendor_name: (date.vendorName ?? "").trim() || veche.vendor_name,
    needs_reconnect: false,
    auto_sync: veche.auto_sync ?? true,
    auto_publish: veche.auto_publish ?? false,
    warehouse_id: veche.warehouse_id ?? 1,
    warranty_default: veche.warranty_default ?? 24,
    price_band_pct: veche.price_band_pct ?? 30,
  };

  const ok = await saveConfig(g.supabase, businessId, noua);
  if (!ok) {
    void logError({
      action: "emag.connect",
      message: "conexiunea a mers, dar salvarea configuratiei a picat",
      businessId,
      userId: g.userId,
      severity: "error",
    });
    return { error: "Conexiunea a mers, dar salvarea a eșuat. Încearcă din nou." };
  }

  /*
   * ⚠ SE UITA CE STIAM. `is_allowed` e per vanzator si difera pe tara: un cont nou
   * sau o tara noua inseamna alt raft. Pastrata, memoria veche ar fi aratat categorii
   * in care comerciantul nu mai are voie sa vanda — iar produsele trimise acolo se
   * resping cu o eroare de documentatie care nu pomeneste nimic despre acces.
   */
  await uitaAmintirile(createAdminClient(), businessId);

  revalidatePath(FEATURE_PATH);
  return { success: true };
}

export async function disconnectEmag(businessId: string): Promise<{ success: true } | { error: string }> {
  const g = await guard(businessId);
  if ("error" in g) return g;

  const ok = await saveConfig(g.supabase, businessId, {});
  if (!ok) return { error: "Nu am putut deconecta contul. Încearcă din nou." };

  /*
   * ⚠ Se sterg randurile LOCALE, nu ofertele de la eMAG. eMAG nu are stergere de
   * oferta; ce ramane acolo se opreste din vanzare separat, cu `status = 0`, si
   * numai daca o cere comerciantul. O deconectare care ar retrage tot de pe eMAG ar
   * fi o pierdere pe care nimeni n-a cerut-o.
   */
  const admin = createAdminClient();
  await admin.from("emag_sync_queue").delete().eq("business_id", businessId);
  await admin.from("emag_offers").delete().eq("business_id", businessId);
  /* ⚠ Si memoria nomenclatoarelor. Nu tinem minte raftul unui cont care nu mai e
     legat — iar la o reconectare pe alt cont, `is_allowed` e altul. */
  await uitaAmintirile(admin, businessId);

  revalidatePath(FEATURE_PATH);
  return { success: true };
}

/* ═══════════════════════════════════════════════════════════════════════════
   NOMENCLATOARE
   ═══════════════════════════════════════════════════════════════════════════ */

async function contextPentruCitire(
  businessId: string,
): Promise<{ auth: EmagAuth; config: EmagConfig } | { error: string }> {
  const g = await guard(businessId);
  if ("error" in g) return g;
  const config = await loadConfig(businessId);
  if (!config.connected || !config.username || !config.password) {
    return { error: "Conectează mai întâi contul eMAG." };
  }
  return { auth: authDinConfig(config, businessId), config };
}

export async function getEmagCoteTva(
  businessId: string,
): Promise<{ cote: EmagCotaTva[]; sugerata: number | null } | { error: string }> {
  const c = await contextPentruCitire(businessId);
  if ("error" in c) return c;

  const cote = await aduCoteTva(c.auth);
  if ("error" in cote) return cote;

  /*
   * Cota magazinului, tradusa in `vat_id`-ul lor. ⚠ Cand nu se potriveste nimic,
   * `alegeCotaTva` intoarce `null` si NU cea implicita a contului: un `vat_id`
   * gresit nu da eroare, oferta se vinde cu TVA-ul altcuiva si se afla la
   * contabilitate.
   */
  const { data } = await createAdminClient()
    .from("store_settings").select("vat_rate").eq("business_id", businessId).single();
  const rata = Number(data?.vat_rate ?? 0);
  const potrivita = alegeCotaTva(cote, rata);

  return { cote, sugerata: potrivita?.vat_id ?? null };
}

export async function getEmagTimpiPregatire(
  businessId: string,
): Promise<{ valori: EmagValoareTimpPregatire[] } | { error: string }> {
  const c = await contextPentruCitire(businessId);
  if ("error" in c) return c;
  const valori = await aduTimpiPregatire(c.auth);
  if ("error" in valori) return valori;
  return { valori };
}

export async function getEmagConturiCurier(
  businessId: string,
): Promise<{ conturi: EmagContCurier[] } | { error: string }> {
  const c = await contextPentruCitire(businessId);
  if ("error" in c) return c;
  const r = await citesteConturiCurier(c.auth);
  if (isEmagError(r)) return { error: r.error };
  return { conturi: Array.isArray(r.data) ? r.data : [] };
}

export async function getEmagAdrese(
  businessId: string,
): Promise<{ adrese: EmagAdresa[] } | { error: string }> {
  const c = await contextPentruCitire(businessId);
  if ("error" in c) return c;
  const r = await citesteAdrese(c.auth);
  if (isEmagError(r)) return { error: r.error };
  return { adrese: Array.isArray(r.data) ? r.data : [] };
}

/**
 * Sugestii de categorie eMAG pentru categoriile magazinului.
 *
 * ⚠ NIMIC NU SE APLICA SINGUR. O categorie potrivita gresit nu da eroare —
 * produsele chiar se listeaza, dar in raftul altcuiva, cu caracteristicile altei
 * categorii, iar comerciantul afla din reclamatii. Regula e a potrivitorului
 * refolosit de la Trendyol: mai bine nicio sugestie decat una gresita.
 */
export async function sugereazaCategoriiEmag(
  businessId: string,
  optiuni: { fortat?: boolean } = {},
): Promise<
  | { sugestii: Record<string, { id: number; label: string; scor: number; incredere: string }[]>;
      trunchiat: boolean; dinMemorie: boolean; adusLa: number | null; cate: number }
  | { error: string }
> {
  const c = await contextPentruCitire(businessId);
  if ("error" in c) return c;

  const admin = createAdminClient();

  /*
   * ═══ ⚠ RAFTUL LOR SE ȚINE MINTE, NU SE CERE LA FIECARE APĂSARE ═══
   *
   * `aduCategorii` paginează până la 60 de pagini la 3 cereri pe secundă. Cerut de
   * fiecare dată, ecranul aștepta până la douăzeci de secunde — și, mai rău, ținea
   * ocupat douăzeci de secunde ritmul de care are nevoie coada: aceleași 3 cereri pe
   * secundă prin care pleacă o mișcare de stoc după o vânzare.
   *
   * ⚠ `fortat` există pentru butonul „Reîmprospătează": o listă veche nu strică
   * nimic, dar comerciantul care tocmai a cerut acces la o categorie nouă trebuie să
   * o poată vedea fără să aștepte o săptămână.
   */
  const memorat = await cuMemorie<EmagCategorie[]>(
    admin,
    { businessId, tara: c.config.tara, cont: c.config.username, fel: "categorii" },
    async () => {
      const a = await aduCategorii(c.auth);
      return { date: a.categorii, cate: a.categorii.length, trunchiat: a.trunchiat, eroare: a.error };
    },
    { fortat: optiuni.fortat },
  );

  /* ⚠ Fără nicio listă — nici proaspătă, nici memorată — nu se ghicește nimic. */
  if (!memorat.date) return { error: memorat.eroare ?? "Categoriile eMAG nu s-au putut citi." };

  const adus = { categorii: memorat.date, trunchiat: memorat.trunchiat };

  const { data: produse } = await admin
    .from("products").select("category").eq("business_id", businessId).not("category", "is", null);

  const numeUnice = [...new Set((produse ?? []).map((p) => (p.category ?? "").trim()).filter(Boolean))];

  const sugestii: Record<string, { id: number; label: string; scor: number; incredere: string }[]> = {};
  for (const nume of numeUnice) {
    sugestii[nume] = sugereazaCategorie(nume, adus.categorii, 3).map((s) => ({
      id: s.categoryId, label: s.label, scor: s.scor, incredere: s.incredere,
    }));
  }

  return {
    sugestii,
    trunchiat: adus.trunchiat,
    dinMemorie: memorat.dinMemorie,
    adusLa: memorat.adusLa,
    cate: memorat.date.length,
  };
}

/* ═══════════════════════════════════════════════════════════════════════════
   SETARI
   ═══════════════════════════════════════════════════════════════════════════ */

export async function salveazaSetariEmag(
  businessId: string,
  setari: {
    vat_id?: number;
    handling_time?: number;
    warranty_default?: number;
    price_band_pct?: number;
    auto_sync?: boolean;
    auto_publish?: boolean;
    warehouse_id?: number;
    /** ⚠ Include TVA, spre deosebire de preturi. Numai pe eMAG RO. */
    green_tax?: number | null;
    /** Cate bucati se opresc pentru magazinul propriu. */
    stoc_rezervat?: number | null;
    /** Rescrie Edinio si fisa produsului (nume, descriere, poze)? */
    sync_continut?: boolean;
    /** Cate zile ii trebuie magazinului ca sa se reaprovizioneze (§15). */
    supply_lead_time?: number | null;
    /** Cine are ultimul cuvant la o derivare. Vezi `deriva.ts` (§69). */
    deriva_pret?: "edinio" | "emag";
    deriva_stoc?: "edinio" | "emag";
  },
): Promise<{ success: true } | { error: string }> {
  const g = await guard(businessId);
  if ("error" in g) return g;

  const veche = await loadConfig(businessId);
  if (!veche.connected) return { error: "Conectează mai întâi contul eMAG." };

  /*
   * ⚠ Banda de pret NU are voie sa fie zero. `min_sale_price` si `max_sale_price`
   * sunt obligatorii la prima salvare a unui produs, iar eMAG cere `max > min`.
   * Cu zero, FIECARE produs nou al magazinului ar fi respins, cu un mesaj care nu
   * pomeneste procentul. Se ridica aici, unde se poate spune de ce.
   */
  const banda = setari.price_band_pct;
  if (banda != null && (!Number.isFinite(banda) || banda < 1 || banda > 90)) {
    return { error: "Marja de preț trebuie să fie între 1% și 90%." };
  }

  /*
   * ⚠ REZERVA DE STOC SE MĂRGINEȘTE. Un număr uriaș pus din greșeală ar fi oprit de la
   * vânzare TOT catalogul, tăcut: `stocCuRezerva` dă zero, eMAG primește zero, iar
   * ofertele rămân publicate dar nevandabile. Nimic n-ar fi dat eroare.
   */
  const rez = setari.stoc_rezervat;
  if (rez != null && (!Number.isFinite(rez) || rez < 0 || rez > 10_000)) {
    return { error: "Rezerva de stoc trebuie să fie între 0 și 10.000 de bucăți." };
  }

  /* ⚠ Taxa verde INCLUDE TVA. Negativă n-are niciun înțeles, iar eMAG o refuză. */
  const taxa = setari.green_tax;
  if (taxa != null && (!Number.isFinite(taxa) || taxa < 0)) {
    return { error: "Taxa verde nu poate fi negativă." };
  }

  const noua: EmagConfig = {
    ...veche,
    ...(setari.vat_id != null ? { vat_id: setari.vat_id } : {}),
    ...(setari.handling_time != null ? { handling_time: setari.handling_time } : {}),
    ...(setari.warranty_default != null ? { warranty_default: setari.warranty_default } : {}),
    ...(banda != null ? { price_band_pct: banda } : {}),
    ...(setari.auto_sync != null ? { auto_sync: setari.auto_sync } : {}),
    ...(setari.auto_publish != null ? { auto_publish: setari.auto_publish } : {}),
    ...(setari.warehouse_id != null ? { warehouse_id: setari.warehouse_id } : {}),
    ...(setari.green_tax !== undefined ? { green_tax: setari.green_tax ?? undefined } : {}),
    ...(setari.stoc_rezervat !== undefined ? { stoc_rezervat: setari.stoc_rezervat ?? undefined } : {}),
    ...(setari.sync_continut != null ? { sync_continut: setari.sync_continut } : {}),
    /* ⚠ SE POTRIVESTE PE VALORILE LOR, nu se scrie numarul cerut. Enumul lor e
       2, 3, 5, 7, 14, 30, 60, 90, 120: un 10 pus de om ar fi fost refuzat de eMAG cu
       un mesaj despre camp, iar comerciantul ar fi cautat greseala in alta parte.
       `alegeSupplyLeadTime` rotunjeste IN SUS — promite mai incet, nu mai repede. */
    ...(setari.supply_lead_time !== undefined
      ? { supply_lead_time: alegeSupplyLeadTime(setari.supply_lead_time) ?? undefined }
      : {}),
    /* ⚠ Se scrie numai valoarea RECUNOSCUTA. Un sir venit de oriunde altundeva ar
       fi ajuns in config si l-ar fi facut pe `sursaAdevarului` sa cada pe implicit —
       adica setarea ar fi aratat una si ar fi facut alta. */
    ...(setari.deriva_pret === "edinio" || setari.deriva_pret === "emag"
      ? { deriva_pret: setari.deriva_pret } : {}),
    ...(setari.deriva_stoc === "edinio" || setari.deriva_stoc === "emag"
      ? { deriva_stoc: setari.deriva_stoc } : {}),
  };

  const ok = await saveConfig(g.supabase, businessId, noua);
  if (!ok) return { error: "Nu am putut salva setările. Încearcă din nou." };

  revalidatePath(FEATURE_PATH);
  return { success: true };
}

/**
 * Timpul de pregatire, ales dintre valorile INGADUITE de eMAG.
 *
 * ⚠ Rotunjeste IN SUS. Un magazin care expediaza in trei zile si primeste „2"
 * fiindca 2 e mai aproape decat 5 promite clientului mai repede decat poate, iar
 * la eMAG intarzierea se numara si scade nota vanzatorului.
 */
export async function potrivesteTimpPregatire(
  businessId: string,
  zileDorite: number,
): Promise<{ valoare: number | null } | { error: string }> {
  const c = await contextPentruCitire(businessId);
  if ("error" in c) return c;
  const valori = await aduTimpiPregatire(c.auth);
  if ("error" in valori) return valori;
  return { valoare: alegeTimpPregatire(valori, zileDorite) };
}

/* ═══════════════════════════════════════════════════════════════════════════
   IMPORTUL DIN eMAG (etapa 2)
   ═══════════════════════════════════════════════════════════════════════════ */

/**
 * Aduce ofertele din contul eMAG al comerciantului.
 *
 * Ce leaga, leaga; ce nu are corespondent, creeaza; ce nu e sigur, raporteaza si
 * lasa in seama omului. Hotararile sunt in `emag/import.ts`, efectele in
 * `emag/import-run.ts`; aici e doar dovada proprietatii si traducerea erorilor.
 *
 * ⚠ NU SE INGHITE NIMIC. Un import cazut se scrie in jurnal SI se intoarce omului,
 * cu mesajul lui. La feedul de stocuri, o cadere tacuta a insemnat sase zile in
 * care comerciantul credea ca merge.
 */
export async function importaDinEmag(
  businessId: string,
): Promise<RezultatImportEmag | { error: string }> {
  const g = await guard(businessId);
  if ("error" in g) return { error: g.error };

  if (!emagGloballyEnabled()) return { error: "Integrarea eMAG este oprită temporar." };

  const iesire = iesireEmag();
  if (iesire.eroare) return { error: iesire.eroare };

  try {
    const rezultat = await ruleazaImportEmag(businessId, g.userId);
    revalidatePath(FEATURE_PATH);
    return rezultat;
  } catch (e) {
    const mesaj = e instanceof Error ? e.message : "Importul din eMAG nu a putut fi dus la capăt.";
    void logError({
      action: "emag.import",
      message: mesaj,
      details: { businessId },
      severity: "error",
    });
    return { error: mesaj };
  }
}

/**
 * Leaga ofertele ramase fara produs, dupa ce conducta de import si-a terminat treaba.
 *
 * ⚠ EXISTA CA BUTON FIINDCA PASUL POATE RAMANE NEFACUT FARA VINA NIMANUI. Conducta
 * de import lucreaza pe bucati; cand catalogul e mare, ea e dusa la capat de bucla
 * din ecran sau de cronul de rezerva, si atunci rularea care a pornit importul s-a
 * incheiat demult. Ofertele stau scrise, doar nelegate.
 *
 * Pasul e re-derivabil (afla produsul din `products.external_id`), deci apasat de
 * doua ori nu strica nimic.
 */
export async function leagaOferteImportateEmag(
  businessId: string,
): Promise<{ legate: number } | { error: string }> {
  const g = await guard(businessId);
  if ("error" in g) return { error: g.error };

  try {
    const legate = await leagaOferteleNoi(createAdminClient(), businessId);
    if (legate > 0) revalidatePath(FEATURE_PATH);
    return { legate };
  } catch (e) {
    const mesaj = e instanceof Error ? e.message : "Legarea ofertelor nu a reușit.";
    void logError({ action: "emag.import.leaga", message: mesaj, details: { businessId }, severity: "error" });
    return { error: mesaj };
  }
}

/**
 * O bucata din crearea produselor venite de la eMAG.
 *
 * ═══ ⚠ DE CE NU SE FOLOSESTE `processImportChunk` DIN `import.actions` ═══
 *
 * Fiindca acela GHICESTE magazinul: `getOwnedBusinessId` ia primul magazin al
 * utilizatorului, dupa `created_at`. Azi merge — verificat in productie, niciun
 * utilizator nu are mai mult de un magazin — dar e o capcana care asteapta.
 *
 * In ziua in care Edinio da voie la doua magazine, importul eMAG al celui de-al
 * doilea ar fi cazut cu „Import negasit": jobul e al magazinului B, iar verificarea
 * il compara cu A. Iar mesajul n-ar fi pomenit nimic despre magazine, deci nimeni
 * n-ar fi legat eroarea de cauza.
 *
 * Aici magazinul se PRIMESTE si se dovedeste, ca peste tot in fisierul asta.
 */
export async function continuaImportEmag(
  businessId: string,
  importId: string,
): Promise<{ facute: number; total: number; gata: boolean } | { error: string }> {
  const g = await guard(businessId);
  if ("error" in g) return { error: g.error };

  const admin = createAdminClient();
  const { data: job } = await admin
    .from("product_imports").select("business_id, source").eq("id", importId).maybeSingle();
  if (!job || job.business_id !== businessId) return { error: "Import negăsit" };
  /* ⚠ Si sursa se verifica: actiunea asta n-are ce cauta pe un import din CSV. */
  if (job.source !== SURSA_EMAG) return { error: "Import negăsit" };

  try {
    const r = await processImport(admin, importId);
    if (r.done) revalidatePath("/dashboard/products");
    return {
      facute: r.totals.created + r.totals.skipped + r.totals.failed,
      total: r.totals.total,
      gata: r.done,
    };
  } catch (e) {
    const mesaj = e instanceof Error ? e.message : "Crearea produselor s-a oprit.";
    void logError({ action: "emag.import.bucata", message: mesaj, details: { businessId, importId }, severity: "error" });
    return { error: mesaj };
  }
}

/* ═══════════════════════════════════════════════════════════════════════════
   PUBLICARE SI TRIMITERE LA CERERE (etapa 3)
   ═══════════════════════════════════════════════════════════════════════════ */

/**
 * Trimite un produs pe eMAG ACUM, fara sa astepte trecerea cronului.
 *
 * ═══ ⚠ DE CE NU MERGE PRIN COADA ═══
 *
 * Fiindca omul se uita la ecran. Pus in coada, ar fi vazut „se trimite" si ar fi
 * asteptat pana la un minut fara nicio veste — iar daca eMAG refuza, motivul ar fi
 * aparut abia dupa aceea, intr-un alt ecran. Aici raspunsul lor vine inapoi in
 * aceeasi apasare, cu tot cu motiv.
 *
 * ⚠ `fortat: true`. Apasarea explicita trece si peste ofertele preluate: „nu trimite
 * singur" nu inseamna „nu trimite niciodata". Vezi `rutaDeTrimitere`.
 */
export async function trimiteAcumPeEmag(
  businessId: string,
  productId: string,
  op: "oferta" | "pret" | "stoc" | "masuratori" = "oferta",
): Promise<{ verdict: string; mesaj: string } | { error: string }> {
  const g = await guard(businessId);
  if ("error" in g) return { error: g.error };

  if (!emagGloballyEnabled()) return { error: "Integrarea eMAG este oprită temporar." };

  const iesire = iesireEmag();
  if (iesire.eroare) return { error: iesire.eroare };

  const admin = createAdminClient();
  const ctx = await loadEmagContext(admin, businessId);
  if (!ctx) return { error: "Contul eMAG nu este conectat." };

  /* ⚠ Se verifica INAINTE de a chema eMAG. Un produs fara cotă de TVA aleasa ar fi
     primit de la ei un refuz despre `vat_id` pe care comerciantul nu-l poate lega de
     niciun ecran de-al lui. */
  const lipsa = ceLipsestePentruPublicare(ctx.config);
  if (lipsa) return { error: lipsa };

  try {
    const r = await trimiteElement(admin, ctx, productId, op, true);
    revalidatePath(FEATURE_PATH);
    return { verdict: r.verdict, mesaj: r.mesaj };
  } catch (e) {
    const mesaj = e instanceof Error ? e.message : "Trimiterea către eMAG nu a reușit.";
    void logError({
      action: "emag.trimite",
      message: mesaj,
      details: { businessId, productId, op },
      severity: "error",
    });
    return { error: mesaj };
  }
}

/**
 * Opreste o ofertă de la vânzare pe eMAG.
 *
 * ⚠ eMAG NU ARE STERGERE DE OFERTA. Se trimite `status: 0`, si oferta ramane acolo,
 * nevandabila. Butonul trebuie sa spuna asta: „Retrage", nu „Șterge" — altfel
 * comerciantul apasa asteptand sa dispara si se sperie cand o vede tot in contul lui.
 */
export async function retrageDePeEmag(
  businessId: string,
  productId: string,
): Promise<{ verdict: string; mesaj: string } | { error: string }> {
  const g = await guard(businessId);
  if ("error" in g) return { error: g.error };

  const iesire = iesireEmag();
  if (iesire.eroare) return { error: iesire.eroare };

  const admin = createAdminClient();
  const ctx = await loadEmagContext(admin, businessId);
  if (!ctx) return { error: "Contul eMAG nu este conectat." };

  try {
    const r = await trimiteElement(admin, ctx, productId, "retragere", true);
    revalidatePath(FEATURE_PATH);
    return { verdict: r.verdict, mesaj: r.mesaj };
  } catch (e) {
    const mesaj = e instanceof Error ? e.message : "Retragerea nu a reușit.";
    void logError({ action: "emag.retrage", message: mesaj, details: { businessId, productId }, severity: "error" });
    return { error: mesaj };
  }
}

/**
 * Porneste sau opreste sincronizarea automată a unei oferte preluate.
 *
 * ⚠ E hotararea comerciantului, si numai a lui. Importul stinge `auto_sync` pentru
 * tot ce aduce, tocmai ca sa nu-i rescriem preturile puse in panoul eMAG. Cand vrea
 * invers — sa conduca din Edinio — o aprinde de aici, si de atunci coada o ia.
 */
export async function comutaSincronizareaOfertei(
  businessId: string,
  productId: string,
  pornit: boolean,
): Promise<{ success: true } | { error: string }> {
  const g = await guard(businessId);
  if ("error" in g) return { error: g.error };

  const { error } = await createAdminClient().from("emag_offers")
    .update({ auto_sync: pornit, updated_at: new Date().toISOString() })
    .eq("business_id", businessId).eq("product_id", productId);
  if (error) return { error: error.message };

  revalidatePath(FEATURE_PATH);
  return { success: true };
}

/* ═══════════════════════════════════════════════════════════════════════════
   AWB SI RETURURI (etapa 5)
   ═══════════════════════════════════════════════════════════════════════════ */

/**
 * Emite AWB-ul de livrare pentru o comandă eMAG.
 *
 * ⚠ Datele destinatarului se iau din comanda SALVATA LA NOI, nu din formular. Un
 * formular ar fi lasat loc ca cineva sa trimita coletul altundeva decat a cerut
 * clientul — iar la eMAG adresa e a lor, nu a noastra, si nu se negociaza.
 */
export async function emiteAwbEmag(
  businessId: string,
  orderId: string,
  optiuni?: { colete?: { weight: number; length: number; width: number; height: number }[]; observatii?: string },
): Promise<{ numar: string | null; deja: boolean } | { error: string }> {
  const g = await guard(businessId);
  if ("error" in g) return { error: g.error };

  const iesire = iesireEmag();
  if (iesire.eroare) return { error: iesire.eroare };

  const admin = createAdminClient();
  const ctx = await loadEmagContext(admin, businessId);
  if (!ctx) return { error: "Contul eMAG nu este conectat." };

  const { data: rand } = await admin.from("emag_orders")
    .select("emag_order_id, raw").eq("business_id", businessId).eq("order_id", orderId).maybeSingle();
  const r = rand as { emag_order_id: number; raw: unknown } | null;
  if (!r) return { error: "Comanda nu are corespondent eMAG." };

  const brut = (r.raw ?? {}) as {
    customer?: Record<string, unknown>;
    cashed_cod?: number;
    enforced_vendor_courier_accounts?: number[] | null;
    details?: { locker_id?: string };
  };

  /* ⚠ Lista impusa de comanda bate preferinta din setari: eMAG refuza orice cont din
     afara ei, iar o lista GOALA inseamna ca AWB-ul de marketplace nu se poate emite. */
  const alegere = alegereaCurierului(brut.enforced_vendor_courier_accounts ?? null);
  if (alegere.fel === "imposibil") {
    return { error: "eMAG nu permite emiterea unui AWB de marketplace pentru această comandă." };
  }

  const conturi = await citesteConturiCurier(ctx.auth);
  if (isEmagError(conturi)) return { error: conturi.error };

  const cont = contPotrivit(
    (Array.isArray(conturi.data) ? conturi.data : []) as EmagContCurier[],
    1, alegere, ctx.config.courier_account_id ?? null,
  );
  if (cont == null) return { error: "Niciun cont de curier eMAG potrivit pentru livrare. Verifică-le în contul tău eMAG." };

  /*
   * ═══ ⚠ RAMBURSUL SE IA DIN COMANDA NOASTRĂ, NU DIN `cashed_cod` ═══
   *
   * `cashed_cod` e, în schema lor, „The cashed amount from Cash on Delivery payment" —
   * adică suma DEJA încasată. Iar `payment_status` e descris ca „For COD, stays 0 until
   * the cashed amount is received by eMAG".
   *
   * Deci la momentul emiterii AWB-ului — înainte de livrare — `cashed_cod` e ZERO.
   * Iar `AWBSave.cod` e cât trebuie să ÎNCASEZE curierul.
   *
   * Rezultatul formei dinainte: o comandă cu plata la livrare de 249,99 lei pleca cu
   * `cod: 0`. Curierul livrează marfa și nu cere nimic, iar comerciantul nu mai are
   * nicio cale de încasare. Nimic nu dă eroare — zero e o valoare validă, și e chiar
   * cea corectă pentru comenzile plătite cu cardul.
   *
   * ⚠ `rambursDeIncasat` e regula casei, scrisă după comanda #0033 de la
   * Suporti-Numar.ro: 105,50 lei plecați pe 15.07.2026 fără nicio cale de încasare.
   * Întrebarea corectă nu e „ce metodă de plată a ales clientul", ci „au intrat banii".
   * Calea eMAG era singura care n-o folosea.
   */
  const { data: comandaLocala, error: eComanda } = await admin.from("orders")
    .select("payment_status, total").eq("id", orderId).eq("business_id", businessId).maybeSingle();
  if (eComanda) return { error: `Comanda nu s-a putut citi: ${eComanda.message}` };
  const ramburs = rambursDeIncasat(
    (comandaLocala ?? {}) as { payment_status?: string | null; total?: unknown },
  );

  const cl = (brut.customer ?? {}) as Record<string, string | undefined>;
  const rez = await emiteAwb(admin, ctx, {
    orderId,
    emagOrderId: r.emag_order_id,
    fel: 1,
    awb: {
      sender: { address_id: ctx.config.pickup_address_id },
      receiver: {
        name: cl.name ?? "",
        contact: cl.shipping_contact ?? cl.name ?? "",
        phone1: cl.shipping_phone ?? cl.phone_1 ?? "",
        street: cl.shipping_street ?? "",
        zipcode: cl.shipping_postal_code ?? "",
        legal_entity: 0,
      },
      locker_id: brut.details?.locker_id,
      is_oversize: 0,
      envelope_number: 0,
      parcel_number: optiuni?.colete?.length ?? 1,
      /* ⚠ Vezi nota de deasupra: `cashed_cod` e cat s-a INCASAT deja (zero inainte de
         livrare), nu cat trebuie incasat. Se ia din comanda noastra. */
      cod: ramburs,
      courier_account_id: cont,
      observation: optiuni?.observatii,
      packages: optiuni?.colete,
    },
  });

  if (rez.fel === "esec") return { error: rez.mesaj };

  if (rez.numar) {
    await admin.from("orders").update({ tracking_number: rez.numar }).eq("id", orderId).eq("business_id", businessId);
  }
  revalidatePath("/dashboard/orders");
  return { numar: rez.numar, deja: rez.fel === "deja" };
}

/**
 * Trece un retur eMAG într-o altă stare.
 *
 * ⚠ Verificarea trecerii se face ÎNAINTE de a chema eMAG. Nu doar ca sa nu cheltuim
 * o cerere din cele 3 pe secunda, ci ca mesajul de refuz sa fie al nostru, in romana,
 * si sa spuna ce se poate face in schimb — al lor vorbeste despre un status invalid.
 */
export async function schimbaReturEmag(
  businessId: string,
  emagRmaId: number,
  inStare: number,
): Promise<{ success: true } | { error: string }> {
  const g = await guard(businessId);
  if ("error" in g) return { error: g.error };

  const iesire = iesireEmag();
  if (iesire.eroare) return { error: iesire.eroare };

  const admin = createAdminClient();
  const ctx = await loadEmagContext(admin, businessId);
  if (!ctx) return { error: "Contul eMAG nu este conectat." };

  const r = await schimbaStareaReturului(admin, ctx, emagRmaId, inStare);
  if (r.fel === "esec") return { error: r.mesaj };

  revalidatePath(FEATURE_PATH);
  return { success: true };
}

/**
 * Ce preț cere eMAG pentru insigna Smart Deals.
 *
 * ⚠ NU SCHIMBĂ NIMIC. Întoarce numărul, ca să-l vadă comerciantul lângă marja lui.
 * O integrare care taie prețuri singură „ca să iasă mai bine" face exact răul pe
 * care nimeni nu-l cere.
 */
export async function pretSmartDealsEmag(
  businessId: string,
  emagId: number,
  pretDeAcumFaraTva: number,
): Promise<{ tinta: number | null; scadereProcente: number | null } | { error: string }> {
  const g = await guard(businessId);
  if ("error" in g) return { error: g.error };

  const admin = createAdminClient();
  const ctx = await loadEmagContext(admin, businessId);
  if (!ctx) return { error: "Contul eMAG nu este conectat." };

  const r = await pretPentruSmartDeals(ctx, emagId, pretDeAcumFaraTva);
  if ("error" in r) return { error: r.error };
  return r;
}

/* ═══════════════════════════════════════════════════════════════════════════
   MAPAREA CATEGORIILOR
   ═══════════════════════════════════════════════════════════════════════════ */

export interface DetaliiCategorieEmag {
  id: number;
  nume: string;
  eanObligatoriu: boolean;
  garantieObligatorie: boolean;
  /** Ce TREBUIE completat, altfel oferta e respinsă. */
  obligatorii: {
    id: number;
    nume: string;
    valori: string[];
    /** Categoria acceptă și valori care nu-s în listă? */
    valoriNoi: boolean;
  }[];
  /** Grupurile de variante. Fără unul ales, mărimile apar ca produse separate. */
  tipuriFamilie: { id: number; nume: string }[];
}

/**
 * Ce cere o categorie eMAG ca să primească o ofertă.
 *
 * ⚠ FĂRĂ APELUL ĂSTA NU SE POATE PUBLICA NIMIC. Numai aici afli care caracteristici
 * sunt obligatorii, ce valori acceptă fiecare, și ce tipuri de familie există.
 *
 * ⚠ Se cere O SINGURĂ categorie, nu toate. `category/read` are peste zece mii; aduse
 * toate ca să se afle una, ecranul ar fi așteptat minute întregi la 3 cereri pe
 * secundă — și ar fi mâncat ritmul de care are nevoie coada.
 */
export async function detaliiCategorieEmag(
  businessId: string,
  categoryId: number,
): Promise<DetaliiCategorieEmag | { error: string }> {
  const c = await contextPentruCitire(businessId);
  if ("error" in c) return c;

  const cat = await aduCategorie(c.auth, categoryId);
  if ("error" in cat) return cat;

  return {
    id: cat.id,
    nume: (cat.name ?? "").trim() || `Categoria ${cat.id}`,
    eanObligatoriu: cat.is_ean_mandatory === 1,
    garantieObligatorie: cat.is_warranty_mandatory === 1,
    obligatorii: caracteristiciObligatorii(cat).map((x) => ({
      id: x.id,
      nume: (x.name ?? "").trim() || `Caracteristica ${x.id}`,
      valori: (x.values ?? []).slice(0, 200),
      valoriNoi: x.allow_new_value === 1,
    })),
    tipuriFamilie: (cat.family_types ?? []).map((f) => ({
      id: f.id,
      nume: (f.name ?? "").trim() || `Tip ${f.id}`,
    })),
  };
}

/**
 * Leagă o categorie a magazinului de una eMAG.
 *
 * ⚠ CHEIA E UN NUME, NU UN ID. `products.category` e text la noi — două produse cu
 * aceeași denumire de categorie împart maparea. Scrisă cu un id, harta n-ar fi găsit
 * niciodată nimic, iar fiecare publicare ar fi eșuat cu „categoria nu e legată".
 *
 * ⚠ Se verifică aici că nu lipsește nicio caracteristică obligatorie. Trimisă
 * incompletă, oferta pleacă, arde din cele 3 cereri pe secundă, și se întoarce cu o
 * eroare de documentație pe care comerciantul o vede abia peste ore, în listă.
 */
export async function salveazaMapareCategorieEmag(
  businessId: string,
  numeCategorie: string,
  mapare: { category_id: number; family_type_id?: number | null; characteristics?: { id: number; value: string }[] },
): Promise<{ success: true; dinFisa: string[] } | { error: string; lipsa?: string[] }> {
  const g = await guard(businessId);
  if ("error" in g) return { error: g.error };

  const nume = (numeCategorie ?? "").trim();
  if (!nume) return { error: "Categoria magazinului nu are nume." };

  const c = await contextPentruCitire(businessId);
  if ("error" in c) return c;

  const cat = await aduCategorie(c.auth, mapare.category_id);
  if ("error" in cat) return cat;

  /* ⚠ `is_allowed !== 1` nu înseamnă „ascunde din listă", înseamnă „produsele
     trimise acolo se resping" — iar respingerea arată exact ca o caracteristică
     lipsă, deci s-ar fi căutat zile întregi în datele produsului. */
  if (cat.is_allowed !== 1) {
    return {
      error: `Nu ai acces de vânzare în categoria „${cat.name ?? mapare.category_id}". ` +
        "Cere-l din panoul eMAG sau alege alta.",
    };
  }

  const trimise = mapare.characteristics ?? [];

  /*
   * ═══ ⚠ AICI NU SE MAI REFUZĂ, ȘI E O SCHIMBARE DE FOND (§19) ═══
   *
   * Înainte, maparea era respinsă până când comerciantul fixa o valoare pentru fiecare
   * caracteristică obligatorie. Ceea ce e absurd tocmai la cele care contează: nu toate
   * tricourile sunt „M", iar `Mărime` e obligatorie.
   *
   * De acum, caracteristicile se iau întâi din fișa fiecărui produs
   * (`page_sections.specifications`), iar cele fixate aici umplu golurile. Deci o
   * caracteristică fără valoare fixată NU e o greșeală — e o caracteristică care vine
   * din produs.
   *
   * ⚠ Dar NU se trece nici sub tăcere: lista se întoarce, iar ecranul spune limpede că
   * produsele fără specificația aia vor fi oprite înainte de trimitere. Verificarea
   * care oprește s-a mutat unde îi e locul — pe produs, nu pe categorie.
   */
  const dinFisa = caracteristiciLipsa(cat, trimise)
    .map((x) => (x.name ?? "").trim() || `Caracteristica ${x.id}`);

  const veche = await loadConfig(businessId);
  const noua: EmagConfig = {
    ...veche,
    category_map: {
      ...(veche.category_map ?? {}),
      [nume]: {
        category_id: mapare.category_id,
        ...(mapare.family_type_id ? { family_type_id: mapare.family_type_id } : {}),
        ...(trimise.length ? { characteristics: trimise.filter((x) => (x.value ?? "").trim()) } : {}),
        /* ⚠ Puse deoparte ACUM, cat avem schema categoriei in mana. Vezi nota din
           `EmagIntrareCategorie`: fara ele, verificarea de dinainte de trimitere ar fi
           trebuit sa cheme eMAG pentru fiecare produs, ca sa afle ca nu trebuie sa
           trimita — adica exact cererea pe care verificarea o scuteste. */
        ean_obligatoriu: cat.is_ean_mandatory === 1,
        garantie_obligatorie: cat.is_warranty_mandatory === 1,
        /* ⚠ Schema caracteristicilor, cu `values[]` și `is_mandatory` cu tot (§19).
           Fără ea, potrivirea din fișa produsului n-are cu ce compara, iar o valoare
           în afara listei lor ar pleca și ar face oferta întreagă respinsă. */
        characteristics_categorie: cat.characteristics ?? [],
      },
    },
  };

  const ok = await saveConfig(g.supabase, businessId, noua);
  if (!ok) return { error: "Nu am putut salva maparea. Încearcă din nou." };

  revalidatePath(FEATURE_PATH);
  return { success: true, dinFisa };
}

/**
 * Scoate o mapare.
 *
 * ⚠ NU retrage nimic de pe eMAG. Ofertele deja publicate rămân acolo; doar nu se mai
 * pot publica produse noi din categoria aceea. Butonul trebuie să spună asta —
 * altfel comerciantul apasă crezând că își curăță contul de la ei.
 */
export async function stergeMapareCategorieEmag(
  businessId: string,
  numeCategorie: string,
): Promise<{ success: true } | { error: string }> {
  const g = await guard(businessId);
  if ("error" in g) return { error: g.error };

  const veche = await loadConfig(businessId);
  const harta = { ...(veche.category_map ?? {}) };
  delete harta[(numeCategorie ?? "").trim()];

  const ok = await saveConfig(g.supabase, businessId, { ...veche, category_map: harta });
  if (!ok) return { error: "Nu am putut șterge maparea." };

  revalidatePath(FEATURE_PATH);
  return { success: true };
}

/**
 * Categoriile magazinului, cu maparea lor și cu câte produse au.
 *
 * ⚠ Numărul de produse contează pe ecran: o categorie cu 400 de produse nemapată e
 * o urgență, una cu unul singur e o notă de subsol. Fără el, comerciantul le-ar fi
 * văzut pe toate la fel și ar fi început cu cea greșită.
 */
export async function categoriileMagazinuluiEmag(
  businessId: string,
): Promise<{ categorii: { nume: string; produse: number; mapare: EmagIntrareCategorie | null }[] } | { error: string }> {
  const g = await guard(businessId);
  if ("error" in g) return { error: g.error };

  const config = await loadConfig(businessId);
  const admin = createAdminClient();

  /* ⚠ `fetchAllRowsStrict`: PostgREST taie la 1000 FĂRĂ să spună. Un magazin cu 1200
     de produse ar fi avut categorii întregi invizibile pe ecranul de mapare. */
  const produse = await fetchAllRowsStrict<{ category: string | null }>(
    "emag.categorii", (from, to) =>
      admin.from("products").select("category")
        .eq("business_id", businessId).order("created_at", { ascending: true }).range(from, to),
  );

  const numarate = new Map<string, number>();
  for (const p of produse) {
    const n = (p.category ?? "").trim();
    if (!n) continue;
    numarate.set(n, (numarate.get(n) ?? 0) + 1);
  }

  const harta = config.category_map ?? {};
  const categorii = [...numarate.entries()]
    .map(([nume, produse]) => ({ nume, produse, mapare: harta[nume] ?? null }))
    /* Nemapate întâi, iar între ele cele cu mai multe produse. */
    .sort((a, b) => (a.mapare ? 1 : 0) - (b.mapare ? 1 : 0) || b.produse - a.produse);

  return { categorii };
}

/* ═══════════════════════════════════════════════════════════════════════════
   LISTA DE OFERTE
   ═══════════════════════════════════════════════════════════════════════════ */

export interface RandOfertaEcran {
  id: string;
  productId: string | null;
  numeProdus: string;
  variantTitle: string | null;
  emagId: number;
  stare: StareOferta;
  stareEticheta: string;
  /** Textul lor pentru `validation_status`, întreg. Niciodată rescris de noi. */
  validare: string | null;
  /** Ce trebuie reparat, cuvânt cu cuvânt de la ei. */
  docErrors: string[];
  eroare: string | null;
  /** `false` = ofertă preluată din contul lor; nu i se trimite nimic automat. */
  autoSync: boolean;
  /** ⚠ Traducerea poate bloca publicarea chiar cu restul aprobat. Vezi `rute.ts`. */
  traducereBlocheaza: boolean;
  linkEmag: string | null;
  /**
   * Cati vanzatori au oferta pe acelasi produs, si pe ce loc suntem.
   *
   * ⚠ SE ARATA, NU SE FOLOSESTE IN NICIO DECIZIE. Datele astea sunt tentatia curata
   * pentru un pret automat care taie pana sub marja — iar lista de audit avertizeaza
   * chiar ea sa fii atent la politica eMAG inainte de orice automatizare.
   */
  concurenta: { oferte: number; loc: number | null; celMaiBunPret: number | null } | null;
  /**
   * Ce e la eMAG fata de ce am trimite noi acum (§68).
   *
   * ⚠ `null` = nicio diferenta, si asta e starea obisnuita. Cand nu e `null`, randul
   * spune ce s-a departat, cu AMANDOUA valorile: „la noi 100, la ei 89,90". Aratata
   * ca un simplu semn de exclamare, informatia n-ar fi ajutat pe nimeni sa hotarasca
   * daca e o campanie de-a lor sau o scriere pierduta.
   */
  deriva: {
    campuri: { camp: "pret" | "stoc"; laNoi: number; laEi: number }[];
    /** ⚠ Adevarat cand s-au terminat incercarile. Atunci nu se mai trimite nimic. */
    renuntat: boolean;
    /** De cand se vede diferenta, ISO. */
    din: string;
  } | null;
}

export interface FiltruOferteEcran {
  stare?: StareOferta;
  /** Numai cele care au ceva de reparat. */
  doarProbleme?: boolean;
  cautare?: string;
  pagina?: number;
}

const OFERTE_PE_PAGINA = 50;

/**
 * Ofertele magazinului, pentru ecran.
 *
 * ═══ ⚠ MOTIVUL RESPINGERII SE ARATĂ ÎNTREG, NU REZUMAT ═══
 *
 * `doc_errors` e SINGURUL loc din care află comerciantul ce are de reparat. La
 * Trendyol, motivul respingerii n-a fost arătat niciodată, iar produsele au stat „în
 * aprobare" la nesfârșit — cu comerciantul convins că noi le ținem pe loc.
 *
 * Deci textul lor pleacă spre ecran neatins. Un rezumat scris de noi ar fi pierdut
 * exact detaliul care spune CE câmp și CE valoare.
 *
 * ⚠ Numărul total vine dintr-un `count`, nu din lungimea paginii: PostgREST taie
 * tăcut la 1000, iar un magazin cu 4000 de oferte ar fi văzut „1000" și ar fi crezut
 * că trei sferturi din catalog n-au ajuns niciodată la eMAG.
 */
export async function listaOferteEmag(
  businessId: string,
  filtru: FiltruOferteEcran = {},
): Promise<{ randuri: RandOfertaEcran[]; total: number; pagina: number; pePagina: number } | { error: string }> {
  const g = await guard(businessId);
  if ("error" in g) return { error: g.error };

  const admin = createAdminClient();
  const pagina = Math.max(1, Math.floor(filtru.pagina ?? 1));
  const de_la = (pagina - 1) * OFERTE_PE_PAGINA;

  let q = admin
    .from("emag_offers")
    .select(
      "id, product_id, variant_title, emag_id, status, validation_status, translation_validation_status, doc_errors, error, auto_sync, part_number_key, number_of_offers, buy_button_rank, best_offer_sale_price, deriva, products(name)",
      { count: "exact" },
    )
    .eq("business_id", businessId);

  if (filtru.stare) q = q.eq("status", filtru.stare);
  /* „Probleme" = respinse de ei SAU căzute la noi. Două întrebări diferite, aceeași
     urgență pentru omul care se uită: ambele înseamnă „produsul nu se vinde". */
  /*
   * ⚠ SI DERIVA E O PROBLEMA, chiar daca oferta arata perfect sanatoasa.
   *
   * O oferta cu `validation_status: 9` si fara nicio eroare, dar cu pretul de la ei
   * ramas altul decat al nostru, e chiar cazul cel mai scump: se vinde, si se vinde
   * la alt pret decat crede comerciantul. Lasata in afara filtrului, ar fi fost
   * singura problema pe care „Doar cu probleme" NU o arata.
   */
  if (filtru.doarProbleme) q = q.or("status.eq.error,validation_status.in.(5,6,8,10,12),deriva.not.is.null");
  if (filtru.cautare?.trim()) {
    const c = filtru.cautare.trim();
    q = q.or(`part_number.ilike.%${c}%,ean.ilike.%${c}%,part_number_key.ilike.%${c}%`);
  }

  const { data, count, error } = await q
    .order("updated_at", { ascending: false })
    .range(de_la, de_la + OFERTE_PE_PAGINA - 1);

  if (error) return { error: error.message };

  type Rand = {
    id: string; product_id: string | null; variant_title: string | null; emag_id: number;
    status: string; validation_status: number | null; translation_validation_status: number | null;
    doc_errors: unknown; error: string | null; auto_sync: boolean; part_number_key: string | null;
    number_of_offers: number | null; buy_button_rank: number | null; best_offer_sale_price: number | null;
    deriva: unknown;
    products: { name: string } | { name: string }[] | null;
  };

  const randuri: RandOfertaEcran[] = ((data ?? []) as Rand[]).map((r) => {
    const p = Array.isArray(r.products) ? r.products[0] : r.products;
    const stare = r.status as StareOferta;
    return {
      id: r.id,
      productId: r.product_id,
      numeProdus: p?.name ?? "Produs șters din magazin",
      variantTitle: r.variant_title,
      emagId: r.emag_id,
      stare,
      stareEticheta: EMAG_ETICHETA_STARE[stare] ?? stare,
      validare: r.validation_status != null ? (EMAG_VALIDARE[r.validation_status] ?? `Stare ${r.validation_status}`) : null,
      docErrors: normalizeazaDocErrors(r.doc_errors),
      eroare: r.error,
      autoSync: r.auto_sync,
      traducereBlocheaza: traducereaPoateBloca({
        validation_status: r.validation_status,
        translation_validation_status: r.translation_validation_status,
      }),
      /* `part_number_key` e cheia paginii lor de produs; fără ea, oferta n-are încă
         o pagină publică la eMAG și n-are unde duce link-ul. */
      linkEmag: r.part_number_key ? `https://www.emag.ro/-/pd/${r.part_number_key}` : null,
      /* ⚠ Numai cand chiar sunt CONCURENTI. Cu un singur vanzator, „locul 1 din 1" nu
         spune nimic si doar incarca randul. */
      /* ⚠ Se citeste prin `citesteMemoriaDerivei`, nu prin `as`. Un `jsonb` scris de o
         versiune mai veche, sau atins din consola, ar fi ajuns pe ecran ca obiect
         stalcit — si randul ar fi aratat „la noi undefined, la ei undefined". */
      deriva: (() => {
        const m = citesteMemoriaDerivei(r.deriva);
        if (!m) return null;
        return { campuri: m.campuri, renuntat: m.renuntatLa != null, din: m.prima };
      })(),
      concurenta: (r.number_of_offers ?? 0) > 1
        ? {
            oferte: r.number_of_offers ?? 0,
            loc: r.buy_button_rank,
            celMaiBunPret: r.best_offer_sale_price != null ? Number(r.best_offer_sale_price) : null,
          }
        : null,
    };
  });

  return { randuri, total: count ?? 0, pagina, pePagina: OFERTE_PE_PAGINA };
}

/**
 * `doc_errors` adus la o listă de texte.
 *
 * ⚠ eMAG îl trimite când ca tablou de șiruri, când ca tablou de obiecte, când ca
 * obiect cu chei. Citit pe o singură formă, motivul respingerii ar fi ajuns pe ecran
 * ca „[object Object]" — adică exact la fel de nefolositor ca lipsa lui, dar cu aerul
 * că i s-a spus omului ceva.
 */
function normalizeazaDocErrors(brut: unknown): string[] {
  const unText = (x: unknown): string | null => {
    if (typeof x === "string") return x.trim() || null;
    if (x && typeof x === "object") {
      const o = x as Record<string, unknown>;
      const t = [o.message, o.text, o.error, o.description].find((v) => typeof v === "string" && v.trim());
      if (typeof t === "string") {
        const camp = typeof o.field === "string" && o.field.trim() ? `${o.field}: ` : "";
        return `${camp}${t.trim()}`;
      }
      return JSON.stringify(x).slice(0, 300);
    }
    return null;
  };

  if (Array.isArray(brut)) return brut.map(unText).filter((x): x is string => !!x);
  if (brut && typeof brut === "object") {
    return Object.values(brut as Record<string, unknown>).flatMap((v) =>
      Array.isArray(v) ? v.map(unText).filter((x): x is string => !!x) : [unText(v)].filter((x): x is string => !!x),
    );
  }
  const singur = unText(brut);
  return singur ? [singur] : [];
}

/**
 * Publică pe eMAG toate produsele dintr-o categorie mapată.
 *
 * ⚠ TRECE PRIN COADĂ, nu prin trimitere directă. O categorie poate avea sute de
 * produse, iar trimise pe loc ar fi depășit timpul funcției și ar fi ars într-o
 * secundă tot ritmul de 3 cereri pe secundă al magazinului — inclusiv cel de care
 * au nevoie mișcările de stoc după vânzări.
 */
export async function publicaCategoriaPeEmag(
  businessId: string,
  numeCategorie: string,
): Promise<{ puse: number } | { error: string }> {
  const g = await guard(businessId);
  if ("error" in g) return { error: g.error };

  const config = await loadConfig(businessId);
  const lipsa = ceLipsestePentruPublicare(config);
  if (lipsa) return { error: lipsa };

  if (!config.category_map?.[(numeCategorie ?? "").trim()]) {
    return { error: "Categoria nu e legată de nicio categorie eMAG. Leag-o întâi." };
  }

  const admin = createAdminClient();
  const produse = await fetchAllRowsStrict<{ id: string }>(
    "emag.publicaCategoria", (from, to) =>
      admin.from("products").select("id")
        .eq("business_id", businessId).eq("category", numeCategorie.trim()).eq("is_active", true)
        .order("created_at", { ascending: true }).range(from, to),
  );

  if (produse.length === 0) return { puse: 0 };

  /* ⚠ Cate au INTRAT, nu cate s-au gasit — aceeasi regula ca la felii. Coada poate
     primi zero cand sincronizarea automata e stinsa sau cand toate ofertele sunt
     preluate, iar „N produse puse la rand" ar fi fost o reusita raportata cu efect
     zero: chiar forma incidentului VetDepo. */
  /*
   * ⚠ `publicaPeEmagMany`, nu `enqueueEmagSyncMany`. Butonul ăsta spune „publică", deci
   * are voie să atingă și produsele care n-au fost NICIODATĂ pe eMAG.
   *
   * Cu funcția obișnuită, la prima folosire nu se punea nimic la rând — coada
   * filtrează la produsele care au deja ofertă — iar mesajul de eroare dădea vina pe
   * comutatorul de sincronizare automată. Diagnostic greșit, care trimitea omul să
   * caute unde nu era nimic. Măsurat pe un catalog de 1353 de produse: zero puse.
   */
  const puse = await publicaPeEmagMany(businessId, produse.map((p) => p.id));
  if (puse === 0) {
    return {
      error: "Nu s-a pus nimic la rând: ofertele produselor din categoria asta sunt " +
        "preluate din contul tău eMAG, iar acelea nu se rescriu automat. " +
        "Folosește „Trimite acum” pe produsul care te interesează.",
    };
  }

  revalidatePath(FEATURE_PATH);
  return { puse };
}

/* ═══════════════════════════════════════════════════════════════════════════
   AWB: CE SE ȘTIE ÎNAINTE DE APĂSARE
   ═══════════════════════════════════════════════════════════════════════════ */

export interface PregatireAwbEmag {
  /** Comanda are corespondent eMAG și se poate lucra la ea? */
  emagOrderId: number;
  /** ⚠ 2 = onorată de eMAG (FBE). Vânzătorul NU poate emite AWB pentru ea. */
  tipComanda: number | null;
  /** Cât cere eMAG să se încaseze la livrare. `0` la plata online. */
  ramburs: number;
  /** Numele curierului care va fi folosit, sau `null` dacă niciunul nu e potrivit. */
  curier: string | null;
  curierId: number | null;
  /** Ce oprește emiterea, în cuvintele omului. `null` = se poate. */
  piedica: string | null;
  /** AWB-ul deja emis pentru comanda asta, dacă există. */
  awbExistent: { numar: string | null; emagId: number } | null;
  /** Livrare la easybox: adresa e a lockerului, nu a omului. */
  locker: string | null;
  /**
   * Dimensiunile propuse din catalog (§47), în centimetri.
   *
   * ⚠ Se propun DOAR când chiar se știu: un singur produs, o bucată, cu toate trei
   * laturile completate. Greutățile se adună, dimensiunile nu — vezi `dimensiuniPropuse`.
   * Când nu se știe, vine motivul scris, ca ecranul să spună de ce câmpurile sunt goale.
   */
  dimensiuni: PropunereDimensiuni;
}

/**
 * Dimensiunile propuse pentru coletul unei comenzi (§47).
 *
 * ⚠ HOTĂRÂREA e în `dimensiuniPropuse`, care e curată și probată. Aici e doar
 * citirea: liniile comenzii și laturile produselor lor.
 *
 * ⚠ O citire căzută dă „nu se știe", nu niște dimensiuni de rezervă. Chiar defectul
 * reparat înainte: `20×15×10` scrise în cod arătau exact ca o măsurătoare adevărată,
 * iar curierul refactura banda pe care o găsea la depozit.
 */
async function dimensiunileComenzii(
  admin: ReturnType<typeof createAdminClient>,
  businessId: string,
  orderId: string,
): Promise<PropunereDimensiuni> {
  const { data: order } = await admin.from("orders")
    .select("items").eq("business_id", businessId).eq("id", orderId).maybeSingle();

  const items = Array.isArray(order?.items) ? (order.items as unknown[]) : [];
  const linii: LinieColet[] = items.map((x) => {
    const o = (x ?? {}) as { product_id?: unknown; quantity?: unknown };
    return {
      productId: typeof o.product_id === "string" ? o.product_id : null,
      cantitate: Number(o.quantity) || 0,
    };
  });

  const ids = [...new Set(linii.map((l) => l.productId).filter((x): x is string => !!x))];
  if (ids.length === 0) return dimensiuniPropuse(linii, new Map());

  const { data: produse } = await admin.from("products")
    .select("id, page_sections").eq("business_id", businessId).in("id", ids);

  const catalog = new Map<string, { length?: number | null; width?: number | null; height?: number | null }>();
  for (const p of (produse ?? []) as { id: string; page_sections: unknown }[]) {
    /* ⚠ Dimensiunile stau în `page_sections.dimensions`, în CENTIMETRI — aceeași sursă
       pe care o folosește `masuratoriEmag`, care le preface în milimetri pentru ei. */
    const ps = (p.page_sections ?? {}) as { dimensions?: { length?: number; width?: number; height?: number } };
    if (ps.dimensions) catalog.set(p.id, ps.dimensions);
  }

  return dimensiuniPropuse(linii, catalog);
}

/**
 * Ce se știe despre AWB-ul unei comenzi eMAG, înainte să apese cineva.
 *
 * ═══ ⚠ DE CE NU E DE AJUNS UN BUTON ═══
 *
 * Emiterea unui AWB e un efect cu un singur foc care costă bani: curierul vine, iar
 * un al doilea AWB înseamnă al doilea transport plătit. Deci ecranul trebuie să
 * spună DINAINTE prin ce curier pleacă și cât se încasează — nu să afle omul din
 * rezultat.
 *
 * ⚠ Și mai ales trebuie să spună când NU se poate, și de ce. Trei motive, toate
 * invizibile altfel:
 *
 *   `type: 2` (FBE)  — comanda e onorată de eMAG din depozitele lor. Vânzătorul nu
 *                      are ce expedia și nu poate emite nimic.
 *   listă impusă goală — eMAG nu îngăduie AWB de marketplace pe comanda asta.
 *   niciun cont potrivit — conturile există, dar niciunul nu e activ ȘI de tipul
 *                      cerut (1 = retur, 2 = comandă, 3 = amândouă).
 *
 * Fără ele, butonul ar fi fost apăsat și ar fi întors un refuz de la eMAG despre un
 * cont — iar omul ar fi căutat greșeala în setările lui de curierat.
 */
export async function pregatireAwbEmag(
  businessId: string,
  orderId: string,
): Promise<PregatireAwbEmag | { error: string }> {
  const g = await guard(businessId);
  if ("error" in g) return { error: g.error };

  const admin = createAdminClient();
  const { data: rand } = await admin.from("emag_orders")
    .select("emag_order_id, order_type, raw").eq("business_id", businessId).eq("order_id", orderId).maybeSingle();

  const r = rand as { emag_order_id: number; order_type: number | null; raw: unknown } | null;
  if (!r) return { error: "Comanda nu are corespondent eMAG." };

  const brut = (r.raw ?? {}) as {
    cashed_cod?: number;
    enforced_vendor_courier_accounts?: number[] | null;
    details?: { locker_id?: string; locker_name?: string };
  };

  const { data: awb } = await admin.from("emag_awb")
    .select("emag_id, awb_number").eq("business_id", businessId).eq("order_id", orderId)
    .order("created_at", { ascending: false }).limit(1).maybeSingle();

  const existent = awb as { emag_id: number; awb_number: string | null } | null;

  /* ⚠ Comanda NOASTRA, pentru ramburs. Vezi nota din `emiteAwbEmag`: `cashed_cod` e cat
     s-a incasat deja, deci zero inainte de livrare. */
  const { data: comandaPentruRamburs } = await admin.from("orders")
    .select("payment_status, total").eq("id", orderId).eq("business_id", businessId).maybeSingle();

  const baza = {
    emagOrderId: r.emag_order_id,
    tipComanda: r.order_type,
    /* ⚠ Acelasi izvor ca la emitere. Aratat din `cashed_cod`, ecranul spunea „Nimic —
       platit deja" pentru o comanda cu plata la livrare, intr-un camp needitabil. */
    ramburs: rambursDeIncasat(
      (comandaPentruRamburs ?? {}) as { payment_status?: string | null; total?: unknown },
    ),
    awbExistent: existent ? { numar: existent.awb_number, emagId: existent.emag_id } : null,
    locker: brut.details?.locker_name ?? brut.details?.locker_id ?? null,
    /* ⚠ PE ACELAȘI DRUM, fără o a doua chemare din modal. Formularul cerea deja
       pregătirea; dimensiunile citite separat ar fi fost încă un dus-întors pentru o
       informație care se află din aceleași rânduri. */
    dimensiuni: await dimensiunileComenzii(admin, businessId, orderId),
  };

  /* ⚠ FBE se verifică ÎNAINTE de orice apel la eMAG: e o proprietate a comenzii, nu
     a contului, iar o cerere trimisă degeaba arde din cele 3 pe secundă. */
  if (r.order_type === 2) {
    return {
      ...baza, curier: null, curierId: null,
      piedica: "Comanda e onorată de eMAG (FBE). Ei se ocupă de livrare — tu nu emiți AWB.",
    };
  }

  const alegere = alegereaCurierului(brut.enforced_vendor_courier_accounts ?? null);
  if (alegere.fel === "imposibil") {
    return {
      ...baza, curier: null, curierId: null,
      piedica: "eMAG nu permite AWB de marketplace pentru comanda asta. Expediaz-o cu curierul tău și trimite numărul.",
    };
  }

  const c = await contextPentruCitire(businessId);
  if ("error" in c) return c;

  const conturi = await citesteConturiCurier(c.auth);
  if (isEmagError(conturi)) return { error: conturi.error };

  const lista = (Array.isArray(conturi.data) ? conturi.data : []) as EmagContCurier[];
  const ales = contPotrivit(lista, 1, alegere, c.config.courier_account_id ?? null);

  if (ales == null) {
    return {
      ...baza, curier: null, curierId: null,
      piedica: alegere.fel === "din_lista"
        ? "eMAG impune anumite conturi de curier pentru comanda asta, iar niciunul nu e activ în contul tău."
        : "Niciun cont de curier eMAG activ și potrivit pentru livrare. Verifică-le în panoul eMAG.",
    };
  }

  const contAles = lista.find((x) => x.account_id === ales);
  return {
    ...baza,
    curier: (contAles?.account_display_name ?? contAles?.courier_name ?? `Cont #${ales}`).trim(),
    curierId: ales,
    piedica: null,
  };
}

/* ═══════════════════════════════════════════════════════════════════════════
   RETURURILE, PENTRU ECRAN
   ═══════════════════════════════════════════════════════════════════════════ */

export interface RandReturEcran {
  emagRmaId: number;
  emagOrderId: number | null;
  orderId: string | null;
  stare: number | null;
  stareEticheta: string;
  /** Ce se poate face acum, după chiar tabelul lor de treceri. */
  treceri: { stare: number; eticheta: string }[];
  produse: { nume: string; cantitate: number; motiv: number | null; observatii: string | null }[];
  motiv: number | null;
  /** Textul liber scris de client. ⚠ Singurul loc din care se afla CE anume nu i-a plăcut. */
  observatii: string | null;
  /** Vezi `EMAG_TIP_RETUR`. `null` = nu ne-au spus. */
  tip: number | null;
  tipEticheta: string | null;
  /** Ce urmează să facă comerciantul. `null` = nu se știe, și se spune așa. */
  ceUrmeaza: string | null;
  /**
   * Contul în care se întorc banii, când eMAG chiar ni l-a trimis.
   *
   * ⚠ SE APRINDE DE LA „EI NE-AU TRIMIS UN IBAN", nu de la tipul returului. Un tip
   * necunoscut, sau unul nou, ar fi ascuns un IBAN pe care ei chiar ni l-au dat — iar
   * comerciantul ar fi avut de întors bani și ecranul ar fi tăcut.
   */
  cont: { iban: string; banca: string | null; beneficiar: string | null } | null;
  actualizat: string;
  /**
   * Se poate chema curierul pentru ridicarea de la client? (§53)
   *
   * ⚠ Când nu se poate, vine MOTIVUL, nu doar un `false`. Un buton lipsă fără
   * explicație l-ar fi pus pe om să caute în cod de ce nu-l vede — iar de cele mai
   * multe ori motivul e o veste bună: ridicarea o face deja curierul eMAG.
   */
  ridicare: { sePoate: boolean; motiv: string | null }
}

/**
 * Retururile magazinului.
 *
 * ⚠ BUTOANELE VIN DIN TABELUL LOR DE TRECERI, nu dintr-o listă scrisă de noi. O
 * trecere nepermisă nu strică nimic la ei — o refuză — dar strică încrederea
 * omului în panou: apasă un buton, primește o eroare în engleză despre un câmp, și
 * nu înțelege că pur și simplu nu era rândul acelei acțiuni.
 */
export async function listaRetururiEmag(
  businessId: string,
): Promise<{ randuri: RandReturEcran[] } | { error: string }> {
  const g = await guard(businessId);
  if ("error" in g) return { error: g.error };

  const admin = createAdminClient();
  const { data, error } = await admin.from("emag_rma")
    .select("emag_rma_id, emag_order_id, order_id, request_status, return_reason, return_type, products, awbs, raw, updated_at")
    .eq("business_id", businessId)
    .order("updated_at", { ascending: false })
    .limit(100);

  if (error) return { error: error.message };

  type Rand = {
    emag_rma_id: number; emag_order_id: number | null; order_id: string | null;
    request_status: number | null; return_reason: number | null; return_type: number | null;
    products: unknown; awbs: unknown; raw: unknown; updated_at: string;
  };

  const brute = (data ?? []) as Rand[];

  /*
   * ═══ ⚠ SE CITESC DOAR COMENZILE CARE CHIAR TREBUIE ═══
   *
   * Adresa clientului stă în comandă, nu în retur — returul poartă doar localitatea.
   * Dar `pickup_method` e de cele mai multe ori `1` (vine curierul eMAG), și pentru
   * acelea nu se emite nimic, deci adresa nu foloseste la nimic.
   *
   * Citite toate, ar fi fost o interogare peste o sută de comenzi la fiecare
   * deschidere a ecranului, pentru un buton care apare la câteva.
   */
  const idComenziDeCitit = [...new Set(brute
    .filter((r) => (r.raw as { pickup_method?: number } | null)?.pickup_method === PICKUP_CURIER_PROPRIU)
    .map((r) => r.order_id)
    .filter((x): x is string => !!x))];

  const adrese = new Map<string, { strada: string; localitate: number | null }>();
  if (idComenziDeCitit.length > 0) {
    const { data: comenzi } = await admin.from("emag_orders")
      .select("order_id, raw").eq("business_id", businessId).in("order_id", idComenziDeCitit);
    for (const c of (comenzi ?? []) as { order_id: string | null; raw: unknown }[]) {
      if (!c.order_id) continue;
      const cl = (((c.raw ?? {}) as { customer?: Record<string, unknown> }).customer ?? {}) as Record<string, unknown>;
      adrese.set(c.order_id, {
        strada: String(cl.shipping_street ?? "").trim(),
        localitate: Number(cl.shipping_locality_id) || null,
      });
    }
  }

  const randuri: RandReturEcran[] = brute.map((r) => ({
    emagRmaId: r.emag_rma_id,
    emagOrderId: r.emag_order_id,
    orderId: r.order_id,
    stare: r.request_status,
    stareEticheta: r.request_status != null
      ? (EMAG_STATUS_RETUR[r.request_status] ?? `Stare ${r.request_status}`)
      : "Necunoscută",
    treceri: treceriPosibile(r.request_status).map((s) => ({
      stare: s,
      eticheta: EMAG_STATUS_RETUR[s] ?? `Stare ${s}`,
    })),
    produse: Array.isArray(r.products)
      ? (r.products as { product_name?: string; quantity?: number; return_reason?: number; observations?: string }[])
          .map((p) => ({
            nume: (p?.product_name ?? "").trim() || "Produs",
            cantitate: Number(p?.quantity ?? 0) || 0,
            motiv: Number.isFinite(p?.return_reason) ? (p!.return_reason as number) : null,
            observatii: (p?.observations ?? "").trim() || null,
          }))
      : [],
    motiv: r.return_reason,
    observatii: ((r.raw as { observations?: string } | null)?.observations ?? "").trim() || null,
    tip: r.return_type,
    tipEticheta: r.return_type != null ? (EMAG_TIP_RETUR[r.return_type] ?? null) : null,
    ceUrmeaza: ceUrmeazaLaRetur(r.return_type),
    /*
     * ⚠ Se ia din `raw`, si numai cand IBAN-ul chiar e acolo. Aprins dupa tipul
     * returului, un tip necunoscut ar fi ascuns un cont pe care ei ni l-au trimis.
     */
    cont: contulDinRetur(r.raw),
    /* ⚠ Hotărârea e a lui `poateAwbRetur`, care e curată și probată. Aici e doar
       adunatul datelor: fiecare „nu" de acolo înseamnă un curier neplătit degeaba. */
    ridicare: (() => {
      const adr = r.order_id ? adrese.get(r.order_id) : undefined;
      const brutRma = (r.raw ?? {}) as { pickup_method?: number; pickup_locality_id?: number };
      const v = poateAwbRetur({
        pickupMethod: brutRma.pickup_method,
        stare: r.request_status,
        awbs: r.awbs,
        emagOrderId: r.emag_order_id,
        pickupLocalityId: brutRma.pickup_locality_id,
        localitateComanda: adr?.localitate ?? null,
        areStrada: !!adr?.strada,
      });
      return v.se_poate
        ? { sePoate: true, motiv: null }
        : { sePoate: false, motiv: v.motiv };
    })(),
    actualizat: r.updated_at,
  }));

  return { randuri };
}

/* ═══════════════════════════════════════════════════════════════════════════
   ETICHETA AWB
   ═══════════════════════════════════════════════════════════════════════════ */

/**
 * Eticheta AWB-ului, gata de tipărit.
 *
 * ═══ ⚠ FĂRĂ EA, AWB-UL NU FOLOSEȘTE LA NIMIC ═══
 *
 * Un AWB emis și fără etichetă e un număr într-o bază de date: coletul n-are ce să
 * poarte, iar curierul nu-l ia. Lipsa asta n-ar fi dat nicio eroare — butonul de
 * emitere ar fi spus „AWB emis", și abia la depozit s-ar fi văzut că nu e nimic de
 * lipit.
 *
 * ⚠ Se întoarce ca base64, nu ca adresă. O adresă publică spre eticheta unui colet
 * ar fi purtat numele, adresa și telefonul CUMPĂRĂTORULUI — exact ce evită ruta care
 * servește etichetele celorlalți curieri, cu `Cache-Control: private, no-store`.
 * Trecută prin acțiune, eticheta ajunge direct în fila care a cerut-o, iar nimic nu
 * rămâne pe internet.
 *
 * ⚠ Merge NUMAI pentru AWB-uri emise prin API. Documentația lor: „Only AWBs issued
 * via API can be read". Cele emise din panoul eMAG n-au `emag_id` la noi, deci se
 * spune limpede, nu se încearcă degeaba.
 */
export async function descarcaEtichetaAwbEmag(
  businessId: string,
  orderId: string,
  format: FormatAwb = "A4",
): Promise<{ base64: string; tip: string; nume: string } | { error: string }> {
  const g = await guard(businessId);
  if ("error" in g) return { error: g.error };

  const iesire = iesireEmag();
  if (iesire.eroare) return { error: iesire.eroare };

  const admin = createAdminClient();
  const { data } = await admin.from("emag_awb")
    .select("emag_id, awb_number").eq("business_id", businessId).eq("order_id", orderId)
    .order("created_at", { ascending: false }).limit(1).maybeSingle();

  const awb = data as { emag_id: number; awb_number: string | null } | null;
  if (!awb) {
    return { error: "Comanda nu are AWB emis prin eMAG. Eticheta se descarcă doar pentru cele emise de aici." };
  }

  const c = await contextPentruCitire(businessId);
  if ("error" in c) return c;

  const r = await descarcaEtichetaAwb(c.auth, awb.emag_id, format);
  if ("error" in r) return { error: r.error };

  return {
    base64: Buffer.from(r.octeti).toString("base64"),
    tip: r.tip,
    nume: `AWB-${awb.awb_number ?? awb.emag_id}.${format === "ZPL" ? "zpl" : "pdf"}`,
  };
}

/* ═══════════════════════════════════════════════════════════════════════════
   „SINCRONIZEAZĂ ACUM", PE FELII
   ═══════════════════════════════════════════════════════════════════════════ */

/**
 * Ce se poate cere la o sincronizare pornită de om.
 *
 * ═══ ⚠ DE CE NU UN SINGUR BUTON „SINCRONIZEAZĂ TOT" ═══
 *
 * Fiindcă feliile costă foarte diferit, iar omul apasă din motive foarte diferite.
 *
 * „Am schimbat prețurile la 400 de produse și vreau să plece acum" e o cerere de
 * câteva secunde pe ruta ușoară. „Retrimite documentația tuturor produselor" e ruta
 * grea, sute de cereri la 3 pe secundă, și ține ocupat ritmul magazinului minute
 * întregi — inclusiv pentru mișcările de stoc de după vânzări.
 *
 * Un singur buton le-ar fi făcut pe amândouă de fiecare dată. Comerciantul care voia
 * doar prețurile ar fi plătit costul întreg, n-ar fi știut de ce durează, și a doua
 * oară n-ar mai fi apăsat.
 */
export type FelieSincronizare = "preturi" | "stocuri" | "produse";

/**
 * Pune la coadă o felie, pentru toate ofertele sincronizabile ale magazinului.
 *
 * ⚠ NUMAI OFERTELE CU `auto_sync`. Cele preluate din contul lor au prețul pus de
 * comerciant în panoul eMAG; luate în „sincronizează prețurile", chiar apăsarea
 * asta le-ar fi șters. Cine vrea să le trimită totuși are butonul „Trimite acum" pe
 * fiecare, care e o cerere explicită pentru un produs anume.
 *
 * ⚠ NU trimite nimic pe loc: pune în coadă. O felie poate atinge mii de produse, iar
 * trimise sincron ar fi depășit timpul funcției și ar fi ars într-o clipă tot ritmul
 * de 3 cereri pe secundă — inclusiv cel de care are nevoie o vânzare.
 */
export async function sincronizeazaFelieEmag(
  businessId: string,
  felie: FelieSincronizare,
): Promise<{ puse: number } | { error: string }> {
  const g = await guard(businessId);
  if ("error" in g) return { error: g.error };

  const config = await loadConfig(businessId);
  if (!config.connected) return { error: "Contul eMAG nu este conectat." };
  if (config.needs_reconnect) return { error: "eMAG a refuzat acreditările. Reconectează contul." };

  const admin = createAdminClient();

  /*
   * ⚠ Se citesc ofertele, nu produsele. Un produs fără ofertă n-a fost publicat
   * niciodată, iar pus la coadă ar fi plecat pe ruta grea — adică „sincronizează
   * prețurile" ar fi publicat produse pe care nimeni nu ceruse să le publice.
   */
  const randuri = await fetchAllRowsStrict<{ product_id: string | null }>(
    "emag.felie", (from, to) =>
      admin.from("emag_offers").select("product_id")
        .eq("business_id", businessId).eq("auto_sync", true).not("product_id", "is", null)
        .order("emag_id", { ascending: true }).range(from, to),
  );

  const ids = [...new Set(randuri.map((r) => r.product_id).filter((x): x is string => !!x))];
  if (ids.length === 0) return { puse: 0 };

  /*
   * ═══ ⚠ SE RAPORTEAZĂ CÂTE AU INTRAT, NU CÂTE S-AU CERUT ═══
   *
   * Prima formă scria `{ puse: ids.length }` — câte găsise, nu câte pusese. Dar coada
   * poate primi ZERO din motive întemeiate: magazinul și-a stins sincronizarea
   * automată, sau toate ofertele sunt preluate din contul lor.
   *
   * În oricare dintre ele, ecranul ar fi spus „400 de produse puse la rând" și nu s-ar
   * fi pus niciunul. Adică exact forma incidentului VetDepo — răspuns de succes, efect
   * zero, și nimeni nu află.
   */
  const puse = felie === "stocuri"
    ? await enqueueEmagStocMany(businessId, ids)
    : felie === "preturi"
      ? await enqueueEmagPretMany(businessId, ids)
      : await enqueueEmagSyncMany(businessId, ids);

  /*
   * ⚠ Zero puse din N găsite cere o EXPLICAȚIE, nu un număr. Cel mai des e comutatorul
   * de sincronizare automată, iar omul care tocmai a apăsat un buton de sincronizare
   * n-are cum să bănuiască un comutator din altă carte a aceleiași pagini.
   */
  if (puse === 0) {
    return {
      error: config.auto_sync === false
        ? "„Trimite automat prețul și stocul” e oprit, așa că nu s-a pus nimic la rând. " +
          "Pornește-l, sau folosește „Trimite acum” pe produsul care te interesează."
        : "Nu s-a pus nimic la rând: ofertele tale sunt preluate din eMAG, iar acelea nu se " +
          "trimit automat. Folosește „Trimite acum” pe produsul care te interesează.",
    };
  }

  revalidatePath(FEATURE_PATH);
  return { puse };
}

/**
 * Aduce comenzile acum, fără să aștepte trecerea cronului.
 *
 * ⚠ NU atinge marcajul de timp al cronului. Fereastra de aici e scurtă și pornită de
 * om; mutat de ea, cursorul cronului ar fi sărit peste comenzi pe care nu le-a citit
 * nimeni. Se citește în PLUS, niciodată în locul lui.
 */
export async function aduComenzileAcumEmag(
  businessId: string,
): Promise<{ noi: number; actualizate: number } | { error: string }> {
  const g = await guard(businessId);
  if ("error" in g) return { error: g.error };

  const iesire = iesireEmag();
  if (iesire.eroare) return { error: iesire.eroare };

  const admin = createAdminClient();
  const ctx = await loadEmagContext(admin, businessId);
  if (!ctx) return { error: "Contul eMAG nu este conectat." };

  try {
    /* Două ore în urmă: destul cât să prindă ce a scăpat, destul de puțin cât să nu
       ardă ritmul magazinului la fiecare apăsare. */
    const rez = await aduComenzile(admin, ctx, new Date(Date.now() - 2 * 60 * 60 * 1000));
    revalidatePath("/dashboard/orders");
    return { noi: rez.noi, actualizate: rez.actualizate };
  } catch (e) {
    const mesaj = e instanceof Error ? e.message : "Comenzile nu s-au putut aduce.";
    void logError({ action: "emag.comenzi.acum", message: mesaj, details: { businessId }, severity: "error" });
    return { error: mesaj };
  }
}

/**
 * Reia elementele oprite după ce și-au ars toate încercările.
 *
 * ═══ ⚠ DE CE E UN BUTON, NU O RELUARE AUTOMATĂ ═══
 *
 * Un element abandonat a fost refuzat de cinci ori pentru același motiv. Reluat
 * singur, ar fi ars încă cinci cereri pentru același răspuns — și tot așa, la
 * nesfârșit, pe cele 3 cereri pe secundă ale magazinului.
 *
 * Abandonul înseamnă „ceva trebuie schimbat". Butonul se apasă DUPĂ schimbare, iar
 * apăsarea e chiar dovada că omul a făcut-o.
 *
 * ⚠ Contorul se pune la zero odată cu reluarea. Lăsat pe cinci, primul refuz de după
 * reparație ar fi abandonat elementul din nou, imediat.
 */
export async function reiaAbandonateleEmag(
  businessId: string,
): Promise<{ reluate: number } | { error: string }> {
  const g = await guard(businessId);
  if ("error" in g) return { error: g.error };

  const { data, error } = await createAdminClient().from("emag_sync_queue")
    .update({ abandonat_la: null, attempts: 0, next_retry_at: null, revendicat_pana: null })
    .eq("business_id", businessId).not("abandonat_la", "is", null)
    .select("id");

  if (error) return { error: error.message };

  revalidatePath(FEATURE_PATH);
  return { reluate: (data ?? []).length };
}

/**
 * Contul bancar dintr-un retur, cand eMAG chiar ni l-a trimis.
 *
 * ⚠ IBAN-UL E DATA PERSONALA. Se scoate din `raw` doar la cerere, si pleacă spre ecran
 * numai el, banca și beneficiarul — nu tot obiectul brut, care poartă și numele,
 * telefonul și adresa clientului.
 */
function contulDinRetur(brut: unknown): { iban: string; banca: string | null; beneficiar: string | null } | null {
  if (!brut || typeof brut !== "object") return null;
  const o = brut as Record<string, unknown>;
  const iban = typeof o.customer_account_iban === "string" ? o.customer_account_iban.trim() : "";
  if (!iban) return null;
  return {
    iban,
    banca: typeof o.customer_account_bank === "string" ? o.customer_account_bank.trim() || null : null,
    beneficiar: typeof o.customer_account_beneficiary === "string"
      ? o.customer_account_beneficiary.trim() || null : null,
  };
}

/* ═══════════════════════════════════════════════════════════════════════════
   JURNALUL DE CERERI (§65, §66)
   ═══════════════════════════════════════════════════════════════════════════ */

export interface RandJurnalEcran {
  id: string;
  cand: string;
  metoda: string;
  cale: string;
  status: number;
  verdict: string;
  verdictEticheta: string;
  durataMs: number | null;
  emagIds: number[];
  mesaje: string[];
  eroare: string | null;
  /** Firul lucrării (§66). Apăsat, arată toate cererile ei. */
  fir: string | null;
}

/**
 * Cum se citește un verdict, în cuvinte.
 *
 * ⚠ „Salvat, cu observații" NU e o eroare, și e chiar capcana eMAG: pe
 * `product_offer/save`, `isError: true` înseamnă că oferta E salvată, cu observații de
 * documentație. Scris „eșuat", comerciantul ar fi retrimis la nesfârșit o ofertă care
 * există deja acolo — și ar fi făcut duplicate.
 */
const ETICHETA_VERDICT: Record<string, string> = {
  reusit: "Reușit",
  reusit_cu_observatii: "Salvat, cu observații",
  refuz: "Refuzat",
  trecatoare: "Nu a răspuns — se reia",
  chei: "Acreditări",
};

const JURNAL_PE_PAGINA = 50;

/**
 * Ce a plecat spre eMAG și ce au răspuns.
 *
 * ═══ ⚠ CE NU ARATĂ, ȘI DE CE ═══
 *
 * Nu arată corpul cererii și nici al răspunsului. `awb/save` duce numele, adresa și
 * telefonul cumpărătorului; `order/read` întoarce comenzi întregi. Păstrate, jurnalul
 * ar fi devenit o A DOUA copie a datelor clienților — cu altă păstrare, alte drepturi
 * de citire și niciun motiv să existe.
 *
 * Arată în schimb ruta, verdictul, codul, durata, ofertele atinse și mesajele LOR —
 * care vorbesc despre câmpuri, nu despre oameni, și sunt partea folositoare.
 *
 * ⚠ Citirile reușite nu sunt aici, fiindcă nu se scriu deloc. Cronul bate din minut în
 * minut; scrise, ar fi fost zeci de mii de rânduri pe zi din care niciunul nu spune
 * nimic. Se spune pe ecran, ca nimeni să nu creadă că lipsesc din greșeală.
 */
export async function jurnalCereriEmag(
  businessId: string,
  filtru: { doarProbleme?: boolean; fir?: string; emagId?: number; pagina?: number } = {},
): Promise<{ randuri: RandJurnalEcran[]; total: number; pagina: number; pePagina: number } | { error: string }> {
  const g = await guard(businessId);
  if ("error" in g) return { error: g.error };

  const admin = createAdminClient();
  const pagina = Math.max(1, Math.floor(filtru.pagina ?? 1));
  const de_la = (pagina - 1) * JURNAL_PE_PAGINA;

  let q = admin.from("emag_request_log")
    .select("id, created_at, metoda, cale, status, verdict, durata_ms, emag_ids, mesaje, eroare, corelatie",
      { count: "exact" })
    .eq("business_id", businessId);

  /* ⚠ `neq`, nu o listă de verdicte rele. O listă ar fi rămas în urmă la primul verdict
     nou — și verdictul nou e tocmai cel despre care nimeni nu știe încă nimic. */
  if (filtru.doarProbleme) q = q.neq("verdict", "reusit");
  if (filtru.fir) q = q.eq("corelatie", filtru.fir);
  /* ⚠ `contains` pe tabloul de id-uri, care are index GIN. Fără el, căutarea după o
     ofertă ar fi citit tabelul întreg. */
  if (filtru.emagId != null && Number.isFinite(filtru.emagId)) {
    q = q.contains("emag_ids", [filtru.emagId]);
  }

  const { data, count, error } = await q
    .order("created_at", { ascending: false })
    .range(de_la, de_la + JURNAL_PE_PAGINA - 1);

  if (error) return { error: error.message };

  type Rand = {
    id: string; created_at: string; metoda: string; cale: string; status: number;
    verdict: string; durata_ms: number | null; emag_ids: number[] | null;
    mesaje: unknown; eroare: string | null; corelatie: string | null;
  };

  const randuri: RandJurnalEcran[] = ((data ?? []) as Rand[]).map((r) => ({
    id: r.id,
    cand: r.created_at,
    metoda: r.metoda,
    cale: r.cale,
    status: r.status,
    verdict: r.verdict,
    verdictEticheta: ETICHETA_VERDICT[r.verdict] ?? r.verdict,
    durataMs: r.durata_ms,
    emagIds: Array.isArray(r.emag_ids) ? r.emag_ids : [],
    /* ⚠ Mesajele lor pleacă spre ecran NEATINSE. Un rezumat scris de noi ar fi pierdut
       exact câmpul și valoarea care spun ce e de reparat. */
    mesaje: Array.isArray(r.mesaje) ? (r.mesaje as unknown[]).filter((m): m is string => typeof m === "string") : [],
    eroare: r.eroare,
    fir: r.corelatie,
  }));

  return { randuri, total: count ?? 0, pagina, pePagina: JURNAL_PE_PAGINA };
}

/* ═══════════════════════════════════════════════════════════════════════════
   CENTRUL PROBLEMELOR (§64)
   ═══════════════════════════════════════════════════════════════════════════ */

/**
 * Câte rânduri se citesc ca să se facă grupele din text liber.
 *
 * ⚠ SE MĂRGINEȘTE, ȘI SE SPUNE PE ECRAN CÂND S-A ATINS MARGINEA.
 *
 * Un catalog cu zeci de mii de oferte cu probleme ar fi însemnat zeci de mii de
 * rânduri citite la fiecare deschidere a panoului. Dar o margine TĂCUTĂ e mai rea
 * decât una lată: „3 grupuri" calculat din primele 1000 de rânduri dintr-un catalog
 * de 40.000 arată exact ca adevărul, și nu e.
 *
 * ⚠ Numărătorile pe stările de validare NU trec pe aici: ele sunt `count` exacte, pe
 * index, fără să citească niciun rând.
 */
const PROBLEME_MAXIM_RANDURI = 1000;

export interface CentruProblemeEcran {
  grupuri: GrupProbleme[];
  /** ⚠ Adevărat când grupele din text s-au făcut dintr-o parte, nu din tot. */
  taiat: boolean;
  /** Câte oferte au fost citite ca să se facă grupele din text. */
  citite: number;
}

/**
 * Ce e stricat, adunat pe feluri, ca să se repare o dată în loc de o sută.
 *
 * ═══ ⚠ TREI SURSE, CARE NU SE REPARĂ ÎN ACELAȘI LOC ═══
 *
 *   `emag`     — ei au respins ceva. Se repară în fișa produsului.
 *   `edinio`   — n-am putut trimite: lipsește ceva la noi.
 *   `legatura` — n-am ajuns la ei. Se reia singur; n-ai ce repara.
 *
 * Amestecate, comerciantul ar fi căutat în panoul greșit. De aceea sursa desparte
 * grupele chiar și când textul e identic.
 */
export async function centrulProblemelorEmag(
  businessId: string,
): Promise<CentruProblemeEcran | { error: string }> {
  const g = await guard(businessId);
  if ("error" in g) return { error: g.error };

  const admin = createAdminClient();

  /*
   * ⚠ NUMĂRĂTORI EXACTE pentru stările de validare, nu rânduri citite și numărate în
   * JavaScript. PostgREST taie tăcut la 1000: un magazin cu 4000 de oferte respinse
   * ar fi văzut „1000" și ar fi crezut că restul sunt în regulă.
   */
  const stariRele = Object.keys(VALIDARE_RA).map(Number);
  const numaratori = await Promise.all(stariRele.map((s) =>
    admin.from("emag_offers").select("*", { count: "exact", head: true })
      .eq("business_id", businessId).eq("validation_status", s)
      .then((r) => ({ stare: s, cate: r.count ?? 0 }))));

  /* Textul liber: al lor (`doc_errors`) și al nostru (`error`). */
  const { data: randuri } = await admin.from("emag_offers")
    .select("emag_id, doc_errors, issues, error, deriva")
    .eq("business_id", businessId)
    .or("error.not.is.null,deriva.not.is.null,doc_errors.neq.[],issues.neq.[]")
    .order("updated_at", { ascending: false })
    .limit(PROBLEME_MAXIM_RANDURI);

  /* Elementele abandonate din coadă: n-au ajuns niciodată la eMAG. */
  const { data: abandonate } = await admin.from("emag_sync_queue")
    .select("last_error, op")
    .eq("business_id", businessId)
    .not("abandonat_la", "is", null)
    .limit(PROBLEME_MAXIM_RANDURI);

  const necazuri: Necaz[] = [];

  for (const n of numaratori) {
    if (n.cate === 0) continue;
    /* ⚠ Numărul se POARTĂ, nu se numără element cu element. Un magazin cu patruzeci de
       mii de oferte respinse ar fi cerut altfel un tablou de patruzeci de mii de
       elemente identice, construit în memorie doar ca gruparea să numere până acolo.
       Nu se ține niciun id: n-am citit rândurile, și tocmai de aia numărătorile sunt
       ieftine — dar starea are deja filtrul ei în lista de oferte. */
    necazuri.push({
      sursa: "emag",
      cheie: `validare:${n.stare}`,
      titlu: VALIDARE_RA[n.stare],
      mesaj: VALIDARE_RA[n.stare],
      cate: n.cate,
    });
  }

  type RandProblema = {
    emag_id: number; doc_errors: unknown; issues: unknown; error: string | null; deriva: unknown;
  };
  for (const r of (randuri ?? []) as RandProblema[]) {
    for (const m of normalizeazaDocErrors(r.doc_errors)) {
      necazuri.push({ sursa: "emag", mesaj: m, emagId: r.emag_id });
    }
    /* ⚠ `issues` sunt ce am găsit NOI în fișa produsului (§19), nu ce spun ei. De
       aceea sursa e `edinio`: se repară în fișă, nu în panoul eMAG. */
    for (const m of normalizeazaDocErrors(r.issues)) {
      necazuri.push({ sursa: "edinio", mesaj: m, emagId: r.emag_id });
    }
    if (r.error) necazuri.push({ sursa: "edinio", mesaj: r.error, emagId: r.emag_id });

    /* ⚠ Numai derivele la care S-A RENUNȚAT. Cele care încă se repară singure nu sunt
       de făcut nimic cu ele — puse aici, ar fi umplut centrul cu treabă care se face
       singură, și l-ar fi făcut pe om să nu se mai uite. */
    const d = citesteMemoriaDerivei(r.deriva);
    if (d?.renuntatLa) {
      necazuri.push({
        sursa: "emag",
        cheie: "deriva-nereparata",
        titlu: "eMAG nu acceptă prețul sau stocul pe care îl trimitem",
        mesaj: d.campuri.map((c) => `${c.camp}: la tine ${c.laNoi}, pe eMAG ${c.laEi}`).join(" · "),
        emagId: r.emag_id,
      });
    }
  }

  for (const a of (abandonate ?? []) as { last_error: string | null; op: string }[]) {
    if (!a.last_error) continue;
    /* ⚠ Sursa e `edinio`: un element abandonat n-a mai ajuns la ei deloc. Pus pe
       `emag`, omul ar fi căutat reparația în panoul lor, unde nu e nimic de găsit. */
    necazuri.push({ sursa: "edinio", mesaj: a.last_error });
  }

  const citite = (randuri ?? []).length;
  return {
    grupuri: grupeaza(necazuri),
    taiat: citite >= PROBLEME_MAXIM_RANDURI,
    citite,
  };
}

/**
 * Cheamă curierul să ridice marfa de la client (§53).
 *
 * ═══ ⚠ TOATE PIEDICILE SE VERIFICĂ ÎNAINTE DE ORICE CERERE ═══
 *
 * Un AWB emis cheamă curierul și se plătește. Deci hotărârea „se poate?" e o funcție
 * curată, probată (`poateAwbRetur`), și se ia din datele pe care le avem deja — nu
 * din răspunsul lor, și nu după ce am ars o cerere din cele 3 pe secundă.
 *
 * ⚠ Ecranul arată butonul doar când `poateAwbRetur` spune da. Verificarea de aici NU
 * e o dublură: ecranul poate fi vechi de câteva minute, iar între timp returul își
 * poate schimba starea sau poate primi un AWB de la ei.
 */
export async function emiteAwbReturEmag(
  businessId: string,
  emagRmaId: number,
): Promise<{ numar: string | null; deja: boolean } | { error: string }> {
  const g = await guard(businessId);
  if ("error" in g) return { error: g.error };

  const iesire = iesireEmag();
  if (iesire.eroare) return { error: iesire.eroare };

  const admin = createAdminClient();
  const ctx = await loadEmagContext(admin, businessId);
  if (!ctx) return { error: "Contul eMAG nu este conectat." };

  const { data: randRma } = await admin.from("emag_rma")
    .select("order_id, emag_order_id, request_status, awbs, raw")
    .eq("business_id", businessId).eq("emag_rma_id", emagRmaId).maybeSingle();

  const rma = randRma as {
    order_id: string | null; emag_order_id: number | null;
    request_status: number | null; awbs: unknown; raw: unknown;
  } | null;
  if (!rma) return { error: "Returul nu a fost găsit." };

  const brutRma = (rma.raw ?? {}) as {
    pickup_method?: number; pickup_locality_id?: number;
    customer_name?: string; customer_phone?: string;
  };

  /* Adresa clientului vine din COMANDĂ: returul poartă doar localitatea, nu strada. */
  const { data: randComanda } = rma.order_id
    ? await admin.from("emag_orders").select("raw")
        .eq("business_id", businessId).eq("order_id", rma.order_id).maybeSingle()
    : { data: null };

  const brutComanda = ((randComanda as { raw?: unknown } | null)?.raw ?? {}) as {
    customer?: Record<string, string | number | undefined>;
  };
  const cl = (brutComanda.customer ?? {}) as Record<string, string | number | undefined>;
  const strada = String(cl.shipping_street ?? "").trim();

  const verdict = poateAwbRetur({
    pickupMethod: brutRma.pickup_method,
    stare: rma.request_status,
    awbs: rma.awbs,
    emagOrderId: rma.emag_order_id,
    pickupLocalityId: brutRma.pickup_locality_id,
    localitateComanda: Number(cl.shipping_locality_id) || null,
    areStrada: strada.length > 0,
  });
  if (!verdict.se_poate) return { error: verdict.motiv };
  if (!rma.order_id) return { error: "Returul nu e legat de o comandă din Edinio." };

  /*
   * ⚠ TIP 2 LA `contPotrivit`, nu 1. Conturile de curier au `courier_account_type`:
   * 1 = numai RMA, 2 = numai comenzi, 3 = amândouă. Un cont de livrare trimis pentru o
   * ridicare e refuzat, iar mesajul lor vorbește despre cont, nu despre tip —
   * comerciantul ar fi căutat greșeala în altă parte.
   */
  const conturi = await citesteConturiCurier(ctx.auth);
  if (isEmagError(conturi)) return { error: conturi.error };
  const cont = contPotrivit(
    (Array.isArray(conturi.data) ? conturi.data : []) as EmagContCurier[],
    2, { fel: "oricare" }, ctx.config.courier_account_id ?? null,
  );
  if (cont == null) {
    return { error: "Niciun cont de curier eMAG potrivit pentru ridicări. Verifică-le în contul tău eMAG." };
  }

  const rez = await emiteAwb(admin, ctx, {
    orderId: rma.order_id,
    emagOrderId: verdict.emagOrderId,
    emagRmaId,
    fel: 2,
    awb: {
      /*
       * ═══ ⚠ SENSUL E INVERS FAȚĂ DE LIVRARE ═══
       *
       * La retur, marfa pleacă DE LA client CĂTRE noi. Deci clientul e `sender` și noi
       * suntem `receiver`. Copiat din emiterea de livrare fără să se întoarcă sensul,
       * curierul ar fi plecat din depozitul nostru către client cu un colet gol — și
       * s-ar fi plătit oricum.
       */
      sender: {
        /* ⚠ Numele și telefonul din RETUR, nu din comandă: clientul poate da alt
           contact pentru ridicare decât cel de la livrare. Strada nu e în retur, deci
           aceea rămâne din comandă — și tocmai de aia se verifică localitatea. */
        name: brutRma.customer_name || String(cl.name ?? ""),
        contact: brutRma.customer_name || String(cl.name ?? ""),
        phone1: brutRma.customer_phone || String(cl.shipping_phone ?? cl.phone_1 ?? ""),
        street: strada,
        zipcode: String(cl.shipping_postal_code ?? ""),
        legal_entity: 0,
      },
      receiver: { address_id: ctx.config.pickup_address_id },
      is_oversize: 0,
      envelope_number: 0,
      parcel_number: 1,
      /* ⚠ ZERO. La o ridicare nu se încasează nimic de la client; un ramburs copiat din
         comandă i-ar fi cerut banii a doua oară, la ușă, pentru marfa pe care o dă înapoi. */
      cod: 0,
      courier_account_id: cont,
    },
  });

  if (rez.fel === "esec") return { error: rez.mesaj };
  revalidatePath(FEATURE_PATH);
  return { numar: rez.numar, deja: rez.fel === "deja" };
}

/**
 * Aduce comenzile vechi din eMAG, marcate ca istoric (§87).
 *
 * ═══ ⚠ NU SCADE STOC SI NU EMITE FACTURI ═══
 *
 * O comanda de acum trei luni si-a miscat marfa atunci si a fost facturata atunci.
 * Repetate, stocul ar fi ajuns pe minus in cateva secunde, iar facturile duplicate ar
 * fi plecat la ANAF cu serii noi — raul cel mai greu de desfacut din toate.
 *
 * Vezi `OptiuniIngest.istoric`: hotararea e acolo, langa efectele pe care le opreste.
 *
 * ⚠ Cursorul sincronizarii NU se atinge. Importul merge INAPOI; mutat de el,
 * cronul ar fi recitit un trimestru la fiecare minut, sau ar fi sarit peste comenzile
 * dintre timp.
 */
export async function importaIstoricEmag(
  businessId: string,
  zile: number,
): Promise<RezultatIstoric | { error: string }> {
  const g = await guard(businessId);
  if ("error" in g) return { error: g.error };

  const iesire = iesireEmag();
  if (iesire.eroare) return { error: iesire.eroare };

  const admin = createAdminClient();
  const ctx = await loadEmagContext(admin, businessId);
  if (!ctx) return { error: "Contul eMAG nu este conectat." };

  /* ⚠ Fir propriu (§66): un import de istoric face zeci de cereri, iar amestecate cu
     ale cronului n-ar mai fi putut fi urmarite. */
  const r = await cuFir(firNou("istoric"), () => aduIstoricul(admin, ctx, zile));

  revalidatePath(FEATURE_PATH);
  revalidatePath("/dashboard/orders");
  return r;
}

/* ═══════════════════════════════════════════════════════════════════════════
   CAMPANIILE (§56, §57)
   ═══════════════════════════════════════════════════════════════════════════ */

export interface RezultatPropunereEcran {
  propuse: number;
  /** Ofertele sărite, cu motivul. ⚠ Se arată; sărite tăcut, nimeni n-ar afla. */
  sarite: { emagId: number; motiv: string }[];
}

/** Câte oferte se propun dintr-o apăsare. ⚠ Loturi de 50, deci 20 de cereri. */
const OFERTE_PE_PROPUNERE = 1000;

/**
 * Propune ofertele magazinului într-o campanie eMAG.
 *
 * ═══ ⚠ NUMĂRUL CAMPANIEI SE IA DIN PANOUL LOR ═══
 *
 * Căutat în tot OpenAPI-ul lor: nu există nicio rută care să listeze campaniile. Deci
 * nu se poate face un meniu, iar comerciantul trebuie să copieze numărul. E scris pe
 * ecran ca atare — altfel ar căuta o listă care nu poate exista.
 *
 * ═══ ⚠ SE PROPUN DOAR OFERTELE CARE CHIAR SE VÂND ═══
 *
 * O ofertă în validare, respinsă sau retrasă n-are ce căuta într-o campanie: eMAG o
 * refuză, iar refuzul contează la ei. Se filtrează aici, nu acolo.
 */
export async function propuneInCampanieEmag(
  businessId: string,
  cerere: { campaignId: number; reducere: number; stocMaxim?: number | null; maxPeComanda?: number | null },
): Promise<RezultatPropunereEcran | { error: string }> {
  const g = await guard(businessId);
  if ("error" in g) return { error: g.error };

  /* ⚠ Piedicile se ridică ÎNAINTE de orice cerere: mesajele lor vorbesc despre câmpuri,
     iar un `campaign_id` greșit întoarce ceva ce nu spune „nu există campania asta". */
  const piedica = cePiedicaAreCampania(cerere);
  if (piedica) return { error: piedica };

  const iesire = iesireEmag();
  if (iesire.eroare) return { error: iesire.eroare };

  const admin = createAdminClient();
  const ctx = await loadEmagContext(admin, businessId);
  if (!ctx) return { error: "Contul eMAG nu este conectat." };

  /*
   * ═══ ⚠ PREȚUL ȘI STOCUL VIN DIN `oferteUsoare`, NU DIN `products` ═══
   *
   * Prima formă lua `products.price` și `products.stock_quantity` pentru TOATE
   * rândurile, inclusiv cele cu `variant_title`. Adică prețul PRODUSULUI pentru
   * fiecare variantă.
   *
   * Costul, măsurat pe date reale: la produsele venite din importul eMAG,
   * `products.price` e ANUME cel mai MIC dintre combinații — vezi `import-produse.ts`,
   * unde fișa spune „de la X lei". Deci un produs cu S la 100 și XXL la 300 are
   * `price = 100`, iar o campanie de −20% ar fi trimis XXL cu 65,57 lei net în loc de
   * 198,35. Se vinde XXL la o treime din preț.
   *
   * Și mai rău: `post_campaign_sale_price` primea același preț greșit — deci după
   * campanie eMAG ar fi lăsat XXL definitiv la prețul lui S. eMAG acceptă tot: sunt
   * numere valide, în schema lor. Niciun mesaj, nicăieri.
   *
   * ⚠ Se folosește CHIAR funcția care trimite. Aceeași regulă ca la derivă: un calcul
   * paralel al prețului rămâne în urmă la prima schimbare, iar aici „în urmă" înseamnă
   * marfă vândută sub cost.
   */
  const { data: randuri } = await admin.from("emag_offers")
    .select("emag_id, variant_title, product_id")
    .eq("business_id", businessId)
    .eq("status", "live" satisfies StareOferta)
    .eq("auto_sync", true)
    .not("product_id", "is", null)
    .limit(OFERTE_PE_PROPUNERE);

  type Rand = { emag_id: number; variant_title: string | null; product_id: string | null };
  const brute = (randuri ?? []) as Rand[];

  /* Ofertele se grupează pe produs: prețul unei variante se naște din combinația ei. */
  const peProdus = new Map<string, Rand[]>();
  for (const r of brute) {
    if (!r.product_id) continue;
    const lista = peProdus.get(r.product_id);
    if (lista) lista.push(r); else peProdus.set(r.product_id, [r]);
  }

  const oferte: OfertaPentruCampanie[] = [];
  for (const bucata of bucatiDeIduri([...peProdus.keys()])) {
    const { data: produse, error: eProduse } = await admin.from("products")
      .select("id, name, description, price, compare_at_price, images, category, sku, weight_grams, stock_quantity, is_active, page_sections")
      .eq("business_id", businessId).in("id", bucata);
    if (eProduse) return { error: eProduse.message };

    for (const produs of (produse ?? []) as ProdusDeCartografiat[]) {
      const aleLui = peProdus.get(produs.id) ?? [];
      const amTrimite = oferteUsoare(
        produs,
        magazinDin(ctx, produs),
        aleLui.map((r) => ({ variant_title: r.variant_title, emag_id: r.emag_id })),
      );
      for (const o of amTrimite) {
        /* `sale_price` de acolo e DEJA fără TVA — chiar valoarea care pleacă la eMAG. */
        if (o.sale_price == null) continue;
        oferte.push({
          emagId: o.id,
          pretNet: o.sale_price,
          stoc: o.stock?.[0]?.value ?? 0,
        });
      }
    }
  }

  if (oferte.length === 0) {
    return { error: "N-ai nicio ofertă care se vinde pe eMAG. Publică întâi produsele." };
  }

  const { propuneri, sarite } = pregatestePropunerile(oferte, cerere);
  if (propuneri.length === 0) {
    return { error: "Nicio ofertă nu poate intra în campanie. Verifică stocurile și prețurile." };
  }

  /* ⚠ Fir propriu (§66): o propunere face zeci de cereri în loturi de 50. */
  const r = await cuFir(firNou("campanie"), () => propuneOferte(ctx, propuneri));
  if (r.fel === "esec") return { error: r.mesaj };

  revalidatePath(FEATURE_PATH);
  return { propuse: propuneri.length, sarite };
}

/* ═══════════════════════════════════════════════════════════════════════════
   CE ȚI-A FACTURAT eMAG (§89)
   ═══════════════════════════════════════════════════════════════════════════ */

export interface FacturiLorEcran {
  facturi: FacturaEcran[];
  totaluri: TotalPeCategorie[];
  /** Monedele întâlnite. ⚠ Nu se adună între ele; se spune când sunt mai multe. */
  monede: string[];
}

/** Câte facturi se cer. ⚠ Maximul lor pe rută e 1000; o sută acoperă un an. */
const FACTURI_PE_CERERE = 100;

/**
 * Facturile pe care ți le-a emis eMAG.
 *
 * ═══ ⚠ DE CE DIN FACTURILE LOR, ȘI NU DINTR-UN TABEL DE COMISIOANE ═══
 *
 * Căutat în tot OpenAPI-ul lor: NU există nicio rută care să spună cât e comisionul pe
 * o categorie. Un tabel de procente ținut de noi ar îmbătrâni tăcut și ar arăta sume
 * care nu se potrivesc cu extrasul de cont — cel mai prost fel de a greși cu bani.
 *
 * Facturile lor sunt fapte.
 *
 * ═══ ⚠ MARJA NU SE POATE SOCOTI, ȘI SE SPUNE PE ECRAN ═══
 *
 * Marja cere prețul de ACHIZIȚIE, iar `products` n-are nicio coloană de cost —
 * verificat. „Încasări minus comision" nu e marjă; arătată drept marjă, comerciantul
 * ar fi luat hotărâri de preț pe un număr care nu înseamnă ce scrie pe el.
 */
export async function facturileEmag(
  businessId: string,
  luni = 3,
): Promise<FacturiLorEcran | { error: string }> {
  const c = await contextPentruCitire(businessId);
  if ("error" in c) return c;

  const acum = new Date();
  const de = new Date(acum);
  de.setMonth(de.getMonth() - Math.max(1, Math.min(Math.floor(luni) || 1, 24)));

  const zi = (d: Date) => d.toISOString().slice(0, 10);

  /* ⚠ Numele categoriilor și facturile se cer împreună: fără nume, ecranul ar fi arătat
     coduri („FC", „FT") pe care nu le știe nimeni. O cerere în plus, o dată. */
  const [categorii, raspuns] = await Promise.all([
    citesteCategoriiFacturi(c.auth),
    citesteFacturi(c.auth, {
      date_start: zi(de),
      date_end: zi(acum),
      itemsPerPage: FACTURI_PE_CERERE,
    }),
  ]);

  if (isEmagError(raspuns)) return { error: raspuns.error };

  /* ⚠ O cădere la CATEGORII nu oprește nimic: se arată codurile lor, care sunt tot
     adevărul, doar mai scurt. Facturile sunt partea care contează. */
  const nume = isEmagError(categorii) ? {} : numeleCategoriilor(categorii.data);

  const facturi = facturileLorPentruEcran(raspuns.data, nume);
  const monede = [...new Set(facturi.map((f) => f.moneda).filter(Boolean))];

  return { facturi, totaluri: adunaPeCategorii(facturi), monede };
}

/* ═══════════════════════════════════════════════════════════════════════════
   PRODUSELE CARE NU-S ÎNCĂ PE eMAG
   ═══════════════════════════════════════════════════════════════════════════ */

export interface ProdusDePublicat {
  id: string;
  nume: string;
  sku: string | null;
  categorie: string | null;
  /** ⚠ Fără categorie mapată, publicarea e refuzată. Se arată, nu se ascunde. */
  categorieMapata: boolean;
  pret: number;
  stoc: number;
}

export interface ListaDePublicat {
  produse: ProdusDePublicat[];
  total: number;
  pagina: number;
  pePagina: number;
  /** Categoriile magazinului, cu semn dacă sunt legate de eMAG. */
  categorii: { nume: string; mapata: boolean; cate: number }[];
}

const DE_PUBLICAT_PE_PAGINA = 50;

/**
 * Produsele din catalog care n-au încă nicio ofertă pe eMAG.
 *
 * ═══ ⚠ DE CE ARE NEVOIE DE UN ECRAN AL LOR ═══
 *
 * Lista de oferte arată doar ce EXISTĂ deja pe eMAG. Un produs nepublicat nu apare
 * nicăieri în ecranele eMAG — deci nu există niciun loc din care să-l trimiți.
 *
 * Pentru un catalog care n-a fost niciodată acolo, asta însemna că nu exista NICIO
 * cale în masă. Măsurat: 1353 de produse, 0 oferte, niciun drum.
 *
 * ⚠ Se citesc produsele care NU au rând în `emag_offers`, nu cele „fără ofertă activă".
 * Un produs retras rămâne cu rândul lui (eMAG n-are ștergere de oferte), iar arătat
 * aici ar fi fost republicat de cineva care credea că nu e acolo.
 */
export async function produseDePublicatEmag(
  businessId: string,
  filtru: { categorie?: string; cautare?: string; pagina?: number } = {},
): Promise<ListaDePublicat | { error: string }> {
  const g = await guard(businessId);
  if ("error" in g) return { error: g.error };

  const config = await loadConfig(businessId);
  const admin = createAdminClient();
  const harta = config.category_map ?? {};

  /*
   * ⚠ Id-urile ofertelor se citesc INTEGRAL, cu `fetchAllRowsStrict`. PostgREST taie
   * tăcut la 1000: cu o simplă interogare, un magazin cu 4000 de oferte ar fi văzut
   * 3000 de produse „nepublicate" care sunt de fapt pe eMAG — și le-ar fi publicat a
   * doua oară.
   */
  const randuriOferte = await fetchAllRowsStrict<{ product_id: string | null }>(
    "emag.dePublicat", (from, to) =>
      admin.from("emag_offers").select("product_id")
        .eq("business_id", businessId).not("product_id", "is", null)
        .order("emag_id", { ascending: true }).range(from, to),
  );
  const publicate = new Set(randuriOferte.map((r) => r.product_id).filter((x): x is string => !!x));

  /* Catalogul activ, întreg — din el se scad cele publicate. */
  const produse = await fetchAllRowsStrict<{
    id: string; name: string; sku: string | null; category: string | null;
    price: number | null; stock_quantity: number | null;
  }>(
    "emag.catalogDePublicat", (from, to) =>
      admin.from("products")
        .select("id, name, sku, category, price, stock_quantity")
        .eq("business_id", businessId).eq("is_active", true)
        .order("created_at", { ascending: true }).range(from, to),
  );

  const nepublicate = produse.filter((p) => !publicate.has(p.id));

  /* Categoriile se numără pe TOT ce e nepublicat, nu pe pagina arătată: altfel
     numerele din meniu s-ar fi schimbat la fiecare răsfoire. */
  const peCategorie = new Map<string, number>();
  for (const p of nepublicate) {
    const c = (p.category ?? "").trim() || "—";
    peCategorie.set(c, (peCategorie.get(c) ?? 0) + 1);
  }

  const cautare = (filtru.cautare ?? "").trim().toLowerCase();
  const filtrate = nepublicate.filter((p) => {
    if (filtru.categorie && (p.category ?? "").trim() !== filtru.categorie) return false;
    if (!cautare) return true;
    return (p.name ?? "").toLowerCase().includes(cautare)
      || (p.sku ?? "").toLowerCase().includes(cautare);
  });

  const pagina = Math.max(1, Math.floor(filtru.pagina ?? 1));
  const de_la = (pagina - 1) * DE_PUBLICAT_PE_PAGINA;

  return {
    produse: filtrate.slice(de_la, de_la + DE_PUBLICAT_PE_PAGINA).map((p) => ({
      id: p.id,
      nume: p.name,
      sku: p.sku,
      categorie: p.category,
      categorieMapata: !!harta[(p.category ?? "").trim()]?.category_id,
      pret: Number(p.price ?? 0) || 0,
      stoc: Number(p.stock_quantity ?? 0) || 0,
    })),
    total: filtrate.length,
    pagina,
    pePagina: DE_PUBLICAT_PE_PAGINA,
    categorii: [...peCategorie.entries()]
      .map(([nume, cate]) => ({ nume, cate, mapata: !!harta[nume]?.category_id }))
      .sort((a, b) => b.cate - a.cate),
  };
}

/**
 * Pune la rând produsele alese, ca să fie publicate pe eMAG.
 *
 * ⚠ Se refuză din start produsele fără categorie mapată. Trimise, eMAG le-ar fi
 * respins una câte una, iar comerciantul ar fi văzut o sută de eșecuri identice în loc
 * de un singur mesaj care spune ce are de legat.
 */
export async function publicaProduseleEmag(
  businessId: string,
  productIds: string[],
): Promise<{ puse: number; faraCategorie: string[] } | { error: string }> {
  const g = await guard(businessId);
  if ("error" in g) return { error: g.error };

  const config = await loadConfig(businessId);
  if (!config.connected) return { error: "Contul eMAG nu este conectat." };
  if (config.needs_reconnect) return { error: "eMAG a refuzat acreditările. Reconectează contul." };

  const lipsa = ceLipsestePentruPublicare(config);
  if (lipsa) return { error: lipsa };

  const ids = [...new Set((productIds ?? []).filter((x) => typeof x === "string" && x))];
  if (ids.length === 0) return { error: "N-ai ales niciun produs." };

  const admin = createAdminClient();
  const harta = config.category_map ?? {};

  /* ⚠ `bucatiDeIduri`: peste ~650 de id-uri, `.in()` cade cu 400 în text simplu —
     măsurat pe proiectul real. Vezi `id-chunks.ts`. */
  const randuri: { id: string; category: string | null }[] = [];
  for (const bucata of bucatiDeIduri(ids)) {
    const { data, error } = await admin.from("products")
      .select("id, category").eq("business_id", businessId).in("id", bucata);
    if (error) return { error: error.message };
    randuri.push(...((data ?? []) as { id: string; category: string | null }[]));
  }

  const faraCategorie = [...new Set(
    randuri.filter((r) => !harta[(r.category ?? "").trim()]?.category_id)
      .map((r) => (r.category ?? "").trim() || "—"),
  )];
  const deTrimis = randuri
    .filter((r) => harta[(r.category ?? "").trim()]?.category_id)
    .map((r) => r.id);

  if (deTrimis.length === 0) {
    return {
      error: `Niciun produs ales n-are categoria legată de eMAG. Leagă întâi: ${faraCategorie.join(", ")}.`,
    };
  }

  const puse = await publicaPeEmagMany(businessId, deTrimis);
  if (puse === 0) {
    return {
      error: "Nu s-a pus nimic la rând. Ofertele produselor alese sunt preluate din contul " +
        "tău eMAG, iar acelea nu se rescriu automat.",
    };
  }

  revalidatePath(FEATURE_PATH);
  return { puse, faraCategorie };
}

/**
 * Pune la rând ofertele alese din listă.
 *
 * ⚠ Trece prin COADĂ, nu prin trimitere directă. „Trimite acum" de pe un rând ține
 * omul pe loc cât durează cererea — acceptabil pentru unul, absurd pentru cincizeci:
 * funcția ar fi depășit limita de timp a platformei și ar fi lăsat jumătate trimise,
 * fără să spună care.
 *
 * ⚠ Se folosește `enqueueEmagSyncMany`, nu `publicaPeEmagMany`: aici sunt oferte care
 * EXISTĂ deja. Un produs fără ofertă n-are ce căuta în lista asta, iar dacă ajunge
 * cumva, nu vrem să-l publicăm dintr-un buton care spune „retrimite".
 */
export async function trimiteSelectiaEmag(
  businessId: string,
  productIds: string[],
  op: "oferta" | "pret" | "stoc" = "oferta",
): Promise<{ puse: number } | { error: string }> {
  const g = await guard(businessId);
  if ("error" in g) return { error: g.error };

  const config = await loadConfig(businessId);
  if (!config.connected) return { error: "Contul eMAG nu este conectat." };
  if (config.needs_reconnect) return { error: "eMAG a refuzat acreditările. Reconectează contul." };

  const ids = [...new Set((productIds ?? []).filter((x) => typeof x === "string" && x))];
  if (ids.length === 0) return { error: "N-ai ales nicio ofertă." };

  const puse = op === "stoc"
    ? await enqueueEmagStocMany(businessId, ids)
    : op === "pret"
      ? await enqueueEmagPretMany(businessId, ids)
      : await enqueueEmagSyncMany(businessId, ids);

  /* ⚠ Zero puse din N alese cere o explicație, nu un număr. Cel mai des: ofertele alese
     sunt preluate din contul lor, iar acelea nu se rescriu automat. */
  if (puse === 0) {
    return {
      error: "Nu s-a pus nimic la rând. Ofertele alese sunt preluate din contul tău eMAG " +
        "(sincronizarea lor e oprită), iar acelea nu se rescriu automat.",
    };
  }

  revalidatePath(FEATURE_PATH);
  return { puse };
}
