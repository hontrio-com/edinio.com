import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/types/database.types";

/**
 * „Include toate produsele active" in feedul Pepita, pana la CAPAT.
 *
 * ═══ ⚠ DE CE A IESIT DIN ACTIUNE ═══
 *
 * Aici era un plafon TACUT: bucla se oprea la 20.000 de produse, iar comerciantul primea
 * „20000 produse incluse" fara sa afle ca al 20.001-lea a ramas pe dinafara. Un numar mare
 * arata a izbanda, si tocmai de aia taierea nu se vedea.
 *
 * ⚠ PLIMBAREA E PE CHEIE, NU PE OFFSET, si asta nu e o preferinta. `products.id` e un uuid
 * aleator, iar `.range(de, de+499)` numara randurile DUPA ordonare: un import care ruleaza in
 * acelasi timp si insereaza un produs cu id mai mic muta fereastra si SARE un produs, tacut.
 * Cheia nu poate nici sari, nici repeta. Aceeasi lectie e scrisa deja la About You.
 *
 * ⚠ PLAFONUL A RAMAS, dar si-a schimbat felul: nu mai e capat de drum, ci capat de TRECERE.
 * Cand se atinge, se intoarce `incomplet: true` si cheia de la care se reia, iar apelantul
 * cheama iar. Asa o singura apasare nu tine o cerere deschisa la nesfarsit, si nici nu minte.
 */

type Admin = SupabaseClient<Database>;

/** Cat se cere de la baza intr-o citire. Sub plafonul PostgREST de 1000. */
export const PAGINA = 500;

/**
 * Cat se scrie intr-o singura CERERE catre server.
 *
 * ⚠ Numarul e cel dinainte, dinadins: la magazinele de azi (cel mai mare catalog real are
 * cateva mii de produse) nimic nu se schimba, se face tot dintr-o apasare si dintr-o cerere.
 * Se schimba doar ce se intampla la al 20.001-lea.
 */
export const PE_TRECERE = 20_000;

export type RezultatIncludere = {
  /** Cate randuri au INTRAT in trecerea asta, nu cate s-au gasit. */
  scrise: number;
  /** Mai are de mers? Atunci `dupa` spune de unde se reia. */
  incomplet: boolean;
  dupa: string | null;
};

/**
 * Scrie `inclus: true` pentru toate produsele active, incepand de dupa cheia `dupa`.
 *
 * Arunca la orice eroare de baza: apelantul o prinde, o scrie in jurnal si spune cat s-a
 * apucat sa faca. O eroare inghitita aici ar arata ca o includere reusita si incompleta.
 */
export async function includeToateActive(
  admin: Admin, businessId: string, dupa: string | null, acum: string,
): Promise<RezultatIncludere> {
  let scrise = 0;
  let cheie = dupa;

  while (scrise < PE_TRECERE) {
    let q = admin.from("products").select("id")
      .eq("business_id", businessId).eq("is_active", true)
      .order("id").limit(PAGINA);
    if (cheie) q = q.gt("id", cheie);

    const { data, error } = await q;
    if (error) throw error;
    const ids = (data ?? []) as { id: string }[];
    if (ids.length === 0) return { scrise, incomplet: false, dupa: null };

    const { error: eScriere } = await admin.from("pepita_listari").upsert(
      /*
       * ⚠ SARCINA RAMANE EXACT ATAT. Un `safety_stock: null` sau un `pret_override: null`
       * adaugat aici ar sterge, pe `onConflict`, reglajele puse de mana pe fiecare produs.
       */
      ids.map((p) => ({ business_id: businessId, product_id: p.id, inclus: true, actualizat_la: acum })) as never,
      { onConflict: "business_id,product_id" },
    );
    if (eScriere) throw eScriere;

    /* ⚠ Se aduna DUPA ce scrierea a reusit: „cate au INTRAT", nu „cate s-au gasit". */
    scrise += ids.length;
    cheie = ids[ids.length - 1].id;

    /*
     * O pagina neplina inseamna ca nu mai e nimic dupa ea. Fara randul asta rezultatul ar fi
     * acelasi, dar fiecare rulare intreaga ar mai costa o citire despre care se stie ca vine
     * goala. De aia proba numara citirile.
     */
    if (ids.length < PAGINA) return { scrise, incomplet: false, dupa: null };
  }

  return { scrise, incomplet: true, dupa: cheie };
}
