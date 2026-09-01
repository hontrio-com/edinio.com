import { strict as assert } from "node:assert";
import { test } from "node:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { emailOnboardingStuck } from "./email-automations";

/*
  ═══════════════════════════════════════════════════════════════════════════════
  GHIONTUL DE 24 DE ORE MERGEA LA UN PAS CARE NU EXISTA
  ═══════════════════════════════════════════════════════════════════════════════

  ⚠ RAMURA MOARTA. Conditia cerea `onboarding_step === "customize"`. Valoarea aia
  NU SE POATE SCRIE NICIODATA: `trackOnboardingStep` (auth.actions.ts:550) are
  semnatura `"details" | "plan"`, iar `stepOrder` de acolo n-o cunoaste. Masurat in
  baza pe 01.09.2026: zero randuri, vreodata.

  ⚠ SI LIPSEA PASUL CARE EXISTA. Nimeni nu acoperea `"plan"`. Masurat: 9 oameni
  opriti acolo fara magazin, toti mai vechi de 24 de ore, niciunul n-a primit
  ghiontul — fata de 19 din 19 la `details`.

  ⚠ CIFRA A FOST INTAI RAPORTATA GRESIT, si merita spus. Prima citire a mea a
  numarat 107 opriti la `plan`. Dar 98 dintre ei AU magazin, deci merg pe cealalta
  cale de cod (`if (!biz) continue`) si nu-i priveste ramura asta. Noua e cifra
  buna. Un `group by` fara jonctiunea cu `businesses` spune altceva decat codul.

  ⚠ SI BUTONUL DUCEA INAPOI. Emailul trimitea intotdeauna la `/onboarding/details`.
  Pentru cine se oprise la alegerea planului, ala e un pas pe care il terminase —
  adica exact felul de mesaj care il face pe om sa creada ca si-a pierdut munca.
*/

const RAD = process.cwd();
const citeste = (c: string) => readFileSync(join(RAD, c), "utf8").replace(/\r\n/g, "\n");

test("⚠ butonul duce la pasul unde s-a oprit omul, nu inapoi", () => {
  const laDetalii = emailOnboardingStuck("Ion", "details");
  const laPlan = emailOnboardingStuck("Ion", "plan");

  assert.match(laDetalii.html, /\/onboarding\/details/, "cel oprit la detalii nu mai e trimis acolo");
  assert.match(laPlan.html, /\/onboarding\/plan/, "cel oprit la plan e trimis tot la detalii — un pas pe care l-a terminat");
  assert.doesNotMatch(
    laPlan.html, /\/onboarding\/details/,
    "emailul pentru pasul `plan` mai contine si vechea legatura catre detalii",
  );
});

test("textul se potriveste cu pasul, nu doar legatura", () => {
  /*
    O legatura buna sub un text care spune altceva e tot un mesaj mincinos.
    „Esti la un singur pas" nu se potriveste cu cine tocmai a terminat detaliile.
  */
  const laPlan = emailOnboardingStuck("Ion", "plan");
  assert.match(laPlan.html, /alegi planul/, "textul nu spune ce mai are de facut");
  assert.match(laPlan.html, /Alege planul/, "eticheta butonului a ramas cea veche");
});

test("cheia emailului ramane aceeasi — altfel se retrimite tuturor", () => {
  /*
    ⚠ `alreadySent` se uita la cheie. Schimbata, cei 19 care AU primit deja
    ghiontul l-ar primi din nou. Reparatia n-are voie sa scoata un email de
    reamintire catre oameni care si-au vazut treaba acum o luna.
  */
  assert.equal(emailOnboardingStuck("Ion", "details").key, "onboarding_stuck_24h");
  assert.equal(emailOnboardingStuck("Ion", "plan").key, "onboarding_stuck_24h");
});

test("cronul acopera `plan` si nu mai cauta valoarea inexistenta", () => {
  const cron = citeste("src/app/api/cron/email-automations/route.ts")
    .replace(/\/\*[\s\S]*?\*\//g, "");

  assert.doesNotMatch(
    cron, /onboarding_step === "customize"/,
    "s-a intors conditia pe o valoare pe care `trackOnboardingStep` n-o poate scrie",
  );
  assert.match(cron, /onboarding_step === "plan"/, "pasul `plan` nu mai e acoperit");
  assert.match(cron, /onboarding_step === "details"/, "s-a pierdut pasul `details`");
  /* ⚠ Si ca pasul ajunge CHIAR in email, nu doar in conditie. */
  assert.match(cron, /emailOnboardingStuck\(name, pasOprit\)/, "emailul nu mai afla la ce pas s-a oprit omul");
});

test("martor: pasii cu putinta sunt intr-adevar doar doi", () => {
  /*
    Daca `trackOnboardingStep` primeste candva un al treilea pas, conditia de mai
    sus il rateaza in tacere — exact cum a ratat `plan` pana acum. Atunci proba
    asta cade si trimite pe cineva sa se uite.
  */
  const auth = citeste("src/lib/actions/auth.actions.ts");
  assert.match(
    auth, /trackOnboardingStep\(step: "details" \| "plan"\)/,
    "pasii de onboarding s-au schimbat — reciteste conditia din cronul de emailuri",
  );
});
