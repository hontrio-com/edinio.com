/**
 * Cine cere, si ce magazin are voie sa atinga. Intr-un singur loc.
 *
 * ═══ ⚠ DE CE E NEVOIE DE INCA UN AJUTOR, CAND EXISTA DEJA SAPTE ═══
 *
 * `ownedBusiness` sta ca functie PRIVATA in sapte fisiere de actiuni — About You, eMAG, Google
 * Analytics, Google Merchant, OLX (de doua ori), Trendyol — cu patru liste de coloane diferite
 * si doua tipuri de raspuns diferite. Iar `.eq("user_id", user.id)` apare de peste doua sute de
 * ori, in peste o suta de fisiere.
 *
 * Nu le rescriu pe cele vechi: o schimbare in masa peste sapte integratii care merg ar fi exact
 * felul de refactorizare pe care proiectul il refuza. Dar ce se scrie de acum incolo trece pe
 * aici, ca sa existe UN loc in care regula se poate citi si schimba.
 *
 * ═══ ⚠ FIECARE EXPORT „use server" E UN CAPAT HTTP PUBLIC ═══
 *
 * Nu doar rutele. Orice functie exportata dintr-un modul „use server" primeste un identificator
 * si poate fi chemata de oricine, cu ce argumente vrea — iar manifestul e GLOBAL, deci nu conteaza
 * de pe ce pagina. De aceea nicio actiune nu are voie sa creada un `businessId` primit ca
 * argument: se rezolva mereu de aici, din sesiune.
 *
 * ═══ ⚠ SI DE CE NU SE FOLOSESTE CHEIA DE SERVICIU AICI ═══
 *
 * Citirea trece prin clientul UTILIZATORULUI, deci RLS lucreaza a doua oara peste verificarea
 * noastra. Cheia de serviciu ocoleste RLS: folosita aici, o gresala de filtrare ar fi devenit o
 * scurgere intre magazine, in loc sa intoarca zero randuri.
 */

import { createClient } from "@/lib/supabase/server";
import { getCachedUser } from "@/lib/supabase/cached-queries";

type ClientServer = Awaited<ReturnType<typeof createClient>>;

export interface Magazin {
  id: string;
  slug: string;
  /** Numele firmei. `businesses` NU are o coloana `name` — are astea doua. */
  business_name: string;
  /** Numele vitrinei, cand comerciantul l-a pus. Altfel se cade pe cel al firmei. */
  store_name: string | null;
}

/** Numele de aratat in panou: cel al vitrinei daca exista, altfel al firmei. */
export function numeleMagazinului(m: Magazin): string {
  return m.store_name?.trim() || m.business_name;
}

export type Autorizare =
  | { ok: false; error: string }
  | { ok: true; supabase: ClientServer; userId: string; magazin: Magazin };

/** Mesaje in romana, aceleasi peste tot, ca omul sa nu vada trei formulari pentru acelasi lucru. */
export const NEAUTENTIFICAT = "Nu esti autentificat.";
export const FARA_MAGAZIN = "Nu ai un magazin. Finalizeaza mai intai configurarea.";
export const NU_E_AL_TAU = "Nu ai acces la acest magazin.";

/**
 * Magazinul celui care cere.
 *
 * ⚠ Cand se da `businessIdCerut`, el se VERIFICA, nu se foloseste. Un id venit de la client e o
 * cerere, nu o dovada.
 *
 * Fara el, se ia magazinul cel mai recent al utilizatorului — aceeasi purtare ca in restul
 * panoului. ⚠ Un comerciant cu doua magazine primeste asa magazinul gresit; e o limita veche a
 * intregului panou, nu ceva introdus aici, si se repara odata pentru toti cand va exista un
 * selector de magazin.
 */
export async function magazinulMeu(businessIdCerut?: string): Promise<Autorizare> {
  const supabase = await createClient();
  const user = await getCachedUser();
  if (!user) return { ok: false, error: NEAUTENTIFICAT };

  /*
   * ⚠ Lantul se scrie INTREG, fara reasignare.
   *
   * `let q = ...; q = q.eq(...)` schimba tipul constructorului la fiecare pas, iar inferenta
   * lui `supabase-js` se pierde: `data` iese `{ error: true } & String` in loc de randul cerut.
   * Cu doua lanturi complete, tipul se pastreaza — iar tipul e chiar paza pe care ne bizuim,
   * fiindca proiectul are 622 de `as never` tocmai din locuri unde s-a pierdut.
   */
  const cerere = businessIdCerut
    ? supabase.from("businesses").select("id, slug, business_name, store_name")
        .eq("user_id", user.id).eq("id", businessIdCerut)
        .order("created_at", { ascending: false }).limit(1).maybeSingle()
    : supabase.from("businesses").select("id, slug, business_name, store_name")
        .eq("user_id", user.id)
        .order("created_at", { ascending: false }).limit(1).maybeSingle();

  const { data, error } = await cerere;

  /*
   * ⚠ EROAREA NU E „N-ARE MAGAZIN".
   *
   * PostgREST nu arunca la refuz: intoarce `{ data: null, error }`. Tratate la fel, o pana de o
   * clipa a bazei ar fi spus comerciantului ca nu are magazin — chiar mesajul care a aparut pe
   * toate cele 127 de magazine pe 03.09.2026, cand o coloana lipsa rupsese interogarea.
   */
  if (error) return { ok: false, error: "Nu am putut citi magazinul. Incearca din nou." };
  if (!data) return { ok: false, error: businessIdCerut ? NU_E_AL_TAU : FARA_MAGAZIN };

  return { ok: true, supabase, userId: user.id, magazin: data };
}

/**
 * Randul cerut e chiar al magazinului?
 *
 * Se foloseste inaintea oricarei scrieri care porneste de la un id primit de la client. RLS
 * apara oricum, dar o verificare explicita da un MESAJ, nu zero randuri — iar zero randuri
 * arata la fel cu „nu exista", si ascunde o incercare de trecere dintr-un magazin in altul.
 */
export async function esteAlMagazinului(
  supabase: ClientServer,
  tabela: "configuratoare" | "configurator_versiuni" | "configurator_produse" | "configurator_categorii",
  id: string,
  businessId: string,
): Promise<boolean> {
  const { data, error } = await supabase
    .from(tabela)
    .select("id")
    .eq("id", id)
    .eq("business_id", businessId)
    .maybeSingle();
  if (error) return false;
  return !!data;
}
