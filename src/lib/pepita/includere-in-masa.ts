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
  /**
   * Cate produse active au fost PARCURSE in trecerea asta: si cele scrise acum, si cele care
   * erau deja in feed. E numarul care se arata omului („N produse incluse"), fiindca despre ele
   * e vorba; `chiarScrise` spune cate randuri s-au atins cu adevarat.
   */
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

    /*
     * ⚠ SE SCRIU DOAR RANDURILE CARE CHIAR SE SCHIMBA.
     *
     * `actualizat_la` intra in `<LastMod>`: e singurul semn ca s-a schimbat un reglaj per
     * produs. Rescris pe tot catalogul la fiecare apasare, ar fi facut data sa sara pe produse
     * care n-au miscat — si comerciantul e chiar indemnat sa apese din nou, de avertismentul
     * care spune ca includerea se reia. Deci se citeste intai ce e deja acolo.
     *
     * ⚠ Citirea merge pe INTERVALUL de chei al paginii, nu pe o lista de id-uri: un `.in()` cu
     * cateva sute de uuid-uri pleaca in ADRESA si cade. Pagina e ordonata dupa `id`, deci
     * intervalul o acopera exact.
     */
    const dejaIncluse = new Set<string>();
    /*
     * ⚠ SI CITIREA ASTA E PAGINATA. Intervalul acopera si listarile produselor INACTIVE dintre
     * primul si ultimul id al paginii, deci poate depasi plafonul PostgREST de 1000 de randuri.
     * Trunchiata, ar fi lipsit randuri deja incluse, si le-am fi rescris degeaba: exact
     * re-stampilarea pe care o repara blocul asta.
     */
    let dupaListare: string | null = null;
    for (;;) {
      let ql = admin.from("pepita_listari")
        .select("product_id, inclus")
        .eq("business_id", businessId)
        .lte("product_id", ids[ids.length - 1].id)
        .order("product_id").limit(1000);
      ql = dupaListare ? ql.gt("product_id", dupaListare) : ql.gte("product_id", ids[0].id);
      const { data: existente, error: eCitire } = await ql;
      if (eCitire) throw eCitire;
      const randuri = (existente ?? []) as { product_id: string; inclus: boolean }[];
      if (randuri.length === 0) break;
      /*
       * ⚠ CURSORUL CARE NU INAINTEAZA OPRESTE BUCLA. O plimbare pe cheie se roteste la nesfarsit
       * daca cheia nu creste — de pilda daca cineva scoate din greseala filtrul care o foloseste.
       * Intr-o functie fara capat asta inseamna o cerere care nu se mai termina niciodata.
       */
      const ultimaListare = randuri[randuri.length - 1].product_id;
      if (ultimaListare === dupaListare) break;
      dupaListare = ultimaListare;
      for (const r of randuri) if (r.inclus) dejaIncluse.add(r.product_id);
      if (randuri.length < 1000) break;
    }

    const deScris = ids.filter((p) => !dejaIncluse.has(p.id));
    if (deScris.length > 0) {
      const { error: eScriere } = await admin.from("pepita_listari").upsert(
        /*
         * ⚠ SARCINA RAMANE EXACT ATAT. Un `safety_stock: null` sau un `pret_override: null`
         * adaugat aici ar sterge, pe `onConflict`, reglajele puse de mana pe fiecare produs.
         */
        deScris.map((p) => ({ business_id: businessId, product_id: p.id, inclus: true, actualizat_la: acum })) as never,
        { onConflict: "business_id,product_id" },
      );
      if (eScriere) throw eScriere;
    }

    /*
     * ⚠ Se aduna DUPA ce scrierea a reusit. Se numara toate produsele paginii, nu doar
     * randurile scrise: cele sarite erau deja in feed, deci raspunsul „N produse incluse"
     * ramane adevarat, iar la a doua apasare nu devine „0".
     */
    scrise += ids.length;
    /* ⚠ Aceeasi paza: o cheie care nu creste ar tine bucla in loc. */
    const ultimul = ids[ids.length - 1].id;
    if (ultimul === cheie) break;
    cheie = ultimul;

    /*
     * O pagina neplina inseamna ca nu mai e nimic dupa ea. Fara randul asta rezultatul ar fi
     * acelasi, dar fiecare rulare intreaga ar mai costa o citire despre care se stie ca vine
     * goala. De aia proba numara citirile.
     */
    if (ids.length < PAGINA) return { scrise, incomplet: false, dupa: null };
  }

  return { scrise, incomplet: true, dupa: cheie };
}
