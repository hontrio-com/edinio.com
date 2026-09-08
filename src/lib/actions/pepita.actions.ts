"use server";

/**
 * Actiunile panoului Pepita.
 *
 * ═══ ⚠ CE NU INTOARCE NICIODATA NIMIC DE AICI ═══
 *
 * Cheile. Ele stau criptate in `pepita_config` si nu coboara in browser odata cu
 * pagina: ar fi ramas in sarcina RSC a fiecarei incarcari, adica in memoria
 * browserului, in orice extensie si in orice partajare de ecran. Se cer separat,
 * prin `dezvaluieAdresele`, si numai cand omul apasa „Arata”.
 *
 * ⚠ SI CITIREA LOR SE FACE CU CHEIA DE SERVICIU, dupa ce proprietatea a fost
 * dovedita: vederea `store_settings` nu decripteaza pentru `authenticated`, deci pe
 * clientul comerciantului ar fi iesit sirul `enc.v1.…`, iar el l-ar fi lipit in
 * mesajul catre Pepita si nimic n-ar fi mers.
 */

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { logError } from "@/lib/error-logger";
import { includeToateActive } from "@/lib/pepita/includere-in-masa";
import { reproceseaza } from "@/lib/pepita/ingest";
import { randuriCitite } from "@/lib/supabase/rand-citit";
import { articolelePentruProdus, type ProblemaPepita, type ProdusPepita } from "@/lib/pepita/articole";
import { adresaComenzi, adresaFeedProduse, adresaFeedStoc, cheieNoua, amprentaCheii, revocaToate, stingeCheileVechi } from "@/lib/pepita/chei";
import { citesteConfig, configFaraChei } from "@/lib/pepita/config";
import { COLOANE_PRODUS, pregateste } from "@/lib/pepita/feed";
import type { PepitaConfig } from "@/lib/pepita/types";
import { TIPURI_GARANTIE, type TipGarantie } from "@/lib/pepita/types";

const CALE = "/dashboard/features/pepita";

type ServerClient = Awaited<ReturnType<typeof createClient>>;
interface Magazin { id: string; slug: string; store_name: string | null; business_name: string }

/**
 * Poarta fiecarei actiuni: exista un om conectat, si magazinul e al lui.
 *
 * ⚠ SE VERIFICA LA FIECARE ACTIUNE, nu o data la incarcarea paginii. Actiunile de
 * server se cheama direct, dintr-un manifest global; o poarta pusa numai in pagina
 * n-ar fi fost pe drumul lor.
 */
async function poarta(businessId: string): Promise<{ supabase: ServerClient; biz: Magazin } | { error: string }> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: "Neautorizat" };
  const { data, error } = await supabase
    .from("businesses").select("id, slug, store_name, business_name")
    .eq("id", businessId).eq("user_id", user.id).maybeSingle();
  /* ⚠ O citire cazuta nu e „nu e magazinul tau”: mesajele trebuie sa fie diferite. */
  if (error) return { error: "Nu am putut verifica magazinul. Încearcă din nou." };
  if (!data) return { error: "Magazin negăsit" };
  return { supabase, biz: data as Magazin };
}

/* ═══════════════════════════════════════════════════════════════════════════
   CONFIGURARE
   ═══════════════════════════════════════════════════════════════════════════ */

async function citesteConfigul(businessId: string): Promise<PepitaConfig> {
  const { data, error } = await createAdminClient()
    .from("store_settings").select("pepita_config").eq("business_id", businessId).maybeSingle();
  if (error) throw error;
  return citesteConfig((data as { pepita_config?: unknown } | null)?.pepita_config);
}

async function scrieConfigul(businessId: string, petic: Record<string, unknown>): Promise<void> {
  if (Object.keys(petic).length === 0) return;
  /*
   * ⚠ IMBINARE IN POSTGRES, pe randul incuiat, nu citire-modificare-scriere in cod.
   * In acelasi JSON scriu si omul (setarile), si rotirea cheilor; o citire veche
   * rescrisa peste ar fi sters o cheie tocmai generata. `jsonb_merge_config` stie si
   * sa pastreze campurile criptate care vin goale.
   */
  const { error } = await createAdminClient().rpc("jsonb_merge_config", {
    p_business_id: businessId,
    p_column: "pepita_config",
    p_patch: petic as never,
  });
  if (error) throw error;
}

export interface SetariPepita {
  strategie_fel: "identic" | "procent" | "fix";
  strategie_valoare: number;
  safety_stock: number;
  shipping_delay: number | null;
  shipping_price: number | null;
  garantie_tip: TipGarantie | "";
  garantie_durata: number;
  mod_includere: "toate" | "selectate";
  factureaza_clientul: boolean;
}

export async function salveazaSetariPepita(businessId: string, s: SetariPepita) {
  const g = await poarta(businessId);
  if ("error" in g) return { error: g.error };

  const tip = TIPURI_GARANTIE.includes(s.garantie_tip as TipGarantie) ? (s.garantie_tip as TipGarantie) : null;
  const durata = Math.max(0, Math.floor(Number(s.garantie_durata) || 0));

  try {
    await scrieConfigul(businessId, {
      strategie_pret: { fel: s.strategie_fel, valoare: Number(s.strategie_valoare) || 0 },
      safety_stock: Math.max(0, Math.floor(Number(s.safety_stock) || 0)),
      shipping_delay: s.shipping_delay == null ? null : Math.max(0, Math.floor(Number(s.shipping_delay) || 0)),
      shipping_price: s.shipping_price == null ? null : Math.max(0, Number(s.shipping_price) || 0),
      /* ⚠ `null` explicit, nu camp lipsa: intr-o imbinare, cheia absenta inseamna „las-o cum e”,
         deci o garantie stearsa de om ar fi ramas pe loc. */
      garantie: tip && tip !== "None" && durata > 0 ? { tip, durata } : null,
      mod_includere: s.mod_includere === "toate" ? "toate" : "selectate",
      factureaza_clientul: s.factureaza_clientul === true,
    });
  } catch (e) {
    await logError({
      action: "pepita/setari", message: e instanceof Error ? e.message : String(e),
      businessId, severity: "error",
    });
    return { error: "Setările nu s-au putut salva." };
  }
  revalidatePath(CALE);
  return { ok: true as const };
}

/**
 * Porneste integrarea: genereaza cheile care lipsesc si o marcheaza activa.
 *
 * ⚠ CHEILE SE GENEREAZA O SINGURA DATA. Repornirea unei integrari oprite nu le
 * schimba: adresele lipite la Pepita ar fi murit, si comerciantul ar fi trebuit sa
 * ceara din nou activarea de la ei, fara sa afle de ce.
 */
export async function activeazaPepita(businessId: string) {
  const g = await poarta(businessId);
  if ("error" in g) return { error: g.error };
  const admin = createAdminClient();

  try {
    const config = await citesteConfigul(businessId);
    const petic: Record<string, unknown> = { activ: true };

    for (const [fel, camp] of [["feed", "feed_token"], ["comenzi", "order_key"]] as const) {
      const existenta = camp === "feed_token" ? config.feed_token : config.order_key;
      if (existenta) {
        /*
         * ⚠ CHEIA EXISTA IN CONFIGURARE, dar amprenta ei poate lipsi sau poate fi
         * revocata (deconectare urmata de reconectare). Se reasaza, ca adresa veche
         * sa functioneze din nou fara sa se schimbe.
         */
        const { error } = await admin.from("pepita_chei").upsert({
          business_id: businessId, fel, amprenta: amprentaCheii(existenta), revocat_la: null,
        } as never, { onConflict: "amprenta" });
        if (error) throw error;
        continue;
      }
      const cheie = cheieNoua();
      const { error } = await admin.from("pepita_chei")
        .insert({ business_id: businessId, fel, amprenta: amprentaCheii(cheie) } as never);
      if (error) throw error;
      petic[camp] = cheie;
    }

    await scrieConfigul(businessId, petic);
  } catch (e) {
    await logError({
      action: "pepita/activare", message: e instanceof Error ? e.message : String(e),
      businessId, severity: "error",
    });
    return { error: "Integrarea nu s-a putut porni." };
  }
  revalidatePath(CALE);
  return { ok: true as const };
}

/**
 * Opreste integrarea si revoca toate cheile.
 *
 * ⚠ COMENZILE SI FACTURILE RAMAN. Se sting numai adresele: feedul raspunde 404 si
 * adresa de comenzi refuza. Istoricul, `order_source.marketplace = "pepita"`,
 * facturile si AWB-urile nu se ating, fiindca ele descriu vanzari care chiar s-au
 * facut.
 *
 * ⚠ SI CHEILE DIN CONFIGURARE SE STERG, nu doar amprentele: altfel o repornire ar
 * fi reinviat exact adresele pe care omul le-a inchis.
 */
export async function deconecteazaPepita(businessId: string) {
  const g = await poarta(businessId);
  if ("error" in g) return { error: g.error };
  try {
    await revocaToate(createAdminClient(), businessId);
    await scrieConfigul(businessId, { activ: false, feed_token: null, order_key: null, trimis_la: null });
  } catch (e) {
    await logError({
      action: "pepita/deconectare", message: e instanceof Error ? e.message : String(e),
      businessId, severity: "error",
    });
    return { error: "Integrarea nu s-a putut opri." };
  }
  revalidatePath(CALE);
  return { ok: true as const };
}

/**
 * Cheie noua, cea veche moare imediat.
 *
 * ⚠ ADRESA VECHE INCETEAZA SA MEARGA IN ACEEASI CLIPA, si asta e chiar rostul. De
 * aceea ecranul cere o confirmare si spune ce urmeaza: trimis la Pepita, noua adresa
 * trebuie pusa in locul celei vechi, altfel feedul lor se opreste.
 */
export async function rotestePepita(businessId: string, fel: "feed" | "comenzi") {
  const g = await poarta(businessId);
  if ("error" in g) return { error: g.error };
  try {
    /*
     * ⚠ ORDINEA: cheia noua se pune, se SCRIE in configurare, si abia apoi se revoca cea
     * veche.
     *
     * Scrisa invers, o pana intre revocare si salvare ar fi lasat magazinul cu adresa veche
     * moarta si cu cea noua pierduta pentru totdeauna: feedul oprit, comenzile refuzate, si
     * nimic de copiat pentru Pepita. De aceea `roteste` primeste aici sarcina de a scrie
     * INTAI, si daca scrierea nu merge, cheia proaspata se stinge la loc.
     */
    const admin = createAdminClient();
    const cheie = cheieNoua();
    const { error: eNoua } = await admin.from("pepita_chei")
      .insert({ business_id: businessId, fel, amprenta: amprentaCheii(cheie) } as never);
    if (eNoua) throw eNoua;

    try {
      await scrieConfigul(businessId, fel === "feed" ? { feed_token: cheie } : { order_key: cheie });
    } catch (eScriere) {
      /* ⚠ Cheia noua se stinge, cea veche ramane in picioare: integrarea continua sa mearga. */
      await admin.from("pepita_chei")
        .update({ revocat_la: new Date().toISOString() } as never)
        .eq("amprenta", amprentaCheii(cheie));
      throw eScriere;
    }

    await stingeCheileVechi(admin, businessId, fel, amprentaCheii(cheie));
  } catch (e) {
    await logError({
      action: "pepita/rotire", message: e instanceof Error ? e.message : String(e),
      details: { fel }, businessId, severity: "error",
    });
    return { error: "Cheia nu s-a putut schimba." };
  }
  revalidatePath(CALE);
  return { ok: true as const };
}

export interface AdresePepita {
  feedProduse: string;
  feedStoc: string;
  comenzi: string;
}

/**
 * Adresele complete, cu chei. Se cer explicit, la apasare.
 *
 * ⚠ SINGURUL LOC DIN APLICATIE DE UNDE IES CHEILE. Daca vreodata mai apare unul,
 * regula „cheia nu coboara odata cu pagina” se pierde fara ca nimic sa dea eroare.
 */
export async function dezvaluieAdresele(businessId: string): Promise<{ adrese: AdresePepita } | { error: string }> {
  const g = await poarta(businessId);
  if ("error" in g) return { error: g.error };
  try {
    const config = await citesteConfigul(businessId);
    if (!config.feed_token || !config.order_key) {
      return { error: "Integrarea nu are încă adrese. Pornește-o mai întâi." };
    }
    return {
      adrese: {
        feedProduse: adresaFeedProduse(config.feed_token),
        feedStoc: adresaFeedStoc(config.feed_token),
        comenzi: adresaComenzi(config.order_key),
      },
    };
  } catch (e) {
    await logError({
      action: "pepita/adrese", message: e instanceof Error ? e.message : String(e),
      businessId, severity: "error",
    });
    return { error: "Adresele nu s-au putut citi." };
  }
}

/** Comerciantul a marcat ca a trimis datele catre Pepita. */
export async function marcheazaTrimis(businessId: string, trimis: boolean) {
  const g = await poarta(businessId);
  if ("error" in g) return { error: g.error };
  try {
    await scrieConfigul(businessId, { trimis_la: trimis ? new Date().toISOString() : null });
  } catch {
    return { error: "Nu s-a putut salva." };
  }
  revalidatePath(CALE);
  return { ok: true as const };
}

/* ═══════════════════════════════════════════════════════════════════════════
   STAREA INTEGRARII
   ═══════════════════════════════════════════════════════════════════════════ */

export interface StarePepita {
  config: ReturnType<typeof configFaraChei>;
  /** Cand a citit Pepita ultima oara un feed. `null` = niciodata. */
  ultimaCitire: string | null;
  comenziTotal: number;
  comenziCarantina: number;
  ultimaComanda: string | null;
}

export async function getStarePepita(businessId: string): Promise<StarePepita | { error: string }> {
  const g = await poarta(businessId);
  if ("error" in g) return { error: g.error };
  const admin = createAdminClient();

  try {
    const config = await citesteConfigul(businessId);

    const [chei, total, carantina, ultima] = await Promise.all([
      admin.from("pepita_chei").select("ultima_folosire")
        .eq("business_id", businessId).eq("fel", "feed").is("revocat_la", null)
        .order("ultima_folosire", { ascending: false, nullsFirst: false }).limit(1),
      admin.from("pepita_comenzi").select("id", { count: "exact", head: true }).eq("business_id", businessId),
      admin.from("pepita_comenzi").select("id", { count: "exact", head: true })
        .eq("business_id", businessId).neq("stare", "importata"),
      admin.from("pepita_comenzi").select("primit_la")
        .eq("business_id", businessId).order("primit_la", { ascending: false }).limit(1),
    ]);

    return {
      config: configFaraChei(config),
      ultimaCitire: (chei.data?.[0] as { ultima_folosire: string | null } | undefined)?.ultima_folosire ?? null,
      comenziTotal: total.count ?? 0,
      comenziCarantina: carantina.count ?? 0,
      ultimaComanda: (ultima.data?.[0] as { primit_la: string } | undefined)?.primit_la ?? null,
    };
  } catch (e) {
    await logError({
      action: "pepita/stare", message: e instanceof Error ? e.message : String(e),
      businessId, severity: "error",
    });
    return { error: "Starea integrării nu s-a putut citi." };
  }
}

/* ═══════════════════════════════════════════════════════════════════════════
   PRODUSELE
   ═══════════════════════════════════════════════════════════════════════════ */

export interface ProdusInPanou {
  id: string;
  nume: string;
  inclus: boolean;
  articole: number;
  probleme: ProblemaPepita[];
}

export interface RezumatProduse {
  /** Cate produse active are magazinul. */
  active: number;
  /** Cate ar pleca in feed. */
  incluse: number;
  /** Cate dintre cele incluse au cel putin o eroare. */
  cuErori: number;
  /** Cate articole ar avea feedul (o combinatie aplatizata e un articol). */
  articole: number;
  /**
   * Verificarea s-a oprit inainte de capatul catalogului.
   *
   * ⚠ SE SPUNE, NU SE ASCUNDE. Un „143 eligibile” calculat pe primele zece mii de
   * produse dintr-un catalog de treizeci de mii ar fi o cifra linistitoare si falsa.
   */
  partial: boolean;
  /**
   * Articole trimise candva la Pepita si care azi nu se mai produc.
   *
   * ⚠ CEL MAI DES E O REDENUMIRE. In Edinio, schimbarea unei valori de varianta CHIAR
   * distruge combinatia (`generateCombinations` o cauta dupa titlu), deci la Pepita apare un
   * produs nou, iar cel vechi ramane acolo, orfan, si se poate vinde in continuare.
   *
   * ⚠ NU-L PUTEM STERGE NOI: feedul nu are cum sa spuna „scoate produsul asta", si nu exista
   * niciun API. Singurul lucru cinstit e sa i-l ARATAM comerciantului.
   */
  orfane: number;
  exempleOrfane: string[];
  produse: ProdusInPanou[];
}

/** Cate produse se verifica cel mult intr-o trecere. */
const PLAFON_VERIFICARE = 10_000;
const PAGINA = 500;

/**
 * Verifica produsele si spune ce pleaca si ce nu.
 *
 * ⚠ ACEEASI HOTARARE CA FEEDUL, nu una scrisa pentru ecran: se cheama
 * `articolelePentruProdus`, chiar functia pe care o foloseste generatorul. O a doua
 * lista de reguli s-ar fi departat de prima, si atunci panoul ar fi spus „toate
 * pleaca" despre un feed care sare produse.
 */
export async function verificaProdusePepita(
  businessId: string, plafonListate = 100,
): Promise<RezumatProduse | { error: string }> {
  const g = await poarta(businessId);
  if ("error" in g) return { error: g.error };
  const admin = createAdminClient();

  try {
    const pre = await pregateste(admin, businessId);
    if (!pre) return { error: "Integrarea nu este pornită." };

    let active = 0, incluse = 0, cuErori = 0, articole = 0;
    let partial = false;
    const produse: ProdusInPanou[] = [];
    /* Id-urile pe care feedul le-ar trimite ACUM. Se compara cu ce s-a trimis vreodata. */
    const deAcum = new Set<string>();

    for (let de = 0; de < PLAFON_VERIFICARE; de += PAGINA) {
      const randuri = randuriCitite<ProdusPepita & { is_active: boolean }>(
        "pepita.verificaProduse",
        /* ⚠ ACEEASI lista de coloane ca feedul, din acelasi loc. O a doua copie s-ar fi
           departat, iar panoul ar fi judecat produsul dupa alte campuri decat generatorul. */
        await admin.from("products").select(COLOANE_PRODUS)
          .eq("business_id", businessId).eq("is_active", true)
          .order("id").range(de, de + PAGINA - 1) as never,
      );
      if (randuri.length === 0) break;
      active += randuri.length;

      for (const p of randuri) {
        const rand = pre.listari.get(p.id);
        const eInclus = pre.config.mod_includere === "toate" ? (rand ? rand.inclus : true) : (rand ? rand.inclus : false);
        if (!eInclus) continue;
        incluse++;

        const r = articolelePentruProdus(
          { ...p, price: rand?.pret_override ?? p.price },
          { ...pre.ctx, safetyStock: rand?.safety_stock ?? pre.config.safety_stock },
        );
        articole += r.articole.length;
        for (const a of r.articole) deAcum.add(a.id);
        const areErori = r.probleme.some((x) => x.nivel === "eroare");
        if (areErori) cuErori++;
        /*
         * ⚠ In lista se aduna intai produsele cu probleme: comerciantul deschide
         * ecranul ca sa afle ce nu merge, nu ca sa se uite la ce merge.
         */
        if (r.probleme.length > 0 && produse.length < plafonListate) {
          produse.push({ id: p.id, nume: p.name, inclus: true, articole: r.articole.length, probleme: r.probleme });
        }
      }

      if (randuri.length < PAGINA) break;
      if (de + PAGINA >= PLAFON_VERIFICARE) partial = true;
    }

    /*
     * ⚠ Orfanii se socotesc DUPA ce s-a trecut prin tot catalogul, si numai daca s-a trecut
     * prin tot: pe o verificare taiata la plafon, orice articol dintr-o pagina necitita ar fi
     * parut orfan. Un avertisment fals despre produse care se vand foarte bine se invata
     * repede sa fie ignorat.
     */
    const exempleOrfane: string[] = [];
    let orfane = 0;
    if (!partial) {
      for (let de = 0; ; de += 1000) {
        const { data, error } = await admin
          .from("pepita_articole").select("articol_id, combinatie")
          .eq("business_id", businessId).order("articol_id").range(de, de + 999);
        if (error) throw error;
        const randuri = (data ?? []) as { articol_id: string; combinatie: string }[];
        for (const r of randuri) {
          if (deAcum.has(r.articol_id)) continue;
          orfane++;
          if (exempleOrfane.length < 20) exempleOrfane.push(r.combinatie || r.articol_id);
        }
        if (randuri.length < 1000) break;
      }
    }

    return { active, incluse, cuErori, articole, partial, orfane, exempleOrfane, produse };
  } catch (e) {
    await logError({
      action: "pepita/verificare", message: e instanceof Error ? e.message : String(e),
      businessId, severity: "error",
    });
    return { error: "Produsele nu s-au putut verifica." };
  }
}

export interface RandProdusPepita {
  id: string;
  nume: string;
  sku: string | null;
  inclus: boolean;
}

/**
 * Produsele active ale magazinului, cu bifa „pleaca pe Pepita”.
 *
 * ⚠ SE CITESTE O SINGURA PAGINA, cu cautare. Un ecran care ar incarca toate cele
 * zece mii de produse ar fi o pagina care nu se mai deschide de pe telefon, si
 * niciun comerciant nu bifeaza zece mii de randuri cu mana. Pentru „toate” exista
 * comutatorul din setari.
 */
export async function listaProdusePepita(
  businessId: string, cauta = "", pagina = 0,
): Promise<{ produse: RandProdusPepita[]; maiSunt: boolean } | { error: string }> {
  const g = await poarta(businessId);
  if ("error" in g) return { error: g.error };
  const admin = createAdminClient();
  const PE_PAGINA = 50;

  try {
    let q = admin.from("products").select("id, name, sku")
      .eq("business_id", businessId).eq("is_active", true);
    const termen = cauta.trim();
    /* ⚠ Termenul se curata de `%`, `_` si virgula: primele doua sunt joker in `ilike`, iar
       virgula desparte filtrele in PostgREST si ar rupe cererea. */
    if (termen) q = q.ilike("name", `%${termen.replace(/[%_,]/g, " ")}%`);

    const { data, error } = await q.order("name").range(pagina * PE_PAGINA, pagina * PE_PAGINA + PE_PAGINA);
    if (error) throw error;
    const randuri = (data ?? []) as { id: string; name: string; sku: string | null }[];
    const maiSunt = randuri.length > PE_PAGINA;
    const felie = maiSunt ? randuri.slice(0, PE_PAGINA) : randuri;

    const config = await citesteConfigul(businessId);
    const listari = new Map<string, boolean>();
    if (felie.length > 0) {
      const { data: l, error: eL } = await admin.from("pepita_listari").select("product_id, inclus")
        .eq("business_id", businessId).in("product_id", felie.map((p) => p.id));
      if (eL) throw eL;
      for (const r of (l ?? []) as { product_id: string; inclus: boolean }[]) listari.set(r.product_id, r.inclus);
    }

    return {
      produse: felie.map((p) => ({
        id: p.id, nume: p.name, sku: p.sku,
        inclus: listari.has(p.id)
          ? listari.get(p.id)!
          : config.mod_includere === "toate",
      })),
      maiSunt,
    };
  } catch (e) {
    await logError({
      action: "pepita/lista-produse", message: e instanceof Error ? e.message : String(e),
      businessId, severity: "error",
    });
    return { error: "Lista de produse nu s-a putut citi." };
  }
}

/**
 * Include toate produsele active ale magazinului.
 *
 * ⚠ SCRIE RANDURI, nu schimba modul. Comerciantul poate apoi scoate produse anume,
 * iar modul „doar cele alese” ramane cel care hotaraste ce se intampla cu produsele
 * ADAUGATE MAINE: pe „toate” ar pleca singure, pe „alese” nu. Doua intelesuri
 * diferite, deci doua comenzi diferite.
 */
export async function includeToateProdusePepita(businessId: string, dupa?: string | null) {
  const g = await poarta(businessId);
  if ("error" in g) return { error: g.error };
  const admin = createAdminClient();

  try {
    const r = await includeToateActive(admin, businessId, dupa ?? null, new Date().toISOString());

    /*
     * NUMITORUL. O citire ieftina, doar numaratoare, ca omul sa vada „12.000 din 25.000" in loc
     * de un numar singur din care nu se poate afla daca s-a terminat.
     */
    const { count } = await admin.from("products")
      .select("id", { count: "exact", head: true })
      .eq("business_id", businessId).eq("is_active", true);

    revalidatePath(CALE);
    return { ok: true as const, scrise: r.scrise, incomplet: r.incomplet, dupa: r.dupa, dinCate: count ?? null };
  } catch (e) {
    await logError({
      action: "pepita/include-toate", message: e instanceof Error ? e.message : String(e),
      businessId, severity: "error",
    });
    return { error: "Produsele nu s-au putut include." };
  }
}

/** Include sau scoate produse din feed. */
export async function setareProdusePepita(
  businessId: string, productIds: string[], inclus: boolean,
) {
  const g = await poarta(businessId);
  if ("error" in g) return { error: g.error };
  const ids = [...new Set(productIds.filter(Boolean))];
  if (ids.length === 0) return { ok: true as const, atinse: 0 };
  if (ids.length > 5000) return { error: "Prea multe produse deodată. Alege cel mult 5000." };

  const admin = createAdminClient();
  try {
    /*
     * ⚠ SE VERIFICA CA PRODUSELE SUNT ALE MAGAZINULUI. Citim cu cheia de serviciu,
     * deci RLS nu mai apara, iar lista de id-uri vine din browser. Fara pasul asta,
     * un id strain ar fi scris un rand care leaga magazinul A de produsul lui B.
     */
    const aleLui = new Set<string>();
    for (let i = 0; i < ids.length; i += 200) {
      const { data, error } = await admin.from("products").select("id")
        .eq("business_id", businessId).in("id", ids.slice(i, i + 200));
      if (error) throw error;
      for (const r of (data ?? []) as { id: string }[]) aleLui.add(r.id);
    }
    const bune = ids.filter((id) => aleLui.has(id));
    if (bune.length === 0) return { error: "Niciun produs valid." };

    const acum = new Date().toISOString();
    const { error } = await admin.from("pepita_listari").upsert(
      bune.map((product_id) => ({ business_id: businessId, product_id, inclus, actualizat_la: acum })) as never,
      { onConflict: "business_id,product_id" },
    );
    if (error) throw error;
    revalidatePath(CALE);
    return { ok: true as const, atinse: bune.length };
  } catch (e) {
    await logError({
      action: "pepita/listari", message: e instanceof Error ? e.message : String(e),
      details: { cate: ids.length, inclus }, businessId, severity: "error",
    });
    return { error: "Produsele nu s-au putut salva." };
  }
}

/* ═══════════════════════════════════════════════════════════════════════════
   COMENZILE PROBLEMATICE
   ═══════════════════════════════════════════════════════════════════════════ */

/**
 * Incearca din nou o comanda ramasa in carantina.
 *
 * ⚠ IDEMPOTENTA SI DIN AFARA: a doua apasare pe o comanda deja reparata nu face nimic si
 * spune asta. Socoteala e in `reproceseaza`, aceeasi pe care o foloseste si retrimiterea lor,
 * ca sa nu existe doua adevaruri despre aceeasi comanda.
 */
export async function reproceseazaComandaPepita(businessId: string, externalId: string) {
  const g = await poarta(businessId);
  if ("error" in g) return { error: g.error };
  const admin = createAdminClient();
  try {
    /* ⚠ `currency` cerut anume: fara el, moneda magazinului ar veni `undefined`. */
    const { data: setari } = await admin
      .from("store_settings").select("currency").eq("business_id", businessId).maybeSingle();
    const monedaMagazin = String((setari as { currency?: string } | null)?.currency ?? "RON").toUpperCase();

    const r = await reproceseaza(admin, { businessId, monedaMagazin }, externalId);
    revalidatePath(CALE);
    return r;
  } catch (e) {
    await logError({
      action: "pepita/reprocesare", message: e instanceof Error ? e.message : String(e),
      businessId, severity: "error",
    });
    return { error: "Comanda nu s-a putut reprocesa." };
  }
}

export interface ComandaProblema {
  externalId: string;
  primitLa: string;
  stare: string;
  motiv: string | null;
  orderId: string | null;
}

export async function getComenziProblemaPepita(businessId: string): Promise<ComandaProblema[] | { error: string }> {
  const g = await poarta(businessId);
  if ("error" in g) return { error: g.error };
  try {
    const { data, error } = await createAdminClient()
      .from("pepita_comenzi").select("external_order_id, primit_la, stare, motiv, order_id")
      .eq("business_id", businessId).neq("stare", "importata")
      .order("primit_la", { ascending: false }).limit(50);
    if (error) throw error;
    return (data ?? []).map((r) => {
      const x = r as { external_order_id: string; primit_la: string; stare: string; motiv: string | null; order_id: string | null };
      return { externalId: x.external_order_id, primitLa: x.primit_la, stare: x.stare, motiv: x.motiv, orderId: x.order_id };
    });
  } catch (e) {
    await logError({
      action: "pepita/comenzi-problema", message: e instanceof Error ? e.message : String(e),
      businessId, severity: "error",
    });
    return { error: "Lista nu s-a putut citi." };
  }
}
