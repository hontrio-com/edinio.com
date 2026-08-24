/**
 * Verdictul lor, scris la noi.
 *
 * ═══ ⚠ DE CE STA INTR-UN MODUL, SI NU IN RUTA DE CRON ═══
 *
 * Pana azi traia in `api/cron/emag-sync/route.ts`, si acolo era singurul lui apelant.
 * Dar notificarea „documentatie aprobata” are nevoie de exact acelasi lucru: eMAG ne
 * suna, iar noi vrem sa scriem starea CHIAR ATUNCI, nu la trecerea cronului care
 * ajunge cu cursorul la pagina aceea.
 *
 * ⚠ Scris a doua oara in webhook, s-ar fi departat de acesta — si departarea nu s-ar
 * fi vazut, fiindca amandoua raspund cu un numar. E chiar defectul gasit azi la
 * `retrage()` fata de `existaLaEmag`: aceeasi regula in doua locuri, iar una a ramas
 * in urma cu un martor.
 */

import type { createClient } from "@supabase/supabase-js";
import type { Database } from "@/types/database.types";
import { logError } from "@/lib/error-logger";
import { intregDeLaEi, zecimalDeLaEi } from "./numere";
import { eRespinsaDeEmag, motiveDeLaEi } from "./motive";
import { stocDeImportat } from "./import-produse";
import { EMAG_VALIDARE_IN_CURS } from "./de-ce-nu-se-vinde";
import { EMAG_VALIDARE_VANDABILA } from "./types";
import { eVandabila } from "./rute";
import type { EmagOfertaCitita, StareOferta } from "./types";

type Admin = ReturnType<typeof createClient<Database>>;

/**
 * `validation_status` pe care documentatia lor nu-l descrie.
 *
 * ⚠ `null` NU intra aici: acela inseamna „inca n-am citit”, si e o stare a NOASTRA, nu a
 * lor. Numarata ca necunoscuta, fiecare oferta noua ar fi cerut sa i se pastreze
 * raspunsul intreg degeaba.
 */
export function stareNecunoscuta(validation: number | null): boolean {
  return validation != null
    && !EMAG_VALIDARE_VANDABILA.includes(validation)
    && !EMAG_VALIDARE_IN_CURS.includes(validation)
    && !eRespinsaDeEmag(validation);
}

/* ═══════════════════════════════════════════════════════════════════════════
   VERDICTUL LOR, SCRIS LA NOI
   ═══════════════════════════════════════════════════════════════════════════ */

/**
 * Statusurile aduse de la eMAG, puse pe randurile noastre.
 *
 * ⚠ SE SCRIE SI CE E RAU, INTREG. `doc_errors` e SINGURUL loc din care afla
 * comerciantul ce sa repare. La Trendyol motivul respingerii n-a fost aratat, iar
 * produsele au stat „in aprobare” la nesfarsit — cu comerciantul convins ca noi le
 * tinem pe loc.
 */
export async function scrieStatusurile(
  admin: Admin, businessId: string, oferte: EmagOfertaCitita[],
): Promise<number> {
  let scrise = 0;
  for (const o of oferte) {
    if (!Number.isFinite(o.id)) continue;

    const validation = intregDeLaEi(o.validation_status);
    const offerValidation = intregDeLaEi(o.offer_validation_status);
    /*
     * ═══ ⚠ ACEEASI FUNCTIE CA LA IMPORT, NU O A DOUA ADUNARE (audit 24.08.2026) ═══
     *
     * Aici se aduna doar `o.stock[]`. Dar raspunsul lui `product_offer/read` NU e in
     * schema lor — e `ApiResponse` generic — iar in practica ofertele vin adesea fara
     * `stock[]` si cu `general_stock`, care e chiar ce vede cumparatorul la ei.
     *
     * `stocDeImportat` stia asta de la inceput, cu tot cu proba: importul cade pe
     * `general_stock` cand nu se poate aduna nimic pe depozite. Reconcilierea n-a
     * primit niciodata aceeasi cunoastere.
     *
     * ⚠ CE A COSTAT, masurat pe catalogul unui comerciant cu 3.754 de oferte:
     * `eVandabila` cere `stoc > 0` deodata cu celelalte trei conditii. Cu stocul citit
     * ca ZERO, doar 27 de oferte ieseau „Se vinde pe eMAG” — desi 3.469 erau APROBATE
     * la ei si 3.742 aveau oferta valida. Celelalte 3.727 apareau in ecran cu „Trimis,
     * in validare": o eticheta care il trimite pe om sa astepte o validare INCHEIATA
     * de mult, in loc sa se uite la ce chiar lipseste.
     *
     * Nicio eroare, nicaieri. Zero e o valoare valida pentru un stoc.
     *
     * ⚠ Doua copii ale aceleiasi cunoasteri se despart, iar despartirea nu se vede:
     * amandoua raspund cu un numar. De aceea aici se CHEAMA functia importului, nu se
     * scrie a doua adunare langa ea.
     */
    const stoc = stocDeImportat(o);

    const vandabila = eVandabila({
      stoc,
      status: o.status ?? null,
      offer_validation_status: offerValidation,
      validation_status: validation,
    });

    /*
     * ⚠ ULTIMELE PATRU TREC ACUM PRIN `intregDeLaEi` (24.08.2026).
     *
     * Nefiltrate, un `ownership: true` de la ei facea PostgREST sa refuze randul cu
     * „invalid input syntax for type integer”. Iar aici caderea era TACUTA: `if
     * (!error) scrise++` sare peste, trecerea merge mai departe, ecranul arata un
     * numar mai mic, si nimeni n-are de ce sa se uite.
     *
     * La import aceeasi greseala a picat zgomotos si s-a aflat in cinci minute. Aici
     * ar fi putut sta luni — reconcilierea e chiar controlul care ne spune ce e la ei,
     * si ar fi tacut tocmai despre ofertele pe care nu le poate scrie.
     */
    const { error } = await admin.from("emag_offers").update({
      validation_status: validation,
      offer_validation_status: offerValidation,
      translation_validation_status: intregDeLaEi(o.translation_validation_status),
      /*
       * ═══ ⚠ MOTIVUL SE CULEGE, NU SE CITESTE DINTR-O CHEIE GHICITA (24.08.2026) ═══
       *
       * Masurat pe contul unui comerciant: 152 de oferte RESPINSE de eMAG (112 cu
       * documentatia respinsa, 34 blocate, 6 cu EAN respins) si la TOATE 152
       * `doc_errors` era gol. Adica omul avea 152 de produse refuzate si niciun motiv
       * pentru niciunul — chiar greseala §12.9, lectia Trendyol.
       *
       * `doc_errors` a fost o presupunere de-a noastra: raspunsul lui
       * `product_offer/read` NU e in schema lor. Exact ca `ownership`, care s-a dovedit
       * `boolean` acolo unde documentatia scrie 1/2.
       *
       * `motiveDeLaEi` cauta in toate formele plauzibile. Iar pentru ofertele respinse
       * se pastreaza raspunsul INTREG, ca data viitoare sa existe dovada in loc de o a
       * doua presupunere.
       */
      doc_errors: motiveDeLaEi(o) as never,
      /* ⚠ Numai pentru cele respinse: pastrat pentru toate, ar fi insemnat un jsonb pe
         fiecare din mii de randuri, rescris la fiecare trecere a cronului. */
      /*
       * ⚠ SI PENTRU STARILE PE CARE NU LE STIM, nu doar pentru cele respinse.
       *
       * Ei trimit si `validation_status: 0`, valoare care nu exista in enumul lor — 61 de
       * oferte pe contul real. Si tocmai despre acelea n-aveam nicio dovada pastrata: 0
       * din 61 cu raspuns brut. Adica exact starea despre care nu stim nimic era singura
       * pentru care nu tineam nimic.
       *
       * Ziua in care `ownership` a venit `boolean` s-a inchis pastrand raspunsul intreg.
       * Aici se face la fel, inainte sa fie nevoie.
       */
      raspuns_brut: (
        eRespinsaDeEmag(validation) || stareNecunoscuta(validation) ? (o as never) : null
      ) as never,
      part_number_key: o.part_number_key ?? null,
      /* ⚠ Si numele. Comerciantul isi poate redenumi oferta in panoul lor; scris o
         singura data la import, ecranul nostru ar fi ramas cu numele vechi. */
      nume_emag: (o.name ?? "").trim() || null,
      /*
       * ⚠ CATE IMAGINI ARE EMAG, dupa ce ne-au spus ei (24.08.2026).
       *
       * `EmagOfertaCitita.images` exista in tipuri de la inceput si nu se scria nicaieri.
       * Deci intrebarea „are eMAG poza noastra?” n-avea niciun raspuns in baza, iar cand
       * comerciantul a intrebat de ce vede produsele fara imagine, s-a ajuns la
       * presupuneri in loc de o privire pe un rand.
       *
       * ⚠ `null` cand campul lipseste din raspuns, `0` cand chiar n-au niciuna. Doua
       * lucruri diferite: primul inseamna „nu ne-au spus”, al doilea „ne-au spus ca nu”.
       */
      imagini_la_ei: Array.isArray(o.images) ? o.images.length : null,
      /*
       * ⚠ STAREA OFERTEI LA EI, si e piesa care lipsea (24.08.2026).
       *
       * `eVandabila` cere `status === 1` deodata cu celelalte trei conditii, dar noi n-o
       * pastram nicaieri. Deci 3.469 de oferte APROBATE la eMAG apareau in ecran cu
       * „Trimis, in validare” — o eticheta care il trimite pe om sa astepte ceva incheiat
       * de mult, in loc sa se uite la ce chiar lipseste.
       *
       * Raspunsul lor brut a aratat `status: 2` la 8 din 9 oferte cercetate: „End of
       * Life", scoase din vanzare. Nici stoc, nici validare — pur si simplu nu mai sunt
       * de vanzare la ei. Fara campul asta, motivul ala nu putea fi spus niciodata.
       */
      status_la_ei: intregDeLaEi(o.status),
      /* ⚠ Ultima din cele patru conditii ale vandabilitatii pe care n-o pastram. Fara ea,
         ecranul nu putea deosebi „n-are stoc la ei” de „e oprita la ei”. */
      stoc_la_ei: stoc,
      ownership: intregDeLaEi(o.ownership),
      number_of_offers: intregDeLaEi(o.number_of_offers),
      buy_button_rank: intregDeLaEi(o.buy_button_rank),
      best_offer_sale_price: zecimalDeLaEi(o.best_offer_sale_price),
      status: (vandabila ? "live" : "sent") satisfies StareOferta,
      last_status_at: new Date().toISOString(),
    }).eq("business_id", businessId).eq("emag_id", o.id);

    /* ⚠ O cadere la scriere NU mai e tacuta. Nescrisa, ea arata ca „oferta n-a fost
       atinsa" — la fel ca o oferta care chiar nu mai e a noastra. */
    if (error) {
      void logError({
        action: "emag-sync.reconciliere",
        message: `statusul ofertei ${o.id} nu s-a putut scrie: ${error.message}`,
        details: { businessId, emag_id: o.id },
        severity: "warning",
      });
      continue;
    }
    scrise++;
  }
  return scrise;
}

