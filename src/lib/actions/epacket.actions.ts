"use server";
import { enqueueAboutYouShip } from "@/lib/aboutyou/queue";
import { dupaRaspuns } from "@/lib/marketplace/dupa-raspuns";

import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { pastreazaSecretele, PLACEHOLDER_SECRET_SALVAT } from "@/lib/integrari/secrete";
import { secretDinConfig } from "@/lib/integrari/secret-server";
import { logError } from "@/lib/error-logger";
import { cheieOperatie, cuRegistru, marcheazaAnulata, operatiiAtarnate } from "@/lib/operatii/registru";
import { verdictFurnizor } from "@/lib/operatii/eroare-furnizor";
import { poartaAwbPropriu } from "@/lib/orders/poarta-awb";
import { motivContInactiv } from "@/lib/subscription-server";
import {
  CURIERI_EPACKET, NUME_CURIER_EPACKET, areCurierulPuncte, campulEroriiEpacket,
  creeazaAwbEpacket, eAwbNegasit, eCheieDeTest, eCurierEpacket, epacketGata, etichetaEpacket,
  probaConexiuneEpacket, stareEpacket, tarifeEpacket,
  type AwbEpacket, type CurierCuPuncte, type EpacketConfig, type LocalitateEpacket, type OfertaEpacket,
  type RezultatProbaEpacket,
} from "@/lib/epacket/client";
import {
  corpAwbEpacket, despartaNumele, lipsuriExpediereEpacket, referintaEpacket,
  type ColetEpacket, type DateAwbEpacket, type DateExpediereEpacket,
} from "@/lib/epacket/expediere";
import { despartaAdresa, type AdresaDespartita } from "@/lib/epacket/adresa";
import { rezolvaLocalitatea, type RezultatLocalitate } from "@/lib/epacket/localitati";
import { codPostalPentru, type SursaCodPostal } from "@/lib/epacket/puncte";
import { cautaLocalitati, puncteDinLocalitate } from "@/lib/epacket/nomenclator";
import { livrareaComenzii, type AdresaCuPunct } from "@/lib/epacket/livrare";
import { hotarareaDezlegarii, type CitireaStarii } from "@/lib/epacket/dezlegare";
import { descriereStare, normalizeazaStatus } from "@/lib/epacket/statusuri";
import type { Json } from "@/types/database.types";

/**
 * Actiunile e-packet.
 *
 * ⚠ Fisier „use server": FIECARE export e un capat public, deci aici stau numai functiile async.
 * Regulile pure sunt in `src/lib/epacket/`, unde se si probeaza.
 *
 * ⚠⚠ E-PACKET NU ARE NICI ANULARE, NICI IDEMPOTENTA, NICI CAUTARE. Fiecare `POST /awb` creeaza
 * si TAXEAZA un AWB nou. Deci:
 *   - tot ce stim ca le trebuie se verifica INAINTE de registru (`lipsuriExpediereEpacket`);
 *   - un raspuns pierdut ramane `necunoscut` si BLOCHEAZA reincercarea: nu exista citire care sa
 *     lamureasca. Supapa e `leagaAwbEpacketAction`: omul gaseste AWB-ul in aplicatia lor si il
 *     leaga de comanda (verificat la ei), sau, daca nu exista, deblocheaza din pagina comenzii;
 *   - „Detaseaza AWB" nu anuleaza nimic la ei: spune cinstit ce ramane viu si platit.
 */

// ─── Proprietarul ─────────────────────────────────────────────────────────────

type Proprietar =
  | { ok: false; error: string }
  | { ok: true; supabase: Awaited<ReturnType<typeof createClient>> };

async function proprietar(businessId: string): Promise<Proprietar> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: "Neautorizat" };

  const { data: biz } = await supabase
    .from("businesses").select("id").eq("id", businessId).eq("user_id", user.id).single();
  if (!biz) return { ok: false, error: "Acces interzis" };

  return { ok: true, supabase };
}

/**
 * Cheia venita din formular. ⚠ Textul-inlocuitor al campului mascat NU e o cheie: trimis mai
 * departe, ar fi fost salvat sau probat la e-packet drept cheia comerciantului.
 */
function cheiaPrimita(v: unknown): string {
  const s = typeof v === "string" ? v.trim() : "";
  return s === PLACEHOLDER_SECRET_SALVAT.trim() ? "" : s;
}

function text(v: unknown, max = 200): string {
  return typeof v === "string" ? v.trim().slice(0, max) : "";
}

function cm(v: unknown): number {
  const n = Number(v);
  return Number.isFinite(n) && n >= 1 && n <= 300 ? Math.round(n * 10) / 10 : 0;
}

/**
 * Configurarea venita din formular, adusa la forma cunoscuta. ⚠ Numai campurile stiute ajung in
 * baza: un camp strain trimis din browser n-are ce cauta in configurarea unui curier.
 */
function configCurata(c: EpacketConfig): EpacketConfig {
  const e = c?.expeditor ?? {};
  const r = c?.ramburs ?? {};
  const d = c?.dimensiuni_implicite;
  const loc = Number(e.localitate_id);
  const dim = d ? { lungime: cm(d.lungime), latime: cm(d.latime), inaltime: cm(d.inaltime) } : null;
  return {
    enabled: c?.enabled === true,
    api_key: cheiaPrimita(c?.api_key),
    expeditor: {
      prenume: text(e.prenume, 25), nume: text(e.nume, 25), firma: text(e.firma, 100),
      telefon: text(e.telefon, 30), email: text(e.email, 120),
      localitate_id: Number.isInteger(loc) && loc > 0 ? loc : null,
      localitate_nume: text(e.localitate_nume, 120),
      cod_postal: text(e.cod_postal, 6).replace(/\s+/g, ""),
      strada: text(e.strada, 50), numar: text(e.numar, 10), bloc: text(e.bloc, 30),
      scara: text(e.scara, 10), etaj: text(e.etaj, 10), apartament: text(e.apartament, 10),
    },
    ramburs: { titular: text(r.titular, 100), iban: text(r.iban, 40), banca: text(r.banca, 100) },
    curier_adresa: eCurierEpacket(c?.curier_adresa) ? c.curier_adresa : "DPD",
    lockere: c?.lockere === true,
    curier_puncte: areCurierulPuncte(c?.curier_puncte) ? c.curier_puncte : "SDY",
    ...(dim && dim.lungime && dim.latime && dim.inaltime ? { dimensiuni_implicite: dim } : {}),
    asigurare: c?.asigurare === true,
    deschidere_colet: c?.deschidere_colet === true,
    dimensiune_eticheta: c?.dimensiune_eticheta === "A4" ? "A4" : "A6",
    continut_implicit: text(c?.continut_implicit, 50),
  };
}

// ─── Configurare ──────────────────────────────────────────────────────────────

export async function saveEpacketConfig(
  businessId: string,
  config: EpacketConfig,
): Promise<{ success: true } | { error: string }> {
  const ctx = await proprietar(businessId);
  if (!ctx.ok) return { error: ctx.error };

  const primit = configCurata(config);

  /*
   * Cheia venita GOALA isi pastreaza valoarea salvata: formularul o primeste mascata.
   * ⚠ Configul vechi se citeste cu SERVICE ROLE (pe clientul comerciantului cheia vine
   * `enc.v1.…`), dupa dovada proprietatii, iar o citire picata OPRESTE salvarea: luata drept
   * „nimic salvat", ar fi scris peste cheie un camp gol.
   */
  const { data: vechi, error: eVechi } = await createAdminClient()
    .from("store_settings").select("epacket_config").eq("business_id", businessId).maybeSingle();
  if (eVechi) return { error: `Configurarea salvata nu s-a putut citi (${eVechi.message}). Nu am salvat nimic.` };
  const configFinal = pastreazaSecretele("epacket_config", primit, vechi?.epacket_config);

  const { error } = await ctx.supabase.from("store_settings").update({
    epacket_config: configFinal as unknown as Json,
    updated_at: new Date().toISOString(),
  }).eq("business_id", businessId);

  if (error) return { error: error.message };
  return { success: true };
}

export async function disconnectEpacket(
  businessId: string,
): Promise<{ success: true } | { error: string }> {
  const ctx = await proprietar(businessId);
  if (!ctx.ok) return { error: ctx.error };

  /*
   * ⚠ ZONA SE STINGE ODATA CU CONFIGURAREA (lectia Curiera): checkoutul nu mai vinde e-packet fara
   * configurare (`epacketGata`), iar la un magazin care o avea SINGURA, lista de livrare ar fi iesit
   * goala si nu s-ar mai fi putut plasa nicio comanda.
   */
  const { data: rand, error: eCitire } = await ctx.supabase
    .from("store_settings").select("shipping_zones").eq("business_id", businessId).maybeSingle();
  if (eCitire) return { error: `Setarile de livrare nu s-au putut citi (${eCitire.message}). Nu am deconectat nimic.` };
  const zone = rand?.shipping_zones;
  const pornita = !!zone && typeof zone === "object" && !Array.isArray(zone)
    && ((zone as Record<string, { enabled?: unknown } | undefined>).epacket?.enabled === true);

  const { error } = await ctx.supabase.from("store_settings").update({
    epacket_config: null,
    ...(pornita
      ? {
          shipping_zones: {
            ...(zone as Record<string, unknown>),
            epacket: { ...((zone as Record<string, Record<string, unknown>>).epacket), enabled: false },
          } as unknown as Json,
        }
      : {}),
    updated_at: new Date().toISOString(),
  }).eq("business_id", businessId);

  if (error) return { error: error.message };
  return { success: true };
}

/**
 * Proba de conexiune: o cautare AUTENTIFICATA (fara cheie buna raspunde 401, masurat). Nu
 * salveaza nimic si nu creeaza nimic. Cheia goala sau mascata = cea salvata.
 */
export async function testEpacketConnectionAction(
  businessId: string,
  apiKey: string,
): Promise<{ ok: true; proba: RezultatProbaEpacket } | { ok: false; error: string }> {
  const ctx = await proprietar(businessId);
  if (!ctx.ok) return { ok: false, error: ctx.error };

  const cheie = await secretDinConfig(businessId, "epacket_config", "api_key", cheiaPrimita(apiKey));
  if (!cheie) return { ok: false, error: "Completeaza cheia API primita de la e-packet." };
  if (!/^epk_(live|test)_/.test(cheie)) {
    return { ok: false, error: "Cheia e-packet incepe cu „epk_live_” sau „epk_test_”. Verifica ce ai lipit." };
  }

  try {
    return { ok: true, proba: await probaConexiuneEpacket({ api_key: cheie }) };
  } catch (e) {
    return { ok: false, error: (e as Error).message };
  }
}

/**
 * Cautarea in nomenclatorul lor de localitati: pentru adresa de ridicare din formular si pentru
 * alegerea din fereastra de AWB. Cheia goala = cea salvata.
 */
export async function cautaLocalitatiEpacketAction(
  businessId: string,
  cauta: string,
  judet: string,
  apiKey?: string,
): Promise<{ ok: true; localitati: LocalitateEpacket[] } | { ok: false; error: string }> {
  const ctx = await proprietar(businessId);
  if (!ctx.ok) return { ok: false, error: ctx.error };
  const q = text(cauta, 60);
  if (q.length < 2) return { ok: true, localitati: [] };
  const cheie = await secretDinConfig(businessId, "epacket_config", "api_key", cheiaPrimita(apiKey));
  if (!cheie) return { ok: false, error: "Salveaza intai cheia API e-packet." };
  try {
    const localitati = await cautaLocalitati({ api_key: cheie }, q, text(judet, 3).toUpperCase());
    return { ok: true, localitati: localitati.slice(0, 50) };
  } catch (e) {
    return { ok: false, error: (e as Error).message };
  }
}

/**
 * Codul postal propus pentru localitatea de RIDICARE aleasa in formular (din punctele ei, ca la
 * destinatar). Omul il poate schimba: pentru orasele mari e codul localitatii, nu al strazii.
 */
export async function codPostalRidicareEpacketAction(
  businessId: string,
  localitateId: number,
  apiKey?: string,
): Promise<{ ok: true; cod: string | null } | { ok: false; error: string }> {
  const ctx = await proprietar(businessId);
  if (!ctx.ok) return { ok: false, error: ctx.error };
  if (!Number.isInteger(localitateId) || localitateId <= 0) return { ok: true, cod: null };
  const cheie = await secretDinConfig(businessId, "epacket_config", "api_key", cheiaPrimita(apiKey));
  if (!cheie) return { ok: false, error: "Salveaza intai cheia API e-packet." };
  const config = { api_key: cheie } as EpacketConfig;
  const dpd = await puncteDinLocalitate(config, "DPD", localitateId).catch(() => null);
  const cod = codPostalPentru({ puncteDpd: dpd })
    ?? codPostalPentru({ alte: await puncteDinLocalitate(config, "SDY", localitateId).catch(() => null) });
  return { ok: true, cod: cod?.cod ?? null };
}

// ─── Comanda si configurarea ──────────────────────────────────────────────────

type AdresaComenzii = AdresaCuPunct & {
  city?: string; county?: string; postal_code?: string; postalCode?: string;
};

async function configSiComanda(businessId: string, orderId: string) {
  const ctx = await proprietar(businessId);
  if (!ctx.ok) return { error: ctx.error };
  const { supabase } = ctx;

  /* ⚠ Configul pe SERVICE ROLE: vederea nu decripteaza cheia pentru `authenticated`. */
  const admin = createAdminClient();
  const [{ data: setari, error: eSetari }, { data: order }] = await Promise.all([
    admin.from("store_settings").select("epacket_config").eq("business_id", businessId).maybeSingle(),
    supabase.from("orders").select("*").eq("id", orderId).eq("business_id", businessId).single(),
  ]);

  if (eSetari) return { error: `Configurarea e-packet nu s-a putut citi: ${eSetari.message}` };
  if (!order) return { error: "Comanda negasita" };

  const config = (setari?.epacket_config ?? null) as EpacketConfig | null;
  /* ⚠ Regula sta in `epacketGata`, una singura pentru actiune, lot, pagini si cron. */
  if (!epacketGata(config)) {
    return {
      error:
        "e-packet nu e configurat complet: ai nevoie de cheia API si de adresa de ridicare "
        + "(prenume, nume, telefon, email, localitate, cod postal, strada, numar).",
    };
  }
  return { supabase, admin, config, order };
}

// ─── Pregatirea ferestrei ─────────────────────────────────────────────────────

export type PregatireAwbEpacket = {
  localitate: RezultatLocalitate;
  codPostal: { cod: string; sursa: SursaCodPostal } | null;
  adresa: AdresaDespartita;
  prenume: string;
  nume: string;
  /** Punctul ales in checkout, cu reteaua lui (din id). `null` = livrare la adresa. */
  punct: { curier: CurierCuPuncte; id: string; nume: string } | null;
  /**
   * Clientul a ales punctul ALTUI curier: coletul e-packet merge acasa (`livrareaComenzii`).
   * `linieAcasa` e ce a scris el, sau sir gol.
   */
  punctStrain: { numePunct: string; curierPunct: string; linieAcasa: string } | null;
};

/** Codul postal al unei localitati, din punctele ei (DPD intai). Citire pura, cu cache. */
async function codulLocalitatii(
  config: EpacketConfig,
  localitateId: number,
  dinComanda?: string | null,
): Promise<{ cod: string; sursa: SursaCodPostal } | null> {
  const scris = codPostalPentru({ dinComanda });
  if (scris) return scris;
  const dpd = await puncteDinLocalitate(config, "DPD", localitateId).catch(() => null);
  const dinDpd = codPostalPentru({ puncteDpd: dpd });
  if (dinDpd) return dinDpd;
  for (const c of ["SDY", "FCR", "CGS"] as const) {
    const alte = await puncteDinLocalitate(config, c, localitateId).catch(() => null);
    const cod = codPostalPentru({ alte });
    if (cod) return cod;
  }
  return null;
}

/**
 * Ce precompleteaza fereastra: localitatea lor (sau lista din care alege omul), codul postal,
 * adresa despartita in campurile lor si numele despartit dupa regula lor. Numai CITIRI.
 */
export async function pregatesteAwbEpacketAction(
  businessId: string,
  orderId: string,
): Promise<{ ok: true; pregatire: PregatireAwbEpacket } | { ok: false; error: string }> {
  const ctx = await configSiComanda(businessId, orderId);
  if ("error" in ctx) return { ok: false, error: ctx.error as string };
  const { config, order } = ctx;
  const addr = (order.shipping_address ?? {}) as AdresaComenzii;

  /* ⚠ La punctul altui curier, `address` e adresa PUNCTULUI: strada vine din `home_address`. */
  const livrare = livrareaComenzii(addr);
  const linie = livrare.fel === "adresa" ? livrare.linie : livrare.fel === "punct_strain" ? livrare.linieAcasa : "";
  const adresa = despartaAdresa(linie);
  const { prenume, nume } = despartaNumele(order.customer_name);

  let localitate: RezultatLocalitate;
  try {
    localitate = await rezolvaLocalitatea(
      { oras: addr.city, judet: addr.county, strada: linie },
      (q, j) => cautaLocalitati(config, q, j),
    );
  } catch (e) {
    return { ok: false, error: `Localitatea nu s-a putut cauta la e-packet: ${(e as Error).message}` };
  }

  /* ⚠ Codul scris de om (in comanda sau chiar in linia de adresa) bate pe cel dedus. */
  const scris = (addr.postal_code ?? addr.postalCode ?? "").toString() || adresa.codPostal;
  const codPostal = localitate.fel === "gasita"
    ? await codulLocalitatii(config, localitate.localitate.id, scris)
    : codPostalPentru({ dinComanda: scris });

  return {
    ok: true,
    pregatire: {
      localitate, codPostal, adresa, prenume, nume,
      punct: livrare.fel === "punct" ? { ...livrare.punct, nume: livrare.nume } : null,
      punctStrain: livrare.fel === "punct_strain"
        ? { numePunct: livrare.numePunct, curierPunct: livrare.curierPunct, linieAcasa: livrare.linieAcasa }
        : null,
    },
  };
}

/** Codul postal dedus pentru o localitate aleasa de om in fereastra. */
export async function codPostalEpacketAction(
  businessId: string,
  orderId: string,
  localitateId: number,
): Promise<{ ok: true; codPostal: { cod: string; sursa: SursaCodPostal } | null } | { ok: false; error: string }> {
  const ctx = await configSiComanda(businessId, orderId);
  if ("error" in ctx) return { ok: false, error: ctx.error as string };
  if (!Number.isInteger(localitateId) || localitateId <= 0) return { ok: true, codPostal: null };
  return { ok: true, codPostal: await codulLocalitatii(ctx.config, localitateId) };
}

/**
 * Tarifele de la toti curierii, pentru expedierea din fereastra. O ESTIMARE (scris de ei): AWB-ul
 * se taxeaza la pretul din clipa emiterii.
 */
export async function tarifeEpacketAction(
  businessId: string,
  orderId: string,
  cerere: {
    localitateId: number;
    tip: "D2D" | "D2L";
    tipColet: "parcel" | "envelope";
    colete: ColetEpacket[];
    ramburs?: number | null;
    asigurare?: number | null;
    deschidere?: boolean;
  },
): Promise<{ ok: true; oferte: OfertaEpacket[]; test: boolean } | { ok: false; error: string }> {
  const ctx = await configSiComanda(businessId, orderId);
  if ("error" in ctx) return { ok: false, error: ctx.error as string };
  const { config } = ctx;
  if (!Number.isInteger(cerere.localitateId) || cerere.localitateId <= 0) {
    return { ok: false, error: "Alege intai localitatea destinatarului." };
  }
  const plic = cerere.tipColet === "envelope";
  const colete = (cerere.colete ?? []).slice(0, 50);
  if (colete.length === 0) return { ok: false, error: "Completeaza greutatea coletului." };
  const ramburs = Number(cerere.ramburs) > 0 ? Math.round(Number(cerere.ramburs) * 100) / 100 : 0;
  const asigurare = Number(cerere.asigurare) > 0 ? Math.round(Number(cerere.asigurare) * 100) / 100 : 0;
  try {
    const oferte = await tarifeEpacket(config, {
      sender_locality_id: config.expeditor!.localitate_id!,
      recipient_locality_id: cerere.localitateId,
      package_type: plic ? "envelope" : "parcel",
      parcels: (plic ? colete.slice(0, 1) : colete).map((c) => plic
        ? { weight: Math.max(0.1, Number(c.greutate) || 0.1) }
        : { weight: Math.max(0.1, Number(c.greutate) || 0.1), length: cm(c.lungime) || 1, width: cm(c.latime) || 1, height: cm(c.inaltime) || 1 }),
      delivery_type: cerere.tip,
      ...(ramburs > 0 ? { cash_on_delivery: ramburs } : {}),
      ...(asigurare > 0 ? { insurance: asigurare } : {}),
      ...(cerere.deschidere ? { open_package: true } : {}),
    });
    return { ok: true, oferte, test: eCheieDeTest(config.api_key) };
  } catch (e) {
    return { ok: false, error: (e as Error).message };
  }
}

// ─── Emiterea AWB ─────────────────────────────────────────────────────────────

/** Numele omenesc al campului refuzat de ei, ca mesajul sa spuna CE sa repare. */
const CAMPURI: Record<string, string> = {
  "recipient.first_name": "prenumele destinatarului", "recipient.last_name": "numele destinatarului",
  "recipient.phone": "telefonul destinatarului", "recipient.email": "emailul destinatarului",
  "recipient.locality_id": "localitatea destinatarului", "recipient.postcode": "codul postal al destinatarului",
  "recipient.street": "strada destinatarului", "recipient.number": "numarul de la adresa",
  "recipient.block": "blocul", "recipient.locker_id": "punctul de ridicare",
  "sender.postcode": "codul postal de ridicare (configurarea e-packet)", "sender.street": "strada de ridicare (configurarea e-packet)",
  "cash_on_delivery.iban": "IBAN-ul de ramburs (configurarea e-packet)", "contents": "continutul coletului",
  "parcels": "coletele", "insurance": "asigurarea", "open_package": "deschiderea coletului",
};

/**
 * ⚠ Registrul intoarce doar TEXTUL erorii, nu eroarea: campul se citeste din coada mesajului
 * („... (recipient.postcode)"), pusa acolo de `eroareDinRaspuns`.
 */
function cuCampul(e: unknown): string {
  const mesaj = (e as Error).message;
  const camp = campulEroriiEpacket(e) ?? /\(([a-z_]+(?:\.[a-z_]+|\[\d+\])*(?:\.[a-z_]+)?)\)\s*$/.exec(mesaj)?.[1] ?? null;
  const omenesc = camp ? (CAMPURI[camp] ?? (/^parcels\[\d+\]/.test(camp) ? "un colet" : null)) : null;
  return omenesc ? `${mesaj} Verifica: ${omenesc}.` : mesaj;
}

export async function createEpacketAwbAction(
  businessId: string,
  orderId: string,
  date: DateAwbEpacket,
): Promise<
  | { awb: string; curier: string; pret: number | null; test: boolean; ridicare: AwbEpacket["ridicare"]; avertismente: string[] }
  | { error: string }
> {
  const ctx = await configSiComanda(businessId, orderId);
  if ("error" in ctx) return { error: ctx.error as string };

  /* ⚠ POARTA E PRIMA, INAINTE de orice apel la curier: un refuz de dupa emitere ar fi un colet
     deja platit, la un furnizor care nu anuleaza. Vezi `src/lib/orders/poarta-awb.ts`. */
  const refuzAwb = await poartaAwbPropriu(businessId, orderId, "epacket");
  if (refuzAwb) return { error: refuzAwb };

  const { supabase, admin, config, order } = ctx;
  if ((order.epacket_awb_number ?? "").trim()) {
    return { error: "AWB-ul e-packet a fost deja creat pentru comanda asta." };
  }
  if (!eCurierEpacket(date?.curier)) return { error: `Curier necunoscut. Alege unul dintre: ${CURIERI_EPACKET.join(", ")}.` };

  /* ⚠ Referinta o pune SERVERUL, din numarul citit din baza (spread-ul o suprascrie). */
  const referinta = referintaEpacket(businessId, order.order_number);
  const dateExpediere: DateExpediereEpacket = { ...date, referinta };

  const lipsuri = lipsuriExpediereEpacket(config, dateExpediere);
  if (lipsuri.length > 0) {
    return { error: `AWB-ul e-packet nu se poate emite, lipseste: ${lipsuri.join("; ")}.` };
  }
  const corp = corpAwbEpacket(config, dateExpediere);
  const test = eCheieDeTest(config.api_key);

  const cheie = cheieOperatie("awb", "epacket", orderId);
  const r = await cuRegistru(
    admin,
    { businessId, orderId, fel: "awb", furnizor: "epacket", cheie },
    async () => {
      /*
       * ⚠⚠ UN RASPUNS PIERDUT NU SE POATE LAMURI: e-packet n-are cautare dupa referinta. Eroarea
       * iese neschimbata, `necunoscut`, si randul blocheaza; o reincercare oarba ar fi al doilea
       * colet TAXAT, care nu se mai anuleaza. Supapa e `leagaAwbEpacketAction`.
       */
      const creat = await creeazaAwbEpacket(config, corp);
      return {
        referinta: creat.awb,
        /* ⚠ Fara date ale cumparatorului: registrul se citeste din panoul de operatii. */
        detalii: {
          referinta,
          curier: creat.curier ?? date.curier,
          tip: creat.tip || date.tip,
          pret: creat.pret,
          creditRamas: creat.creditRamas,
          test,
          ridicare: creat.ridicare,
          punct: date.tip === "D2L" ? (date.punctId ?? null) : null,
          ramburs: Number((corp.cash_on_delivery as { amount?: number } | undefined)?.amount ?? 0),
        } as unknown as Json,
        valoare: creat,
      };
    },
    verdictFurnizor,
  );

  if (r.fel === "blocat") return { error: r.mesaj };
  if (r.fel === "eroare") return { error: r.verdict === "esuat" ? cuCampul(new Error(r.mesaj)) : r.mesaj };

  const awb = r.fel === "facut" ? r.valoare.awb : (r.referinta ?? "").trim();
  if (!awb) {
    return {
      error:
        "Operatia figureaza reusita in registru, dar fara numar AWB. "
        + "Verifica in aplicatia e-packet si leaga numarul de comanda din fereastra.",
    };
  }

  const detalii = (r.fel === "deja" ? r.detalii : null) as { curier?: unknown; tip?: unknown; pret?: unknown; test?: unknown } | null;
  const curier = r.fel === "facut"
    ? (r.valoare.curier ?? date.curier)
    : (eCurierEpacket(detalii?.curier) ? detalii!.curier as string : date.curier);

  /*
   * ⚠ `deja` ADOPTA numarul din registru, dar el poate fi mort: anulat la ei (prin suportul lor)
   * dupa o dezlegare care n-a apucat sa elibereze slotul. O citire a starii lamureste.
   */
  if (r.fel === "deja") {
    const stare = await stareEpacket(config, awb).catch(() => null);
    if (stare && normalizeazaStatus(stare.status) === "anulat") {
      const eliberat = await marcheazaAnulata(admin, businessId, cheie);
      return {
        error: eliberat
          ? `AWB-ul ${awb}, ramas in registru pentru comanda asta, e anulat la e-packet. L-am scos din registru: apasa din nou ca sa emiti unul nou.`
          : `AWB-ul ${awb}, ramas in registru pentru comanda asta, e anulat la e-packet, dar registrul nu s-a putut elibera. Incearca din nou peste un minut.`,
      };
    }
  }

  const avertismente: string[] = [];
  if (test) {
    avertismente.push(
      `AWB DE TEST: e emis cu o cheie de test, in mediul de test ${NUME_CURIER_EPACKET[curier as keyof typeof NUME_CURIER_EPACKET] ?? curier}. `
      + "Nu pleaca la curier si nu se taxeaza. Pune cheia LIVE ca sa expediezi de-adevaratelea.",
    );
  }
  const ridicare = r.fel === "facut" ? r.valoare.ridicare : null;
  if (ridicare && !ridicare.ceruta) {
    avertismente.push(
      `Ridicarea nu s-a putut comanda automat${ridicare.motiv ? ` (${ridicare.motiv})` : ""}. AWB-ul ramane valid: comanda ridicarea din aplicatia e-packet.`,
    );
  }

  /*
   * ⚠ Starea coletului ANTERIOR se goleste odata cu scrierea celui nou: lasata, o stare finala
   * veche l-ar fi scos pe cel nou din urmarire.
   */
  const acum = new Date().toISOString();
  const { error: eScriere, data: randuri } = await supabase.from("orders").update({
    epacket_awb_number: awb,
    epacket_awb_at: acum,
    epacket_reference: referinta,
    epacket_curier: curier,
    epacket_tip_livrare: r.fel === "facut" ? (r.valoare.tip || date.tip) : (typeof detalii?.tip === "string" ? detalii.tip : date.tip),
    epacket_test: r.fel === "facut" ? test : detalii?.test === true,
    epacket_status_code: null,
    epacket_status_label: null,
    epacket_status_at: null,
    epacket_status_checked_at: null,
    updated_at: acum,
  }).eq("id", orderId).eq("business_id", businessId).select("id");

  /*
   * ⚠ Coletul EXISTA la e-packet (si e TAXAT). Scrierea picata nu se intoarce ca eroare: omul ar
   * apasa din nou, iar registrul raspunde `deja` si reface doar scrierea. Se striga, si se
   * raporteaza succes.
   */
  if (eScriere || !randuri || randuri.length === 0) {
    await logError({
      action: "epacket.createAwb",
      message: `AWB e-packet creat (${awb}), dar comanda NU s-a actualizat: ${eScriere?.message ?? "niciun rand modificat"}. Numarul e in registrul de operatii externe; o noua apasare il adopta si reface scrierea.`,
      details: { orderId, businessId, awb, code: eScriere?.code },
      businessId,
      severity: "critical",
    });
  } else {
    /* Marketplace-ul afla numarul de urmarire DUPA ce el exista in baza. */
    dupaRaspuns(() => enqueueAboutYouShip(businessId, orderId), "enqueueAboutYouShip", businessId);
  }

  return {
    awb,
    curier,
    pret: r.fel === "facut" ? r.valoare.pret : (typeof detalii?.pret === "number" ? detalii.pret : null),
    test: r.fel === "facut" ? test : detalii?.test === true,
    ridicare,
    avertismente,
  };
}

// ─── Legarea unui AWB existent (raspuns pierdut) ──────────────────────────────

/**
 * „AWB-ul exista in aplicatia e-packet: leaga-l de comanda."
 *
 * ⚠ E SUPAPA unui raspuns pierdut, la un furnizor fara cautare. Omul vede AWB-ul in aplicatia lor
 * si il scrie aici. Numarul se VERIFICA la ei (`GET /status`: exista in contul cheii, si cu ce
 * curier), si sa nu fie deja pe alta comanda a magazinului. Abia apoi se scrie pe comanda si se
 * inchide randul din registru ca reusit, ca butonul sa nu mai fie blocat.
 */
export async function leagaAwbEpacketAction(
  businessId: string,
  orderId: string,
  awbScris: string,
): Promise<{ ok: true; awb: string; mesaj: string } | { ok: false; error: string }> {
  const ctx = await configSiComanda(businessId, orderId);
  if ("error" in ctx) return { ok: false, error: ctx.error as string };
  const { supabase, admin, config, order } = ctx;

  const awb = text(awbScris, 40).replace(/\s+/g, "");
  if (!/^[A-Za-z0-9-]{6,40}$/.test(awb)) return { ok: false, error: "Scrie numarul AWB asa cum apare in aplicatia e-packet." };
  if ((order.epacket_awb_number ?? "").trim()) return { ok: false, error: "Comanda are deja un AWB e-packet." };

  const refuzAwb = await poartaAwbPropriu(businessId, orderId, "epacket");
  if (refuzAwb) return { ok: false, error: refuzAwb };

  const { data: altele, error: eAltele } = await admin.from("orders").select("id, order_number")
    .eq("business_id", businessId).eq("epacket_awb_number", awb).limit(1);
  if (eAltele) return { ok: false, error: `Nu am putut verifica celelalte comenzi: ${eAltele.message}` };
  if (altele && altele.length > 0) {
    return { ok: false, error: `AWB-ul ${awb} e deja pe comanda ${altele[0].order_number ?? altele[0].id}.` };
  }

  let curier: string;
  try {
    const s = await stareEpacket(config, awb);
    curier = s.curier;
  } catch (e) {
    if (eAwbNegasit(e)) {
      return { ok: false, error: `AWB-ul ${awb} nu exista in contul e-packet al cheii salvate (o cheie de test nu vede AWB-urile live, si invers).` };
    }
    return { ok: false, error: (e as Error).message };
  }

  const acum = new Date().toISOString();
  const { data: randuri, error } = await supabase.from("orders").update({
    epacket_awb_number: awb,
    epacket_awb_at: acum,
    epacket_reference: referintaEpacket(businessId, order.order_number),
    epacket_curier: curier || null,
    epacket_tip_livrare: null,
    epacket_test: eCheieDeTest(config.api_key),
    epacket_status_code: null,
    epacket_status_label: null,
    epacket_status_at: null,
    epacket_status_checked_at: null,
    updated_at: acum,
  }).eq("id", orderId).eq("business_id", businessId).is("epacket_awb_number", null).select("id");
  if (error || !randuri || randuri.length === 0) {
    return { ok: false, error: `Numarul nu s-a putut scrie pe comanda${error ? ` (${error.message})` : ""}. Reincarca pagina.` };
  }

  /* Randul atarnat din registru se inchide ca REUSIT, cu numarul verificat. */
  const atarnate = await operatiiAtarnate(admin, businessId, orderId);
  const aNoastra = atarnate.find((o) => o.cheie === cheieOperatie("awb", "epacket", orderId));
  if (aNoastra) {
    const { error: eReg } = await admin.rpc("incheie_operatie_externa", {
      p_id: aNoastra.id,
      p_business_id: businessId,
      p_stare: "reusit",
      p_referinta_externa: awb,
      p_detalii: { legatDeComerciant: true, curier } as unknown as Json,
    });
    if (eReg) {
      await logError({
        action: "epacket.leagaAwb",
        message: `AWB ${awb} legat de comanda, dar randul din registru nu s-a putut inchide: ${eReg.message}`,
        details: { orderId, businessId, awb },
        businessId,
        severity: "warning",
      });
    }
  }
  dupaRaspuns(() => enqueueAboutYouShip(businessId, orderId), "enqueueAboutYouShip", businessId);
  return { ok: true, awb, mesaj: `AWB-ul ${awb} (${NUME_CURIER_EPACKET[curier as keyof typeof NUME_CURIER_EPACKET] ?? curier}) a fost legat de comanda.` };
}

// ─── Dezlegarea AWB-ului ──────────────────────────────────────────────────────

/**
 * „Detaseaza AWB": scoate numarul de pe comanda si elibereaza slotul. ⚠ NU anuleaza nimic la
 * e-packet (API-ul lor n-are anulare); citeste starea si spune cinstit ce ramane viu si platit.
 *
 * ⚠ NU trece prin `configSiComanda`: aceea cere integrarea completa, iar un comerciant care a
 * deconectat e-packet trebuie sa poata totusi scoate numarul de pe comanda.
 */
export async function dezleagaEpacketAwbAction(
  businessId: string,
  orderId: string,
): Promise<{ success: true; mesaj: string; anulatLaCuriera: boolean } | { error: string }> {
  const ctx = await proprietar(businessId);
  if (!ctx.ok) return { error: ctx.error };

  const admin = createAdminClient();
  const [{ data: order, error: eComanda }, { data: setari, error: eSetari }] = await Promise.all([
    admin.from("orders").select("id, epacket_awb_number")
      .eq("id", orderId).eq("business_id", businessId).maybeSingle(),
    admin.from("store_settings").select("epacket_config").eq("business_id", businessId).maybeSingle(),
  ]);
  if (eComanda) return { error: `Comanda nu s-a putut citi: ${eComanda.message}` };
  if (!order) return { error: "Comanda negasita" };
  const numarPeComanda = order.epacket_awb_number ?? "";
  const awb = numarPeComanda.trim();
  if (!awb) return { error: "Comanda nu are AWB e-packet." };

  const config = (eSetari ? null : (setari?.epacket_config ?? null)) as EpacketConfig | null;
  let citire: CitireaStarii;
  if (!config || !(config.api_key ?? "").trim()) {
    citire = eSetari ? { fel: "eroare", mesaj: `configurarea nu s-a putut citi (${eSetari.message})` } : { fel: "fara_config" };
  } else {
    try {
      const s = await stareEpacket(config, awb);
      citire = { fel: "stare", status: s.status, eticheta: descriereStare(s.status, s.eticheta) };
    } catch (e) {
      citire = eAwbNegasit(e) ? { fel: "negasit" } : { fel: "eroare", mesaj: (e as Error).message };
    }
  }
  const hotarare = hotarareaDezlegarii(awb, citire);

  const { data: randuri, error } = await admin.from("orders").update({
    /* ⚠ TOATE coloanele coletului, nu doar numarul: o stare finala veche ar fi scos coletul
       urmator din urmarire. */
    epacket_awb_number: null,
    epacket_awb_at: null,
    epacket_reference: null,
    epacket_curier: null,
    epacket_tip_livrare: null,
    epacket_test: null,
    epacket_status_code: null,
    epacket_status_label: null,
    epacket_status_at: null,
    epacket_status_checked_at: null,
    updated_at: new Date().toISOString(),
    /* ⚠ SI PE AWB-UL CITIT: un numar NOU legat in rastimp din alta fila nu are voie sa fie sters. */
  }).eq("id", orderId).eq("business_id", businessId)
    .eq("epacket_awb_number", numarPeComanda)
    .select("id");

  if (error || !randuri || randuri.length === 0) {
    return {
      error: `${hotarare.despreCurier} Dar numarul nu s-a putut scoate de pe comanda, `
        + "sau intre timp comanda a primit alt AWB. Reincarca pagina si verifica.",
    };
  }

  /* ⚠ Eliberarea vine DUPA scrierea pe comanda. Fara ea, emiterea urmatoare ar adopta chiar
     AWB-ul dezlegat, iar alt curier ar fi refuzat de indexul „un AWB viu pe comanda". */
  const eliberat = await marcheazaAnulata(admin, businessId, cheieOperatie("awb", "epacket", orderId));
  if (!eliberat) {
    await logError({
      action: "epacket.dezleaga",
      message:
        `AWB e-packet ${awb} dezlegat, dar slotul din registru NU s-a eliberat. Urmatoarea emitere pe aceasta comanda `
        + "va readopta numarul din registru; daca el e anulat la e-packet, emiterea il elibereaza si cere o noua apasare.",
      details: { orderId, businessId, awb, anulatLaCurier: hotarare.anulatLaCurier },
      businessId,
      severity: "critical",
    });
  }
  /* Un AWB ramas viu si platit se scrie si in jurnal: il vede si suportul, nu doar cine a apasat. */
  if (!hotarare.anulatLaCurier) {
    await logError({
      action: "epacket.dezleaga",
      message: `AWB e-packet ${awb} scos de pe comanda fara anulare la ei (API-ul n-are anulare): ${hotarare.despreCurier}`,
      details: { orderId, businessId, awb, citire: citire.fel },
      businessId,
      severity: "warning",
    });
  }

  return {
    success: true,
    anulatLaCuriera: hotarare.anulatLaCurier,
    mesaj: hotarare.anulatLaCurier
      ? `${hotarare.despreCurier} Numarul a fost scos de pe comanda, care poate fi acum editata sau expediata cu alt curier.`
      : `${hotarare.despreCurier} Numarul a fost scos de pe comanda, ca sa poata fi editata; nu emite alt AWB pana nu esti sigur ca acest colet nu pleaca.`,
  };
}

// ─── Eticheta ─────────────────────────────────────────────────────────────────

/**
 * Eticheta PDF, ceruta de la e-packet la FIECARE descarcare (citire pura): nu se pastreaza nicaieri
 * un document cu numele, adresa si telefonul cumparatorului. ⚠ Trece prin poarta contului, ca
 * rutele de eticheta: un magazin suspendat nu-si mai foloseste integrarea.
 */
export async function getEpacketEtichetaAction(
  businessId: string,
  orderId: string,
): Promise<{ ok: true; base64: string; nume: string; avertisment?: string } | { ok: false; error: string }> {
  const ctx = await proprietar(businessId);
  if (!ctx.ok) return { ok: false, error: ctx.error };

  const oprit = await motivContInactiv(businessId);
  if (oprit) return { ok: false, error: oprit };

  const admin = createAdminClient();
  const [{ data: order, error: eComanda }, { data: setari, error: eSetari }] = await Promise.all([
    admin.from("orders").select("id, epacket_awb_number, epacket_curier")
      .eq("id", orderId).eq("business_id", businessId).maybeSingle(),
    admin.from("store_settings").select("epacket_config").eq("business_id", businessId).maybeSingle(),
  ]);
  const eCitire = eComanda ?? eSetari;
  if (eCitire) return { ok: false, error: `Nu am putut citi comanda sau configurarea: ${eCitire.message}` };
  if (!order) return { ok: false, error: "Comanda negasita" };

  const awb = (order.epacket_awb_number ?? "").trim();
  if (!awb) return { ok: false, error: "Comanda n-are AWB e-packet." };

  /* Eticheta cere doar cheia: si o integrare oprita trebuie sa-si poata tipari coletele emise. */
  const config = (setari?.epacket_config ?? null) as EpacketConfig | null;
  if (!config || !(config.api_key ?? "").trim()) {
    return { ok: false, error: "Integrarea e-packet nu mai are cheie API, deci eticheta nu se poate cere. Descarc-o din aplicatia e-packet." };
  }

  const ceruta = config.dimensiune_eticheta === "A4" ? "A4" : "A6";
  try {
    const { pdf, marime } = await etichetaEpacket(config, awb, ceruta);
    const nume = `AWB-epacket-${awb.replace(/[^A-Za-z0-9_-]/g, "")}.pdf`;
    /* La FAN iese A4 oricum, la Dragon Star si TCE eticheta curierului (scris de ei): se spune. */
    const avertisment = marime && marime !== ceruta
      ? `Eticheta a venit in formatul ${marime === "courier_default" ? "curierului" : marime}, nu ${ceruta}: ${NUME_CURIER_EPACKET[order.epacket_curier as keyof typeof NUME_CURIER_EPACKET] ?? "curierul"} nu are ${ceruta}.`
      : undefined;
    return { ok: true, base64: pdf.toString("base64"), nume, ...(avertisment ? { avertisment } : {}) };
  } catch (e) {
    if (eAwbNegasit(e)) {
      return { ok: false, error: `AWB-ul ${awb} nu e in contul e-packet al cheii salvate (o cheie de test nu vede AWB-urile live, si invers).` };
    }
    return { ok: false, error: (e as Error).message };
  }
}
