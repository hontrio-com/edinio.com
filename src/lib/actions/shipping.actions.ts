"use server";

import { createClient } from "@/lib/supabase/server";
import { estimateSamedayCost, getSamedayLockers, type SamedayConfig, type SamedayLocker } from "@/lib/sameday";
import { estimateFanCourierCost, getFanCourierPickupPoints, type FanCourierConfig, type FanCourierPickupPoint } from "@/lib/fancourier";

// ─── Types ───────────────────────────────────────────────────────────────────

export type ShippingOption = {
  courier: string;        // "sameday" | "fan-courier" | "cargus" | "dpd" | "colete" | "woot" | "own" | "pickup"
  courierLabel: string;   // Display name
  deliveryType: "address" | "locker";
  price: number;
  estimatedDays?: string;
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
  const supabase = await createClient();
  const { data: settings } = await supabase
    .from("store_settings")
    .select("sameday_config, fan_courier_config, default_shipping_cost, shipping_zones")
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
    } else {
      // Generic courier (dpd, cargus, woot, colete, own) — flat price
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

// ─── Get lockers ─────────────────────────────────────────────────────────────

export async function getLockers(
  businessId: string,
  courier: string,
  city?: string,
): Promise<LockerItem[]> {
  const supabase = await createClient();
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
