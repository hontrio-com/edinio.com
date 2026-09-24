import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";
import { esteUuid } from "@/lib/supabase/ids";
import { curataContClientConfig } from "./config";
import {
  CONTURI_PE_PAGINA,
  citesteFisa,
  type FisaCont,
  type OrdineCont,
  type StareCont,
} from "./panou-texte";

/**
 * Conturile magazinului, vazute de COMERCIANT (Clienti > Conturi).
 *
 * ⚠⚠ NUMAI PE SERVER, SI NUMAI DUPA CE APELANTUL A DOVEDIT CA MAGAZINUL E AL OMULUI
 * LOGAT. Functiile de aici merg cu cheia de serviciu (tabelele contului stau in
 * `privat`, pe care PostgREST nu o expune) si nu verifica pe nimeni: o fac pagina
 * (`businesses.user_id = user.id`) si actiunile (`guard` din
 * `conturi-panou.actions.ts`). Fisierul NU e „use server”, tocmai ca sa nu devina
 * fiecare export un capat public.
 */

export type ContDinPanou = {
  contId: string;
  nume: string | null;
  email: string | null;
  emailConfirmat: boolean;
  telefon: string | null;
  creatLa: string;
  ultimaIntrare: string | null;
  comenzi: number;
  areParola: boolean;
  suspendatLa: string | null;
  primesteEmail: boolean;
};

export async function listaConturilor(
  businessId: string,
  f: { cautare: string; stare: StareCont; ordine: OrdineCont; pagina: number },
): Promise<{ conturi: ContDinPanou[]; total: number }> {
  const { data, error } = await createAdminClient().rpc("cont_panou_lista", {
    p_business: businessId,
    p_cautare: f.cautare || null,
    p_stare: f.stare,
    p_ordine: f.ordine,
    p_limita: CONTURI_PE_PAGINA,
    p_decalaj: (Math.max(1, f.pagina) - 1) * CONTURI_PE_PAGINA,
  });
  if (error) throw error;
  const randuri = data ?? [];
  return {
    conturi: randuri.map((r) => ({
      contId: r.cont_id,
      nume: r.nume ?? null,
      email: r.email ?? null,
      emailConfirmat: r.email_confirmat === true,
      telefon: r.telefon ?? null,
      creatLa: r.creat_la,
      ultimaIntrare: r.ultima_intrare ?? null,
      comenzi: Number(r.comenzi ?? 0),
      areParola: r.are_parola === true,
      suspendatLa: r.suspendat_la ?? null,
      primesteEmail: r.primeste_email !== false,
    })),
    /* ⚠ Totalul vine pe acelasi rand cu lista: numarat separat, ar fi putut spune alt numar. */
    total: randuri.length > 0 ? Number(randuri[0].total_randuri) : 0,
  };
}

export type SumarConturi = { conturi: number; activi30Zile: number; cuComenzi: number; suspendate: number };

export async function sumarulConturilor(businessId: string): Promise<SumarConturi> {
  const { data, error } = await createAdminClient().rpc("cont_panou_sumar", { p_business: businessId });
  if (error) throw error;
  const r = (data ?? [])[0];
  return {
    conturi: Number(r?.conturi ?? 0),
    activi30Zile: Number(r?.activi_30_zile ?? 0),
    cuComenzi: Number(r?.cu_comenzi ?? 0),
    suspendate: Number(r?.suspendate ?? 0),
  };
}

/** Fisa unui cont, sau `null` daca nu exista (sters, al altui magazin, id stricat). */
export async function fisaContului(businessId: string, contId: string): Promise<FisaCont | null> {
  if (!esteUuid(contId)) return null;
  const { data, error } = await createAdminClient().rpc("cont_panou_fisa", { p_business: businessId, p_cont: contId });
  if (error) throw error;
  return citesteFisa(data);
}

/**
 * Care clienti din lista au cont: cheia clientului (a lui `customers_aggregate`)
 * -> contul lui. Cu `chei = null`, toti clientii cu cont (pentru filtru).
 *
 * ⚠ Cheia se socoteste IN BAZA, cu aceleasi functii ca lista de clienti; vezi
 * `cont_panou_chei`.
 */
export async function conturileClientilor(businessId: string, chei: string[] | null): Promise<Map<string, string>> {
  if (chei !== null && chei.length === 0) return new Map();
  /*
    ⚠⚠ PE PAGINI. PostgREST taie orice raspuns la 1000 de randuri, TACUT: un magazin
    cu peste o mie de clienti cu cont ar fi vazut sub „cu cont" numai o parte din ei,
    cu o numaratoare care arata a numaratoare.
  */
  const PAGINA = 1000;
  const harta = new Map<string, string>();
  for (let de = 0; ; de += PAGINA) {
    const { data, error } = await createAdminClient()
      .rpc("cont_panou_chei", { p_business: businessId, p_chei: chei })
      .range(de, de + PAGINA - 1);
    if (error) throw error;
    for (const r of data ?? []) harta.set(r.cheie, r.cont_id);
    if ((data ?? []).length < PAGINA) break;
  }
  return harta;
}

/**
 * Sunt pornite conturile in magazin? Numai pentru textul de pe ecran: lista se
 * arata si cu ele oprite (datele raman, doar accesul clientilor se inchide).
 * ⚠ La o eroare de citire se spune „nu stim” (`null`), nu „oprite”.
 */
export async function conturilePornite(businessId: string): Promise<boolean | null> {
  const { data, error } = await createAdminClient()
    .from("store_settings")
    .select("cont_client_config")
    .eq("business_id", businessId)
    .maybeSingle();
  if (error) return null;
  return curataContClientConfig(data?.cont_client_config).enabled;
}
