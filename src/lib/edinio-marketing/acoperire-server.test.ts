import { strict as assert } from "node:assert";
import { test } from "node:test";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";

/*
  ═══════════════════════════════════════════════════════════════════════════════
  CE PLEACA SI DE PE SERVER, SI CE NUMAI DIN BROWSER
  ═══════════════════════════════════════════════════════════════════════════════

  ⚠ DE CE EXISTA PROBA ASTA. Pe 02.09.2026 coada de conversii era gata, probata
  pana la serverele Meta si TikTok, si totusi INCOMPLETA: purtau `sign_up` cu
  email si `generate_lead`, dar nu si inscrierea prin Google, nici `trial_start`,
  nici `purchase`. Nimic n-o arata — fiecare bucata in parte era corecta, si
  numai socoteala intregului lipsea.

  Un eveniment care pleaca DOAR din browser se pierde la fiecare blocant de
  reclame. Pentru evenimentele de intentie (`begin_checkout`, `add_payment_info`)
  asta e primit: sunt semnale, nu conversii. Pentru o conversie implinita, nu.

  ⚠ LISTA DE MAI JOS E O DECLARATIE, NU O OGLINDA. Daca o cale de server dispare,
  proba cade. Daca se adauga una noua, proba cade si ea — si atunci se scrie aici,
  dinadins, ce s-a schimbat.
*/

/** Conversii implinite: trebuie sa plece si de pe server. */
const DE_PE_SERVER = ["generate_lead", "sign_up", "trial_start", "purchase"];

/*
  ⚠ LISTA GOLURILOR E GOALA, SI ASA A AJUNS SA FIE.

  Pana pe 02.09.2026 scria aici `purchase`, cu motivul: suma adevarata o stie doar
  webhook-ul Stripe, iar `event_id`-ul browserului era id-ul magazinului, pe care
  webhook-ul nu-l are — la ora lui magazinul inca nu exista.

  S-a legat mutand martorul: `success_url` poarta inapoi `{CHECKOUT_SESSION_ID}`,
  deci amandoua drumurile numesc aceeasi sesiune. Proba de mai jos a CAZUT cand
  s-a intamplat, exact cum a fost scrisa sa cada — ca nota sa fie mutata, nu
  stearsa in tacere.
*/
const NELEGAT_INCA: string[] = [];

function fisiereSursa(rad: string): string[] {
  const iesire: string[] = [];
  for (const n of readdirSync(rad)) {
    const p = join(rad, n);
    if (statSync(p).isDirectory()) iesire.push(...fisiereSursa(p));
    else if (/\.(ts|tsx)$/.test(n) && !n.endsWith(".test.ts")) iesire.push(p);
  }
  return iesire;
}

/**
 * Numele evenimentelor din fiecare `puneLaCoada(...)` AJUNS din sursa.
 *
 * ⚠ SE CERE O INSTRUCTIUNE DE SINE STATATOARE, nu doar sirul undeva in fisier.
 * Prima forma cauta `puneLaCoada(` oriunde, si a trecut verde peste mutantul
 * `if (false) await puneLaCoada(...)`: apelul era scris, ramura era moarta, si
 * socoteala acoperirii spunea ca totul e legat.
 *
 * Ramane o proba de sursa, cu marginile ei — nu poate dovedi ca ramura chiar se
 * executa, doar ca nimeni n-a pus o paza pe acelasi rand.
 */
function evenimentePuseLaCoada(): Set<string> {
  const gasite = new Set<string>();
  const RAND = String.fromCharCode(10);
  for (const f of fisiereSursa("src")) {
    const linii = readFileSync(f, "utf8").split(RAND);
    for (let i = 0; i < linii.length; i++) {
      if (linii[i].trim() !== "await puneLaCoada(") continue;
      const m = linii.slice(i, i + 6).join(RAND).match(/name: "([a-z_]+)"/);
      if (m) gasite.add(m[1]);
    }
  }
  return gasite;
}

test("⚠ fiecare conversie implinita pleaca SI de pe server", () => {
  const puse = evenimentePuseLaCoada();
  const lipsa = DE_PE_SERVER.filter((e) => !puse.has(e));
  assert.deepEqual(
    lipsa, [],
    `evenimente care pleaca doar din browser, deci pierdute la blocantele de reclame: ${lipsa.join(", ")}`,
  );
});

test("golul cunoscut e chiar gol — altfel lista de mai sus minte", () => {
  /*
    ⚠ CAND `purchase` SE LEAGA, PROBA ASTA CADE. E dinadins: cade ca sa fie mutat
    in lista de sus, nu ca sa fie sters de aici in tacere. O nota care spune „nu e
    legat inca" despre ceva legat e mai rea decat lipsa notei.
  */
  const puse = evenimentePuseLaCoada();
  for (const e of NELEGAT_INCA) {
    assert.ok(!puse.has(e), `"${e}" s-a legat — muta-l in DE_PE_SERVER si scoate-l din NELEGAT_INCA`);
  }
});

test("inscrierea prin Google are propria cale de server, nu doar cea cu email", () => {
  /*
    ⚠ MASURAT: 28 din 168 de conturi vin prin Google (01.09.2026). `register()`
    poarta doar `signup_origin: "email"`, deci fara calea din `auth/callback`
    inscrierile prin Google n-ar ajunge NICIODATA pe server — 17% din conversii
    lipsa, si nimic care s-o arate.
  */
  /*
    ⚠ SI AICI SE CERE O INSTRUCTIUNE DE SINE STATATOARE, din acelasi motiv. In
    plus, socoteala de mai sus NU poate prinde disparitia asta: `sign_up` ramane
    acoperit de calea cu email, deci lista ar arata complet in timp ce Google ar
    fi tacut. De aceea calea prin Google are proba ei.
  */
  const RAND = String.fromCharCode(10);
  const linii = readFileSync("src/app/auth/callback/route.ts", "utf8").split(RAND);
  const i = linii.findIndex((l) => l.trim() === "await puneLaCoada(");
  assert.ok(i > 0, "callback-ul OAuth nu mai pune inscrierea la coada, sau apelul e sub o paza");
  assert.match(
    linii.slice(i, i + 4).join(RAND), /name: "sign_up", signup_origin: origine/,
    "originea nu mai vine de la server — inscrierile prin Google s-ar numara ca email",
  );
});

test("⚠ trialul se raporteaza doar cand serverul chiar l-a acordat", () => {
  /*
    ⚠ CE APARA. Pagina hotaraste dupa `sessionStorage`; serverul, dupa ce scrie in
    baza. Scoasa paza, `trial_start` ar pleca si pentru cine avea deja plan platit
    — deci un abonament incasat ar aparea la Meta si TikTok ca trial gratuit, si
    optimizarea ar invata pe conversia ieftina in locul celei scumpe.
  */
  const cod = readFileSync("src/lib/actions/business.actions.ts", "utf8");
  const iGarda = cod.indexOf("if (!areDejaPlan && !profileError) {");
  assert.ok(iGarda > 0, "paza care leaga raportarea de acordarea reala a trialului a disparut");

  const iCoada = cod.indexOf("await puneLaCoada(", iGarda);
  assert.ok(iCoada > iGarda, "punerea la coada nu mai vine dupa paza");
  assert.ok(
    cod.slice(iGarda, iCoada).indexOf("}") < 0,
    "punerea la coada a iesit din ramura pazita — se raporteaza si cand trialul nu s-a acordat",
  );
});

/* ═══ Abonamentul: cele doua drumuri trebuie sa numeasca aceeasi sesiune ═══ */

test("⚠ `success_url` de onboarding poarta inapoi id-ul sesiunii Stripe", () => {
  /*
    ⚠ AICI STA TOT. Fara sablonul asta, browserul n-are cu ce numi plata, si ar
    cadea inapoi pe id-ul magazinului — pe care webhook-ul nu-l are. Atunci
    acelasi abonament ar pleca sub doua nume si s-ar numara de DOUA ori.
  */
  const cod = readFileSync("src/app/api/stripe/checkout/route.ts", "utf8");
  const iOnboarding = cod.indexOf('return_to === "onboarding" ?');
  assert.ok(iOnboarding > 0, "ramura de onboarding a disparut din checkout");
  assert.ok(
    cod.slice(iOnboarding, iOnboarding + 200).includes("{CHECKOUT_SESSION_ID}"),
    "success_url nu mai poarta id-ul sesiunii — abonamentul s-ar numara de doua ori",
  );
});

test("⚠ browserul foloseste id-ul sesiunii pentru abonament, nu pe cel al magazinului", () => {
  const cod = readFileSync("src/app/(onboarding)/onboarding/plan/page.tsx", "utf8");
  assert.match(cod, /const idSesiune = searchParams\.get\("sid"\)/,
    "pagina nu mai citeste id-ul sesiunii din adresa");

  const iPurchase = cod.indexOf('name: "purchase"');
  assert.ok(iPurchase > 0, "pagina nu mai trage purchase");
  assert.match(
    cod.slice(iPurchase, iPurchase + 260), /event_id: idSesiune \|\| idConversie/,
    "purchase nu mai poarta id-ul sesiunii",
  );

  /* ⚠ Trialul RAMANE pe id-ul magazinului: perechea lui de server e `createBusiness`. */
  const iTrial = cod.indexOf('name: "trial_start"');
  assert.ok(iTrial > 0 && cod.slice(iTrial, iTrial + 160).includes("event_id: idConversie"),
    "trialul nu mai poarta id-ul magazinului — s-ar despartii de perechea lui de server");
});

/**
 * Chemarea `puneLaCoada(...)` care duce `name: "purchase"`, INTREAGA.
 *
 * ⚠ AICI STATEA `cod.slice(i, i + 400)`. Pe 03.09.2026 a cazut fara ca purtarea
 * sa se fi schimbat: am adaugat un comentariu inauntrul chemarii, si `ctx: {}` a
 * iesit din fereastra. Adica proba masura lungimea comentariilor, nu codul.
 *
 * O fereastra de marime fixa peste sursa e o proba care imbatraneste singura. Se
 * taie chemarea dupa PARANTEZE, cat tine ea.
 */
function chemareaDeCoada(cod: string): string {
  const nume = cod.indexOf('name: "purchase"');
  assert.ok(nume > 0, "webhook-ul nu mai pune abonamentul la coada");
  const start = cod.lastIndexOf("puneLaCoada(", nume);
  assert.ok(start > 0, "nu mai gasesc chemarea care duce abonamentul la coada");

  let adanc = 0;
  for (let i = start; i < cod.length; i++) {
    if (cod[i] === "(") adanc++;
    else if (cod[i] === ")") { adanc--; if (adanc === 0) return cod.slice(start, i + 1); }
  }
  assert.fail("chemarea `puneLaCoada` nu se inchide");
}

test("⚠ webhook-ul numeste ACEEASI sesiune, si raporteaza banii incasati", () => {
  const cod = readFileSync("src/app/api/stripe/webhook/route.ts", "utf8");
  const bucata = chemareaDeCoada(cod);

  assert.match(bucata, /event_id: session\.id/,
    "webhook-ul foloseste alt id decat browserul — abonamentul s-ar numara de doua ori");
  assert.match(bucata, /value: session\.amount_total \/ 100/,
    "suma nu mai vine din incasare — un pret citit din cod e o presupunere raportata ca venit");
});

test("⚠ webhook-ul NU trimite ip-ul si browserul — ar fi ale lui Stripe", () => {
  /*
    ⚠ CE APARA. Un webhook vine de la serverele Stripe. Trimise ca ale omului,
    ip-ul l-ar aseza in tara lor, iar `user_agent` ar fi al unui robot — deci
    potrivirea la Meta si TikTok ar fi stricata, nu ajutata. Ce nu stim lipseste.
  */
  const bucata = chemareaDeCoada(readFileSync("src/app/api/stripe/webhook/route.ts", "utf8"));
  assert.match(bucata, /ctx: \{\}/, "webhook-ul a inceput sa trimita un context");
  for (const camp of ["x-forwarded-for", "user-agent", "userAgent"]) {
    assert.ok(!bucata.includes(camp), `webhook-ul trimite "${camp}" — ar fi al lui Stripe, nu al omului`);
  }
});
