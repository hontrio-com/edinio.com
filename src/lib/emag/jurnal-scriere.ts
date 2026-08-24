import { createAdminClient } from "@/lib/supabase/admin";
import { logError } from "@/lib/error-logger";
/* ⚠ `import type`, nu `import`. `client.ts` importa fisierul asta, deci un import
   obisnuit ar fi facut un ciclu la rulare. Tipul se sterge la compilare. */
import type { EmagAuth } from "./client";
import {
  deJurnalizat, firulCurent, idurileAtinse, mesajeDeScris,
  type FelCerere, type MetodaJurnal,
} from "./jurnal";

/**
 * Scrierea propriu-zisa a unui rand de jurnal (§65).
 *
 * ⚠ FISIER SEPARAT DE `jurnal.ts`, DINADINS. Acolo sunt hotararile — ce se scrie,
 * ce nu, ce se taie — si sunt curate: nu ating nici reteaua, nici baza de date, deci
 * se pot proba intregi. Aici e singurul loc care atinge Supabase.
 *
 * Amestecate, probele ar fi cerut un client de baza de date ca sa raspunda la
 * intrebarea „se jurnalizeaza o citire reusita?" — si atunci n-ar mai fi existat.
 */

export interface CerereDeJurnalizat {
  auth: EmagAuth;
  metoda: MetodaJurnal;
  /** ⚠ Citire sau scriere, SPUS de apelant. La ei totul e POST. Vezi `FelCerere`. */
  fel: FelCerere;
  cale: string;
  corp: unknown;
  status: number;
  verdict: string;
  durataMs: number;
  mesaje: string[];
  eroare: string | null;
}

/**
 * Scrie un rand, daca merita scris.
 *
 * ═══ ⚠ SE ASTEAPTA, NU SE ARUNCA IN URMA ═══
 *
 * O scriere „fire-and-forget" ar fi parut mai ieftina si ar fi pierdut exact
 * randurile care conteaza: intr-o functie fara stare, ce ramane nefinalizat cand se
 * intoarce raspunsul se poate opri oricand — iar ultima cerere dintr-o rulare e
 * tocmai cea care a facut-o sa cada.
 *
 * Si nu costa nimic: intre doua cereri catre eMAG stam oricum pe loc dupa jeton
 * (3 pe secunda inseamna 333 ms de asteptare), iar scrierea asta intra in timpul ala.
 *
 * ═══ ⚠ O CADERE AICI NU ARE VOIE SA STRICE CEREREA ═══
 *
 * Jurnalul e o urma, nu o parte din lucrare. Un pret care nu pleaca la eMAG fiindca
 * n-am putut scrie un rand de jurnal ar fi fost un pret absurd de platit.
 *
 * ⚠ Dar nici `catch {}` gol: aia e chiar greseala VetDepo, unde 1051 de produse n-au
 * ajuns niciodata in coada si nimeni n-a aflat.
 *
 * ⚠ Se scrie prin `logError`, nu direct in consola, chiar daca tocmai o scriere in
 * baza a picat. `error_logs` e alt tabel: o cadere la `emag_request_log` inseamna cel
 * mai des o valoare respinsa sau o schema nepotrivita, nu o baza cazuta. Iar daca
 * chiar e cazuta, `logError` coboara singur pe consola — are treapta aia scrisa in el.
 */
export async function scrieInJurnal(c: CerereDeJurnalizat): Promise<void> {
  if (!deJurnalizat(c.fel, c.verdict)) return;

  /* Fara magazin, randul n-are proprietar si n-ar fi vizibil nimanui. Se intampla la
     cererile de proba dinaintea conectarii — care oricum au propriul lor raspuns. */
  if (!c.auth?.businessId) return;

  try {
    const admin = createAdminClient();
    const iduri = idurileAtinse(c.corp);
    await admin.from("emag_request_log").insert({
      business_id: c.auth.businessId,
      corelatie: firulCurent(),
      metoda: c.metoda,
      cale: c.cale,
      status: c.status,
      verdict: c.verdict,
      durata_ms: c.durataMs,
      /* `null`, nu `[]`: „n-am gasit niciun id" si „cererea n-avea id-uri" sunt
         acelasi lucru aici, iar `null` nu intra in indexul GIN. */
      emag_ids: iduri.length ? iduri : null,
      mesaje: mesajeDeScris(c.mesaje) as never,
      eroare: c.eroare,
    });
  } catch (e) {
    await logError({
      action: "emag/jurnal",
      message: `randul de jurnal nu s-a putut scrie: ${e instanceof Error ? e.message : String(e)}`,
      details: { cale: c.cale, verdict: c.verdict },
      businessId: c.auth.businessId,
      severity: "warning",
    });
  }
}

/**
 * Sterge randurile mai vechi de `zile`.
 *
 * ⚠ Se cheama din cron, o data pe zi, NU la fiecare trecere. Pornita din minut in
 * minut, ar fi fost 1440 de stergeri pe zi care nu gasesc nimic — un `delete` peste
 * un tabel care creste, de fiecare data.
 *
 * ⚠ Intoarce cate a sters, nu `void`. Un „s-a facut curat" care nu spune cat a sters
 * e chiar tiparul pe care il tot reparam: raspuns de succes, zero efect.
 */
export async function curataJurnalul(zile: number): Promise<number> {
  try {
    const admin = createAdminClient();
    const pragul = new Date(Date.now() - zile * 24 * 60 * 60 * 1000).toISOString();
    const { data, error } = await admin.from("emag_request_log")
      .delete().lt("created_at", pragul).select("id");
    if (error) {
      await logError({
        action: "emag/jurnal",
        message: `curatarea jurnalului a cazut: ${error.message}`,
        severity: "warning",
      });
      return 0;
    }
    return (data ?? []).length;
  } catch (e) {
    await logError({
      action: "emag/jurnal",
      message: `curatarea jurnalului a cazut: ${e instanceof Error ? e.message : String(e)}`,
      severity: "warning",
    });
    return 0;
  }
}
