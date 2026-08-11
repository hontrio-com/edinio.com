"use server";

import { headers } from "next/headers";
import { sendContactConfirmationToCustomer, sendContactMessageToAdmin } from "@/lib/email";
import { logError } from "@/lib/error-logger";
import { rateLimit, clientIpFromHeaders } from "@/lib/utils/rate-limit";
import { PROGRAM } from "@/lib/website/contact";
import { verificaMesajDeContact, type MesajDeContactBrut } from "@/lib/website/contact-form";
import { verificaRecaptcha } from "@/lib/recaptcha";

/**
 * Trimiterea formularului de pe `/contact`.
 *
 * ⚠ `"use server"` expune FIECARE export din fisier, si fiecare trebuie sa fie o
 * functie async. De aia aici sta o singura functie, iar validarea — care e cod
 * obisnuit si trebuie probata — sta in `lib/website/contact-form.ts`.
 * Vezi [[use-server-expune-fiecare-export]].
 */

/** Numele actiunii trimis catre Google. Se verifica si la intoarcere. */
const ACTIUNE_CAPTCHA = "contact";

export type ContactResult = { ok: true } | { ok: false; error: string };

export async function submitContactMessage(
  input: MesajDeContactBrut & { captchaToken?: string },
): Promise<ContactResult> {
  /*
   * Limitare de rata INAINTE de orice altceva.
   *
   * E o actiune anonima care trimite DOUA emailuri, unul dintre ele catre o
   * adresa aleasa de cel care apasa. Fara limita, cine vrea poate trimite
   * mesaje in numele nostru catre oricine — adica ne poate folosi domeniul si
   * reputatia de expeditor ca sa spameze. Costul nu e in bani, e in livrabilitate.
   *
   * ⚠ Limitatorul e IN MEMORIE, deci per instanta: limita reala e 3 x numarul de
   * instante calde si se reseteaza la fiecare livrare. Blocheaza rafalele de pe
   * un singur IP, nu un atac impartit. Al doilea strat, in baza, ramane de facut
   * — la fel ca pentru celelalte scrieri publice.
   */
  const hdrs = await headers();
  const ip = clientIpFromHeaders(hdrs);
  if (!rateLimit(`contactForm:${ip}`, 3, 60_000)) {
    return { ok: false, error: "Ai trimis deja cateva mesaje. Te rugam sa astepti un minut." };
  }

  const verificat = verificaMesajDeContact(input);
  if (!verificat.ok) return { ok: false, error: verificat.error };
  const mesaj = verificat.valoare;

  /*
   * reCAPTCHA DUPA validare, nu inainte.
   *
   * O cerere catre Google costa ~200ms. Daca omul a uitat sa bifeze acordul,
   * nu are rost sa-l facem sa astepte ca sa afle asta. Robotii oricum trec de
   * validare — ei completeaza corect, tocmai asta e problema.
   */
  const captcha = await verificaRecaptcha(input.captchaToken, ACTIUNE_CAPTCHA);
  if (!captcha.ok) {
    await logError({
      action: "submitContactMessage.captcha",
      message: `reCAPTCHA a respins cererea: ${captcha.motiv}`,
      severity: "warning",
    });
    return { ok: false, error: "Nu am putut confirma ca esti o persoana. Reincarca pagina si incearca din nou." };
  }
  if ("neverificat" in captcha) {
    /* Nu e o eroare de rulare, e o gaura de configurare. Se scrie ca sa nu
       ramana „avem captcha" o convingere in loc de un fapt. */
    await logError({
      action: "submitContactMessage.captcha",
      message: "RECAPTCHA_SECRET_KEY lipseste: formularul de contact merge FARA verificare anti-robot.",
      severity: "warning",
    });
  }

  /*
   * ⚠ FARA CHEIE NU SE RAPORTEAZA SUCCES.
   *
   * Toti expeditorii din `email.ts` incep cu `if (!RESEND_API_KEY) return;` —
   * potrivit pentru un email de curtoazie care nu trebuie sa opreasca o comanda.
   * Aici insa emailul E lucrarea: fara el, mesajul omului nu ajunge nicaieri.
   *
   * Lasat asa, formularul ar fi spus „Am primit mesajul tau" fara sa primeasca
   * nimeni nimic — exact defectul pe care il inlocuieste (cel vechi nu trimitea
   * deloc si arata la fel de multumit). Un formular care minte in tacere e mai
   * rau decat unul care da eroare: al doilea macar trimite omul spre telefon.
   */
  if (!process.env.RESEND_API_KEY) {
    await logError({
      action: "submitContactMessage",
      message: "RESEND_API_KEY lipseste: formularul de contact nu poate trimite nimic.",
      severity: "error",
    });
    return {
      ok: false,
      error: "Nu am putut trimite mesajul acum. Scrie-ne direct la contact@edinio.com sau suna-ne.",
    };
  }

  /*
   * Cele doua emailuri NU sunt egale.
   *
   * Al nostru e lucrarea: daca el nu pleaca, cererea omului s-a pierdut, deci
   * esecul lui inseamna esecul apasarii. Confirmarea catre client e o chitanta:
   * daca ea cade (adresa care respinge, casuta plina), mesajul e deja la noi si
   * omul NU trebuie trimis sa reincerce — ar produce un al doilea mesaj
   * identic in casuta noastra.
   */
  try {
    await sendContactMessageToAdmin(mesaj);
  } catch (err) {
    await logError({
      action: "submitContactMessage.admin",
      message: err instanceof Error ? err.message : "Eroare necunoscuta",
      severity: "error",
    });
    return { ok: false, error: "Nu am putut trimite mesajul. Incearca din nou sau scrie-ne direct pe email." };
  }

  try {
    await sendContactConfirmationToCustomer({ ...mesaj, program: PROGRAM.intreg });
  } catch (err) {
    /* Se logheaza si se merge mai departe: mesajul E la noi. */
    await logError({
      action: "submitContactMessage.confirmare",
      message: err instanceof Error ? err.message : "Eroare necunoscuta",
      details: { email: mesaj.email },
      severity: "warning",
    });
  }

  return { ok: true };
}
