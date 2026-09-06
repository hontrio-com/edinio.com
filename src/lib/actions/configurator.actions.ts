"use server";

/**
 * Configuratoarele, dinspre panou.
 *
 * ═══ ⚠ FIECARE EXPORT DE AICI E UN CAPAT HTTP PUBLIC ═══
 *
 * Nu doar rutele. Orice functie exportata dintr-un modul „use server" primeste un identificator
 * si poate fi chemata de oricine, cu ce argumente vrea — iar manifestul e GLOBAL, deci nu conteaza
 * de pe ce pagina se cheama. De aceea:
 *
 *   - niciun `businessId` nu vine ca argument: se rezolva mereu din sesiune, prin `magazinulMeu`;
 *   - fiecare id primit se VERIFICA fata de magazin inainte de orice scriere;
 *   - citirile trec prin clientul UTILIZATORULUI, deci RLS lucreaza a doua oara peste noi.
 *
 * Nu se exporta niciun ajutor de aici. Un `export function` „privat prin conventie" ar fi tot un
 * capat public.
 *
 * ═══ ⚠ ORICE SCRIERE DE AICI TREBUIE SA MURDAREASCA PROIECTIA DE CATALOG ═══
 *
 * Cardul din grila citeste `catalog_produs.cere_configurare` si `pret_pornire`, iar modelul ala
 * se reimprospateaza dintr-un singur loc: declansatorul de pe `products`. Niciuna dintre
 * actiunile de mai jos nu atinge `products`, deci declansatorul NU se aprinde pentru ele — si
 * fara marcare cardul n-ar minti pana la urmatorul cron, ci PANA CAND CINEVA SALVEAZA PRODUSUL
 * DE MANA. Vezi `configurators/murdareste.ts`, si proba de contract
 * `configurator-actiuni-murdaresc.test.ts`, care cade daca o actiune noua uita.
 */

import { revalidatePath } from "next/cache";
import { esteAlMagazinului, magazinulMeu } from "@/lib/auth/magazinul-meu";
import { extindeCategoriile } from "@/lib/offers/offer-pricing";
import { logError } from "@/lib/error-logger";
import { citesteContinut } from "@/lib/configurators/citeste";
import { compileaza } from "@/lib/configurators/compileaza";
import { valideaza, type Constatare } from "@/lib/configurators/validare";
import {
  murdaresteCategoriile, murdaresteConfiguratorul, murdaresteSiProiecteaza,
} from "@/lib/configurators/murdareste";
import type { Json } from "@/types/database.types";

const CALEA = "/dashboard/products/configurators";

/* ═══════════════════════════════════════════════════════════════════════════
   FORME
   ═══════════════════════════════════════════════════════════════════════════ */

export interface RandLista {
  id: string;
  nume: string;
  stare: string;
  /** Cate produse ii sunt legate direct. Excluderile nu se numara. */
  produse: number;
  categorii: number;
  pasi: number;
  optiuni: number;
  versiune: number | null;
  updated_at: string;
}

export interface ConfiguratorIncarcat {
  id: string;
  nume: string;
  stare: string;
  revizie: number;
  versiuneActiva: number | null;
  /** Ciorna, deja parsata si curatata. */
  continut: ReturnType<typeof citesteContinut>;
}

type Raspuns<T = undefined> =
  | { error: string }
  | ({ success: true } & (T extends undefined ? object : T));

/* ═══════════════════════════════════════════════════════════════════════════
   CITIRE
   ═══════════════════════════════════════════════════════════════════════════ */

export async function listeazaConfiguratoare(): Promise<{ error: string } | { success: true; randuri: RandLista[] }> {
  const a = await magazinulMeu();
  if (!a.ok) return { error: a.error };

  /*
   * ⚠ O SINGURA INTEROGARE, cu numaratorile agregate de PostgREST.
   *
   * Numarate in cod, ar fi insemnat cate doua cereri pe fiecare rand — adica exact tiparul N+1
   * pe care il refuza planul, si care aici s-ar fi vazut de la al zecelea configurator.
   */
  const { data, error } = await a.supabase
    .from("configuratoare")
    .select("id, nume, stare, ciorna, updated_at, configurator_produse(count), configurator_categorii(count), configurator_versiuni!configurator_versiuni_configurator_id_fkey(numar)")
    .eq("business_id", a.magazin.id)
    .order("updated_at", { ascending: false })
    .limit(200);

  if (error) {
    logError({ action: "configurator.listeaza", message: error.message, businessId: a.magazin.id, severity: "warning" });
    return { error: "Nu am putut citi configuratoarele. Incearca din nou." };
  }

  const randuri: RandLista[] = (data ?? []).map((r) => {
    const c = citesteContinut(r.ciorna);
    const optiuni = c.definitie.pasi.reduce(
      (s, p) => s + p.grupuri.reduce((t, g) => t + g.noduri.length, 0), 0);
    const versiuni = (r.configurator_versiuni ?? []) as { numar: number }[];
    return {
      id: r.id,
      nume: r.nume,
      stare: r.stare,
      produse: numarul(r.configurator_produse),
      categorii: numarul(r.configurator_categorii),
      pasi: c.definitie.pasi.length,
      optiuni,
      versiune: versiuni.length ? Math.max(...versiuni.map((v) => v.numar)) : null,
      updated_at: r.updated_at,
    };
  });

  return { success: true, randuri };
}

/** Numaratoarea agregata a lui PostgREST: `[{count: n}]`, sau lipsa cand nu e nimic. */
function numarul(v: unknown): number {
  if (Array.isArray(v) && v[0] && typeof v[0] === "object") {
    const n = (v[0] as { count?: unknown }).count;
    return typeof n === "number" ? n : 0;
  }
  return 0;
}

export async function incarcaConfigurator(
  id: string,
): Promise<{ error: string } | { success: true; configurator: ConfiguratorIncarcat }> {
  const a = await magazinulMeu();
  if (!a.ok) return { error: a.error };

  const { data, error } = await a.supabase
    .from("configuratoare")
    .select("id, nume, stare, revizie, ciorna, versiune_activa_id")
    .eq("id", id)
    .eq("business_id", a.magazin.id)
    .maybeSingle();

  if (error) return { error: "Nu am putut citi configuratorul. Incearca din nou." };
  if (!data) return { error: "Configuratorul nu exista." };

  let versiuneActiva: number | null = null;
  if (data.versiune_activa_id) {
    const { data: v } = await a.supabase
      .from("configurator_versiuni").select("numar").eq("id", data.versiune_activa_id).maybeSingle();
    versiuneActiva = v?.numar ?? null;
  }

  return {
    success: true,
    configurator: {
      id: data.id, nume: data.nume, stare: data.stare, revizie: data.revizie,
      versiuneActiva, continut: citesteContinut(data.ciorna),
    },
  };
}

/* ═══════════════════════════════════════════════════════════════════════════
   SCRIERE
   ═══════════════════════════════════════════════════════════════════════════ */

export async function creeazaConfigurator(nume: string): Promise<{ error: string } | { success: true; id: string }> {
  const a = await magazinulMeu();
  if (!a.ok) return { error: a.error };

  const curat = (nume ?? "").trim().slice(0, 120);
  if (!curat) return { error: "Da-i un nume configuratorului." };

  const { data, error } = await a.supabase
    .from("configuratoare")
    .insert({
      business_id: a.magazin.id,
      nume: curat,
      ciorna: { definitie: { versiuneSchema: 1, mod: "auto", pasi: [] }, reguli: [], pretuire: { baza: "produs" } } as unknown as Json,
    })
    .select("id")
    .single();

  if (error || !data) {
    logError({ action: "configurator.creeaza", message: error?.message ?? "fara rand", businessId: a.magazin.id, severity: "warning" });
    return { error: "Nu am putut crea configuratorul. Incearca din nou." };
  }
  revalidatePath(CALEA);
  return { success: true, id: data.id };
}

/**
 * Salveaza ciorna.
 *
 * ⚠ CONCURENTA OPTIMISTA. Doi oameni pot avea aceeasi ciorna deschisa. Scrierea cere revizia de
 * la care a pornit editorul si o refuza daca s-a schimbat intre timp — altfel ultimul care apasa
 * Salveaza sterge tacit munca celuilalt.
 *
 * Verificarea si incrementul se fac in ACEEASI instructiune (`update ... where revizie = ...`),
 * nu citind si apoi scriind: intre cele doua ar fi incaput exact salvarea celuilalt.
 */
export async function salveazaCiorna(
  id: string,
  continut: unknown,
  revizieAsteptata: number,
): Promise<{ error: string; conflict?: true } | { success: true; revizie: number }> {
  const a = await magazinulMeu();
  if (!a.ok) return { error: a.error };

  // ⚠ Se scrie ce am CITIT si curatat, nu ce a trimis browserul. Asa in coloana nu poate ajunge
  // nimic ce motorul n-ar sti sa citeasca inapoi.
  const curat = citesteContinut(continut);

  const { data, error } = await a.supabase
    .from("configuratoare")
    .update({ ciorna: curat as unknown as Json, revizie: revizieAsteptata + 1 })
    .eq("id", id)
    .eq("business_id", a.magazin.id)
    .eq("revizie", revizieAsteptata)
    .select("revizie")
    .maybeSingle();

  if (error) {
    logError({ action: "configurator.salveazaCiorna", message: error.message, businessId: a.magazin.id, severity: "warning" });
    return { error: "Nu am putut salva. Incearca din nou." };
  }
  if (!data) {
    /*
     * ⚠ Zero randuri inseamna DOUA lucruri diferite: revizia s-a schimbat, sau configuratorul
     * nu e al acestui magazin. Se deosebesc, fiindca al doilea caz nu se repara reincarcand.
     */
    const { data: exista } = await a.supabase
      .from("configuratoare").select("revizie").eq("id", id).eq("business_id", a.magazin.id).maybeSingle();
    if (!exista) return { error: "Configuratorul nu exista." };
    return {
      error: "Configuratorul a fost modificat de altcineva intre timp. Reincarca pagina ca sa nu pierzi ce a facut.",
      conflict: true,
    };
  }

  return { success: true, revizie: data.revizie };
}

export async function redenumesteConfigurator(id: string, nume: string): Promise<Raspuns> {
  const a = await magazinulMeu();
  if (!a.ok) return { error: a.error };
  const curat = (nume ?? "").trim().slice(0, 120);
  if (!curat) return { error: "Da-i un nume configuratorului." };

  const { data, error } = await a.supabase
    .from("configuratoare").update({ nume: curat })
    .eq("id", id).eq("business_id", a.magazin.id).select("id").maybeSingle();
  if (error) return { error: "Nu am putut redenumi. Incearca din nou." };
  if (!data) return { error: "Configuratorul nu exista." };
  revalidatePath(CALEA);
  return { success: true };
}

/* ═══════════════════════════════════════════════════════════════════════════
   PUBLICAREA
   ═══════════════════════════════════════════════════════════════════════════ */

export interface RezultatPublicare {
  success: true;
  versiune: number;
  /** Ce s-a gasit si NU opreste. Comerciantul le vede oricum. */
  avertismente: Constatare[];
}

/**
 * Publica ciorna ca versiune noua.
 *
 * ═══ ⚠ ATOMIC PENTRU VITRINA ═══
 *
 * Versiunea se scrie INTREAGA — cu tot cu ce s-a compilat pentru vitrina — si abia dupa aceea se
 * muta pointerul `versiune_activa_id`. Deci nu exista nicio clipa in care magazinul serveste o
 * versiune pe jumatate: ori pointerul arata spre cea veche, ori spre una completa.
 *
 * Daca scrierea versiunii reuseste si mutarea pointerului cade, ramane o versiune orfana. E
 * neplacut, dar inofensiv: nimeni nu o serveste, iar urmatoarea publicare merge mai departe.
 * Invers — pointer mutat spre o versiune incompleta — ar fi vandut dupa reguli lipsa.
 *
 * ⚠ NUMARUL VERSIUNII se ia din `max + 1`, ceea ce se poate ciocni cand doi oameni publica in
 * aceeasi clipa. Nu se apara cu un lacat, ci cu constrangerea de unicitate din baza: a doua
 * scriere pica, si se reincearca O DATA. Un lacat ar fi fost inca un lucru care se poate bloca.
 */
export async function publicaConfigurator(id: string): Promise<{ error: string; constatari?: Constatare[] } | RezultatPublicare> {
  const a = await magazinulMeu();
  if (!a.ok) return { error: a.error };

  const { data: rand, error } = await a.supabase
    .from("configuratoare").select("id, ciorna").eq("id", id).eq("business_id", a.magazin.id).maybeSingle();
  if (error) return { error: "Nu am putut citi configuratorul. Incearca din nou." };
  if (!rand) return { error: "Configuratorul nu exista." };

  const continut = citesteContinut(rand.ciorna);
  const verdict = valideaza({
    definitie: continut.definitie, reguli: continut.reguli, pretuire: continut.pretuire,
  });
  if (!verdict.sePoatePublica) {
    return {
      error: "Configuratorul nu se poate publica inca. Vezi ce e de reparat.",
      constatari: verdict.constatari,
    };
  }

  const compilat = compileaza(continut.definitie, continut.reguli, continut.pretuire);

  for (let incercare = 0; incercare < 2; incercare++) {
    const { data: ultima } = await a.supabase
      .from("configurator_versiuni").select("numar")
      .eq("configurator_id", id).order("numar", { ascending: false }).limit(1).maybeSingle();
    const numar = (ultima?.numar ?? 0) + 1;

    const { data: versiune, error: eVers } = await a.supabase
      .from("configurator_versiuni")
      .insert({
        business_id: a.magazin.id, configurator_id: id, numar,
        definitie: continut.definitie as unknown as Json,
        reguli: continut.reguli as unknown as Json,
        pretuire: continut.pretuire as unknown as Json,
        compilat: compilat as unknown as Json,
        publicat_de: a.userId,
      })
      .select("id, numar").single();

    if (eVers) {
      // Ciocnire pe `(configurator_id, numar)`: altcineva a publicat intre timp. Se reia o data.
      if (incercare === 0) continue;
      logError({ action: "configurator.publica", message: eVers.message, businessId: a.magazin.id, severity: "error" });
      return { error: "Nu am putut publica. Incearca din nou." };
    }

    const { error: ePointer } = await a.supabase
      .from("configuratoare")
      .update({ versiune_activa_id: versiune.id, stare: "activ" })
      .eq("id", id).eq("business_id", a.magazin.id);

    if (ePointer) {
      logError({ action: "configurator.publica.pointer", message: ePointer.message, businessId: a.magazin.id, severity: "error" });
      return { error: "Versiunea s-a scris, dar nu am putut-o face activa. Incearca din nou." };
    }

    /*
     * ⚠ Publicarea schimba raspunsul pentru TOATE produsele configuratorului deodata — si e
     * chiar clipa in care un configurator inca nepublicat devine vizibil pe carduri, fiindca
     * pointerul de mai sus il face si `activ`. Fara marcare, primul cumparator ar fi vazut un
     * card „Adauga in cos" pe un produs care de acum cere configurare.
     *
     * Fara `proiecteazaImediat`: numarul de produse atinse e nemarginit.
     */
    await murdaresteConfiguratorul(a.supabase, a.magazin.id, id);
    revalidatePath(CALEA);
    return {
      success: true,
      versiune: versiune.numar,
      avertismente: verdict.constatari.filter((c) => c.treapta === "atentie"),
    };
  }

  return { error: "Nu am putut publica. Incearca din nou." };
}

/* ═══════════════════════════════════════════════════════════════════════════
   STARE SI STERGERE
   ═══════════════════════════════════════════════════════════════════════════ */

export async function schimbaStareaConfiguratorului(id: string, stare: string): Promise<Raspuns> {
  const a = await magazinulMeu();
  if (!a.ok) return { error: a.error };
  if (!["activ", "dezactivat", "arhivat"].includes(stare)) return { error: "Stare necunoscuta." };

  /*
   * ⚠ Un configurator care n-a fost publicat NICIODATA nu poate deveni „activ": n-are ce servi.
   * Fara verificarea asta, produsele legate de el ar fi ramas cu un configurator care nu exista.
   */
  if (stare === "activ") {
    const { data } = await a.supabase
      .from("configuratoare").select("versiune_activa_id")
      .eq("id", id).eq("business_id", a.magazin.id).maybeSingle();
    if (!data?.versiune_activa_id) return { error: "Publica-l mai intai, ca sa aiba ce servi." };
  }

  const { data, error } = await a.supabase
    .from("configuratoare").update({ stare })
    .eq("id", id).eq("business_id", a.magazin.id).select("id").maybeSingle();
  if (error) return { error: "Nu am putut schimba starea. Incearca din nou." };
  if (!data) return { error: "Configuratorul nu exista." };
  /*
   * ⚠ Oprirea e cazul care doare mai tare decat pornirea. Un configurator dezactivat sau arhivat
   * nu se mai serveste pe pagina de produs, dar cardurile ar fi ramas cu „Alege optiunile" si cu
   * un pret de pornire care nu mai exista — adica un buton care duce intr-o pagina obisnuita, si
   * un pret pe care magazinul nu-l mai practica.
   */
  await murdaresteConfiguratorul(a.supabase, a.magazin.id, id);
  revalidatePath(CALEA);
  return { success: true };
}

/**
 * Sterge configuratorul.
 *
 * ⚠ NUMAI daca n-a fost publicat niciodata. O versiune publicata poate sta in instantaneul unei
 * comenzi de acum trei luni; stearsa, comanda ar fi ramas cu o configuratie pe care n-o mai poate
 * explica nimeni. Restul se ARHIVEAZA.
 */
export async function stergeConfigurator(id: string): Promise<Raspuns> {
  const a = await magazinulMeu();
  if (!a.ok) return { error: a.error };

  const { data: versiuni, error: eV } = await a.supabase
    .from("configurator_versiuni").select("id").eq("configurator_id", id).eq("business_id", a.magazin.id).limit(1);
  if (eV) return { error: "Nu am putut verifica versiunile. Incearca din nou." };
  if ((versiuni ?? []).length > 0) {
    return { error: "A fost publicat cel putin o data, deci poate sta in comenzi vechi. Arhiveaza-l." };
  }

  const { error } = await a.supabase
    .from("configuratoare").delete().eq("id", id).eq("business_id", a.magazin.id);
  if (error) return { error: "Nu am putut sterge. Incearca din nou." };
  revalidatePath(CALEA);
  return { success: true };
}

/* ═══════════════════════════════════════════════════════════════════════════
   APLICAREA: pe ce produse se pune configuratorul
   ═══════════════════════════════════════════════════════════════════════════ */

/**
 * ⚠ TREI FELURI DE LEGATURA, SI DE CE NU-S DOUA.
 *
 *   - DIRECTA pe produs: comerciantul a spus explicit, deci bate orice.
 *   - Pe CATEGORIE: se aplica tuturor produselor din ea si din subarbore, si celor viitoare.
 *   - EXCLUDERE: scoate un singur produs de sub o mostenire de categorie.
 *
 * Fara excludere, singurul fel de a scoate un produs dintr-o categorie configurata ar fi fost
 * sa-l muti in alta categorie — adica sa strici asezarea magazinului ca sa repari un pret.
 */

export interface ProdusScurt {
  id: string;
  nume: string;
  categorie: string | null;
  imagine: string | null;
}

export interface ProdusGasit extends ProdusScurt {
  /** Numele configuratorului care l-a luat deja direct, cand nu e chiar al nostru. */
  luatDe: string | null;
}

export interface Aplicare {
  /** Legate direct. */
  produse: ProdusScurt[];
  /** Scoase anume de sub mostenirea din categorie. */
  excluse: ProdusScurt[];
  categorii: string[];
  /** Categoriile magazinului, ca sa se poata alege dintre ele. */
  categoriiDisponibile: string[];
}

/** Cate id-uri se primesc dintr-o data. `.in()` pleaca in ADRESA: peste ~700 cade cererea. */
const MAXIM_PE_LOT = 200;

/** Lista venita de la client, adusa la o forma in care se poate lucra. */
function idsCurate(v: unknown): string[] {
  if (!Array.isArray(v)) return [];
  const out: string[] = [];
  const vazute = new Set<string>();
  for (const x of v) {
    if (typeof x !== "string") continue;
    const t = x.trim();
    if (!t || vazute.has(t)) continue;
    vazute.add(t);
    out.push(t);
    if (out.length >= MAXIM_PE_LOT) break;
  }
  return out;
}

/** Prima imagine a produsului, cand are. */
function primaImagine(v: unknown): string | null {
  if (!Array.isArray(v)) return null;
  for (const x of v) if (typeof x === "string" && x.trim()) return x;
  return null;
}

function scurt(p: { id: string; name: string; category: string | null; images: unknown }): ProdusScurt {
  return { id: p.id, nume: p.name, categorie: p.category, imagine: primaImagine(p.images) };
}

/**
 * Configuratorul se aplica la ce, acum.
 *
 * ⚠ Se cer si categoriile magazinului, in aceeasi trecere. Ecranul are nevoie de ele ca sa poata
 * alege, iar o a doua chemare doar pentru asta ar fi insemnat inca un dus-intors la fiecare
 * deschidere a filei.
 */
export async function citesteAplicarea(
  id: string,
): Promise<{ error: string } | { success: true; aplicare: Aplicare }> {
  const a = await magazinulMeu();
  if (!a.ok) return { error: a.error };
  if (!(await esteAlMagazinului(a.supabase, "configuratoare", id, a.magazin.id))) {
    return { error: "Configuratorul nu exista." };
  }

  const [legaturi, categorii, arbore] = await Promise.all([
    a.supabase.from("configurator_produse")
      .select("product_id, fel")
      .eq("configurator_id", id).eq("business_id", a.magazin.id)
      .limit(1000),
    a.supabase.from("configurator_categorii")
      .select("categorie")
      .eq("configurator_id", id).eq("business_id", a.magazin.id)
      .order("categorie"),
    a.supabase.from("categories").select("name").eq("business_id", a.magazin.id).order("name"),
  ]);

  if (legaturi.error || categorii.error || arbore.error) {
    logError({
      action: "configurator.citesteAplicarea",
      message: legaturi.error?.message ?? categorii.error?.message ?? arbore.error?.message ?? "necunoscuta",
      businessId: a.magazin.id, severity: "warning",
    });
    return { error: "Nu am putut citi aplicarea. Incearca din nou." };
  }

  const randuri = legaturi.data ?? [];
  const ids = randuri.map((r) => r.product_id);

  /*
   * ⚠ Produsele se cer O SINGURA DATA, pentru amandoua listele. Cerute pe rand, un configurator
   * cu doua sute de produse legate ar fi facut doua sute de cereri la fiecare deschidere.
   */
  const produse = new Map<string, ProdusScurt>();
  for (let i = 0; i < ids.length; i += MAXIM_PE_LOT) {
    const { data } = await a.supabase
      .from("products").select("id, name, category, images")
      .eq("business_id", a.magazin.id)
      .in("id", ids.slice(i, i + MAXIM_PE_LOT));
    for (const p of data ?? []) produse.set(p.id, scurt(p));
  }

  const alese = (fel: string) => randuri
    .filter((r) => r.fel === fel)
    .map((r) => produse.get(r.product_id))
    .filter((p): p is ProdusScurt => !!p)
    .sort((x, y) => x.nume.localeCompare(y.nume, "ro"));

  // ⚠ Numele unice: unicitatea din `categories` e pe frati, deci acelasi nume poate veni de doua
  // ori din doua ramuri, si ecranul l-ar fi aratat de doua ori.
  const disponibile = [...new Set((arbore.data ?? []).map((c) => c.name).filter(Boolean))];

  return {
    success: true,
    aplicare: {
      produse: alese("direct"),
      excluse: alese("exclus"),
      categorii: (categorii.data ?? []).map((c) => c.categorie),
      categoriiDisponibile: disponibile,
    },
  };
}

/**
 * Produse de legat, cautate dupa nume.
 *
 * ⚠ Se spune din CAUTARE daca produsul e deja luat de alt configurator, nu abia din eroarea de
 * la salvare. Baza il refuza oricum — un produs are cel mult un configurator legat direct — dar
 * un refuz care vine dupa ce omul a bifat douazeci de produse il pune sa ghiceasca pe care.
 */
export async function cautaProduseDeLegat(
  id: string,
  termen: string,
): Promise<{ error: string } | { success: true; produse: ProdusGasit[] }> {
  const a = await magazinulMeu();
  if (!a.ok) return { error: a.error };
  if (!(await esteAlMagazinului(a.supabase, "configuratoare", id, a.magazin.id))) {
    return { error: "Configuratorul nu exista." };
  }

  const t = (termen ?? "").trim().slice(0, 120);
  // ⚠ `%` si `_` din termen se escapeaza: fara asta, o cautare dupa „50%" aducea tot catalogul.
  const sablon = t.replace(/([%_\\])/g, "\\$1");

  const cerere = t
    ? a.supabase.from("products").select("id, name, category, images")
        .eq("business_id", a.magazin.id).eq("is_active", true).ilike("name", `%${sablon}%`)
        .order("name").limit(30)
    : a.supabase.from("products").select("id, name, category, images")
        .eq("business_id", a.magazin.id).eq("is_active", true)
        .order("name").limit(30);

  const { data, error } = await cerere;
  if (error) {
    logError({ action: "configurator.cautaProduse", message: error.message, businessId: a.magazin.id, severity: "warning" });
    return { error: "Nu am putut cauta produsele. Incearca din nou." };
  }

  const gasite = data ?? [];
  const luate = new Map<string, string>();
  if (gasite.length) {
    const { data: alteLegaturi } = await a.supabase
      .from("configurator_produse")
      .select("product_id, configurator_id, configuratoare(nume)")
      .eq("business_id", a.magazin.id)
      .eq("fel", "direct")
      .neq("configurator_id", id)
      .in("product_id", gasite.map((p) => p.id));
    for (const l of alteLegaturi ?? []) {
      const c = l.configuratoare as { nume?: string } | { nume?: string }[] | null;
      const nume = Array.isArray(c) ? c[0]?.nume : c?.nume;
      luate.set(l.product_id, nume ?? "alt configurator");
    }
  }

  return {
    success: true,
    produse: gasite.map((p) => ({ ...scurt(p), luatDe: luate.get(p.id) ?? null })),
  };
}

/**
 * Leaga produse de configurator, direct sau ca excludere.
 *
 * ⚠ Id-urile primite NU se cred. Se pastreaza numai cele care chiar sunt produse ale acestui
 * magazin: altfel oricine ar fi putut lega produsul altui comerciant de configuratorul lui, si
 * randul ar fi trecut de RLS fiindca `business_id`-ul scris e al lui.
 */
export async function aplicaLaProduse(
  id: string,
  produse: unknown,
  fel: unknown,
): Promise<{ error: string } | { success: true; legate: number; refuzate: ProdusScurt[] }> {
  const a = await magazinulMeu();
  if (!a.ok) return { error: a.error };
  if (fel !== "direct" && fel !== "exclus") return { error: "Fel de legatura necunoscut." };
  if (!(await esteAlMagazinului(a.supabase, "configuratoare", id, a.magazin.id))) {
    return { error: "Configuratorul nu exista." };
  }

  const cerute = idsCurate(produse);
  if (!cerute.length) return { success: true, legate: 0, refuzate: [] };

  const { data: aleMele, error: eP } = await a.supabase
    .from("products").select("id, name, category, images")
    .eq("business_id", a.magazin.id).in("id", cerute);
  if (eP) return { error: "Nu am putut verifica produsele. Incearca din nou." };

  const validate = new Map((aleMele ?? []).map((p) => [p.id, scurt(p)]));
  if (!validate.size) return { error: "Niciunul dintre produse nu e al magazinului tau." };

  /*
   * ⚠ Cine e deja luat se afla INAINTE de scriere.
   *
   * Baza are un index unic partial pe `(product_id) where fel = 'direct'`, deci un produs legat
   * de alt configurator ar fi facut TOT lotul sa pice — si celelalte legaturi bune odata cu el.
   * Se scot din lot si se raporteaza pe nume.
   */
  const refuzate: ProdusScurt[] = [];
  let deScris = [...validate.keys()];
  if (fel === "direct") {
    const { data: luate, error: eL } = await a.supabase
      .from("configurator_produse").select("product_id")
      .eq("business_id", a.magazin.id).eq("fel", "direct").neq("configurator_id", id)
      .in("product_id", deScris);
    if (eL) return { error: "Nu am putut verifica legaturile. Incearca din nou." };
    const ocupate = new Set((luate ?? []).map((l) => l.product_id));
    if (ocupate.size) {
      for (const pid of ocupate) {
        const p = validate.get(pid);
        if (p) refuzate.push(p);
      }
      deScris = deScris.filter((pid) => !ocupate.has(pid));
    }
  }

  if (!deScris.length) return { success: true, legate: 0, refuzate };

  /*
   * ⚠ `upsert`, nu `insert`: perechea (produs, configurator) e unica, iar un produs bifat de
   * doua ori — sau mutat din „exclus" in „direct" — ar fi picat cu 23505. Asa, felul se schimba.
   */
  const { error } = await a.supabase
    .from("configurator_produse")
    .upsert(
      deScris.map((pid) => ({
        business_id: a.magazin.id, configurator_id: id, product_id: pid, fel,
      })),
      { onConflict: "product_id,configurator_id" },
    );

  if (error) {
    logError({ action: "configurator.aplicaLaProduse", message: error.message, businessId: a.magazin.id, severity: "warning" });
    // 23505 aici inseamna ca cineva a legat produsul intre verificare si scriere.
    return {
      error: error.code === "23505"
        ? "Un produs tocmai a fost legat de alt configurator. Reincarca si incearca din nou."
        : "Nu am putut lega produsele. Incearca din nou.",
    };
  }

  /*
   * ⚠ Lista e marginita (cel mult `MAXIM_PE_LOT`) si e chiar cea bifata de om, deci se si
   * proiecteaza acum: comerciantul tocmai a apasat si se duce sa se uite in magazin.
   */
  await murdaresteSiProiecteaza(a.magazin.id, deScris);
  revalidatePath(CALEA);
  return { success: true, legate: deScris.length, refuzate };
}

/** Scoate produsele de sub configurator — si legaturile directe, si excluderile. */
export async function scoateProduse(
  id: string,
  produse: unknown,
): Promise<Raspuns<{ scoase: number }>> {
  const a = await magazinulMeu();
  if (!a.ok) return { error: a.error };
  if (!(await esteAlMagazinului(a.supabase, "configuratoare", id, a.magazin.id))) {
    return { error: "Configuratorul nu exista." };
  }

  const cerute = idsCurate(produse);
  if (!cerute.length) return { success: true, scoase: 0 };

  /*
   * ⚠ Se cere si `product_id`, nu doar `id`: se marcheaza produsele care CHIAR au pierdut
   * legatura, nu tot ce a trimis browserul. Un id inventat n-ar sterge nimic, dar ar fi intrat in
   * coada de proiectie — si `catalog_murdar` are cheie straina catre `products`, deci scrierea
   * intregului lot ar fi picat cu 23503, adica exact produsele bune ar fi ramas nemarcate.
   */
  const { data, error } = await a.supabase
    .from("configurator_produse").delete()
    .eq("business_id", a.magazin.id).eq("configurator_id", id)
    .in("product_id", cerute)
    .select("id, product_id");

  if (error) return { error: "Nu am putut scoate produsele. Incearca din nou." };
  await murdaresteSiProiecteaza(a.magazin.id, (data ?? []).map((r) => r.product_id));
  revalidatePath(CALEA);
  return { success: true, scoase: (data ?? []).length };
}

/**
 * Leaga configuratorul de categorii, dupa NUME.
 *
 * ⚠ Se primesc numai nume care chiar exista in magazin. Un nume liber ar fi parut ca merge si
 * n-ar fi prins niciun produs — iar comerciantul ar fi cautat greseala in reguli, nu in litera
 * gresita din numele categoriei.
 */
export async function aplicaLaCategorii(
  id: string,
  categorii: unknown,
): Promise<{ error: string } | { success: true; legate: number; necunoscute: string[] }> {
  const a = await magazinulMeu();
  if (!a.ok) return { error: a.error };
  if (!(await esteAlMagazinului(a.supabase, "configuratoare", id, a.magazin.id))) {
    return { error: "Configuratorul nu exista." };
  }

  const cerute = idsCurate(categorii);
  if (!cerute.length) return { success: true, legate: 0, necunoscute: [] };

  const { data: ale, error: eC } = await a.supabase
    .from("categories").select("name").eq("business_id", a.magazin.id).in("name", cerute);
  if (eC) return { error: "Nu am putut verifica categoriile. Incearca din nou." };

  const bune = new Set((ale ?? []).map((c) => c.name));
  const necunoscute = cerute.filter((n) => !bune.has(n));
  const deScris = cerute.filter((n) => bune.has(n));
  if (!deScris.length) return { success: true, legate: 0, necunoscute };

  const { error } = await a.supabase
    .from("configurator_categorii")
    .upsert(
      /*
       * ⚠ `si_viitoarele: true` se scrie PE FATA, desi e si valoarea din oficiu.
       *
       * Coloana spune ce face chiar legatura de categorie: se rezolva prin NUMELE categoriei,
       * la fiecare citire, deci prinde si produsele adaugate maine. Cine vrea numai produsele
       * de ACUM foloseste `aplicaLaProduseleDinCategorie`, care scrie legaturi directe si nu
       * lasa in urma nimic care sa se intinda singur.
       *
       * Nescrisa, coloana ar fi ramas o valoare din oficiu pe care n-o alege nimeni si n-o
       * citeste nimic — adica o promisiune in schema, fara nimic care s-o tina.
       */
      deScris.map((categorie) => ({
        business_id: a.magazin.id, configurator_id: id, categorie, si_viitoarele: true,
      })),
      { onConflict: "business_id,configurator_id,categorie", ignoreDuplicates: true },
    );

  if (error) {
    logError({ action: "configurator.aplicaLaCategorii", message: error.message, businessId: a.magazin.id, severity: "warning" });
    return { error: "Nu am putut lega categoriile. Incearca din nou." };
  }

  /*
   * ⚠ NUMAI MARCARE, fara `proiecteazaImediat`, si nu din lene.
   *
   * O legatura de categorie prinde tot subarborele si toate produsele lui — pe un magazin cu
   * douazeci de mii de produse, „Imbracaminte" poate insemna cateva mii. Proiectate chiar in
   * cererea asta, actiunea de panou s-ar fi intins zeci de secunde si ar fi cazut pe timeout, cu
   * marcajele deja scrise: comerciantul ar fi vazut o eroare pentru o legatura care de fapt s-a
   * facut. Cronul de la minut le ia pe rand.
   *
   * ⚠ Si se marcheaza si ce MOSTENESTE, nu doar produsele care au chiar numele ales: legatura se
   * rezolva pe subarbore, deci si raspunsul cardului se schimba pe subarbore.
   */
  await murdaresteCategoriile(a.supabase, a.magazin.id, deScris);
  revalidatePath(CALEA);
  return { success: true, legate: deScris.length, necunoscute };
}

/**
 * Leaga configuratorul de produsele care sunt ACUM in categorie, si atat.
 *
 * ⚠ NU scrie nicio legatura de categorie. Tocmai asta e diferenta fata de
 * `aplicaLaCategorii`: acolo legatura se rezolva prin nume la fiecare citire, deci prinde si
 * ce se adauga maine; aici se scriu legaturi directe pe produsele de azi, si atat raman.
 *
 * Comerciantul care isi umple categoria cu produse noi in fiecare saptamana are nevoie de
 * amandoua purtarile, si nu sunt acelasi lucru: una e o REGULA, cealalta o LISTA.
 *
 * ⚠ Coboara in subarbore, ca si rezolvarea: comerciantul isi alege declansatorul dintr-un
 * arbore si se asteapta ca „Imbracaminte” sa insemne si rochiile de sub ea.
 */
export async function aplicaLaProduseleDinCategorie(
  id: string,
  categorie: unknown,
): Promise<{ error: string } | { success: true; legate: number; refuzate: ProdusScurt[] }> {
  const a = await magazinulMeu();
  if (!a.ok) return { error: a.error };
  if (!(await esteAlMagazinului(a.supabase, "configuratoare", id, a.magazin.id))) {
    return { error: "Configuratorul nu exista." };
  }

  const nume = typeof categorie === "string" ? categorie.trim() : "";
  if (!nume) return { error: "Alege o categorie." };

  const { data: arbore, error: eA } = await a.supabase
    .from("categories").select("id, name, parent_id").eq("business_id", a.magazin.id);
  if (eA) return { error: "Nu am putut citi categoriile. Incearca din nou." };
  if (!(arbore ?? []).some((c) => c.name === nume)) {
    return { error: "Categoria nu exista in magazinul tau." };
  }
  const numele = [...extindeCategoriile(arbore ?? [], [nume])];

  /*
   * ⚠ Se cer id-urile, si se SPUNE cate au intrat.
   *
   * Lista se taie la `MAXIM_PE_LOT`, fiindca `.in()` pleaca in adresa si fiindca scrierea e
   * un singur lot. Taiata in tacere, comerciantul ar fi crezut ca a legat toata categoria, si
   * ar fi aflat de la primul client care cumpara un produs neconfigurabil din ea.
   */
  const { data: produse, error: eP } = await a.supabase
    .from("products").select("id")
    .eq("business_id", a.magazin.id)
    .in("category", numele.slice(0, MAXIM_PE_LOT))
    .limit(MAXIM_PE_LOT);
  if (eP) return { error: "Nu am putut citi produsele categoriei. Incearca din nou." };
  const ids = (produse ?? []).map((p) => p.id);
  if (ids.length === 0) return { error: "Categoria nu are niciun produs acum." };

  // Mai departe e exact drumul de la legarea manuala: aceleasi verificari, si acelasi refuz
  // pe nume pentru produsele luate deja de alt configurator. ⚠ Tot de acolo vine si marcarea in
  // `catalog_murdar`: scrisa si aici, produsele ar fi intrat de doua ori in aceeasi coada.
  // Lista e marginita la `MAXIM_PE_LOT`, deci proiectia imediata de acolo ramane potrivita.
  return aplicaLaProduse(id, ids, "direct");
}

/** Scoate categoriile de sub configurator. */
export async function scoateCategorii(
  id: string,
  categorii: unknown,
): Promise<Raspuns<{ scoase: number }>> {
  const a = await magazinulMeu();
  if (!a.ok) return { error: a.error };
  if (!(await esteAlMagazinului(a.supabase, "configuratoare", id, a.magazin.id))) {
    return { error: "Configuratorul nu exista." };
  }

  const cerute = idsCurate(categorii);
  if (!cerute.length) return { success: true, scoase: 0 };

  // Se cere si numele, nu doar `id`: se marcheaza categoriile care CHIAR au fost scoase.
  const { data, error } = await a.supabase
    .from("configurator_categorii").delete()
    .eq("business_id", a.magazin.id).eq("configurator_id", id)
    .in("categorie", cerute)
    .select("id, categorie");

  if (error) return { error: "Nu am putut scoate categoriile. Incearca din nou." };
  // ⚠ Scoaterea e la fel de importanta ca legarea: fara marcare, cardurile ar fi trimis in
  // continuare cumparatorii intr-o pagina de configurare care nu mai exista. Tot fara
  // `proiecteazaImediat`, din acelasi motiv ca la legare.
  await murdaresteCategoriile(a.supabase, a.magazin.id, (data ?? []).map((r) => r.categorie));
  revalidatePath(CALEA);
  return { success: true, scoase: (data ?? []).length };
}
