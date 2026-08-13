import { strict as assert } from "node:assert";
import { test } from "node:test";
import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import {
  ASISTENTI,
  ASISTENTI_TEXT,
  ASISTENTI_TEANC,
  BARA,
  BUTON_PRODUS,
  INTREBARE,
  RECOMANDATE,
  SUBTEXT_CAMP,
  recomandate,
} from "./geo";

const AICI = dirname(fileURLToPath(import.meta.url));
const PUBLIC = join(AICI, "..", "..", "..", "public");

test("produsele din răspuns sunt chiar cele din secțiunea SEO", () => {
  /*
    ⚠ ASTA E PROBA CARE ȚINE PAGINA ÎNTREAGĂ.

    Clientul a cerut ca asistentul să recomande produsele puse mai devreme la
    SEO. Recomandările nu-și poartă numele și prețul: le iau din
    `REZULTATE_SHOPPING`. Dacă cineva schimbă acolo o poză sau șterge un produs,
    `recomandate()` aruncă și proba cade — în loc ca pagina să arate o casetă
    goală, sau, mai rău, aceeași cameră cu două prețuri diferite în două
    secțiuni.
  */
  const lista = recomandate();
  assert.equal(lista.length, RECOMANDATE.length);

  for (const { produs, insusiri } of lista) {
    assert.ok(produs.nume.length > 0);
    assert.match(produs.pret, /RON$/, `preț scris altfel: ${produs.pret}`);
    assert.equal(insusiri.length, 3, `${produs.nume}: nu are trei însușiri`);
  }
});

test("cele două recomandări răspund la cele două cazuri din sfat", () => {
  /*
    Sfatul spune: caută IP66 și vedere nocturnă, iar dacă n-ai priză în
    apropiere, ia una solară. Deci una dintre recomandări trebuie să fie chiar
    cea fără cablu — altfel răspunsul dă un sfat și arată altceva, iar asta se
    vede imediat la citit.
  */
  const toate = RECOMANDATE.flatMap((r) => r.insusiri.map((i) => i.toLowerCase()));
  assert.ok(
    toate.some((i) => i.includes("solar") || i.includes("cablare")),
    "niciun model fără cablare, deși sfatul vorbește despre unul",
  );
  assert.ok(toate.filter((i) => i.includes("ip66")).length >= 2, "IP66 e cerut la amândouă");

  const poze = new Set(RECOMANDATE.map((r) => r.imagine));
  assert.equal(poze.size, RECOMANDATE.length, "aceeași cameră recomandată de două ori");
});

test("întrebarea e chiar cea cerută de client", () => {
  assert.equal(INTREBARE, "Care este cea mai bună cameră de supraveghere pentru exterior?");
});

test("fiecare siglă are fișierul ei pe disc", () => {
  for (const asistent of ASISTENTI) {
    const cale = join(PUBLIC, asistent.src.replace(/^\//, ""));
    assert.ok(existsSync(cale), `lipsește ${asistent.src}`);
  }
});

test("raportul fiecărei sigle e chiar cel din fișierul ei", () => {
  /*
    ⚠ MĂSURAT DIN FIȘIER, NU SCRIS DE MÂNĂ.

    Raportul dă lățimea siglei la înălțime egală. Scris greșit, sigla iese
    turtită sau lungită — și nu se plânge nimic, fiindcă e doar un număr. Aceeași
    scăpare a costat deja o dată, la biblioteca de integrări, unde `logos.ts`
    ținea raportul DESENULUI în loc de al cutiei și o siglă ieșea la 60%.

    Aici raportul se citește chiar din `viewBox`, deci proba compară numărul cu
    sursa lui.
  */
  for (const asistent of ASISTENTI) {
    const svg = readFileSync(join(PUBLIC, asistent.src.replace(/^\//, "")), "utf8");
    const potrivire = svg.match(/viewBox="([^"]+)"/);
    assert.ok(potrivire, `${asistent.nume}: fișierul n-are viewBox`);

    const [, , latime, inaltime] = potrivire[1].trim().split(/[\s,]+/).map(Number);
    assert.ok(latime > 0 && inaltime > 0, `${asistent.nume}: viewBox ciudat`);

    const adevarat = latime / inaltime;
    assert.ok(
      Math.abs(asistent.raport - adevarat) < 0.005,
      `${asistent.nume}: raport scris ${asistent.raport.toFixed(3)}, în fișier ${adevarat.toFixed(3)}`,
    );
  }
});

test("siglele se văd când sunt puse ca imagine", () => {
  /*
    ⚠ O SIGLĂ POATE FI INVIZIBILĂ FĂRĂ SĂ DEA VREO EROARE.

    Puse cu `<img>`, fișierele astea se desenează singure, deci `currentColor` se
    rezolvă la negru și merge. Dar dacă rădăcina are `fill="none"` și calea NU-și
    spune culoarea, calea moștenește `none` — imaginea se încarcă, ocupă locul,
    și nu se vede nimic. Verificat: toate patru își spun culoarea, fie prin
    `currentColor`, fie printr-un cod, fie printr-un gradient.
  */
  for (const asistent of ASISTENTI) {
    const svg = readFileSync(join(PUBLIC, asistent.src.replace(/^\//, "")), "utf8");
    const umpluturi = [...svg.matchAll(/fill="([^"]+)"/g)].map((m) => m[1]);
    const areCuloare = umpluturi.some((f) => f !== "none");
    assert.ok(areCuloare, `${asistent.nume}: nicio umplutură în afară de „none" — nu s-ar vedea`);
  }
});

test("rândul de sub sigle nu promite indexare", () => {
  /*
    ⚠ PROBĂ DE ADEVĂR, nu de desen.

    Ce iau și ce nu iau asistenții e alegerea lor; nimeni nu poate promite că un
    magazin ajunge în răspunsurile lor. Ce se poate spune, și se poate verifica
    în `src/app/robots.ts`, e că nimic nu-i oprește să citească.

    Dacă cineva „întărește" cândva rândul la „indexate de toate AI-urile", proba
    îl oprește.
  */
  const jos = ASISTENTI_TEXT.toLowerCase();
  for (const cuvant of ["indexat", "indexate", "garant", "apari", "primul"]) {
    assert.equal(
      jos.includes(cuvant),
      false,
      `„${ASISTENTI_TEXT}" promite ceva ce nu ține de noi (${cuvant})`,
    );
  }
  assert.ok(jos.includes("pot fi citite"), "rândul nu mai spune ce se poate spune");
});

test("fereastra nu poartă numele niciunui asistent", () => {
  /*
    ⚠ PROBĂ DE HOTĂRÂRE, nu de desen — și de aceea merită scrisă.

    Clientul a cerut două lucruri care se bat cap în cap dacă le iei literal:
    desenul paginii ChatGPT, dar și trei sigle în locul semnului asistentului,
    adică „toți asistenții". Al doilea îl lămurește pe primul: se împrumută
    AȘEZAREA, nu numele.

    O fereastră care poartă numele lor, cu un răspuns pe care nu l-au dat,
    recomandând un magazin, pe pagina noastră de vânzare, ar fi altceva decât o
    ilustrație. Dacă cineva scrie cândva „ChatGPT" prin bară fiindcă „așa era în
    captură", proba îl oprește.
  */
  const tot = [
    BARA.titlu,
    BARA.intrebareNoua,
    BARA.cont,
    BARA.recenteTitlu,
    ...BARA.meniu.map((m) => m.eticheta),
    ...BARA.recente,
    SUBTEXT_CAMP,
  ]
    .join(" ")
    .toLowerCase();

  for (const nume of ASISTENTI) {
    assert.equal(
      tot.includes(nume.nume.toLowerCase()),
      false,
      `fereastra scrie „${nume.nume}" — se împrumută așezarea, nu numele`,
    );
  }
  assert.equal(tot.includes("openai"), false);
});

test("bara laterală are cu ce să pară o bară laterală", () => {
  assert.ok(BARA.recente.length >= 3, "prea puține discuții recente ca să pară o listă");
  assert.ok(BARA.meniu.length >= 2, "meniul e prea scurt");

  /* ⚠ Fiecare rând ÎȘI POARTĂ PICTOGRAMA. Prima formă avea în locul lor un
     pătrat gol cu chenar — un substituent uitat, care pe ecran arăta ca o listă
     de căsuțe de bifat. Proba nu lasă să se adauge un rând fără semn. */
  for (const element of BARA.meniu) {
    assert.ok(element.pictograma.length > 0, `${element.eticheta} n-are pictogramă`);
  }
  const semne = new Set(BARA.meniu.map((m) => m.pictograma));
  assert.equal(semne.size, BARA.meniu.length, "două rânduri cu același semn");

  const recente = new Set(BARA.recente);
  assert.equal(recente.size, BARA.recente.length, "două discuții recente cu același nume");

  /* Prima discuție recentă e chiar cea deschisă, deci trebuie să aibă legătură cu
     întrebarea — altfel bara arată o discuție și fereastra alta. */
  assert.ok(
    BARA.recente[0].toLowerCase().includes("cameră") ||
      BARA.recente[0].toLowerCase().includes("camera"),
    "discuția scoasă în față nu e cea din fereastră",
  );
});

test("butonul de pe produs spune ce face", () => {
  assert.ok(BUTON_PRODUS.length > 0);
  assert.ok(BUTON_PRODUS.length <= 16, "buton prea lung pentru rândul de produs");
});

test("teancul are trei sigle, rândul de jos are patru", () => {
  /*
    Amândouă sunt cerute de client (13.08), și nu e o nepotrivire: teancul din
    capul răspunsului îi ține pe cei trei numiți de el, iar rândul de sub
    fereastră îi arată pe toți, fiindcă acolo se spune cine poate CITI paginile,
    iar Perplexity le citește la fel.

    ⚠ Și teancul trebuie să fie un PREFIX al listei, nu o alegere răzleață:
    ordinea lui e ordinea desenării, prima deasupra.
  */
  assert.equal(ASISTENTI_TEANC.length, 3, "teancul nu mai are trei sigle");
  assert.ok(ASISTENTI.length >= 4, "rândul de jos a rămas fără sigle");

  for (const [i, asistent] of ASISTENTI_TEANC.entries()) {
    assert.equal(asistent.nume, ASISTENTI[i].nume, "teancul nu mai e începutul listei");
  }
  assert.equal(ASISTENTI_TEANC[0].nume, "ChatGPT", "în față stă cea mai cunoscută");
});

test("subtextul câmpului nu numește pe nimeni", () => {
  /* Cerut de client: ceva generic. Motivul e același cu al ferestrei fără nume —
     câmpul nu spune pe cine întrebi, fiindcă răspunsul îl poate da oricare. */
  const jos = SUBTEXT_CAMP.toLowerCase();
  for (const asistent of ASISTENTI) {
    assert.equal(jos.includes(asistent.nume.toLowerCase()), false);
  }
  assert.ok(SUBTEXT_CAMP.length <= 24, "subtext prea lung pentru câmpul de pe telefon");
});
