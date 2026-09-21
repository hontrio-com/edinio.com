import type { SupabaseClient } from "@supabase/supabase-js";

import type { Database } from "@/types/database.types";

import { cheieEmail, cheieTelefon } from "./suprimare";
import type { Dosar } from "./reguli";

/*
  ═══════════════════════════════════════════════════════════════════════════
  FAPTELE DE CARE AU NEVOIE REGULILE
  ═══════════════════════════════════════════════════════════════════════════

  ⚠ STRANSE O DATA PE MAGAZIN, nu o data pe cos. Cinci dintre ele sunt despre
  intregul magazin (cate SMS-uri luna asta, cate mesaje azi, cate dezabonari),
  iar cronul trece prin sute de cosuri: citite pe fiecare, ar fi fost sute de
  interogari identice, si cifra s-ar fi schimbat pe parcursul aceleiasi rulari.

  ⚠ CEASUL E CEL ROMANESC. „Orele de liniste 22-8" inseamna ora Romaniei, nu a
  serverului. Pe UTC vara, 22:00 la noi e 19:00 acolo - si linistea ar fi
  inceput cu trei ore mai tarziu, exact cand deranjeaza.
*/

type Client = SupabaseClient<Database>;

/** Ce e comun tuturor cosurilor unui magazin, in rularea asta. */
export interface FapteMagazin {
  smsLunaAsta: number;
  mesajeAzi: number;
  dezabonari30: number;
  mesaje30: number;
  ora: number;
  ziSaptamanii: number;
}

/** Ceasul romanesc, oricare ar fi ceasul serverului. */
export function ceasulRomanesc(acum: Date = new Date()): { ora: number; ziSaptamanii: number } {
  const ro = new Date(acum.toLocaleString("en-US", { timeZone: "Europe/Bucharest" }));
  return { ora: ro.getHours(), ziSaptamanii: ro.getDay() };
}

function inceputulLunii(acum: Date): string {
  const ro = new Date(acum.toLocaleString("en-US", { timeZone: "Europe/Bucharest" }));
  const local = new Date(ro.getFullYear(), ro.getMonth(), 1, 0, 0, 0, 0);
  return new Date(local.getTime() - (ro.getTime() - acum.getTime())).toISOString();
}

function inceputulZilei(acum: Date): string {
  const ro = new Date(acum.toLocaleString("en-US", { timeZone: "Europe/Bucharest" }));
  const local = new Date(ro.getFullYear(), ro.getMonth(), ro.getDate(), 0, 0, 0, 0);
  return new Date(local.getTime() - (ro.getTime() - acum.getTime())).toISOString();
}

export async function fapteleMagazinului(
  admin: Client, businessId: string, acum: Date = new Date(),
): Promise<FapteMagazin> {
  const lunaDeLa = inceputulLunii(acum);
  const ziDeLa = inceputulZilei(acum);
  const treizeci = new Date(acum.getTime() - 30 * 86_400_000).toISOString();

  /*
    ⚠ `head: true` cu `count: "exact"`: se cere NUMARUL, nu randurile. Aduse,
    ar fi fost mii de randuri citite degeaba la fiecare rulare de cron - si tot
    n-ar fi incaput, fiindca PostgREST taie la 1.000 si numaratoarea ar fi
    iesit mai mica decat e.
  */
  const nr = async (q: PromiseLike<{ count: number | null }>) => (await q).count ?? 0;

  const [smsLunaAsta, mesajeAzi, mesaje30, dezabonari30] = await Promise.all([
    nr(admin.from("recovery_sends").select("id", { count: "exact", head: true })
      .eq("business_id", businessId).eq("canal", "sms").gte("trimis_la", lunaDeLa)),
    nr(admin.from("recovery_sends").select("id", { count: "exact", head: true })
      .eq("business_id", businessId).gte("trimis_la", ziDeLa)),
    nr(admin.from("recovery_sends").select("id", { count: "exact", head: true })
      .eq("business_id", businessId).gte("trimis_la", treizeci)),
    nr(admin.from("recovery_optout").select("id", { count: "exact", head: true })
      .eq("business_id", businessId).gte("created_at", treizeci)),
  ]);

  return { smsLunaAsta, mesajeAzi, mesaje30, dezabonari30, ...ceasulRomanesc(acum) };
}

/**
 * Faptele despre un cos anume.
 *
 * ⚠ `aMaiComandat` E `null` CAND NU SE POATE AFLA, nu `false`. Regula opreste
 * trimiterea la `null`, fiindca ghicit gresit omul primeste un mesaj scris
 * pentru altcineva. Tratat ca `false`, un client vechi ar fi primit „bine ai
 * venit".
 */
export async function fapteleCosului(
  admin: Client,
  businessId: string,
  cos: {
    email?: string | null; phone?: string | null; subtotal?: number | null;
    source?: string | null; items?: unknown;
  },
  canal: "email" | "sms",
  magazin: FapteMagazin,
  /** `false` sare interogarile care nu se folosesc: vezi `nevoiDeIstoric`. */
  cereIstoric = true,
  acum: Date = new Date(),
): Promise<Dosar> {
  const produse = (Array.isArray(cos.items) ? cos.items : [])
    .map((i) => (i as { product_id?: string })?.product_id)
    .filter((x): x is string => !!x);

  const dosar: Dosar = {
    canal,
    valoare: Number(cos.subtotal) || 0,
    sursa: cos.source ?? null,
    produse,
    aMaiComandat: null,
    mesajeCatreClient: 0,
    zileDeLaUltimul: null,
    ...magazin,
  };
  if (!cereIstoric) {
    /* Fara reguli care le cer, se lasa neutre: `null` ar opri trimiterea degeaba. */
    dosar.aMaiComandat = false;
    return dosar;
  }

  const email = cheieEmail(cos.email);
  const telefon = cheieTelefon(cos.phone);

  /* ── A mai comandat? ──────────────────────────────────────────────────── */
  if (email || telefon) {
    const conditii: string[] = [];
    if (email) conditii.push(`customer_email.eq.${email}`);
    if (telefon) conditii.push(`customer_phone.eq.${telefon}`);
    const { count, error } = await admin
      .from("orders").select("id", { count: "exact", head: true })
      .eq("business_id", businessId).or(conditii.join(","));
    /* ⚠ La eroare ramane `null`: „nu stiu" nu e „nu a comandat". */
    dosar.aMaiComandat = error ? null : (count ?? 0) > 0;
  } else {
    dosar.aMaiComandat = false;
  }

  /* ── Cate mesaje a primit, si cand ultimul ────────────────────────────── */
  const treizeci = new Date(acum.getTime() - 30 * 86_400_000).toISOString();
  const { data: catreEl } = await admin
    .from("recovery_sends")
    .select("trimis_la, abandoned_carts!inner(email, phone)")
    .eq("business_id", businessId).gte("trimis_la", treizeci)
    .order("trimis_la", { ascending: false })
    .limit(200);

  const aleLui = (catreEl ?? []).filter((r) => {
    const c = (r as { abandoned_carts?: { email?: string | null; phone?: string | null } }).abandoned_carts;
    if (!c) return false;
    return (!!email && cheieEmail(c.email) === email) || (!!telefon && cheieTelefon(c.phone) === telefon);
  });
  dosar.mesajeCatreClient = aleLui.length;
  const ultimul = aleLui[0]?.trimis_la;
  dosar.zileDeLaUltimul = ultimul
    ? Math.floor((acum.getTime() - new Date(ultimul).getTime()) / 86_400_000)
    : null;

  return dosar;
}

/**
 * Are rost sa citim istoricul clientului?
 *
 * ⚠ DOUA INTEROGARI PE COS sunt scumpe cand cronul trece prin sute. Daca
 * niciuna dintre regulile care le folosesc nu e pusa, nu se citesc deloc.
 */
export function nevoiDeIstoric(r: {
  clienti?: string; max_mesaje_pe_client?: number | null; pauza_zile?: number | null;
}): boolean {
  return (!!r.clienti && r.clienti !== "toti")
    || r.max_mesaje_pe_client != null
    || r.pauza_zile != null;
}
