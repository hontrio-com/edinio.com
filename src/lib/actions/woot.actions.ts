"use server";
import { enqueueAboutYouShip } from "@/lib/aboutyou/queue";
import { pastreazaSecretele } from "@/lib/integrari/secrete";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { logError } from "@/lib/error-logger";
import { cheieOperatie, cuRegistru, marcheazaAnulata } from "@/lib/operatii/registru";
import { eroareRefuz, verdictFurnizor } from "@/lib/operatii/eroare-furnizor";
import { stripDiacritics } from "@/lib/utils/ro-address";
import { greutatePentruCurier } from "@/lib/shipping/awb-weight";
import {
  getWootToken, getPrices, createOrder, cancelWootOrder,
  getAccountInfo, getCredit, getLocations, wootPhone,
  type WootConfig, type WootParcel, type WootPriceResult, type WootLocation,
} from "@/lib/woot";

/*
 * Clientul de sistem vine acum din `@/lib/supabase/admin`, nu se mai construieste
 * aici. Cel local era `createClient(...)` FARA genericul `<Database>` — adica
 * exact capcana din 19.08: `.rpc()` accepta orice nume de functie si orice
 * argumente, iar `.from()` orice coloana, fara ca `tsc` sa spuna nimic. Cel comun
 * intoarce `SupabaseClient<Database>` si, in plus, cade zgomotos daca lipseste
 * cheia de serviciu, in loc sa fabrice un client care esueaza la prima cerere.
 */
const adminClient = createAdminClient;

async function checkAccess(businessId: string): Promise<boolean> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return false;
  const { data } = await supabase
    .from("businesses")
    .select("id")
    .eq("id", businessId)
    .eq("user_id", user.id)
    .single();
  return !!data;
}

// Cheile Woot pleaca la furnizor, deci configul se citeste cu service role:
// clientul utilizatorului le primeste cifrate (`enc.v1.…`) si autentificarea Woot
// ar esua. Service role OCOLESTE RLS, deci fiecare apelant e OBLIGAT sa treaca
// intai prin `checkAccess(businessId)` — altfel un comerciant citeste cheile
// altuia doar schimband businessId-ul.
async function loadConfig(businessId: string): Promise<WootConfig | null> {
  const admin = adminClient();
  /* ⚠ `error` se ia si se ARUNCA. Ignorat, o citire cazuta iesea ca „nicio configurare",
     iar `saveConfig` scrie apoi INTREGUL obiect — deci golul inchipuit s-ar fi scris
     peste `public_key` si `secret_key`. Vezi incidentul Trendyol din 24.08.2026.
     ⚠ `maybeSingle`: un magazin fara rand e legitim; o citire cazuta nu e. */
  const { data, error } = await admin
    .from("store_settings")
    .select("woot_config")
    .eq("business_id", businessId)
    .maybeSingle();
  if (error) throw new Error(`Configurarea Woot nu s-a putut citi: ${error.message}`);
  return (data?.woot_config as WootConfig | null) ?? null;
}

// ─── Config ───────────────────────────────────────────────────────────────────

export async function saveWootConfig(
  businessId: string,
  config: WootConfig
): Promise<{ success: boolean; error?: string }> {
  if (!(await checkAccess(businessId))) return { success: false, error: "Neautorizat" };

  const supabase = await createClient();
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
    .from("store_settings").select("woot_config").eq("business_id", businessId).maybeSingle();
  const configFinal = pastreazaSecretele("woot_config", config, vechi?.woot_config);

  const { error } = await supabase
    .from("store_settings")
    .update({ woot_config: configFinal as never })
    .eq("business_id", businessId);

  if (error) return { success: false, error: "Eroare la salvare" };
  revalidatePath("/dashboard/features/woot");
  revalidatePath("/dashboard/features");
  revalidatePath("/dashboard/orders");
  return { success: true };
}

export async function disconnectWoot(
  businessId: string
): Promise<{ success: boolean; error?: string }> {
  if (!(await checkAccess(businessId))) return { success: false, error: "Neautorizat" };

  const supabase = await createClient();
  const { error } = await supabase
    .from("store_settings")
    .update({ woot_config: null })
    .eq("business_id", businessId);

  if (error) return { success: false, error: "Eroare la stergere" };
  revalidatePath("/dashboard/features/woot");
  revalidatePath("/dashboard/features");
  revalidatePath("/dashboard/orders");
  return { success: true };
}

export async function testWootConnection(businessId: string): Promise<{
  success: boolean;
  error?: string;
  name?: string;
  email?: string;
  credit?: number;
}> {
  if (!(await checkAccess(businessId))) return { success: false, error: "Neautorizat" };

  const config = await loadConfig(businessId);
  if (!config?.public_key || !config?.secret_key) return { success: false, error: "Chei API lipsa" };

  try {
    const token = await getWootToken(config.public_key, config.secret_key);
    const [info, credit] = await Promise.all([getAccountInfo(token), getCredit(token)]);
    return { success: true, name: `${info.first_name} ${info.last_name}`, email: info.email, credit: credit.total };
  } catch (err) {
    return { success: false, error: (err as Error).message };
  }
}

// ─── AWB ──────────────────────────────────────────────────────────────────────

export async function getWootPrices(
  businessId: string,
  receiver: {
    contact: string;
    phone: string;
    email?: string;
    country_id: number;
    city_id: number;
    address: string;
  },
  parcels: WootParcel[],
  repayment?: number,
  /** When set and the merchant opted into insurance, the order's product value is insured. */
  orderId?: string
): Promise<{ success: boolean; error?: string; prices?: WootPriceResult[] }> {
  if (!(await checkAccess(businessId))) return { success: false, error: "Neautorizat" };

  const config = await loadConfig(businessId);
  if (!config?.enabled || !config.public_key || !config.secret_key) {
    return { success: false, error: "Woot nu este configurat" };
  }

  try {
    const token = await getWootToken(config.public_key, config.secret_key);
    const sender = buildSender(config);
    const insurance = orderId ? await resolveInsurance(config, businessId, orderId) : undefined;
    const prices = await getPrices(token, {
      sender,
      receiver: { company: 0, ...receiverPentruWoot(receiver), phone: wootPhone(receiver.phone) },
      parcels: coletePentruWoot(parcels),
      repayment: repayment && repayment > 0 ? repayment : undefined,
      insurance,
    });
    const valid = prices.filter(p => p.errors.length === 0);
    return { success: true, prices: valid };
  } catch (err) {
    return { success: false, error: (err as Error).message };
  }
}

// Delivery lockers/points for a given service's courier, in the RECEIVER's
// city. Used by the AWB modal when a "livrare la locker/punct" service is
// selected — the order then carries receiver.location_id.
export async function getWootReceiverLocations(
  businessId: string,
  courierId: number,
  cityId: number
): Promise<{ success: boolean; error?: string; locations?: WootLocation[] }> {
  if (!(await checkAccess(businessId))) return { success: false, error: "Neautorizat" };

  const config = await loadConfig(businessId);
  if (!config?.public_key || !config?.secret_key) return { success: false, error: "Woot nu este configurat" };

  try {
    const token = await getWootToken(config.public_key, config.secret_key);
    const locations = await getLocations(token, {
      receiver: true,
      courier_id: courierId,
      city_id: cityId || undefined,
    });
    // Only delivery-capable locations, regardless of how the API treats the flag.
    return { success: true, locations: locations.filter((l) => Number(l.receiver) === 1) };
  } catch (err) {
    return { success: false, error: (err as Error).message };
  }
}

// Sender drop-off lockers/points for a given service's courier, near the sender's
// county. Used by the AWB modal when a "predare la locker" service is selected.
export async function getWootSenderLocations(
  businessId: string,
  courierId: number
): Promise<{ success: boolean; error?: string; locations?: WootLocation[] }> {
  if (!(await checkAccess(businessId))) return { success: false, error: "Neautorizat" };

  const config = await loadConfig(businessId);
  if (!config?.public_key || !config?.secret_key) return { success: false, error: "Woot nu este configurat" };

  try {
    const token = await getWootToken(config.public_key, config.secret_key);
    const locations = await getLocations(token, {
      sender: true,
      courier_id: courierId,
      county_id: config.sender.county_id || undefined,
    });
    return { success: true, locations };
  } catch (err) {
    return { success: false, error: (err as Error).message };
  }
}

export async function createWootAwb(
  businessId: string,
  orderId: string,
  serviceId: number,
  serviceName: string,
  receiver: {
    contact: string;
    phone: string;
    email?: string;
    country_id: number;
    city_id: number;
    address: string;
  },
  parcels: WootParcel[],
  repayment?: number,
  options?: { opd?: boolean; sat?: boolean },
  senderLocationId?: number,
  /** Delivery-to-location services: id of the Woot location the customer picks up from. */
  receiverLocationId?: number
): Promise<{ success: boolean; error?: string; awbNumber?: string; wootOrderId?: number }> {
  if (!(await checkAccess(businessId))) return { success: false, error: "Neautorizat" };

  const config = await loadConfig(businessId);
  if (!config?.enabled || !config.public_key || !config.secret_key) {
    return { success: false, error: "Woot nu este configurat" };
  }

  const admin = adminClient();

  /*
   * ⚠ AICI ERA CEL MAI DESCHIS SIT DIN TOT PROIECTUL.
   *
   * `createWootAwb` nu citea DELOC comanda inainte de a chema Woot: singura oprire
   * era `hasAwb` din WootAwbModal.tsx:109, adica o proprietate SSR in browser. Doua
   * file deschise, un dublu-click, sau un POST direct catre actiune (vezi
   * manifestul global de actiuni) produceau doua AWB-uri REALE. La Woot AWB-ul se
   * plateste din creditul contului, deci al doilea inseamna bani luati de doua ori
   * — iar anularea cere `woot_order_id`, exact ce se pierdea.
   *
   * Woot nu ofera nici camp de referinta a clientului, nici interogare dupa ea
   * (cautat in `createOrder`: parametrii nu contin nimic de acest fel), deci
   * furnizorul NU ne poate ajuta sa recuperam legatura. Registrul local e singurul
   * strat care poate opri a doua apasare.
   */
  const r = await cuRegistru(
    admin,
    {
      businessId,
      orderId,
      fel: "awb",
      furnizor: "woot",
      cheie: cheieOperatie("awb", "woot", orderId),
    },
    async () => {
      const token = await getWootToken(config.public_key, config.secret_key);
      const insurance = await resolveInsurance(config, businessId, orderId);
      const result = await createOrder(token, {
        service_id: serviceId,
        sender: buildSender(config, senderLocationId),
        receiver: {
          company: 0,
          ...receiverPentruWoot(receiver),
          phone: wootPhone(receiver.phone),
          ...(receiverLocationId ? { location_id: receiverLocationId } : {}),
        },
        parcels: coletePentruWoot(parcels),
        repayment: repayment && repayment > 0 ? repayment : undefined,
        insurance,
        options,
      });

      /*
       * `success: false` pe un raspuns HTTP reusit = Woot a primit cererea si a
       * spus explicit „nu". Nu vine cu `order_id`, deci nu exista niciun colet de
       * lamurit. `eroareRefuz` tine reincercarea libera; fara marcaj, registrul ar
       * fi presupus „poate s-a facut" si ar fi blocat comanda definitiv.
       */
      if (!result.success) throw eroareRefuz("Creare AWB esuata");

      return {
        // `order_id` e referinta care conteaza: fara ea AWB-ul nu se poate anula.
        referinta: String(result.order_id),
        detalii: { awb: result.awb_number ?? null, serviciu: serviceName },
        valoare: result,
      };
    },
    // `wootReq` (src/lib/woot.ts:136-185) arunca fara `try/catch` peste `fetch`,
    // deci o cadere de retea vine ca `TypeError` gol si iese `necunoscut`. Un 400
    // pe validare (diacriticele) poarta verdictul si iese `esuat`, ca reincercarea
    // dupa corectarea adresei sa ramana libera.
    verdictFurnizor,
    /*
     * Woot nu citeste comanda nicaieri mai sus, deci verificarea se face aici — si
     * costa un dus-intors DOAR pe ramura `deja`, niciodata pe drumul fericit.
     * Fara ea, o anulare a carei eliberare s-a pierdut ar face ca emiterea urmatoare
     * sa scrie inapoi pe comanda AWB-ul ANULAT.
     */
    async () => {
      const { data } = await admin
        .from("orders").select("woot_order_id")
        .eq("id", orderId).eq("business_id", businessId).maybeSingle();
      return !!data?.woot_order_id;
    },
  );

  if (r.fel === "blocat" || r.fel === "eroare") return { success: false, error: r.mesaj };

  /*
   * `facut` si `deja` scriu la fel, si nu din lene: pe `deja` AWB-ul exista de la o
   * incercare anterioara careia i s-a pierdut scrierea, iar scrierea de mai jos e
   * chiar recuperarea legaturii. E idempotenta, deci nu strica nimic sa se repete.
   */
  const detalii = (r.fel === "facut" ? r.valoare : null) as { awb_number?: string | null; order_id?: number } | null;
  const dinRegistru = (r.fel === "deja" ? (r.detalii as { awb?: string | null } | null) : null);
  const awbNumber = detalii?.awb_number ?? dinRegistru?.awb ?? "";
  const wootOrderId = r.fel === "facut" ? detalii?.order_id : Number(r.referinta) || undefined;

  const { error: eScriere, data: randuri } = await admin
    .from("orders")
    .update({
      woot_order_id: r.fel === "facut" ? String(detalii?.order_id ?? "") : String(r.referinta ?? ""),
      woot_awb_number: awbNumber,
      woot_service_name: serviceName,
      tracking_number: awbNumber || undefined,
      status: "processing",
      updated_at: new Date().toISOString(),
    })
    .eq("id", orderId)
    .eq("business_id", businessId)
    .select("id");

  /*
   * Scrierea se VERIFICA acum — dar esecul ei NU mai devine eroare catre om.
   *
   * AWB-ul exista si e platit. „Intoarce eroare" l-ar impinge sa apese din nou, si
   * chiar asta cream. Registrul retine deja operatia ca reusita, cu `order_id`-ul
   * de la Woot, deci a doua apasare o va ADOPTA in loc s-o refaca — si scrierea de
   * mai sus se reface atunci singura.
   */
  if (eScriere || !randuri || randuri.length === 0) {
    await logError({
      action: "woot.createAwb",
      message: `AWB Woot creat (order_id ${r.fel === "facut" ? detalii?.order_id : r.referinta}), dar comanda NU s-a actualizat: ${eScriere?.message ?? "niciun rand modificat"}`,
      details: { orderId, businessId, awbNumber, code: eScriere?.code },
      businessId,
      severity: "critical",
    });
  } else {
    // Doar cand comanda chiar poarta AWB-ul are sens sa anuntam expedierea mai
    // departe: altfel About You ar primi o expediere fara numar.
    void enqueueAboutYouShip(businessId, orderId);
  }

  revalidatePath("/dashboard/orders");
  revalidatePath(`/dashboard/orders/${orderId}`);
  return { success: true, awbNumber: awbNumber || undefined, wootOrderId };
}

export async function cancelWootAwb(
  businessId: string,
  orderId: string,
  wootOrderId: string
): Promise<{ success: boolean; error?: string }> {
  if (!(await checkAccess(businessId))) return { success: false, error: "Neautorizat" };

  const config = await loadConfig(businessId);
  if (!config?.public_key || !config?.secret_key) return { success: false, error: "Woot nu este configurat" };

  try {
    const token = await getWootToken(config.public_key, config.secret_key);
    await cancelWootOrder(token, Number(wootOrderId));

    const admin = adminClient();
    const { data: randuri, error: eScriere } = await admin
      .from("orders")
      .update({
        woot_order_id: null,
        woot_awb_number: null,
        woot_service_name: null,
        updated_at: new Date().toISOString(),
      })
      .eq("id", orderId)
      .eq("business_id", businessId)
      .select("id");

    /*
     * Aceeasi regula ca la emitere (mai sus): scrierea se verifica, dar esecul ei
     * NU devine eroare catre om — comanda e deja anulata la Woot, iar o a doua
     * apasare ar cadea la ei cu „comanda inexistenta". Ramane strigatul in loguri.
     */
    if (eScriere || !randuri || randuri.length === 0) {
      await logError({
        action: "woot.cancelOrder",
        message: `Comanda Woot ${wootOrderId} a fost anulata la curier, dar comanda NU s-a actualizat: ${eScriere?.message ?? "niciun rand modificat"}`,
        details: { orderId, businessId, wootOrderId, code: eScriere?.code },
        businessId, severity: "critical",
      });
    }

    /*
     * Slotul din registru se elibereaza DUPA ce Woot a confirmat anularea.
     *
     * Fara asta, randul ramanea `reusit` si urmatoarea emitere ar fi „adoptat" chiar
     * AWB-ul tocmai anulat, scriindu-l inapoi pe comanda. Cele trei linii de mai sus
     * golesc coloanele tocmai ca sa se poata emite altul — registrul trebuie sa
     * spuna acelasi lucru.
     */
    const eliberat = await marcheazaAnulata(admin, businessId, cheieOperatie("awb", "woot", orderId));
    if (!eliberat) {
      // Nu e eroare pentru comerciant (AWB-ul CHIAR s-a anulat), dar urmatoarea
      // emitere va fi blocata, deci trebuie sa se vada.
      await logError({
        action: "woot.cancelAwb",
        message: "AWB Woot anulat, dar slotul din registru NU s-a eliberat. Urmatoarea emitere pe aceasta comanda va fi refuzata.",
        details: { orderId, businessId, wootOrderId },
        businessId,
        severity: "critical",
      });
    }

    revalidatePath("/dashboard/orders");
    return { success: true };
  } catch (err) {
    return { success: false, error: (err as Error).message };
  }
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

/** Insured value (order product subtotal) when the merchant opted in. */
async function resolveInsurance(
  config: WootConfig,
  businessId: string,
  orderId: string,
): Promise<number | undefined> {
  if (!config.insurance_enabled) return undefined;
  const admin = adminClient();
  const { data } = await admin
    .from("orders")
    .select("subtotal")
    .eq("id", orderId)
    .eq("business_id", businessId)
    .single();
  const value = Number(data?.subtotal);
  return value > 0 ? Math.round(value * 100) / 100 : undefined;
}


/**
 * Woot refuza campurile de text cu diacritice romanesti.
 *
 * Dovada, doua comenzi identice de la acelasi magazin, acelasi produs, aceeasi
 * greutate: #0074 catre "Bl 44 Sc A str Republicii" (numai ASCII) a primit AWB;
 * #0075 catre "Garii 98" (cu ă) a primit `Woot API error 400`. Woot raspunde 400
 * FARA sa spuna de ce, deci eroarea nu ajuta cu nimic.
 *
 * Toti ceilalti curieri din proiect (FAN, Sameday, Cargus, DPD) normalizeaza deja
 * prin `stripDiacritics` — Woot era singurul care trimitea textul brut. Exceptia
 * cunoscuta e Colete Online, care dimpotriva CERE diacritice; de aceea
 * normalizarea sta aici, pe calea Woot, nu intr-un loc comun.
 */
function textPentruWoot(v: string | null | undefined): string {
  return stripDiacritics((v ?? "").trim());
}


/**
 * Coletele, gata de trimis la Woot: text fara diacritice si greutatea ridicata
 * la pragul de validare al lor (>= 1 kg). Vezi `PRAG_API_CURIER` pentru dovada.
 */
function coletePentruWoot(parcels: WootParcel[]): WootParcel[] {
  return parcels.map((c) => ({
    ...c,
    content: textPentruWoot(c.content),
    ...(c.weight !== undefined ? { weight: greutatePentruCurier(c.weight, "woot") } : {}),
  }));
}

/** Aceleasi reguli aplicate destinatarului trimis de modal. */
function receiverPentruWoot<T extends { contact: string; address: string; email?: string }>(r: T): T {
  return { ...r, contact: textPentruWoot(r.contact), address: textPentruWoot(r.address) };
}

function buildSender(config: WootConfig, locationId?: number): object {
  return {
    company: config.sender.company,
    ...(config.sender.company === 1 && config.sender.company_name
      ? { company_name: textPentruWoot(config.sender.company_name) }
      : {}),
    contact: textPentruWoot(config.sender.contact),
    phone: wootPhone(config.sender.phone),
    email: config.sender.email,
    country_id: 189,
    city_id: config.sender.city_id,
    address: textPentruWoot(config.sender.address),
    ...(config.sender.zipcode ? { zipcode: config.sender.zipcode } : {}),
    // Drop-off ("predare la locker") services: id of a Woot location from
    // GET /general/locations (only sent at AWB creation, never at pricing).
    ...(locationId ? { location_id: locationId } : {}),
  };
}
