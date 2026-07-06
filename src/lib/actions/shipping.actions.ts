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
};

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
    weightKg?: number;
    cod?: number;
    country?: string;  // EU ISO alpha-2 for international; absent or "RO" = domestic
    postCode?: string;
  },
): Promise<ShippingOption[]> {
  // Service role: anonymous customers trigger this; courier secrets are read
  // server-side only and never returned to the client (only computed prices are).
  const supabase = createAdminClient();
  const { data: settings } = await supabase
    .from("store_settings")
    .select("sameday_config, fan_courier_config, woot_config, dpd_config, cargus_config, colete_config, default_shipping_cost, shipping_zones")
    .eq("business_id", businessId)
    .single();

  if (!settings) return [];

  const zones = (settings.shipping_zones ?? {}) as Record<string, { enabled: boolean; price: number; auto_price?: boolean; label?: string }>;
  const enabledZones = Object.entries(zones).filter(([, z]) => z.enabled);

  // No courier enabled in shipping_zones — nothing to show
  if (enabledZones.length === 0) return [];

  const weight = destination.weightKg && destination.weightKg > 0 ? destination.weightKg : 1;
  const options: ShippingOption[] = [];

  // International (EU): only DPD international applies. Short-circuit here so the
  // domestic courier loop below stays completely unchanged for RO orders.
  const iso2 = destination.country?.toUpperCase();
  if (iso2 && iso2 !== "RO") {
    const eu = euCountryByIso2(iso2);
    const dpdCfg = settings.dpd_config as DpdConfig | null;
    const ready = !!(
      eu && destination.postCode && zones["dpd"]?.enabled &&
      dpdCfg?.enabled && dpdCfg.international_enabled && dpdCfg.username && dpdCfg.password && dpdCfg.client_id
    );
    if (!ready) return [];
    try {
      const quote = await calculateDpdIntlPrice(dpdCfg!, {
        countryId: eu!.dpdCountryId,
        postCode: destination.postCode!,
        weightKg: weight,
      });
      if (!quote) return [];
      return [{
        courier: "dpd",
        courierLabel: `DPD International (${eu!.name})`,
        deliveryType: "address",
        price: quote.price,
        estimatedDays: "3-6 zile",
      }];
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

  // Sort: address first, then lockers, by price
  return options.sort((a, b) => {
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
