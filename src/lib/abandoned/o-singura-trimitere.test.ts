import { strict as assert } from "node:assert";
import { readFileSync } from "node:fs";
import { test } from "node:test";

import { citesteRaspunsul, mesajRevendicare } from "./o-singura-trimitere";

/*
  ═══════════════════════════════════════════════════════════════════════════════
  CE APARA PROBELE ASTEA
  ═══════════════════════════════════════════════════════════════════════════════

  Al doilea mesaj trimis aceluiasi om nu se ia inapoi, iar la SMS se si
  plateste. Pana pe 21.09.2026 trimiterea de mana n-avea nicio cheie: butonul
  era stins cat tinea cererea, si atat. O reincarcare, a doua fila, doi oameni
  din aceeasi echipa sau o cerere picata pe retea DUPA ce serverul trimisese
  deja - toate duceau la un al doilea mesaj.
*/

test("fara eroare, drumul e liber", () => {
  assert.deepEqual(citesteRaspunsul(null), { fel: "liber" });
  assert.deepEqual(citesteRaspunsul(undefined), { fel: "liber" });
  assert.equal(mesajRevendicare({ fel: "liber" }), null, "cand se poate trimite, nu se spune nimic");
});

test("codul de dublura al Postgresului opreste trimiterea", () => {
  assert.equal(citesteRaspunsul("23505").fel, "deja");
});

test("⚠ ORICE ALTA EROARE INSEAMNA „NU STIU”, SI NU SE TRIMITE", () => {
  /*
    ⚠ Capcana pe care o pazeste proba: o baza cazuta tratata ca „liber" ar
    deschide exact usa pe care tabela asta o inchide - si ar deschide-o TOCMAI
    in minutul in care nimic nu mai poate verifica dublurile.
  */
  for (const cod of ["23503", "42P01", "57014", "08006", "PGRST301", ""]) {
    const r = citesteRaspunsul(cod || "XX000");
    assert.notEqual(r.fel, "liber", `codul ${cod} nu are voie sa treaca drept liber`);
  }
  assert.equal(citesteRaspunsul("42P01").fel, "eroare");
  assert.match(mesajRevendicare({ fel: "eroare" })!, /nu s-a trimis nimic/i);
});

test("⚠ „S-A INCERCAT” NU SE SPUNE CA „A PLECAT”", () => {
  /*
    Randul se scrie INAINTE de trimitere, deci existenta lui nu dovedeste ca
    mesajul a ajuns undeva. Doua stari, doua mesaje: altfel comerciantul ar
    crede ca s-a trimis ceva ce poate n-a plecat niciodata.
  */
  const plecat = mesajRevendicare({ fel: "deja", confirmat: true })!;
  const nesigur = mesajRevendicare({ fel: "deja", confirmat: false })!;

  assert.notEqual(plecat, nesigur, "cele doua stari nu au voie sa spuna acelasi lucru");
  assert.match(plecat, /a plecat deja/i);
  assert.match(nesigur, /nu stim sigur/i);
  assert.doesNotMatch(nesigur, /a plecat deja/i);

  /* Amandoua spun si CUM se poate trimite totusi inca unul. */
  for (const m of [plecat, nesigur]) assert.match(m, /deschide-o din nou/i);
});

test("⚠ CHEIA SE FACE LA DESCHIDEREA FERESTREI, nu la fiecare apasare", () => {
  /*
    ⚠ Daca cheia s-ar face in `send()`, fiecare apasare ar avea alta cheie si
    tabela n-ar opri nimic: ar fi un jurnal, nu o poarta. Si invers, o cheie
    legata de cos ar insemna un singur email pe cos, vreodata.

    Proba masoara ecranul, nu descrierea lui: `openRecover` face cheia,
    `send()` doar o trimite mai departe.
  */
  const sursa = readFileSync(
    new URL("../../components/dashboard/AbandonedCartsClient.tsx", import.meta.url), "utf8",
  );
  const deschide = sursa.slice(sursa.indexOf("function openRecover"), sursa.indexOf("function send("));
  assert.match(deschide, /setCheieCerere\(crypto\.randomUUID\(\)\)/, "cheia nu se face la deschidere");

  const trimite = sursa.slice(sursa.indexOf("function send("));
  assert.doesNotMatch(trimite, /randomUUID/, "cheia se reface la fiecare apasare: nu mai opreste nimic");
  assert.equal(
    (trimite.match(/cheieCerere\)/g) ?? []).length, 2,
    "cheia trebuie dusa la AMANDOUA canalele",
  );
});

test("⚠ DREPTUL SE IA INAINTE DE TRIMITERE, pe amandoua canalele", () => {
  /*
    ⚠ Scris dupa trimitere, doua cereri paralele ar trece amandoua de
    verificare inainte ca vreuna sa apuce sa lase urma. Proba masoara ORDINEA
    in fisier: revendicarea vine inaintea plecarii mesajului, confirmarea dupa.
  */
  const sursa = readFileSync(
    new URL("../actions/abandoned-cart.actions.ts", import.meta.url), "utf8",
  );
  /*
    ⚠ ANCORELE SE PRIND DE CHEMARI, NU DE ARGUMENTE. Prima scriere cauta
    `canal: "email", cheie: cheieCerere`, care parea al confirmarii - pana cand
    B1 a adaugat `idulMesajului(...)` cu exact aceleasi argumente INAINTE de
    trimitere. Proba a cazut fara sa fie nimic stricat: masura alt rand.
  */
  const iRevEmail = sursa.indexOf('canal: "email", sursa: "manual"');
  const iTrimiteEmail = sursa.indexOf("await sendAbandonedCartRecovery(cart.email");
  const iConfEmail = sursa.indexOf('confirmaTrimiterea(createAdminClient(), { cartId, canal: "email"');
  assert.ok(iRevEmail > 0 && iTrimiteEmail > 0 && iConfEmail > 0, "nu s-au gasit toate cele trei");
  assert.ok(iRevEmail < iTrimiteEmail, "emailul pleaca INAINTE sa se ia dreptul");
  assert.ok(iTrimiteEmail < iConfEmail, "emailul e confirmat inainte sa plece");

  const iRevSms = sursa.indexOf('canal: "sms", sursa: "manual"');
  const iTrimiteSms = sursa.indexOf("await trimiteSiLasaUrma(");
  const iConfSms = sursa.indexOf('confirmaTrimiterea(admin, { cartId, canal: "sms"');
  assert.ok(iRevSms > 0 && iTrimiteSms > 0 && iConfSms > 0, "SMS-ul nu trece prin poarta");
  assert.ok(iRevSms < iTrimiteSms, "SMS-ul pleaca INAINTE sa se ia dreptul");
  assert.ok(iTrimiteSms < iConfSms, "SMS-ul e confirmat inainte sa plece");
});
