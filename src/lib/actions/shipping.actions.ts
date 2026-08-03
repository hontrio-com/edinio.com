"use server";

import { createAdminClient } from "@/lib/supabase/admin";
import { estimateSamedayCost, getSamedayLockers, type SamedayConfig, type SamedayLocker } from "@/lib/sameday";
import { estimateFanCourierCost, getFanCourierPickupPoints, type FanCourierConfig, type FanCourierPickupPoint } from "@/lib/fancourier";
import { getWootToken, getPrices as fetchWootPrices, fetchCounties as fetchWootCounties, fetchCities as fetchWootCities, type WootConfig } from "@/lib/woot";
import { calculateDpdIntlPrice, calculateDpdDomesticPrice, getDpdOffices, type DpdConfig } from "@/lib/dpd";
import { calculateCargusPrice, getCargusPudoPoints, type CargusConfig } from "@/lib/cargus";
import { getCOToken, getPrices as fetchCOPrices, type COConfig } from "@/lib/colete";
import { euCountryByIso2 } from "@/lib/eu-countries";
import { stripDiacritics, normalizeLocalityName } from "@/lib/utils/ro-address";
import { applyShippingRules, parseShippingRules, type ShippingCartContext } from "@/lib/shipping/rules";
import { semneazaOptiuni } from "@/lib/shipping/quote-token";
import { contextulCosului } from "@/lib/shipping/cart-weight";

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
  own: "Curier propriu",
  pickup: "Ridicare personala",
};

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
    // Cart context for conditional shipping rules (weight/value/class/category).
    // Product shipping data is loaded server-side (authoritative); subtotal is the
    // goods value after promo. Absent => behaves exactly like before (no rules).
    cart?: { productId: string; quantity: number }[];
    subtotal?: number;
  },
): Promise<ShippingOptionSemnata[]> {
  // Service role: anonymous customers trigger this; courier secrets are read
  // server-side only and never returned to the client (only computed prices are).
  const supabase = createAdminClient();
  const { data: settings } = await supabase
    .from("store_settings")
    .select("sameday_config, fan_courier_config, woot_config, dpd_config, cargus_config, colete_config, default_shipping_cost, shipping_zones, shipping_rules")
    .eq("business_id", businessId)
    .single();

  if (!settings) return [];

  const zones = (settings.shipping_zones ?? {}) as Record<string, { enabled: boolean; price: number; auto_price?: boolean; label?: string }>;
  const enabledZones = Object.entries(zones).filter(([, z]) => z.enabled);

  // No courier enabled in shipping_zones — nothing to show
  if (enabledZones.length === 0) return [];

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
  const iso2 = destination.country?.toUpperCase();
  const esteIntl = !!iso2 && iso2 !== "RO";
  let cos = contextulCosului([], []);
  if (destination.cart && destination.cart.length > 0) {
    const { data: cartProducts, error: eroareCos } = await supabase
      .from("products")
      .select("id, shipping_class, category, weight_grams")
      .eq("business_id", businessId)
      .in("id", [...new Set(destination.cart.map((c) => c.productId))]);
    // O interogare cazuta inseamna greutate zero, adica tariful unui kilogram
    // pentru un colet de zece — tacut. Fiecare esec de curier de mai jos se
    // jurnalizeaza; asta se jurnaliza pana acum nicaieri.
    if (eroareCos) console.error("[shipping] cart weight lookup failed:", eroareCos.message);
    cos = contextulCosului(destination.cart, cartProducts ?? []);
  }
  const cartWeightKg = cos.weightKg;

  // Greutatea cu care se cere pretul curierilor interni. Un kilogram ramane
  // rezerva pentru cosurile ale caror produse n-au greutate completata.
  // Reparatia NU e teoretica: 1408 produse active de pe 14 magazine sunt
  // cantarite, iar la magazinul care coteaza live prin Cargus si DPD sapte din
  // opt comenzi trecute ar fi primit alt pret decat cel de la un kilogram.
  const weight = cartWeightKg > 0 ? cartWeightKg : 1;
  const options: ShippingOption[] = [];

  // International (EU): only DPD international applies. Short-circuit here so the
  // domestic courier loop below stays completely unchanged for RO orders.
  if (esteIntl) {
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
      return semneazaOptiuni(businessId, destination, [{
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
    const useAutoPrice = zone.auto_price !== false; // default true

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
      if (courierId === "own" || courierId === "pickup" || zone.auto_price === false) {
        flatCourierIds.add(courierId);
      }
    }
    const ctx: ShippingCartContext = {
      subtotal: Math.max(0, Number(destination.subtotal) || 0),
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
  const semnate = semneazaOptiuni(businessId, destination, finalOptions);

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

export async function getLockers(
  businessId: string,
  courier: string,
  city?: string,
  /** COD amount of the order — Cargus Ship & Go points individually accept or refuse ramburs. */
  codAmount?: number,
): Promise<LockerItem[]> {
  const supabase = createAdminClient();
  const { data: settings } = await supabase
    .from("store_settings")
    .select("sameday_config, fan_courier_config, dpd_config, cargus_config")
    .eq("business_id", businessId)
    .single();

  if (!settings) return [];

  if (courier === "sameday") {
    const config = settings.sameday_config as SamedayConfig | null;
    if (!config?.enabled) return [];
    try {
      const lockers = await getSamedayLockers(config);
      let filtered = lockers;
      if (city) {
        filtered = lockers.filter((l) => cityMatches(l.city, city));
      }
      return filtered.map((l) => ({
        id: String(l.lockerId),
        name: l.name,
        address: l.address,
        city: l.city,
        county: l.county,
        lat: l.lat,
        lng: l.lng,
      }));
    } catch (e) {
      console.error("[shipping] Sameday lockers failed:", (e as Error).message);
      return [];
    }
  }

  if (courier === "fan-courier") {
    const config = settings.fan_courier_config as FanCourierConfig | null;
    if (!config?.enabled) return [];
    try {
      const points = await getFanCourierPickupPoints(config.username, config.password, "fanbox");
      let filtered = points;
      if (city) {
        filtered = points.filter((p) => cityMatches(p.address.locality, city));
      }
      return filtered.map((p) => ({
        id: p.id,
        name: p.name,
        address: `${p.address.street} ${p.address.streetNo}, ${p.address.locality}`,
        city: p.address.locality,
        county: p.address.county,
        lat: Number(p.latitude),
        lng: Number(p.longitude),
      }));
    } catch (e) {
      console.error("[shipping] FanCourier pickup points failed:", (e as Error).message);
      return [];
    }
  }

  if (courier === "dpd") {
    const config = settings.dpd_config as DpdConfig | null;
    if (!config?.enabled) return [];
    try {
      const offices = await getDpdOffices(config);
      let filtered = offices;
      if (city) {
        filtered = offices.filter((o) => cityMatches(o.city, city));
      }
      return filtered.map((o) => ({
        id: String(o.id),
        name: o.name,
        address: o.address,
        city: o.city,
        county: "",
        lat: 0,
        lng: 0,
      }));
    } catch (e) {
      console.error("[shipping] DPD pickup points failed:", (e as Error).message);
      return [];
    }
  }

  if (courier === "cargus") {
    const config = settings.cargus_config as CargusConfig | null;
    if (!config?.enabled) return [];
    try {
      const points = await getCargusPudoPoints(config);
      let filtered = points;
      // Ramburs orders can only go to Ship & Go points that accept COD.
      if (codAmount && codAmount > 0) {
        filtered = filtered.filter((p) => p.serviceCod);
      }
      if (city) {
        filtered = filtered.filter((p) => cityMatches(p.city, city));
      }
      return filtered.map((p) => ({
        id: String(p.id),
        name: p.name,
        address: [p.address, p.city].filter(Boolean).join(", "),
        city: p.city,
        county: p.county,
        lat: p.lat,
        lng: p.lng,
      }));
    } catch (e) {
      console.error("[shipping] Cargus Ship & Go points failed:", (e as Error).message);
      return [];
    }
  }

  return [];
}
