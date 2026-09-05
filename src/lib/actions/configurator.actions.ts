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
 */

import { revalidatePath } from "next/cache";
import { magazinulMeu } from "@/lib/auth/magazinul-meu";
import { logError } from "@/lib/error-logger";
import { citesteContinut } from "@/lib/configurators/citeste";
import { compileaza } from "@/lib/configurators/compileaza";
import { valideaza, type Constatare } from "@/lib/configurators/validare";
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
