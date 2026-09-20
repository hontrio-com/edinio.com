import { strict as assert } from "node:assert";
import { readFileSync } from "node:fs";
import { test } from "node:test";

import { CRONOLOGIE, PORNIRI, scrieIntarzierea } from "./porniri-automatizare";

/*
  ═══════════════════════════════════════════════════════════════════════════════
  CE APARA PROBELE ASTEA
  ═══════════════════════════════════════════════════════════════════════════════

  Cronologia e singurul loc unde comerciantul vede CE PATESTE UN CLIENT, nu ce
  scrie in formular. Daca ea minte, minte exact acolo unde omul se duce ca sa
  se lamureasca.
*/

const pas = (id: string, ore: number, canal: "email" | "sms" = "email") =>
  ({ id, delay_hours: ore, channel: canal });

test("intarzierile se scriu omeneste, nu in ore peste tot", () => {
  assert.equal(scrieIntarzierea(0), "imediat ce e văzut ca abandonat");
  assert.equal(scrieIntarzierea(1), "după 1 oră");
  assert.equal(scrieIntarzierea(6), "după 6 ore");
  assert.equal(scrieIntarzierea(24), "după 1 zi");
  assert.equal(scrieIntarzierea(48), "după 2 zile");
  assert.equal(scrieIntarzierea(30), "după 1 zi și 6 ore");
});

test("⚠ CRONOLOGIA SPUNE DISTANTA FATA DE MESAJUL DINAINTE, nu doar de la abandon", () => {
  /*
    ⚠ Campurile spun „24" si „48". Omul vrea sa stie ca al doilea mesaj vine la
    O ZI dupa primul, nu la doua zile dupa abandon - si tocmai diferenta asta
    n-o poate citi din formular.
  */
  const r = CRONOLOGIE([pas("a", 24), pas("b", 48, "sms")]);
  assert.equal(r.length, 3, "prima treapta e abandonul insusi");
  assert.match(r[0].titlu, /neterminat/i);
  assert.match(r[1].detaliu, /Primul mesaj/);
  assert.match(r[2].detaliu, /1 zi după mesajul anterior/);
});

test("⚠ UN PAS PUS IN DEZORDINE SE SPUNE PE FATA IN CRONOLOGIE", () => {
  /*
    ⚠ Ordinea trimiterii e cea din LISTA, nu a orelor. Un pas de 6 ore pus dupa
    unul de 24 pleaca tot al doilea. Cronologia n-are voie sa deseneze o
    poveste care nu se va intampla.
  */
  const r = CRONOLOGIE([pas("a", 24), pas("b", 6)]);
  assert.match(r[2].detaliu, /ordinea e cea din list/i);
  assert.match(r[2].detaliu, /al 2-lea/);
});

test("cele trei porniri sunt trei lucruri diferite, si niciuna nu e goala", () => {
  assert.equal(PORNIRI.length, 3);
  const chei = PORNIRI.map((p) => p.cheie);
  assert.deepEqual(chei, ["simpla", "recomandata", "personalizata"]);
  for (const p of PORNIRI) {
    assert.ok(p.pasi.length >= 1, `${p.cheie} nu pune niciun pas`);
    assert.ok(p.explicatie.length > 40, `${p.cheie} nu spune cui i se potriveste`);
    /* ⚠ Fiecare isi spune si marimea, ca omul sa aleaga fara sa deschida. */
    assert.ok(p.rezumat.length > 0);
  }
  assert.equal(new Set(PORNIRI.map((p) => p.rezumat)).size, 3, "doua porniri par la fel");
});

test("⚠ NICIO PORNIRE NU APRINDE SINGURA AUTOMATIZAREA", () => {
  /*
    ⚠ Alegerea unei secvente e o alegere de TEXT. Hotararea de a incepe sa
    trimiti mesaje catre clienti adevarati se ia cu comutatorul de sus, dupa ce
    omul a citit ce pleaca - iar asta e lucrul care nu se ia inapoi.
  */
  const sursa = readFileSync(
    new URL("../../components/dashboard/AbandonedAutomationsTab.tsx", import.meta.url), "utf8",
  );
  const porneste = sursa.slice(sursa.indexOf("function porneste"), sursa.indexOf("const capcane ="));
  assert.ok(porneste.length > 0, "nu s-a gasit functia de pornire");
  assert.doesNotMatch(porneste, /setEnabled\(true\)/, "pornirea aprinde singura trimiterea");
});

test("secventa recomandata nu cade in propriile capcane", () => {
  /*
    ⚠ Ar fi fost de ras: butonul nostru „Recomandată" sa puna o secventa pe
    care tot noi o semnalam ca gresita.
  */
  const rec = PORNIRI.find((p) => p.cheie === "recomandata")!;
  const ore = rec.pasi.map((p) => p.delay_hours);
  assert.deepEqual([...ore].sort((a, b) => a - b), ore, "pasii recomandati nu sunt in ordine");
  assert.equal(new Set(ore).size, ore.length, "doi pasi recomandati la aceeasi ora");
  assert.ok(ore.every((o) => o > 0), "un pas recomandat la 0 ore");
  assert.ok(rec.pasi.length <= 4, "prea multi pasi recomandati");
});
