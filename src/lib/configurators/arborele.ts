import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/types/database.types";
import { fetchAllRowsStrict } from "@/lib/supabase/fetch-all";
import { logError } from "@/lib/error-logger";
import type { RandCategorie } from "./rezolvare";

/**
 * Arborele de categorii al magazinului, INTREG.
 *
 * ═══ ⚠ DE CE E SCRIS O SINGURA DATA ═══
 *
 * Configuratorul coboara in subarbore in PATRU locuri, si toate patru trebuie sa vada acelasi
 * arbore: vitrina (`vitrina.ts`), marcarea cardurilor (`murdareste.ts`), legarea de o categorie
 * si lista din care omul alege (`configurator.actions.ts`). Scrisa de patru ori, citirea a si
 * divergit deja: trei locuri cereau `id, name, parent_id`, al patrulea doar `name`, si niciunul
 * nu cerea o ordine.
 *
 * ═══ ⚠ CE REPARA: PLAFONUL DE 1000 DE RANDURI ═══
 *
 * PostgREST taie ORICE raspuns la 1000 de randuri si o face TACUT — fara eroare, fara vreun semn
 * in date. Un magazin cu peste o mie de categorii ar fi citit primele o mie, iar coborarea in
 * subarbore ar fi taiat ramurile lipsa: produsele de sub ele n-ar fi primit configuratorul, iar
 * cardurile lor n-ar fi fost marcate. Nimic n-ar fi cazut si nimic n-ar fi aparut in jurnal.
 *
 * ⚠ CIFRA DE AZI: cel mai mare magazin al platformei are 145 de categorii, media e 17,8 pe 32 de
 * magazine cu categorii. Deci a doua fereastra nu se cere NICIODATA azi, si reparatia nu costa
 * nimic masurabil. E scrisa fiindca ziua in care plafonul se atinge nu se anunta: sitemapul
 * platformei a raspuns 200, valid si gol, doua saptamani, din exact aceeasi taiere tacuta.
 *
 * ═══ ⚠ SE INTOARCE UN VERDICT, NU SE ARUNCA ═══
 *
 * `fetchAllRowsStrict` arunca dinadins, ca sa nu lase apelantul sa creada ca a citit tot. Dar
 * niciunul dintre cele patru locuri n-are voie sa cada: vitrina ar doborî pagina de produs pentru
 * o citire care doar imbogateste raspunsul, iar panoul ar arata un ecran de eroare in loc de o
 * lista. Deci aruncarea se prinde AICI si devine `ok: false` — fiecare loc alege apoi ce face,
 * dar o face STIIND ca arborele poate fi incomplet.
 *
 * ⚠ `randuri` e goala cand `ok` e `false`, nu partiala: jumatate de arbore ar fi taiat ramuri
 * exact ca plafonul, si asta e chiar necazul de reparat.
 */
export interface ArboreCitit {
  /** `false` cand arborele NU s-a putut citi intreg. Vezi nota de mai sus. */
  ok: boolean;
  randuri: RandCategorie[];
}

export async function arboreleCategoriilor(
  client: SupabaseClient<Database>,
  businessId: string,
  actiune: string,
): Promise<ArboreCitit> {
  try {
    const randuri = await fetchAllRowsStrict<RandCategorie>(
      actiune,
      (de, la) => client
        .from("categories")
        .select("id, name, parent_id")
        .eq("business_id", businessId)
        // ⚠ Ordine STABILA, altfel randurile se muta intre ferestre si unele se pierd sau se
        // dubleaza. `id` e cheia primara, deci unica si totala — nu are nevoie de departajare.
        .order("id")
        .range(de, la),
    );
    return { ok: true, randuri };
  } catch (e) {
    logError({
      action: actiune,
      message: e instanceof Error ? e.message : String(e),
      businessId, severity: "error",
    });
    return { ok: false, randuri: [] };
  }
}
