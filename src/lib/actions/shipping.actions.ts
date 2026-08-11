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
 */
const FARA_API_DE_TARIF = new Set(["pickup", "own", "gls", "pallex"]);

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
    .select("sameday_config, fan_courier_config, woot_config, dpd_config, cargus_config, colete_config, gls_config, pallex_config, ecolet_config, default_shipping_cost, shipping_zones, shipping_rules")
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
      subtotal: Math.min(
        Math.max(0, Number(destination.subtotal) || 0),
        subtotalMaximDinCatalog(destination.cart, produseCotate),
      ),
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
const CURIERI_CU_LOCKERE = new Set(["sameday", "fan-courier", "dpd", "cargus", "gls"]);

export async function getLockers(
  businessId: string,
  courier: string,
  city?: string,
  /** COD amount of the order — Cargus Ship & Go points individually accept or refuse ramburs. */
  codAmount?: number,
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
  const cheieCache = `${businessId}:${courier}:${codAmount && codAmount > 0 ? "cod" : "-"}`;

  /*
   * Cache-ul se consulta INAINTE de plafon, si asta e jumatate din reparatie: un
   * raspuns care nu costa niciun apel platit n-are ce buget sa consume. Altfel
   * cumparatorii cinstiti epuizau chiar ei contorul care apara apelul, iar apoi
   * ramaneau fara niciun locker de ales — tacut, fiindca lista goala nu produce
   * niciun mesaj in interfata.
   */
  const dinCache = CACHE_LOCKERE.get(cheieCache);
  if (dinCache) return filtreazaOras(dinCache, city);

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
    .select("sameday_config, fan_courier_config, dpd_config, cargus_config, gls_config")
    .eq("business_id", businessId)
    .single();

  if (!settings) return [];

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

  return [];
}
