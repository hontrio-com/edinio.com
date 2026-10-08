import { normalizePhone } from "@/lib/utils/phone";
import { stripDiacritics, normalizeCountyName, normalizeLocalityName } from "@/lib/utils/ro-address";
import { eroareDeTermen, eroareNesigura, eroareRefuz } from "@/lib/operatii/eroare-furnizor";

const BASE_URL = "https://api.dpd.ro/v1";

/* ⚠ TERMEN PE CERERE. Fara el `fetch` asteapta la nesfarsit, iar cotatia din checkout
   cheama treisprezece curieri deodata (`Promise.all` in `shipping.actions.ts`): unul
   singur care nu raspunde tine cumparatorul pe ecranul de livrare pana renunta el.
   ⚠ Aici acopera SI cotatia internationala, care se asteapta in afara acelui
   `Promise.all`, cu un `await` singur, deci acolo nici macar ceilalti nu apuca sa
   raspunda.
   ⚠ Termenul depasit iese `necunoscut` din `verdictFurnizor`, fiindca eroarea nu trece
   prin niciun constructor din `eroare-furnizor.ts`: un AWB care POATE sa fi fost creat
   ramane blocat, nu se reincearca. */
const ASTEPTARE_MS = 20_000;

// Domestic service preference when services/destination returns several:
// 2505 (DPD STANDARD) is the current mainline service, the CLASIC ones are
// legacy contracts — pick in this order instead of blindly taking the first.
const DPD_PREFERRED_SERVICES = [2505, 2002, 2003];

export type DpdConfig = {
  enabled: boolean;
  username: string;
  password: string;
  client_id: number;
  /** Opt-in to international (EU) delivery — shows the country field at checkout. */
  international_enabled?: boolean;
  /*
   * `use_product_weight` a DISPARUT: greutatea se calculeaza acum intotdeauna din
   * cosul incarcat din baza, si la intern, si la international. Comutatorul nu
   * mai avea ce sa porneasca, iar in pozitia „oprit" ar fi cerut curierului
   * tariful unui kilogram pentru un colet de zece. Campul poate exista in
   * `dpd_config` la magazinele vechi; nimeni nu-l mai citeste.
   */
  /** Sender IBAN pentru ramburs. OPTIONAL la DPD: lipsa, banii merg in contul din contract. */
  iban?: string;
  /** Bank account holder (the merchant). Sent alongside the IBAN. */
  account_holder?: string;
  /** Opt-in: insure shipments for the order's product value (declaredValue). */
  declared_value_enabled?: boolean;
  /**
   * Opt-in "deschidere/testare la livrare" (OBPD). Only valid for services
   * 2505/2002/2113/2005 and home delivery (not pickup points) — same rules as
   * DPD's official module. Empty/undefined = off.
   */
  open_before_delivery?: "" | "OPEN" | "TEST";
  /** Who pays the return shipment if the recipient refuses after OBPD. */
  obpd_payer?: "SENDER" | "RECIPIENT";
};

export type DpdShipmentInput = {
  recipientName: string;
  recipientPhone: string;
  recipientEmail: string;
  recipientCity: string;
  /**
   * Recipient county — used to disambiguate the DPD site: Romania has many
   * same-named localities in different counties (e.g. "1 Decembrie" exists in
   * both Ilfov and Vaslui), and DPD's nomenclature carries the county as
   * `region`.
   */
  recipientCounty?: string;
  recipientStreet: string;
  recipientStreetNo: string;
  recipientAddressNote: string;
  weightKg: number;
  length?: number;
  width?: number;
  height?: number;
  cashOnDelivery: number;
  ref1: string;
  shipmentNote: string;
  /** Parcel content description (required by DPD, esp. for customs on international). */
  content?: string;
  /** DPD pickup point (office/locker) id — replaces the street address entirely. */
  pickupOfficeId?: number;
  /** Insured value (RON) — sent as additionalServices.declaredValue. */
  declaredValue?: number;
};

export type DpdShipmentResult = {
  shipmentId: number;
  barcode: string;
};

// ─── HTTP helper ──────────────────────────────────────────────────────────────

/*
 * ⚠ CARE CAI CHIAR CREEAZA CEVA LA DPD.
 *
 * Toate cererile lor sunt POST, si trec toate prin acelasi invelis: si cotatia din
 * checkout, si emiterea coletului. Deci „scriere" nu se poate citi din metoda, ci din
 * CALE. Lista e scurta dinadins, si orice cale nouA e citire pana se scrie aici.
 *
 * Conteaza la un termen depasit: pe `shipment` coletul poate sa fi fost creat inainte
 * sa renuntam noi sa asteptam, deci verdictul e „nu stim"; pe `calculate` nu s-a creat
 * nimic, si un „nu stim" ar bloca o comanda pentru un AWB inexistent.
 */
const CAI_DE_SCRIERE = new Set(["shipment", "pickup", "shipment/cancel"]);

async function dpdPost<T>(path: string, body: unknown): Promise<T> {
  let res: Response;
  try {
    res = await fetch(`${BASE_URL}/${path}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(ASTEPTARE_MS),
    });
  } catch (e) {
    throw eroareDeTermen(e, CAI_DE_SCRIERE.has(path), `cererea ${path}`, "DPD");
  }
  // DPD returns a non-JSON body (e.g. "Cannot deserialize ...") when the request
  // is malformed; read as text first so we surface the real message instead of a
  // bare "Unexpected token ... is not valid JSON".
  const text = await res.text();
  let data: Record<string, unknown>;
  try {
    data = JSON.parse(text) as Record<string, unknown>;
  } catch {
    // Corp necitibil: nu stim daca cererea a fost prelucrata sau nu. Mesajul e
    // acelasi ca inainte; se adauga doar verdictul, pentru registrul de operatii
    // externe (src/lib/operatii/eroare-furnizor.ts).
    throw eroareNesigura(`DPD ${path}: ${(text || res.statusText).slice(0, 250)}`);
  }
  if (!res.ok || data["error"]) {
    const errInfo = data["error"] as Record<string, unknown> | null | undefined;
    const msg = errInfo?.["message"] ?? data["message"] ?? res.statusText;
    /*
     * ⚠ DPD raspunde 200 cu `error` in corp — deci statusul HTTP nu spune adevarul.
     * Un `data["error"]` pe un raspuns reusit inseamna ca DPD a primit cererea, a
     * inteles-o si a refuzat-o: nimic nu s-a creat, deci reincercarea e libera.
     * Dedus din status, cazul asta ar fi iesit „nu stim" si ar fi blocat comanda
     * degeaba.
     */
    const refuzDovedit = !!data["error"] || (res.status >= 400 && res.status < 500 && res.status !== 408);
    /*
     * ⚠ `id` E REFERINTA PE CARE O CERE SUPORTUL DPD (08.10.2026). Specificatia: „System
     * generated unique error id to be used as this error reference" (forma „EE2026…"). Fara el,
     * comerciantul n-are ce le trimite, iar ei raspund „dati-ne codul de eroare". `context` spune
     * CAMPUL gresit („This refers to an item that is wrong and should be corrected").
     */
    const text = (v: unknown) => (typeof v === "string" && v.trim() ? v.trim() : "");
    // `component` e calea JSON a campului („$.recipient.address.siteId"), mai precisa decat `context`.
    const camp = text(errInfo?.["component"]) || text(errInfo?.["context"]);
    const cod = typeof errInfo?.["code"] === "number" ? `, cod ${errInfo["code"]}` : "";
    const idEroare = text(errInfo?.["id"]) ? ` [cod eroare DPD: ${text(errInfo?.["id"])}${cod}]` : (cod ? ` [${cod.slice(2)}]` : "");
    const mesaj = `DPD ${path}: ${msg}${camp ? ` (camp: ${camp})` : ""}${idEroare}`;
    throw refuzDovedit ? eroareRefuz(mesaj) : eroareNesigura(mesaj);
  }
  return data as T;
}

// ─── Account verification ─────────────────────────────────────────────────────

/** Un obiect (sediu) din contractul DPD: `clientId` e expeditorul de pe AWB. */
export type DpdObiect = { clientId: number; name: string; objectName: string; address: string };

type DpdClientBrut = {
  clientId?: number; clientName?: string; objectName?: string;
  address?: { fullAddressString?: string; siteName?: string; streetName?: string; streetNo?: string };
};

function obiectDinClient(c: DpdClientBrut): DpdObiect | null {
  if (!c?.clientId) return null;
  const a = c.address;
  const adresa = a?.fullAddressString
    || [a?.siteName, [a?.streetName, a?.streetNo].filter(Boolean).join(" ")].filter(Boolean).join(", ");
  return { clientId: c.clientId, name: c.clientName ?? "", objectName: c.objectName ?? "", address: adresa ?? "" };
}

/*
 * ═══ ⚠ UN UTILIZATOR DPD POATE VEDEA MAI MULTE OBIECTE (08.10.2026) ═══
 *
 * `POST /client` intoarce doar obiectul IMPLICIT al utilizatorului. La suporti-numar acela era
 * firma intermediarului care tine contractul, nu firma comerciantului (SBK WEB SQUAD SRL):
 * AWB-urile plecau cu alt expeditor, alt punct de ridicare, iar IBAN-ul pe care DPD il avea
 * „pe obiect" era al obiectului celalalt. Lista vine din `POST /client/contract` („clients with
 * same contract as logged user's one"), iar comerciantul isi alege sediul.
 *
 * Lista e un plus: daca cererea cade, conectarea merge ca inainte, pe obiectul implicit.
 */
/** „Get Client" (`client/{id}`): datele unui obiect, si dovada ca utilizatorul are acces la el. */
export async function citesteObiectDpd(username: string, password: string, clientId: number): Promise<DpdObiect | null> {
  const data = await dpdPost<{ client?: DpdClientBrut }>(`client/${clientId}`, { userName: username, password, language: "RO" });
  return data.client ? obiectDinClient(data.client) : null;
}

export async function loadDpdAccount(
  username: string,
  password: string,
): Promise<{ clientId: number; name: string; obiecte: DpdObiect[] } | { error: string }> {
  try {
    /* `POST /client` e „Get Own Client Id": raspunsul e PLAT si poarta doar `clientId`.
       Numele si adresa vin din `client/{id}` („Get Client", raspuns sub `client`). */
    const data = await dpdPost<{ clientId?: number }>("client", { userName: username, password, language: "RO" });
    if (!data.clientId) throw new Error("clientId lipsa din raspuns");
    const implicit = (await citesteObiectDpd(username, password, data.clientId).catch(() => null))
      ?? { clientId: data.clientId, name: "", objectName: "", address: "" };

    let obiecte: DpdObiect[] = [];
    try {
      const contract = await dpdPost<{ clients?: DpdClientBrut[] }>(
        "client/contract", { userName: username, password, language: "RO" },
      );
      obiecte = (contract.clients ?? []).map(obiectDinClient).filter((o): o is DpdObiect => o !== null);
    } catch {
      obiecte = [];
    }
    if (!obiecte.some((o) => o.clientId === implicit.clientId)) obiecte.unshift(implicit);

    return { clientId: implicit.clientId, name: implicit.name, obiecte };
  } catch (e) {
    return { error: (e as Error).message };
  }
}

// ─── Site (locality) resolution ───────────────────────────────────────────────

type DpdSite = {
  id?: number;
  name?: string;
  nameEn?: string;
  region?: string;   // DPD RO nomenclature: region = county (uppercase, no diacritics)
  regionEn?: string;
  postCode?: string;
};

/**
 * Resolve the DPD siteId for a Romanian locality. Sending only siteName is
 * ambiguous for same-named localities across counties, so search the DPD
 * nomenclature by name and pick the site whose region matches the order's
 * county. Returns null when nothing matches unambiguously — the caller then
 * falls back to siteName and lets DPD decide.
 */
export async function resolveDpdSiteId(
  config: DpdConfig,
  city: string,
  county?: string,
): Promise<number | null> {
  const name = normalizeLocalityName(city, county);
  if (!name) return null;
  const norm = (s: string | undefined) => stripDiacritics(String(s ?? "")).trim().toLowerCase();
  const wantedCounty = county ? norm(normalizeCountyName(county)) : "";
  /*
   * ⚠ DOUA REGULI DIN SPECIFICATIE (Find Site, 08.10.2026):
   *  - „The result is limited to 10 records." Un sat cu nume comun are peste 10 omonime, iar
   *    judetul bun putea sa nu fie printre ele. De aceea judetul pleaca in cerere, ca `region`
   *    („Filter by region (prefix match)"), nu doar ca filtru la noi.
   *  - `name` cauta si „part of site name". Fara potrivire EXACTA nu fixam niciun `siteId`:
   *    inainte, un nume scris altfel prindea ALTA localitate din acelasi judet, iar `siteId`
   *    bate `siteName`, deci coletul pleca gresit fara nicio eroare. Acum cade pe `siteName`
   *    si decide DPD.
   */
  const cauta = async (region?: string) => {
    const data = await dpdPost<{ sites?: DpdSite[] }>("location/site", {
      userName: config.username,
      password: config.password,
      language: "RO",
      countryId: 642,
      name,
      ...(region ? { region: region.toUpperCase() } : {}),
    });
    return (data.sites ?? []).filter((s) => norm(s.name) === norm(name) || norm(s.nameEn) === norm(name));
  };
  try {
    let exact = wantedCounty ? await cauta(wantedCounty) : [];
    if (exact.length === 0) exact = await cauta();
    if (exact.length === 0) return null;

    if (!wantedCounty) return exact.length === 1 ? (exact[0].id ?? null) : null;
    const byCounty = exact.filter((s) => norm(s.region) === wantedCounty || norm(s.regionEn) === wantedCounty);
    // Doua localitati cu acelasi nume in acelasi judet: ramane alegerea de dinainte (prima),
    // ca sa nu transformam in refuz un caz care azi trece.
    if (byCounty.length >= 1) return byCounty[0].id ?? null;
    return exact.length === 1 ? (exact[0].id ?? null) : null;
  } catch {
    return null; // resolution is best-effort; the shipment falls back to siteName
  }
}

/*
 * OBPD (deschidere/testare la livrare). Aceeasi regula si in cotatie, si pe AWB: altfel
 * cumparatorul plateste transportul fara OBPD, iar DPD factureaza cu el.
 *
 * ⚠ NUMAI CU RAMBURS (08.10.2026). Specificatia il defineste prin plata rambursului: „Options
 * before payment are needed to define what options recipient has on delivery before the
 * payment of the COD". Pe o comanda platita cu cardul nu exista plata la livrare, deci nici
 * optiune inainte de ea. Restul conditiilor vin din modulul lor oficial: serviciile
 * 2505/2002/2113/2005 si niciodata la punct de ridicare.
 */
export function obpdPentru(
  config: DpdConfig,
  o: { hasCod: boolean; pickupOfficeId?: number; countryId: number; serviceId: number },
): Record<string, unknown> | null {
  const option = config.open_before_delivery;
  if (option !== "OPEN" && option !== "TEST") return null;
  if (!o.hasCod || o.pickupOfficeId || o.countryId !== 642) return null;
  if (![2505, 2002, 2113, 2005].includes(o.serviceId)) return null;
  return { option, returnShipmentServiceId: o.serviceId, returnShipmentPayer: config.obpd_payer ?? "SENDER" };
}

/** Domestic service choice: prefer the mainline services over the first hit. */
function pickPreferredDpdService(ids: number[]): number | undefined {
  for (const preferred of DPD_PREFERRED_SERVICES) {
    if (ids.includes(preferred)) return preferred;
  }
  return ids[0];
}

// ─── Create shipment ──────────────────────────────────────────────────────────

// RO and BG are "local" (address type 1) in the Speedy engine; everything else
// is "foreign" (address type 2), which requires addressLine1 instead of
// streetName/streetNo.
const LOCAL_COUNTRY_IDS = new Set([642, 100]); // Romania, Bulgaria

// Builds the api.dpd.ro/v1 (Speedy) shipment body. Required top-level objects:
// sender, recipient, service, content, payment. The recipient address differs by
// type: type 1 (local) uses street fields / addressNote; type 2 (foreign) uses
// addressLine1 (+ addressLine2). Both use countryId + siteName + postCode to
// resolve the destination site.
export function buildDpdShipmentBody(
  config: DpdConfig,
  input: DpdShipmentInput,
  opts: { countryId: number; postCode?: string; serviceId: number; siteId?: number },
) {
  const service: Record<string, unknown> = {
    autoAdjustPickupDate: true,
    serviceId: opts.serviceId,
  };
  const additionalServices: Record<string, unknown> = {};
  const hasCod = input.cashOnDelivery > 0;
  if (hasCod) {
    // currencyCode is sent by DPD's official module too; domestic COD is RON.
    additionalServices.cod = { amount: input.cashOnDelivery, processingType: "CASH", currencyCode: "RON" };
  }
  if (input.declaredValue && input.declaredValue > 0) {
    additionalServices.declaredValue = { amount: Math.round(input.declaredValue * 100) / 100 };
  }
  const obpd = obpdPentru(config, { hasCod, pickupOfficeId: input.pickupOfficeId, countryId: opts.countryId, serviceId: opts.serviceId });
  if (obpd) additionalServices.obpd = obpd;
  if (Object.keys(additionalServices).length > 0) {
    service.additionalServices = additionalServices;
  }

  /*
   * ═══ ⚠ IBAN-UL E OPTIONAL LA DPD (08.10.2026) ═══
   *
   * `payment.senderBankAccount` e „Required: No" in specificatia lor (api.dpd.ro/api/docs,
   * ShipmentPayment): „Sender COD payout account information". Cand lipseste, DPD vireaza
   * rambursul in contul din CONTRACTUL clientului. Noi il ceream obligatoriu si opream local
   * orice AWB cu ramburs: la suporti-numar, 6 incercari in doua zile, desi DPD avea IBAN-ul
   * in sistem. Cererea nici nu pleca, deci la DPD nu exista nicio eroare de cautat.
   *
   * Il trimitem doar cand comerciantul l-a completat la noi (atunci el castiga fata de contract).
   */
  const payment: Record<string, unknown> = { courierServicePayer: "SENDER" };
  const iban = (config.iban ?? "").replace(/\s/g, "");
  if (hasCod && iban) {
    payment.senderBankAccount = {
      iban,
      accountHolder: (config.account_holder ?? "").trim() || "Expeditor",
    };
  }

  // We capture the street as a single free-text field, so join street + no,
  // then append the extra address details (bloc/ap/interfon) so they reach the
  // label. DPD's nomenclature is diacritics-free (the official module strips
  // them on every address field), so all address text goes through
  // stripDiacritics.
  const streetPart = [input.recipientStreet, input.recipientStreetNo]
    .map((s) => (s ?? "").trim())
    .filter(Boolean)
    .join(" ");
  const fullStreet = stripDiacritics(
    [streetPart || input.recipientCity, (input.recipientAddressNote ?? "").trim()]
      .filter(Boolean)
      .join(", "),
  );

  const address: Record<string, unknown> = {
    countryId: opts.countryId,
    // A resolved siteId pins the exact locality (county included); siteName is
    // the fallback and must be diacritics-free ("Sector X" folds to Bucuresti).
    ...(opts.siteId
      ? { siteId: opts.siteId }
      : { siteName: normalizeLocalityName(input.recipientCity, input.recipientCounty) }),
    ...(opts.postCode ? { postCode: opts.postCode } : {}),
  };
  if (LOCAL_COUNTRY_IDS.has(opts.countryId)) {
    // Type 1 (local): our single address line goes in addressNote — the spec's
    // "all components of the address stored in addressNote" path, which avoids
    // street-registry validation against a non-split address.
    address.addressNote = fullStreet.slice(0, 200);
  } else {
    // Type 2 (foreign): addressLine1 is REQUIRED, max 35; overflow to line 2.
    address.addressLine1 = fullStreet.slice(0, 35) || ".";
    if (fullStreet.length > 35) address.addressLine2 = fullStreet.slice(35, 70);
  }

  // Parcel dimensions (cm) feed the volumetric weight — sent per parcel, with
  // the module's mapping: depth = length.

/**
 * Taie un camp la lungimea pe care o cere DPD.
 *
 * ═══ ⚠ LUNGIMILE SUNT ALE LOR, CITATE (15.09.2026) ═══
 *
 * Din documentatia lor oficiala de Web API (`api.dpd.ro/web-api.html`), sectiunile
 * `CreateShipmentRequest`, `ShipmentContent` si `ShipmentRecipient`:
 *
 *     shipmentNote  200      ref1 / ref2  30      contents  100      package  50
 *     clientName    minimum 3, maximum 60        phone1    max 20, doar cifre si „+"
 *
 * ⚠ CE SE INTAMPLA FARA TAIERE: DPD refuza expedierea la EMITERE, cu comerciantul pe fereastra si
 * clientul pe fir. Campul „Observatii" din panou n-avea nicio margine, deci un text lung era un
 * refuz care se afla abia atunci.
 *
 * ⚠ SI O TAIERE PREA STRANSA E TOT O NECONFORMITATE: `contents` era taiat la 50, iar ei ingaduie
 * 100. Jumatate din descrierea marfii se pierdea degeaba, si tocmai ea conteaza la vama, pe
 * expedierile internationale (platforma a emis deja una).
 *
 * ⚠ NUMELE NU SE UMPLE. Ei cer minimum 3 caractere; un nume mai scurt e o problema de DATE, nu una
 * pe care s-o rezolvam inventand litere. Se taie maximul, si atat: refuzul lor, daca vine, spune
 * adevarul.
 */
function taieDpd(v: string | undefined | null, max: number): string | undefined {
  const t = (v ?? "").trim();
  if (!t) return undefined;
  return t.length > max ? t.slice(0, max).trim() : t;
}

  /* ⚠ Greutatea se verifica si pe server, nu doar in fereastra AWB: o actiune chemata direct cu
     0 sau NaN ajungea la DPD ca refuz („Validated against the minimum ... allowed for the service"). */
  if (!Number.isFinite(input.weightKg) || input.weightKg <= 0) {
    throw eroareRefuz("Greutatea coletului lipseste sau e zero. Completeaz-o in fereastra AWB.");
  }
  const hasDims = !!(input.length && input.width && input.height);
  const content: Record<string, unknown> = {
    parcelsCount: 1,
    totalWeight: input.weightKg,
    // `contents` is required by DPD (customs description on international).
    /* ⚠ 100, cat ingaduie EI, nu 50 cat taiam noi: jumatate din descriere se pierdea degeaba,
       si tocmai ea conteaza la vama. */
    contents: taieDpd(input.content, 100) ?? "Produse",
    package: "BOX",
  };
  if (hasDims) {
    content.parcels = [{
      seqNo: 1,
      weight: input.weightKg,
      size: { width: input.width, depth: input.length, height: input.height },
    }];
  }

  // Pickup-point delivery replaces the street address entirely: the official
  // module sends recipient.pickupOfficeId INSTEAD of an address block.
  const recipient: Record<string, unknown> = {
    phone1: { number: normalizePhone(input.recipientPhone) },
    privatePerson: true,
    /* ⚠ 60 la ei. Minimul lor de 3 NU se umple cu litere inventate: un nume prea scurt e o
       problema de date, iar refuzul lor spune adevarul. */
    clientName: taieDpd(input.recipientName, 60),
    email: input.recipientEmail || undefined,
    ...(input.pickupOfficeId
      ? { pickupOfficeId: input.pickupOfficeId }
      : { address }),
  };

  return {
    userName: config.username,
    password: config.password,
    language: "RO",
    sender: { clientId: config.client_id },
    recipient,
    service,
    content,
    payment,
    ref1: taieDpd(input.ref1, 30),
    shipmentNote: taieDpd(input.shipmentNote, 200),
  };
}

// CreateShipmentResponse: { id, parcels: [{ id }], ... } — the parcel id IS the AWB barcode.
async function sendDpdShipment(body: unknown): Promise<DpdShipmentResult> {
  const res = await dpdPost<{ id?: string | number; parcels?: { id?: string | number }[] }>("shipment", body);
  const barcode = res.parcels?.[0]?.id != null ? String(res.parcels[0].id) : "";
  if (!barcode) throw new Error("AWB DPD nu a fost returnat");
  return { shipmentId: Number(res.id) || 0, barcode };
}

export async function createDpdShipment(
  config: DpdConfig,
  input: DpdShipmentInput,
): Promise<DpdShipmentResult> {
  // Pin the exact locality first: same-named localities exist across counties,
  // and only the siteId encodes the county.
  const siteId = await resolveDpdSiteId(config, input.recipientCity, input.recipientCounty);

  // Domestic RO: discover the permitted service for the destination —
  // a hardcoded serviceId is rejected with "Serviciul nu este permis".
  const ids = await getDpdDestinationServiceIds(
    config,
    siteId
      ? { countryId: 642, siteId }
      : { countryId: 642, siteName: normalizeLocalityName(input.recipientCity, input.recipientCounty) },
  );
  const serviceId = pickPreferredDpdService(ids);
  // Descoperirea serviciului e o CITIRE; expedierea se trimite abia mai jos. Un
  // esec aici dovedeste ca nu s-a creat nimic.
  if (!serviceId) throw eroareRefuz("DPD nu a returnat niciun serviciu pentru aceasta destinatie. Verifica orasul/judetul destinatarului.");
  return sendDpdShipment(buildDpdShipmentBody(config, input, { countryId: 642, serviceId, siteId: siteId ?? undefined }));
}

// ─── Domestic tariff (checkout) ──────────────────────────────────────────────

/**
 * Live domestic price for a RO destination, COD premium included when the
 * order is ramburs. Resolves the site by county to quote the right locality.
 * null = destination not resolvable / no service (caller falls back to the
 * flat zone price).
 *
 * ⚠ INTOARCE AMANDOUA NUMERELE, si alegerea o face APELANTUL (13.09.2026).
 *
 * Acelasi obiect `ShipmentPrice` poarta `amount` (net), `vat` si `total` (brut). `price` e
 * brutul, `priceNoVat` netul. Biblioteca NU stie regimul magazinului: pe unul cu preturi
 * fara TVA, brutul ar primi cota a doua oara in `computeVat`. Acelasi tipar ca la FAN
 * (`total` plus `costNoVAT`) si la Cargus (`GrandTotal` plus `Subtotal`).
 *
 * ⚠ `priceNoVat` poate fi `null`, si atunci apelantul cade pe tariful fix al zonei. Netul
 * NU se deduce din brut: cota magazinului nu e neaparat cota lui DPD, iar comisionul de
 * ramburs, inclus in cotatie, poate avea alt regim.
 */
export async function calculateDpdDomesticPrice(
  config: DpdConfig,
  input: {
    city: string; county?: string; weightKg: number; cod?: number;
    /** Valoarea declarata (asigurare); se foloseste doar daca `declared_value_enabled`. */
    declaredValue?: number;
    /** Cotatie pentru punct de ridicare: acolo AWB-ul nu pune OBPD, deci nici cotatia. */
    laPunct?: boolean;
  },
): Promise<{ serviceId: number; price: number; priceNoVat: number | null } | null> {
  const siteId = await resolveDpdSiteId(config, input.city, input.county);
  const location: Record<string, unknown> = siteId
    ? { countryId: 642, siteId }
    : { countryId: 642, siteName: normalizeLocalityName(input.city, input.county) };

  const ids = await getDpdDestinationServiceIds(
    config,
    siteId ? { countryId: 642, siteId } : { countryId: 642, siteName: String(location.siteName) },
  );
  const serviceId = pickPreferredDpdService(ids);
  if (!serviceId) return null;

  /*
   * ⚠ ACELEASI SERVICII SUPLIMENTARE CA PE AWB (08.10.2026). Specificatia, la calcul:
   * `additionalServices` „Defines sub-services (like COD, Declared value, etc.)". Cotatia avea
   * doar rambursul, iar AWB-ul adauga si asigurarea si OBPD: cumparatorul platea pretul fara
   * ele, DPD factura cu ele, iar diferenta o acoperea comerciantul la fiecare colet.
   */
  const hasCod = !!(input.cod && input.cod > 0);
  const extra: Record<string, unknown> = {};
  if (hasCod) extra.cod = { amount: input.cod, processingType: "CASH", currencyCode: "RON" };
  if (config.declared_value_enabled && input.declaredValue && input.declaredValue > 0) {
    extra.declaredValue = { amount: Math.round(input.declaredValue * 100) / 100 };
  }
  const obpd = input.laPunct ? null : obpdPentru(config, { hasCod, countryId: 642, serviceId });
  if (obpd) extra.obpd = obpd;
  const service: Record<string, unknown> = { autoAdjustPickupDate: true, serviceIds: [serviceId] };
  if (Object.keys(extra).length > 0) service.additionalServices = extra;

  /* ⚠ `vat` era nedeclarat aici, desi vine in ACELASI obiect `ShipmentPrice` si e declarat
     pe calea internationala. Sub-declarat, nu se putea verifica `amount + vat = total`. */
  const data = await dpdPost<{
    calculations?: { price?: { amount?: number; vat?: number; total?: number; currency?: string }; error?: { message?: string; id?: string } }[];
  }>("calculate", {
    userName: config.username,
    password: config.password,
    language: "RO",
    sender: { clientId: config.client_id },
    recipient: { privatePerson: true, addressLocation: location },
    service,
    content: { parcelsCount: 1, totalWeight: Math.max(input.weightKg, 0.1) },
    payment: { courierServicePayer: "SENDER" },
  });

  const calc = data.calculations?.[0];
  /* ⚠ Fiecare rezultat are `error`-ul lui (CalculationResult.error), iar `dpdPost` vede doar pe
     cel de sus. Refuzul se aruncă, ca apelantul sa-l logheze inainte sa cada pe tariful fix. */
  if (calc?.error?.message) {
    throw eroareRefuz(`DPD calculate: ${calc.error.message}${calc.error.id ? ` [cod eroare DPD: ${calc.error.id}]` : ""}`);
  }
  // Customer-facing domestic price is the gross total (VAT + COD premium included).
  const gross = calc?.price?.total ?? calc?.price?.amount;
  if (typeof gross !== "number") return null;

  /*
   * ⚠ NETUL SE IA STRICT DIN `amount`, fara nicio cadere pe `total` (13.09.2026).
   *
   * Rândul de deasupra are dinadins `total ?? amount`: cand totalul lipseste, brutul cel mai
   * bun pe care il avem e `amount`. Aici insa aceeasi cadere ar fi o capcana: ar reintroduce
   * TACIT brutul drept net, si magazinul pe regim net ar primi cota peste un pret care o
   * continea deja. Lipsa netului se spune (`null`), nu se acopera.
   *
   * Masurat in memoria proiectului pe un raspuns real: 80,50 net / 95,84 brut.
   */
  const net = calc?.price?.amount;
  const vat = calc?.price?.vat;
  const netCredibil =
    typeof net === "number" && net > 0 && net <= gross
    && (typeof vat !== "number" || Math.abs(net + vat - gross) <= 0.01);

  return {
    serviceId,
    price: Math.round(gross * 100) / 100,
    priceNoVat: netCredibil ? Math.round(net * 100) / 100 : null,
  };
}

// ─── Pickup points (offices / lockers) ───────────────────────────────────────

export type DpdOffice = {
  id: number;
  name: string;
  siteId?: number;
  address: string; // fullAddressString
  city: string;    // address.siteName
};

/**
 * All DPD RO pickup points (offices + lockers). Mirrors the official module's
 * location/office call (credentials only — the account's country implied).
 */
export async function getDpdOffices(config: DpdConfig, o: { cuRamburs?: boolean } = {}): Promise<DpdOffice[]> {
  const data = await dpdPost<{ offices?: Record<string, unknown>[] }>("location/office", {
    userName: config.username,
    password: config.password,
    language: "RO",
  });
  return (data.offices ?? [])
    .filter((x) => punctulDpdPrimesteColetul(x, { cuRamburs: !!o.cuRamburs }))
    .map((o) => {
      const addr = (o.address ?? {}) as Record<string, unknown>;
      return {
        id: Number(o.id ?? 0),
        name: String(o.name ?? ""),
        siteId: typeof o.siteId === "number" ? o.siteId : undefined,
        address: String(addr.fullAddressString ?? ""),
        city: String(addr.siteName ?? ""),
      };
    })
    .filter((o) => o.id > 0);
}

/*
 * ⚠ NU ORICE OFICIU DPD E UN PUNCT DE RIDICARE (08.10.2026).
 *
 * Lista intoarce TOATE oficiile, iar pana azi le ofeream pe toate cumparatorului. Campurile din
 * specificatie (Office): `pickUpAllowed` „whether parcels can be picked up from office",
 * `validFrom`/`validTo`, `palletOffice`, `cargoTypesAllowed` ["PARCEL","PALLET","TYRE"],
 * `cashPaymentAllowed`/`cardPaymentAllowed`. Un camp LIPSA nu exclude: excludem doar ce DPD
 * spune explicit ca nu merge, ca sa nu golim lista daca un raspuns vine mai sarac.
 */
export function punctulDpdPrimesteColetul(
  o: Record<string, unknown>,
  opt: { cuRamburs: boolean },
  azi: string = new Date().toISOString().slice(0, 10),
): boolean {
  if (o.pickUpAllowed === false) return false;
  if (o.palletOffice === true) return false;
  const cargo = o.cargoTypesAllowed;
  if (Array.isArray(cargo) && cargo.length > 0 && !cargo.includes("PARCEL")) return false;
  if (typeof o.validFrom === "string" && o.validFrom.slice(0, 10) > azi) return false;
  if (typeof o.validTo === "string" && o.validTo.slice(0, 10) < azi) return false;
  // La ramburs cumparatorul plateste la punct: trebuie sa existe macar un fel de plata.
  if (opt.cuRamburs && o.cashPaymentAllowed === false && o.cardPaymentAllowed === false) return false;
  return true;
}

// ─── International (EU) ───────────────────────────────────────────────────────
// DPD Romania runs the Speedy engine: countryId is the ISO 3166-1 numeric code.
// Flow: services/destination (which service serves this country) -> calculate
// (live price) -> shipment (AWB). Domestic helpers above stay unchanged.

/** `price` = brut (`total`), `priceNoVat` = net strict din `amount`; alege apelantul, ca la intern. */
export type DpdIntlQuote = { serviceId: number; price: number; priceNoVat: number | null; currency: string };

/**
 * DPD's engine wants postcodes without separators; Poland writes them "12-345"
 * (the official module strips the dash for PL) and some countries add spaces.
 */
function cleanIntlPostCode(countryId: number, postCode: string): string {
  const trimmed = postCode.trim().replace(/\s+/g, "");
  return countryId === 616 ? trimmed.replace(/-/g, "") : trimmed; // 616 = PL
}

/**
 * Valid DPD serviceId(s) for the sender -> destination route. The docs say the
 * serviceId MUST come from a Destination Services Request — hardcoding one is
 * rejected with "Serviciul nu este permis". Resolve the site by postCode and/or
 * siteName (city) alongside the countryId.
 */
export async function getDpdDestinationServiceIds(
  config: DpdConfig,
  location: { countryId: number; postCode?: string; siteName?: string; siteId?: number },
): Promise<number[]> {
  const addressLocation: Record<string, unknown> = { countryId: location.countryId };
  if (location.siteId) addressLocation.siteId = location.siteId;
  if (location.postCode) addressLocation.postCode = location.postCode;
  if (!location.siteId && location.siteName) addressLocation.siteName = location.siteName;

  const data = await dpdPost<{ services?: { serviceId?: number; id?: number }[] }>("services/destination", {
    userName: config.username,
    password: config.password,
    language: "RO",
    date: new Date().toISOString().slice(0, 10),
    sender: { clientId: config.client_id },
    recipient: { privatePerson: true, addressLocation },
  });
  return (data.services ?? [])
    .map((s) => s.serviceId ?? s.id)
    .filter((x): x is number => typeof x === "number");
}

/** Live international price for a destination + weight. null = no service / no price. */
export async function calculateDpdIntlPrice(
  config: DpdConfig,
  input: { countryId: number; postCode: string; weightKg: number; serviceId?: number },
): Promise<DpdIntlQuote | null> {
  const postCode = cleanIntlPostCode(input.countryId, input.postCode);
  let serviceId = input.serviceId;
  if (!serviceId) {
    const ids = await getDpdDestinationServiceIds(config, { countryId: input.countryId, postCode });
    serviceId = ids[0];
  }
  if (!serviceId) return null;

  const data = await dpdPost<{
    calculations?: { price?: { amount?: number; vat?: number; total?: number; currency?: string }; error?: { message?: string; id?: string } }[];
    price?: { amount?: number; vat?: number; total?: number; currency?: string };
  }>("calculate", {
    userName: config.username,
    password: config.password,
    language: "RO",
    sender: { clientId: config.client_id },
    recipient: { privatePerson: true, addressLocation: { countryId: input.countryId, postCode } },
    service: { autoAdjustPickupDate: true, serviceIds: [serviceId] },
    content: { parcelsCount: 1, totalWeight: Math.max(input.weightKg, 0.1) },
    payment: { courierServicePayer: "SENDER" }, // merchant pays the courier
  });

  const calc = data.calculations?.[0];
  if (calc?.error?.message) {
    throw eroareRefuz(`DPD calculate: ${calc.error.message}${calc.error.id ? ` [cod eroare DPD: ${calc.error.id}]` : ""}`);
  }
  const price = calc?.price ?? data.price;
  /*
   * ⚠ BRUTUL SI NETUL, CA LA INTERN (08.10.2026). Specificatia: „amount: Total amount (before
   * VAT)", „total: Total amount (amount + vat)". Inainte se intorcea mereu `amount` (cu cadere
   * pe `total`), deci un magazin cu preturi CU TVA incasa netul ca si cum ar fi continut TVA-ul.
   * Apelantul alege dupa regimul magazinului; netul nu cade niciodata pe `total`.
   */
  const gross = price?.total ?? price?.amount;
  if (typeof gross !== "number") return null;
  const net = price?.amount;
  const vat = price?.vat;
  const netCredibil = typeof net === "number" && net > 0 && net <= gross
    && (typeof vat !== "number" || Math.abs(net + vat - gross) <= 0.01);
  return {
    serviceId,
    price: Math.round(gross * 100) / 100,
    priceNoVat: netCredibil ? Math.round(net * 100) / 100 : null,
    currency: price?.currency ?? "RON",
  };
}

export type DpdIntlShipmentInput = DpdShipmentInput & {
  countryId: number;
  postCode: string;
  serviceId?: number;
};

/** Create an international (EU) AWB. Discovers the service if not supplied. */
export async function createDpdIntlShipment(
  config: DpdConfig,
  input: DpdIntlShipmentInput,
): Promise<DpdShipmentResult> {
  const postCode = cleanIntlPostCode(input.countryId, input.postCode);
  let serviceId = input.serviceId;
  if (!serviceId) {
    const ids = await getDpdDestinationServiceIds(config, { countryId: input.countryId, postCode });
    serviceId = ids[0];
  }
  if (!serviceId) throw eroareRefuz("DPD nu are serviciu international disponibil pentru aceasta destinatie.");

  // DPD international services do not support cash-on-delivery (ramburs), so it is
  // never sent for foreign shipments — international orders are paid online.
  return sendDpdShipment(
    buildDpdShipmentBody(config, { ...input, cashOnDelivery: 0 }, { countryId: input.countryId, postCode, serviceId }),
  );
}

// ─── Courier pickup request ───────────────────────────────────────────────────

/**
 * Requests a courier visit for already-created shipments. Mirrors the official
 * DPD RO module exactly: explicit shipment id list + visitEndTime 19:00, with
 * autoAdjustPickupDate letting DPD move the visit to the next working day when
 * the request comes in too late. Without a pickup request (or a daily pickup
 * contract), created shipments are never collected.
 */
export async function requestDpdCourierPickup(
  config: DpdConfig,
  shipmentIds: string[],
): Promise<void> {
  await dpdPost("pickup", {
    userName: config.username,
    password: config.password,
    language: "RO",
    explicitShipmentIdList: shipmentIds,
    visitEndTime: "19:00",
    autoAdjustPickupDate: true,
  });
}

// ─── Cancel shipment ──────────────────────────────────────────────────────────

export async function cancelDpdShipment(
  config: DpdConfig,
  shipmentId: number,
  comment = "Anulat",
): Promise<void> {
  await dpdPost("shipment/cancel", {
    userName: config.username,
    password: config.password,
    language: "RO",
    shipmentId: String(shipmentId), // spec: shipmentId is a String
    comment,
  });
}

// ─── Print AWB (base64 PDF) ───────────────────────────────────────────────────

// format: "A4" | "A6"
export async function getDpdAwbPdf(
  config: DpdConfig,
  barcode: string,
  format: "A4" | "A6" = "A6",
): Promise<Buffer> {
  // Extended Print: PrintRequest = { paperSize, parcels:[{ parcel:{ id } }] };
  // ExtendedPrintResponse returns { data: <base64 pdf> }.
  const res = await dpdPost<{ data?: string }>("print/extended", {
    userName: config.username,
    password: config.password,
    language: "RO",
    paperSize: format, // A4 | A6 (DPD accepta si A4_4xA6, nefolosit la noi)
    parcels: [{ parcel: { id: barcode } }],
  });
  if (!res.data) throw new Error("PDF lipsa din raspuns DPD");
  return Buffer.from(res.data, "base64");
}

/**
 * Starea coletelor, din `BASE_URL/track`.
 *
 * ═══ ⚠ DE CE LOTUL E DE ZECE, SI NU MAI MARE ═══
 *
 * Nu e o prudenta de-a noastra: documentatia lor scrie „Allowed are up to 10 parcels". Un lot mai
 * mare nu da o eroare limpede, ci un raspuns pe care nu-l intelegi. Plafonul e al LOR.
 *
 * ⚠ `lastOperationOnly` e cerut ANUME. Fara el, raspunsul aduce tot istoricul fiecarui colet, adica
 * zeci de operatii pe care oricum nu le pastram, iar cronul ar carauzi de zeci de ori mai multi
 * octeti pentru aceeasi informatie.
 *
 * ⚠ SI EROAREA E PE DOUA NIVELURI. Raspunsul are un `error` al cererii INTREGI, dar fiecare colet
 * are si el `error`-ul lui: un numar necunoscut contului nu strica lotul, doar randul lui. Cine
 * citeste doar nivelul de sus arunca un lot bun pentru un singur colet strain.
 */
export async function getDpdTracking(
  config: DpdConfig,
  numereAwb: readonly string[],
): Promise<{ parcelId: string; operations: DpdOperatie[]; error?: { message?: string } }[]> {
  if (numereAwb.length === 0) return [];

  const r = await dpdPost<{ parcels?: unknown }>("track", {
    userName: config.username,
    password: config.password,
    language: "RO",
    parcels: numereAwb.map((id) => ({ id: String(id) })),
    lastOperationOnly: true,
  });

  if (!Array.isArray(r?.parcels)) return [];
  return (r.parcels as { parcelId?: unknown; operations?: unknown; error?: { message?: string } }[])
    .map((p) => ({
      parcelId: String(p?.parcelId ?? "").trim(),
      operations: Array.isArray(p?.operations) ? (p.operations as DpdOperatie[]) : [],
      ...(p?.error ? { error: p.error } : {}),
    }))
    .filter((p) => p.parcelId !== "");
}

/** O operatie din `track`, cat ne trebuie noua. Restul campurilor lor nu se citesc. */
export type DpdOperatie = {
  dateTime?: string;
  operationCode?: number;
  description?: string;
  exceptionCodes?: string[];
};
