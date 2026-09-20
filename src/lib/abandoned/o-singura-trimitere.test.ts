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

    ⚠⚠ SE CAUTA IN CORPUL FUNCTIEI, NU IN TOT FISIERUL, si asta s-a invatat de
    doua ori intr-o zi. Intai o ancora s-a potrivit pe `idulMesajului(...)`,
    care are exact aceleasi argumente ca a confirmarii. Apoi
    `trimiteProbaAutomatizare` a adus in fisier un al doilea
    `trimiteSiLasaUrma(` si, fiind scrisa mai sus, `indexOf` il gasea pe al ei.
    De fiecare data proba a cazut fara sa fie nimic stricat.
  */
  const sursa = readFileSync(
    new URL("../actions/abandoned-cart.actions.ts", import.meta.url), "utf8",
  );

  /** Corpul unei functii exportate, pana la urmatoarea de acelasi fel. */
  function corpul(nume: string): string {
    const de = sursa.indexOf(`export async function ${nume}(`);
    assert.ok(de >= 0, `nu s-a gasit ${nume}`);
    const pana = sursa.indexOf("\nexport async function ", de + 1);
    return sursa.slice(de, pana === -1 ? undefined : pana);
  }

  for (const [nume, canal, trimite] of [
    ["sendAbandonedCartEmail", "email", "await sendAbandonedCartRecovery("],
    ["sendAbandonedCartSms", "sms", "await trimiteSiLasaUrma("],
  ] as const) {
    const corp = corpul(nume);
    const iRev = corp.indexOf(`canal: "${canal}", sursa: "manual"`);
    const iTrimite = corp.indexOf(trimite);
    const iConf = corp.indexOf("confirmaTrimiterea(");
    assert.ok(iRev > 0, `${nume}: nu ia dreptul deloc`);
    assert.ok(iTrimite > 0, `${nume}: nu s-a gasit trimiterea`);
    assert.ok(iConf > 0, `${nume}: nu confirma niciodata`);
    assert.ok(iRev < iTrimite, `${nume}: mesajul pleaca INAINTE sa se ia dreptul`);
    assert.ok(iTrimite < iConf, `${nume}: mesajul e confirmat inainte sa plece`);
  }

  /*
    ⚠ Si proba de automatizare NU are voie sa treaca prin jurnal: e un mesaj
    catre comerciant, iar unul intrat in cifre ar face ca „7 contactate" sa
    insemne „6 clienti si o data eu".
  */
  const proba = corpul("trimiteProbaAutomatizare");
  assert.doesNotMatch(
    proba, /revendicaTrimiterea|confirmaTrimiterea|recovery_sends/,
    "proba de automatizare lasa urma in jurnalul mesajelor",
  );
});
