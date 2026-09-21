import { strict as assert } from "node:assert";
import { readFileSync } from "node:fs";
import { test } from "node:test";

import { readAutomationConfig } from "@/lib/abandoned-cart";

import { ceiGata, furnizorulAles, furnizoriSms } from "./furnizori-sms";

/*
  ═══════════════════════════════════════════════════════════════════════════════
  CE APARA PROBELE ASTEA
  ═══════════════════════════════════════════════════════════════════════════════

  ⚠ Pana pe 21.09.2026 codul scria `if (noticeReady) ... else ... smso`. Cu
  amandoi pornite, notice.ro castiga MEREU, si nimic nu spunea asta nicaieri:
  comerciantul care isi incarcase credit la SMSO vedea banii stand pe loc si
  factura crescand in alta parte.

  Nu era o hotarare. Era ordinea in care se nimerisera scrise cele doua ramuri.
*/

const SMSO_BUN = { enabled: true, api_key: "k", sender_id: "MAGAZIN" };
const NOTICE_BUN = { enabled: true, api_token: "t", abandoned: { enabled: true } };

test("cine e gata si cine nu, cu motivul", () => {
  const f = furnizoriSms(SMSO_BUN, NOTICE_BUN);
  assert.deepEqual(f.map((x) => x.gata), [true, true]);
  assert.equal(ceiGata(f).length, 2);

  const fara = furnizoriSms({ enabled: true, api_key: "", sender_id: "M" }, null);
  assert.equal(fara[0].gata, false);
  assert.match(fara[0].lipsa!, /cheia API/);
  assert.match(fara[1].lipsa!, /nu e pornit/);
});

test("⚠ notice.ro CU CANALUL DE COSURI OPRIT NU E GATA", () => {
  /*
    ⚠ Capcana: integrarea e pornita, tokenul e pus, dar canalul pentru cosuri
    abandonate e oprit. Socotit „gata", mesajul ar fi plecat catre un canal
    care il refuza - si comerciantul ar fi vazut doar „nu s-a trimis".
  */
  const f = furnizoriSms(null, { enabled: true, api_token: "t", abandoned: { enabled: false } });
  assert.equal(f[1].gata, false);
  assert.match(f[1].lipsa!, /coșuri abandonate/);
});

test("ordinea furnizorilor nu sare dintr-un loc in altul", () => {
  /* ⚠ Un selector in care optiunile isi schimba locul il face pe om sa apese gresit. */
  for (const [a, b] of [[SMSO_BUN, NOTICE_BUN], [null, NOTICE_BUN], [SMSO_BUN, null]] as const) {
    assert.deepEqual(furnizoriSms(a, b).map((x) => x.cheie), ["smso", "notice"]);
  }
});

test("fara niciun furnizor gata, se spune ce are de facut", () => {
  const r = furnizorulAles(furnizoriSms(null, null), null);
  assert.ok("eroare" in r);
  assert.match(r.eroare, /Integrări/);
});

test("cu unul singur gata, ala trimite si fara sa fie ales", () => {
  assert.deepEqual(furnizorulAles(furnizoriSms(SMSO_BUN, null), null), { furnizor: "smso" });
  assert.deepEqual(furnizorulAles(furnizoriSms(null, NOTICE_BUN), null), { furnizor: "notice" });
});

test("alegerea omului e respectata, nu ordinea din cod", () => {
  const f = furnizoriSms(SMSO_BUN, NOTICE_BUN);
  assert.deepEqual(furnizorulAles(f, "smso"), { furnizor: "smso" });
  assert.deepEqual(furnizorulAles(f, "notice"), { furnizor: "notice" });
});

test("⚠ O ALEGERE CARE NU MAI E GATA NU SE INLOCUIESTE TACIT", () => {
  /*
    ⚠ Omul a ales SMSO, iar intre timp i-au expirat cheile. Trimis pe celalalt
    „ca sa mearga", ar fi platit la alt furnizor decat crede, iar in telefonul
    clientului ar fi aparut alt nume de expeditor. Se intoarce motivul, si
    hotaraste el.
  */
  const f = furnizoriSms({ enabled: true, api_key: "", sender_id: "M" }, NOTICE_BUN);
  const r = furnizorulAles(f, "smso");
  assert.ok("eroare" in r, "a trecut tacit pe celalalt furnizor");
  assert.match(r.eroare, /SMSO/);
  assert.match(r.eroare, /cheia API/);
  assert.match(r.eroare, /nu a plecat/);
});

test("un furnizor inventat nu trece", () => {
  const r = furnizorulAles(furnizoriSms(SMSO_BUN, NOTICE_BUN), "altul" as never);
  assert.ok("eroare" in r);
});

test("⚠ TRIMITEREA NU MAI ALEGE SINGURA CU `if (noticeReady)`", () => {
  /*
    ⚠ Proba pazeste chiar defectul: doua ramuri scrise una dupa alta, in care
    prima castiga mereu. Regula sta acum intr-un singur loc, si amandoua caile
    (trimiterea de mana si cronul) o cheama.
  */
  for (const fisier of [
    "../actions/abandoned-cart.actions.ts",
    "../../app/api/cron/abandoned-recovery/route.ts",
  ]) {
    const sursa = readFileSync(new URL(fisier, import.meta.url), "utf8");
    assert.match(sursa, /furnizorulAles\(/, `${fisier} nu cheama regula comuna`);
    assert.doesNotMatch(
      sursa, /if \(noticeReady\) \{/,
      `${fisier}: a ramas alegerea tacuta, in care notice.ro castiga mereu`,
    );
  }
});

test("⚠ FURNIZORUL ALES SE CITESTE INAPOI, nu doar se scrie", () => {
  /*
    ⚠ Un camp salvat si NECITIT la incarcare dispare la prima resalvare: omul
    alege SMSO, salveaza, reincarca pagina si vede iar celalalt - fara nicio
    eroare. Salvarea si citirea trec prin ACEEASI functie, deci proba o
    verifica pe ea.
  */
  const dus = readAutomationConfig({
    enabled: true,
    steps: [
      { id: "a", delay_hours: 1, channel: "sms", furnizor: "smso" },
      { id: "b", delay_hours: 2, channel: "sms", furnizor: "notice" },
      { id: "c", delay_hours: 3, channel: "sms" },
      { id: "d", delay_hours: 4, channel: "sms", furnizor: "inventat" },
    ],
  });
  assert.equal(dus.steps[0].furnizor, "smso");
  assert.equal(dus.steps[1].furnizor, "notice");
  assert.equal(dus.steps[2].furnizor, undefined, "lipsa ramane lipsa, nu devine primul");
  assert.equal(dus.steps[3].furnizor, undefined, "un furnizor inventat nu se pastreaza");

  /* Si inca o data prin aceeasi poarta: ce iese trebuie sa reintre la fel. */
  const intors = readAutomationConfig(dus);
  assert.deepEqual(intors.steps.map((s) => s.furnizor), ["smso", "notice", undefined, undefined]);
});
