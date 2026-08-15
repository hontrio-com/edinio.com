"use server";

import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { pastreazaSecretele } from "@/lib/integrari/secrete";
import { logError } from "@/lib/error-logger";
import { cheieOperatie, cuRegistru, marcheazaAnulata } from "@/lib/operatii/registru";
import { verdictFurnizor } from "@/lib/operatii/eroare-furnizor";
import {
  campuriRespinse, creeazaColet, etichetaColet, etichetaCurier, flux, istoricColet,
  numarCurier, probaConexiune, valideazaAtribute,
  packetaGata, type PacketaConfig,
} from "@/lib/packeta/client";
import {
  construiesteAtribute, lipsuriExpediere, type AdresaPacketa, type DateExpediere,
} from "@/lib/packeta/expediere";
import { descriereStatus, statusFinalDinStari, ultimaStare } from "@/lib/packeta/statusuri";
import { curierDupaId, normalizeazaCurieri } from "@/lib/packeta/puncte";
import type { Json } from "@/types/database.types";


/**
 * Actiunile Packeta.
 *
 * ⚠ SCRISE FARA SA FI ATINS VREODATA API-UL LOR. Nu avem cont, deci nici
 * `api_password`, nici `api_key`. Fiecare loc in care documentatia tace e insemnat,
 * si purtarea aleasa e mereu aceeasi: **nu raportam succes daca nu-l putem dovedi.**
 *
 * ═══ ⚠ CE FACE INTEGRAREA ASTA DIFERITA DE CELELALTE ZECE ═══
 *
 * **Nu exista metoda de anulare.** Lista lor de metode e completa si n-are nimic
 * de tip cancel/delete/storno; documentatia spune pe deasupra ca nici editarea
 * comenzilor exportate nu se poate prin API. Un colet creat gresit ramane creat, si
 * se poate anula doar de mana, din interfata lor.
 *
 * De aici decurg doua lucruri, si amandoua se vad in cod:
 *
 *   1. Emiterea trece INTAI prin `packetAttributesValid()` — gratis, nu creeaza
 *      nimic, si intoarce chiar NUMELE campului gresit. E singura integrare din
 *      platforma care ne da asta inainte de efectul real.
 *   2. Dezlegarea („scoate AWB-ul de pe comanda") sterge doar legatura de la noi si
 *      spune limpede ca la ei coletul ramane — ca la Posta, si din acelasi motiv.
 */

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

/* ── Configurarea ─────────────────────────────────────────────────────────── */


export async function savePacketaConfig(
  businessId: string,
  config: PacketaConfig,
): Promise<{ success: true } | { error: string }> {
  const p = await proprietar(businessId);
  if (!p.ok) return { error: p.error };

  const admin = createAdminClient();
  const { data: rand } = await admin
    .from("store_settings").select("packeta_config").eq("business_id", businessId).maybeSingle();

  /*
   * ⚠ Secretele mascate NU se rescriu cu masca.
   *
   * Formularul primeste `••••` in locul credentialelor; salvat asa, ar fi sters
   * exact cheia care face integrarea sa mearga. `pastreazaSecretele` pune la loc
   * valorile vechi pentru campurile venite mascate.
   */
  const pastrat = pastreazaSecretele(
    "packeta_config",
    config as unknown as Record<string, unknown>,
    (rand?.packeta_config ?? null) as Record<string, unknown> | null,
  );

  const { error } = await admin
    .from("store_settings")
    .update({ packeta_config: pastrat as unknown as Json })
    .eq("business_id", businessId);

  if (error) {
    await logError({ action: "packeta.saveConfig", message: error.message, details: { businessId } });
    return { error: "Nu am putut salva configurarea Packeta." };
  }
  return { success: true };
}

export async function disconnectPacketa(businessId: string): Promise<{ success: true } | { error: string }> {
  const p = await proprietar(businessId);
  if (!p.ok) return { error: p.error };

  const admin = createAdminClient();
  const { error } = await admin
    .from("store_settings")
    .update({ packeta_config: null })
    .eq("business_id", businessId);
  if (error) return { error: "Nu am putut deconecta Packeta." };
  return { success: true };
}

async function configDinBaza(businessId: string): Promise<PacketaConfig | null> {
  const admin = createAdminClient();
  const { data } = await admin
    .from("store_settings").select("packeta_config").eq("business_id", businessId).maybeSingle();
  return (data?.packeta_config ?? null) as PacketaConfig | null;
}

/**
 * Proba de conexiune.
 *
 * ⚠ Se probeaza AMBELE credentiale, si separat. Sunt lucruri diferite
 * (`api_password` in corpul XML, `api_key` in calea fluxurilor), deci o configurare
 * pe jumatate e cel mai usor de gresit — iar mesajul trebuie sa spuna CARE
 * lipseste, altfel comerciantul le schimba pe amandoua la intamplare.
 */
export async function testPacketaConnectionAction(
  businessId: string,
): Promise<{ ok: boolean; api_key: boolean; api_password: boolean; mesaj: string } | { error: string }> {
  const p = await proprietar(businessId);
  if (!p.ok) return { error: p.error };

  const config = await configDinBaza(businessId);
  if (!config) return { error: "Packeta nu e configurata." };

  try {
    const r = await probaConexiune(config);
    const bune: string[] = [];
    if (r.api_password) bune.push("parola API");
    if (r.api_key) bune.push("cheia de fluxuri");
    const mesaj = r.api_key && r.api_password
      ? "Ambele credentiale sunt bune."
      : `${bune.length ? `Merge: ${bune.join(" si ")}. ` : ""}${r.detaliu}`;
    return { ok: r.api_key && r.api_password, api_key: r.api_key, api_password: r.api_password, mesaj };
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Proba a esuat." };
  }
}

/* ── Punctele si curierii, pentru panou ───────────────────────────────────── */

/**
 * Curierii de livrare la adresa din contul comerciantului.
 *
 * Se cere din panou, ca sa poata alege pe care ii ofera in checkout. ⚠ Fara asta
 * n-avem ce pune in `addressId`: id-urile curierilor romani NU sunt in
 * documentatie, se afla doar din flux.
 */
export async function getPacketaCurieriAction(
  businessId: string,
): Promise<{ curieri: { id: string; nume: string; arePuncte: boolean; faraRamburs: boolean }[] } | { error: string }> {
  const p = await proprietar(businessId);
  if (!p.ok) return { error: p.error };

  const config = await configDinBaza(businessId);
  if (!config) return { error: "Packeta nu e configurata." };

  try {
    const brut = await flux(config, "carrier");
    const curieri = normalizeazaCurieri(brut, "ro");
    return {
      curieri: curieri.map((c) => ({
        id: c.id, nume: c.nume, arePuncte: c.arePuncte, faraRamburs: c.faraRamburs,
      })),
    };
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Nu am putut citi curierii Packeta." };
  }
}

/* ── Emiterea ─────────────────────────────────────────────────────────────── */

export interface DateColetPacketa {
  destinatar: AdresaPacketa;
  greutateKg: number;
  valoare: number;
  ramburs?: number;
  /** Punctul, automatul sau curierul ales. Lipsa, se ia de pe comanda. */
  addressId?: string;
  punctCurier?: string | null;
  nota?: string | null;
  dimensiuniMm?: { lungime: number; latime: number; inaltime: number } | null;
}

async function configSiComanda(businessId: string, orderId: string) {
  const p = await proprietar(businessId);
  if (!p.ok) return { error: p.error };

  const admin = createAdminClient();
  const [{ data: setari }, { data: order }] = await Promise.all([
    admin.from("store_settings").select("packeta_config").eq("business_id", businessId).maybeSingle(),
    admin.from("orders").select("*").eq("id", orderId).eq("business_id", businessId).maybeSingle(),
  ]);

  const config = (setari?.packeta_config ?? null) as PacketaConfig | null;
  if (!packetaGata(config)) return { error: "Packeta nu e configurata complet." };
  if (!order) return { error: "Comanda nu a fost gasita." };

  return { supabase: p.supabase, admin, config, order };
}

/**
 * Creeaza coletul.
 *
 * ⚠ ORDINEA E ANUME ASA, si fiecare pas are un motiv:
 *
 *   1. verificarile locale — o comanda careia ii lipseste strada n-are de ce sa
 *      ocupe un slot in registru;
 *   2. `packetAttributesValid()` — gratis, nu creeaza nimic, si spune NUMELE
 *      campului gresit. La un furnizor fara anulare, asta e ultima poarta;
 *   3. `createPacket()`, sub registru.
 */
export async function createPacketaAwbAction(
  businessId: string,
  orderId: string,
  date: DateColetPacketa,
): Promise<{ packetId: string; barcode: string } | { error: string; campuri?: { nume: string; motiv: string }[] }> {
  const ctx = await configSiComanda(businessId, orderId);
  if ("error" in ctx) return { error: ctx.error as string };
  const { admin, config, order } = ctx;

  const comanda = order as typeof order & {
    packeta_packet_id?: string | null;
    packeta_address_id?: string | null;
    packeta_pickup_point?: string | null;
  };
  if (comanda.packeta_packet_id) {
    return { error: "Coletul Packeta a fost deja creat pentru comanda asta." };
  }

  const addressId = (date.addressId ?? comanda.packeta_address_id ?? "").trim();
  const punctCurier = date.punctCurier ?? comanda.packeta_pickup_point ?? null;
  /* Alegerea cumparatorului din checkout: singurul lucru pe care il stim sigur
     si fara sa intrebam fluxul. */
  const adresa = (order.shipping_address ?? {}) as { courier?: string; delivery_type?: string; locker_id?: string };
  const laPunctDinCheckout = (adresa.courier ?? "").toLowerCase().trim() === "packeta"
    && adresa.delivery_type === "locker" && !!adresa.locker_id;

  /*
   * Curierul ales hotaraste trei lucruri pe care nu le putem ghici: daca livrarea
   * e la adresa, daca cere numarul casei separat, si daca accepta ramburs. Se
   * citesc din flux; daca fluxul nu raspunde, NU presupunem — mai bine oprim.
   */
  let laAdresa = true;
  let numarSeparat = false;
  let cereDimensiuni = false;
  try {
    const curieri = normalizeazaCurieri(await flux(config, "carrier"), "ro");
    const c = curierDupaId(curieri, addressId);
    if (c) {
      numarSeparat = c.numarSeparat;
      laAdresa = !c.arePuncte;
      cereDimensiuni = c.cereDimensiuni;
    } else {
      /* Nu e curier → e un punct sau un automat Packeta: nu se trimite adresa. */
      laAdresa = false;
    }
  } catch (e) {
    /*
     * ⚠ Fluxul de curieri cere `api_key`, care e OPTIONALA (vezi `packetaGata`).
     *
     * Fara ea — sau la o cadere a fluxului — nu putem sti ce cere curierul. Dar a
     * OPRI emiterea ar face `api_key` obligatorie pe tacute, contrazicand si
     * `packetaGata`, si ecranul de configurare care spune ca fara ea merge doar
     * livrarea la adresa.
     *
     * Deci se merge mai departe pe presupunerea cea mai SIGURA: destinatia e
     * tratata ca punct de ridicare (nu se trimite adresa) doar daca a fost aleasa
     * din checkout ca punct; altfel ramane livrare la adresa, cu campurile ei.
     * Ce nu putem afla (numarul separat, dimensiunile) ramane pe implicit, iar
     * refuzul lor, daca vine, numeste campul.
     */
    laAdresa = !laPunctDinCheckout;
    await logError({
      action: "packeta.curieri",
      message: `nu am putut citi curierii la emitere: ${e instanceof Error ? e.message : "esec"}`,
      details: { orderId },
      businessId,
      severity: "warning",
    });
  }

  const dateExpediere: DateExpediere = {
    destinatar: date.destinatar,
    numarComanda: String(order.order_number ?? orderId),
    addressId,
    greutateKg: date.greutateKg,
    valoare: date.valoare > 0 ? date.valoare : (config.valoare_implicita ?? 0),
    ramburs: date.ramburs,
    eshop: (config.eshop ?? "").trim(),
    punctCurier,
    /*
     * ⚠ Unii curieri CER dimensiunile (`requiresSize` din feed). Fara ele coletul
     * e refuzat, iar refuzul vine de la ei — dupa ce am ajuns la emitere. Cand
     * comanda n-are dimensiuni si curierul le cere, se trimit cele implicite ale
     * magazinului; daca nici acelea nu exista, `lipsuriExpediere` opreste aici.
     *
     * ⚠ MILIMETRI. Ceilalti curieri din platforma cer centimetri.
     */
    dimensiuniMm: date.dimensiuniMm ?? (cereDimensiuni ? (config.dimensiuni_implicite ?? null) : null),
    nota: date.nota,
    laAdresa,
    numarSeparat,
  };

  const lipsuri = lipsuriExpediere(dateExpediere);
  if (lipsuri.length) return { error: `Nu se poate crea coletul: ${lipsuri.join("; ")}.` };

  const atribute = construiesteAtribute(dateExpediere);

  /*
   * ⚠ VALIDAREA, INAINTE DE REGISTRU.
   *
   * E o citire pura: nu creeaza nimic, deci nu are nevoie de protectia
   * registrului, si e mai bine sa cada aici — un refuz de validare nu trebuie sa
   * ocupe si sa blocheze slotul de emitere.
   */
  try {
    await valideazaAtribute(config, atribute);
  } catch (e) {
    const campuri = campuriRespinse(e);
    /*
     * ⚠ „Respins" se spune DOAR cand chiar a fost un refuz.
     *
     * `valideazaAtribute` arunca si la retea cazuta, si la raspuns necitibil —
     * amandoua cu verdictul `necunoscut`. Raportate ca refuz al datelor, l-ar
     * trimite pe comerciant sa caute o greseala in adresa clientului, cand de fapt
     * n-am ajuns la Packeta.
     */
    if (verdictFurnizor(e) === "necunoscut") {
      return {
        error: `Nu am putut verifica datele la Packeta: ${e instanceof Error ? e.message : "esec"}. `
          + "Coletul NU a fost creat. Reincearca in cateva minute.",
      };
    }
    return {
      error: campuri.length
        ? `Packeta a respins datele: ${campuri.map((c) => `${c.nume} (${c.motiv})`).join("; ")}.`
        : `Packeta a respins datele: ${e instanceof Error ? e.message : "motiv necunoscut"}.`,
      campuri: campuri.length ? campuri : undefined,
    };
  }

  const r = await cuRegistru(
    admin,
    {
      businessId,
      orderId,
      fel: "awb",
      furnizor: "packeta",
      cheie: cheieOperatie("awb", "packeta", orderId),
    },
    async () => {
      const colet = await creeazaColet(config, atribute);
      /* `referinta` e id-ul coletului: dupa el il regaseste omul in contul lor. */
      return { valoare: colet, referinta: colet.id, detalii: colet as unknown as Json };
    },
    verdictFurnizor,
    /*
     * ⚠ NU SE DA `legaturaVie`, si aici motivul e mai tare decat oriunde.
     *
     * Predicatul acela spune registrului „legatura de pe comanda nu mai exista,
     * elibereaza slotul si REIA" — adica o a doua creare la furnizor. La Packeta o
     * a doua creare nu se poate desface: API-ul lor nu are anulare. Deci ramura
     * `deja` ADOPTA coletul din registru si il scrie inapoi pe comanda, iar
     * dezlegarea ramane singurul drum, si e explicita si a omului.
     */
  );

  if (r.fel === "blocat") return { error: r.mesaj };
  if (r.fel === "eroare") {
    /*
     * ⚠ Cel mai delicat punct din toata integrarea.
     *
     * La verdictul `necunoscut` nu stim daca s-a creat coletul, si la Packeta nu-l
     * putem nici cauta dupa numarul comenzii (nu exista metoda), nici anula. Deci
     * mesajul trebuie sa opreasca reincercarea, nu s-o invite.
     */
    return {
      error: r.verdict === "necunoscut"
        ? `${r.mesaj} Nu stim daca s-a creat coletul: verifica in contul Packeta INAINTE de a reincerca — `
          + "API-ul lor nu are anulare, deci o a doua incercare poate lasa doua colete."
        : r.mesaj,
    };
  }

  const dinRegistru = (r.fel === "deja" ? r.detalii : null) as { id?: unknown; barcode?: unknown } | null;
  const packetId = r.fel === "facut" ? r.valoare.id : (r.referinta ?? String(dinRegistru?.id ?? ""));
  const barcode = r.fel === "facut"
    ? r.valoare.barcode
    : (typeof dinRegistru?.barcode === "string" && dinRegistru.barcode ? dinRegistru.barcode : (packetId ? `Z${packetId}` : ""));

  if (!packetId) {
    return { error: "Packeta nu a intors id-ul coletului. Verifica in contul lor inainte de a reincerca." };
  }

  await admin.from("orders").update({
    packeta_packet_id: packetId,
    packeta_barcode: barcode,
    packeta_address_id: addressId,
    packeta_pickup_point: punctCurier,
    packeta_awb_at: new Date().toISOString(),
  }).eq("id", orderId).eq("business_id", businessId);

  return { packetId, barcode };
}

/* ── Eticheta ─────────────────────────────────────────────────────────────── */

/**
 * Eticheta coletului, ca PDF in base64.
 *
 * ⚠ Doua feluri, si alegerea COSTA BANI. Pentru coletele care pleaca la un curier
 * extern documentatia cere eticheta curierului; cea Packeta pusa pe un astfel de
 * colet inseamna reetichetare la depozitul lor, facturata separat.
 *
 * Eticheta de curier cere INTAI numarul de la curier (`packetCourierNumberV2`), si
 * asta e o metoda in plus care poate esua singura — de aia se incearca, si la esec
 * se cade pe eticheta Packeta cu un avertisment, in loc sa nu se tipareasca nimic.
 */
export async function getPacketaLabelAction(
  businessId: string,
  orderId: string,
): Promise<{ pdf: string; fel: "packeta" | "curier"; avertisment?: string } | { error: string }> {
  const ctx = await configSiComanda(businessId, orderId);
  if ("error" in ctx) return { error: ctx.error as string };
  const { admin, config, order } = ctx;

  const comanda = order as typeof order & {
    packeta_packet_id?: string | null;
    packeta_courier_number?: string | null;
  };
  const packetId = (comanda.packeta_packet_id ?? "").trim();
  if (!packetId) return { error: "Comanda nu are colet Packeta." };

  if (config.eticheta_curier) {
    try {
      let numar = (comanda.packeta_courier_number ?? "").trim();
      if (!numar) {
        numar = (await numarCurier(config, packetId)) ?? "";
        if (numar) {
          await admin.from("orders").update({ packeta_courier_number: numar })
            .eq("id", orderId).eq("business_id", businessId);
        }
      }
      if (numar) {
        const pdf = await etichetaCurier(config, packetId, numar);
        return { pdf: pdf.toString("base64"), fel: "curier" };
      }
    } catch (e) {
      /* Se cade pe eticheta Packeta, dar se spune de ce — reetichetarea costa. */
      const motiv = e instanceof Error ? e.message : "esec";
      try {
        const pdf = await etichetaColet(config, packetId, config.eticheta_format ?? "A6 on A6");
        return {
          pdf: pdf.toString("base64"),
          fel: "packeta",
          avertisment: `Nu am putut lua eticheta curierului (${motiv}). Am tiparit eticheta Packeta — `
            + "atentie, pe un colet catre un curier extern ei o refactureaza ca reetichetare.",
        };
      } catch (e2) {
        return { error: e2 instanceof Error ? e2.message : "Nu am putut lua eticheta." };
      }
    }
  }

  try {
    const pdf = await etichetaColet(config, packetId, config.eticheta_format ?? "A6 on A6");
    return { pdf: pdf.toString("base64"), fel: "packeta" };
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Nu am putut lua eticheta." };
  }
}

/* ── Dezlegarea ───────────────────────────────────────────────────────────── */

/**
 * Scoate coletul de pe comanda.
 *
 * ⚠ NU ANULEAZA NIMIC LA EI, si mesajul o spune raspicat. API-ul Packeta nu are
 * metoda de anulare — coletul ramane in contul lor si trebuie anulat de mana, din
 * interfata. Aceeasi fundatura ca la Posta, cu aceeasi iesire cinstita: dezlegam
 * legatura de la noi, ca sa se poata emite alta, dar spunem ce ramane in urma.
 */
export async function dezleagaPacketaAction(
  businessId: string,
  orderId: string,
): Promise<{ success: true; avertisment: string } | { error: string }> {
  const p = await proprietar(businessId);
  if (!p.ok) return { error: p.error };

  const admin = createAdminClient();
  const { data: order } = await admin
    .from("orders").select("id, packeta_packet_id").eq("id", orderId).eq("business_id", businessId).maybeSingle();
  if (!order) return { error: "Comanda nu a fost gasita." };

  const vechi = (order as { packeta_packet_id?: string | null }).packeta_packet_id ?? null;

  const { error } = await admin.from("orders").update({
    packeta_packet_id: null,
    packeta_barcode: null,
    packeta_courier_number: null,
    packeta_external_tracking: null,
    packeta_awb_at: null,
    packeta_status_code: null,
    packeta_status_checked_at: null,
  }).eq("id", orderId).eq("business_id", businessId);
  if (error) return { error: "Nu am putut dezlega coletul." };

  /*
   * ⚠ Registrul trebuie sa afle, si REZULTATUL NU SE ARUNCA.
   *
   * `marcheazaAnulata` intoarce `false` TACUT cand n-a gasit randul. Slotul ramane
   * `reusit`, iar urmatoarea emitere primeste `deja` si scrie inapoi pe comanda
   * coletul MORT — la Packeta, un colet pe care nici nu-l putem anula. Deci
   * esecul se spune omului, nu se inghite.
   */
  const eliberat = await marcheazaAnulata(admin, businessId, cheieOperatie("awb", "packeta", orderId));
  if (!eliberat) {
    await logError({
      action: "packeta.dezleaga",
      message: `slotul din registru nu s-a eliberat pentru comanda ${orderId}: o emitere noua ar adopta coletul vechi`,
      details: { orderId },
      businessId,
      severity: "warning",
    });
  }

  return {
    success: true,
    avertisment: vechi
      ? `Coletul ${vechi} a fost scos de pe comanda, dar la Packeta EXISTA in continuare: `
        + "API-ul lor nu are anulare. Anuleaza-l din contul Packeta, altfel ramane facturabil."
        + (eliberat ? "" : " ⚠ Registrul nu s-a eliberat — daca emiterea urmatoare aduce inapoi acelasi colet, anunta-ne.")
      : "Comanda nu avea colet Packeta.",
  };
}

/* ── Urmarirea ────────────────────────────────────────────────────────────── */

export interface StareAfisata {
  cod: number | null;
  descriere: string;
  cand: string | null;
  codExtern?: string | null;
}

export async function getPacketaTrackingAction(
  businessId: string,
  orderId: string,
): Promise<{ stari: StareAfisata[] } | { error: string }> {
  const ctx = await configSiComanda(businessId, orderId);
  if ("error" in ctx) return { error: ctx.error as string };
  const { config, order } = ctx;

  const packetId = ((order as { packeta_packet_id?: string | null }).packeta_packet_id ?? "").trim();
  if (!packetId) return { error: "Comanda nu are colet Packeta." };

  try {
    const istoric = await istoricColet(config, packetId);
    return {
      stari: istoric.map((s) => ({
        cod: s.cod,
        descriere: descriereStatus(s.cod, s.nume),
        cand: s.cand,
        codExtern: s.codExtern ?? null,
      })),
    };
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Nu am putut citi istoricul." };
  }
}

/**
 * O trecere de urmarire pentru o comanda. Folosita si de cron.
 *
 * ⚠ Se ia treapta cea mai INALTA din tot istoricul, nu ultima stare: intre doua
 * treceri pot intra mai multe evenimente, iar ultimul poate fi unul administrativ.
 * Lectie platita la GLS.
 */
export async function actualizeazaUrmarirePacketa(
  admin: ReturnType<typeof createAdminClient>,
  config: PacketaConfig,
  order: { id: string; status: string; packeta_packet_id: string | null },
): Promise<{ schimbat: boolean }> {
  const packetId = (order.packeta_packet_id ?? "").trim();
  if (!packetId) return { schimbat: false };

  const acum = new Date().toISOString();
  let istoric: Awaited<ReturnType<typeof istoricColet>>;
  try {
    istoric = await istoricColet(config, packetId);
  } catch (e) {
    /* Marcam ca am incercat, altfel comanda ramane in capul cozii si blocheaza restul. */
    await admin.from("orders").update({ packeta_status_checked_at: acum }).eq("id", order.id);
    await logError({
      action: "packeta.urmarire",
      message: e instanceof Error ? e.message : "esec",
      details: { orderId: order.id, verdict: verdictFurnizor(e) },
    });
    return { schimbat: false };
  }

  const stari = istoric.map((s) => ({ cod: s.cod, nume: s.nume, cand: s.cand, codExtern: s.codExtern }));
  const ultima = ultimaStare(stari);
  const nou = statusFinalDinStari(order.status, stari);
  /* `externalTrackingCode` apare la statusul 6 si e numarul de la curierul real. */
  const codExtern = stari.map((s) => s.codExtern).filter(Boolean).pop() ?? null;

  await admin.from("orders").update({
    packeta_status_checked_at: acum,
    packeta_status_code: ultima?.cod ?? null,
    ...(codExtern ? { packeta_external_tracking: codExtern } : {}),
    ...(nou && nou !== order.status ? { status: nou } : {}),
  }).eq("id", order.id);
  return { schimbat: !!nou && nou !== order.status };
}
