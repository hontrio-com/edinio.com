import "server-only";
import type { ContPublic } from "./config";

/**
 * „Verifică”: intreaba furnizorul daca identificatorul lipit de comerciant exista, fara cont si fara secrete.
 *
 * Masurat pe 22.11.2026, cu identificatori inventati si cu unul adevarat:
 *   - Tidio: `code.tidio.co/<cheie>.js` raspunde 404 la o cheie inexistenta;
 *   - tawk.to: `embed.tawk.to/<property>/<widget>` raspunde 404;
 *   - Zendesk: `ekr.zdassets.com/compose/<cheie>` raspunde 404 („No product configs exist”).
 *     ⚠ `static.zdassets.com/ekr/snippet.js?key=…` raspunde 200 la ORICE cheie: nu verifica nimic;
 *   - Intercom: `POST api-iam.intercom.io/messenger/web/ping` cu `app_id` raspunde 404 („App Not Found”) la
 *     un ID inexistent si 403 („Forbidden request”) la unul adevarat.
 *     ⚠ 403 NU inseamna „mesageria e oprita”. Masurat pe 23.11.2026 cu un spatiu adevarat: cererea de pe
 *     server primeste 403, iar aceeasi cerere facuta de Messenger din browser primeste 200 si fereastra se
 *     deschide, cu site-ul inca „Not installed” in Intercom. Prima forma citea 403 ca „porneste Messenger
 *     pentru web” si trimitea comerciantul sa caute o setare care nu era stricata. De pe server se poate afla
 *     doar daca spatiul EXISTA, si atat spune verdictul.
 *     ⚠ `widget.intercom.io/widget/<id>` raspunde 200 la ORICE ID.
 *
 * ⚠ Gazdele sunt FIXE, iar identificatorul a trecut de verificarea de forma din `config.ts` inainte sa
 * ajunga aici (numai litere, cifre si `-`), deci cererea nu poate fi dusa in alta parte.
 *
 * ⚠ „Nu stiu” nu e „gresit”: cand furnizorul nu raspunde, salvarea merge inainte cu un avertisment. O pana
 * la ei nu are voie sa-l opreasca pe comerciant sa-si porneasca chatul.
 */
export type RezultatVerificare =
  | { stare: "buna" }
  | { stare: "gresita"; mesaj: string }
  | { stare: "nestiut"; mesaj: string };

const ASTEPTARE_MS = 8000;

const BAZE_INTERCOM = {
  us: "https://api-iam.intercom.io",
  eu: "https://api-iam.eu.intercom.io",
  au: "https://api-iam.au.intercom.io",
} as const;

export function bazaIntercom(regiune: keyof typeof BAZE_INTERCOM): string {
  return BAZE_INTERCOM[regiune] ?? BAZE_INTERCOM.us;
}

/** Adresa intrebata la fiecare furnizor. Exportata pentru probe: gazdele trebuie sa ramana cele de aici. */
export function cerereaDeVerificare(cont: ContPublic): { url: string; init: RequestInit } {
  const comun: RequestInit = { cache: "no-store", redirect: "follow", headers: { accept: "*/*" } };
  if (cont.furnizor === "tidio") return { url: `https://code.tidio.co/${cont.cheie}.js`, init: comun };
  if (cont.furnizor === "tawkto") return { url: `https://embed.tawk.to/${cont.proprietate}/${cont.widget}`, init: comun };
  if (cont.furnizor === "zendesk") return { url: `https://ekr.zdassets.com/compose/${cont.cheie}`, init: comun };
  return {
    url: `${bazaIntercom(cont.regiune)}/messenger/web/ping`,
    init: {
      ...comun,
      method: "POST",
      headers: { accept: "application/json", "content-type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({ app_id: cont.app, v: "3", platform: "web", source: "apiBoot", user_data: "{}" }).toString(),
    },
  };
}

/** Verdictul, din codul raspunsului. Pura, ca sa se poata proba fara retea. */
export function verdictulVerificarii(cont: ContPublic, status: number): RezultatVerificare {
  if (status === 404) {
    if (cont.furnizor === "tidio") return { stare: "gresita", mesaj: "Tidio nu cunoaște această cheie publică. Verific-o în Settings, Developer, Project data." };
    if (cont.furnizor === "tawkto") return { stare: "gresita", mesaj: "tawk.to nu cunoaște această pereche Property ID și Widget ID. Copiază din nou „Direct Chat Link”." };
    if (cont.furnizor === "zendesk") return { stare: "gresita", mesaj: "Zendesk nu cunoaște această cheie de widget. Copiaz-o din nou din Installation." };
    return { stare: "gresita", mesaj: "Intercom nu găsește acest Workspace ID în regiunea aleasă. Verifică ID-ul și regiunea." };
  }
  if (status >= 200 && status < 300) return { stare: "buna" };
  /* Intercom raspunde 403 unei cereri de pe server chiar cand spatiul merge (vezi capul fisierului): spatiul
     exista, iar altceva de aici nu se poate afla. Un ID gresit a iesit deja pe 404, mai sus. */
  if (cont.furnizor === "intercom" && (status === 401 || status === 403)) return { stare: "buna" };
  return { stare: "nestiut", mesaj: `Furnizorul a răspuns neașteptat (${status}). Am salvat, dar nu am putut verifica cheia.` };
}

export async function verificaIdentificatorul(cont: ContPublic): Promise<RezultatVerificare> {
  const { url, init } = cerereaDeVerificare(cont);
  try {
    const r = await fetch(url, { ...init, signal: AbortSignal.timeout(ASTEPTARE_MS) });
    /* Corpul nu ne trebuie: se inchide, ca legatura sa nu ramana deschisa pe un script intreg. */
    await r.body?.cancel().catch(() => {});
    return verdictulVerificarii(cont, r.status);
  } catch {
    return { stare: "nestiut", mesaj: "Furnizorul nu a răspuns la timp. Am salvat, dar nu am putut verifica cheia." };
  }
}
