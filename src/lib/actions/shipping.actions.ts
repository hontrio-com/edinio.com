"use server";

import { createAdminClient } from "@/lib/supabase/admin";
import { estimateSamedayCost, getSamedayLockers, type SamedayConfig, type SamedayLocker } from "@/lib/sameday";
import { estimateFanCourierCost, getFanCourierPickupPoints, type FanCourierConfig, type FanCourierPickupPoint } from "@/lib/fancourier";
import { getWootToken, getPrices as fetchWootPrices, fetchCounties as fetchWootCounties, fetchCities as fetchWootCities, type WootConfig } from "@/lib/woot";

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

// ─── Get shipping options ────────────────────────────────────────────────────

export async function getShippingOptions(
  businessId: string,
  destination: {
    county: string;
    city: string;
    weightKg?: number;
    cod?: number;
  },
): Promise<ShippingOption[]> {
  // Service role: anonymous customers trigger this; courier secrets are read
  // server-side only and never returned to the client (only computed prices are).
  const supabase = createAdminClient();
  const { data: settings } = await supabase
    .from("store_settings")
    .select("sameday_config, fan_courier_config, woot_config, default_shipping_cost, shipping_zones")
    .eq("business_id", businessId)
    .single();

  if (!settings) return [];

  const zones = (settings.shipping_zones ?? {}) as Record<string, { enabled: boolean; price: number; auto_price?: boolean; label?: string }>;
  const enabledZones = Object.entries(zones).filter(([, z]) => z.enabled);

  // No courier enabled in shipping_zones — nothing to show
  if (enabledZones.length === 0) return [];

  const weight = destination.weightKg && destination.weightKg > 0 ? destination.weightKg : 1;
  const options: ShippingOption[] = [];
  const promises: Promise<void>[] = [];

  for (const [courierId, zone] of enabledZones) {
    const useAutoPrice = zone.auto_price !== false; // default true

    if (courierId === "sameday") {
      const samedayConfig = settings.sameday_config as SamedayConfig | null;
      const hasApi = !!(samedayConfig?.enabled && samedayConfig.username && samedayConfig.pickup_point_id);

      if (hasApi && useAutoPrice) {
        // API tariff
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
                courierLabel: "Livrare prin Sameday",
                deliveryType: "address",
                price,
                estimatedDays: days,
              });
              options.push({
                courier: "sameday",
                courierLabel: "Sameday EasyBox (locker)",
                deliveryType: "locker",
                price,
                estimatedDays: days,
              });
            })
            .catch((err) => {
              console.error("[shipping] Sameday estimate failed:", err.message);
              // Fallback to flat price
              options.push({
                courier: "sameday",
                courierLabel: "Livrare prin Sameday",
                deliveryType: "address",
                price: zone.price,
              });
            }),
        );
      } else {
        // Manual price or no API config
        options.push({
          courier: "sameday",
          courierLabel: "Livrare prin Sameday",
          deliveryType: "address",
          price: zone.price,
        });
        // Offer locker option only if API is configured (lockers need API)
        if (hasApi) {
          options.push({
            courier: "sameday",
            courierLabel: "Sameday EasyBox (locker)",
            deliveryType: "locker",
            price: zone.price,
          });
        }
      }
    } else if (courierId === "fan-courier") {
      const fanConfig = settings.fan_courier_config as FanCourierConfig | null;
      const hasApi = !!(fanConfig?.enabled && fanConfig.username && fanConfig.client_id);

      if (hasApi && useAutoPrice) {
        const service = destination.cod && destination.cod > 0 ? "Cont Colector" : "Standard";
        promises.push(
          estimateFanCourierCost(fanConfig!, {
            recipientCounty: destination.county,
            recipientLocality: destination.city,
            weightKg: weight,
            service,
          })
            .then((r) => {
              const price = Math.round(r.total * 100) / 100;
              options.push({
                courier: "fan-courier",
                courierLabel: "Livrare prin FAN Courier",
                deliveryType: "address",
                price,
              });
              options.push({
                courier: "fan-courier",
                courierLabel: "FAN Courier FANbox (locker)",
                deliveryType: "locker",
                price,
              });
            })
            .catch((err) => {
              console.error("[shipping] FanCourier estimate failed:", err.message);
              options.push({
                courier: "fan-courier",
                courierLabel: "Livrare prin FAN Courier",
                deliveryType: "address",
                price: zone.price,
              });
            }),
        );
      } else {
        options.push({
          courier: "fan-courier",
          courierLabel: "Livrare prin FAN Courier",
          deliveryType: "address",
          price: zone.price,
        });
        if (hasApi) {
          options.push({
            courier: "fan-courier",
            courierLabel: "FAN Courier FANbox (locker)",
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
          buildWootOptions(wootConfig!, destination, weight)
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
    } else {
      // Generic courier (dpd, cargus, colete, own) — flat price
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
  const n = (name || "").trim().toLowerCase();
  if (!n) return undefined;
  return (
    list.find((x) => x.name.toLowerCase() === n) ??
    list.find((x) => x.name.toLowerCase().includes(n) || n.includes(x.name.toLowerCase()))
  );
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
      phone: "0700000000",
      country_id: 189,
      city_id: city.id,
      address: destination.city,
    },
    parcels: [{ type: "package", weight: weightKg, length: 30, width: 20, height: 10, content: "Comanda" }],
    repayment: destination.cod && destination.cod > 0 ? destination.cod : undefined,
  });

  return prices
    .filter((p) => p.errors.length === 0)
    .map((p): ShippingOption => ({
      courier: "woot",
      courierLabel: p.courier_name,
      deliveryType: "address",
      price: Math.round(p.final_total * 100) / 100,
      wootServiceId: p.service_id,
      wootCourierName: p.courier_name,
      wootServiceName: p.service_name,
    }))
    .sort((a, b) => a.price - b.price);
}

// ─── Get lockers ─────────────────────────────────────────────────────────────

export async function getLockers(
  businessId: string,
  courier: string,
  city?: string,
): Promise<LockerItem[]> {
  const supabase = createAdminClient();
  const { data: settings } = await supabase
    .from("store_settings")
    .select("sameday_config, fan_courier_config")
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
        const cityLower = city.toLowerCase();
        filtered = lockers.filter((l) => l.city.toLowerCase().includes(cityLower));
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
        const cityLower = city.toLowerCase();
        filtered = points.filter((p) => p.address.locality.toLowerCase().includes(cityLower));
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

  return [];
}
