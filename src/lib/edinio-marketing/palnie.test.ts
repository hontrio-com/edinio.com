import { strict as assert } from "node:assert";
import { test } from "node:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { verificaFaraPii } from "./fara-pii";
import { idConversieCont } from "./cont-nou";
import { desfaJeton } from "./jeton-cont-nou";

/*
  ═══════════════════════════════════════════════════════════════════════════════
  CONTUL NOU SE NUMARA O DATA, LA CREARE — NU LA FIECARE SOSIRE
  ═══════════════════════════════════════════════════════════════════════════════

  ⚠ DE CE NU SE POATE MASURA IN PAGINA DE INREGISTRARE. Actiunea `register` se
  incheie cu `redirect("/onboarding/details")`. Un `redirect` ARUNCA — deci
  actiunea nu se intoarce niciodata la client pe calea de succes. Nu exista
  moment in browser in care sa se stie „contul tocmai s-a creat".

  ⚠ SI DE CE NU LA SOSIREA PE ONBOARDING. Acolo ajunge si cine revine peste o
  saptamana la un cont vechi. Conversia s-ar numara de fiecare data, iar numarul
  de conturi noi ar fi de cateva ori mai mare decat adevarul — crescand, deci
  nimeni nu l-ar pune la indoiala.

  Semnalul e un jeton scris de SERVER, citit o data si sters. E si `event_id`-ul
  conversiei: cand se adauga Meta CAPI, serverul trimite acelasi id, altfel un
  singur cont ar aparea ca doua conversii.
*/

const RAD = process.cwd();
const citeste = (c: string) => readFileSync(join(RAD, c), "utf8").replace(/\r\n/g, "\n");
const faraComentarii = (s: string) =>
  s.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\{\/\*[\s\S]*?\*\/\}/g, "").replace(/\/\/.*$/gm, "");

test("⚠ jetonul de cont nou se scrie INAINTE de redirect", () => {
  /*
    `redirect()` arunca. Un `cookies().set(...)` pus dupa el n-ar rula niciodata,
    iar conversia n-ar fi masurata deloc — fara ca ceva sa cada.
  */
  /*
    ⚠ SE CAUTA IN CORPUL LUI `register`, nu in tot fisierul. Prima forma a probei
    lua PRIMUL `redirect("/onboarding/details")` din fisier — dar el apare de doua
    ori, iar celalalt e mai sus, in alta functie. Proba cadea pe o comparatie
    intre doua locuri fara nicio legatura.
  */
  const auth = faraComentarii(citeste("src/lib/actions/auth.actions.ts"));
  const iFunctie = auth.indexOf("export async function register(");
  assert.ok(iFunctie > 0, "n-am gasit functia de inregistrare");
  const corp = auth.slice(iFunctie, auth.indexOf("export async function", iFunctie + 10));

  const iSet = corp.indexOf('cookieStore.set("edinio_signup"');
  const iRedirect = corp.indexOf('redirect("/onboarding/details")');
  assert.ok(iSet > 0, "jetonul de cont nou nu se mai scrie in `register`");
  assert.ok(iRedirect > 0, "n-am gasit redirectarea din `register`");
  assert.ok(iSet < iRedirect, "jetonul se scrie DUPA redirect — deci niciodata");
});

test("jetonul e scurt si nu poarta nimic despre om", () => {
  const auth = citeste("src/lib/actions/auth.actions.ts");
  /* ⚠ Chiar apelul, pana la paranteza lui. O felie de 300 de caractere prindea
     si codul de dupa, si proba cadea pe cuvinte care n-aveau nicio legatura. */
  const i = auth.indexOf('cookieStore.set("edinio_signup"');
  const bucata = auth.slice(i, auth.indexOf("});", i) + 3);
  /*
    ⚠ NU MAI E UN `randomUUID()`, si randul asta cerea unul. Din 01.09.2026
    jetonul poarta o AMPRENTA calculata din id-ul contului — ca serverul sa poata
    calcula acelasi id pentru CAPI, fara sa care nimeni nimic prin cookie-uri.
    Vezi `cont-nou.ts`.
  */
  assert.match(bucata, /idConversieCont\(idCont\)/, "jetonul nu mai poarta amprenta stabila a contului");
  assert.match(bucata, /maxAge: 300/, "jetonul traieste mai mult decat trebuie");
  assert.doesNotMatch(bucata, /formData\.|full_name/, "jetonul poarta date despre om");

  /*
    ⚠ SI SE PROBEAZA PRIN CHEMARE, nu doar prin citire: amprenta chiar nu lasa sa
    se vada id-ul din baza. O citire de sursa n-ar fi observat daca `idConversieCont`
    s-ar intoarce candva la a da id-ul neschimbat.
  */
  const idBaza = "9a1c2d3e-4444-4000-8000-000000000abc";
  assert.ok(!idConversieCont(idBaza).includes(idBaza), "amprenta lasa sa se vada id-ul din baza");
});

test("⚠ contul nou se masoara O SINGURA data, si jetonul se sterge", () => {
  const c = faraComentarii(citeste("src/components/edinio-marketing/UrmaPalnie.tsx"));
  assert.match(c, /if \(tras\.current\) return;/, "conversia se poate trage de mai multe ori");
  assert.match(c, /stergeJeton\(\);/, "jetonul nu se mai sterge — conversia s-ar repeta la fiecare pagina");
  /* Stergerea INAINTE de trimitere: daca trimiterea arunca, jetonul tot dispare. */
  const iSterge = c.indexOf("stergeJeton();");
  const iTrage = c.indexOf('name: "sign_up"');
  assert.ok(iSterge < iTrage, "jetonul se sterge dupa trimitere — o eroare acolo l-ar lasa sa se repete");
});

test("`event_id` vine de pe server, iar originea calatoreste cu el", () => {
  const c = faraComentarii(citeste("src/components/edinio-marketing/UrmaPalnie.tsx"));
  assert.match(c, /event_id: id/, "id-ul conversiei nu mai vine de pe server");
  assert.doesNotMatch(c, /crypto\.randomUUID/, "id-ul se naste in browser — deduplicarea cu serverul s-ar rupe");
  assert.doesNotMatch(c, /origine\s*\}\s*:\s*\{\s*origine/, "originea a redevenit un prop dat de layout");

  /*
    ═══ ⚠ DESFACEREA JETONULUI, PROBATA PRIN CHEMARE ═══

    Layoutul scria `origine="register"` pentru toata lumea. Corect cat timp
    singura cale era emailul; mincinos din clipa in care se numara si Google — si
    tocmai despartirea aia e ce am masurat (28 din 168 de conturi).
  */
  assert.deepEqual(desfaJeton("abc123.google"), { id: "abc123", origine: "google" });
  assert.deepEqual(desfaJeton("abc123.email"), { id: "abc123", origine: "email" });

  /* ⚠ Un furnizor pe care nu-l cunoastem nu-si strecoara textul in rapoarte. */
  assert.deepEqual(desfaJeton("abc123.linkedin_oidc"), { id: "abc123", origine: "altul" });

  /*
    ⚠ FORMA VECHE, fara punct: intre desfasurare si expirarea celor cinci minute
    exista browsere care inca poarta jetoane scrise de codul dinainte. Fara ramura
    asta, inscrierile din fereastra aceea s-ar pierde in tacere.
  */
  assert.deepEqual(desfaJeton("b3d4e5f6-1111-2222"), { id: "b3d4e5f6-1111-2222", origine: "altul" });
});

test("pasii de onboarding se masoara, si fiecare o data", () => {
  const c = faraComentarii(citeste("src/components/edinio-marketing/UrmaPalnie.tsx"));
  assert.match(c, /if \(vazut\.current === pas\) return;/, "un pas s-ar putea numara de mai multe ori");

  for (const [pas, idx] of [["details", 1], ["plan", 2]] as const) {
    const pagina = citeste(`src/app/(onboarding)/onboarding/${pas}/page.tsx`);
    /*
      ⚠ FARA REGEX CONSTRUIT DINTR-UN SABLON. Prima forma folosea
      `new RegExp(\`... index=\{${idx}\}\`)` — dar intr-un sablon `\{` devine `{`,
      deci regexul primea `{2}`, adica un CUANTIFICATOR, nu o acolada. Proba cadea
      pentru `plan` si trecea din intamplare pentru `details`.
      O potrivire de sir simplu n-are capcana asta.
    */
    assert.ok(
      pagina.includes(`<UrmaPasOnboarding pas="${pas}" index={${idx}} />`),
      `pasul ${pas} nu mai e masurat, sau si-a schimbat numarul`,
    );
  }
});

test("nimic din palnie nu poarta date personale", () => {
  assert.doesNotThrow(() => verificaFaraPii("sign_up", {
    signup_origin: "register",
    event_id: "b3d4e5f6-1111-2222-3333-444455556666",
  }));
  assert.doesNotThrow(() => verificaFaraPii("onboarding_step_view", {
    onboarding_step: "plan", onboarding_step_index: 2,
  }));
});
