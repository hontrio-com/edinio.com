"use server";
import { enqueueAboutYouShip } from "@/lib/aboutyou/queue";
import { dupaRaspuns } from "@/lib/marketplace/dupa-raspuns";
import { pastreazaSecretele } from "@/lib/integrari/secrete";
import { secretDinConfig } from "@/lib/integrari/secret-server";

import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import {
  createDpdShipment,
  createDpdIntlShipment,
  cancelDpdShipment,
  requestDpdCourierPickup,
  loadDpdAccount,
  citesteObiectDpd,
  type DpdConfig,
  type DpdObiect,
  type DpdShipmentInput,
} from "@/lib/dpd";
import { euCountryByIso2 } from "@/lib/eu-countries";
import { logError } from "@/lib/error-logger";
import { cheieOperatie, cuRegistru, marcheazaAnulata } from "@/lib/operatii/registru";
import { verdictFurnizor } from "@/lib/operatii/eroare-furnizor";
import { poartaAwbPropriu } from "@/lib/orders/poarta-awb";
import { destinatarulLaPunct } from "@/lib/shipping/punctul-de-pe-comanda";

// ─── Config actions ───────────────────────────────────────────────────────────

export async function saveDpdConfig(
  businessId: string,
  config: DpdConfig,
): Promise<{ success: true } | { error: string }> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: "Neautorizat" };

  const { data: biz } = await supabase
    .from("businesses").select("id").eq("id", businessId).eq("user_id", user.id).single();
  if (!biz) return { error: "Business negasit" };

  // Campurile secrete venite GOALE isi pastreaza valoarea salvata: formularul le
  // primeste mascate (vezi lib/integrari/secrete.ts), deci o salvare obisnuita
  // nu trebuie sa le stearga. Fara asta, mascarea ar distruge integrarea.
  // Citirea se face cu SERVICE ROLE. De aici valoarea nu pleaca spre curier — se
  // scrie doar la loc, si `privat.cripteaza` e idempotenta, deci randul din baza ar
  // ramane corect si citit cifrat. Se citeste totusi decriptat fiindca asta e
  // contractul lui `pastreazaSecretele` (secrete.ts): altfel `configFinal` tine
  // `enc.v1.…`, si primul care adauga dupa salvare un apel catre curier sau un
  // `return { config }` rupe integrarea in tacere. Proprietatea e dovedita mai sus.
  const { data: vechi } = await createAdminClient()
    .from("store_settings").select("dpd_config").eq("business_id", businessId).maybeSingle();
  const configFinal = pastreazaSecretele("dpd_config", config, vechi?.dpd_config);

  /*
   * ⚠ SEDIUL ALES SE VERIFICA LA DPD (08.10.2026). Lista din contract arata toti membrii, dar
   * specificatia spune ca, „depending on his/her permissions, a user is either allowed to work
   * with shipments of these members or not". Un sediu fara drepturi s-ar salva fara eroare si ar
   * cadea abia la prima cotatie sau la primul AWB. Se verifica doar cand sediul se SCHIMBA, ca o
   * pana DPD sa nu blocheze salvarea celorlalte optiuni.
   */
  const vechiulSediu = (vechi?.dpd_config as DpdConfig | null)?.client_id;
  const cfgNou = configFinal as unknown as DpdConfig;
  if (cfgNou.client_id && cfgNou.client_id !== vechiulSediu) {
    try {
      const obiect = await citesteObiectDpd(cfgNou.username, cfgNou.password, cfgNou.client_id);
      if (!obiect) return { error: "DPD nu a confirmat sediul ales. Alege alt sediu sau verifica drepturile contului." };
    } catch (e) {
      return { error: `DPD nu permite acest sediu pentru contul tau: ${(e as Error).message}` };
    }
  }

  const { error } = await supabase.from("store_settings").update({
    dpd_config: configFinal as unknown as import("@/types/database.types").Json,
    updated_at: new Date().toISOString(),
  }).eq("business_id", businessId);

  if (error) return { error: error.message };
  return { success: true };
}

export async function disconnectDpd(
  businessId: string,
): Promise<{ success: true } | { error: string }> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: "Neautorizat" };

  const { data: biz } = await supabase
    .from("businesses").select("id").eq("id", businessId).eq("user_id", user.id).single();
  if (!biz) return { error: "Business negasit" };

  const { error } = await supabase.from("store_settings").update({
    dpd_config: null,
    updated_at: new Date().toISOString(),
  }).eq("business_id", businessId);

  if (error) return { error: error.message };
  return { success: true };
}

export async function loadDpdAccountAction(
  businessId: string,
  username: string,
  password: string,
): Promise<{ clientId: number; name: string; obiecte: DpdObiect[] } | { error: string }> {
  const parola = await secretDinConfig(businessId, "dpd_config", "password", password);
  if (!parola) return { error: "Completeaza parola DPD." };
  return loadDpdAccount(username, parola);
}

/*
 * Client ID-ul unui sediu, dat de DPD comerciantului si introdus de mana.
 *
 * ⚠ La DPD autentificarea e doar utilizator si parola, iar utilizatorul are UN client implicit;
 * celelalte sedii din contract se aleg prin `sender.clientId`. Lista din `client/contract` le arata
 * de obicei, dar „depending on his/her permissions" poate lipsi. Atunci omul scrie Client ID-ul
 * primit de la DPD, iar noi il verificam cu `client/{id}` inainte sa-l acceptam.
 */
export async function verificaSediuDpdAction(
  businessId: string,
  username: string,
  password: string,
  clientId: number,
): Promise<{ obiect: DpdObiect } | { error: string }> {
  if (!Number.isSafeInteger(clientId) || clientId <= 0) return { error: "Client ID-ul trebuie sa fie un numar." };
  const parola = await secretDinConfig(businessId, "dpd_config", "password", password);
  if (!parola) return { error: "Completeaza parola DPD." };
  try {
    const obiect = await citesteObiectDpd(username, parola, clientId);
    if (!obiect) return { error: "DPD nu a gasit acest Client ID pentru contul tau." };
    return { obiect };
  } catch (e) {
    return { error: `DPD nu permite acest Client ID pentru contul tau: ${(e as Error).message}` };
  }
}

// ─── AWB actions ──────────────────────────────────────────────────────────────

async function getConfigAndOrder(businessId: string, orderId: string) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: "Neautorizat" as const };

  const { data: biz } = await supabase
    .from("businesses").select("id").eq("id", businessId).eq("user_id", user.id).single();
  if (!biz) return { error: "Acces interzis" as const };

  // Configul se citeste cu service role: vederea public.store_settings nu mai
  // decripteaza pentru `authenticated`, deci pe clientul utilizatorului parola ar
  // veni `enc.v1.…` si DPD ar respinge orice expeditie. Service role OCOLESTE
  // RLS — de aceea proprietatea magazinului se verifica mai sus.
  const admin = createAdminClient();
  const [{ data: settings }, { data: order }] = await Promise.all([
    admin.from("store_settings")
      .select("dpd_config")
      .eq("business_id", businessId).single(),
    supabase.from("orders").select("*").eq("id", orderId).eq("business_id", businessId).single(),
  ]);

  if (!order) return { error: "Comanda negasita" as const };

  const config = settings?.dpd_config as DpdConfig | null;
  if (!config?.enabled || !config.username || !config.password || !config.client_id) {
    return { error: "DPD nu este configurat complet" as const };
  }

  return { supabase, config, order };
}

export async function createDpdShipmentAction(
  businessId: string,
  orderId: string,
  input: DpdShipmentInput,
): Promise<{ shipmentId: number; barcode: string } | { error: string }> {
  const ctx = await getConfigAndOrder(businessId, orderId);
  if ("error" in ctx) return { error: ctx.error as string };

  /* ⚠ POARTA E PRIMA, INAINTE de orice apel la curier: un refuz de dupa emitere ar fi un
     colet deja platit si o eticheta deja tiparita. Vezi `src/lib/orders/poarta-awb.ts`. */
  const refuzAwb = await poartaAwbPropriu(businessId, orderId, "dpd");
  if (refuzAwb) return { error: refuzAwb };

  const { supabase, config, order } = ctx;

  const orderData = order as typeof order & {
    dpd_shipment_id?: number | null;
    dpd_awb_number?: string | null;
  };
  if (orderData.dpd_shipment_id) return { error: "AWB DPD a fost deja creat" };

  // International order? The destination country + postcode are stored on the
  // order at checkout. Route to the DPD international flow when present.
  const shipping = (order.shipping_address ?? {}) as {
    country?: string;
    postal_code?: string;
    courier?: string;
    delivery_type?: string;
    locker_id?: string;
    locker_city?: string;
    locker_county?: string;
  };
  const eu = euCountryByIso2(shipping.country);

  // Server-derived extras: insured value from the order when the merchant
  // opted in, and the pickup point chosen by the customer at checkout. For
  // pickup deliveries the service discovery runs on the OFFICE's locality.
  const isDpdPickupDelivery =
    shipping.courier === "dpd" && shipping.delivery_type === "locker" && !!shipping.locker_id;
  const destinatarPunct = destinatarulLaPunct(
    { oras: shipping.locker_city, judet: shipping.locker_county },
    { oras: input.recipientCity, judet: input.recipientCounty },
  );

  const enriched: DpdShipmentInput = {
    ...input,
    declaredValue: config.declared_value_enabled ? (Number(order.subtotal) || undefined) : undefined,
    pickupOfficeId: isDpdPickupDelivery ? (Number(shipping.locker_id) || undefined) : input.pickupOfficeId,
    /*
     * ⚠⚠ Cand punctul n-are localitate, se pastreaza a CUMPARATORULUI.
     *
     * Randul de aici avea deja o plasa, `locker_county ?? input.recipientCounty`, si ea NU
     * prindea nimic: `??` raspunde doar la `null` si `undefined`, iar valoarea masurata e
     * SIRUL GOL. Comanda `#0011` — singura comanda cu punct care a primit vreodata un AWB
     * (DPD `81343890397`) — are exact judetul gol, deci a trecut prin plasa.
     */
    ...(isDpdPickupDelivery && shipping.locker_city
      ? { recipientCity: destinatarPunct.oras, recipientCounty: destinatarPunct.judet }
      : {}),
  };

  // Verificarile care nu ating DPD raman INAINTEA rezervarii: o comanda fara cod
  // postal n-are de ce sa ocupe un slot in registru.
  if (eu) {
    if (!config.international_enabled) return { error: "Livrarea internationala DPD nu este activata." };
    if (!(shipping.postal_code ?? "").trim()) {
      return { error: "Comanda nu are cod postal pentru expedierea internationala." };
    }
  }

  /*
   * O SINGURA cheie pentru amandoua ramurile, si asta e intentionat: intern sau
   * international, rezultatul e acelasi lucru — UN transport pe comanda asta. Doua
   * chei ar fi lasat o comanda sa capete si un AWB intern, si unul international.
   */
  const r = await cuRegistru(
    createAdminClient(),
    {
      businessId,
      orderId,
      fel: "awb",
      furnizor: "dpd",
      cheie: cheieOperatie("awb", "dpd", orderId),
    },
    async () => {
      const result = eu
        ? await createDpdIntlShipment(config, {
            ...enriched,
            pickupOfficeId: undefined,
            countryId: eu.dpdCountryId,
            postCode: (shipping.postal_code ?? "").trim(),
          })
        : await createDpdShipment(config, enriched);
      return {
        referinta: result.barcode,
        detalii: { shipmentId: result.shipmentId, international: !!eu },
        valoare: result,
      };
    },
    // `dpdCall` (src/lib/dpd.ts:94) marcheaza singur refuzul, inclusiv cazul in
    // care DPD raspunde 200 cu `error` in corp — pe care statusul l-ar fi ratat.
    verdictFurnizor,
    /*
     * ⚠ NU SE DA `legaturaVie`, si nu din uitare.
     *
     * Aici statea `async () => !!orderData.<coloana>` — dar `orderData` se
     * citeste INAINTE, iar mai sus exista un `return` care opreste totul daca
     * numarul exista deja. Deci in clipa apelului predicatul era garantat fals:
     * literalmente `async () => false`.
     *
     * Iar `false` pe ramura `deja` inseamna „elibereaza slotul si REIA", adica
     * inca un apel la curier. Si `deja` apare exact in cazul pentru care exista
     * registrul: AWB creat, scrierea pe comanda pierduta. Adica paza se
     * transforma tocmai acolo in AL DOILEA COLET REAL, FACTURAT.
     *
     * Fara callback, `deja` ADOPTA referinta din registru si o scrie inapoi pe
     * comanda — ce face codul de mai jos oricum.
     *
     * ⚠ Schimbul, pe fata: cazul prost devine o comanda care poarta un AWB
     * anulat (vizibil, si deja strigat in `/admin/logs` de `marcheazaAnulata`
     * cand eliberarea pica), in loc de un colet platit de doua ori.
     */
  );

  if (r.fel === "blocat" || r.fel === "eroare") return { error: r.mesaj };

  // Pe `deja`, transportul exista de la o incercare careia i s-a pierdut scrierea:
  // se reface legatura din registru, fara sa mai fie chemat DPD.
  const result =
    r.fel === "facut"
      ? r.valoare
      : {
          shipmentId: Number((r.detalii as { shipmentId?: number } | null)?.shipmentId ?? 0),
          barcode: r.referinta ?? "",
        };

  const { error: eScriere, data: randuri } = await supabase.from("orders").update({
    dpd_shipment_id: result.shipmentId,
    dpd_awb_number: result.barcode,
    /* ⚠ Ceasul urmaririi: de aici isi masoara cronul fereastra de 21 de zile, nu din
       `created_at`. O comanda veche careia i se emite AWB abia azi ar fi altfel din start
       in afara ferestrei, deci n-ar fi intrebata NICIODATA. */
    dpd_awb_at: new Date().toISOString(),
  /* ⚠ `business_id` e AUTORIZARE, nu podoaba: e a DOUA incuietoare, cea care tine daca RLS
     se slabeste vreodata pe `orders`. Aceeasi propozitie sta deasupra scriitorilor din
     cronurile de urmarire. Vezi `scrierile-din-actiuni-poarta-magazinul.test.ts`. */
    updated_at: new Date().toISOString(),
  }).eq("id", orderId).eq("business_id", businessId).select("id");

  /*
   * Coletul EXISTA la DPD. Un esec de scriere nu mai are voie sa se intoarca la om
   * ca eroare — l-ar trimite sa apese din nou. Registrul retine deja operatia, deci
   * a doua apasare o adopta si reface scrierea.
   */
  if (eScriere || !randuri || randuri.length === 0) {
    await logError({
      action: "dpd.createShipment",
      message: `AWB DPD creat (${result.barcode}), dar comanda NU s-a actualizat: ${eScriere?.message ?? "niciun rand modificat"}`,
      details: { orderId, businessId, shipmentId: result.shipmentId, code: eScriere?.code },
      businessId,
      severity: "critical",
    });
  } else {
    dupaRaspuns(() => enqueueAboutYouShip(businessId, orderId), "enqueueAboutYouShip", businessId);
  }

  return result;
}

// ─── Courier pickup ───────────────────────────────────────────────────────────

/**
 * Requests the DPD courier for every AWB generated in the last 24 hours.
 * DPD's model wants the explicit shipment list (same as the official module's
 * bulk action), so we collect the recent shipments server-side.
 */
export async function requestDpdPickupAction(
  businessId: string,
): Promise<{ count: number } | { error: string }> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: "Neautorizat" };

  const { data: biz } = await supabase
    .from("businesses").select("id").eq("id", businessId).eq("user_id", user.id).single();
  if (!biz) return { error: "Acces interzis" };

  // Service role, ca in getConfigAndOrder: parola pleaca la DPD, iar clientul
  // utilizatorului o primeste cifrata. Proprietatea magazinului e verificata
  // chiar deasupra, fiindca service role sare peste RLS.
  const admin = createAdminClient();
  const { data: settings } = await admin
    .from("store_settings").select("dpd_config").eq("business_id", businessId).single();
  const config = settings?.dpd_config as DpdConfig | null;
  if (!config?.enabled || !config.username || !config.password || !config.client_id) {
    return { error: "DPD nu este configurat complet" };
  }

  const since = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
  const { data: orders } = await supabase
    .from("orders")
    .select("*")
    .eq("business_id", businessId)
    .not("dpd_shipment_id", "is", null)
    /*
     * ⚠ DUPA MOMENTUL EMITERII AWB-ULUI, NU DUPA `updated_at` (08.10.2026). Orice atingere a
     * comenzii (o editare, o schimbare de status, o tranzitie de marketplace) o baga inapoi in
     * fereastra, deci chemam curierul si pentru colete ridicate, livrate sau de pe comenzi
     * anulate. Si setul de AWB-uri se schimba, deci amprenta de mai jos nu mai oprea dublura.
     */
    .gte("dpd_awb_at", since)
    .not("status", "in", "(cancelled,refunded,delivered)");

  const ids = (orders ?? [])
    .map((o) => (o as { dpd_shipment_id?: number | string | null }).dpd_shipment_id)
    .filter((id): id is number | string => id != null && String(id) !== "0")
    .map((id) => String(id));

  if (ids.length === 0) {
    return { error: "Nu exista AWB-uri DPD generate in ultimele 24 de ore. Genereaza AWB-urile inainte de a chema curierul." };
  }

  /*
   * Discriminantul e CHIAR SETUL de AWB-uri cerute, nu ziua.
   *
   * Doua apasari cu aceleasi colete = curierul chemat de doua ori pentru aceeasi
   * marfa, adica duplicatul. Dar daca intre timp s-au mai generat AWB-uri, setul e
   * altul si a doua chemare e legitima — o cheie pe zi ar fi blocat-o, si tocmai
   * marfa noua ar fi ramas neridicata.
   *
   * Se hasheaza fiindca lista poate fi lunga; sortata, ca ordinea sa nu conteze.
   */
  const { createHash } = await import("node:crypto");
  const amprenta = createHash("sha1").update([...ids].sort().join(",")).digest("hex").slice(0, 16);

  const r = await cuRegistru(
    createAdminClient(),
    {
      businessId,
      orderId: null,
      fel: "ridicare",
      furnizor: "dpd",
      cheie: cheieOperatie("ridicare", "dpd", amprenta),
    },
    async () => {
      await requestDpdCourierPickup(config, ids);
      return { referinta: amprenta, detalii: { colete: ids.length }, valoare: { count: ids.length } };
    },
    verdictFurnizor,
  );

  if (r.fel === "blocat" || r.fel === "eroare") return { error: r.mesaj };
  return { count: r.fel === "facut" ? r.valoare.count : ids.length };
}

export async function cancelDpdShipmentAction(
  businessId: string,
  orderId: string,
): Promise<{ success: true } | { error: string }> {
  const ctx = await getConfigAndOrder(businessId, orderId);
  if ("error" in ctx) return { error: ctx.error as string };
  const { supabase, config, order } = ctx;

  const orderData = order as typeof order & {
    dpd_shipment_id?: number | null;
    dpd_awb_number?: string | null;
  };
  if (!orderData.dpd_shipment_id) return { error: "Nu exista expeditie DPD pentru aceasta comanda" };

  try {
    await cancelDpdShipment(config, orderData.dpd_shipment_id);

    const { data: randuri, error: eScriere } = await supabase.from("orders").update({
      dpd_shipment_id: null,
      dpd_awb_number: null,
      /* ⚠ Si urma de urmarire a coletului anulat: ramasa, un AWB nou cu aceeasi prima problema
         (acelasi cod) nu mai anunta comerciantul, fiindca urmarirea compara cu codul vechi. */
      dpd_status_code: null,
      dpd_status_label: null,
      dpd_status_checked_at: null,
      updated_at: new Date().toISOString(),
    }).eq("id", orderId).eq("business_id", businessId).select("id");
    /*
     * Scrierea locala se VERIFICA, dar esecul ei NU devine eroare catre om.
     *
     * AWB-ul e deja ANULAT la curier. Un „Eroare la actualizare" l-ar trimite pe
     * comerciant sa apese din nou, iar a doua anulare cade la curier cu „AWB
     * inexistent" si arata ca un sistem stricat. Deci se raporteaza succes si se
     * striga in `/admin/logs`: acolo ramane singura dovada ca o comanda mai poarta
     * un numar de transport care nu mai exista.
     *
     * `.eq("business_id")` nu e decorativ: fara el, zero randuri ar putea insemna
     * si „alta comanda", nu doar „scriere pierduta", si alarma ar fi ambigua.
     */
    if (eScriere || !randuri || randuri.length === 0) {
      await logError({
        action: "dpd.cancelShipment",
        message: `Expeditia DPD ${orderData.dpd_shipment_id} a fost anulata la curier, dar comanda NU s-a actualizat: ${eScriere?.message ?? "niciun rand modificat"}`,
        details: { orderId, businessId, shipmentId: orderData.dpd_shipment_id, code: eScriere?.code },
        businessId, severity: "critical",
      });
    }

    /*
     * Slotul din registru se elibereaza DUPA confirmarea anularii, ca la Woot.
     * Fara asta, randul ar ramane `reusit` si emiterea urmatoare ar readuce pe
     * comanda chiar AWB-ul anulat — cele doua coloane de mai sus se golesc tocmai
     * ca sa se poata face altul.
     */
    const eliberat = await marcheazaAnulata(createAdminClient(), businessId, cheieOperatie("awb", "dpd", orderId));
    if (!eliberat) {
      await logError({
        action: "dpd.cancelShipment",
        message: "Expeditie DPD anulata, dar slotul din registru NU s-a eliberat. Urmatoarea emitere pe aceasta comanda va fi refuzata.",
        details: { orderId, businessId, shipmentId: orderData.dpd_shipment_id },
        businessId,
        severity: "critical",
      });
    }

    return { success: true };
  } catch (e) {
    return { error: (e as Error).message };
  }
}
