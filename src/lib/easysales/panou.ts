import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/types/database.types";
import { easysalesPermisPentru, SLUGURI_ABONATE } from "./constante";
import { citesteConfigEasySales } from "./depozit";
import type { CanalDeclarat, ContEasySales, EasySalesConfig } from "./tipuri";

/**
 * Ce vede panoul integrarii: o STARE construita pe server, niciodata configurarea.
 *
 * ⚠ Secretele nu pleaca spre browser nici mascate: panoul primeste doar „exista" (boolean). Acelasi
 * tipar ca `getTrendyolStatus` (`maskSecret`), dar mai strict: aici n-are ce cauta nici un prefix.
 *
 * Fisierul NU e „use server": tipurile si constructorul se importa din actiuni si din componente.
 */

type Admin = SupabaseClient<Database>;

export const STARI_PROBLEMA = ["refuzata", "respinsa_local", "blocata_plafon", "conflict", "abandonata", "necunoscuta"] as const;

export interface ComandaProblema {
  orderId: string;
  numar: string;
  stare: string;
  motiv: string | null;
  la: string;
}

export interface StareEasySales {
  disponibila: boolean;
  conectat: boolean;
  reconectare: string | null;
  pauza: string | null;
  clientId: string | null;
  websiteNume: string | null;
  secrete: { client_secret: boolean; website_token: boolean; token: boolean };
  comutatoare: { comenzi: boolean; catalog: boolean; stoc: boolean };
  setari: { serieFacturi: string; variantaTotal: "incasat" | "definitie"; canale: CanalDeclarat[] };
  cont: ContEasySales | null;
  abonari: { slug: string; abonat: boolean }[];
  semnatura: { mod: "masoara" | "impune"; varianta: string | null };
  ultimaLivrare: string | null;
  ultimaSanatate: string | null;
  contoare: Record<string, number>;
  probleme: ComandaProblema[];
  inboxNeprelucrat: number;
}

export function stareaDinConfig(cfg: EasySalesConfig, businessId: string): Omit<StareEasySales, "contoare" | "probleme" | "inboxNeprelucrat"> {
  return {
    disponibila: easysalesPermisPentru(businessId),
    conectat: cfg.connected === true,
    reconectare: cfg.needs_reconnect ? (cfg.motiv_reconectare || "Conexiunea cere reconectare.") : null,
    pauza: cfg.pauza ? (cfg.pauza_motiv || "Integrarea e în pauză.") : null,
    clientId: cfg.client_id ?? null,
    websiteNume: cfg.website_nume ?? null,
    secrete: { client_secret: !!cfg.client_secret, website_token: !!cfg.website_token, token: !!cfg.access_token },
    comutatoare: { comenzi: cfg.comenzi_active === true, catalog: cfg.catalog_activ === true, stoc: cfg.stoc_activ === true },
    setari: {
      serieFacturi: cfg.serie_facturi ?? "",
      variantaTotal: cfg.varianta_total === "definitie" ? "definitie" : "incasat",
      canale: Array.isArray(cfg.canale) ? cfg.canale : [],
    },
    cont: cfg.cont ?? null,
    abonari: SLUGURI_ABONATE.map((slug) => ({ slug, abonat: !!cfg.abonari?.[slug] })),
    semnatura: { mod: cfg.semnatura_mod === "impune" ? "impune" : "masoara", varianta: cfg.semnatura_varianta ?? null },
    ultimaLivrare: cfg.ultima_livrare_la ?? null,
    ultimaSanatate: cfg.sanatate_la ?? null,
  };
}

/** Starea intreaga a panoului. ⚠ Arunca daca configurarea nu se poate citi (nu „neconectat"). */
export async function stareaPanoului(admin: Admin, businessId: string): Promise<StareEasySales> {
  const cfg = await citesteConfigEasySales(admin, businessId);
  const baza = stareaDinConfig(cfg, businessId);

  const contoare: Record<string, number> = {};
  const { data: randuri } = await admin.from("easysales_comenzi").select("stare")
    .eq("business_id", businessId).eq("directie", "iesire").eq("stapan", "easysales")
    .gte("created_at", new Date(Date.now() - 30 * 24 * 3600_000).toISOString()).limit(5000);
  for (const r of (randuri ?? []) as { stare: string }[]) contoare[r.stare] = (contoare[r.stare] ?? 0) + 1;

  const { data: pr } = await admin.from("easysales_comenzi")
    .select("order_uuid, stare, motiv, updated_at, orders(order_number)")
    .eq("business_id", businessId).eq("directie", "iesire").eq("stapan", "easysales")
    .in("stare", [...STARI_PROBLEMA]).order("updated_at", { ascending: false }).limit(50);
  const probleme: ComandaProblema[] = ((pr ?? []) as unknown as { order_uuid: string | null; stare: string; motiv: string | null; updated_at: string; orders: { order_number: string } | null }[])
    .filter((r) => r.order_uuid)
    .map((r) => ({ orderId: r.order_uuid!, numar: r.orders?.order_number ?? "", stare: r.stare, motiv: r.motiv, la: r.updated_at }));

  const { count } = await admin.from("easysales_webhook_inbox").select("id", { count: "exact", head: true })
    .eq("business_id", businessId).is("prelucrat_la", null);

  return { ...baza, contoare, probleme, inboxNeprelucrat: count ?? 0 };
}

/** Starea easySales a unei comenzi, pentru pagina ei. `null` = comanda nu are legatura. */
export interface StareComandaEasySales {
  stare: string;
  stapan: string;
  esOrderId: string;
  esInternalId: string | null;
  statusLor: string | null;
  awb: string | null;
  curier: string | null;
  facturi: { series: string | null; number: string | null }[];
  stornari: number;
  cerereAnulare: string | null;
  erori: string[];
  motiv: string | null;
  anulataLaEi: boolean;
  /** Ce butoane au sens acum. */
  poate: { preia: boolean; anuleaza: boolean; reia: boolean };
}

export async function stareaComenzii(admin: Admin, businessId: string, orderId: string): Promise<StareComandaEasySales | null> {
  const { data, error } = await admin.from("easysales_comenzi")
    .select("stare, stapan, es_order_id, es_internal_id, es_status_text, awb_viu, awb_curier, facturi, cancel_request, erori, motiv, es_anulata_la")
    .eq("business_id", businessId).eq("order_uuid", orderId).eq("directie", "iesire").maybeSingle();
  if (error || !data) return null;
  const f = (data.facturi && typeof data.facturi === "object" && !Array.isArray(data.facturi) ? data.facturi : {}) as { emise?: unknown; stornari?: unknown };
  const emise = Array.isArray(f.emise) ? (f.emise as { series?: string | null; number?: string | null }[]) : [];
  const erori = Array.isArray(data.erori) ? (data.erori as { action?: string; message?: string }[]).map((e) => [e?.action, e?.message].filter(Boolean).join(": ")) : [];
  const netrimisa = ["asteapta_plata", "de_trimis", "refuzata", "respinsa_local", "blocata_plafon", "abandonata"].includes(data.stare);
  const aLor = data.stapan === "easysales";
  return {
    stare: data.stare,
    stapan: data.stapan,
    esOrderId: data.es_order_id,
    esInternalId: data.es_internal_id,
    statusLor: data.es_status_text,
    awb: data.awb_viu,
    curier: data.awb_curier,
    facturi: emise.map((x) => ({ series: x?.series ?? null, number: x?.number ?? null })),
    stornari: Array.isArray(f.stornari) ? f.stornari.length : 0,
    cerereAnulare: data.cancel_request,
    erori,
    motiv: data.motiv,
    anulataLaEi: !!data.es_anulata_la,
    poate: {
      preia: aLor && (netrimisa || data.stare === "trimisa" || data.stare === "conflict"),
      anuleaza: aLor && (data.stare === "trimisa" || data.stare === "conflict") && !data.es_anulata_la,
      reia: aLor && ["blocata_plafon", "respinsa_local", "abandonata"].includes(data.stare),
    },
  };
}
