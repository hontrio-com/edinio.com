/*
  Partenerii platformei, cu siglele lor: curierii care emit AWB din Edinio, casele de facturare si
  marketplace-urile. Un singur loc din care listele panoului (Comenzi, Retururi, Decontări) isi
  iau sigla, numele si coloana de configurare a fiecaruia.

  ⚠ Modul PUR: il citesc si paginile de pe server, si piesele din browser, si probele.
*/

import { NUME_CURIER, type CurierPropriu } from "@/lib/orders/awb-propriu";
import { siglaMica, type Sigla } from "@/lib/integrari/sigle";

/** Un curier care emite AWB din platforma. */
export interface CurierPartener extends Sigla {
  cheie: CurierPropriu;
  /** Coloana lui din `store_settings`. */
  config: string;
  /** Coloana din `orders` cu ultima stare citita de la curier, acolo unde exista una scrisa ca text. */
  stare?: string;
}

const curier = (cheie: CurierPropriu, logo: string, config: string, stare?: string): CurierPartener =>
  ({ cheie, nume: NUME_CURIER[cheie], logo, config, ...(stare ? { stare } : null) });

/**
 * Curierii care emit AWB din platforma. Cheile sunt cele din `COLOANA_AWB` (`awb-propriu.ts`),
 * deci un curier nou adaugat acolo e cerut aici de compilator. Numele e cel din `NUME_CURIER`:
 * acelasi in lista, in refuzul unui AWB si in notificarea de expediere.
 */
export const CURIERI: Record<CurierPropriu, CurierPartener> = {
  fancourier: curier("fancourier", "/integrations/fan-courier.svg", "fan_courier_config"),
  sameday: curier("sameday", "/integrations/sameday.webp", "sameday_config", "sameday_status_label"),
  cargus: curier("cargus", "/integrations/cargus.svg", "cargus_config", "cargus_status"),
  dpd: curier("dpd", "/integrations/dpd.svg", "dpd_config", "dpd_status_label"),
  gls: curier("gls", "/integrations/gls.svg", "gls_config"),
  posta: curier("posta", "/integrations/posta_romana.svg", "posta_config"),
  curiera: curier("curiera", "/integrations/curiera.webp", "curiera_config", "curiera_status_label"),
  pallex: curier("pallex", "/integrations/pallex.avif", "pallex_config"),
  fedex: curier("fedex", "/integrations/fedex.svg", "fedex_config"),
  ups: curier("ups", "/integrations/ups.svg", "ups_config"),
  dhl: curier("dhl", "/integrations/dhl.svg", "dhl_config"),
  colete: curier("colete", "/integrations/colete-online.svg", "colete_config", "colete_status_label"),
  woot: curier("woot", "/integrations/woot.webp", "woot_config", "woot_status_label"),
  ecolet: curier("ecolet", "/integrations/ecolet.png", "ecolet_config"),
  smartship: curier("smartship", "/integrations/smartship.png", "smartship_config"),
  shipo: curier("shipo", "/integrations/shipo.ro.svg", "shipo_config"),
  packeta: curier("packeta", "/integrations/packeta.png", "packeta_config"),
  innoship: curier("innoship", "/integrations/innoship.svg", "innoship_config"),
  epacket: curier("epacket", "/integrations/e-packet.svg", "epacket_config", "epacket_status_label"),
};

/** Ce scrie checkoutul in `shipping_address.courier`, acolo unde nu e chiar cheia curierului. */
const ALIAS_CURIER: Record<string, CurierPropriu> = {
  "fan-courier": "fancourier", fan_courier: "fancourier",
  "posta-romana": "posta", "pall-ex": "pallex",
};

/** Cheia curierului dupa ce a scris checkoutul la comanda (`fan-courier`, `sameday`...), sau `null`. */
export function cheiaCurierului(ales: string | null | undefined): CurierPropriu | null {
  const scris = (ales ?? "").trim().toLowerCase();
  if (!scris) return null;
  /* `Object.hasOwn`, nu indexare directa: „constructor” sau „toString” ar gasi ceva mostenit, nu un curier. */
  if (Object.hasOwn(ALIAS_CURIER, scris)) return ALIAS_CURIER[scris];
  return Object.hasOwn(CURIERI, scris) ? (scris as CurierPropriu) : null;
}

/**
 * Sigla unui curier pentru panou (varianta mica a fisierului, unde exista), dupa cheia din baza.
 * `null` pentru o cheie pe care platforma n-o cunoaste: cine o deseneaza arata cheia ca text.
 */
export function siglaCurierului(cheie: string): Sigla | null {
  if (!Object.hasOwn(CURIERI, cheie)) return null;
  const c = CURIERI[cheie as CurierPropriu];
  return { cheie: c.cheie, nume: c.nume, logo: siglaMica(c.logo), ...(c.inversat ? { inversat: true } : null) };
}

/** Cheile caselor de facturare, in ordinea dispecerului (aceeasi ca in `COLOANE_FACTURA_EMISA`). */
export const CHEI_CASE_FACTURARE = ["smartbill", "oblio", "fgo", "facturis", "factureaza", "easybill"] as const;
export type CasaFacturare = (typeof CHEI_CASE_FACTURARE)[number];

/** O casa de facturare: sigla ei si coloana din `store_settings`. */
export interface CasaPartener extends Sigla {
  cheie: CasaFacturare;
  config: string;
}

/** Casele de facturare, in ordinea in care apar si in pagina unei comenzi. */
export const CASE_FACTURARE: readonly CasaPartener[] = [
  { cheie: "smartbill", nume: "SmartBill", logo: "/integrations/smartbill.webp", config: "smartbill_config" },
  { cheie: "oblio", nume: "Oblio", logo: "/integrations/oblio.webp", inversat: true, config: "oblio_config" },
  { cheie: "fgo", nume: "fGO", logo: "/integrations/fgo.svg", config: "fgo_config" },
  { cheie: "facturis", nume: "Facturis", logo: "/integrations/facturis.png", inversat: true, config: "facturis_config" },
  { cheie: "factureaza", nume: "Factureaza.ro", logo: "/integrations/factureaza.ro.webp", config: "factureaza_config" },
  { cheie: "easybill", nume: "easybill", logo: "/integrations/easybill.png", config: "easybill_config" },
];

/** Siglele marketplace-urilor din care vin comenzi, dupa cheia din `order_source.marketplace` (cele din `MARKETPLACE_ORIGINI`). */
export const SIGLE_MARKETPLACE: Record<string, string> = {
  emag: "/integrations/emag.webp",
  trendyol: "/integrations/trendyol.svg",
  aboutyou: "/integrations/aboutyou.png",
  pepita: "/integrations/pepita.svg",
  easysales: "/integrations/easysales.webp",
};
