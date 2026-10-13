import { createHmac, randomInt } from "node:crypto";
import { adresaPublica } from "@/lib/adresa-publica";
import { aboneaza, dezaboneaza, listaAbonari, schimbaAdresaAbonarii } from "./api";
import type { ContextEasySales } from "./client";
import { SLUGURI_ABONATE, type SlugAbonat } from "./constante";
import { idText } from "./numere";
import { hashJeton } from "./semnatura";
import type { AbonareEasySales, EasySalesConfig } from "./tipuri";

/**
 * Ciclul abonarilor la webhook-uri (planul, §6.7).
 *
 * ═══ ADRESA ═══
 *
 * `https://www.edinio.com/api/easysales/webhook?businessId=<uuid>&t=<jeton>`, construita NUMAI cu
 * `adresaPublica()` (apexul raspunde 308, iar noi nu stim daca ei urmeaza redirectarile).
 *
 * ═══ ⚠ JETONUL SE DERIVA, NU SE PASTREAZA ═══
 *
 * In configurare sta numai hash-ul lui. Ca abonarile sa poata fi refacute oricand (o abonare
 * disparuta, o adresa mutata) fara jetonul in clar, el se DERIVA cu HMAC din secretul webhook-ului
 * (48 de caractere aleatoare, criptat in `privat.campuri_secrete`) si dintr-o versiune in clar:
 * imprevizibil, diferit pe magazin, si refacut identic. Rotirea = versiunea + 1.
 *
 * ═══ ⚠ CARE ABONARE E A NOASTRA ═══
 *
 * Cea cu id-ul pastrat la abonare (`abonari{slug: id}`), sau cea a carei adresa are calea noastra SI
 * `businessId`-ul acestui magazin. Potrivirea numai pe cale ar prinde si alt magazin Edinio de pe
 * acelasi cont. Abonarile altor integrari nu se ating niciodata.
 *
 * ⚠ Fiecare slug e independent: un refuz la unul (mai ales `delivery-status-updated`, care lipseste
 * din tabelul lor oficial) nu le opreste pe celelalte.
 */

export const CALEA_WEBHOOK = "/api/easysales/webhook";

/** Secretul de semnare: 48 de caractere alfanumerice aleatoare (minimul sugerat de ghid e 24). */
export function secretNou(): string {
  const a = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
  let s = "";
  for (let i = 0; i < 48; i++) s += a[randomInt(a.length)];
  return s;
}

export function jetonulAdresei(secret: string, businessId: string, versiune: number): string {
  return createHmac("sha256", secret).update(`easysales-webhook-url|${businessId}|${versiune}`, "utf8").digest("base64url");
}

export function adresaAbonarii(businessId: string, jeton: string): string {
  return `${adresaPublica()}${CALEA_WEBHOOK}?businessId=${encodeURIComponent(businessId)}&t=${encodeURIComponent(jeton)}`;
}

/** Adresa e a acestui magazin? Calea noastra si `businessId`-ul lui, oricare ar fi jetonul. */
export function eAdresaMagazinului(url: string | null | undefined, businessId: string): boolean {
  if (!url) return false;
  try {
    const u = new URL(url);
    return u.pathname === CALEA_WEBHOOK && u.searchParams.get("businessId") === businessId;
  } catch {
    return false;
  }
}

export type RezultatSlug = "exista" | "creata" | "mutata" | "refuzata" | "inlocuita_de_altul" | "eroare";

export interface StareAbonari {
  ok: boolean;
  /** Pe slug, ce s-a intamplat acum. */
  sluguri: Partial<Record<SlugAbonat, { rezultat: RezultatSlug; id: string | null; mesaj?: string }>>;
  mesaj?: string;
}

/** A doua disparitie a unei abonari in 7 zile opreste refacerea: o inlocuieste alt program. */
const FEREASTRA_DISPARITII_MS = 7 * 24 * 3600_000;

/**
 * Se asigura ca fiecare slug are abonarea noastra, cu adresa de acum. La conectare si zilnic.
 *
 * @param opt.campSecret refacerea dupa „secret nepreluat": numele celalalt al campului (M-WH-1).
 */
export async function asiguraAbonarile(
  ctx: ContextEasySales, opt: { campSecret?: "secret" | "seccret"; refaToate?: boolean } = {},
): Promise<StareAbonari> {
  const b = ctx.businessId;
  const cfg = ctx.cfg;
  const petic: Partial<EasySalesConfig> = {};
  let secret = cfg.webhook_secret ?? "";
  if (!secret) { secret = secretNou(); petic.webhook_secret = secret; }
  const versiune = Number(cfg.webhook_jeton_versiune) || 1;
  const jeton = jetonulAdresei(secret, b, versiune);
  if (cfg.webhook_jeton_hash !== hashJeton(jeton)) {
    petic.webhook_jeton_hash = hashJeton(jeton);
    petic.webhook_jeton_versiune = versiune;
  }
  const camp = opt.campSecret ?? cfg.webhook_camp_secret ?? "secret";
  if (opt.campSecret && opt.campSecret !== cfg.webhook_camp_secret) petic.webhook_camp_secret = opt.campSecret;
  /* ⚠ Secretul si hash-ul se scriu INAINTEA abonarii: o livrare care soseste imediat trebuie sa
     gaseasca jetonul si secretul cu care a fost facuta. */
  if (Object.keys(petic).length) {
    if (!(await ctx.dep.peticConfig(b, petic))) return { ok: false, sluguri: {}, mesaj: "configurarea nu s-a putut scrie" };
    Object.assign(ctx.cfg, petic);
  }
  const url = adresaAbonarii(b, jeton);

  const l = await listaAbonari(ctx);
  if (!l.ok) return { ok: false, sluguri: {}, mesaj: l.mesaj };
  const toate = (Array.isArray(l.date) ? l.date : []) as AbonareEasySales[];

  const abonari: Partial<Record<SlugAbonat, string>> = { ...(cfg.abonari ?? {}) };
  const refacute: Partial<Record<SlugAbonat, string[]>> = { ...(cfg.abonari_refacute ?? {}) };
  const sluguri: StareAbonari["sluguri"] = {};
  const acum = Date.now();

  for (const slug of SLUGURI_ABONATE) {
    const idPastrat = abonari[slug] ?? null;
    const a = toate.find((x) => idPastrat && idText(x.id) === idPastrat)
      ?? toate.find((x) => x.webhook?.slug === slug && eAdresaMagazinului(x.url, b));
    const id = a ? idText(a.id) : null;

    if (a && id && !opt.refaToate) {
      abonari[slug] = id;
      /* Adresa se schimba numai cand ei o intorc intreaga si e alta (M-WH-1: nu stim daca intorc query string-ul). */
      if (a.url && a.url.includes("?") && a.url !== url) {
        const r = await schimbaAdresaAbonarii(ctx, id, url);
        sluguri[slug] = r.ok ? { rezultat: "mutata", id } : { rezultat: "eroare", id, mesaj: r.mesaj };
      } else {
        sluguri[slug] = { rezultat: "exista", id };
      }
      continue;
    }
    if (a && id && opt.refaToate) await dezaboneaza(ctx, id);

    /* Disparuta fara un DELETE de la noi: se reface o data; a doua oara in 7 zile, nu. */
    if (!a && idPastrat && !opt.refaToate) {
      const recente = (refacute[slug] ?? []).filter((t) => acum - Date.parse(t) < FEREASTRA_DISPARITII_MS);
      if (recente.length >= 1) {
        sluguri[slug] = { rezultat: "inlocuita_de_altul", id: null, mesaj: "abonarea dispare din nou: o inlocuieste alt program de pe cont" };
        delete abonari[slug];
        continue;
      }
      refacute[slug] = [...recente, new Date(acum).toISOString()];
    }

    const r = await aboneaza(ctx, slug, url, secret, camp);
    const idNou = r.ok ? idText((r.date as { id?: unknown } | null)?.id) : null;
    if (r.ok && idNou) {
      abonari[slug] = idNou;
      sluguri[slug] = { rezultat: "creata", id: idNou };
    } else {
      delete abonari[slug];
      sluguri[slug] = { rezultat: r.ok ? "eroare" : "refuzata", id: null, mesaj: r.ok ? "raspuns fara id" : r.mesaj };
    }
  }

  await ctx.dep.peticConfig(b, { abonari, abonari_refacute: refacute, abonari_verificate_la: new Date().toISOString() });
  ctx.cfg.abonari = abonari;
  ctx.cfg.abonari_refacute = refacute;
  const esuate = Object.values(sluguri).filter((s) => s && (s.rezultat === "refuzata" || s.rezultat === "eroare")).length;
  return { ok: esuate === 0, sluguri };
}

/** La deconectare: numai abonarile ACESTUI magazin (id-urile pastrate si adresele lui). */
export async function stergeAbonarile(ctx: ContextEasySales): Promise<{ sterse: number; ramase: number }> {
  const ids = new Set(Object.values(ctx.cfg.abonari ?? {}).filter((x): x is string => typeof x === "string" && !!x));
  const l = await listaAbonari(ctx);
  if (l.ok) {
    for (const a of (Array.isArray(l.date) ? l.date : []) as AbonareEasySales[]) {
      const id = idText(a.id);
      if (id && eAdresaMagazinului(a.url, ctx.businessId)) ids.add(id);
    }
  }
  let sterse = 0;
  let ramase = 0;
  for (const id of ids) {
    const r = await dezaboneaza(ctx, id);
    if (r.ok || r.verdict === "negasit") sterse++;
    else ramase++;
  }
  return { sterse, ramase };
}
