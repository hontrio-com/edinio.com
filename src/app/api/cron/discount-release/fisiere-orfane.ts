import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/types/database.types";
import { deleteFromR2 } from "@/lib/r2";
import { logError } from "@/lib/error-logger";

/**
 * Maturarea fisierelor pe care nu le-a cerut nicio comanda.
 *
 * ═══ ⚠ DE CE TREBUIE MATURATE ═══
 *
 * Incarcarea din configurator e singura din platforma care nu cere cont. Cine urca e vizitatorul
 * unui magazin: n-are sesiune, nu i se poate inchide contul, si nu raspunde de nimic. Fara
 * maturare, oricine ne poate umple depozitul la nesfarsit — incarci, inchizi fila, repeti.
 *
 * Randul se naste deci ORFAN (`comanda_id is null`) si abia plasarea comenzii ii da un motiv sa
 * existe.
 *
 * ═══ ⚠ DE CE SAPTE ZILE, SI NU O ZI ═══
 *
 * Fereastra asta e cat sta un cos neplasat. Cosul traieste in `localStorage`, iar platforma
 * trimite emailuri de recuperare a cosului abandonat — adica ii spune omului, zile mai tarziu, sa
 * se intoarca si sa termine comanda. Cu o fereastra de o zi, el se intorcea si gasea comanda
 * REFUZATA: poza lui fusese stearsa, iar `verificaRaspunsul` nu mai gaseste id-ul.
 *
 * Sapte zile costa cateva zeci de megaocteti de depozit si sting exact acel caz. Volumul e oricum
 * marginit din alta parte: ruta de incarcare are prag pe IP, in doua straturi, si plafon de marime.
 *
 * ═══ ⚠ INTAI RANDUL, SI ABIA APOI OBIECTUL — SI ASTA E ORDINEA CARE CONTEAZA ═══
 *
 * Intre citirea listei si stergere trece timp, iar in timpul ala o comanda poate lega chiar unul
 * dintre randurile citite. Sterse intai din R2, obiectul ar fi plecat inainte ca `comanda_id` sa fi
 * ajuns pe rand: comanda ramanea cu o trimitere catre o poza care nu mai exista nicaieri, iar
 * atelierul afla cand deschidea specificatia ca sa produca. IREPARABIL.
 *
 * Deci hotaraste BAZA, o singura data, atomic: se sterg randurile care mai sunt orfane CHIAR ACUM,
 * si abia cheile intoarse de acolo pleaca din depozit. Ce ramane e fereastra inversa — un rand
 * sters caruia i-a picat stergerea din R2 — si aia costa cativa octeti de depozit scapati, care se
 * si VAD in jurnal. Un obiect scapat e o pierdere de bani; o poza pierduta dintr-o comanda platita
 * e o comanda produsa gresit.
 */

/** Cate zile sta un fisier neordonat. Vezi antetul: e cat traieste un cos abandonat. */
export const ZILE_PANA_LA_MATURARE = 7;

/** Cate se matura intr-o rulare. Cronul e orar, deci 200 pe ora inseamna 4.800 pe zi. */
const MAX_PE_RULARE = 200;

export async function maturaFisiereleOrfane(
  admin: SupabaseClient<Database>,
): Promise<{ sterse: number; scapate: number }> {
  const prag = new Date(Date.now() - ZILE_PANA_LA_MATURARE * 24 * 3600 * 1000).toISOString();

  /*
   * ⚠ Se citeste doar ca sa se afle CARE, si se citeste marginit: `delete` cu `limit` nu exista in
   * PostgREST, iar un `delete` fara plafon pe o coada crescuta ar fi tinut lacate pe mii de randuri
   * intr-un cron care mai are treaba.
   */
  const { data: candidati, error } = await admin
    .from("configurator_fisiere")
    .select("id")
    .is("comanda_id", null)
    .lt("creat_la", prag)
    .order("creat_la", { ascending: true })
    .limit(MAX_PE_RULARE);

  if (error) {
    await logError({
      action: "discount-release.fisiere_orfane", message: error.message, severity: "warning",
    });
    return { sterse: 0, scapate: 0 };
  }
  if (!candidati?.length) return { sterse: 0, scapate: 0 };

  /*
   * ⚠ Conditiile se REPETA pe stergere, si asta e chiar paza. `.is("comanda_id", null)` aici
   * inseamna ca baza hotaraste, in aceeasi instructiune, ca randul mai e orfan. Un rand legat
   * intre timp de o comanda ramane pe loc si NU-si intoarce cheia, deci obiectul lui nici nu se
   * atinge.
   */
  const { data: plecate, error: eSterg } = await admin
    .from("configurator_fisiere")
    .delete()
    .is("comanda_id", null)
    .lt("creat_la", prag)
    .in("id", candidati.map((c) => c.id))
    .select("id, cheie");

  if (eSterg) {
    await logError({
      action: "discount-release.fisiere_orfane.delete", message: eSterg.message, severity: "warning",
    });
    return { sterse: 0, scapate: 0 };
  }

  let scapate = 0;
  for (const rand of plecate ?? []) {
    try {
      await deleteFromR2(rand.cheie);
    } catch {
      /*
       * ⚠ Randul e deja plecat, deci obiectul ramane in depozit fara nimic care sa mai stie de el.
       * Nu se poate reincerca — cheia s-a pierdut odata cu randul — deci singurul lucru cinstit e
       * sa se NUMERE si sa se vada in jurnal. Vezi antetul: e capatul ieftin al compromisului.
       */
      scapate++;
    }
  }

  if (scapate) {
    await logError({
      action: "discount-release.fisiere_orfane.r2",
      message: `${scapate} obiecte au ramas in depozit dupa ce randul lor a plecat`,
      details: { scapate, sterse: plecate?.length ?? 0 },
      severity: "warning",
    });
  }

  return { sterse: plecate?.length ?? 0, scapate };
}
