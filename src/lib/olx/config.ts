import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database, Json } from "@/types/database.types";
import type { OlxConfig } from "./types";

type Db = SupabaseClient<Database>;

/**
 * Scrie un petic peste configurarea OLX a magazinului.
 *
 * ═══ ⚠ CITESTE-MODIFICA-SCRIE PIERDEA SCRIERI CONCURENTE (29.08.2026, noaptea) ═══
 *
 * OLX era singura integrare din cele cinci care nu folosea `jsonb_merge_config`: si cronul, si
 * actiunile, si reimprospatarea tokenului citeau configul intreg, il modificau in memorie si il
 * scriau inapoi. Doua scrieri care se suprapun se calca:
 *
 *     A citeste configul (are refresh token R1)
 *     B reimprospateaza tokenul si scrie R2
 *     A salveaza numarul de telefon — si rescrie TOT configul, cu R1
 *     -> R2 e pierdut, iar conexiunea OLX moare la urmatoarea reimprospatare
 *
 * Cel mai scump e chiar tokenul, fiindca el se roteste: pierdut, nu se mai poate recupera decat
 * printr-o reconectare de mana.
 *
 * ⚠ `jsonb_merge_config` face imbinarea IN BAZA, deci nimeni nu mai citeste ca sa scrie.
 */
export async function patchOlxConfig(admin: Db, businessId: string, patch: Partial<OlxConfig>): Promise<void> {
  const { error } = await admin.rpc("jsonb_merge_config", {
    p_business_id: businessId,
    p_column: "olx_config",
    /* `OlxConfig` e jsonb valid, dar tipul lui n-are semnatura de index. */
    p_patch: patch as unknown as Json,
  });
  /*
   * ═══ CALEA DE REZERVA ERA CHIAR DEFECTUL DE CARE FUGIM (31.08.2026) ═══
   *
   * Pana azi, un RPC picat cobora pe citeste-modifica-scrie: se citea `olx_config` intreg si se
   * scria inapoi cu peticul deasupra. Adica exact cursa pentru care exista `jsonb_merge_config`:
   *
   *     rezerva citeste configul: refresh R1
   *     intre timp cronul roteste: R1 -> R2, si scrie R2
   *     rezerva scrie configul citit + petic -> R1 se intoarce peste R2
   *     -> la urmatoarea reimprospatare, R1 nu mai e bun: „Reconectează contul OLX"
   *
   * ⚠ O rezerva care poate strica o conexiune OAuth e mai rea decat lipsa ei. O salvare de setari
   * care spune „Încearcă din nou" costa omului o apasare; un refresh token pierdut il costa tot
   * dansul de autorizare, si afla abia peste ore.
   *
   * ⚠ Aceeasi regula e scrisa si la `setOlxCategoryMapEntry`, si din acelasi motiv: orice rezerva
   * la o imbinare atomica e, prin fire, un citeste-modifica-scrie.
   *
   * ⚠ CINE CHEAMA TREBUIE SA PRINDA. Cele doua locuri din cron scriu marcaje (`last_sync_at`,
   * `reconcile_offset`) si le prind singure: o aruncare acolo ar opri restul trecerii.
   */
  if (error) throw new Error(`configul OLX nu s-a putut scrie: ${error.message}`);
}

/**
 * Scrie (sau scoate) o singura intrare din harta de categorii.
 *
 * ═══ HARTA SE SCRIE PE CHEIE, NU INTREAGA (31.08.2026) ═══
 *
 * Pana azi actiunea citea configul, copia `category_map`, schimba o cheie si trimitea HARTA
 * INTREAGA prin `patchOlxConfig`. Dar `jsonb_merge_config` imbina SUPERFICIAL, deci un petic care
 * poarta `category_map` inlocuieste harta cu totul:
 *
 *     fila A si fila B au amandoua harta {Bijuterii}
 *     A mapeaza „Ceasuri" -> scrie {Bijuterii, Ceasuri}
 *     B mapeaza „Genti"   -> scrie {Bijuterii, Genti}
 *     -> „Ceasuri" a disparut, si nimeni n-a vazut nicio eroare
 *
 * Iar pierderea nu se vede: produsele din categoria disparuta nu mai pleaca la OLX, si motivul
 * scris pe ele e chiar „Categoria produsului nu este mapata" — adica ce omul crede ca a facut.
 *
 * E aceeasi greseala ca la token, cu alt obiect: nu se trimite ce ai citit, se cere bazei sa
 * schimbe exact bucata pe care o vrei. Vezi migratia
 * `2026-12-23-olx-harta-categoriilor-se-scrie-pe-cheie`.
 *
 * ⚠ AICI NU EXISTA CALE DE REZERVA, spre deosebire de `patchOlxConfig`. Orice rezerva ar fi tot un
 * citeste-modifica-scrie, adica exact defectul reparat. O salvare care n-a mers se spune.
 */
export async function setOlxCategoryMapEntry(
  admin: Db, businessId: string, categorie: string, intrare: unknown | null,
): Promise<void> {
  const { error } = await admin.rpc("olx_seteaza_categoria", {
    p_business_id: businessId,
    p_categorie: categorie,
    p_intrare: (intrare ?? null) as Json,
  });
  if (error) throw new Error(`maparea de categorie nu s-a putut scrie: ${error.message}`);
}
