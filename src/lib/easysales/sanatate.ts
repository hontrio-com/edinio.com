import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/types/database.types";
import { logError } from "@/lib/error-logger";
import { citesteContul, listaAbonari, listaWebsiteuri, statusuriLivrare } from "./api";
import { eAdresaMagazinului, asiguraAbonarile } from "./abonari";
import type { ContextEasySales, Raspuns } from "./client";
import { STARI_LIVRARE, VERSIUNE_SCOPURI, ZILE_REINNOIRE } from "./constante";
import type { DepozitEasySales } from "./depozit";
import { idText, intreg } from "./numere";
import { anuntaRar } from "./notificari";
import { asiguraToken, emiteToken } from "./token";
import type { AbonareEasySales, ContEasySales, EasySalesConfig, WebsiteEasySales } from "./tipuri";

/**
 * Sanatatea legaturii (planul, §4.7 si §5.7).
 *
 * ═══ ⚠ „TESTEAZA CONEXIUNEA" NU EMITE TOKEN SI NU SCRIE NIMIC ═══
 *
 * Orice emitere revoca tokenul in uz [A], deci un test care emite ar strica exact ce verifica. Iar
 * testul nu scrie nici `needs_reconnect`, nici un marcaj, nici jurnal: `depozitFaraScriere`
 * inlocuieste toate scrierile cu nimic, iar proba o cere pe o baza falsa.
 *
 * ⚠ VERDICTUL SE CITESTE „PE DOS": esec numai la un refuz de autentificare dovedit (401). Un 403 la
 * `/account` poate insemna doar ca grantul website n-are voie acolo (M-AUTH-5); reteaua sau un 5xx
 * inseamna „nu am putut verifica acum".
 */

type Admin = SupabaseClient<Database>;

/** Depozitul testului: citeste, dar NU scrie nimic, nicaieri. */
export function depozitFaraScriere(dep: DepozitEasySales): DepozitEasySales {
  return {
    citesteConfig: (b) => dep.citesteConfig(b),
    peticConfig: async () => false,
    iaEmiterea: async () => null,
    scrieTokenul: async () => false,
    elibereazaEmiterea: async () => {},
    scrieJurnal: async () => {},
  };
}

/** CUI-ul in forma comparabila: fara „RO", fara spatii, numai cifre. `null` cand nu e unul. */
export function cuiComparabil(v: unknown): string | null {
  if (typeof v !== "string") return null;
  const s = v.replace(/\s+/g, "").toUpperCase().replace(/^RO/, "");
  return /^\d{2,10}$/.test(s) ? s : null;
}

/** Datele contului lor, si comparatia CUI-ului cu al magazinului. Pura. */
export function contulDin(d: Record<string, unknown>, cuiMagazin: string | null | undefined): ContEasySales {
  const lor = cuiComparabil(d.vat_id);
  const al_nostru = cuiComparabil(cuiMagazin ?? null);
  return {
    firma: typeof d.company_name === "string" ? d.company_name : null,
    vat_id: typeof d.vat_id === "string" ? d.vat_id : null,
    potrivire_cui: !al_nostru ? "cui_lipsa" : !lor ? "necunoscut" : lor === al_nostru ? "da" : "nu",
    abonament_activ: typeof d.has_active_subscription === "boolean" ? d.has_active_subscription : null,
    proba: typeof d.is_trial === "boolean" ? d.is_trial : null,
    expira_la: typeof d.expire_date === "string" ? d.expire_date : null,
    max_comenzi: intreg(d.max_orders),
    comenzi_curente: intreg(d.current_orders),
    moneda_preferata: typeof d.preferred_currency === "string" ? d.preferred_currency : null,
    citit_la: new Date().toISOString(),
  };
}

export type StareWebsite = "activ" | "neconfirmat_activ" | "necunoscut";

/** Numele nostru, cu `status` EXACT „active", inseamna activ; orice altceva, „neconfirmat activ". */
export function stareaWebsiteului(lista: WebsiteEasySales[] | null, nume: string | null | undefined): StareWebsite {
  if (!lista || !nume) return "necunoscut";
  const w = lista.find((x) => x?.name === nume);
  return w && w.status === "active" ? "activ" : "neconfirmat_activ";
}

export interface RaportSanatate {
  token: "valabil" | "refuzat" | "necunoscut";
  cont: ContEasySales | null;
  website: StareWebsite;
  abonari: { slug: string; id: string | null; reusita: boolean | null; cod: number | null; incercare: number | null; finala: boolean | null; la: string | null }[];
  ultimaLivrare: string | null;
  mesaje: string[];
}

function verdictToken(r: Raspuns<unknown>[]): RaportSanatate["token"] {
  if (r.some((x) => x.verdict === "neautorizat")) return "refuzat";
  if (r.some((x) => x.ok)) return "valabil";
  return "necunoscut";
}

/** „Testeaza conexiunea", pe tokenul salvat. `ctx.dep` trebuie sa fie `depozitFaraScriere`. */
export async function testeazaConexiunea(ctx: ContextEasySales, cuiMagazin: string | null): Promise<RaportSanatate> {
  const c: ContextEasySales = { ...ctx, faraEmitere: true };
  const mesaje: string[] = [];
  const [cont, websiteuri, abonari] = [await citesteContul(c), await listaWebsiteuri(c), await listaAbonari(c)];

  let contCitit: ContEasySales | null = null;
  if (cont.ok && cont.date && typeof cont.date === "object") contCitit = contulDin(cont.date as Record<string, unknown>, cuiMagazin);
  else if (cont.status === 403) mesaje.push("Datele contului nu se pot citi cu acest token (easySales nu dă acces la ele grantului de website).");

  const website = websiteuri.ok ? stareaWebsiteului(websiteuri.date ?? [], ctx.cfg.website_nume) : "necunoscut";
  if (website === "neconfirmat_activ") mesaje.push(`Website-ul „${ctx.cfg.website_nume ?? ""}” nu apare activ în easySales (a fost redenumit, dezactivat sau șters?).`);

  const ale_noastre = (abonari.ok && Array.isArray(abonari.date) ? abonari.date : [] as AbonareEasySales[])
    .filter((a) => Object.values(ctx.cfg.abonari ?? {}).includes(idText(a.id) ?? "") || eAdresaMagazinului(a.url, ctx.businessId));
  const r: RaportSanatate = {
    token: verdictToken([cont, websiteuri, abonari]),
    cont: contCitit,
    website,
    abonari: ale_noastre.map((a) => ({
      slug: a.webhook?.slug ?? "?",
      id: idText(a.id),
      reusita: typeof a.details?.result?.success === "boolean" ? a.details.result.success : null,
      cod: intreg(a.details?.result?.status_code),
      incercare: intreg(a.details?.result?.attempt_nr),
      finala: typeof a.details?.result?.final === "boolean" ? a.details.result.final : null,
      la: a.details?.triggered_at ?? null,
    })),
    ultimaLivrare: ctx.cfg.ultima_livrare_la ?? null,
    mesaje,
  };
  if (r.token === "necunoscut") mesaje.push("Nu am putut verifica acum (rețea sau easySales indisponibil). Încearcă din nou peste câteva minute.");
  return r;
}

/** Lista lor de stari de livrare se potriveste cu enumul cablat in `stari.ts`? Pura. */
export function contractulLivrarilor(lista: { description?: string | null; value?: unknown }[]): string[] {
  const diferente: string[] = [];
  for (const [cod, nume] of Object.entries(STARI_LIVRARE)) {
    const x = lista.find((l) => intreg(l?.value) === Number(cod));
    if (!x) diferente.push(`lipseste ${cod} (${nume})`);
    else if ((x.description ?? "").trim().toLowerCase() !== nume.toLowerCase()) diferente.push(`${cod}: ${x.description} in loc de ${nume}`);
  }
  for (const l of lista) {
    const v = intreg(l?.value);
    if (v !== null && !(String(v) in STARI_LIVRARE)) diferente.push(`stare noua ${v} (${l.description ?? ""})`);
  }
  return diferente;
}

/**
 * Verificarea zilnica, din cron: tokenul (reinnoit sub zavor cand se apropie expirarea, reemis o
 * data cand lista de scope-uri s-a largit), contul, website-ul, abonarile si „linistea suspecta".
 */
export async function verificareZilnica(admin: Admin, ctx: ContextEasySales, cuiMagazin: string | null): Promise<void> {
  const b = ctx.businessId;
  const exp = ctx.cfg.token_expira_la ? Date.parse(ctx.cfg.token_expira_la) : NaN;
  const deReinnoit = Number.isFinite(exp) && exp - Date.now() <= ZILE_REINNOIRE * 24 * 3600_000;
  const scopuriVechi = (Number(ctx.cfg.scopuri_versiune) || 0) < VERSIUNE_SCOPURI;
  if ((deReinnoit || scopuriVechi) && !ctx.cfg.needs_reconnect) {
    /* Reinnoirea cu 30 de zile inainte, si o singura reemitere cand lista de scope-uri s-a largit
       (planul, §4.3, §4.6). Sub zavor: o emitere revoca tokenul in uz. */
    const r = await emiteToken(ctx.dep, b, ctx.cfg);
    if (r.ok) ctx.cfg = r.cfg;
    else if (r.reconectare) {
      await anuntaRar(admin, ctx.dep, b, ctx.cfg, "token:reinnoire", 24 * 3600_000, {
        titlu: "easySales cere reconectarea", mesaj: r.mesaj, severitate: "error",
      });
    }
  } else {
    const r = await asiguraToken(ctx.dep, b, ctx.cfg);
    if (r.ok) ctx.cfg = r.cfg;
    else if (r.reconectare) {
      await anuntaRar(admin, ctx.dep, b, ctx.cfg, "token:reinnoire", 24 * 3600_000, {
        titlu: "easySales cere reconectarea", mesaj: r.mesaj, severitate: "error",
      });
    }
  }

  const petic: Partial<EasySalesConfig> = { sanatate_la: new Date().toISOString() };
  const cont = await citesteContul(ctx);
  if (cont.ok && cont.date && typeof cont.date === "object") {
    const c = contulDin(cont.date as Record<string, unknown>, cuiMagazin);
    petic.cont = c;
    const expira = c.expira_la ? Date.parse(c.expira_la) : NaN;
    if (c.abonament_activ === false || (Number.isFinite(expira) && expira - Date.now() < 7 * 24 * 3600_000)) {
      await anuntaRar(admin, ctx.dep, b, ctx.cfg, "cont:abonament", 24 * 3600_000, {
        titlu: "Abonamentul easySales", severitate: "warning",
        mesaj: c.abonament_activ === false
          ? "Contul easySales nu mai are abonament activ: comenzile nu mai pot intra acolo."
          : "Abonamentul easySales expiră în mai puțin de 7 zile. Reînnoiește-l, altfel comenzile nu mai pot intra acolo.",
      });
    }
  }

  const w = await listaWebsiteuri(ctx);
  if (w.ok && stareaWebsiteului(w.date ?? [], ctx.cfg.website_nume) === "neconfirmat_activ") {
    await anuntaRar(admin, ctx.dep, b, ctx.cfg, "website:neconfirmat", 24 * 3600_000, {
      titlu: "Website-ul easySales nu mai apare activ",
      mesaj: `„${ctx.cfg.website_nume ?? ""}” nu mai apare activ în easySales. Dacă l-ai redenumit, alege din nou website-ul în pagina integrării.`,
    });
  }

  const liv = await statusuriLivrare(ctx);
  if (liv.ok && Array.isArray(liv.date)) {
    const dif = contractulLivrarilor(liv.date);
    if (dif.length) await logError({ action: "easysales.contract", severity: "warning", businessId: b, message: `starile de livrare s-au schimbat la ei: ${dif.join("; ")}` });
  }

  const ab = await asiguraAbonarile(ctx);
  for (const [slug, s] of Object.entries(ab.sluguri)) {
    if (s?.rezultat === "inlocuita_de_altul") {
      await anuntaRar(admin, ctx.dep, b, ctx.cfg, `abonare:${slug}`, 7 * 24 * 3600_000, {
        titlu: "Notificările easySales sunt înlocuite de alt program",
        mesaj: `Abonarea „${slug}” dispare din nou din contul easySales: o înlocuiește alt program de pe cont. Comenzile se sincronizează mai departe, dar mai încet.`,
      });
    }
  }

  /* „Liniste suspecta": comenzi trimise in ultima zi si niciun webhook in 24 de ore. */
  const ultima = ctx.cfg.ultima_livrare_la ? Date.parse(ctx.cfg.ultima_livrare_la) : 0;
  if (Date.now() - ultima > 24 * 3600_000) {
    const { count } = await admin.from("easysales_comenzi").select("id", { count: "exact", head: true })
      .eq("business_id", b).eq("stare", "trimisa").gte("trimisa_la", new Date(Date.now() - 24 * 3600_000).toISOString());
    if ((count ?? 0) > 0) {
      await anuntaRar(admin, ctx.dep, b, ctx.cfg, "webhook:liniste", 24 * 3600_000, {
        titlu: "Nicio notificare de la easySales de o zi",
        mesaj: "Au plecat comenzi în easySales, dar n-a venit nicio notificare înapoi. Starea comenzilor se aduce oricum la câteva minute; verifică abonările din pagina integrării.",
      });
    }
  }

  await ctx.dep.peticConfig(b, petic);
}
