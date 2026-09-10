import { cache } from "react";
import { createAdminClient } from "@/lib/supabase/admin";
import { curataTextSeo, SEO_DESCRIERE_CATEGORIE_MAX } from "@/lib/seo";

/**
 * Descrierea pentru Google scrisa de comerciant pe o categorie (`categories.seo_description`).
 *
 * ═══ CITIRE TINTITA, NICIODATA IN LISTA ═══
 *
 * Coloana NU intra in selectul larg al categoriilor (`categoriiMagazin`). Lista aceea pleaca in
 * browser pe fiecare pagina a magazinului (navigarea), deci toate descrierile ar fi ajuns in
 * HTML-ul fiecarui vizitator. Si ar fi facut fragila TOATA lista: PostgREST pica intreaga
 * interogare la o coloana necunoscuta, deci codul ajuns inaintea migratiei ar fi golit
 * navigarea si ar fi dat 404 pe paginile de categorie, pe toate magazinele.
 *
 * Aici se cere UN rand, dupa id si dupa magazin. La orice eroare (inclusiv coloana inca lipsa):
 * `console.error` si `null`, adica ramane textul automat. Paguba maxima: textul propriu
 * lipseste o vreme.
 *
 * ⚠ `cache()`, cu argumente PRIMITIVE: `<head>`-ul si nodul `CollectionPage` cer acelasi rand in
 * aceeasi cerere si trebuie sa primeasca acelasi raspuns, dintr-o singura citire.
 *
 * ⚠ Textul se CURATA si se TAIE la 300 si aici, desi salvarea (`salveazaSeoCategorie`) curata si
 * respinge peste 300: `authenticated` poate scrie direct prin PostgREST pe randurile lui, ocolind
 * actiunea. Fara taiere, un text de 1000 de caractere (plafonul CHECK-ului din baza) ar fi aparut
 * de patru ori in pagina: meta, og, twitter si JSON-LD.
 */
export const citesteSeoCategorie = cache(async (businessId: string, categorieId: string): Promise<string | null> => {
  try {
    const { data, error } = await createAdminClient()
      .from("categories")
      .select("seo_description")
      .eq("id", categorieId)
      .eq("business_id", businessId)
      .maybeSingle();
    if (error) {
      console.error(`[descriere] textul categoriei ${categorieId} n-a putut fi citit:`, error.message);
      return null;
    }
    return curataTextSeo(data?.seo_description ?? null, SEO_DESCRIERE_CATEGORIE_MAX);
  } catch (e) {
    console.error(`[descriere] textul categoriei ${categorieId} n-a putut fi citit:`, e instanceof Error ? e.message : e);
    return null;
  }
});
