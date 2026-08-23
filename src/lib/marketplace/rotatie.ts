import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * Cine intra pe tura asta, prin rotatie.
 *
 * Inainte era `slice(0, N)` peste o lista fara ordine garantata: acelasi magazin
 * putea iesi mereu primul, iar cele de dupa locul N nu ajungeau niciodata la rand.
 * Fereastra porneste din ceasul absolut, deci in cateva minute trec toti.
 *
 * ⚠ `pas` NU e decorativ. Indicele de tura se ia din ceasul absolut, iar daca
 * trecerea careia ii serveste ruleaza doar la anumite minute (`getMinutes() % 15`),
 * pasul dintre doua executii EFECTIVE e 15, nu 1. Lasat pe 1, `start` avanseaza cu
 * `15 * cati` intre executii, si pentru orice multime a carei dimensiune are
 * divizor comun mare cu 15 * cati se revine la aceleasi magazine la nesfarsit —
 * adica exact infometarea pe care rotatia trebuia s-o inlature. Cine cheama dintr-o
 * trecere pe sferturi de ora trimite `pas = 15`.
 */
export function alegeInRotatie(idsuri: string[], cati: number, pas = 1): string[] {
  const sortate = [...idsuri].sort();
  if (sortate.length <= cati) return sortate;
  const tura = Math.floor(Date.now() / 60_000 / pas);
  const start = (tura * cati) % sortate.length;
  return Array.from({ length: cati }, (_, i) => sortate[(start + i) % sortate.length]);
}

/** Cate randuri se cer odata. PostgREST taie SILENTIOS peste 1000. */
const PAGINA = 1000;
/** Plafon de siguranta: 20.000 de magazine inseamna deja alt fel de problema. */
const MAX_PAGINI = 20;

/**
 * Magazinele CONECTATE la un marketplace, complet, fara trunchiere.
 *
 * ═══ DE CE NU SE MAI INTREABA TABELA DE LISTARI ═══
 *
 * Cronurile intrebau „cine are Trendyol?" citind `trendyol_listings` cu
 * `.limit(500)` si deduplicand DUPA aceea. Ordinea trunchierii e gresita: un
 * singur vanzator cu 500 de produse umple singur fereastra, si atunci multimea de
 * magazine are UN element — toti ceilalti dispar, nu incet, ci complet. Rotatia nu
 * repara asta: ea alege dintre cei care au ajuns in multime, iar trunchierea
 * decide cine ajunge. About You avea deja rotatie si tot avea gaura.
 *
 * Raspunsul la „ce magazine au Trendyol?" nu se citeste din tabela de produse, ci
 * din `store_settings.<furnizor>_config`, unde `connected` e chiar steagul pe care
 * il verifica si incarcatorul de context. Randurile sunt cate unul pe magazin,
 * deci se pot lua TOATE, paginat.
 *
 * ⚠ A ridica in schimb `.limit(500)` la 5000 ar fi fost o capcana dubla: PostgREST
 * taie tacut la 1000 (deci „am marit limita" ar fi devenit o minciuna), si oricum
 * s-ar fi transferat mii de randuri de listari ca sa se extraga cateva zeci de id-uri.
 */
export async function magazineConectate(
  admin: SupabaseClient,
  coloana: "trendyol_config" | "aboutyou_config" | "emag_config",
): Promise<{ ids: string[]; error: string | null }> {
  const ids: string[] = [];
  for (let pagina = 0; pagina < MAX_PAGINI; pagina++) {
    const de_la = pagina * PAGINA;
    const { data, error } = await admin
      .from("store_settings")
      .select("business_id")
      // `->>` da text, deci comparatia e cu sirul "true".
      .filter(`${coloana}->>connected`, "eq", "true")
      .order("business_id", { ascending: true })
      .range(de_la, de_la + PAGINA - 1);
    if (error) return { ids, error: error.message };
    const randuri = (data ?? []) as { business_id: string }[];
    for (const r of randuri) if (r.business_id) ids.push(r.business_id);
    if (randuri.length < PAGINA) break;
  }
  return { ids: [...new Set(ids)], error: null };
}
