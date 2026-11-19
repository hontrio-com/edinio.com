import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

/*
  Insigna Netopia si creditul „Creat cu Edinio” din subsolul magazinului (19.11.2026, auditul temelor).

  Pana atunci amandoua se cereau DIN BROWSER, prin cate o actiune de server, la fiecare afisare a fiecarei pagini de
  magazin: doua cereri POST pe vizita (doua porniri de functie), care ocupau si coada actiunilor inaintea lui „Adauga in
  cos”. Masurat pe build: 2 actiuni la incarcarea oricarei pagini. Cea de la Netopia nu avea `catch`: taiata de o
  navigare, lasa o eroare neprinsa in Firefox si in Safari (gasita de proba de interactiuni pe trei motoare).

  Acum le hotaraste layoutul magazinului, pe server, din randul adus oricum, si le da prin `IdentitateMagazin`. Aici se
  apara cablajul: daca cineva scoate valorile din layout sau readuce cererea neconditionata din piese, fiecare vizita
  plateste iar doua actiuni, fara ca nimic sa arate altfel pe ecran.
*/

const cod = (cale: string) => readFileSync(cale, "utf8").replace(/\r\n/g, "\n");
const faraComentarii = (s: string) => s.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");

test("⚠⚠ layoutul magazinului hotaraste pe server insigna Netopia si creditul, FARA nicio cerere noua, si le da subsolului", () => {
  const s = faraComentarii(cod("src/app/(public)/[slug]/layout.tsx"));
  // Insigna: din randul de antet (`np_*`), curatata cu aceeasi functie ca actiunea de dinainte.
  assert.match(s, /setarileSubsolului\.np_activ \? sanitizeNetopiaBadge\(typeof setarileSubsolului\.np_insigna === "string" \? setarileSubsolului\.np_insigna : ""\) : ""/);
  // Rand venit fara campuri (selectul de rezerva) => `null`, adica piesa cere singura.
  assert.match(s, /setarileSubsolului && "np_activ" in setarileSubsolului\s*\?[\s\S]{0,220}?: null;/);
  // Creditul: aratat fara nicio citire; doar magazinele care au cerut ascunderea raman pe drumul vechi (`null`).
  assert.match(s, /const creditAscuns: boolean \| null = !business \|\| cereAscundereaCreditului \? null : false;/);
  assert.match(s, /<IdentitateMagazinProvider valoare=\{\{[^}]*insignaNetopia, creditAscuns \}\}>/);
  // ⚠ Fara asteptari noi in layout: prima varianta chema actiunile ca functii si astepta raspunsul (TTFB +33 ms, masurat).
  assert.doesNotMatch(s, /getNetopiaBadge|getEdinioBadgeHidden/, "layoutul asteapta iar o citire pentru subsol: timpul pana la primul octet creste");

  // Campurile vin in randul de antet, prin cale JSON: numai cele doua publice, niciodata coloana intreaga (poarta cheia API).
  const antet = cod("src/lib/storefront/antet-magazin.ts");
  assert.match(antet, /np_activ:netopia_config->enabled, np_insigna:netopia_config->>badge_html\)/);
  assert.doesNotMatch(faraComentarii(antet), /[( ,]netopia_config[,)]/, "antetul cere coloana `netopia_config` intreaga: cheia API ar ajunge in randul vitrinei");
});

test("⚠⚠ piesele din subsol folosesc valoarea de pe server; cererea din browser e doar rezerva, cu `catch`", () => {
  const netopia = faraComentarii(cod("src/components/ministore/NetopiaBadge.tsx"));
  assert.match(netopia, /const \{ insignaNetopia \} = useIdentitateMagazin\(\);/);
  // Fara cerere cand layoutul a raspuns (inclusiv cu „magazinul n-are insigna”, adica sirul gol).
  assert.match(netopia, /useEffect\(\(\) => \{\s*if \(insignaNetopia !== null\) return;/);
  assert.match(netopia, /getNetopiaBadge\(businessId\)\s*\.then\([\s\S]{0,80}?\)\s*\.catch\(/, "cererea de rezerva a insignei Netopia nu mai are `catch`");
  assert.match(netopia, /const html = insignaNetopia \?\? adusa;/);

  const credit = faraComentarii(cod("src/components/ministore/EdinioCredit.tsx"));
  assert.match(credit, /const \{ creditAscuns \} = useIdentitateMagazin\(\);/);
  assert.match(credit, /useEffect\(\(\) => \{\s*if \(creditAscuns !== null\) return;/);
  assert.match(credit, /\.catch\(\(\) => \{ if \(active\) setShow\(true\); \}\)/);
  assert.match(credit, /const show = creditAscuns !== null \? !creditAscuns : aflat;/);
});

test("in afara layoutului magazinului valorile lipsesc (`null`), deci piesele cer singure, ca inainte", () => {
  const s = faraComentarii(cod("src/components/storefront/IdentitateMagazin.tsx"));
  assert.match(s, /insignaNetopia: string \| null;/);
  assert.match(s, /creditAscuns: boolean \| null;/);
  assert.match(s, /const IMPLICIT: IdentitateMagazin = \{[^}]*insignaNetopia: null, creditAscuns: null \};/);
});
