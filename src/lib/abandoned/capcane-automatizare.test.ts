import { strict as assert } from "node:assert";
import { test } from "node:test";

import {
  ORE_PANA_EXPIRA, capcaneleAutomatizarii, opresteTrimiterea,
  type ConfigAutomatizare, type ImprejurimiAutomatizare,
} from "./capcane-automatizare";

/*
  ═══════════════════════════════════════════════════════════════════════════════
  CE APARA PROBELE ASTEA
  ═══════════════════════════════════════════════════════════════════════════════

  ⚠ TOATE GRESELILE DE MAI JOS SE SALVEAZA FARA NICIO EROARE. Formularul le
  primeste, serverul le scrie, ecranul spune „salvat" - si abia peste o
  saptamana comerciantul se intreaba de ce pleaca doua SMS-uri deodata, sau de
  ce nu pleaca niciunul. Niciuna nu se vede uitandu-te la formular.
*/

const IMP: ImprejurimiAutomatizare = { smsPornit: true, coduriActive: ["REVINO10"] };

const pas = (p: Partial<ConfigAutomatizare["steps"][number]> = {}) => ({
  id: p.id ?? "a", delay_hours: p.delay_hours ?? 24,
  channel: p.channel ?? ("email" as const),
  message: p.message, discount_code: p.discount_code,
});

const config = (c: Partial<ConfigAutomatizare> = {}): ConfigAutomatizare => ({
  enabled: c.enabled ?? true,
  steps: c.steps ?? [pas()],
  min_cart_value: c.min_cart_value ?? null,
  quiet_hours: c.quiet_hours ?? null,
});

const cheile = (c: ConfigAutomatizare, imp = IMP) =>
  capcaneleAutomatizarii(c, imp).map((x) => x.cheie);

test("o secventa cuminte nu se plange de nimic", () => {
  const c = config({ steps: [pas({ id: "a", delay_hours: 4 }), pas({ id: "b", delay_hours: 24 })] });
  assert.deepEqual(cheile(c), []);
});

test("pornita si goala: nu trimite nimic, si nimic n-ar fi spus asta", () => {
  assert.ok(cheile(config({ steps: [] })).includes("fara-pasi"));
  assert.ok(opresteTrimiterea(capcaneleAutomatizarii(config({ steps: [] }), IMP)));
});

test("scrisa dar oprita: munca nu pleaca nicaieri", () => {
  assert.ok(cheile(config({ enabled: false })).includes("oprita"));
});

test("⚠ ORDINEA PASILOR E CEA DIN LISTA, NU A ORELOR", () => {
  /*
    ⚠ Cronul ia `steps[automation_step]`, adica al n-lea din lista. Un pas de 6
    ore pus DUPA unul de 24 va fi trimis tot al doilea - deci al doilea mesaj
    ajunge mai tarziu decat scrie pe el, iar omul care a scris „6h" crede ca
    l-a pus mai devreme. Nimic nu da eroare.
  */
  const c = config({ steps: [pas({ id: "a", delay_hours: 24 }), pas({ id: "b", delay_hours: 6 })] });
  const capcane = capcaneleAutomatizarii(c, IMP);
  const ordine = capcane.find((x) => x.cheie === "ordine");
  assert.ok(ordine, "nu s-a prins pasul pus in dezordine");
  assert.equal(ordine!.pasId, "b", "avertismentul trebuie sa stea pe pasul vinovat");
  assert.equal(ordine!.treapta, "opreste");
});

test("⚠ ZERO ORE NU INSEAMNA „ACUM”", () => {
  /*
    ⚠ Cosul devine abandonat abia dupa 60 de minute de liniste, iar cronul se
    uita numai la cele abandonate. „0" inseamna deci „la prima verificare de
    dupa", nu „imediat" - si omul care scrie 0 crede altceva.
  */
  const capcane = capcaneleAutomatizarii(config({ steps: [pas({ delay_hours: 0 })] }), IMP);
  const z = capcane.find((x) => x.cheie === "zero-ore");
  assert.ok(z);
  assert.match(z!.text, /60 de minute/);
});

test("⚠ UN PAS DINCOLO DE FEREASTRA DE RECUPERARE NU PLEACA NICIODATA", () => {
  /*
    ⚠ `cosulMaiPoateFiRecuperat` refuza cosurile mai vechi de sase luni, si o
    face tacut. Un pas pus la 5.000 de ore s-ar salva frumos si n-ar trimite
    nimic, vreodata.
  */
  const c = config({ steps: [pas({ delay_hours: ORE_PANA_EXPIRA + 1 })] });
  const t = capcaneleAutomatizarii(c, IMP).find((x) => x.cheie === "prea-tarziu");
  assert.ok(t);
  assert.equal(t!.treapta, "opreste");

  /* Cu o ora mai devreme, trece. */
  assert.ok(!cheile(config({ steps: [pas({ delay_hours: ORE_PANA_EXPIRA - 1 })] })).includes("prea-tarziu"));
});

test("doi pasi la aceeasi ora: clientul primeste doua mesaje deodata", () => {
  const c = config({ steps: [pas({ id: "a", delay_hours: 24 }), pas({ id: "b", delay_hours: 24 })] });
  const x = capcaneleAutomatizarii(c, IMP).find((y) => y.cheie === "aceeasi-ora");
  assert.ok(x);
  assert.equal(x!.pasId, "b", "se semnaleaza al doilea, nu primul");
});

test("pas pe SMS fara niciun serviciu de SMS pornit", () => {
  const c = config({ steps: [pas({ channel: "sms" })] });
  assert.ok(!cheile(c).includes("sms-fara-canal"), "cu SMS pornit nu e nimic de spus");
  const fara = capcaneleAutomatizarii(c, { ...IMP, smsPornit: false });
  assert.ok(fara.some((x) => x.cheie === "sms-fara-canal" && x.treapta === "opreste"));
});

test("⚠ UN COD CARE NU MAI E ACTIV PROMITE O REDUCERE CARE NU SE APLICA", () => {
  const c = config({ steps: [pas({ discount_code: "EXPIRAT" })] });
  const x = capcaneleAutomatizarii(c, IMP).find((y) => y.cheie === "cod-inexistent");
  assert.ok(x);
  assert.match(x!.text, /EXPIRAT/);

  /* ⚠ Se compara fara sa conteze literele mari: „revino10" e acelasi cod. */
  assert.ok(!cheile(config({ steps: [pas({ discount_code: "revino10" })] })).includes("cod-inexistent"));
  assert.ok(!cheile(config({ steps: [pas({ discount_code: "  REVINO10 " })] })).includes("cod-inexistent"));
});

test("⚠ UN SMS LUNG SE PLATESTE LA FIECARE CLIENT", () => {
  const lung = "Salut {nume}! Ai uitat produse în coșul tău la {magazin}. Finalizează comanda în "
    + "următoarele ore și primești transport gratuit la orice comandă de peste două sute de lei.";
  const c = config({ steps: [pas({ channel: "sms", message: lung })] });
  const x = capcaneleAutomatizarii(c, IMP).find((y) => y.cheie === "sms-lung");
  assert.ok(x, "un mesaj de trei segmente nu e semnalat");
  assert.match(x!.text, /SMS-uri/);

  /* Un mesaj scurt nu se plange. */
  assert.ok(!cheile(config({ steps: [pas({ channel: "sms", message: "Ai uitat ceva in cos." })] })).includes("sms-lung"));
});

test("{nume} intr-un mesaj: clientii fara nume primesc textul fara el", () => {
  assert.ok(cheile(config({ steps: [pas({ message: "Salut {nume}!" })] })).includes("nume-gol"));
});

test("prea multe mesaje inseamna insistenta, nu recuperare", () => {
  const cinci = [1, 2, 3, 4, 5].map((n) => pas({ id: `p${n}`, delay_hours: n * 10 }));
  assert.ok(cheile(config({ steps: cinci })).includes("prea-multe"));
  assert.ok(!cheile(config({ steps: cinci.slice(0, 4) })).includes("prea-multe"));
});

test("⚠ ORE DE LINISTE CARE INCEP SI SE TERMINA LA FEL ACOPERA TOATA ZIUA", () => {
  /*
    ⚠ `start === end` arata ca „zero ore de liniste" si inseamna fereastra
    intreaga: nimic nu mai pleaca, niciodata, si nimic nu da eroare.
  */
  const c = config({ quiet_hours: { start: 22, end: 22 } });
  const x = capcaneleAutomatizarii(c, IMP).find((y) => y.cheie === "liniste-toata-ziua");
  assert.ok(x);
  assert.equal(x!.treapta, "opreste");
  assert.ok(!cheile(config({ quiet_hours: { start: 22, end: 8 } })).includes("liniste-toata-ziua"));
});

test("cele care OPRESC se deosebesc de cele care doar atrag atentia", () => {
  /*
    ⚠ „Eroare" langa o alegere legitima il invata pe om sa nu mai citeasca
    avertismentele. Doua trepte, si fiecare capcana pe treapta ei.
  */
  const doarAtentie = config({ steps: [pas({ message: "Salut {nume}!" })] });
  assert.equal(opresteTrimiterea(capcaneleAutomatizarii(doarAtentie, IMP)), false);

  const chiarOpreste = config({ steps: [pas({ channel: "sms" })] });
  assert.equal(
    opresteTrimiterea(capcaneleAutomatizarii(chiarOpreste, { ...IMP, smsPornit: false })), true,
  );
});

test("fiecare capcana are cheie, text si treapta, si textele nu se repeta", () => {
  /* O secventa cu de toate, ca sa treaca prin cat mai multe ramuri deodata. */
  const c = config({
    enabled: true,
    quiet_hours: { start: 9, end: 9 },
    min_cart_value: -5,
    steps: [
      pas({ id: "a", delay_hours: 0, channel: "sms", message: "Salut {nume}!" }),
      pas({ id: "b", delay_hours: 0, discount_code: "NUEXISTA" }),
    ],
  });
  const capcane = capcaneleAutomatizarii(c, { smsPornit: false, coduriActive: [] });
  assert.ok(capcane.length >= 6, `prea putine capcane prinse: ${capcane.length}`);
  for (const x of capcane) {
    assert.ok(x.cheie && x.text.length > 20, `capcana fara text: ${x.cheie}`);
    assert.ok(x.treapta === "opreste" || x.treapta === "atentie");
  }
  /*
    ⚠ ACELASI TEXT PE DOI PASI E IN REGULA - doi pasi la 0 ore ridica aceeasi
    problema, si fiecare avertisment sta pe pasul lui. Ce NU e in regula e
    acelasi avertisment de doua ori pe ACELASI pas: acolo omul l-ar citi ca pe
    doua probleme diferite si ar cauta a doua degeaba.
  */
  const perechi = capcane.map((x) => `${x.cheie}|${x.pasId ?? ""}`);
  assert.equal(new Set(perechi).size, perechi.length, "acelasi avertisment de doua ori pe acelasi pas");
});
