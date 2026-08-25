import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/types/database.types";
import { logError } from "@/lib/error-logger";

/**
 * Ciclul de viata al unei comenzi venite de pe marketplace — prin ACELASI motor
 * ca panoul si loturile.
 *
 * ═══ DE CE ═══
 *
 * Trendyol si About You scriau direct in `orders`:
 *
 *     admin.from("orders").update({ status: edinioStatus, ... })
 *
 * Deci: Trendyol anuleaza -> statusul devine `cancelled` -> STOCUL RAMANE
 * CONSUMAT. Cuponul la fel, marcajele la fel. Tot ce am construit pentru panou
 * (`aplica_tranzitia_comenzii`) era ocolit tocmai de sursa de comenzi pe care n-o
 * controlam si care anuleaza cel mai des.
 *
 * Si e mai rau de ieri, nu mai bine: pana ieri comenzile de marketplace nici nu
 * scriau `stoc_rezervat`, deci n-avea ce sa se elibereze oricum. Acum scriu —
 * motorul AR functiona. Lipsea doar conducta.
 *
 * Un singur loc pentru amandoua, din acelasi motiv ca la
 * [[finalizare-plata]]: cinci copii ale regulii de plata se despartisera deja, si
 * doua copii ale acesteia ar apuca-o pe acelasi drum.
 */
/**
 * Ce s-a intamplat cu tranzitia, din punctul de vedere al APELANTULUI.
 *
 * ═══ DE CE NU E UN `boolean` ═══
 *
 * Era, si nimeni nu-l citea — dar nici n-avea cum sa-l citeasca util. Un `false`
 * nu spune daca merita reincercat, iar apelantii (ingestul de marketplace) au
 * exact aceasta intrebare: `pollPackages` opreste avansarea marcajului de timp
 * cand ceva a esuat, deci un esec PERMANENT (comanda stearsa, alt magazin) ar
 * ingheta fereastra pentru totdeauna si ar opri sincronizarea intregului magazin.
 * E fix capcana descrisa pe larg in `trendyol/orders.ts`, la plafonul de paginare.
 *
 * Deci:
 *   `ok`         — s-a aplicat.
 *   `reincearca` — n-am putut afla (retea, lock, timeout). Marcajul NU avanseaza.
 *   `definitiv`  — baza a raspuns limpede „nu se poate". Reincercarea n-are ce sa
 *                  schimbe, deci marcajul are voie sa avanseze; ramane logul.
 */
export type RezultatTranzitie = "ok" | "reincearca" | "definitiv";

export async function tranzitieComandaMarketplace(
  /*
   * `SupabaseClient<Database>`, nu `SupabaseClient` gol.
   *
   * Fara generic, `.rpc()` accepta ORICE sir si orice argumente — deci un nume de
   * functie scris gresit sau un argument lipsa trec nevazute. Verificat: cu tipul
   * gol, tsc nu semnala nici `p_order_id_GRESIT`, nici `p_status: 42`, nici un nume
   * de functie inexistent. Zero erori, la toate trei.
   */
  admin: SupabaseClient<Database>,
  p: {
    orderId: string;
    businessId: string;
    /** Statusul Edinio derivat din cel al marketplace-ului. */
    status: string;
    /** `trendyol` / `aboutyou` — intra in jurnal. */
    sursa: string;
    /** Campuri care NU tin de ciclul de viata (ex. numarul de urmarire). */
    campuriSuplimentare?: Record<string, unknown>;
    /**
     * Marfa se intoarce pe raft odata cu vanzarea?
     *
     * ═══ ⚠ „ANULAT" SI „RETURNAT" NU SUNT ACELASI LUCRU PENTRU STOC (25.08.2026) ═══
     *
     * `aplica_tranzitia_comenzii` trateaza `refunded` si `cancelled` la fel: amandoua intorc
     * vanzarea, deci elibereaza stocul intregii comenzi. Pentru o ANULARE e limpede corect —
     * marfa n-a plecat nicaieri.
     *
     * Pentru un RETUR nu e, si aveam deja regula opusa scrisa in casa. `emag/rma.ts`:
     * „STOCUL NU SE PUNE INAPOI AUTOMAT. NICIODATA, DEOCAMDATA" — fiindca marfa intoarsa nu
     * e mereu vandabila, si fiindca se poate intoarce doar o parte din comanda.
     *
     * ⚠ CE COSTA: o comanda de trei produse din care clientul intoarce unul punea inapoi
     * TREI. Iar comerciantul, care oricum verifica marfa si o adauga de mana, o adauga peste
     * — deci se si dubla. Amandoua se vad abia la inventar.
     *
     * ⚠ LIPSA INSEAMNA „ca pana acum". Toti ceilalti apelanti raman neschimbati: o reparatie
     * care ar fi schimbat implicitul ar fi atins fiecare anulare din aplicatie ca sa repare
     * un singur drum de retur.
     */
    elibereazaStoc?: boolean;
  },
): Promise<RezultatTranzitie> {
  /*
   * Campurile care nu tin de ciclu se scriu INAINTE si separat.
   *
   * Numarul de urmarire nu are nicio legatura cu stocul sau cu cuponul, si nu
   * merita bagat in tranzactia de tranzitie: daca aia pica, numarul ramas scris e
   * inofensiv si se rescrie oricum la sincronizarea urmatoare.
   */
  if (p.campuriSuplimentare && Object.keys(p.campuriSuplimentare).length > 0) {
    const { error } = await admin
      .from("orders")
      .update({ ...p.campuriSuplimentare, updated_at: new Date().toISOString() })
      .eq("id", p.orderId)
      .eq("business_id", p.businessId);
    if (error) {
      await logError({
        action: `${p.sursa}/tranzitie`,
        message: `campurile auxiliare nu s-au putut scrie: ${error.message}`,
        details: { orderId: p.orderId }, businessId: p.businessId, severity: "warning",
      });
    }
  }

  const { data, error } = await admin.rpc("aplica_tranzitia_comenzii", {
    p_order_id: p.orderId,
    p_status: p.status,
    // Marketplace-ul nu schimba starea platii: comenzile vin deja platite, iar
    // rambursarea se reflecta prin STATUS (`refunded`), nu prin `payment_status`.
    p_payment_status: null,
    p_business_id: p.businessId,
    /* ⚠ `null`, nu `false`, cand nu s-a cerut nimic: in SQL `coalesce(..., true)` pastreaza
       purtarea de pana acum, iar `false` ar fi oprit eliberarea la TOATE anularile. */
    p_elibereaza_stoc: p.elibereazaStoc ?? null,
  });

  const rez = data as { gasit?: boolean; motiv?: string; stoc?: string; negative?: unknown[] } | null;
  if (error || rez?.gasit !== true) {
    /*
     * ⚠ „N-am putut afla" si „nu se poate" NU se trateaza la fel.
     *
     * `error` inseamna ca RPC-ul n-a raspuns: lock timeout pe `select ... for
     * update`, statement timeout, deadlock, 5xx tranzitoriu de la PostgREST.
     * Functia e un singur corp plpgsql, deci n-a scris NIMIC — nici status, nici
     * cupon, nici eliberare de stoc — si o reincercare chiar poate reusi.
     *
     * `gasit: false` (rand inexistent sau `motiv: "alt magazin"`) e un raspuns
     * limpede. Reincercat la nesfarsit, ar bloca marcajul de timp al intregului
     * magazin pentru un singur pachet otravit.
     *
     * `rez` null fara `error` nu s-ar cuveni sa existe (functia intoarce mereu un
     * jsonb), deci se citeste ca „nu stim": mai bine reincercam degeaba decat sa
     * sarim peste o comanda.
     */
    const fel: RezultatTranzitie = error || rez == null ? "reincearca" : "definitiv";
    await logError({
      action: `${p.sursa}/tranzitie`,
      message: error?.message ?? `tranzitia comenzii n-a raspuns valid (${fel})`,
      details: { orderId: p.orderId, status: p.status, raspuns: rez, fel },
      businessId: p.businessId,
      severity: "critical",
    });
    return fel;
  }

  if (rez.stoc === "necunoscut") {
    // Comanda e dinainte de `stoc_rezervat` (sau a fost creata cand marketplace-ul
    // inca nu-l scria): stocul NU s-a dat inapoi si trebuie corectat de mana.
    await logError({
      action: `${p.sursa}/tranzitie`,
      message: "Comanda e dinainte de inregistrarea stocului rezervat; stocul NU s-a dat inapoi automat.",
      details: { orderId: p.orderId }, businessId: p.businessId, severity: "warning",
    });
  }
  if (Array.isArray(rez.negative) && rez.negative.length > 0) {
    await logError({
      action: `${p.sursa}/tranzitie`,
      message: "Reactivarea comenzii de marketplace a cerut mai mult stoc decat exista.",
      details: { orderId: p.orderId, negative: rez.negative }, businessId: p.businessId, severity: "warning",
    });
  }
  /*
   * ⚠ Avertismentele de mai sus raman „ok".
   *
   * Daca cineva le-ar transforma in `reincearca`, ingestul ar incepe sa raporteze
   * esec pe comenzi vechi perfect valide (`stoc: "necunoscut"` inseamna doar ca
   * sunt dinainte de `stoc_rezervat`) si ar bloca marcajul intregului magazin.
   */
  return "ok";
}
