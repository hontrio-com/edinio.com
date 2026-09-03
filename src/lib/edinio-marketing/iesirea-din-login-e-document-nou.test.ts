import { strict as assert } from "node:assert";
import { test } from "node:test";
import { readFileSync } from "node:fs";
import { faraComentarii } from "./fara-comentarii";
import { faraUrmarire } from "./fara-urmarire";

/*
  ═══════════════════════════════════════════════════════════════════════════════
  IESIREA DIN `/login` E INTOTDEAUNA UN DOCUMENT NOU
  ═══════════════════════════════════════════════════════════════════════════════

  ⚠ DEFECTUL, si e o afirmatie a mea care s-a dovedit falsa.

  `/login` incarca dinadins Meta, TikTok si Google Ads: acolo ajung oamenii din
  reclame, si tocmai pixelul aseaza `_fbc`. Iar `/login/mfa` si `/dashboard` sunt
  in `CAI_FARA_URMARIRE`, deci acolo n-au voie.

  Pana pe 03.09.2026, `login()` iesea prin `redirect(...)`. Am scris intr-o nota ca
  aceea e o navigare de document, deci acoperita de poarta de cale. Nu e:
  documentatia Next spune „In a Server Action, `redirect` performs a client-side
  navigation when JavaScript is available".

  ⚠ CE URMEAZA DIN ASTA. Un script INCARCAT nu se descarca atunci cand componenta
  lui se demonteaza. Deci dupa autentificare, `fbevents.js`, `events.js` si
  eticheta Google raman in acelasi document:

    - pe `/login/mfa`, ecranul unde se tasteaza codul;
    - pe `/dashboard`, de unde fusesera scosi CHIAR IN ZIUA ACEEA — si `fbevents.js`
      isi trage singur `PageView` la fiecare schimbare de istoric (masurat pe
      01.09.2026). Adica reparatia de dimineata se intorcea pe calea cea mai
      umblata: intrarea obisnuita in aplicatie.

  ⚠ CE SE PROBEAZA AICI. Nu ca navigarea e „hard" — asta nu se poate masura dintr-o
  proba de unitate. Ci ca `login()` nu mai redirecteaza singur si ca apelantul duce
  navigarea la capat cu un mijloc care schimba documentul.
*/

const ACTIUNI = "src/lib/actions/auth.actions.ts";
const PAGINA = "src/app/(auth)/login/page.tsx";

/**
 * Corpul functiei numite, taiat pe acolade — nu o fereastra de N caractere.
 *
 * ⚠ CORPUL INCEPE DUPA LISTA DE PARAMETRI, si randul asta a fost scris gresit
 * intai: `indexOf("{")` gaseste acolada din TIPUL parametrului
 * (`formData: { email: string; password: string }`), deci felia se inchidea acolo
 * si nu cuprindea nimic din functie. Proba cadea spunand ca lipseste ceva ce
 * exista. Se sare intai peste paranteza semnaturii.
 */
function corpul(cod: string, semnatura: string): string {
  const i = cod.indexOf(semnatura);
  assert.ok(i > 0, `nu mai gasesc \`${semnatura}\``);

  let paranteze = 0;
  let dupaSemnatura = i;
  for (let j = cod.indexOf("(", i); j < cod.length; j++) {
    if (cod[j] === "(") paranteze++;
    else if (cod[j] === ")") {
      paranteze--;
      if (paranteze === 0) { dupaSemnatura = j; break; }
    }
  }

  let adanc = 0;
  for (let j = cod.indexOf("{", dupaSemnatura); j < cod.length; j++) {
    if (cod[j] === "{") adanc++;
    else if (cod[j] === "}") {
      adanc--;
      if (adanc === 0) return cod.slice(i, j + 1);
    }
  }
  return cod.slice(i);
}

test("⚠ `login()` nu mai redirecteaza singur — ar fi o navigare de client", () => {
  const cod = faraComentarii(readFileSync(ACTIUNI, "utf8"));
  const login = corpul(cod, "export async function login(");

  assert.ok(
    !/\bredirect\(/.test(login),
    "`login()` redirecteaza iar din actiunea de server — e o navigare de CLIENT, deci scripturile de pe `/login` ajung pe ecranul de cod si in panou",
  );

  /*
    ⚠ SI CA TOATE CELE TREI IESIRI DUC O DESTINATIE. Doua ar fi fost usor de
    reparat si a treia usor de uitat — chiar tiparul „reparatia pe lista lasa ce
    n-a fost numit". `/dashboard` era cea care conta cel mai mult si NU fusese
    numita in constatare.
  */
  for (const unde of ["/login/mfa", "/onboarding/details", "/dashboard"]) {
    assert.ok(
      login.includes(`return { mergiLa: "${unde}" }`),
      `iesirea catre \`${unde}\` nu mai intoarce o destinatie`,
    );
  }
});

test("⚠ pagina de login deschide destinatia ca DOCUMENT NOU", () => {
  const cod = faraComentarii(readFileSync(PAGINA, "utf8"));

  assert.match(cod, /window\.location\.assign\(result\.mergiLa\)/,
    "pagina nu mai deschide destinatia cu o navigare de document — scripturile terte supravietuiesc autentificarii");

  /*
    ⚠ SI NU CU ROUTERUL. `router.push` si `router.replace` sunt navigari de client:
    ar readuce exact defectul, sub o forma care arata mai idiomatic.
  */
  assert.ok(!/router\.(push|replace)\(/.test(cod),
    "navigarea de dupa autentificare s-a intors la router — e o navigare de client");

  /*
    ⚠ SI CA NAVIGAREA VINE INAINTEA TRATARII ERORII. Invers, un raspuns care are si
    destinatie ar afisa intai o eroare inexistenta.
  */
  const iNav = cod.indexOf("window.location.assign");
  const iEroare = cod.indexOf("result?.error");
  assert.ok(iNav > 0 && iEroare > iNav, "tratarea erorii a ajuns inaintea navigarii");
});

test("⚠ si caile catre care se iese sunt CHIAR cele aparate de poarta", () => {
  /*
    ⚠ DE CE E ALTCEVA DECAT PROBELE DE MAI SUS. Alea cer forma codului. Asta leaga
    cele doua jumatati: destinatiile scrise in `login()` sunt exact cele pe care
    regula de cale le tine curate. Daca maine cineva scoate `/dashboard` din
    `CAI_FARA_URMARIRE`, sau schimba destinatia, legatura se rupe si se vede aici.
  */
  assert.equal(faraUrmarire("/login/mfa"), true, "ecranul de cod nu mai e aparat de poarta de cale");
  assert.equal(faraUrmarire("/dashboard"), true, "panoul nu mai e aparat de poarta de cale");

  /* ⚠ Iar `/login` insusi TREBUIE sa ramana masurat: acolo ajung oamenii din reclame. */
  assert.equal(faraUrmarire("/login"), false,
    "s-a stins pixelul pe `/login` — `sign_up` ar pierde id-ul clicului pe reclama");

  /* ⚠ Si inrolarea isi pastreaza pixelii, deci acolo navigarea de document nu repara ceva, doar nu strica. */
  assert.equal(faraUrmarire("/onboarding/details"), false, "inrolarea a fost stinsa din greseala");
});
