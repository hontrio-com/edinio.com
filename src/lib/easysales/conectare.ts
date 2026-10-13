import { createHash, randomBytes } from "node:crypto";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/types/database.types";
import { logError } from "@/lib/error-logger";
import { refuzaContFolositDeAltMagazin } from "@/lib/integrari/cont-marketplace-unic";
import { citesteContul, listaProduse, listaWebsiteuri, statusuriLivrare } from "./api";
import { asiguraAbonarile, stergeAbonarile, type StareAbonari } from "./abonari";
import type { ContextEasySales } from "./client";
import { depozitDinSupabase, type DepozitEasySales } from "./depozit";
import { COLOANE_LEGATURA, STARI_NETRIMISE, intoarceLaEdinio, type LegaturaComenzii } from "./comenzi";
import { citesteCanaleleNative, conflicteCanale, mesajConflict } from "./exclusivitate";
import { idText } from "./numere";
import { contractulLivrarilor, contulDin } from "./sanatate";
import { emiteToken, MESAJ_TOKEN } from "./token";
import type { CanalDeclarat, ContEasySales, EasySalesConfig, WebsiteEasySales } from "./tipuri";

/**
 * Conectarea, in doua trepte (planul, §4.2).
 *
 * TREAPTA A, „Verifica datele": forma campurilor, moneda si cota magazinului, garda „un cont, un
 * magazin", emiterea SUB ZAVOR, apoi contul si lista website-urilor. Secretele se salveaza cu
 * `connected: false`: nimic nu porneste inca.
 *
 * TREAPTA B, „Alege website-ul si conecteaza": poarta „website gol", canalele declarate si
 * exclusivitatea lor, garda din nou (intre trepte randul nostru nu e vazut de garda altui magazin),
 * apoi `website_nume` si `connected: true` intr-o singura imbinare, si abonarile.
 *
 * ⚠ NIMIC NU PORNESTE AUTOMAT: comenzile, catalogul si stocul au fiecare comutatorul lor, stins.
 *
 * Fisierul NU e „use server": actiunile (`easysales.actions.ts`) pun garda proprietarului si il cheama.
 */

type Admin = SupabaseClient<Database>;

export interface DateConectare {
  client_id: string;
  client_secret: string;
  website_token: string;
}

/** Amprenta website token-ului: identitatea comparabila in clar (garda contului unic). */
export function amprentaWebsiteToken(t: string): string {
  return createHash("sha256").update(t.trim(), "utf8").digest("hex").slice(0, 32);
}

/** Forma campurilor: lipsa opreste, lungimile neobisnuite doar avertizeaza (exemplele nu sunt o regula). */
export function verificaForma(d: DateConectare): { eroare: string | null; avertismente: string[] } {
  const av: string[] = [];
  if (!d.client_id.trim()) return { eroare: "Lipsește ID Client.", avertismente: av };
  if (!d.client_secret.trim()) return { eroare: "Lipsește Secretul clientului API.", avertismente: av };
  if (!d.website_token.trim()) return { eroare: "Lipsește website token-ul.", avertismente: av };
  if (!/^[0-9a-f-]{36}$/i.test(d.client_id.trim())) av.push("ID Client nu arată ca unul easySales (36 de caractere). Verifică dacă l-ai copiat întreg.");
  if (d.client_secret.trim().length !== 40) av.push("Secretul are altă lungime decât de obicei (40 de caractere). Verifică dacă l-ai copiat întreg.");
  if (d.website_token.trim().length !== 60) av.push("Website token-ul are altă lungime decât de obicei (60 de caractere). Verifică dacă l-ai copiat întreg.");
  return { eroare: null, avertismente: av };
}

/** Moneda RON si, la un platitor de TVA, o cota legala azi (21, 11 sau 0). `null` = trece. */
export function verificaMagazinul(s: { currency?: unknown; vat_enabled?: unknown; vat_rate?: unknown }): string | null {
  const moneda = typeof s.currency === "string" && s.currency.trim() ? s.currency.trim().toUpperCase() : "RON";
  if (moneda !== "RON") return `Magazinul vinde în ${moneda}. Integrarea easySales lucrează numai cu magazine în lei (RON).`;
  if (s.vat_enabled === true && ![21, 11, 0].includes(Number(s.vat_rate))) {
    return `Cota de TVA din setări (${String(s.vat_rate)}%) nu e o cotă legală azi. Alege 21%, 11% sau 0% în Setări, apoi reîncearcă.`;
  }
  return null;
}

export type RezultatTreaptaA =
  | { ok: true; websiteuri: { name: string; url: string | null; status: string | null }[]; cont: ContEasySales | null; avertismente: string[] }
  | { ok: false; eroare: string };

export async function verificaDatele(admin: Admin, businessId: string, brut: DateConectare): Promise<RezultatTreaptaA> {
  const d: DateConectare = { client_id: brut.client_id.trim(), client_secret: brut.client_secret.trim(), website_token: brut.website_token.trim() };
  const forma = verificaForma(d);
  if (forma.eroare) return { ok: false, eroare: forma.eroare };
  const avertismente = [...forma.avertismente];

  const [setari, biz] = await Promise.all([
    admin.from("store_settings").select("currency, vat_enabled, vat_rate").eq("business_id", businessId).maybeSingle(),
    admin.from("businesses").select("cui").eq("id", businessId).maybeSingle(),
  ]);
  if (setari.error) return { ok: false, eroare: "Nu am putut citi setările magazinului. Încearcă din nou." };
  const refuzMagazin = verificaMagazinul(setari.data ?? {});
  if (refuzMagazin) return { ok: false, eroare: refuzMagazin };

  const amprenta = amprentaWebsiteToken(d.website_token);
  const folosit = await refuzaContFolositDeAltMagazin("easysales", businessId, { id: d.client_id, amprenta });
  if (folosit) return { ok: false, eroare: folosit };

  const dep = depozitDinSupabase(admin);
  let vechi: EasySalesConfig;
  try { vechi = await dep.citesteConfig(businessId); } catch { return { ok: false, eroare: "Nu am putut citi configurarea. Încearcă din nou." }; }
  /* Alt client sau alt website decat cel salvat: tokenul vechi nu mai e al lor. */
  const altaIdentitate = vechi.client_id !== d.client_id || vechi.website_token_amprenta !== amprenta;
  const petic: Partial<EasySalesConfig> = {
    client_id: d.client_id, client_secret: d.client_secret, website_token: d.website_token,
    website_token_amprenta: amprenta, connected: false, needs_reconnect: false, motiv_reconectare: null,
    ...(altaIdentitate ? { access_token: null as unknown as string, refresh_token: null as unknown as string, jwt_sub: null, scopuri: null } : {}),
  };
  if (!(await dep.peticConfig(businessId, petic))) return { ok: false, eroare: "Datele nu s-au putut salva. Încearcă din nou." };

  let cfg: EasySalesConfig;
  try { cfg = await dep.citesteConfig(businessId); } catch { return { ok: false, eroare: "Nu am putut citi configurarea. Încearcă din nou." }; }
  const tok = await emiteToken(dep, businessId, cfg);
  if (!tok.ok) return { ok: false, eroare: tok.mesaj || MESAJ_TOKEN[tok.motiv] };
  const ctx: ContextEasySales = { dep, businessId, cfg: tok.cfg, corelatie: "conectare" };

  const cont = await citesteContul(ctx);
  const contCitit = cont.ok && cont.date && typeof cont.date === "object"
    ? contulDin(cont.date as Record<string, unknown>, (biz.data as { cui?: string | null } | null)?.cui ?? null)
    : null;
  if (contCitit?.potrivire_cui === "nu") avertismente.push(`Contul easySales e pe firma ${contCitit.firma ?? ""} (${contCitit.vat_id ?? ""}), alt CUI decât al magazinului. Verifică dacă e contul potrivit.`);
  if (contCitit?.potrivire_cui === "cui_lipsa") avertismente.push("Magazinul n-are CUI completat în Edinio, deci nu putem compara firma contului easySales.");

  const w = await listaWebsiteuri(ctx);
  if (!w.ok) return { ok: false, eroare: `Tokenul merge, dar lista website-urilor nu se poate citi: ${w.mesaj}` };
  const websiteuri = (Array.isArray(w.date) ? w.date : [] as WebsiteEasySales[])
    .filter((x) => typeof x?.name === "string" && x.name)
    .map((x) => ({ name: x.name as string, url: x.url ?? null, status: x.status ?? null }));

  const liv = await statusuriLivrare(ctx);
  if (liv.ok && Array.isArray(liv.date)) {
    const dif = contractulLivrarilor(liv.date);
    if (dif.length) await logError({ action: "easysales.contract", severity: "warning", businessId, message: `starile de livrare difera de cele cablate: ${dif.join("; ")}` });
  }

  await dep.peticConfig(businessId, { ...(contCitit ? { cont: contCitit } : {}) });
  return { ok: true, websiteuri, cont: contCitit, avertismente };
}

/* ─── Treapta B ───────────────────────────────────────────────────────────── */

export interface AlegereWebsite {
  website_nume: string;
  canale: CanalDeclarat[];
  /** Cele patru bife (planul, §4.2, Treapta B, pasul 3). Toate obligatorii. */
  bife: { sursaStocWebsite: boolean; clientDedicat: boolean; websiteInRon: boolean; statusCustomGol: boolean };
}

export type RezultatTreaptaB = { ok: true; abonari: StareAbonari } | { ok: false; eroare: string };

/**
 * Poarta „website gol": website-ul ales n-are produse, afara de ale noastre la o reconectare.
 *
 * ⚠ Intai proba filtrului: un nume sigur inexistent trebuie sa dea zero. Daca nu, filtrul e ignorat
 * sau partial (M-PROD-7), iar poarta n-ar mai spune nimic: se opreste conectarea. Raspunsul se
 * refiltreaza oricum local, pe egalitate exacta cu `website.name`.
 */
export async function poartaWebsiteGol(admin: Admin, ctx: ContextEasySales, nume: string): Promise<string | null> {
  const proba = await listaProduse(ctx, { website: `edinio-proba-${randomBytes(6).toString("hex")}` });
  if (!proba.ok) return `Nu am putut verifica website-ul: ${proba.mesaj}`;
  if ((Array.isArray(proba.date) ? proba.date : []).length > 0) {
    return "Nu putem verifica dacă website-ul e gol (filtrul lor după website nu se comportă cum ne așteptăm). Scrie-ne la suport.";
  }
  const r = await listaProduse(ctx, { website: nume });
  if (!r.ok) return `Nu am putut verifica website-ul: ${r.mesaj}`;
  const aleLui = (Array.isArray(r.date) ? r.date : []).filter((p) => {
    const w = (p as { website?: { name?: unknown } | null }).website;
    return w?.name === nume;
  });
  if (aleLui.length === 0) return null;

  /* Reconectarea pe acelasi website: toate produsele gasite sunt ale noastre, pe doi martori. */
  const ids = aleLui.map((p) => idText((p as { product_website_id?: unknown }).product_website_id)).filter((x): x is string => !!x);
  if (ids.length !== aleLui.length) return "Website-ul ales are deja produse. Folosește un website API V2 nou, creat numai pentru Edinio.";
  const { data, error } = await admin.from("easysales_produse").select("id, sku_trimis").eq("business_id", ctx.businessId).in("id", ids.map(Number));
  if (error) return "Nu am putut verifica produsele website-ului. Încearcă din nou.";
  const ale_noastre = new Map(((data ?? []) as { id: number; sku_trimis: string | null }[]).map((x) => [String(x.id), (x.sku_trimis ?? "").toLowerCase()]));
  const straine = aleLui.filter((p) => {
    const id = idText((p as { product_website_id?: unknown }).product_website_id) ?? "";
    const sku = String((p as { sku?: unknown }).sku ?? "").toLowerCase();
    return ale_noastre.get(id) !== sku;
  });
  return straine.length ? "Website-ul ales are deja produse care nu sunt ale acestui magazin. Folosește un website API V2 nou, creat numai pentru Edinio." : null;
}

export async function conecteazaWebsiteul(admin: Admin, businessId: string, a: AlegereWebsite): Promise<RezultatTreaptaB> {
  if (!a.bife.sursaStocWebsite || !a.bife.clientDedicat || !a.bife.websiteInRon || !a.bife.statusCustomGol) {
    return { ok: false, eroare: "Bifează toate cele patru confirmări: fără ele integrarea nu poate lucra corect." };
  }
  const nume = a.website_nume.trim();
  if (!nume) return { ok: false, eroare: "Alege website-ul." };

  const dep: DepozitEasySales = depozitDinSupabase(admin);
  let cfg: EasySalesConfig;
  try { cfg = await dep.citesteConfig(businessId); } catch { return { ok: false, eroare: "Nu am putut citi configurarea. Încearcă din nou." }; }
  if (!cfg.client_id || !cfg.access_token) return { ok: false, eroare: "Verifică întâi datele (pasul 1)." };
  const ctx: ContextEasySales = { dep, businessId, cfg, corelatie: "conectare" };

  const w = await listaWebsiteuri(ctx);
  if (!w.ok) return { ok: false, eroare: `Lista website-urilor nu se poate citi: ${w.mesaj}` };
  if (!(Array.isArray(w.date) ? w.date : []).some((x) => x?.name === nume)) return { ok: false, eroare: `Website-ul „${nume}” nu mai apare în easySales.` };

  const gol = await poartaWebsiteGol(admin, ctx, nume);
  if (gol) return { ok: false, eroare: gol };

  const canale = (a.canale ?? []).filter((c) => c && typeof c.canal === "string").map((c) => ({ canal: c.canal, tara: (c.tara || "ro").toLowerCase() }));
  let native;
  try { native = await citesteCanaleleNative(admin, businessId); } catch { return { ok: false, eroare: "Nu am putut verifica integrările directe. Încearcă din nou." }; }
  const conflicte = conflicteCanale(canale, native);
  if (conflicte.length) return { ok: false, eroare: mesajConflict(conflicte) };

  const folosit = await refuzaContFolositDeAltMagazin("easysales", businessId, { id: cfg.client_id, amprenta: cfg.website_token_amprenta ?? null });
  if (folosit) return { ok: false, eroare: folosit };

  const acum = new Date().toISOString();
  const ok = await dep.peticConfig(businessId, {
    website_nume: nume, canale, connected: true, needs_reconnect: false, conectat_la: cfg.conectat_la ?? acum,
    comenzi_active: cfg.comenzi_active ?? false, catalog_activ: cfg.catalog_activ ?? false, stoc_activ: cfg.stoc_activ ?? false,
  });
  if (!ok) return { ok: false, eroare: "Conectarea nu s-a putut salva. Încearcă din nou." };
  Object.assign(ctx.cfg, { website_nume: nume, canale, connected: true });

  const abonari = await asiguraAbonarile(ctx);
  return { ok: true, abonari };
}

/**
 * Deconectarea (planul, §4.8), in ordinea asta:
 *   1. comenzile stampilate si netrimise trec la Edinio (cat inca avem token, ca sa putem dovedi
 *      ca o comanda `necunoscuta` nu e la ei);
 *   2. abonarile ACESTUI magazin se sterg;
 *   3. secretele devin `null` (imbinarea le sterge), `connected` devine `false`;
 *   4. legaturile raman: o reconectare refoloseste id-urile, altfel la ei ar aparea dubluri.
 * Comenzile deja trimise raman blocate pentru factura si AWB din Edinio (se deblocheaza pe comanda).
 */
export async function deconecteaza(admin: Admin, ctx: ContextEasySales): Promise<{ intoarse: number; abonariRamase: number }> {
  const { data } = await admin.from("easysales_comenzi").select(COLOANE_LEGATURA)
    .eq("business_id", ctx.businessId).eq("directie", "iesire").eq("stapan", "easysales")
    .in("stare", [...STARI_NETRIMISE, "necunoscuta"]);
  let intoarse = 0;
  for (const leg of (data ?? []) as unknown as LegaturaComenzii[]) {
    const r = await intoarceLaEdinio(admin, ctx, leg, "integrarea easySales a fost deconectată", { faraDovada: !leg.trimisa_la });
    if (r === "intoarsa") intoarse++;
  }
  const ab = await stergeAbonarile(ctx).catch(() => ({ sterse: 0, ramase: 1 }));
  await ctx.dep.peticConfig(ctx.businessId, {
    connected: false, comenzi_active: false, catalog_activ: false, stoc_activ: false,
    client_secret: null as unknown as string, website_token: null as unknown as string,
    access_token: null as unknown as string, refresh_token: null as unknown as string,
    webhook_secret: null as unknown as string, pat: null as unknown as string,
    abonari: {}, webhook_jeton_hash: null as unknown as string,
  });
  return { intoarse, abonariRamase: ab.ramase };
}
