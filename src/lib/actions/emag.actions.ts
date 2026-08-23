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
  emagGloballyEnabled, emagIpDeAlbit, iesireEmag, maskSecret, monedaEmag,
} from "@/lib/emag/auth";
import {
  citesteAdrese, citesteConturiCurier, isEmagError, testeazaConexiunea, type EmagAuth,
} from "@/lib/emag/client";
import {
  aduCategorii, aduCoteTva, aduTimpiPregatire, alegeCotaTva, alegeTimpPregatire,
  sugereazaCategorie,
} from "@/lib/emag/taxonomy";
import { ceLipsestePentruPublicare, loadEmagContext } from "@/lib/emag/sync";
import { trimiteElement } from "@/lib/emag/trimite";
import {
  leagaOferteleNoi, ruleazaImportEmag, SURSA_EMAG, type RezultatImportEmag,
} from "@/lib/emag/import-run";
import { processImport } from "@/lib/import/committer";
import {
  EMAG_ETICHETA_TARA, EMAG_TARA_IMPLICITA, EMAG_TARI,
  type EmagAdresa, type EmagContCurier, type EmagCotaTva, type EmagConfig,
  type EmagTara, type EmagValoareTimpPregatire,
} from "@/lib/emag/types";

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
async function loadConfig(businessId: string): Promise<EmagConfig> {
  const { data } = await createAdminClient()
    .from("store_settings").select("emag_config").eq("business_id", businessId).single();
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
  vatId: number | null;
  handlingTime: number | null;
  categoriiMapate: number;
  oferte: { total: number; active: number; inValidare: number; respinse: number; eroare: number };
  inCoada: number;
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
  const [total, active, inValidare, respinse, eroare, inCoada] = await Promise.all([
    admin.from("emag_offers").select("*", { count: "exact", head: true }).eq("business_id", businessId),
    admin.from("emag_offers").select("*", { count: "exact", head: true }).eq("business_id", businessId).eq("status", "activ"),
    admin.from("emag_offers").select("*", { count: "exact", head: true }).eq("business_id", businessId).eq("status", "in_validare"),
    admin.from("emag_offers").select("*", { count: "exact", head: true }).eq("business_id", businessId).eq("status", "respins"),
    admin.from("emag_offers").select("*", { count: "exact", head: true }).eq("business_id", businessId).eq("status", "eroare"),
    admin.from("emag_sync_queue").select("*", { count: "exact", head: true }).eq("business_id", businessId),
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
    vatId: config.vat_id ?? null,
    handlingTime: config.handling_time ?? null,
    categoriiMapate: Object.keys(config.category_map ?? {}).length,
    oferte: {
      total: total.count ?? 0,
      active: active.count ?? 0,
      inValidare: inValidare.count ?? 0,
      respinse: respinse.count ?? 0,
      eroare: eroare.count ?? 0,
    },
    inCoada: inCoada.count ?? 0,
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
): Promise<{ sugestii: Record<string, { id: number; label: string; scor: number; incredere: string }[]>; trunchiat: boolean } | { error: string }> {
  const c = await contextPentruCitire(businessId);
  if ("error" in c) return c;

  const adus = await aduCategorii(c.auth);
  if (adus.error) return { error: adus.error };

  const admin = createAdminClient();
  const { data: produse } = await admin
    .from("products").select("category").eq("business_id", businessId).not("category", "is", null);

  const numeUnice = [...new Set((produse ?? []).map((p) => (p.category ?? "").trim()).filter(Boolean))];

  const sugestii: Record<string, { id: number; label: string; scor: number; incredere: string }[]> = {};
  for (const nume of numeUnice) {
    sugestii[nume] = sugereazaCategorie(nume, adus.categorii, 3).map((s) => ({
      id: s.categoryId, label: s.label, scor: s.scor, incredere: s.incredere,
    }));
  }

  return { sugestii, trunchiat: adus.trunchiat };
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

  const noua: EmagConfig = {
    ...veche,
    ...(setari.vat_id != null ? { vat_id: setari.vat_id } : {}),
    ...(setari.handling_time != null ? { handling_time: setari.handling_time } : {}),
    ...(setari.warranty_default != null ? { warranty_default: setari.warranty_default } : {}),
    ...(banda != null ? { price_band_pct: banda } : {}),
    ...(setari.auto_sync != null ? { auto_sync: setari.auto_sync } : {}),
    ...(setari.auto_publish != null ? { auto_publish: setari.auto_publish } : {}),
    ...(setari.warehouse_id != null ? { warehouse_id: setari.warehouse_id } : {}),
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
