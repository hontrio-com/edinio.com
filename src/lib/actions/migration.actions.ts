"use server";

import { headers } from "next/headers";
import {
  sendMigrationConfirmationToCustomer,
  sendMigrationLeadToAdmin,
} from "@/lib/email";
import { logError } from "@/lib/error-logger";
import { rateLimit, clientIpFromHeaders } from "@/lib/utils/rate-limit";
import { consumaLimita } from "@/lib/utils/limita-durabila";
import { verificaCerereMigrare, type CerereMigrareBruta } from "@/lib/website/migrare-form";
import { verificaRecaptcha } from "@/lib/recaptcha";

/**
 * Trimiterea formularului de cerere de migrare, de pe `/migrare`.
 *
 * ⚠ `"use server"` expune FIECARE export din fișier, și fiecare trebuie să fie o
 * funcție async. De aia aici stă o singură funcție, iar validarea — care e cod
 * obișnuit și trebuie probată — stă în `lib/website/migrare-form.ts`.
 *
 * ═══ CE ERA ÎNAINTE, ȘI DE CE NU S-A PĂSTRAT ═══
 *
 * Funcția asta exista deja, pentru formularul de pe pagina de campanie
 * `(landing)/migrare`. Pagina a fost ștearsă când migrarea s-a refăcut ca pagină
 * de site, dar acțiunea a rămas — iar o acțiune de server rămâne un endpoint
 * public chiar și fără niciun formular care s-o cheme. Deci nu era cod mort, era
 * o ușă deschisă fără nimeni la ea:
 *
 * - **fără limitare de rată** — oricine putea trimite emailuri în rafală;
 * - **fără reCAPTCHA** — spre deosebire de formularul de contact, care o are;
 * - **fără email** ca și câmp, deci nu se putea trimite nicio confirmare, iar
 *   „Răspunde" din clientul de mail nu ducea nicăieri;
 * - trimitea la `SUPPORT_ADMIN_EMAIL`, adică o cerere de vânzare ateriza în
 *   coada de asistență tehnică a clienților care au deja cont;
 * - punea „Alta" peste orice platformă nerecunoscută, în loc s-o respingă.
 *
 * Acum e aceeași croială cu `contact.actions.ts`: limitare, validare, captcha,
 * apoi două emailuri care NU sunt egale.
 */

/** Numele acțiunii trimis către Google. Se verifică și la întoarcere. */
const ACTIUNE_CAPTCHA = "migrare";

export type MigrationLeadResult = { ok: true } | { ok: false; error: string };

export async function submitMigrationLead(
  input: CerereMigrareBruta & { captchaToken?: string },
): Promise<MigrationLeadResult> {
  /*
   * Limitare de rată ÎNAINTE de orice altceva.
   *
   * E o acțiune anonimă care trimite DOUĂ emailuri, unul dintre ele către o
   * adresă aleasă de cel care apasă. Fără limită, cine vrea poate trimite mesaje
   * în numele nostru către oricine — adică ne poate folosi domeniul și reputația
   * de expeditor ca să spameze. Costul nu e în bani, e în livrabilitate.
   *
   * ⚠ Limitatorul e ÎN MEMORIE, deci per instanță: limita reală e 3 × numărul de
   * instanțe calde și se resetează la fiecare livrare. Blochează rafalele de pe
   * un singur IP, nu un atac împărțit.
   */
  const hdrs = await headers();
  const ip = clientIpFromHeaders(hdrs);
  if (!rateLimit(`migrationLead:${ip}`, 3, 60_000)) {
    return { ok: false, error: "Ai trimis deja cateva cereri. Te rugam sa astepti un minut." };
  }

  /*
    ═══ ⚠ AL DOILEA STRAT, IN BAZA — geamana celui din `contact.actions.ts` ═══

    Reparate in ACEEASI trecere, dinadins: cu una singura, spamul s-ar fi mutat
    pur si simplu pe celalalt formular. Vezi nota lunga de acolo pentru de ce
    cheia pe IP sta inaintea captcha-ului si de ce n-are blocare progresiva.
  */
  const peIp = await consumaLimita(`migrare:ip:${ip}`, 10, 3600);
  if (!peIp.permis) {
    return { ok: false, error: "Prea multe cereri trimise de aici. Incearca mai tarziu." };
  }

  const verificat = verificaCerereMigrare(input);
  if (!verificat.ok) return { ok: false, error: verificat.error };
  const cerere = verificat.valoare;

  /*
   * reCAPTCHA DUPĂ validare, nu înainte. O cerere către Google costă ~200ms;
   * dacă omul a uitat să bifeze acordul, n-are rost să aștepte ca să afle asta.
   */
  const captcha = await verificaRecaptcha(input.captchaToken, ACTIUNE_CAPTCHA);
  if (!captcha.ok) {
    await logError({
      action: "submitMigrationLead.captcha",
      message: `reCAPTCHA a respins cererea: ${captcha.motiv}`,
      severity: "warning",
    });
    return {
      ok: false,
      error: "Nu am putut confirma ca esti o persoana. Reincarca pagina si incearca din nou.",
    };
  }
  if ("neverificat" in captcha) {
    await logError({
      action: "submitMigrationLead.captcha",
      message: "RECAPTCHA_SECRET_KEY lipseste: formularul de migrare merge FARA verificare anti-robot.",
      severity: "warning",
    });
  }

  /* Cheia pe adresa, dupa captcha. 8/zi ca la contact — cine chiar isi muta
     magazinul poate scrie de mai multe ori pana se lamureste. */
  const peAdresa = await consumaLimita(`migrare:email:${cerere.email.trim().toLowerCase()}`, 8, 86_400);
  if (!peAdresa.permis) {
    return { ok: false, error: "Am primit deja mai multe cereri pentru adresa asta azi. Scrie-ne direct la contact@edinio.com." };
  }

  /*
   * ⚠ FĂRĂ CHEIE NU SE RAPORTEAZĂ SUCCES.
   *
   * Toți expeditorii din `email.ts` încep cu `if (!RESEND_API_KEY) return;` —
   * potrivit pentru un email de curtoazie care nu trebuie să oprească o comandă.
   * Aici însă emailul E lucrarea: fără el, cererea omului nu ajunge nicăieri, iar
   * formularul ar spune „am primit" fără să primească nimeni nimic. Un formular
   * care minte în tăcere e mai rău decât unul care dă eroare: al doilea măcar
   * trimite omul spre telefon.
   */
  if (!process.env.RESEND_API_KEY) {
    await logError({
      action: "submitMigrationLead",
      message: "RESEND_API_KEY lipseste: formularul de migrare nu poate trimite nimic.",
      severity: "error",
    });
    return {
      ok: false,
      error: "Nu am putut trimite cererea acum. Scrie-ne direct la contact@edinio.com sau suna-ne.",
    };
  }

  /*
   * Cele două emailuri NU sunt egale.
   *
   * Al nostru e lucrarea: dacă el nu pleacă, cererea s-a pierdut, deci eșecul lui
   * înseamnă eșecul apăsării. Confirmarea către client e o chitanță: dacă ea cade
   * (adresă care respinge, căsuță plină), cererea e deja la noi și omul NU trebuie
   * trimis să reîncerce — ar produce o a doua cerere identică în căsuța noastră.
   */
  try {
    await sendMigrationLeadToAdmin(cerere);
  } catch (err) {
    await logError({
      action: "submitMigrationLead.admin",
      message: err instanceof Error ? err.message : "Eroare necunoscuta",
      severity: "error",
    });
    return { ok: false, error: "Nu am putut trimite cererea. Incearca din nou sau scrie-ne direct pe email." };
  }

  try {
    await sendMigrationConfirmationToCustomer(cerere);
  } catch (err) {
    /* Se loghează și se merge mai departe: cererea E la noi. */
    await logError({
      action: "submitMigrationLead.confirmare",
      message: err instanceof Error ? err.message : "Eroare necunoscuta",
      details: { email: cerere.email },
      severity: "warning",
    });
  }

  return { ok: true };
}
