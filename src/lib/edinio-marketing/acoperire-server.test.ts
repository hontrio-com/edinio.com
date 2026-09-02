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
const DE_PE_SERVER = ["generate_lead", "sign_up", "trial_start"];

/*
  ⚠ GOL CUNOSCUT, SCRIS CA ATARE. `purchase` pleaca deocamdata numai din browser.
  Suma adevarata o stie doar webhook-ul Stripe (cat s-a incasat), iar `event_id`-ul
  pe care-l foloseste browserul e id-ul magazinului — pe care webhook-ul nu-l are,
  fiindca la ora lui magazinul inca nu exista. Legarea cere o hotarare despre
  drumul platii, nu doar cod.

  Cand se leaga, se muta mai sus si se sterge de aici.
*/
const NELEGAT_INCA = ["purchase"];

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
