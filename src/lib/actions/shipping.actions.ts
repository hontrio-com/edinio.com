"use server";

import { headers } from "next/headers";
import { createAdminClient } from "@/lib/supabase/admin";
import { rateLimit, clientIpFromHeaders } from "@/lib/utils/rate-limit";
import { consumaLimita } from "@/lib/utils/limita-durabila";
import { CacheScurt } from "@/lib/utils/cache-scurt";
import { logError } from "@/lib/error-logger";
import { estimateSamedayCost, getSamedayLockers, type SamedayConfig, type SamedayLocker } from "@/lib/sameday";
import { estimateFanCourierCost, getFanCourierPickupPoints, type FanCourierConfig, type FanCourierPickupPoint } from "@/lib/fancourier";
import { getWootToken, getPrices as fetchWootPrices, fetchCounties as fetchWootCounties, fetchCities as fetchWootCities, type WootConfig } from "@/lib/woot";
import { calculateDpdIntlPrice, calculateDpdDomesticPrice, getDpdOffices, type DpdConfig } from "@/lib/dpd";
import { calculateCargusPrice, getCargusPudoPoints, type CargusConfig } from "@/lib/cargus";
import { getCOToken, getPrices as fetchCOPrices, type COConfig } from "@/lib/colete";
import { type GlsConfig } from "@/lib/gls/client";
import { catalogServicii as catalogEcolet, coteaza as coteazaEcolet, type EcoletConfig } from "@/lib/ecolet/client";
import { corpExpediere as corpEcolet } from "@/lib/ecolet/expediere";
import { etichetaOferta as etichetaEcolet, ofertePosibile as oferteEcolet } from "@/lib/ecolet/preturi";
import { rezolvaLocalitatea as rezolvaLocalitateEcolet } from "@/lib/ecolet/cautare";
import { puncteGls } from "@/lib/gls/puncte";
import { postaGata, unitatiLivrare, type PostaConfig } from "@/lib/posta/client";
import { packetaGata, type PacketaConfig } from "@/lib/packeta/client";
import { puncteRomania } from "@/lib/packeta/puncte-flux";
import { puncteBune } from "@/lib/packeta/puncte";
import { normalizeazaUnitati } from "@/lib/posta/unitati";
import { coteaza as coteazaInnoship, innoshipGata, puncteFixe, type InnoshipConfig } from "@/lib/innoship/client";
import { corpComanda as corpInnoship } from "@/lib/innoship/expediere";
import { etichetaOferta as etichetaInnoship, ofertePosibile as oferteInnoship, termenLivrare as termenInnoship } from "@/lib/innoship/preturi";
import { normalizeazaPuncte } from "@/lib/innoship/puncte";
import { coteaza as coteazaSmartship, lockereEasybox, lockereFanbox, smartshipGata, type SmartshipConfig } from "@/lib/smartship/client";
import { corpCotare as corpSmartship, lipsuriConfigurare as lipsuriConfigurareSmartship, lipsuriExpediere as lipsuriSmartship } from "@/lib/smartship/expediere";
import { rezolvaLocalitatea as rezolvaLocalitateSmartship } from "@/lib/smartship/geo";
import { normalizeazaLockere } from "@/lib/smartship/lockere";
import { etichetaOferta as etichetaSmartship, ofertePosibile as oferteSmartship, termenLivrare as termenSmartship } from "@/lib/smartship/preturi";
import {
  cautaOrase as cautaOraseShipo, coordPentruPuncte, puncte as puncteShipo,
  servicii as serviciiShipo, shipoGata, tarife as tarifeShipo, type ShipoConfig,
} from "@/lib/shipo/client";
import {
  corpTarife as corpShipo, lipsuriConfigurare as lipsuriConfigurareShipo,
  lipsuriExpediere as lipsuriShipo,
} from "@/lib/shipo/expediere";
import { localitateShipo, orasulPotrivit } from "@/lib/shipo/localitati";
import { etichetaOferta as etichetaShipo, ofertePosibile as oferteShipo } from "@/lib/shipo/preturi";
/* ⚠ Alias: `normalizeazaPuncte` e deja luat de Innoship, mai sus. Doua importuri
   cu acelasi nume ar fi o eroare de compilare — dar unul dintre ele redenumit
   GRESIT ar normaliza punctele Shipo cu cititorul Innoship, tacut. */
import {
  MAX_PUNCTE, normalizeazaPuncte as normalizeazaPuncteShipo, RAZA_IMPLICITA_KM,
} from "@/lib/shipo/puncte";
import { fedexGata, tarife as tarifeFedex, type FedexConfig } from "@/lib/fedex/client";
import {
  corpTarife as corpFedex, lipsuriConfigurare as lipsuriConfigurareFedex,
  lipsuriExpediere as lipsuriFedex,
} from "@/lib/fedex/expediere";
import { etichetaOferta as etichetaFedex, ofertePosibile as oferteFedex } from "@/lib/fedex/preturi";
import { puncte as puncteUps, tarife as tarifeUps, upsGata, type UpsConfig } from "@/lib/ups/client";
import {
  AVERTISMENT_ACEEASI_LOCALITATE, corpTarife as corpUps, eAceeasiLocalitate,
  lipsuriConfigurare as lipsuriConfigurareUps, lipsuriExpediere as lipsuriUps, orasUps,
} from "@/lib/ups/expediere";
import { etichetaOferta as etichetaUps, ofertePosibile as oferteUps } from "@/lib/ups/preturi";
/*
 * ⚠ DHL importa MAI PUTIN decat UPS, si cele doua lipsuri sunt hotarari, nu scapari.
 *
 * Nu se importa `puncte`: DHL are `GET /servicepoints`, dar livrarea LA punct trece prin
 * `onDemandDelivery`, care cere `buyerDetails` si un `servicePointId` pe care ei il dau
 * doar prin „contact your local DHL Express Account Manager". Deci nu se poate emite ce
 * s-ar putea afisa. Vezi ramura de mai jos si pagina de configurare.
 *
 * Si nu se importa nimic de ramburs: DHL Express nu-l vinde din Romania. Vezi ramura.
 */
import { dhlGata, tarife as tarifeDhl, type DhlConfig } from "@/lib/dhl/client";
import {
  corpTarife as corpDhl, lipsesteCodulPostal as lipsesteCodulPostalDhl,
  lipsuriConfigurare as lipsuriConfigurareDhl, lipsuriExpediere as lipsuriDhl,
} from "@/lib/dhl/expediere";
import { etichetaOferta as etichetaDhl, ofertePosibile as oferteDhl } from "@/lib/dhl/preturi";
import { ziuaInRomania } from "@/lib/utils/zile-lucratoare";
import { euCountryByIso2 } from "@/lib/eu-countries";
import { stripDiacritics, normalizeLocalityName } from "@/lib/utils/ro-address";
import { applyShippingRules, parseShippingRules, type ShippingCartContext } from "@/lib/shipping/rules";
import { semneazaOptiuni } from "@/lib/shipping/quote-token";
import { contextulCosului , subtotalMaximDinCatalog } from "@/lib/shipping/cart-weight";
import { GREUTATE_REZERVA_KG } from "@/lib/shipping/awb-weight";

/**
 * Diacritics-insensitive locality match ("București"/"Sector 3" find
 * "Bucuresti"). Sameday keeps Sector 1-6 as separate cities, so the match
 * also runs with the raw (unfolded) needle and with the locker city folded —
 * covering every pairing of "Sector X" and "Bucuresti" on either side.
 */
function cityMatches(lockerCity: string, needle: string): boolean {
  const haystack = stripDiacritics(lockerCity).toLowerCase();
  const haystackFolded = normalizeLocalityName(lockerCity).toLowerCase();
  const foldedNeedle = normalizeLocalityName(needle).toLowerCase();
  const rawNeedle = stripDiacritics(needle).trim().toLowerCase();
  return (
    haystack.includes(foldedNeedle) ||
    (rawNeedle !== foldedNeedle && haystack.includes(rawNeedle)) ||
    haystackFolded.includes(foldedNeedle)
  );
}

/**
 * Depasirea plafonului PE MAGAZIN nu mai opreste cumparatorul (vezi
 * `getShippingOptions`), deci trebuie sa lase macar o urma: altfel comerciantul
 * ar putea sta o zi intreaga pe tarife fixe fara sa afle niciodata de ce.
 *
 * Cel mult o alerta pe ora pe magazin — contorul durabil folosit pe dos, ca
 * `error_logs` sa nu se umple exact in timpul abuzului pe care il semnaleaza.
 */
async function alertaPlafonMagazin(actiune: string, businessId: string, mesaj: string): Promise<void> {
  if (!(await consumaLimita(`alerta:${actiune}:${businessId}`, 1, 3600)).permis) return;
  await logError({
    action: actiune,
    message: mesaj,
    details: { businessId },
    businessId,
    severity: "warning",
  });
}

// ─── Types ───────────────────────────────────────────────────────────────────

export type ShippingOption = {
  courier: string;        // "sameday" | "fan-courier" | "cargus" | "dpd" | "colete" | "woot" | "own" | "pickup"
  courierLabel: string;   // Display name
  deliveryType: "address" | "locker";
  price: number;
  estimatedDays?: string;
  // Woot is a broker — each option is a specific courier offer; carry its ids so
  // the customer's choice flows through to AWB creation.
  wootServiceId?: number;
  wootCourierName?: string;
  wootServiceName?: string;
  // Colete Online is a broker too — same mechanism.
  coleteServiceId?: number;
  coleteServiceName?: string;
  /*
   * ⚠ eColet e tot broker, dar cheia serviciului lui e un SLUG (sir:
   * „dpd_standard"), nu un id numeric ca la ceilalti doi. Nu se poate refolosi
   * niciunul dintre campurile de mai sus: `Number("dpd_standard")` da `NaN`, iar
   * alegerea clientului s-ar pierde tacut intre checkout si emitere.
   */
  ecoletServiceSlug?: string;
  ecoletCourierName?: string;
  ecoletServiceName?: string;
  /*
   * ⚠ La Innoship cheia unei oferte are TREI parti, nu una: care curier real,
   * ce fel de livrare si care varianta a serviciului. Pastrat doar curierul,
   * reemiterea dupa corectarea adresei ar pleca pe alt serviciu si alt pret.
   * Si `serviceId` nu e decor: 1 = domiciliu, 3 = locker, 4 = PUDO.
   */
  innoshipCourierId?: number;
  innoshipServiceId?: number;
  innoshipOptionId?: string;
  innoshipCourierName?: string;
  innoshipServiceName?: string;
  /*
   * ⚠ La SmartShip cheia unei oferte are DOUA parti, si a doua nu e evidenta.
   *
   * Cu `show_byoc: 1` acelasi curier apare de DOUA ori — o data pe contractul
   * comerciantului, o data pe cel SmartShip, la preturi diferite. Pastrat doar
   * `courierId`, cele doua s-ar prabusi una peste alta si cumparatorul ar alege
   * una si ar primi alta. Vezi `lib/smartship/preturi.ts`.
   */
  smartshipCourierId?: number;
  smartshipCourierName?: string;
  smartshipOwnContract?: boolean;
  /**
   * ⚠ Care retea de lockere: easybox (Sameday) sau FANbox (FAN Courier).
   *
   * Sunt nomenclatoare DIFERITE, cu id-uri din spatii diferite, si se emit cu
   * curieri diferiti. Amestecate intr-o singura lista, un id de FANbox trimis ca
   * easybox ar cadea cu 806 sau — mai rau — ar nimeri alt locker.
   */
  smartshipLockerNet?: "easybox" | "fanbox";
  /**
   * ⚠ CHEIA unei oferte Shipo, si singura parte a ei.
   *
   * La Shipo acelasi curier apare de mai multe ori — la adresa, in locker, in
   * punct PUDO — si fiecare are `rate_id`-ul lui, la alt pret. `rate_id` E
   * identitatea serviciului si tot el se trimite la emitere, deci o cheie facuta
   * din numele curierului ar prabusi doua sau trei oferte una peste alta:
   * cumparatorul ar alege una si ar primi alta. Vezi `lib/shipo/preturi.ts`.
   */
  shipoRateId?: number;
  shipoCourierSlug?: string;
  shipoCourierName?: string;
  /**
   * ⚠ CHEIA unei oferte FedEx, si e de ajuns singura.
   *
   * FedEx e un TRANSPORTATOR, nu un broker: `rateReplyDetails[]` are cate o intrare
   * pe serviciu si acelasi `serviceType` nu apare de doua ori. Deci nu exista aici
   * problema de la SmartShip (acelasi curier pe doua contracte) sau de la Shipo
   * (acelasi curier cu trei feluri de livrare). Pierdut insa, reemiterea ar pleca pe
   * serviciul implicit — alt pret si alt termen decat cel ales de cumparator.
   */
  fedexServiceType?: string;
  fedexServiceName?: string;
  /**
   * ⚠ CHEIA unei oferte UPS, si e de ajuns singura.
   *
   * UPS e un TRANSPORTATOR, nu un broker: `RatedShipment[]` are cate o intrare pe
   * serviciu si acelasi cod nu apare de doua ori. Pierdut insa, reemiterea ar pleca pe
   * implicitul LOR — care, verbatim din ghidul lor romanesc, e „UPS Express", cel mai
   * scump produs, si nu produce nicio eroare.
   *
   * ⚠ Si se pastreaza LITERAL: `Rating.yaml` declara `minLength: 3` pentru codul de
   * serviciu, `Shipping.yaml` declara `2`, iar exemplele lor trimit si `'11'` si `'011'`
   * pentru acelasi lucru. Daca cele doua forme sunt echivalente nu e documentat nicaieri.
   */
  upsServiceCode?: string;
  upsServiceName?: string;
  /**
   * ⚠ CHEIA unei oferte DHL, si e singura de pe lista care are DOUA parti obligatorii.
   *
   * La ei nu se numesc servicii, se numesc PRODUSE, iar `productCode` e in `required` pe
   * `POST /shipments`. Aici e deosebirea de UPS, si costa altfel: UPS fara cod de serviciu
   * factureaza TACIT cel mai scump produs, DHL REFUZA cererea. Deci codul nu e o
   * imbunatatire a fidelitatii, e conditia ca AWB-ul sa existe.
   *
   * ⚠ Iar `localProductCode` trebuie sa calatoreasca ODATA cu el, si nu se compune
   * niciodata de noi: e codul cu care contul comerciantului are tariful (`localProductCode`
   * din chiar oferta lor). Pierdut pe drum, emiterea pleaca pe produsul global si pretul
   * facturat se poate departa de cel aratat cumparatorului, fara ca nimic sa cada.
   */
  dhlProductCode?: string;
  dhlProductName?: string;
  dhlLocalProductCode?: string;
  /** Semnatura pretului, verificata la plasarea comenzii. Vezi `quote-token.ts`. */
  token?: string;
};

/**
 * O optiune care a trecut PRIN semnare.
 *
 * `getShippingOptions` intoarce numai asa ceva, si asta e o garantie de
 * compilare, nu o conventie: ramura internationala iesea din functie inainte de
 * pasul de semnare si pleca fara token, iar comanda cadea apoi pe tariful
 * implicit intern — 18 lei in loc de 95,84 pentru Germania. Cu `token`
 * obligatoriu pe tipul de retur, un `return` nou fara semnatura nu mai trece de
 * `tsc`, deci defectul nu se mai poate reintroduce in tacere.
 *
 * `token` ramane optional pe `ShippingOption` fiindca acolo calatoreste mai
 * departe prin componente si prin comanda, unde poate lipsi legitim.
 */
export type ShippingOptionSemnata = ShippingOption & { token: string };

export type LockerItem = {
  id: string;
  name: string;
  address: string;
  city: string;
  county: string;
  /**
   * ⚠ Codul postal al punctului, cand curierul il da.
   *
   * La livrarea in punct adresa de livrare E a punctului, iar `ZipCode` e camp
   * REQUIRED la GLS — pe care comenzile romanesti nu-l primesc din checkout.
   * Deci acolo unde il stim, il ducem pana pe comanda. Optional: ceilalti curieri
   * nu-l expun, si nici nu-l cer.
   */
  postCode?: string;
  lat: number;
  lng: number;
};

// ─── Courier labels ─────────────────────────────────────────────────────────

const COURIER_LABELS: Record<string, string> = {
  "fan-courier": "FAN Courier",
  sameday: "Sameday Courier",
  dpd: "DPD",
  cargus: "Cargus",
  woot: "Woot",
  colete: "Colete Online",
  gls: "GLS",
  pallex: "Pall-Ex",
  ecolet: "eColet",
  /* Numele firmei, cu diacritice: e marca lor, nu un text de-al nostru. */
  posta: "Poșta Română",
  innoship: "Innoship",
  packeta: "Packeta",
  smartship: "SmartShip",
  shipo: "Shipo.ro",
  fedex: "FedEx",
  ups: "UPS",
  /* Numele comercial complet: „DHL" singur inseamna si DHL Parcel, si DHL eCommerce,
     care sunt alte retele, cu alte conturi si alte API-uri. */
  dhl: "DHL Express",
  own: "Curier propriu",
  pickup: "Ridicare personala",
};

/**
 * Curierii care NU au API de tarif: pretul lor vine INTOTDEAUNA din
 * `shipping_zones`, oricum ar fi bifat `auto_price`.
 *
 * ⚠ GLS e aici pentru ca MyGLS chiar nu coteaza preturi — nu exista metoda. Fara
 * randul asta ar fi intrat in doua capcane deodata:
 *
 *   1. `atingeApiPlatit` l-ar fi numarat drept curier cu API si ar fi consumat
 *      degeaba plafoanele durabile (60/IP, 600/magazin la 10 minute). Cand alea
 *      se epuizeaza, TOTI curierii magazinului trec pe pret fix — deci un curier
 *      care nu cheama pe nimeni ar fi stricat cotatiile celorlalti.
 *   2. `flatCourierIds` nu l-ar fi cuprins, si o regula de transport cu actiunea
 *      „pret fix" scrisa de comerciant pentru GLS ar fi fost ignorata TACUT.
 *
 * ⚠ Posta Romana e aici din acelasi motiv, si e cel mai limpede dintre toate:
 * API-ul lor are SAPTE metode (borderou, AWB, detalii, trace, ultimul status, si
 * doua nomenclatoare) si NICIUNA nu coteaza. Tariful vine din contractul postal.
 */
/*
 * ⚠ Packeta e aici pentru ca API-ul lor nu are NICIO metoda de tarif: preturile
 * vin din contract, la fel ca la Posta. Lista lor de 24 de metode e completa si
 * n-are nimic de cotare.
 */
const FARA_API_DE_TARIF = new Set(["pickup", "own", "gls", "pallex", "posta", "packeta"]);

/** Merchant's custom checkout label (shipping_zones[id].label) or the branded default. */
function addrLabel(custom: string | undefined, fallback: string): string {
  return (custom ?? "").trim() || fallback;
}
/** Locker variant of the label: custom name + "(locker)" suffix, or the branded default. */
function lockerLabel(custom: string | undefined, fallback: string): string {
  const c = (custom ?? "").trim();
  return c ? `${c} (locker)` : fallback;
}

// ─── Get shipping options ────────────────────────────────────────────────────

export async function getShippingOptions(
  businessId: string,
  destination: {
    county: string;
    city: string;
    /*
     * `weightKg` NU mai exista aici, si asta e intentionat.
     *
     * Era un numar de la browser din care iesea un pret care pleaca SEMNAT: se
     * cerea o cotatie pentru un kilogram si se comandau apoi cincisprezece la
     * acelasi pret. Greutatea se calculeaza acum exclusiv din cosul incarcat din
     * baza (`cartWeightKg`), pe amandoua drumurile — si intern, si international.
     * Scos din semnatura, nu doar ignorat: asa compilatorul enumera apelantii.
     */
    cod?: number;
    country?: string;  // EU ISO alpha-2 for international; absent or "RO" = domestic
    postCode?: string;
    /*
     * Liniile cosului: din ele ies greutatea, clasele si categoriile pe care se
     * coteaza.
     *
     * Datele fiecarui produs (greutate, clasa, categorie) se citesc din baza,
     * deci sunt autoritare. CARE produse sunt in cos NU e verificat nicaieri:
     * lista vine de la browser, iar pretul care iese pleaca semnat. Se poate cere
     * o cotatie cu un cos usor si se poate comanda apoi altceva; amprenta nu
     * leaga liniile (vezi `quote-token.ts`).
     *
     * Masurat 2026-08-03, cat costa asta azi: din cele 3 magazine care coteaza
     * live, doua (okxi, yulmis-sound) n-au NICIUN produs cu greutate completata,
     * deci acolo greutatea e mereu rezerva de 1 kg si o lista mincinoasa nu misca
     * nimic. Ramane tonel-beauty, cu 253 de produse cantarite si maximum 1 kg
     * bucata. Nelegat inca fiindca la comanda ar trebui reconstruit acelasi numar
     * din liniile finale (cu pachete desfacute si oferte acordate server-side),
     * iar o nepotrivire cinstita cade pe `max(suma ceruta, tarif implicit)` —
     * adica exact +18 pana la +45 de lei peste 0,00 pe „Ridicare personala", la 5
     * magazine publicate.
     */
    cart?: { productId: string; quantity: number }[];
    /** Valoarea marfii dupa promotii, de la client. Vezi avertismentul de la `ctx.subtotal`. */
    subtotal?: number;
  },
): Promise<ShippingOptionSemnata[]> {
  /*
   * LIMITARE. Actiunea e publica (cumparatorul e anonim, deci ID-ul ei e in
   * bundle-ul fiecarui magazin) si fiecare apel poate declansa cereri catre
   * API-urile PLATITE ale curierilor, cu credentialele COMERCIANTULUI. Fara
   * plafon, o bucla de curl consuma cota lui la Sameday/FAN/DPD/Cargus/Woot si
   * ii poate opri livrarile reale. Plafon si pe IP, si pe magazin.
   */
  const ip = clientIpFromHeaders(await headers());
  if (!rateLimit(`shipQuote:${ip}`, 20, 60_000)) return [];

  // Service role: anonymous customers trigger this; courier secrets are read
  // server-side only and never returned to the client (only computed prices are).
  const supabase = createAdminClient();
  const { data: settings, error: eSettings } = await supabase
    .from("store_settings")
    .select("sameday_config, fan_courier_config, woot_config, dpd_config, cargus_config, colete_config, gls_config, pallex_config, ecolet_config, posta_config, innoship_config, packeta_config, smartship_config, shipo_config, fedex_config, ups_config, dhl_config, default_shipping_cost, shipping_zones, shipping_rules")
    .eq("business_id", businessId)
    .single();

  /*
   * ⚠ CITIREA ASTA CADE PESTE CHECKOUT-UL INTREGII PLATFORME.
   *
   * `settings` lipsa inseamna zero optiuni de livrare, iar zero optiuni inseamna
   * un checkout in care nu se poate comanda. Pana acum `error` nu se citea deloc,
   * deci o coloana ceruta si inexistenta — o migratie neaplicata inaintea unui
   * deploy — ar fi oprit vanzarea in TOATE magazinele, in tacere deplina: nicio
   * eroare, nicio urma, doar o lista goala.
   *
   * Nu schimba ce se intoarce (tot lista goala, n-avem ce oferi fara zone), dar
   * de acum se aude.
   */
  if (eSettings) {
    await logError({
      action: "getShippingOptions.setari",
      message: `Setarile de livrare nu s-au putut citi, checkout-ul ramane FARA nicio optiune: ${eSettings.message}`,
      details: { businessId, code: eSettings.code },
      businessId,
      severity: "critical",
    });
  }

  if (!settings) return [];

  const zones = (settings.shipping_zones ?? {}) as Record<string, { enabled: boolean; price: number; auto_price?: boolean; label?: string }>;
  const enabledZones = Object.entries(zones).filter(([, z]) => z.enabled);

  // No courier enabled in shipping_zones — nothing to show
  if (enabledZones.length === 0) return [];

  // Ridicate deasupra plafoanelor: de destinatie depinde CARE apel platit poate
  // pleca, deci si daca e ceva de plafonat. Vezi comentariul de mai jos.
  const iso2 = destination.country?.toUpperCase();
  const esteIntl = !!iso2 && iso2 !== "RO";

  /*
   * Plafoanele DURABILE se consuma abia AICI, si depasirea lor nu mai refuza.
   *
   * Doua lucruri erau gresite. (1) Se consumau INAINTE de citirea setarilor,
   * deci taiau si magazinele care ofera numai zone manuale — „Ridicare
   * personala", tarif fix — desi acelea nu ating niciun API platit si n-au deci
   * nicio cota de aparat. (2) La depasire se raspundea cu lista GOALA, iar
   * contorul pe magazin e COMUN tuturor cumparatorilor: ~10 IP-uri il goleau in
   * cateva secunde, si de acolo inainte cumparatorul REAL nu mai primea nicio
   * metoda de livrare si nu mai putea trimite comanda — fara niciun mesaj,
   * fiindca selectorul isi ascunde sectiunea cand lista e goala. Adica exact
   * capcana consemnata in `page.actions.ts`: plafonul pe magazin intors impotriva
   * comerciantului.
   *
   * Plafonul NU se sterge — el apara bani reali (cota de cotatii a
   * comerciantului la Sameday/FAN/DPD/Cargus/Woot). Peste el se raspunde cu
   * tarifele FIXE din `shipping_zones`, exact ca atunci cand API-ul curierului
   * cade, si nu mai pleaca niciun apel platit. Checkout-ul ramane functional,
   * atacatorul nu mai obtine nimic.
   */
  /*
   * ATENTIE la ramura internationala: ea NU se uita deloc la `auto_price`.
   * Cotatia DPD intl de mai jos pleaca ori de cate ori zona `dpd` e activa si
   * configurarea e completa, chiar daca pe zona comerciantul a pus „Pret fix".
   * Daca s-ar numara aici dupa aceeasi regula ca internul, un magazin cu DPD pe
   * tarif fix (si fara alt curier cu API) ar iesi cu `atingeApiPlatit === false`
   * — deci fara NICIUN plafon durabil — si totusi ar chema API-ul DPD la fiecare
   * cerere. Poarta se pune pe apelul care chiar pleaca, nu pe steagul din zona.
   */
  const atingeApiPlatit = esteIntl
    ? !!zones["dpd"]?.enabled
    : enabledZones.some(
        ([courierId, z]) => !FARA_API_DE_TARIF.has(courierId) && z.auto_price !== false,
      );
  let doarTarifeFixe = false;
  if (atingeApiPlatit) {
    const [limIp, limBiz] = await Promise.all([
      consumaLimita(`ship:ip:${ip}`, 60, 600),
      consumaLimita(`ship:biz:${businessId}`, 600, 600),
    ]);
    doarTarifeFixe = !limIp.permis || !limBiz.permis;
    if (!limBiz.permis) {
      await alertaPlafonMagazin(
        "getShippingOptions.plafonMagazin",
        businessId,
        "Plafonul de cotatii pe magazin e epuizat; se raspunde cu tarifele fixe din shipping_zones",
      );
    }
  }

  // Cart-derived shipping context (weight/classes/categories/quantity). Loaded once,
  // authoritative from the DB. Feeds both the domestic weight (below) and the rules
  // engine. When no cart is passed (legacy callers) everything stays as before.
  const rules = parseShippingRules(settings.shipping_rules);
  /*
   * Produsele cosului se incarca ori de cate ori exista un cos.
   *
   * Se incarcau doar cand magazinul avea reguli de transport sau DPD pe
   * kilograme — si in productie NICIUN magazin din 127 n-are vreuna dintre ele.
   * Deci `cartWeightKg` ramanea zero pe toate comenzile interne, iar cotatia
   * pleca pe rezerva de un kilogram: un cos de zece kilograme cerea curierului
   * tariful unuia singur, si comerciantul platea diferenta. Cantitatea nu atingea
   * deloc pretul livrarii.
   *
   * O interogare pe id-urile din cos, nu mai mult. Inainte greutatea venea
   * dintr-o harta cu TOT catalogul, trimisa in pagina de cos la fiecare afisare
   * — zeci de mii de randuri in HTML pentru un cos de doua linii.
   */
  /*
   * Regimul in care se cere TOT lotul de preturi de mai jos.
   *
   * `cod` e o suma trimisa de browser care intra direct in cererea catre curier
   * si din care iese comisionul de ramburs. Calculat o singura data aici si dus
   * in amprenta, ca pretul semnat sa spuna si in ce regim a fost cotat. Vezi
   * `QuoteOption.ramburs` pentru ce acopera si ce nu.
   */
  const esteRamburs = (Number(destination.cod) || 0) > 0;
  let cos = contextulCosului([], []);
  // Ridicat in afara blocului: pretul din catalog e nevoie si mai jos, ca sa
  // plafoneze subtotalul declarat de client in regulile de transport.
  let produseCotate: { id: string; shipping_class: string | null; category: string | null; weight_grams: number | null; price: number | null }[] = [];
  if (destination.cart && destination.cart.length > 0) {
    const { data: cartProducts, error: eroareCos } = await supabase
      .from("products")
      .select("id, shipping_class, category, weight_grams, price")
      .eq("business_id", businessId)
      .in("id", [...new Set(destination.cart.map((c) => c.productId))]);
    // O interogare cazuta inseamna greutate zero, adica tariful unui kilogram
    // pentru un colet de zece — tacut. Fiecare esec de curier de mai jos se
    // jurnalizeaza; asta se jurnaliza pana acum nicaieri.
    if (eroareCos) console.error("[shipping] cart weight lookup failed:", eroareCos.message);
    produseCotate = cartProducts ?? [];
    cos = contextulCosului(destination.cart, produseCotate);
  }
  const cartWeightKg = cos.weightKg;

  // Greutatea cu care se cere pretul curierilor interni. Un kilogram ramane
  // rezerva pentru cosurile ale caror produse n-au greutate completata.
  // Reparatia NU e teoretica: 1408 produse active de pe 14 magazine sunt
  // cantarite, iar la magazinul care coteaza live prin Cargus si DPD sapte din
  // opt comenzi trecute ar fi primit alt pret decat cel de la un kilogram.
  const weight = cartWeightKg > 0 ? cartWeightKg : GREUTATE_REZERVA_KG;

  /*
   * ⚠ VALOAREA MARFII, PLAFONATA — ridicata aici fiindca de ea are nevoie si COTAREA,
   * nu doar regulile de transport.
   *
   * CE ERA GRESIT: suma asta se calcula abia jos, in `ctx`-ul regulilor (`if
   * (rules.length > 0)`), deci `buildDhlOptions` compunea `DateExpediere` fara
   * `valoareComanda`. Urmarea: ramura din `corpTarife` care trimite
   * `monetaryAmount[declaredValue]` nu se atingea NICIODATA din checkout, desi
   * comentariul ei spune limpede „valoarea declarata intra in cotare fiindca ea trage
   * suprataxele de valoare si asigurarea". La emitere, `corpExpediere` trimite si
   * valoarea, si serviciul de asigurare `II` (cand comerciantul l-a pornit), iar DHL
   * factureaza dupa catalogul lor romanesc „55.00 LEI or 1% of insured value, if
   * higher". CE SE RUPEA: pretul aratat cumparatorului in checkout — si scris apoi in
   * `dhl_cost` — era mai mic cu cel putin 55 de lei pe colet decat cel facturat.
   * Magazinul vindea transport in pierdere, tacut, pe fiecare comanda. Cele doua
   * corpuri pleaca dinadins din acelasi `DateExpediere` ca sa nu se poata departa;
   * campul lipsa le departa oricum.
   *
   * ⚠ E VALOAREA MARFII, NU TOTALUL COMENZII, si asta e hotararea. Transportul nu are
   * voie sa intre in suma din care iese pretul transportului: ar fi circular — pretul
   * cotat ar umfla suprataxa de valoare, care ar umfla pretul cotat. `destination.subtotal`
   * e chiar „goods value after promo" pe care il trimite `CourierSelector`
   * (`Math.max(0, goodsTotal - discountAmount)` din checkout, fara livrare), deci e
   * exact ce trebuie declarat: ce s-ar plati daca se pierde coletul.
   *
   * ⚠ Plafonarea ramane cea dinainte (`min(cerut, maxim din catalog)`) si acum conteaza
   * mai mult: suma vine de la browser, iar de azi ea nu mai misca doar regulile de
   * transport, ci si ce cerem curierului. Umflata, ar fi cumparat asigurare mai scumpa
   * pe banii comerciantului.
   *
   * ⚠ Fara linii de cos declarate plafonul e ZERO, deci nu se declara nicio valoare si
   * cotarea ramane exact cea de pana acum. Nu e o reparatie completa — la emitere
   * valoarea se ia din `order.total`, deci un asemenea apel ar cota tot sub factura —
   * dar in checkout nu se intampla: si `CheckoutForm`, si `OrderModal` trimit `cart`
   * odata cu `subtotal`. Ramane deschis doar pentru apelantii care ar trimite unul fara
   * celalalt, si acolo nu exista nimic care sa sustina suma.
   */
  const valoareMarfii = Math.min(
    Math.max(0, Number(destination.subtotal) || 0),
    subtotalMaximDinCatalog(destination.cart, produseCotate),
  );

  const options: ShippingOption[] = [];

  // International (EU): only DPD international applies. Short-circuit here so the
  // domestic courier loop below stays completely unchanged for RO orders.
  if (esteIntl) {
    /*
     * Internationalul NU are tarif fix de rezerva, deci aici degradarea de mai
     * sus nu se aplica: pretul iese EXCLUSIV din apelul DPD si pleaca semnat, iar
     * a semna pretul zonei interne (18 lei) pentru un colet in Germania cotat
     * 95,84 il costa pe comerciant mai mult decat refuzul. Peste plafon se
     * raspunde tot cu lista goala.
     */
    if (doarTarifeFixe) return [];
    const eu = euCountryByIso2(iso2);
    const dpdCfg = settings.dpd_config as DpdConfig | null;
    const ready = !!(
      eu && destination.postCode && zones["dpd"]?.enabled &&
      dpdCfg?.enabled && dpdCfg.international_enabled && dpdCfg.username && dpdCfg.password && dpdCfg.client_id
    );
    if (!ready) return [];
    /*
     * Greutatea NU se ia de la client aici.
     *
     * Pretul international iese EXCLUSIV din ea, iar optiunea pleaca acum
     * semnata, deci pretul semnat ar fi fost pretul unei greutati declarate de
     * browser: se cerea o cotatie pentru un kilogram, se primea tokenul de
     * 95,84 lei si se comandau apoi cincisprezece kilograme la acelasi pret.
     * Amprenta leaga destinatia si suma, nu si datele din care a iesit suma.
     *
     * Cand exista un cos, greutatea vine din baza (`cartWeightKg`, incarcat mai
     * sus tocmai pentru asta). Asta repara si subestimarea sistematica: modalul
     * trimitea doar greutatea produsului principal, iar pagina de checkout o
     * uita pe cea a bump-urilor, desi amandoua le treceau in comanda.
     */
    // Fara comutator: internationalul cotea deja pe greutatea reala, fiindca
    // poarta veche incarca cosul ori de cate ori destinatia era straina. Pus
    // inapoi in fata lui, singurul magazin cu livrare in UE — care are 253 de
    // produse cantarite si a expediat un colet de 7,8 kg — ar fi cotat 1 kg.
    const greutateIntl = cartWeightKg > 0 ? cartWeightKg : 1;
    try {
      const quote = await calculateDpdIntlPrice(dpdCfg!, {
        countryId: eu!.dpdCountryId,
        postCode: destination.postCode!,
        weightKg: greutateIntl,
      });
      if (!quote) return [];
      // Semnata prin ACELASI ajutor ca optiunile interne: ramura asta iese din
      // functie inainte de pasul de la final, si tocmai de aceea pleca fara
      // token. Cu `semneazaOptiuni` in amandoua iesirile, o optiune nesemnata
      // nu mai poate scapa dintr-un `return` nou.
      return semneazaOptiuni(businessId, destination, esteRamburs, [{
        courier: "dpd",
        courierLabel: `DPD International (${eu!.name})`,
        deliveryType: "address" as const,
        price: quote.price,
        estimatedDays: "3-6 zile",
      }]);
    } catch {
      return [];
    }
  }

  const promises: Promise<void>[] = [];

  for (const [courierId, zone] of enabledZones) {
    // `doarTarifeFixe` trece fiecare curier pe ramura de pret manual de mai jos,
    // adica exact drumul pe care merg deja magazinele fara API configurat. Nu
    // exista o a doua implementare a rezervei, deci nu se poate desincroniza.
    const useAutoPrice = !doarTarifeFixe && zone.auto_price !== false; // default true

    if (courierId === "sameday") {
      const samedayConfig = settings.sameday_config as SamedayConfig | null;
      const hasApi = !!(samedayConfig?.enabled && samedayConfig.username && samedayConfig.pickup_point_id);

      if (hasApi && useAutoPrice) {
        // Home delivery and easybox run on different Sameday services (the
        // merchant's configured one vs LN LockerNextDay), so quote each.
        promises.push(
          estimateSamedayCost(samedayConfig!, {
            recipientCounty: destination.county,
            recipientCity: destination.city,
            weightKg: weight,
            cashOnDelivery: destination.cod ?? 0,
          })
            .then((r) => {
              const price = Math.round(r.amount * 100) / 100;
              const days = r.time <= 24 ? "1 zi lucratoare" : `${Math.ceil(r.time / 24)} zile lucratoare`;
              options.push({
                courier: "sameday",
                courierLabel: addrLabel(zone.label, "Livrare prin Sameday"),
                deliveryType: "address",
                price,
                estimatedDays: days,
              });
            })
            .catch((err) => {
              console.error("[shipping] Sameday estimate failed:", err.message);
              // Fallback to flat price
              options.push({
                courier: "sameday",
                courierLabel: addrLabel(zone.label, "Livrare prin Sameday"),
                deliveryType: "address",
                price: zone.price,
              });
            }),
        );
        promises.push(
          estimateSamedayCost(samedayConfig!, {
            recipientCounty: destination.county,
            recipientCity: destination.city,
            weightKg: weight,
            cashOnDelivery: destination.cod ?? 0,
            useLockerService: true,
          })
            .then((r) => {
              const price = Math.round(r.amount * 100) / 100;
              const days = r.time <= 24 ? "1 zi lucratoare" : `${Math.ceil(r.time / 24)} zile lucratoare`;
              options.push({
                courier: "sameday",
                courierLabel: lockerLabel(zone.label, "Sameday EasyBox (locker)"),
                deliveryType: "locker",
                price,
                estimatedDays: days,
              });
            })
            .catch((err) => {
              console.error("[shipping] Sameday easybox estimate failed:", err.message);
              options.push({
                courier: "sameday",
                courierLabel: lockerLabel(zone.label, "Sameday EasyBox (locker)"),
                deliveryType: "locker",
                price: zone.price,
              });
            }),
        );
      } else {
        // Manual price or no API config
        options.push({
          courier: "sameday",
          courierLabel: addrLabel(zone.label, "Livrare prin Sameday"),
          deliveryType: "address",
          price: zone.price,
        });
        // Offer locker option only if API is configured (lockers need API)
        if (hasApi) {
          options.push({
            courier: "sameday",
            courierLabel: lockerLabel(zone.label, "Sameday EasyBox (locker)"),
            deliveryType: "locker",
            price: zone.price,
          });
        }
      }
    } else if (courierId === "fan-courier") {
      const fanConfig = settings.fan_courier_config as FanCourierConfig | null;
      const hasApi = !!(fanConfig?.enabled && fanConfig.username && fanConfig.client_id);
      const codAmount = destination.cod ?? 0;
      // FANbox hard limit is 30 kg — don't offer the locker option beyond it.
      const fanboxAllowed = hasApi && weight <= 30;

      if (hasApi && useAutoPrice) {
        // Address and FANbox are different FAN services with different tariffs,
        // so each option gets its own estimate (COD maps to the Cont Colector
        // variant of each — that is also what the AWB will be created with).
        promises.push(
          estimateFanCourierCost(fanConfig!, {
            recipientCounty: destination.county,
            recipientLocality: destination.city,
            weightKg: weight,
            service: codAmount > 0 ? "Cont Colector" : "Standard",
          })
            .then((r) => {
              options.push({
                courier: "fan-courier",
                courierLabel: addrLabel(zone.label, "Livrare prin FAN Courier"),
                deliveryType: "address",
                price: Math.round(r.total * 100) / 100,
              });
            })
            .catch((err) => {
              console.error("[shipping] FanCourier estimate failed:", err.message);
              options.push({
                courier: "fan-courier",
                courierLabel: addrLabel(zone.label, "Livrare prin FAN Courier"),
                deliveryType: "address",
                price: zone.price,
              });
            }),
        );
        if (fanboxAllowed) {
          promises.push(
            estimateFanCourierCost(fanConfig!, {
              recipientCounty: destination.county,
              recipientLocality: destination.city,
              weightKg: weight,
              service: codAmount > 0 ? "FANbox Cont Colector" : "FANbox",
            })
              .then((r) => {
                options.push({
                  courier: "fan-courier",
                  courierLabel: lockerLabel(zone.label, "FAN Courier FANbox (locker)"),
                  deliveryType: "locker",
                  price: Math.round(r.total * 100) / 100,
                });
              })
              .catch((err) => {
                console.error("[shipping] FanCourier FANbox estimate failed:", err.message);
                options.push({
                  courier: "fan-courier",
                  courierLabel: lockerLabel(zone.label, "FAN Courier FANbox (locker)"),
                  deliveryType: "locker",
                  price: zone.price,
                });
              }),
          );
        }
      } else {
        options.push({
          courier: "fan-courier",
          courierLabel: addrLabel(zone.label, "Livrare prin FAN Courier"),
          deliveryType: "address",
          price: zone.price,
        });
        if (fanboxAllowed) {
          options.push({
            courier: "fan-courier",
            courierLabel: lockerLabel(zone.label, "FAN Courier FANbox (locker)"),
            deliveryType: "locker",
            price: zone.price,
          });
        }
      }
    } else if (courierId === "pickup") {
      options.push({
        courier: "pickup",
        courierLabel: zone.label || "Ridicare personala",
        deliveryType: "address",
        price: 0,
      });
    } else if (courierId === "woot") {
      const wootConfig = settings.woot_config as WootConfig | null;
      const hasApi = !!(wootConfig?.enabled && wootConfig.public_key && wootConfig.secret_key && wootConfig.sender?.city_id);
      const flat = (): ShippingOption => ({
        courier: "woot",
        courierLabel: zone.label || COURIER_LABELS.woot,
        deliveryType: "address",
        price: zone.price,
      });

      if (hasApi && useAutoPrice) {
        // Woot is a broker: fetch the live courier offers so the customer picks one.
        promises.push(
          buildWootOptions(wootConfig!, destination, weight, zone.label)
            .then((wootOpts) => {
              if (wootOpts.length > 0) options.push(...wootOpts);
              else options.push(flat()); // locality not matched / no offers
            })
            .catch((err) => {
              console.error("[shipping] Woot estimate failed:", err.message);
              options.push(flat());
            }),
        );
      } else {
        options.push(flat());
      }
    } else if (courierId === "dpd") {
      const dpdCfg = settings.dpd_config as DpdConfig | null;
      const hasApi = !!(dpdCfg?.enabled && dpdCfg.username && dpdCfg.client_id);
      const pushBoth = (price: number) => {
        options.push({
          courier: "dpd",
          courierLabel: addrLabel(zone.label, "Livrare prin DPD"),
          deliveryType: "address",
          price,
        });
        if (hasApi) {
          options.push({
            courier: "dpd",
            courierLabel: lockerLabel(zone.label, "DPD punct de ridicare (locker)"),
            deliveryType: "locker",
            price,
          });
        }
      };

      if (hasApi && useAutoPrice) {
        // Live quote with the COD premium baked in when the order is ramburs.
        promises.push(
          calculateDpdDomesticPrice(dpdCfg!, {
            city: destination.city,
            county: destination.county,
            weightKg: weight,
            cod: destination.cod,
          })
            .then((q) => pushBoth(q ? q.price : zone.price))
            .catch((err) => {
              console.error("[shipping] DPD estimate failed:", err.message);
              pushBoth(zone.price);
            }),
        );
      } else {
        pushBoth(zone.price);
      }
    } else if (courierId === "cargus") {
      const cargusCfg = settings.cargus_config as CargusConfig | null;
      const hasApi = !!(cargusCfg?.enabled && cargusCfg.username && cargusCfg.subscription_key && cargusCfg.location_id);
      const pushBoth = (price: number) => {
        options.push({
          courier: "cargus",
          courierLabel: addrLabel(zone.label, "Livrare prin Cargus"),
          deliveryType: "address",
          price,
        });
        if (hasApi) {
          options.push({
            courier: "cargus",
            courierLabel: lockerLabel(zone.label, "Cargus Ship & Go (punct)"),
            deliveryType: "locker",
            price,
          });
        }
      };

      if (hasApi && useAutoPrice) {
        // Live quote with the COD fee baked in when the order is ramburs.
        promises.push(
          calculateCargusPrice(cargusCfg!, {
            county: destination.county,
            city: destination.city,
            weightKg: weight,
            cod: destination.cod,
          })
            .then((q) => pushBoth(q ? q.price : zone.price))
            .catch((err) => {
              console.error("[shipping] Cargus estimate failed:", err.message);
              pushBoth(zone.price);
            }),
        );
      } else {
        pushBoth(zone.price);
      }
    } else if (courierId === "colete") {
      const coConfig = settings.colete_config as COConfig | null;
      const hasApi = !!(coConfig?.enabled && coConfig.client_id && coConfig.client_secret && coConfig.sender?.city);
      const flat = (): ShippingOption => ({
        courier: "colete",
        courierLabel: zone.label || COURIER_LABELS.colete,
        deliveryType: "address",
        price: zone.price,
      });

      if (hasApi && useAutoPrice) {
        // Colete Online is a broker: fetch the live courier offers so the customer picks one.
        promises.push(
          buildColeteOptions(coConfig!, destination, weight, zone.label)
            .then((coOpts) => {
              if (coOpts.length > 0) options.push(...coOpts);
              else options.push(flat());
            })
            .catch((err) => {
              console.error("[shipping] Colete Online estimate failed:", err.message);
              options.push(flat());
            }),
        );
      } else {
        options.push(flat());
      }
    } else if (courierId === "ecolet") {
      const ecoletCfg = settings.ecolet_config as EcoletConfig | null;
      /*
       * ⚠ `hasApi` cere si `expeditor.locality_id`: fara el corpul cererii e
       * incomplet, `reload-form` respinge TOT lotul, ramura cade pe `flat()` prin
       * `catch` — iar comerciantul vede un pret si crede ca „merge". Aceeasi
       * capcana ca la Woot, unde conditia cere `sender.city_id`.
       */
      const hasApi = !!(
        ecoletCfg?.enabled && ecoletCfg.api_token && Number(ecoletCfg.expeditor?.locality_id) > 0
      );
      const flat = (): ShippingOption => ({
        courier: "ecolet",
        courierLabel: zone.label || COURIER_LABELS.ecolet,
        deliveryType: "address",
        price: zone.price,
      });

      if (hasApi && useAutoPrice) {
        /* Broker: se aduc ofertele vii, ca sa aleaga cumparatorul. */
        promises.push(
          buildEcoletOptions(ecoletCfg!, destination, weight, zone.label)
            .then((opts) => {
              if (opts.length > 0) options.push(...opts);
              else options.push(flat()); // localitate nepotrivita / zero oferte
            })
            .catch((err) => {
              console.error("[shipping] eColet estimate failed:", (err as Error).message);
              options.push(flat());
            }),
        );
      } else {
        options.push(flat());
      }
    } else if (courierId === "gls") {
      /*
       * ⚠ GLS NU COTEAZA. MyGLS n-are metoda de tarif, deci pretul e cel din
       * `shipping_zones` si nu se cheama nimeni — de aia ramura asta e SINCRONA,
       * fara nimic impins in `promises`.
       *
       * ⚠ Si nu face `return`: optiunile trebuie doar impinse in `options`, ca sa
       * ajunga la semnarea unica de la sfarsitul functiei. O ramura care iese
       * singura a mai plecat o data fara simbol, iar comenzile au cazut atunci pe
       * transportul implicit in loc de cel cotat.
       */
      options.push({
        courier: "gls",
        courierLabel: addrLabel(zone.label, "Livrare prin GLS"),
        deliveryType: "address",
        price: zone.price,
      });

      /*
       * Livrarea la punct se ofera doar daca GLS e chiar conectat.
       *
       * Lista de puncte vine dintr-un fisier public, deci s-ar putea arata si
       * fara datele de acces — dar atunci comerciantul n-ar avea cu ce emite
       * AWB-ul, iar `parcelShopId` ales de client n-ar avea unde sa ajunga.
       * Aceeasi regula de „configurat" ca in panoul comenzii.
       */
      const glsCfg = settings.gls_config as GlsConfig | null;
      if (glsCfg?.enabled && glsCfg.username && glsCfg.client_number) {
        options.push({
          courier: "gls",
          courierLabel: lockerLabel(zone.label, "GLS ParcelShop (punct)"),
          deliveryType: "locker",
          price: zone.price,
        });
      }
    } else if (courierId === "pallex") {
      /*
       * ⚠ PALL-EX NU COTEAZA, si nici n-ar avea cum.
       *
       * API-ul ClientPlus (OpenAPI 1.0.5) n-are nicio metoda de tarif: cele noua
       * endpointuri sunt partide, borderouri, documente si statusuri. Pretul vine
       * dintr-un contract negociat pe volum, nu dintr-o grila publica — de aia
       * ramura asta e SINCRONA, fara nimic impins in `promises`, si de aia
       * `pallex` e in `FARA_API_DE_TARIF`.
       *
       * ⚠ Si nu face `return`: optiunile trebuie doar impinse in `options`, ca sa
       * ajunga la semnarea unica de la sfarsitul functiei. O ramura care iese
       * singura a mai plecat o data fara simbol, iar comenzile au cazut atunci pe
       * transportul implicit in loc de cel cotat.
       *
       * ⚠ NUMAI livrare la adresa. Pall-Ex duce paleti, nu colete: nu are lockere,
       * nu are puncte de ridicare, si de aceea nu apare in `CURIERI_CU_LOCKERE`.
       */
      options.push({
        courier: "pallex",
        courierLabel: addrLabel(zone.label, "Livrare paletizata Pall-Ex"),
        deliveryType: "address",
        price: zone.price,
      });
    } else if (courierId === "posta") {
      /*
       * ⚠ POSTA NU COTEAZA, si nici n-ar avea de unde.
       *
       * API-ul lor are sapte metode si niciuna nu e de tarif: preturile postale
       * vin din contract. De aia ramura asta e SINCRONA, fara nimic impins in
       * `promises`, si de aia `posta` e in `FARA_API_DE_TARIF`.
       *
       * ⚠ Si nu face `return`: optiunile trebuie doar impinse in `options`, ca sa
       * ajunga la semnarea unica de la sfarsitul functiei. O ramura care iese
       * singura a mai plecat o data fara simbol, iar comenzile au cazut atunci pe
       * transportul implicit in loc de cel cotat.
       */
      options.push({
        courier: "posta",
        courierLabel: addrLabel(zone.label, "Livrare prin Poșta Română"),
        deliveryType: "address",
        price: zone.price,
      });

      /*
       * ⚠ POST-RESTANT: livrarea la oficiu, de unde o ridica destinatarul.
       *
       * E primul transportator la care „ridicarea dintr-un punct" nu e o retea de
       * lockere, ci un SERVICIU al AWB-ului (`postRestant` + `idOficiuPR`). Pentru
       * checkout arata la fel, deci merge pe acelasi drum ca lockerele: alegerea
       * ajunge in `shipping_address.locker_id` si de acolo in `idOficiuPR`.
       *
       * Se ofera doar daca Posta e chiar conectata SI comerciantul a pornit-o:
       * lista de oficii se cere cu credentialele lui, iar fara ele n-ar avea nici
       * ce arata, nici cu ce emite AWB-ul mai tarziu.
       */
      const postaCfg = settings.posta_config as PostaConfig | null;
      if (postaGata(postaCfg) && postaCfg.post_restant) {
        options.push({
          courier: "posta",
          courierLabel: lockerLabel(zone.label, "Ridicare de la oficiu poștal"),
          deliveryType: "locker",
          price: zone.price,
        });
      }
    } else if (courierId === "packeta") {
      /*
       * ⚠ PACKETA NU COTEAZA, si nici n-ar avea cum.
       *
       * Lista lor de metode e completa (24) si n-are niciuna de tarif: preturile
       * vin din contract. De aia ramura e SINCRONA, fara nimic in `promises`, si
       * de aia `packeta` e in `FARA_API_DE_TARIF`.
       *
       * ⚠ Si nu face `return`: optiunile se impling doar in `options`, ca sa ajunga
       * la semnarea unica de la sfarsitul functiei.
       */
      const packetaCfg = settings.packeta_config as PacketaConfig | null;

      /*
       * ⚠ LIVRAREA LA ADRESA se ofera doar daca exista macar un curier ALES de
       * comerciant.
       *
       * La Packeta livrarea la adresa nu e un serviciu al ei, ci revanzarea unui
       * curier local (in Romania: Cargus, FAN, DPD, Sameday), iar `addressId`
       * trebuie sa fie id-ul ACELUI curier. Fara unul ales in panou n-am avea ce
       * pune acolo, deci optiunea ar fi o promisiune pe care emiterea n-o poate
       * tine.
       */
      if (packetaGata(packetaCfg) && (packetaCfg.curieri_permisi ?? []).length > 0) {
        options.push({
          courier: "packeta",
          courierLabel: addrLabel(zone.label, "Livrare la adresa prin Packeta"),
          deliveryType: "address",
          price: zone.price,
        });
      }

      /*
       * ⚠ PUNCTELE sunt esenta serviciului Packeta, nu un caz marginal — de aia
       * apare in `CURIERI_CU_LOCKERE`.
       *
       * Punctul ales ajunge in `shipping_address.locker_id` si de acolo direct in
       * `addressId` la emitere: la Packeta un punct, un automat si un curier sunt
       * toate id-uri din ACELASI spatiu.
       */
      if (packetaGata(packetaCfg) && (packetaCfg.foloseste_puncte !== false || packetaCfg.foloseste_automate !== false)) {
        options.push({
          courier: "packeta",
          courierLabel: lockerLabel(zone.label, "Ridicare din punct Packeta"),
          deliveryType: "locker",
          price: zone.price,
        });
      }
    } else if (courierId === "innoship") {
      /*
       * ⚠ INNOSHIP E BROKER, SI COTEAZA CU ADEVARAT.
       *
       * `POST /api/Price` intoarce cate o oferta pentru fiecare curier al
       * contului, cu pret, TVA si termen — deci ramura asta e ASINCRONA, ca la
       * Woot, Colete si eColet, si intra in `promises`.
       *
       * ⚠ Si primeste EXACT acelasi corp ca emiterea. Un al doilea constructor
       * ar fi insemnat ca pretul cotat si cel facturat se pot departa fara ca
       * nimic sa se planga — vezi `corpComanda` din lib/innoship/expediere.ts.
       */
      const innoCfg = settings.innoship_config as InnoshipConfig | null;
      const flat = (): ShippingOption => ({
        courier: "innoship",
        courierLabel: zone.label || COURIER_LABELS.innoship,
        deliveryType: "address",
        price: zone.price,
      });

      if (innoshipGata(innoCfg) && useAutoPrice) {
        promises.push(
          buildInnoshipOptions(innoCfg, destination, weight, esteRamburs ? (destination.cod ?? 0) : 0, zone.label)
            .then((opts) => {
              if (opts.length > 0) options.push(...opts);
              /* Zero oferte inseamna destinatie neacoperita, nu defect: cade pe
                 tariful fix, ca la ceilalti brokeri. */
              else options.push(flat());
            })
            .catch((err) => {
              console.error("[shipping] Innoship estimate failed:", (err as Error).message);
              options.push(flat());
            }),
        );
      } else {
        options.push(flat());
      }

      /*
       * ⚠ Lockerele si PUDO se ofera separat, la tarif fix.
       *
       * Nu se coteaza live: pretul unui locker depinde de PUNCTUL ales, iar
       * punctul se alege DUPA ce cumparatorul a ales optiunea. O cotare facuta
       * inainte ar fi pe alt serviciu (`serviceId` 3 sau 4, nu 1) si deci pe alt
       * pret decat cel incasat.
       */
      if (innoshipGata(innoCfg)) {
        options.push({
          courier: "innoship",
          courierLabel: lockerLabel(zone.label, "Ridicare din locker sau punct"),
          deliveryType: "locker",
          price: zone.price,
        });
      }
    } else if (courierId === "smartship") {
      /*
       * ⚠ SMARTSHIP E BROKER SI COTEAZA CU ADEVARAT.
       *
       * `POST /cost` intoarce cate o linie pentru fiecare curier care poate duce
       * coletul, cu pret CU TVA si data estimata de livrare — deci ramura asta e
       * ASINCRONA, ca la Woot, Colete, eColet si Innoship.
       *
       * ⚠ Si primeste EXACT aceleasi trei obiecte ca emiterea. Un al doilea
       * constructor ar fi insemnat ca pretul cotat si cel facturat se pot departa
       * fara ca nimic sa se planga — vezi `corpCotare`/`corpEmitere`.
       */
      const ssCfg = settings.smartship_config as SmartshipConfig | null;
      const flat = (): ShippingOption => ({
        courier: "smartship",
        courierLabel: zone.label || COURIER_LABELS.smartship,
        deliveryType: "address",
        price: zone.price,
      });

      if (smartshipGata(ssCfg) && useAutoPrice) {
        promises.push(
          buildSmartshipOptions(ssCfg, destination, weight, esteRamburs ? (destination.cod ?? 0) : 0, zone.label, businessId)
            .then((opts) => {
              if (opts.length > 0) options.push(...opts);
              /* Zero oferte inseamna destinatie neacoperita sau localitate
                 nerecunoscuta, nu defect: cade pe tariful fix, ca la ceilalti brokeri. */
              else options.push(flat());
            })
            .catch((err) => {
              console.error("[shipping] SmartShip estimate failed:", (err as Error).message);
              options.push(flat());
            }),
        );
      } else {
        options.push(flat());
      }

      /*
       * ⚠ LOCKERELE NU SE POT COTA LIVE, si nu din lene.
       *
       * Documentatia lor e limpede: „Fara locker_id, easybox nu apare la estimare
       * si nu se poate emite", iar `curier_preferat: 12` fara locker cade cu 612.
       * Lockerul se alege insa DUPA ce cumparatorul alege optiunea — deci in clipa
       * cotarii nu exista ce trimite.
       *
       * Aceeasi hotarare ca la Innoship, si acelasi pret platit: pretul lockerului
       * e cel fix din `shipping_zones`. Alternativa ar fi fost sa cotam cu un
       * locker ales de noi si sa incasam apoi altul — adica un pret care nu
       * corespunde expedierii.
       */
      if (smartshipGata(ssCfg) && ssCfg.foloseste_easybox) {
        options.push({
          courier: "smartship",
          courierLabel: lockerLabel(zone.label, "Sameday Easybox prin SmartShip"),
          deliveryType: "locker",
          price: zone.price,
          smartshipCourierId: 12,
          smartshipLockerNet: "easybox",
        });
      }

      /*
       * ⚠ FANbox merge NUMAI pe contract propriu: documentatia il leaga de
       * `courier_id: 3` (FanCourier) IMPREUNA cu `use_own_contract: 1`. Oferit
       * fara contract propriu, ar fi o optiune pe care emiterea n-o poate onora.
       */
      if (smartshipGata(ssCfg) && ssCfg.foloseste_fanbox && ssCfg.contract_propriu) {
        options.push({
          courier: "smartship",
          courierLabel: lockerLabel(zone.label, "FAN Courier FANbox prin SmartShip"),
          deliveryType: "locker",
          price: zone.price,
          smartshipCourierId: 3,
          smartshipOwnContract: true,
          smartshipLockerNet: "fanbox",
        });
      }
    } else if (courierId === "shipo") {
      /*
       * ⚠ SHIPO E BROKER SI COTEAZA CU ADEVARAT — INCLUSIV LOCKERELE.
       *
       * Asta e deosebirea fata de SmartShip si Innoship, unde punctele de ridicare
       * nu se pot cota si primesc tariful fix: la Shipo un serviciu de locker are
       * `rate_id`-ul lui si apare in `POST /rates` cu pret, ca oricare altul.
       * Punctul se alege abia dupa aceea, din `/points?rate_id=`, iar pretul NU
       * depinde de care punct — deci cotarea e cinstita.
       *
       * Prin urmare ramura de aici produce si optiunile la adresa, si pe cele in
       * locker, dintr-un singur apel. Nu exista un al doilea bloc, ca la SmartShip.
       */
      const shCfg = settings.shipo_config as ShipoConfig | null;
      const flat = (): ShippingOption => ({
        courier: "shipo",
        courierLabel: zone.label || COURIER_LABELS.shipo,
        deliveryType: "address",
        price: zone.price,
      });

      if (shipoGata(shCfg) && useAutoPrice) {
        promises.push(
          buildShipoOptions(shCfg, destination, weight, esteRamburs ? (destination.cod ?? 0) : 0, zone.label, businessId)
            .then((opts) => {
              if (opts.length > 0) options.push(...opts);
              /* Zero oferte inseamna destinatie neacoperita, nu defect: cade pe
                 tariful fix, ca la ceilalti brokeri. */
              else options.push(flat());
            })
            .catch((err) => {
              console.error("[shipping] Shipo estimate failed:", (err as Error).message);
              options.push(flat());
            }),
        );
      } else {
        options.push(flat());
      }
    } else if (courierId === "fedex") {
      /*
       * ⚠ SINGURA RAMURA CARE POATE SA NU PRODUCA NIMIC — SI E INTENTIONAT.
       *
       * FedEx nu are ramburs: retras de ei la 31.07.2023 peste tot in afara de
       * FedEx Ground in/spre Canada. La toti ceilalti treisprezece curieri, cand
       * cotarea nu iese, se cade pe tariful fix — aici NU se poate: o optiune FedEx
       * la tarif fix pe o comanda cu plata la livrare ar fi aleasa de cumparator, ar
       * bloca comanda in checkout ca „livrata prin FedEx", iar comerciantul ar
       * descoperi abia la emitere ca AWB-ul nu se poate face DELOC. Marfa n-ar pleca
       * si nimeni n-ar sti de ce.
       *
       * Deci pe ramburs FedEx dispare din lista, curat. Restul curierilor raman.
       */
      if (esteRamburs) continue;

      const fxCfg = settings.fedex_config as FedexConfig | null;
      const flat = (): ShippingOption => ({
        courier: "fedex",
        courierLabel: zone.label || COURIER_LABELS.fedex,
        deliveryType: "address",
        price: zone.price,
      });

      if (fedexGata(fxCfg) && useAutoPrice) {
        promises.push(
          buildFedexOptions(fxCfg, destination, weight, zone.label, businessId)
            .then((opts) => {
              if (opts.length > 0) options.push(...opts);
              /* Zero oferte inseamna destinatie neacoperita, nu defect: cade pe
                 tariful fix, ca la ceilalti. */
              else options.push(flat());
            })
            .catch((err) => {
              console.error("[shipping] FedEx estimate failed:", (err as Error).message);
              options.push(flat());
            }),
        );
      } else {
        options.push(flat());
      }
    } else if (courierId === "ups") {
      const upsCfg = settings.ups_config as UpsConfig | null;

      /*
       * ⚠ UPS ARE RAMBURS — spre deosebire de FedEx. Dar cu o conditie pe care API-ul
       * nu o poate verifica: contul trebuie sa fie de tip „Daily Pickup" sau „Drop
       * Shipping" (verbatim din schema lor). Tipul contului nu se poate citi de
       * nicaieri, deci comerciantul are un comutator, iar proba de conexiune il si
       * verifica printr-o cotare cu ramburs.
       *
       * Cand comerciantul l-a stins, UPS DISPARE din checkout pe comenzile cu plata la
       * livrare — nu cade pe tariful fix. Acelasi rationament ca la FedEx: o optiune la
       * tarif fix ar fi aleasa de cumparator si ar bloca o comanda pe care comerciantul
       * n-o poate expedia deloc.
       */
      if (esteRamburs && upsCfg?.ramburs_activ === false) continue;

      const flat = (): ShippingOption => ({
        courier: "ups",
        courierLabel: zone.label || COURIER_LABELS.ups,
        deliveryType: "address",
        price: zone.price,
      });

      if (upsGata(upsCfg) && useAutoPrice) {
        promises.push(
          buildUpsOptions(upsCfg, destination, weight, esteRamburs ? (destination.cod ?? 0) : 0, zone.label, businessId)
            .then((opts) => {
              if (opts.length > 0) options.push(...opts);
              /* Zero oferte inseamna destinatie neacoperita, nu defect: cade pe
                 tariful fix, ca la ceilalti. */
              else options.push(flat());
            })
            .catch((err) => {
              console.error("[shipping] UPS estimate failed:", (err as Error).message);
              options.push(flat());
            }),
        );
      } else {
        options.push(flat());
      }

      /*
       * ⚠ PUNCTELE UPS ACCESS POINT NU SE COTEAZA SEPARAT, si asta e o hotarare.
       *
       * S-ar putea: `Rating` accepta `ShipmentIndicationType` + `AlternateDeliveryAddress`.
       * Dar ca sa coteze corect ai nevoie de ADRESA punctului, iar punctul se alege abia
       * dupa ce cumparatorul vede pretul — deci ordinea e inversa. Iar `AlternateDeliveryAddress`
       * din `Rating` **nu are `UPSAccessPointID`** (cautat: campul exista doar in `Shipping`),
       * deci nici macar nu se poate cota un punct anume.
       *
       * Alternativa ar fi fost sa cotam cu adresa cumparatorului si sa aratam acel pret
       * pentru livrarea in punct — adica un pret care poate sa nu fie al serviciului
       * livrat. Se ofera deci la tariful fix din `shipping_zones`, ca la SmartShip si
       * Innoship, si scrie de ce in pagina de configurare.
       */
      if (upsGata(upsCfg) && upsCfg.puncte_activate) {
        options.push({
          courier: "ups",
          courierLabel: lockerLabel(zone.label, "UPS Access Point"),
          deliveryType: "locker",
          price: zone.price,
        });
      }
    } else if (courierId === "dhl") {
      /*
       * ⚠⚠ A DOUA RAMURA DIN FISIER CARE POATE SA NU PRODUCA NIMIC, dupa FedEx — si aici
       * motivul e mai apasat.
       *
       * DHL EXPRESS NU VINDE RAMBURS DIN ROMANIA. Patru dovezi, toate cautate anume, toate
       * negative: `KB` („Cash On Delivery") exista in nomenclatorul lor GLOBAL de servicii,
       * dar (1) nu apare in catalogul comercial DHL Express Romania — 24 de servicii
       * enumerate, „cash" si „ramburs" zero aparitii; (2) nu apare in ghidul lor de tarife
       * 2026, nici in editia romaneasca, nici in cea engleza; (3) nu l-a intors sonda lor de
       * capabilitate pe niciuna dintre cele sase rute cu origine RO; (4) nu apare pe paginile
       * de tara ale celor 40 de piete verificate. Trimis totusi, nu cade la cotare — cade la
       * EMITERE, cu `7008`, adica dupa ce cumparatorul a comandat si a asteptat.
       *
       * De aceea nu exista `ramburs_activ` in configurarea DHL, asa cum exista la UPS: n-ar
       * fi un comutator, ar fi o capcana cu doua pozitii gresite.
       *
       * ⚠ SI DE ACEEA NU SE CADE PE TARIFUL FIX. O optiune DHL la tarif fix pe o comanda cu
       * plata la livrare ar fi ALEASA de cumparator (tariful fix e adesea cel mai mic din
       * lista), comanda s-ar bloca in checkout ca „livrata prin DHL", iar comerciantul ar afla
       * abia la emitere ca AWB-ul nu se poate face DELOC. Si n-ar avea nici cum sa repare din
       * mers: DHL e singurul curier din cei saisprezece care NU are anulare de expediere.
       *
       * Deci pe ramburs DHL dispare din lista, curat. Ceilalti curieri raman.
       */
      if (esteRamburs) continue;

      const dhlCfg = settings.dhl_config as DhlConfig | null;

      const flat = (): ShippingOption => ({
        courier: "dhl",
        courierLabel: zone.label || COURIER_LABELS.dhl,
        deliveryType: "address",
        price: zone.price,
      });

      if (dhlGata(dhlCfg) && useAutoPrice) {
        promises.push(
          buildDhlOptions(dhlCfg, destination, weight, valoareMarfii, zone.label, businessId)
            .then((opts) => {
              if (opts.length > 0) options.push(...opts);
              /* Zero oferte inseamna destinatie neacoperita sau adresa fara cod postal, nu
                 defect: cade pe tariful fix, ca la ceilalti. */
              else options.push(flat());
            })
            .catch((err) => {
              console.error("[shipping] DHL estimate failed:", (err as Error).message);
              options.push(flat());
            }),
        );
      } else {
        options.push(flat());
      }

      /*
       * ⚠ AICI NU URMEAZA NICIO OPTIUNE DE LIVRARE IN PUNCT, spre deosebire de UPS, si nu
       * s-a uitat nimeni: DHL n-are ramura nici in `getLockers`, nici in `CURIERI_CU_LOCKERE`.
       *
       * `GET /servicepoints` chiar exista si ar putea umple o harta. Dar livrarea LA punct se
       * cere prin `onDemandDelivery`, care vrea `buyerDetails` si un `servicePointId` pe care
       * DHL il da doar dupa „contact your local DHL Express Account Manager" — deci am fi
       * aratat cumparatorului puncte pe care emiterea nu le poate folosi, iar acoperirea lor
       * pentru Romania nu se poate verifica din niciun document public. O optiune care se
       * alege si nu se poate livra costa o comanda; una care lipseste nu costa nimic.
       *
       * Scrie asta si in pagina de configurare a DHL, ca omul sa nu caute comutatorul.
       */
    } else {
      // Generic courier (own) — flat price
      options.push({
        courier: courierId,
        courierLabel: zone.label || COURIER_LABELS[courierId] || courierId,
        deliveryType: "address",
        price: zone.price,
      });
    }
  }

  await Promise.all(promises);

  if (options.length === 0) return [];

  // Conditional shipping rules: post-process the base options (surcharge/free/hide on
  // any courier; flat price only on fixed-price couriers — own/pickup or "Pret fix").
  // No-op when the store has no rules, so output is byte-identical to before.
  let finalOptions = options;
  if (rules.length > 0) {
    const flatCourierIds = new Set<string>();
    for (const [courierId, zone] of enabledZones) {
      if (FARA_API_DE_TARIF.has(courierId) || zone.auto_price === false) {
        flatCourierIds.add(courierId);
      }
    }
    const ctx: ShippingCartContext = {
      /*
       * ATENTIE: valoarea asta RAMANE un numar trimis de browser, si pretul care
       * iese din ea pleaca SEMNAT. Nu e reparata aici, doar ingradita.
       *
       * Ce se inchide: `getShippingOptions(biz, { county:"Cluj", subtotal:5000,
       * cart:[] })` nu mai poate scoate livrare gratuita semnata pentru o comanda
       * de 50 de lei — fara linii declarate nu exista nimic care sa sustina suma,
       * deci suma e zero. Ce RAMANE deschis: cine declara cosul cinstit si umfla
       * doar suma trece in continuare.
       *
       * Inchiderea adevarata inseamna repretuirea cosului din baza chiar aici, si
       * n-am facut-o intr-un singur commit. Nu e urgenta masurata: 0 din 127 de
       * magazine au reguli de transport (2026-08-03), deci ramura asta nu se
       * executa azi la nimeni.
       */
      /*
       * PLAFONAT cu ce sustine catalogul. Valoarea vine tot de la browser (e
       * singura care stie reducerile si preturile de varianta), dar nu mai poate
       * fi UMFLATA: `min(cerut, maxim din catalog)`. Inflatia era atacul —
       * livrare gratuita semnata pentru un cos ieftin. Reducerile doar coboara
       * suma, deci trec neatinse.
       */
      /* Calculul s-a mutat sus, in `valoareMarfii`: aceeasi suma o cere si cotarea DHL,
         iar doua copii ale plafonarii s-ar fi departat la prima schimbare. Valoarea e
         neschimbata. */
      subtotal: valoareMarfii,
      weightKg: cos.weightKg,
      quantity: cos.quantity,
      classIds: cos.classIds,
      categories: cos.categories,
      productIds: cos.productIds,
      county: destination.county,
    };
    finalOptions = applyShippingRules(options, rules, ctx, flatCourierIds);
    if (finalOptions.length === 0) return [];
  }

  // Fiecare optiune pleaca semnata. Tokenul se intoarce cu comanda si e singurul
  // fel in care serverul poate sti ca pretul livrarii chiar a fost cotat de el.
  // Vezi `quote-token.ts`.
  const semnate = semneazaOptiuni(businessId, destination, esteRamburs, finalOptions);

  // Sort: address first, then lockers, by price
  return semnate.sort((a, b) => {
    if (a.deliveryType !== b.deliveryType) return a.deliveryType === "address" ? -1 : 1;
    return a.price - b.price;
  });
}

// ─── Woot live courier offers ────────────────────────────────────────────────

function matchByName<T extends { name: string }>(list: T[], name: string): T | undefined {
  // Diacritics-insensitive: the customer types "București"/"Târgu Mureș", the
  // Woot nomenclature stores plain ASCII names.
  const norm = (s: string) => stripDiacritics(s || "").trim().toLowerCase();
  const n = norm(name);
  if (!n) return undefined;
  const exact = list.find((x) => norm(x.name) === n);
  if (exact) return exact;
  const partial = list.find((x) => norm(x.name).includes(n) || n.includes(norm(x.name)));
  if (partial) return partial;
  // Last resort: fold "Sector X" → Bucuresti for Bucharest lookups.
  const folded = normalizeLocalityName(name).toLowerCase();
  return folded !== n ? list.find((x) => norm(x.name) === folded) : undefined;
}

/**
 * Resolve the destination locality to Woot ids and fetch the live courier offers.
 * Returns one ShippingOption per courier; [] if the locality can't be matched
 * (caller falls back to the flat price). Contact/phone are placeholders — the
 * quote depends only on locality, weight and COD.
 */
/**
 * Ofertele eColet pentru o destinatie.
 *
 * ⚠ Intoarce `[]` — nu arunca — cand localitatea nu se potriveste sau cand eColet
 * n-are niciun serviciu pentru comanda asta. Apelantul cade atunci pe tariful fix
 * din `shipping_zones`: un cumparator nu are voie sa ramana fara nicio optiune de
 * livrare pentru ca noi n-am recunoscut un oras.
 *
 * ⚠ Datele destinatarului sunt substituenti (nume, telefon): cotarea depinde doar
 * de localitate, greutate si ramburs. La fel ca la Woot.
 */
async function buildEcoletOptions(
  config: EcoletConfig,
  destination: { county: string; city: string; cod?: number; postCode?: string },
  weightKg: number,
  customLabel?: string,
): Promise<ShippingOption[]> {
  /*
   * ⚠ „Sector 3" NU exista in nomenclatorul eColet: acolo numele localitatii e
   * „Bucuresti", iar sectorul sta separat, in `municipality`. Trimis ca atare, nu
   * s-ar potrivi niciodata, iar TOATE comenzile din capitala — cea mai mare piata
   * din tara — ar cadea tacut pe tariful fix.
   *
   * `despartaLocalitateaDeCod` stie deja regula asta (o foloseste GLS pentru
   * punctele lui de ridicare) si intoarce judetul capitalei pentru orice forma cu
   * „Bucuresti"; aici ne trebuie doar numele curatat de sector.
   */
  const orasCautat = /sector\s*\d/i.test(destination.city) ? "Bucuresti" : destination.city;
  const localitate = await rezolvaLocalitateEcolet(config, orasCautat, destination.county);
  if (!localitate) return [];

  const e = config.expeditor ?? {};
  const corp = corpEcolet({
    expeditor: {
      nume: e.name ?? "",
      strada: e.street_name ?? "",
      numar: e.street_number ?? "",
      oras: e.locality ?? "",
      judet: e.county ?? "",
      localityId: Number(e.locality_id) || 0,
      codPostal: e.postal_code ?? "",
      telefon: e.phone ?? "",
      email: e.email ?? "",
      persoanaContact: e.contact_person ?? null,
    },
    destinatar: {
      nume: "Client",
      strada: destination.city,
      numar: "1",
      oras: destination.city,
      judet: destination.county,
      localityId: localitate.id,
      /* Codul postal principal al localitatii: la cotare conteaza doar zona. */
      codPostal: destination.postCode || localitate.postal_code || "",
      telefon: "0700000000",
      email: "",
    },
    greutateKg: weightKg,
    ramburs: destination.cod && destination.cod > 0 ? destination.cod : undefined,
    servicii: {
      deschidereLaLivrare: config.deschidere_la_livrare,
      livrareSambata: config.livrare_sambata,
      smsNotificare: config.sms_notificare,
    },
  });

  const [raspuns, catalog] = await Promise.all([coteazaEcolet(config, corp), catalogEcolet(config)]);

  const cereRamburs = !!destination.cod && destination.cod > 0;

  return oferteEcolet(raspuns, catalog, config.servicii_permise)
    /*
     * ⚠ La un broker, rambursul e insusirea SERVICIULUI, nu a platformei — si se
     * poate inchide chiar si pentru o suma prea mare pe un serviciu care altfel il
     * accepta. Aratata la o comanda cu plata la livrare, o oferta fara incasare
     * inseamna ca cumparatorul alege si plateste un transport pe care emiterea il
     * refuza apoi: aceeasi comanda, doua verdicte diferite.
     */
    .filter((o) => !cereRamburs || o.acceptaRamburs)
    .map((o): ShippingOption => ({
    courier: "ecolet",
    /* Cumparatorul vede CURIERUL REAL, nu numele brokerului. */
    courierLabel: addrLabel(customLabel, etichetaEcolet(o)),
    deliveryType: "address",
    price: o.pret,
    ecoletServiceSlug: o.slug,
    ecoletCourierName: o.numeCurier,
    ecoletServiceName: o.numeServiciu,
  }));
}

async function buildWootOptions(
  config: WootConfig,
  destination: { county: string; city: string; cod?: number },
  weightKg: number,
  customLabel?: string,
): Promise<ShippingOption[]> {
  const counties = await fetchWootCounties();
  const county = matchByName(counties, destination.county);
  if (!county) return [];
  const cities = await fetchWootCities(county.id);
  const city = matchByName(cities, destination.city);
  if (!city) return [];

  const token = await getWootToken(config.public_key, config.secret_key);
  const prices = await fetchWootPrices(token, {
    sender: { ...config.sender },
    receiver: {
      company: 0,
      contact: "Client",
      phone: "+40700000000", // Woot documents international format
      country_id: 189,
      city_id: city.id,
      address: destination.city,
    },
    parcels: [{ type: "package", weight: weightKg, length: 30, width: 20, height: 10, content: "Comanda" }],
    repayment: destination.cod && destination.cod > 0 ? destination.cod : undefined,
  });

  return prices
    .filter((p) => p.errors.length === 0)
    // Delivery-to-location services (easybox/points brokered by Woot) need a
    // location the customer picks — the storefront has no picker for them yet,
    // so only door-delivery offers are shown.
    .filter((p) => !p.service_delivery || p.service_delivery === "door")
    .map((p): ShippingOption => ({
      courier: "woot",
      courierLabel: addrLabel(customLabel, p.courier_name),
      deliveryType: "address",
      price: Math.round(p.final_total * 100) / 100,
      wootServiceId: p.service_id,
      wootCourierName: p.courier_name,
      wootServiceName: p.service_name,
    }))
    .sort((a, b) => a.price - b.price);
}

// ─── Innoship live courier offers ────────────────────────────────────────────

/**
 * Ofertele Innoship pentru o destinatie.
 *
 * ⚠ Intoarce `[]` — nu arunca — cand nu iese nicio oferta. Apelantul cade atunci
 * pe tariful fix din `shipping_zones`: un cumparator n-are voie sa ramana fara
 * nicio optiune de livrare fiindca un broker n-a acoperit o localitate.
 *
 * ⚠ Datele destinatarului sunt SUBSTITUENTI (nume, telefon): cotarea depinde doar
 * de destinatie, greutate si ramburs. La fel ca la Woot si eColet. Numele real
 * n-are ce cauta intr-o cerere facuta pentru un vizitator anonim.
 */
async function buildInnoshipOptions(
  config: InnoshipConfig,
  destination: { county: string; city: string; postCode?: string },
  weightKg: number,
  cod: number,
  labelCustom?: string,
): Promise<ShippingOption[]> {
  const corp = corpInnoship(
    {
      destinatar: {
        nume: "Client",
        persoanaContact: "Client",
        strada: "Strada",
        oras: destination.city,
        judet: destination.county,
        codPostal: destination.postCode ?? null,
        /* Numar de forma valida, ca sa treaca validarea lor de camp obligatoriu. */
        telefon: "0700000000",
      },
      greutateKg: weightKg,
      ramburs: cod,
      felLivrare: "domiciliu",
      ziuaExpedierii: ziuaInRomania(),
    },
    config,
  );

  const rates = await coteazaInnoship(config, corp);
  return oferteInnoship(rates, config).map((o) => ({
    courier: "innoship",
    /* Eticheta comerciantului, cand exista, ramane deasupra numelui curierului:
       unii isi vand livrarea sub marca proprie. */
    courierLabel: labelCustom ? `${labelCustom} · ${etichetaInnoship({ carrier: o.courier, service: o.serviciu })}` : etichetaInnoship({ carrier: o.courier, service: o.serviciu }),
    deliveryType: "address" as const,
    price: o.pret,
    estimatedDays: termenInnoship(o),
    innoshipCourierId: o.courierId,
    innoshipServiceId: o.serviceId,
    innoshipOptionId: o.optionId ?? undefined,
    innoshipCourierName: o.courier || undefined,
    innoshipServiceName: o.serviciu || undefined,
  }));
}

// ─── SmartShip live courier offers ───────────────────────────────────────────

/**
 * Ofertele SmartShip pentru o destinatie.
 *
 * ⚠ Intoarce `[]` — nu arunca — cand localitatea nu se potriveste sau cand niciun
 * curier nu poate duce coletul. Apelantul cade atunci pe tariful fix din
 * `shipping_zones`: un cumparator n-are voie sa ramana fara nicio optiune de
 * livrare fiindca noi n-am recunoscut un oras.
 *
 * ⚠ Datele destinatarului sunt SUBSTITUENTI (nume, telefon): cotarea depinde doar
 * de destinatie, greutate si ramburs. Numele are DOUA cuvinte dinadins — e chiar
 * regula lor de validare, si un „Client" singur ar cadea cu 999 pentru fiecare
 * cumparator al magazinului.
 */
async function buildSmartshipOptions(
  config: SmartshipConfig,
  destination: { county: string; city: string; postCode?: string },
  weightKg: number,
  cod: number,
  labelCustom: string | undefined,
  businessId: string,
): Promise<ShippingOption[]> {
  const loc = await rezolvaLocalitateSmartship(config, destination.city, destination.county);
  if (!loc) return [];

  const date = {
    destinatar: {
      nume: "Client Nou",
      strada: "Strada Principala",
      numar: "1",
      oras: destination.city,
      judet: destination.county,
      codPostal: destination.postCode ?? null,
      telefon: "0700000000",
      cityId: loc.cityId,
      sector: loc.sector,
    },
    greutateKg: weightKg,
    ramburs: cod,
    felLivrare: "domiciliu" as const,
    numarColete: 1,
  };

  /*
   * ⚠ Verificarea locala e obligatorie AICI, nu doar la emitere — dar CU cele
   * doua cauze despartite.
   *
   * Configurarea gresita e a MAGAZINULUI si opreste cotarea pentru toata lumea:
   * cazul care doare e o comanda cu ramburs si un IBAN lipsa sau gresit, fiindca
   * SmartShip il valideaza la fiecare cerere — `/cost` raspunde 201, cotarea se
   * pierde in `catch`, si toate comenzile cu plata la livrare primesc tariful fix,
   * tacut. Acolo comerciantul TREBUIE alertat.
   *
   * O adresa incompleta e insa a UNUI cumparator (tipic: „Bucuresti" fara sector).
   * Acolo nu e nimic de reparat in magazin, iar o alerta l-ar invata pe om sa nu
   * se mai uite la alerte. Se cade tacut pe tariful fix, ca la orice localitate
   * nerecunoscuta.
   */
  const lipsuriConfig = lipsuriConfigurareSmartship(config, cod > 0);
  if (lipsuriConfig.length > 0) {
    await alertaPlafonMagazin(
      "getShippingOptions.smartshipConfig",
      businessId,
      `SmartShip nu poate cota: ${lipsuriConfig.join("; ")}. Pana la reparare, livrarea prin SmartShip se ofera la tariful fix.`,
    );
    return [];
  }
  if (lipsuriSmartship(date, config).length > 0) return [];

  const r = await coteazaSmartship(config, corpSmartship(date, config));

  return oferteSmartship(r.costs, config).map((o): ShippingOption => ({
    courier: "smartship",
    /* Eticheta comerciantului, cand exista, ramane deasupra numelui curierului:
       unii isi vand livrarea sub marca proprie. */
    courierLabel: labelCustom ? `${labelCustom} · ${etichetaSmartship(o)}` : etichetaSmartship(o),
    deliveryType: "address",
    price: o.pret,
    estimatedDays: termenSmartship(o),
    smartshipCourierId: o.courierId,
    smartshipCourierName: o.numeCurier || undefined,
    smartshipOwnContract: o.contractPropriu,
  }));
}

/**
 * Ofertele FedEx pentru checkout.
 *
 * ⚠ Foloseste ACELASI constructor de corp ca emiterea (`corpTarife` alimenteaza
 * cotarea, `corpExpediere` emiterea, si amandoua pleaca din aceleasi
 * `DateExpediere`). Un al doilea constructor ar fi insemnat ca pretul cotat si cel
 * facturat se pot departa fara ca nimic sa se planga.
 *
 * ⚠ NU primeste `cod`: ramura din `getShippingOptions` nu ajunge aici cand comanda
 * are ramburs. Parametrul ar fi fost o minciuna comoda — l-am fi trecut mai departe
 * si cineva ar fi crezut candva ca FedEx il poate onora.
 *
 * ⚠ SI POATE INTOARCE GOL DIN CAUZA VALUTEI. Daca contul coteaza in EUR sau USD,
 * `ofertePosibile` arunca toate ofertele — 12 euro scrisi ca 12 lei ar subfactura
 * transportul de cinci ori. Comerciantul e alertat, o singura data, cu ce e de facut.
 */
async function buildFedexOptions(
  config: FedexConfig,
  destination: { county: string; city: string; postCode?: string },
  weightKg: number,
  labelCustom: string | undefined,
  businessId: string,
): Promise<ShippingOption[]> {
  const date = {
    destinatar: {
      nume: "Client Nou",
      strada: "Strada Principala",
      numar: "1",
      oras: destination.city,
      judet: destination.county,
      codPostal: destination.postCode ?? null,
      telefon: "0700000000",
      email: "client@exemplu.ro",
    },
    greutateKg: weightKg,
  };

  /*
   * ⚠ Cele doua cauze de esec sunt DESPARTITE, si nu din eleganta.
   *
   * Configurarea gresita e a MAGAZINULUI si opreste cotarea pentru toata lumea —
   * acolo comerciantul TREBUIE alertat, altfel toti cumparatorii primesc tacut
   * tariful fix in loc de cel real.
   *
   * O adresa incompleta e insa a UNUI cumparator (tipic: cod postal lipsa). Acolo nu
   * e nimic de reparat in magazin, iar o alerta l-ar invata pe om sa nu se mai uite
   * la alerte. Se cade tacut pe tariful fix.
   */
  const lipsuriConfig = lipsuriConfigurareFedex(config);
  if (lipsuriConfig.length > 0) {
    await alertaPlafonMagazin(
      "getShippingOptions.fedexConfig",
      businessId,
      `FedEx nu poate cota: ${lipsuriConfig.join("; ")}. Pana la reparare, livrarea prin FedEx se ofera la tariful fix.`,
    );
    return [];
  }
  /*
   * ⚠ CODUL POSTAL LIPSA NU E VINA CUMPARATORULUI — E O LIPSA A CHECKOUT-ULUI.
   *
   * Pe comenzile interne formularul nici nu arata campul de cod postal (il randeaza
   * DOAR pentru livrari internationale), deci `destination.postCode` e mereu gol in
   * Romania. Iar FedEx il cere: Romania e tara „postal-aware" la ei, cu sablonul
   * `NNNNNN`, si fara el `POST /rate/v1/rates/quotes` raspunde
   * `POSTALCODE.ZIPCODE.REQUIRED`.
   *
   * Prima varianta a functiei trata asta ca pe o adresa incompleta oarecare si cadea
   * TACUT pe tariful fix — adica FedEx n-ar fi cotat niciodata in checkout, iar
   * comerciantul ar fi vazut „conexiunea merge" in configurare si un pret fix in
   * magazin, la nesfarsit, fara nicio urma care sa lege cele doua. Exact clasa
   * „integrare care nu face nimic".
   *
   * ⚠ HOTARARE DE PRODUS, 16.08.2026, luata de client: checkout-ul NU se schimba.
   *
   * Varianta „adauga un camp de cod postal si pe comenzile interne" ar fi facut FedEx
   * sa coteze real in magazin, dar ar fi schimbat formularul de comanda pentru TOTI
   * cumparatorii TUTUROR celor 127 de magazine — pentru un curier pe care il
   * foloseste o mana dintre ele. Nu merita.
   *
   * Deci starea de fata e cea DORITA, nu o scapare: in checkout FedEx apare cu
   * tariful fix din `shipping_zones`, iar cotarea reala si emiterea se fac din pagina
   * comenzii, unde comerciantul poate completa codul postal (OrderEditModal). E fix
   * cum lucreaza GLS azi. Daca vreodata se schimba hotararea, locul de reparat e
   * `CheckoutForm.tsx` + `OrderModal.tsx` (campul si `postCode={...}` catre
   * `CourierSelector`), nu garda de aici.
   *
   * Alerta ramane, si tot ea e jumatatea care conteaza: se ridica o data (e plafonata
   * pe magazin) si spune limpede de ce pretul e fix. Si se iese INAINTE de apel —
   * fara cod postal cererea ar fi refuzata oricum, iar apelul consuma din cota
   * zilnica a contului.
   */
  const lipsuriComanda = lipsuriFedex(config, date).comanda;
  if (lipsuriComanda.length > 0) {
    if (!(destination.postCode ?? "").trim()) {
      await alertaPlafonMagazin(
        "getShippingOptions.fedexCodPostal",
        businessId,
        "FedEx cere codul postal al destinatarului (Romania e tara „postal-aware” la ei), iar checkout-ul "
        + "nu il colecteaza la livrarile interne. Pana atunci FedEx apare in checkout la tariful fix din "
        + "Setari → Livrare, iar AWB-ul se emite din pagina comenzii, dupa ce completezi codul postal.",
      );
    }
    return [];
  }

  const { detalii } = await tarifeFedex(config, corpFedex(config, date));
  const r = oferteFedex(detalii, config, { greutateKg: weightKg });

  /*
   * ⚠ Valuta refuzata e o problema de CONT, nu de adresa — deci se alerteaza.
   *
   * Fara semnalul asta, comerciantul ar vedea „conexiunea merge" in configurare si
   * tariful fix in checkout, la nesfarsit, fara nicio urma care sa lege cele doua.
   */
  if (r.oferte.length === 0 && r.valuteRefuzate.length > 0) {
    await alertaPlafonMagazin(
      "getShippingOptions.fedexValuta",
      businessId,
      `Contul FedEx coteaza in ${r.valuteRefuzate.join(", ")}, iar magazinul lucreaza in lei. `
      + "Nu convertim noi sumele — cere-i reprezentantului FedEx tarife in RON. "
      + "Pana atunci, livrarea prin FedEx se ofera la tariful fix.",
    );
    return [];
  }

  return r.oferte.map((o): ShippingOption => ({
    courier: "fedex",
    /* Eticheta comerciantului, cand exista, ramane deasupra numelui serviciului:
       unii isi vand livrarea sub marca proprie. */
    courierLabel: labelCustom ? `${labelCustom} · ${etichetaFedex(o)}` : etichetaFedex(o),
    deliveryType: "address",
    price: o.pret,
    estimatedDays: o.tranzit ?? undefined,
    fedexServiceType: o.serviceType,
    fedexServiceName: o.serviceName,
  }));
}

/**
 * Ofertele UPS pentru checkout.
 *
 * ⚠ Foloseste ACELASI constructor de corp ca emiterea (`corpTarife` alimenteaza cotarea,
 * `corpExpediere` emiterea, si amandoua pleaca din aceleasi `DateExpediere`). Un al
 * doilea constructor ar fi insemnat ca pretul cotat si cel facturat se pot departa fara
 * ca nimic sa se planga.
 *
 * ⚠ SI PRIMESTE `cod`, spre deosebire de FedEx. Rambursul UPS exista, si intra chiar in
 * cotare (`ShipmentServiceOptions.COD`) — deci pretul aratat cumparatorului il include.
 * Un `cod` netrimis ar fi cotat mai ieftin decat se factureaza.
 *
 * ⚠ SI POATE INTOARCE GOL DIN CAUZA VALUTEI. UPS **nu are niciun camp prin care sa ceri
 * valuta raspunsului** — cautat in tot `Rating.yaml`. Daca contul coteaza in EUR,
 * `ofertePosibile` arunca toate ofertele; 12 euro scrisi ca 12 lei ar subfactura
 * transportul de cinci ori. Comerciantul e alertat, o singura data, cu ce e de facut.
 */
async function buildUpsOptions(
  config: UpsConfig,
  destination: { county: string; city: string; postCode?: string; country?: string },
  weightKg: number,
  cod: number,
  labelCustom: string | undefined,
  businessId: string,
): Promise<ShippingOption[]> {
  const date = {
    destinatar: {
      nume: "Client Nou",
      strada: "Strada Principala",
      numar: "1",
      oras: destination.city,
      judet: destination.county,
      codPostal: destination.postCode ?? null,
      telefon: "0700000000",
      email: "client@exemplu.ro",
      tara: destination.country || "RO",
    },
    greutateKg: weightKg,
    ...(cod > 0 ? { ramburs: cod } : {}),
  };

  /*
   * ⚠ Cele doua cauze de esec sunt DESPARTITE, si nu din eleganta.
   *
   * Configurarea gresita e a MAGAZINULUI si opreste cotarea pentru toata lumea — acolo
   * comerciantul TREBUIE alertat, altfel toti cumparatorii primesc tacut tariful fix in
   * loc de cel real.
   *
   * O adresa incompleta e insa a UNUI cumparator. Acolo nu e nimic de reparat in
   * magazin, iar o alerta l-ar invata pe om sa nu se mai uite la alerte.
   */
  const lipsuriConfig = lipsuriConfigurareUps(config);
  if (lipsuriConfig.length > 0) {
    await alertaPlafonMagazin(
      "getShippingOptions.upsConfig",
      businessId,
      `UPS nu poate cota: ${lipsuriConfig.join("; ")}. Pana la reparare, livrarea prin UPS se ofera la tariful fix.`,
    );
    return [];
  }
  if (lipsuriUps(config, date).comanda.length > 0) return [];

  /*
   * ⚠ „Aceeasi localitate" se verifica INAINTE de apel, si e specific romanesc.
   *
   * Ghidul lor de servicii postale, nota 2: „UPS nu presteaza servicii postale in
   * aceeasi localitate pe teritoriul Romaniei." Nu blocam nimic — autoritatea e cotarea
   * lor — dar daca ea vine goala pe o ruta din acelasi oras, atunci stim de ce, si o
   * spunem in loc sa lasam comerciantul sa caute o zi.
   */
  const aceeasiLocalitate = eAceeasiLocalitate(config, date.destinatar);

  const { oferte, alerte } = await tarifeUps(config, corpUps(config, date));
  const r = oferteUps(oferte, config, {
    greutateKg: weightKg,
    taraExpeditor: config.expeditor?.tara ?? "RO",
    taraDestinatar: date.destinatar.tara,
  }, alerte);

  if (r.oferte.length === 0) {
    if (r.valuteRefuzate.length > 0) {
      await alertaPlafonMagazin(
        "getShippingOptions.upsValuta",
        businessId,
        `Contul UPS coteaza in ${r.valuteRefuzate.join(", ")}, iar magazinul lucreaza in lei. `
        + "UPS nu are niciun camp prin care sa ceri valuta raspunsului, si nu convertim noi sumele — "
        + "cere-i reprezentantului UPS tarife in RON. Pana atunci, livrarea prin UPS se ofera la tariful fix.",
      );
    } else if (aceeasiLocalitate) {
      await alertaPlafonMagazin(
        "getShippingOptions.upsAceeasiLocalitate",
        businessId,
        `${AVERTISMENT_ACEEASI_LOCALITATE} Comenzile din orasul tau primesc tariful fix din Setari → Livrare.`,
      );
    } else if (!(destination.postCode ?? "").trim()) {
      /*
       * ⚠ Codul postal e „optional" in schema lor pentru Romania — dar e singurul semnal
       * de zonare ramas, fiindca `StateProvinceCode` nu se trimite (UPS n-are nomenclator
       * de judete romanesti, iar cotarea cere fix doua caractere).
       *
       * Spre deosebire de FedEx, aici NU se iese inainte de apel: la ei codul postal e
       * documentat obligatoriu pentru Romania, la UPS nu. Se incearca deci cotarea, si
       * abia daca ea vine goala se spune de ce ar putea fi.
       */
      await alertaPlafonMagazin(
        "getShippingOptions.upsCodPostal",
        businessId,
        "UPS n-a intors niciun tarif, iar comenzile interne nu au cod postal — formularul il cere doar la "
        + "livrarile in strainatate. Pana atunci UPS apare in checkout la tariful fix din Setari → Livrare, "
        + "iar AWB-ul se emite din pagina comenzii, dupa ce completezi codul postal.",
      );
    }
    return [];
  }

  /*
   * ⚠ „Doar pret de lista" e o problema de BANI, nu o curiozitate.
   *
   * Fara `NegotiatedRateCharges`, pretul intors e cel public — mai mare decat cel pe
   * care il plateste comerciantul. Cauza e mai des decat s-ar crede chiar lipsa lui
   * `ShipFrom.StateProvinceCode`, pe care UPS il cere pentru tarifele negociate si pe
   * care Romania nu-l are. Se spune, o data.
   */
  if (r.doarPretDeLista) {
    await alertaPlafonMagazin(
      "getShippingOptions.upsListaDePreturi",
      businessId,
      "UPS a cotat la preturile de LISTA, nu la tarifele contractului tau. Verifica in portalul UPS ca "
      + "aplicatia si numarul de cont sunt legate de acelasi contract; daca UPS ti-a dat un cod de judet "
      + "de doua caractere, pune-l in configurare la „Judet”.",
    );
  }

  return r.oferte.map((o): ShippingOption => ({
    courier: "ups",
    /* Eticheta comerciantului, cand exista, ramane deasupra numelui serviciului:
       unii isi vand livrarea sub marca proprie. */
    courierLabel: labelCustom ? `${labelCustom} · ${etichetaUps(o)}` : etichetaUps(o),
    deliveryType: "address",
    price: o.pret,
    estimatedDays: o.tranzit ?? undefined,
    upsServiceCode: o.serviceCode,
    upsServiceName: o.serviceName,
  }));
}

/**
 * Termenul de livrare, in cuvinte.
 *
 * ⚠ DHL da tranzitul ca NUMAR (`deliveryCapabilities.totalTransitDays`), spre deosebire de
 * UPS si FedEx, care il dau deja ca text — deci trebuie formulat aici. Formularea e
 * identica cu cea din `etichetaOferta` (`lib/dhl/preturi.ts`), care nu isi exporta ajutorul
 * privat; daca se schimba acolo, se schimba si aici, altfel acelasi rand din checkout ar
 * arata doua forme, una in eticheta si alta sub ea.
 */
function zileDhl(tranzit: number | null): string | undefined {
  if (tranzit === null || !(tranzit > 0)) return undefined;
  return tranzit === 1 ? "o zi lucratoare" : `${tranzit} zile lucratoare`;
}

/**
 * Ofertele DHL Express pentru checkout.
 *
 * ⚠ Foloseste ACELASI constructor de corp ca emiterea (`corpTarife` alimenteaza cotarea,
 * `corpExpediere` emiterea, si amandoua pleaca din aceleasi `DateExpediere`). Un al doilea
 * constructor ar fi insemnat ca pretul cotat si cel facturat se pot departa fara ca nimic
 * sa se planga.
 *
 * ⚠ NU PRIMESTE `cod`, spre deosebire de UPS, si nu fiindca s-ar fi uitat: ramura de
 * deasupra iese cu `continue` pe orice comanda cu plata la livrare, fiindca DHL Express nu
 * vinde ramburs din Romania. Un parametru de ramburs aici ar fi sugerat ca exista drum.
 *
 * ⚠ SI DUCE MAI DEPARTE DOUA CODURI, nu unul. `productCode` e in `required` la emitere —
 * fara el DHL refuza cererea, spre deosebire de UPS, care fara cod de serviciu factureaza
 * tacit cel mai scump produs. Iar `localProductCode` e cel pe care sta tariful contului si
 * nu se poate compune: se copiaza literal din cotare si calatoreste odata cu primul.
 */
async function buildDhlOptions(
  config: DhlConfig,
  destination: { county: string; city: string; postCode?: string; country?: string },
  weightKg: number,
  /**
   * Valoarea MARFII, plafonata cu ce sustine catalogul (`valoareMarfii` din apelant).
   * Fara ea, cotarea si emiterea trimiteau doua corpuri diferite — vezi comentariul de
   * la `valoareComanda` din obiectul de mai jos.
   */
  valoareMarfa: number,
  labelCustom: string | undefined,
  businessId: string,
): Promise<ShippingOption[]> {
  const date = {
    destinatar: {
      nume: "Client Nou",
      strada: "Strada Principala",
      numar: "1",
      oras: destination.city,
      judet: destination.county,
      codPostal: destination.postCode ?? null,
      /* ⚠ Telefonul de proba NU e decor: la DHL `phone` e in `required` pe
         `contactInformation`, si intern, nu doar pe expedierile externe. Fara el cotarea
         cade cu 422 si DHL ar disparea din checkout pe toate magazinele. */
      telefon: "0700000000",
      email: "client@exemplu.ro",
      tara: destination.country || "RO",
    },
    greutateKg: weightKg,
    /*
     * ⚠ VALOAREA DECLARATA, SI LIPSEA — pretul cotat iesea mai mic decat cel facturat.
     *
     * Obiectul asta n-o purta deloc, deci ramura din `corpTarife` care trimite
     * `monetaryAmount[{ typeCode: "declaredValue" }]` nu se atingea niciodata din
     * checkout, desi comentariul ei spune „valoarea declarata intra in cotare fiindca ea
     * trage suprataxele de valoare si asigurarea". Emiterea (`corpExpediere`) o trimite
     * insa mereu, si odata cu ea serviciul `II` cand comerciantul are asigurarea pornita
     * — pe care DHL il tarifeaza, in propriul lor catalog romanesc, cu „55.00 LEI or 1%
     * of insured value, if higher". CE SE RUPEA: cumparatorul vedea in checkout un pret
     * cu cel putin 55 de lei pe colet sub cel care ajunge pe factura DHL, iar magazinul
     * livra in pierdere pe FIECARE comanda, fara nimic in interfata care sa lege cele
     * doua sume. Cotarea si emiterea pleaca dinadins din acelasi `DateExpediere` tocmai
     * ca sa nu se poata departa.
     *
     * ⚠ E marfa, nu totalul: transportul nu intra in suma pe care o declaram, altfel
     * pretul cotat s-ar hrani din el insusi. Vezi `valoareMarfii` in `getShippingOptions`
     * pentru sursa si pentru plafonare.
     */
    valoareComanda: valoareMarfa,
  };

  /*
   * ⚠ Cele doua cauze de esec sunt DESPARTITE, si nu din eleganta.
   *
   * Configurarea gresita e a MAGAZINULUI si opreste cotarea pentru toata lumea — acolo
   * comerciantul TREBUIE alertat, altfel toti cumparatorii primesc tacut tariful fix in loc
   * de cel real.
   *
   * O adresa incompleta e insa a UNUI cumparator. Acolo nu e nimic de reparat in magazin,
   * iar o alerta l-ar invata pe om sa nu se mai uite la alerte. Singura exceptie e codul
   * postal, mai jos, si are motivul ei.
   */
  const lipsuriConfig = lipsuriConfigurareDhl(config);
  if (lipsuriConfig.length > 0) {
    await alertaPlafonMagazin(
      "getShippingOptions.dhlConfig",
      businessId,
      `DHL nu poate cota: ${lipsuriConfig.join("; ")}. Pana la reparare, livrarea prin DHL se ofera la tariful fix.`,
    );
    return [];
  }

  /*
   * ⚠⚠ CODUL POSTAL, SI E LECTIA FEDEX REPETATA — a doua oara la fel, deci nu e intamplare.
   *
   * DHL cere codul postal al destinatarului si il VERIFICA: nomenclatorul lor
   * `countryPostalcodeFormat` da pentru Romania randul `999999 | 6 | RO | ROMANIA`, iar un
   * cod care nu iese pe format cade cu `420506 Postcode not found`. Checkout-ul Edinio nu-l
   * colecteaza la comenzile interne — formularul randeaza campul DOAR pentru livrarile in
   * strainatate (vezi si memoria `cod-postal-lipsa-in-checkout`) — deci pe comenzile
   * romanesti iesim de aici de fiecare data, si asta e starea NORMALA, nu o scapare.
   *
   * Fara alerta, comerciantul ar vedea „conexiunea merge" in configurarea DHL si un tarif
   * fix in magazin, la nesfarsit, fara nimic care sa lege cele doua — adica exact clasa
   * „integrare care nu face nimic". Se ridica o data pe ora pe magazin si spune ce e de
   * facut si ce merge totusi.
   *
   * ⚠ SI SE IESE INAINTE DE APEL, ca la FedEx si spre deosebire de UPS: la DHL codul postal
   * romanesc e documentat obligatoriu, deci cererea ar fi refuzata oricum si ar consuma
   * degeaba din cota contului. `lipsesteCodulPostal` deosebeste cazul asta de restul
   * lipsurilor tocmai ca alerta sa nu plece si pentru o adresa fara telefon sau fara strada,
   * care chiar sunt ale cumparatorului.
   */
  const l = lipsuriDhl(config, date);
  if (l.comanda.length > 0) {
    if (lipsesteCodulPostalDhl(l)) {
      await alertaPlafonMagazin(
        "getShippingOptions.dhlCodPostal",
        businessId,
        "DHL cere codul postal al destinatarului — sase cifre pentru Romania, si il verifica pe format — "
        + "iar checkout-ul nu il colecteaza la livrarile interne. Pana atunci DHL apare in checkout la "
        + "tariful fix din Setari → Livrare, iar AWB-ul se emite din pagina comenzii, dupa ce completezi "
        + "codul postal.",
      );
    }
    return [];
  }

  const { oferte, avertismente } = await tarifeDhl(config, corpDhl(config, date));
  const r = oferteDhl(oferte, config, {
    greutateKg: weightKg,
    taraExpeditor: config.expeditor?.tara ?? "RO",
    taraDestinatar: date.destinatar.tara,
  }, avertismente);

  if (r.oferte.length === 0) {
    /*
     * ⚠ Valuta refuzata e o problema de CONT, nu de adresa — deci se alerteaza.
     *
     * Un cont DHL care nu factureaza in lei nu se repara din cod si nu se repara cu un curs:
     * 452 de euro scrisi ca 452 de lei ar subfactura transportul de cinci ori. Se rezolva la
     * reprezentantul DHL, iar comerciantul trebuie sa afle ca acolo e drumul.
     */
    if (r.valuteRefuzate.length > 0) {
      await alertaPlafonMagazin(
        "getShippingOptions.dhlValuta",
        businessId,
        `Contul DHL coteaza in ${r.valuteRefuzate.join(", ")}, iar magazinul lucreaza in lei. `
        + "Nu convertim noi sumele — cere-i reprezentantului DHL Express tarife in RON. "
        + "Pana atunci, livrarea prin DHL se ofera la tariful fix.",
      );
    } else {
      /*
       * ⚠ ZERO PRODUSE VINE PE UN HTTP 200, nu pe o eroare, si de aia trebuie spus.
       *
       * Codurile lor `996`/`1001` („The requested product(s) not available based on your
       * search criteria") si `1004` („Product not available between this origin and
       * destination") sosesc toate cu 200 si cu `products: []`. Fara semnalul asta, cotarea
       * „reuseste" de fiecare data si nu se vede nicaieri de ce checkout-ul arata tarif fix.
       *
       * Avertismentele LOR intra in mesaj cand exista: seria `410501`-`410515`
       * („Pickup/Delivery PL fallback rule applied") inseamna ca DHL a ales singur o
       * locatie fiindca adresa noastra era ambigua, si e singura explicatie pe care o da
       * cineva.
       */
      await alertaPlafonMagazin(
        "getShippingOptions.dhlFaraProduse",
        businessId,
        "DHL n-a intors niciun produs pentru destinatia asta"
        + (r.alerte.length > 0 ? `: ${r.alerte.join("; ")}` : " (raspuns 200 cu lista goala)")
        + ". Verifica la reprezentantul DHL ce produse iti da contul pe ruta asta, si ce ai bifat la "
        + "„Produse permise” in configurare. Pana atunci, livrarea prin DHL se ofera la tariful fix.",
      );
    }
    return [];
  }

  /*
   * ⚠ „Cere acord prealabil" e o insusire a PRODUSULUI, nu un raspuns despre contul asta —
   * deci nu poate fi o poarta, dar nici nu poate fi tacuta.
   *
   * DHL le marcheaza cu `isCustomerAgreement: true`, adica „the product only can be offered
   * to customers with prior agreement". Daca acordul lipseste, cotarea trece si EMITEREA
   * cade, cu `8003` („Account not allowed for this service") sau `8036` — adica pierderea e
   * o comanda blocata pe un curier fara anulare de expediere. Merita spus inainte, nu dupa.
   */
  if (r.cerContract.length > 0) {
    await alertaPlafonMagazin(
      "getShippingOptions.dhlAcordPrealabil",
      businessId,
      `DHL a intors produse care cer acord prealabil pe contul tau: ${r.cerContract.join(", ")}. `
      + "Ele se coteaza si se arata in checkout, dar daca acordul lipseste, AWB-ul cade la emitere cu "
      + "8003 sau 8036. Intreaba-ti reprezentantul DHL daca le ai in contract; daca nu, scoate-le din "
      + "„Produse permise” in configurare.",
    );
  }

  return r.oferte.map((o): ShippingOption => ({
    courier: "dhl",
    /* Eticheta comerciantului, cand exista, ramane deasupra numelui produsului:
       unii isi vand livrarea sub marca proprie. */
    courierLabel: labelCustom ? `${labelCustom} · ${etichetaDhl(o)}` : etichetaDhl(o),
    deliveryType: "address",
    price: o.pret,
    estimatedDays: zileDhl(o.tranzit),
    dhlProductCode: o.productCode,
    dhlProductName: o.productName,
    /* ⚠ `null` devine `undefined`, nu sirul „null": campul e optional pe `ShippingOption` si
       calatoreste pana in `shipping_address`, unde un „null" scris ca text ar fi trimis mai
       departe la emitere drept cod local valid. */
    dhlLocalProductCode: o.localProductCode ?? undefined,
  }));
}

/**
 * Ofertele Shipo pentru checkout.
 *
 * ⚠ Foloseste ACELASI constructor de corp ca emiterea (`corpTarife` alimenteaza
 * cotarea, `corpExpediere` emiterea, si amandoua pleaca din aceleasi
 * `DateExpediere`). Un al doilea constructor ar fi insemnat ca pretul cotat si
 * cel facturat se pot departa fara ca nimic sa se planga.
 *
 * ⚠ Se citesc DOUA liste, nu una: tarifele si serviciile. Tipul adresei
 * (`recipient_address_type`) sta doar in a doua, iar fara el n-am sti care oferta
 * e la locker — si un serviciu de locker oferit ca livrare la domiciliu ar cadea
 * la emitere, dupa ce clientul a platit. Vezi `ofertePosibile`.
 */
async function buildShipoOptions(
  config: ShipoConfig,
  destination: { county: string; city: string; postCode?: string },
  weightKg: number,
  cod: number,
  labelCustom: string | undefined,
  businessId: string,
): Promise<ShippingOption[]> {
  const date = {
    destinatar: {
      nume: "Client Nou",
      strada: "Strada Principala",
      numar: "1",
      oras: destination.city,
      judet: destination.county,
      codPostal: destination.postCode ?? null,
      telefon: "0700000000",
      email: "client@exemplu.ro",
    },
    greutateKg: weightKg,
    ramburs: cod,
    felLivrare: "domiciliu" as const,
    numarColete: 1,
  };

  /*
   * ⚠ Cele doua cauze de esec sunt DESPARTITE, si nu din eleganta.
   *
   * Configurarea gresita e a MAGAZINULUI si opreste cotarea pentru toata lumea —
   * acolo comerciantul TREBUIE alertat, altfel toti cumparatorii primesc tacut
   * tariful fix in loc de cel real.
   *
   * O adresa incompleta e insa a UNUI cumparator (tipic: „Bucuresti" fara sector).
   * Acolo nu e nimic de reparat in magazin, iar o alerta l-ar invata pe om sa nu
   * se mai uite la alerte. Se cade tacut pe tariful fix.
   */
  const lipsuriConfig = lipsuriConfigurareShipo(config);
  if (lipsuriConfig.length > 0) {
    await alertaPlafonMagazin(
      "getShippingOptions.shipoConfig",
      businessId,
      `Shipo nu poate cota: ${lipsuriConfig.join("; ")}. Pana la reparare, livrarea prin Shipo se ofera la tariful fix.`,
    );
    return [];
  }
  /* La cotare nu stim inca serviciul, deci se verifica doar ce e comun: adresa. */
  if (lipsuriShipo(date, { recipient_address_type: "address" }).length > 0) return [];

  const [t, s] = await Promise.all([
    tarifeShipo(config, corpShipo(config, date)),
    serviciiShipo(config),
  ]);

  return oferteShipo(t, s, config, { cuRamburs: cod > 0 }).map((o): ShippingOption => ({
    courier: "shipo",
    /* Eticheta comerciantului, cand exista, ramane deasupra numelui curierului:
       unii isi vand livrarea sub marca proprie. */
    courierLabel: labelCustom ? `${labelCustom} · ${etichetaShipo(o)}` : etichetaShipo(o),
    deliveryType: o.laPunct ? "locker" : "address",
    price: o.pret,
    shipoRateId: o.rateId,
    shipoCourierSlug: o.courierSlug || undefined,
    shipoCourierName: o.numeCurier || undefined,
  }));
}

// ─── Colete Online live courier offers ───────────────────────────────────────

/**
 * Fetch the live Colete Online offers (one per courier service). County/city go
 * as plain names — the CO nomenclature keeps diacritics and the priceMinimal
 * validation strategy accepts a locality-only address. [] on no offers (caller
 * falls back to the flat price). The repayment routing (cash vs bank account)
 * mirrors the merchant's config so the COD fee matches the final AWB price.
 */
async function buildColeteOptions(
  config: COConfig,
  destination: { county: string; city: string; cod?: number },
  weightKg: number,
  customLabel?: string,
): Promise<ShippingOption[]> {
  const token = await getCOToken(config.client_id, config.client_secret);
  const result = await fetchCOPrices(
    token,
    config.sandbox ?? false,
    config.sender,
    {
      name: "Client",
      phone: "0700000000",
      county: destination.county,
      city: destination.city,
      postal_code: "",
      street: destination.city,
      street_number: "",
    },
    [{ type: "package", weight: weightKg, length: 30, width: 20, height: 10, content: "Comanda" }],
    destination.cod && destination.cod > 0 ? destination.cod : 0,
    {
      repaymentType: config.repayment_type ?? "cash",
      repaymentIban: config.repayment_iban,
      repaymentHolder: config.repayment_holder,
    },
  );

  return (result.list ?? [])
    .filter((item) => item?.service?.id && item?.price?.total > 0)
    .map((item): ShippingOption => ({
      courier: "colete",
      courierLabel: addrLabel(customLabel, item.service.courierName),
      deliveryType: "address",
      price: Math.round(item.price.total * 100) / 100,
      coleteServiceId: item.service.id,
      coleteServiceName: `${item.service.courierName} — ${item.service.name}`,
    }))
    .sort((a, b) => a.price - b.price);
}

// ─── Get lockers ─────────────────────────────────────────────────────────────

/*
 * Lista de lockere e IDENTICA pentru toti cumparatorii unui magazin si se schimba
 * rar, deci se tine cateva minute in memoria instantei. Doua castiguri, amandoua
 * legate de acelasi defect: apelul platit se face o data la zece minute in loc de
 * o data pe cumparator (deci plafonul de mai jos aproape nu mai e atins de trafic
 * cinstit), iar cand plafonul E totusi epuizat mai exista ceva de livrat in loc de
 * lista goala.
 *
 * Per instanta, ca orice `CacheScurt`: cel mai rau caz e ca doua instante fac
 * fiecare cate un apel. Numarul de intrari e mic dinadins — o intrare poate tine
 * cateva mii de lockere si sunt cateva magazine calde pe instanta.
 */
const CACHE_LOCKERE = new CacheScurt<LockerItem[]>(10 * 60_000, 40);

/** Filtrarea pe oras se face DUPA cache: cache-ul tine lista intreaga a magazinului. */
function filtreazaOras(lockere: LockerItem[], city?: string): LockerItem[] {
  return city ? lockere.filter((l) => cityMatches(l.city, city)) : lockere;
}

/** Singurii curieri care au ramuri mai jos. Orice altceva iesea oricum cu []. */
const CURIERI_CU_LOCKERE = new Set(["sameday", "fan-courier", "dpd", "cargus", "gls", "posta", "innoship", "packeta", "smartship", "shipo", "ups"]);

export async function getLockers(
  businessId: string,
  courier: string,
  city?: string,
  /** COD amount of the order — Cargus Ship & Go points individually accept or refuse ramburs. */
  codAmount?: number,
  /**
   * ⚠ Reteaua de lockere, cand curierul are mai multe.
   *
   * Doar SmartShip are: easybox (Sameday) si FANbox (FAN Courier) sunt
   * nomenclatoare DIFERITE, cu id-uri din spatii diferite, iar la emitere se
   * folosesc curieri diferiti. Amestecate intr-o singura lista, cumparatorul ar
   * putea alege un FANbox care pleaca apoi ca easybox — si ar nimeri alt punct,
   * sau ar cadea cu 806.
   *
   * Valoarea vine din optiunea aleasa (`ShippingOption.smartshipLockerNet`), deci
   * de la client — de aia intra si in cheia de cache si e ingustata mai jos la
   * cele doua valori cunoscute.
   */
  retea?: string,
): Promise<LockerItem[]> {
  // Aceeasi expunere ca la cotatii: apel public → API platit de curier, pe
  // credentialele comerciantului. Vezi comentariul din getShippingOptions.
  const ip = clientIpFromHeaders(await headers());
  if (!rateLimit(`lockers:${ip}`, 10, 60_000)) return [];

  /*
   * `cod` intra in cheia de cache fiindca la Cargus punctele care nu accepta
   * ramburs se scot INAINTE de cache: steagul `serviceCod` nu supravietuieste in
   * `LockerItem`, deci o comanda cu ramburs si una fara nu pot imparti aceeasi
   * lista.
   */
  /*
   * ⚠ `retea` se ingusteaza AICI, inainte de orice folosire: vine de la client si
   * intra si in cheia de cache. Nefiltrata, cineva ar putea umple cache-ul cu
   * chei inventate — acelasi rationament ca la plafonul din `CacheScurt`.
   */
  const reteaLockere = retea === "fanbox" ? "fanbox" : "easybox";
  /*
   * ⚠ La Shipo, `retea` poarta altceva: `rate_id`-ul serviciului ales.
   *
   * Punctele lor NU se cer pe curier, ci pe SERVICIU — curierul si tipul punctului
   * (locker sau PUDO) sunt deduse de ei din `rate_id`. Doua servicii ale aceluiasi
   * curier pot da liste diferite, deci discriminantul de cache trebuie sa fie
   * serviciul, nu reteaua.
   *
   * Se ingusteaza la cifre din acelasi motiv ca `reteaLockere`: valoarea vine de
   * la client si intra in cheia de cache.
   */
  const rateIdShipo = /^\d{1,9}$/.test(retea ?? "") ? Number(retea) : 0;
  const discriminant =
    courier === "smartship" ? `:${reteaLockere}`
    /*
     * ⚠ La Shipo intra SI localitatea, fiindca lista din cache e a UNUI oras si
     * nimic n-o mai taie la iesire (vezi `filtreaza`). Fara ea, primul cumparator
     * din Cluj ar umple cache-ul si urmatorul, din Iasi, ar primi lockerele clujene.
     * Se normalizeaza prin `localitateShipo`, ca „Sector 3" si „Bucuresti" sa
     * imparta aceeasi intrare in loc sa faca sase.
     */
    : courier === "shipo" ? `:${rateIdShipo}:${localitateShipo(city ?? "", null).toLowerCase()}`
    /*
     * ⚠ La UPS intra tot localitatea, si din ACELASI motiv ca la Shipo: `Locator`
     * cauta punctele PE ORAS, deci lista din cache e a unui singur oras, si nimic
     * n-o mai taie la iesire (vezi `filtreaza`). Fara ea, primul cumparator din Cluj
     * ar umple cache-ul si urmatorul, din Iasi, ar primi punctele clujene.
     * Se normalizeaza prin `orasUps`, ca „Sector 3" si „Bucuresti" sa imparta
     * aceeasi intrare in loc sa faca sase.
     */
    : courier === "ups" ? `:${orasUps(city ?? "", retea ?? null).toLowerCase()}`
    : "";
  const cheieCache = `${businessId}:${courier}:${codAmount && codAmount > 0 ? "cod" : "-"}${discriminant}`;

  /*
   * Cache-ul se consulta INAINTE de plafon, si asta e jumatate din reparatie: un
   * raspuns care nu costa niciun apel platit n-are ce buget sa consume. Altfel
   * cumparatorii cinstiti epuizau chiar ei contorul care apara apelul, iar apoi
   * ramaneau fara niciun locker de ales — tacut, fiindca lista goala nu produce
   * niciun mesaj in interfata.
   */
  /*
   * ⚠ La Shipo NU se mai filtreaza dupa oras, nici aici, nici la iesirea de mai jos.
   *
   * Filtrarea compara orasul comenzii („Bucuresti") cu cel al punctului — iar
   * punctele lor bucurestene spun „Sectorul 4". Deci `filtreazaOras` le-ar taia pe
   * TOATE, exact dupa ce cautarea dupa coordonate le-a gasit corect.
   *
   * Si trebuie sa fie aceeasi hotarare in AMANDOUA locurile: filtrat doar la cache
   * hit, prima cerere ar fi intors lista intreaga si a doua o lista goala — adica
   * un defect care apare abia la al doilea cumparator, si numai in Bucuresti.
   */
  /*
   * ⚠ UPS e in aceeasi tabara cu Shipo, si tot pentru localitati: punctele lor
   * bucurestene isi scriu orasul cum vor („Sector 4", un nume de cartier), iar
   * `filtreazaOras` le-ar taia pe TOATE exact dupa ce `Locator` le-a gasit corect.
   *
   * ⚠ Si trebuie sa fie aceeasi hotarare in AMANDOUA locurile — la cache miss si la
   * cache hit. Filtrat doar la hit, prima cerere ar intoarce lista intreaga si a doua
   * o lista goala: un defect care apare abia la al doilea cumparator.
   */
  const filtreaza = courier !== "shipo" && courier !== "ups";

  const dinCache = CACHE_LOCKERE.get(cheieCache);
  if (dinCache) return filtreaza ? filtreazaOras(dinCache, city) : dinCache;

  // Un nume de curier necunoscut nu ajunge la niciun API mai jos, deci nu trebuie
  // sa consume bugetul magazinului: `courier` vine de la client si e liber.
  if (!CURIERI_CU_LOCKERE.has(courier)) return [];

  const [limIp, limBiz] = await Promise.all([
    consumaLimita(`lockers:ip:${ip}`, 30, 600),
    consumaLimita(`lockers:biz:${businessId}`, 300, 600),
  ]);
  if (!limIp.permis || !limBiz.permis) {
    // Cache-ul e verificat mai sus, deci aici chiar nu exista ce livra. Ramane un
    // esec, dar unul in care cumparatorul are in continuare optiunile de livrare
    // la adresa — spre deosebire de cotatii, unde lista goala inseamna fundatura.
    if (!limBiz.permis) {
      await alertaPlafonMagazin(
        "getLockers.plafonMagazin",
        businessId,
        "Plafonul de lockere pe magazin e epuizat; lista de lockere nu mai poate fi reimprospatata",
      );
    }
    return [];
  }

  const supabase = createAdminClient();
  const { data: settings } = await supabase
    .from("store_settings")
    .select("sameday_config, fan_courier_config, dpd_config, cargus_config, gls_config, posta_config, innoship_config, packeta_config, smartship_config, shipo_config, ups_config")
    .eq("business_id", businessId)
    .single();

  if (!settings) return [];

  if (courier === "ups") {
    /*
     * ⚠ PUNCTELE UPS SE CAUTA DUPA ORAS, NU DUPA COORDONATE.
     *
     * `Locator` accepta si geocod, dar noi n-avem coordonatele cumparatorului in
     * checkout — avem orasul si judetul din formular. Iar `PostcodePrimaryLow` e
     * documentat „Required **if the user does not submit the City, State/Province
     * address combination**", deci orasul + judetul sunt de ajuns.
     *
     * ⚠ Si adresa are ALTA GRAMATICA in Locator decat in restul API-ului:
     * `PoliticalDivision2` = orasul, `PoliticalDivision1` = judetul. Traducerea se face
     * intr-un singur loc, in `puncte()`.
     */
    const config = settings.ups_config as UpsConfig | null;
    if (!upsGata(config) || !config.puncte_activate) return [];

    try {
      const toate = await CACHE_LOCKERE.iaSau(
        cheieCache,
        async () => (await puncteUps(config, {
          /*
           * ⚠ ORASUL NORMALIZAT, nu cel brut din formular.
           *
           * Din 15.08.2026 checkout-ul cere „Sector 1"…„Sector 6" in Bucuresti, iar UPS
           * nu stie ce e un sector: cautat `sector` in toate cele cincisprezece fisiere
           * OpenAPI ale lor — ZERO potriviri. Trimis brut, `Locator` ar fi cautat un
           * oras inexistent si ar fi intors lista goala **in cel mai mare oras al tarii**.
           *
           * ⚠ Si cheia de cache foloseste tot `orasUps`, deci netrecut prin el aici,
           * raspunsul gol al unui cumparator din „Sector 3" ar fi fost servit si
           * urmatorului care scrie corect „Bucuresti".
           */
          oras: orasUps(city ?? "", retea ?? null),
          /* ⚠ Al cincilea parametru poarta JUDETUL la UPS — vezi `CourierSelector`. */
          judet: (retea ?? "").trim(),
          tara: "RO",
        })).map((p) => ({
          /* ⚠ `PublicAccessPointID`, nu `LocationID`: despre al doilea documentatia lor
             spune verbatim „Do not expose the Location ID". */
          id: p.id,
          name: p.nume,
          address: p.adresa,
          city: p.oras,
          county: p.judet,
          postCode: p.codPostal,
          lat: p.lat,
          lng: p.lng,
        })),
        (v) => v.length === 0,
        60_000,
      );
      /*
       * ⚠ NU se filtreaza dupa oras, aceeasi hotarare ca la Shipo: punctele lor
       * bucurestene isi scriu orasul cum vor (sector, cartier), iar un filtru pe nume
       * le-ar taia pe toate exact dupa ce cautarea le-a gasit corect.
       */
      return toate;
    } catch (e) {
      console.error("[shipping] UPS access points failed:", (e as Error).message);
      return [];
    }
  }

  if (courier === "sameday") {
    const config = settings.sameday_config as SamedayConfig | null;
    if (!config?.enabled) return [];
    try {
      // TTL scurt la lista goala: un raspuns gol e de obicei o configurare
      // tocmai reparata, nu adevarul despre magazin.
      const toate = await CACHE_LOCKERE.iaSau(
        cheieCache,
        async () =>
          (await getSamedayLockers(config)).map((l) => ({
            id: String(l.lockerId),
            name: l.name,
            address: l.address,
            city: l.city,
            county: l.county,
            lat: l.lat,
            lng: l.lng,
          })),
        (v) => v.length === 0,
        60_000,
      );
      return filtreazaOras(toate, city);
    } catch (e) {
      console.error("[shipping] Sameday lockers failed:", (e as Error).message);
      return [];
    }
  }

  if (courier === "fan-courier") {
    const config = settings.fan_courier_config as FanCourierConfig | null;
    if (!config?.enabled) return [];
    try {
      const toate = await CACHE_LOCKERE.iaSau(
        cheieCache,
        async () =>
          (await getFanCourierPickupPoints(config.username, config.password, "fanbox")).map((p) => ({
            id: p.id,
            name: p.name,
            address: `${p.address.street} ${p.address.streetNo}, ${p.address.locality}`,
            city: p.address.locality,
            county: p.address.county,
            lat: Number(p.latitude),
            lng: Number(p.longitude),
          })),
        (v) => v.length === 0,
        60_000,
      );
      return filtreazaOras(toate, city);
    } catch (e) {
      console.error("[shipping] FanCourier pickup points failed:", (e as Error).message);
      return [];
    }
  }

  if (courier === "dpd") {
    const config = settings.dpd_config as DpdConfig | null;
    if (!config?.enabled) return [];
    try {
      const toate = await CACHE_LOCKERE.iaSau(
        cheieCache,
        async () =>
          (await getDpdOffices(config)).map((o) => ({
            id: String(o.id),
            name: o.name,
            address: o.address,
            city: o.city,
            county: "",
            lat: 0,
            lng: 0,
          })),
        (v) => v.length === 0,
        60_000,
      );
      return filtreazaOras(toate, city);
    } catch (e) {
      console.error("[shipping] DPD pickup points failed:", (e as Error).message);
      return [];
    }
  }

  if (courier === "cargus") {
    const config = settings.cargus_config as CargusConfig | null;
    if (!config?.enabled) return [];
    try {
      const toate = await CACHE_LOCKERE.iaSau(
        cheieCache,
        async () => {
          const points = await getCargusPudoPoints(config);
          // Ramburs orders can only go to Ship & Go points that accept COD.
          // Filtrat INAINTE de cache — de aici si `cod` in cheia de cache.
          const acceptate = codAmount && codAmount > 0 ? points.filter((p) => p.serviceCod) : points;
          return acceptate.map((p) => ({
            id: String(p.id),
            name: p.name,
            address: [p.address, p.city].filter(Boolean).join(", "),
            city: p.city,
            county: p.county,
            lat: p.lat,
            lng: p.lng,
          }));
        },
        (v) => v.length === 0,
        60_000,
      );
      return filtreazaOras(toate, city);
    } catch (e) {
      console.error("[shipping] Cargus Ship & Go points failed:", (e as Error).message);
      return [];
    }
  }

  if (courier === "gls") {
    const config = settings.gls_config as GlsConfig | null;
    if (!config?.enabled) return [];
    try {
      const toate = await CACHE_LOCKERE.iaSau(
        cheieCache,
        async () =>
          (await puncteGls(config.tara ?? "RO")).map((p) => ({
            /*
             * ⚠ `id` ramane SIR, neatins.
             *
             * Ceilalti curieri fac `Number(locker_id)` la emiterea AWB-ului,
             * fiindca la ei punctul chiar are id numeric. La GLS e alfanumeric
             * (`RO011857-PARCELSH01`) si intra ca atare in `PSDParameter
             * .StringValue`. Copiat mecanic dupa ei, `Number(...)` ar da `NaN` si
             * punctul s-ar pierde tacut — coletul ar pleca la domiciliu.
             */
            id: p.id,
            name: p.name,
            address: [p.address, p.city].filter(Boolean).join(", "),
            city: p.city,
            county: p.county,
            postCode: p.codPostal,
            lat: p.lat,
            lng: p.lng,
          })),
        (v) => v.length === 0,
        60_000,
      );
      return filtreazaOras(toate, city);
    } catch (e) {
      console.error("[shipping] GLS pickup points failed:", (e as Error).message);
      return [];
    }
  }

  if (courier === "posta") {
    /*
     * ⚠ AICI „PUNCTUL" E UN OFICIU POSTAL, nu un locker.
     *
     * Nomenclatorul `GET /api/unitati-livrare` da unitatile in care se poate
     * livra post-restant, iar id-ul ales ajunge in `idOficiuPR` la emiterea
     * AWB-ului. Documentatia numeste UN SINGUR camp din rand (`id`) — restul le
     * cauta `normalizeazaUnitati` prin mai multe nume cu putinta.
     *
     * ⚠ `id` ramane SIR, ca la GLS: exemplul lor il trimite ca sir („31793"), iar
     * un `Number(...)` copiat mecanic de la ceilalti l-ar putea pierde.
     */
    const config = settings.posta_config as PostaConfig | null;
    if (!postaGata(config) || !config.post_restant) return [];
    try {
      const toate = await CACHE_LOCKERE.iaSau(
        cheieCache,
        async () =>
          normalizeazaUnitati(await unitatiLivrare(config)).map((p) => ({
            id: p.id,
            name: p.name,
            address: [p.address, p.city].filter(Boolean).join(", "),
            city: p.city,
            county: p.county,
            postCode: p.postCode,
            lat: p.lat,
            lng: p.lng,
          })),
        (v) => v.length === 0,
        60_000,
      );
      return filtreazaOras(toate, city);
    } catch (e) {
      console.error("[shipping] Posta unitati-livrare failed:", (e as Error).message);
      return [];
    }
  }

  if (courier === "packeta") {
    /*
     * ⚠ PUNCTELE PACKETA: doua fluxuri, MONDIALE, filtrate pe tara la noi.
     *
     * `branch.json` (magazine) si `box.json` (automate Z-BOX) nu au niciun
     * parametru de tara — acopera toate tarile in care lucreaza Packeta. Filtrarea
     * se face in `normalizeazaPuncte`, INAINTE ca lista sa ajunga in cache; fara
     * ea un magazin romanesc ar tine in memorie punctele din toata Europa, iar
     * cumparatorul ar putea alege un punct din Cehia.
     *
     * ⚠ `id` ramane SIR: merge direct in `addressId` la emitere, unde un punct, un
     * automat si un curier sunt id-uri din ACELASI spatiu. Un `Number(...)` copiat
     * mecanic de la ceilalti l-ar putea pierde.
     *
     * ⚠ Punctele care nu accepta ramburs se scot INAINTE de cache, ca la Cargus:
     * steagul nu supravietuieste in `LockerItem`, deci o comanda cu ramburs si una
     * fara nu pot imparti aceeasi lista. De aia `cod` e deja in cheia de cache.
     */
    const config = settings.packeta_config as PacketaConfig | null;
    if (!packetaGata(config)) return [];
    try {
      /*
       * ⚠ Se filtreaza DUPA RAMBURS, nu si dupa greutate — desi `puncteBune`
       * stie s-o faca si punctele isi declara `maxKg`.
       *
       * Motivul e cache-ul. `cod` are doua valori (da/nu), deci incape in cheie.
       * Greutatea e continua: pusa in cheie, aproape fiecare comanda si-ar avea
       * propria intrare, cache-ul s-ar goli de rost si le-am descarca fluxul
       * mondial la fiecare cumparator. Iar filtrata DUPA cache n-ar avea din ce:
       * `maxKg` nu supravietuieste in `LockerItem`.
       *
       * Ce se pierde: cineva poate alege un punct prea mic pentru coletul lui.
       * Ce prinde asta: `packetAttributesValid()` la emitere, care raspunde
       * INAINTE sa se creeze ceva si spune chiar numele campului gresit. La un
       * furnizor fara anulare, garda aia e oricum obligatorie — aici doar nu o
       * dublam cu un pret pe care il platesc toti cumparatorii.
       */
      const toate = await CACHE_LOCKERE.iaSau(
        cheieCache,
        async () =>
          puncteBune(await puncteRomania(config), 0, codAmount ?? 0)
            .map((p) => ({
              id: p.id,
              name: p.nume,
              address: [p.strada, p.oras].filter(Boolean).join(", "),
              city: p.oras,
              /* ⚠ Fluxul nu da judetul. Gol, nu ghicit din oras: o potrivire
                 gresita ar aseza punctul in alt judet pe eticheta. */
              county: "",
              postCode: p.codPostal,
              lat: p.lat ?? 0,
              lng: p.lng ?? 0,
            })),
        (v) => v.length === 0,
        60_000,
      );
      return filtreazaOras(toate, city);
    } catch (e) {
      console.error("[shipping] Packeta pickup points failed:", (e as Error).message);
      return [];
    }
  }

  if (courier === "innoship") {
    /*
     * ⚠ Innoship e singurul care poate FILTRA punctele pe server, si asta
     * schimba costul: `FixedLocations` primeste `LocalityName`, deci nu mai
     * aducem cateva mii de randuri ca sa taiem noi.
     *
     * ⚠ `id` ramane SIR: e chiar `fixedLocationId`, valoarea pe care comanda o
     * asteapta inapoi. Un `Number(...)` copiat de la ceilalti l-ar putea pierde.
     */
    const config = settings.innoship_config as InnoshipConfig | null;
    if (!innoshipGata(config)) return [];
    try {
      const toate = await CACHE_LOCKERE.iaSau(
        cheieCache,
        async () =>
          normalizeazaPuncte(await puncteFixe(config, { countryCode: "RO", localityName: city || undefined })).map((p) => ({
            id: p.id,
            name: p.name,
            address: [p.address, p.city].filter(Boolean).join(", "),
            city: p.city,
            county: p.county,
            postCode: p.postCode,
            lat: p.lat,
            lng: p.lng,
          })),
        (v) => v.length === 0,
        60_000,
      );
      return filtreazaOras(toate, city);
    } catch (e) {
      console.error("[shipping] Innoship FixedLocations failed:", (e as Error).message);
      return [];
    }
  }

  if (courier === "smartship") {
    /*
     * ⚠ DOUA RETELE, SI NU SE AMESTECA.
     *
     * `easybox` (Sameday) si `fanbox` (FAN Courier) au nomenclatoare separate,
     * cu id-uri din spatii diferite, si se emit cu curieri diferiti (12 sau 2 pe
     * contract propriu, respectiv 3 + contract propriu). Puse in aceeasi lista,
     * cumparatorul ar alege un punct dintr-o retea si coletul ar pleca in
     * cealalta.
     *
     * ⚠ Fluxurile sunt pe TOATA tara si n-au niciun parametru de filtrare:
     * filtrarea pe oras se face dupa cache, ca la ceilalti.
     *
     * ⚠ Si forma randului NU e documentata — sunt singurele doua endpointuri din
     * tot API-ul lor fara exemplu de raspuns. `normalizeazaLockere` o citeste
     * tolerant; butonul Diagnostic din panou arata cheile reale.
     */
    const config = settings.smartship_config as SmartshipConfig | null;
    if (!smartshipGata(config)) return [];
    /* FANbox merge numai pe contract propriu — o cerere fara el ar fi degeaba. */
    if (reteaLockere === "fanbox" && !config.contract_propriu) return [];

    try {
      const toate = await CACHE_LOCKERE.iaSau(
        cheieCache,
        async () => {
          const brute = reteaLockere === "fanbox"
            ? await lockereFanbox(config)
            : await lockereEasybox(config);
          return normalizeazaLockere(brute).map((p) => ({
            /*
             * ⚠ `id` ramane sir aici (asa il cere `LockerItem`), dar e MEREU un
             * intreg: `content.locker_id` e „integer" la ei, iar
             * `normalizeazaLockere` a aruncat deja tot ce nu e intreg pozitiv.
             * Pe dos fata de GLS, Posta si Packeta, unde id-ul e alfanumeric.
             */
            id: p.id,
            name: p.nume,
            address: [p.adresa, p.oras].filter(Boolean).join(", "),
            city: p.oras,
            county: p.judet,
            postCode: p.codPostal,
            lat: p.lat,
            lng: p.lng,
          }));
        },
        (v) => v.length === 0,
        60_000,
      );
      return filtreazaOras(toate, city);
    } catch (e) {
      console.error("[shipping] SmartShip lockere failed:", (e as Error).message);
      return [];
    }
  }

  if (courier === "shipo") {
    /*
     * ⚠ PUNCTELE SE CER PE SERVICIU, NU PE CURIER.
     *
     * `GET /points` primeste `rate_id`, iar curierul si tipul punctului (locker
     * sau PUDO) sunt deduse de ei din el. Deci fara serviciul ales nu exista
     * intrebare de pus — si nu se poate ghici unul, fiindca doua servicii ale
     * aceluiasi curier dau liste diferite.
     */
    const config = settings.shipo_config as ShipoConfig | null;
    if (!shipoGata(config) || rateIdShipo <= 0) return [];

    try {
      const toate = await CACHE_LOCKERE.iaSau(
        cheieCache,
        async () => {
          /*
           * ⚠ CAUTAREA DUPA COORDONATE E PRIMA, SI E SINGURA CARE MERGE IN BUCURESTI.
           *
           * Punctele lor au `city: "Sectorul 4"`, iar noi avem din comanda
           * „Bucuresti” — un filtru `city=Bucuresti` n-ar potrivi niciun rand, si
           * cumparatorul ar citi „nu sunt lockere in localitatea ta” intr-un oras
           * plin de lockere.
           *
           * ⚠ Si tot aici se face RASUCIREA coordonatelor: `/city` da
           * `[lng, lat]`, `/points` cere `lat,lng`. Vezi `coordPentruPuncte`.
           */
          const localitate = localitateShipo(city ?? "", null);
          let coord: string | null = null;
          if (localitate) {
            try {
              const orase = await cautaOraseShipo(config, localitate);
              /* ⚠ NU primul rand: omonimele din alte judete ar trimite cautarea in
                 cealalta parte a tarii, si raspunsul ar arata perfect valid. */
              coord = coordPentruPuncte(orasulPotrivit(orase, city, null)?.coord);
            } catch {
              /* Nomenclatorul de orase nu e obligatoriu — se cade pe filtrul de nume. */
            }
          }

          const filtru = coord
            ? { rate_id: rateIdShipo, coord, radius: RAZA_IMPLICITA_KM, max_results: MAX_PUNCTE }
            : localitate === "Bucuresti"
              /* Judetul lor e „Bucuresti” chiar si pentru sectoare. */
              ? { rate_id: rateIdShipo, county: "Bucuresti", max_results: MAX_PUNCTE }
              : { rate_id: rateIdShipo, city: localitate || undefined, max_results: MAX_PUNCTE };

          return normalizeazaPuncteShipo(await puncteShipo(config, filtru)).map((p) => ({
            id: p.id,
            name: p.nume,
            address: p.adresa,
            city: p.oras,
            county: p.judet,
            postCode: p.codPostal,
            lat: p.lat,
            lng: p.lng,
          }));
        },
        (v) => v.length === 0,
        60_000,
      );
      /* Vezi `filtreaza` de mai sus: la Shipo lista pleaca nefiltrata, si la fel
         pleaca si cea din cache. */
      return toate;
    } catch (e) {
      console.error("[shipping] Shipo puncte failed:", (e as Error).message);
      return [];
    }
  }

  return [];
}
