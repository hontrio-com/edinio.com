"use server";

import { headers } from "next/headers";
import { randomUUID } from "node:crypto";
import { sendContactConfirmationToCustomer, sendContactMessageToAdmin } from "@/lib/email";
import { logError } from "@/lib/error-logger";
import { rateLimit, clientIpFromHeaders } from "@/lib/utils/rate-limit";
import { consumaLimita } from "@/lib/utils/limita-durabila";
import { PROGRAM } from "@/lib/website/contact";
import { verificaMesajDeContact, type MesajDeContactBrut } from "@/lib/website/contact-form";
import { verificaRecaptcha } from "@/lib/recaptcha";
import { puneLaCoada } from "@/lib/edinio-marketing/server/coada-conversii";
import { destinatiiActive } from "@/lib/edinio-marketing/server/destinatii-active";
import { consimtamantulCererii } from "@/lib/edinio-marketing/server/consimtamant-server";

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

/*
  ⚠ `event_id` PLEACA DE PE SERVER, si asta e o hotarare, nu un amanunt.

  Conversia s-a intamplat cand SERVERUL a primit mesajul — nu cand omul a apasat
  butonul. Daca id-ul s-ar naste in browser, ar exista si pentru incercarile care
  au picat la validare, la captcha sau la trimiterea emailului: raportul ar arata
  mai multe cereri decat au ajuns vreodata la noi.

  ⚠ SI E ACELASI ID pentru toate destinatiile. Cand se adauga Meta CAPI si
  echivalentele lor, browserul si serverul trebuie sa trimita ACELASI id ca sa se
  poata deduplica. Nascut in doua locuri, ar fi doua conversii pentru un singur om.
*/
export type ContactResult = { ok: true; eventId: string } | { ok: false; error: string };

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
   * ⚠ Limitatorul din memorie e per instanta: limita reala e 3 x numarul de
   * instante calde si se reseteaza la fiecare livrare. Blocheaza rafalele de pe
   * un singur IP, nu un atac impartit. De aceea sub el sta acum si stratul din
   * baza — vezi nota de dupa validare.
   */
  const hdrs = await headers();
  const ip = clientIpFromHeaders(hdrs);
  if (!rateLimit(`contactForm:${ip}`, 3, 60_000)) {
    return { ok: false, error: "Ai trimis deja cateva mesaje. Te rugam sa astepti un minut." };
  }


  /*
    ═══ ⚠ AL DOILEA STRAT, IN BAZA — cel care tine peste instante ═══

    Randul de deasupra opreste rafalele de pe un singur proces. Nu opreste un
    atac impartit pe instante, si se sterge la fiecare desfasurare. Regula casei
    (limita-durabila.ts) o spune limpede: orice actiune care COSTA BANI — email,
    SMS, apel la furnizor — cere si stratul din baza. Abonarea la blog il avea de
    la inceput; formularele astea doua, nu.

    ⚠ CHEIA PE IP STA INAINTEA CAPTCHA-ULUI, dinadins: un apel la Google costa
    ~200ms si nu vrem sa-l platim pentru o rafala. Cheia pe adresa vine DUPA,
    cand stim ca in fata e un om.

    ⚠ FARA BLOCARE PROGRESIVA pe IP (al patrulea argument lipseste). Un IP poate
    fi un birou intreg sau o retea mobila cu mii de abonati; o blocare de o ora
    ar taia oameni adevarati pentru fapta unuia singur.

    ⚠ SI E O FRANA, NU O INCUIETOARE: `consumaLimita` cade DESCHIS daca baza nu
    raspunde. De aceea stratul din memorie ramane deasupra, nu il inlocuieste.
  */
  const peIp = await consumaLimita(`contact:ip:${ip}`, 10, 3600);
  if (!peIp.permis) {
    return { ok: false, error: "Prea multe mesaje trimise de aici. Incearca mai tarziu." };
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
    ⚠ CHEIA PE ADRESA, DUPA CAPTCHA. Opreste celalalt fel de abuz: multi care
    trimit ACEEASI adresa, ca sa inunde cutia cuiva cu emailurile noastre de
    confirmare. Cheia pe IP nu-l prinde — vin de peste tot.

    ⚠ 8 PE ZI, NU 3. Auditul cerea 3, luat de la newsletter. Dar asta e un
    formular de ASISTENTA: omul cu o problema urgenta scrie de mai multe ori, si
    a patra oara ar fi taiat in tacere — chiar defectul impotriva caruia e scris
    raspunsul de mai jos. 8 opreste inundarea si nu atinge pe nimeni real.

    Adresa se normalizeaza (mic + fara spatii), altfel `Ion@X.ro` si `ion@x.ro`
    ar fi doua contoare pentru aceeasi cutie.
  */
  const peAdresa = await consumaLimita(`contact:email:${mesaj.email.trim().toLowerCase()}`, 8, 86_400);
  if (!peAdresa.permis) {
    return { ok: false, error: "Am primit deja mai multe mesaje pentru adresa asta azi. Scrie-ne direct la contact@edinio.com." };
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

  /*
    ⚠ ACELASI `event_id` CA IN BROWSER. Formularul trage `generate_lead` cu
    `res.eventId` — care e chiar id-ul nascut mai jos. Furnizorii unesc cele doua
    drumuri dupa el si numara O cerere, nu doua.

    ⚠ SI SE PUNE LA COADA DUPA CE EMAILUL A PLECAT, nu inainte. O conversie
    raportata pentru o cerere care nu ne-a ajuns e mai rea decat una pierduta.
  */
  const idConversie = randomUUID();
  await puneLaCoada(
    { name: "generate_lead", lead_type: "contact", form_name: "contact", event_id: idConversie },
    { ctx: { ip }, amprentaOmului: idConversie },
    destinatiiActive(),
    { fel: "cookie", stare: await consimtamantulCererii() },
  );
  return { ok: true, eventId: idConversie };
}
