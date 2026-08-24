import { after } from "next/server";
import { logError } from "@/lib/error-logger";

/**
 * Lucrare care trebuie sa se termine, dar care nu are voie sa tina raspunsul pe loc.
 *
 * ═══ ⚠ DE CE EXISTA (audit 24.08.2026) ═══
 *
 * Masurat in depozit: **84 din 97** de puneri in coada catre marketplace-uri sunt scrise
 * `void enqueueX(...)` — pornite si uitate, fara `await`. Iar in tot codul nu exista niciun
 * `waitUntil` si niciun `after`.
 *
 * Pe serverless, cand raspunsul pleaca, instanta poate fi inghetata. O promisiune
 * neasteptata poate sa nu apuce sa-si termine scrierea catre baza. Atunci produsul ramane
 * salvat in magazin si NIMIC nu intra in coada — iar defectul e tacut prin definitie: nu
 * se scrie nicaieri ca n-a apucat sa se scrie.
 *
 * ⚠ ASTA E RISCUL DOMINANT, nu „procesul moare intre commit si enqueue". Acela e rar;
 * asta se poate intampla la orice cerere care se termina repede.
 *
 * `after` din Next tine instanta pana cand lucrarea se incheie, fara sa intarzie raspunsul
 * catre comerciant. Documentatia din pachet: „schedule work to be executed after a response
 * is finished… should not block the response". Merge in Server Functions, Route Handlers si
 * Server Components — adica exact locurile de unde pleaca cele 84.
 *
 * ═══ ⚠ DE CE ARE PLASA, SI DE CE E OBLIGATORIE ═══
 *
 * `after` cere un context de cerere. Chemat din afara lui — un script, un test, o functie
 * ajunsa acolo pe alta cale — ARUNCA. Iar aici asta ar fi cea mai proasta forma de
 * reparatie: o unealta pusa ca sa nu se piarda lucrari, care le pierde chiar ea, si inca
 * zgomotos, in mijlocul salvarii unui produs.
 *
 * Deci: daca `after` nu se poate folosi, se face EXACT ce se facea pana acum — `void`.
 * Reparatia nu poate iesi mai rau decat starea de dinainte, in niciun caz.
 *
 * ⚠ Si esecul lucrarii se scrie. Fiecare `enqueue…` isi inghite deja erorile inauntru, dar
 * ce ar scapa printre ele n-are voie sa dispara: chiar tacerea e lucrul reparat aici.
 */
export function dupaRaspuns(
  lucrare: () => Promise<unknown>,
  unde: string,
  businessId?: string,
): void {
  const cuPaza = async () => {
    try {
      await lucrare();
    } catch (e) {
      await logError({
        action: `dupaRaspuns.${unde}`,
        message: e instanceof Error ? e.message : "lucrarea de dupa raspuns a esuat",
        details: { unde },
        businessId,
        severity: "warning",
      });
    }
  };

  try {
    after(cuPaza);
  } catch {
    /*
     * ⚠ Fara context de cerere. Se face ca pana acum: pornit si uitat.
     *
     * NU se arunca si NU se scrie in jurnal: chemarea din afara unei cereri e legitima
     * (un cron care nu e Route Handler, un test), iar un rand de eroare la fiecare
     * asemenea chemare ar umple jurnalul cu ceva ce nu e o problema.
     */
    void cuPaza();
  }
}
