import { strict as assert } from "node:assert";
import { test } from "node:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";

/*
  ═══════════════════════════════════════════════════════════════════════════════
  CINE MERITA STRIGAT DESPRE UN DOMENIU
  ═══════════════════════════════════════════════════════════════════════════════

  ⚠ REGULA PROPRIETARULUI, 02.09.2026: „Daca nu e la noi, nu are rost sa-mi mai
  trimiti nimic. Imi trimiti doar daca a schimbat nameserverele cu ale noastre si
  tot nu functioneaza."

  ═══ CE A DUS LA EA ═══

  `okai.ro` a scris acelasi rand de alerta de peste 150 de ori, din 10.08.2026.
  Verificat in DNS: nameserverele lui stau la `ird.ro`, deci domeniul nici nu
  arata catre noi. Iar magazinul de sub el are ZERO produse si ZERO comenzi.

  Suportul primea un email pe zi despre un magazin pe care nu-l foloseste nimeni.
  Iar alertele care nu inseamna nimic sunt cele care te invata sa nu te mai uiti
  la alerte — inclusiv in ziua in care cade un domeniu adevarat.

  ⚠ PROBA ASTA CITESTE SURSA, si o spun pe fata: cronul cheama Vercel, DNS peste
  HTTPS si baza, deci nu se poate rula aici. Ce se poate pazi e ca listele NU se
  amesteca la loc — iar amestecarea lor e chiar felul in care regula s-ar pierde.
*/

const COD = readFileSync(
  join(process.cwd(), "src/app/api/cron/domains-reconcile/route.ts"), "utf8",
).replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");

test("⚠ pe email pleaca DOAR domeniile delegate catre noi", () => {
  /*
    ⚠ SE CERE `=== true`, nu ceva mai slab. `delegat` are trei valori:
    `true` (le-a mutat), `false` (nu le-a mutat), `null` (sonda a cazut pentru
    domeniul ala). Un `!== false` ar lasa sa treaca si necunoscuta — adica exact
    starea despre care n-avem ce cere nimanui.
  */
  assert.ok(
    COD.includes("neverificate.filter((x) => x.delegat === true)"),
    "filtrul pe delegare a disparut, sau nu mai e strict — necunoscutele redevin alerte",
  );
});

test("⚠ NICIUN drum catre email nu mai foloseste lista nefiltrata", () => {
  /*
    ═══ ASTA E PROBA CARE CONTEAZA ═══

    Filtrul e usor de pus si usor de ocolit: e destul ca UN singur apel sa ramana
    pe lista veche si emailul se intoarce. Se cer toate trei drumurile:
    destinatarul, frana pe domenii, si corpul trimis catre suport.
  */
  for (const drum of [
    '...(deStrigat.length ? ["suport:neverificate"] : [])',
    "...deStrigat.map((n) => n.domain)",
    "sendBrokenDomainsToAdmin(stricate, deStrigat)",
  ]) {
    assert.ok(COD.includes(drum), `drumul catre email nu mai trece prin lista filtrata: ${drum}`);
  }

  /* Si martorul pe dos: nimic din trimitere nu se mai atinge de lista intreaga. */
  assert.ok(
    !COD.includes("sendBrokenDomainsToAdmin(stricate, neverificate)"),
    "corpul emailului s-a intors la lista nefiltrata",
  );
  assert.ok(
    !COD.includes("...neverificate.map((n) => n.domain)"),
    "frana pe domenii s-a intors la lista nefiltrata",
  );
});

test("⚠ ce nu se striga tot se VEDE, si asta nu e acelasi lucru", () => {
  /*
    Deosebirea dintre „nu te sun" si „nu-ti spun" e tot ce conteaza aici. Un
    filtru care ar face domeniile sa dispara cu totul ar fi mai rau decat
    zgomotul: peste o luna nimeni n-ar mai sti ca exista.
  */
  assert.ok(COD.includes('action: "domains-reconcile.netrimise"'), "domeniile tacute nu mai lasa nicio urma");
  assert.ok(COD.includes('severity: "info"'), "urma lor s-a intors la un nivel care suna");
});

test("⚠ o cadere GENERALA de citire ramane strigata", () => {
  /*
    Regula tace pentru un domeniu al carui verdict nu s-a putut afla. Dar daca
    pica CITIREA cu totul, nu mai stim nimic despre niciunul — si aia trebuie sa
    sune, altfel regula noua ar putea ascunde tocmai pana care o face necesara.
  */
  assert.ok(
    COD.includes('action: "domains-reconcile"') && COD.includes('severity: "critical"'),
    "s-a pierdut alarma pentru caderea generala a citirii",
  );
});
