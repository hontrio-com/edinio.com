import test from "node:test";
import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import {
  PLAFON_LATIME, SIGLA_IMPLICITA, SIGLA_LATIME_MAX, SIGLA_MAX, SIGLA_MAX_TELEFON, SIGLA_MIN,
  inaltimeSigla, randAntet, stilRandAntet, stilSigla, stilSiglaAntet,
} from "./logo-box";

/*
 * Sigla din antet se stramta pe telefon (19.11.2026).
 *
 * Gasit inaintea unui push, pe magazinele REALE randate local: la un magazin cu antetul „hipermarket” si o sigla lata
 * (1600x289 la inaltimea 56, adica 310 px), iconita cosului statea la 385..429 intr-un ecran de 390, deci in afara lui,
 * iar pagina se derula lateral cu 47 px. Aceeasi masuratoare in productie, pe codul de atunci: 47 px. Vina: ancora
 * siglei avea `shrink-0`, deci plafonul `100%` din `stilSigla` nu mai plafona nimic.
 *
 * Auditul temelor nu l-a vazut fiindca magazinele demo au sigle scurte. De-aia regula se tine AICI, pe sursa fiecarui
 * antet, nu pe o captura: o sigla lata e a comerciantului, nu a noastra.
 *
 * Proiectul n-are jsdom, deci antetele se citesc ca text, ca in restul probelor de vitrina.
 */

const DOSAR = "src/components/storefront/sections/chrome";
const cod = (cale: string) => readFileSync(cale, "utf8").replace(/\r\n/g, "\n");

/** Clasele care opresc stramtarea pe ORICE latime. Cu prefix de prag (`lg:shrink-0`) sunt in regula: pe telefon nu se aplica. */
const oprescStramtarea = (clase: string) => clase.split(/\s+/).filter((c) => c === "shrink-0" || c === "flex-shrink-0" || c === "flex-none");

/** Ce are de indreptat eticheta `<img>` a siglei dintr-un antet. Lista goala = in regula. */
const necazurileImaginii = (eticheta: string): string[] => {
  const necazuri: string[] = [];
  const clase = eticheta.match(/className="([^"]*)"/)?.[1];
  if (clase === undefined) return ["imaginea siglei nu mai are `className` scris ca sir"];
  const lista = clase.split(/\s+/);
  const opresc = oprescStramtarea(clase);
  if (opresc.length > 0) necazuri.push(`imaginea siglei are ${opresc.join(", ")}; ramane la plafonul ei si iese din ancora`);

  // Variabilele celor doua inaltimi vin din `stilSiglaAntet`; regula care alege intre ele e in foaia de stil.
  if (!/style=\{stilSiglaAntet\(logoSize\)\}/.test(eticheta)) necazuri.push("stilul siglei nu e `stilSiglaAntet(logoSize)`: fara variabilele lui, sigla nu are inaltime");
  /*
   * ⚠ Stilul incorporat bate foaia de stil. O inaltime sau un plafon scris in `style` ar face regula din foaie sa nu
   * existe, deci sigla ar avea aceeasi marime pe telefon si pe calculator: exact forma de dinainte de 24.11.2026.
   */
  if (/style=\{\{/.test(eticheta) || /\b(?:height|maxWidth|maxHeight)\s*:/.test(eticheta)) necazuri.push("imaginea siglei are marimi scrise in stilul incorporat: ele bat regula din foaia de stil");

  const reguli = lista.filter((c) => c === "st-sigla" || c === "st-sigla-clasic");
  if (reguli.length !== 1) necazuri.push(`imaginea siglei trebuie sa poarte exact una dintre \`st-sigla\` si \`st-sigla-clasic\`; am gasit ${reguli.length}`);
  // Antetul simplu isi tine plafonul in pixeli, fara `100%`: imaginea trebuie sa se poata stramta ca element flex.
  if (reguli[0] === "st-sigla-clasic" && !lista.includes("min-w-0")) necazuri.push("sigla cu plafon in pixeli (`st-sigla-clasic`) cere `min-w-0` pe imagine, altfel nu coboara sub plafon");
  // Latimea urmeaza proportiile fisierului; fara `w-auto` ar ramane cea scrisa in fisier.
  if (!lista.includes("w-auto")) necazuri.push("imaginea siglei nu mai are `w-auto`");
  if (!lista.includes("object-contain")) necazuri.push("imaginea siglei nu mai are `object-contain`: stramtata, s-ar turti");
  return necazuri;
};

test("stilSigla (subsoluri) pune amandoua plafoanele in aceeasi declaratie", () => {
  assert.deepEqual(stilSigla(40), { height: 40, maxWidth: "min(200px, 100%)" });
  assert.deepEqual(stilSigla(56), { height: 56, maxWidth: "min(280px, 100%)" });
});

test("in fiecare antet, ancora siglei si imaginea ei se pot stramta pe telefon", () => {
  const antete = readdirSync(DOSAR).filter((f) => /^Header[A-Z]\w*\.tsx$/.test(f));
  // Martorul: lista nu e goala si nu s-a micsorat pe tacute (noua antete pe 19.11.2026).
  assert.ok(antete.length >= 9, `astept cel putin 9 antete in ${DOSAR}, am gasit ${antete.length}`);

  let imaginiVerificate = 0;
  for (const fisier of antete) {
    const s = cod(`${DOSAR}/${fisier}`);
    const imagini = [...s.matchAll(/<img src=\{cdnImage\(business\.logo_url, \d+\)\}[\s\S]*?\/>/g)];
    assert.ok(imagini.length >= 1, `${fisier}: nu mai gasesc imaginea siglei (\`<img src={cdnImage(business.logo_url, …)}\`)`);

    for (const img of imagini) {
      // Ancora: ultimul `<a href={acasa}` dinaintea imaginii, inca deschis.
      const inainte = s.slice(0, img.index);
      const inceput = inainte.lastIndexOf("<a href={acasa}");
      assert.ok(inceput >= 0, `${fisier}: sigla nu mai sta intr-o ancora catre prima pagina`);
      const ancora = inainte.slice(inceput);
      assert.doesNotMatch(ancora, /<\/a>/, `${fisier}: ancora dinaintea siglei s-a inchis inainte de imagine`);

      // Listele de clase ale ancorei (pot fi doua, cand antetul are si varianta cu cautare).
      const liste = [...ancora.matchAll(/"([^"]*\bitems-center\b[^"]*)"/g)].map((m) => m[1]);
      assert.ok(liste.length >= 1, `${fisier}: nu mai gasesc clasele ancorei siglei`);
      for (const clase of liste) {
        assert.match(clase, /(?:^|\s)min-w-0(?:\s|$)/, `${fisier}: ancora siglei nu are \`min-w-0\`, deci nu se poate stramta sub latimea siglei`);
        assert.deepEqual(oprescStramtarea(clase), [], `${fisier}: ancora siglei are ${oprescStramtarea(clase).join(", ")} fara prag; pe telefon o sigla lata impinge cosul din ecran`);
      }

      // Imaginea: nu are voie sa refuze stramtarea, iar marimea ei vine din regula comuna (`necazurileImaginii`).
      assert.deepEqual(necazurileImaginii(img[0]), [], `${fisier}: ${necazurileImaginii(img[0]).join("; ")}`);
      // Plafonul in pixeli e numai al antetului simplu; celelalte se stramta cu `100%` din `.st-sigla`.
      assert.equal(/\bst-sigla-clasic\b/.test(img[0]), fisier === "HeaderClassic.tsx", `${fisier}: \`st-sigla-clasic\` e doar pentru antetul simplu`);
      imaginiVerificate++;
    }
  }
  assert.ok(imaginiVerificate >= antete.length, "fiecare antet trebuie sa aiba macar o sigla verificata");
});

/*
 * Antetul cu sigla la mijloc: coloanele din margini au un minim pe telefon (20.11.2026).
 *
 * Gasit pe un magazin real care si-a pus sigla scrisa pe un rand (7:1): cu `grid-cols-[1fr_auto_1fr]` si `min-w-0` pe
 * grupul din stanga, coloanele din margini se strangeau la zero, iar sigla statea PESTE butonul de meniu si peste lupa.
 * Masurat la 390 px: sigla 32..336, meniul 10..54, lupa 46..90. Nimic nu iesea din ecran si pagina nu se derula lateral,
 * deci proba de depasire din 19.11 n-avea ce vedea: o suprapunere nu e o depasire.
 *
 * Regula de mai sus (ancora si imaginea se pot stramta) e necesara, dar nu ajunge intr-o grila: acolo sigla se stramta
 * doar daca vecinii ei NU se pot strange sub continutul lor.
 */
const minimeleMarginilor = (clase: string): string[] | null => {
  // Clasa de grila FARA prag de ecran (`lg:grid-cols-…` se aplica doar pe ecrane late).
  const faraPrag = clase.split(/\s+/).filter((c) => c.startsWith("grid-cols-"));
  if (faraPrag.length !== 1) return null;
  const m = /^grid-cols-\[minmax\(([\d.]+rem),1fr\)_auto_minmax\(([\d.]+rem),1fr\)\]$/.exec(faraPrag[0]);
  return m ? [m[1], m[2]] : null;
};

test("in antetul cu sigla la mijloc, coloanele din margini nu se pot strange sub butoanele lor pe telefon", () => {
  const s = cod(`${DOSAR}/HeaderCentered.tsx`);
  const randuri = [...s.matchAll(/className="([^"]*\bgrid\b[^"]*\bgrid-cols-[^"]*)"/g)].map((m) => m[1]);
  // Martorul: randul cu sigla e singura grila a antetului.
  assert.equal(randuri.length, 1, `astept o singura grila in HeaderCentered, am gasit ${randuri.length}`);

  const minime = minimeleMarginilor(randuri[0]);
  assert.ok(minime, `randul cu sigla nu mai are, fara prag de ecran, forma \`grid-cols-[minmax(Xrem,1fr)_auto_minmax(Xrem,1fr)]\`: ${randuri[0]}`);
  // Egale, altfel sigla nu mai cade pe mijlocul ecranului.
  assert.equal(minime[0], minime[1], "cele doua margini au minime diferite: sigla iese de pe mijloc");
  /*
   * ⚠ CAT TREBUIE SI NU MAI MULT. Grupul din stanga (meniul si lupa) ajunge, masurat, la 74 px de la inceputul coloanei
   * (lupa se termina la 90, coloana incepe la 16). Minimul plus golul grilei trebuie sa-l acopere, cu cativa pixeli
   * liberi pana la sigla. Dar un minim mai mare decat e nevoie micsoreaza si siglele care aveau loc: prima forma, `5rem`,
   * ducea sigla de 200 px a unui magazin fara nicio suprapunere la 166 (vazut la proba pe magazinele reale, 20.11.2026).
   */
  const GRUP_STANGA = 74;
  const gol = Number(/(?:^|\s)gap-(\d+)(?:\s|$)/.exec(randuri[0])?.[1]) * 4;
  assert.ok(gol > 0, `golul grilei nu s-a citit din clase: ${randuri[0]}`);
  const liber = parseFloat(minime[0]) * 16 + gol - GRUP_STANGA;
  assert.ok(liber >= 4, `minimul marginilor (${minime[0]}) lasa ${liber} px intre lupa si sigla: se ating sau se suprapun`);
  assert.ok(liber <= 8, `minimul marginilor (${minime[0]}) lasa ${liber} px intre lupa si sigla: e mai mare decat trebuie si micsoreaza siglele care aveau loc`);
  // Pe ecranele late ramane grila de dinainte: acolo contactul din stanga se taie cu puncte, nu impinge sigla.
  assert.match(randuri[0], /(?:^|\s)lg:grid-cols-\[1fr_auto_1fr\](?:\s|$)/, "de la `lg` in sus astept grila `1fr auto 1fr`");
});

test("regula marginilor chiar prinde: grila veche, minime diferite si minimul prea mic sunt vazute", () => {
  assert.equal(minimeleMarginilor("h-16 lg:h-24 grid grid-cols-[1fr_auto_1fr] items-center gap-4"), null);
  assert.deepEqual(minimeleMarginilor("grid grid-cols-[minmax(5rem,1fr)_auto_minmax(3rem,1fr)] lg:grid-cols-[1fr_auto_1fr]"), ["5rem", "3rem"]);
  assert.deepEqual(minimeleMarginilor("grid grid-cols-[minmax(5rem,1fr)_auto_minmax(5rem,1fr)] lg:grid-cols-[1fr_auto_1fr]"), ["5rem", "5rem"]);
  // Doua clase fara prag s-ar bate intre ele: nu se stie care castiga.
  assert.equal(minimeleMarginilor("grid grid-cols-[1fr_auto_1fr] grid-cols-[minmax(5rem,1fr)_auto_minmax(5rem,1fr)]"), null);
});

test("regula chiar prinde: `shrink-0` fara prag e vazut, `lg:shrink-0` nu", () => {
  assert.deepEqual(oprescStramtarea("flex items-center min-w-0 shrink-0 hover:opacity-85"), ["shrink-0"]);
  assert.deepEqual(oprescStramtarea("w-auto object-contain flex-shrink-0"), ["flex-shrink-0"]);
  assert.deepEqual(oprescStramtarea("flex items-center min-w-0 lg:shrink-0 hover:opacity-85"), []);
});

/*
 * ═══ Sigla din antet poate fi mai mare pe calculator (24.11.2026) ═══
 *
 * Gasit pe un magazin real: sigla lui, aproape patrata (5:3), avea la capatul cursorului (56 px) doar 93 px latime, iar
 * proprietara intreba de ce se vede mica desi fisierul avea 4164 px. Cursorul merge acum pana la 96 px, dar numai pe
 * ecranele late; pe telefon sigla ramane la cel mult 56, cat incape in randul antetului, iar pe calculator randul se
 * inalta odata cu ea. Vezi `logo-box.ts`.
 *
 * Trei lucruri pot strica asta in tacere, si fiecare are proba lui mai jos:
 *  1. regula de marime (functiile pure) schimba ceva la magazinele care sunt deja sub capatul vechi;
 *  2. un antet nu mai poarta clasele sau variabilele (sigla ramane fara inaltime, ori randul nu mai creste si sigla
 *     iese din el);
 *  3. regulile din foaia de stil citesc variabila gresita (sigla de 96 px ajunge pe telefon), ori randul creste si pe telefon.
 */

/** Sursa fara comentarii: fisierele astea isi povestesc defectele vechi cu chiar sirurile cautate. */
const faraComentarii = (s: string) => s.replace(/\/\*[\s\S]*?\*\//g, "");

test("sigla din antet: pana la capatul vechi al cursorului nimic nu se schimba, pe nicio valoare", () => {
  // Capatul de pe telefon E capatul vechi al cursorului: de aici vine „nimic nu se schimba”.
  assert.equal(SIGLA_MAX_TELEFON, 56);
  assert.equal(SIGLA_MIN, 24);
  assert.ok(SIGLA_MIN < SIGLA_IMPLICITA && SIGLA_IMPLICITA <= SIGLA_MAX_TELEFON && SIGLA_MAX_TELEFON < SIGLA_MAX);

  // De la 20, nu de la 24: temele pornesc si sub capatul de jos al cursorului, iar o valoare mica nu se „indreapta”.
  for (let h = 20; h <= SIGLA_MAX_TELEFON; h++) {
    assert.deepEqual(stilSiglaAntet(h), { "--sigla": `${h}px`, "--sigla-tel": `${h}px` }, `la ${h} px, telefonul si calculatorul trebuie sa primeasca aceeasi inaltime`);
    assert.deepEqual(stilRandAntet(h), {}, `la ${h} px randul antetului nu are voie sa primeasca nicio variabila: ramane la inaltimea din clase`);
  }
});

test("sigla din antet: peste capatul vechi creste doar pe calculator, iar randul o incape cu aer", () => {
  let randAnterior = randAntet(SIGLA_MAX_TELEFON);
  // La capatul vechi, formula da chiar randul de 64 px al telefonului: de acolo porneste, fara salt.
  assert.equal(randAnterior, 64);

  // Cea mai lata sigla de pana acum: una lata, la capatul vechi al cursorului.
  assert.equal(SIGLA_LATIME_MAX, 280);
  assert.equal(stilSigla(SIGLA_MAX_TELEFON).maxWidth, `min(${SIGLA_LATIME_MAX}px, 100%)`);

  for (let h = SIGLA_MAX_TELEFON + 1; h <= SIGLA_MAX; h++) {
    const sigla = stilSiglaAntet(h) as Record<string, string>;
    assert.deepEqual(Object.keys(sigla).sort(), ["--sigla", "--sigla-lat", "--sigla-stramta", "--sigla-tel"]);
    assert.equal(sigla["--sigla"], `${h}px`, `la ${h} px, pe calculator sigla are inaltimea ceruta`);
    assert.equal(sigla["--sigla-tel"], `${SIGLA_MAX_TELEFON}px`, `la ${h} px, pe telefon sigla ramane la capatul vechi`);
    // Creste in inaltime, nu se lateste: plafonul ramane cel de la capatul vechi, in pixeli (fara procent).
    assert.equal(sigla["--sigla-lat"], `${SIGLA_LATIME_MAX}px`, `la ${h} px, sigla nu are voie sa fie mai lata decat putea fi pana acum`);
    // Plafonul in pixeli nu mai urmeaza singur ancora: imaginea trebuie lasata sa se stramteze.
    assert.equal(sigla["--sigla-stramta"], "0px");

    const rand = stilRandAntet(h) as Record<string, string>;
    assert.deepEqual(Object.keys(rand), ["--sigla-rand"]);
    assert.match(rand["--sigla-rand"], /^\d+px$/, "inaltimea randului trebuie sa fie un numar intreg de pixeli");
    const inaltimeRand = Number.parseInt(rand["--sigla-rand"], 10);
    assert.equal(inaltimeRand, randAntet(h));
    assert.ok(inaltimeRand - h >= 8, `la ${h} px randul are ${inaltimeRand}: sub 4 px de aer sus si jos, sigla atinge marginile antetului`);
    assert.ok(inaltimeRand >= randAnterior, `randul scade de la ${randAnterior} la ${inaltimeRand} cand sigla creste la ${h}`);
    assert.ok(inaltimeRand - randAnterior <= 2, `randul sare cu ${inaltimeRand - randAnterior} px intre ${h - 1} si ${h}: cursorul ar smuci antetul`);
    randAnterior = inaltimeRand;
  }
  // La capatul nou: 12 px de aer sus si jos.
  assert.equal(randAntet(SIGLA_MAX) - SIGLA_MAX, 24);
});

test("o valoare stricata sau peste capat nu strica antetul", () => {
  for (const stricata of [Number.NaN, 0, -12, Number.POSITIVE_INFINITY, "64" as unknown as number, undefined as unknown as number, null as unknown as number]) {
    assert.equal(inaltimeSigla(stricata), SIGLA_IMPLICITA, `${String(stricata)} trebuie sa cada pe inaltimea implicita`);
  }
  assert.equal(inaltimeSigla(500), SIGLA_MAX);
  assert.deepEqual(stilSiglaAntet(500), stilSiglaAntet(SIGLA_MAX));
  assert.deepEqual(stilRandAntet(500), stilRandAntet(SIGLA_MAX));
  // Sub capatul de jos nu se impune nimic.
  assert.equal(inaltimeSigla(20), 20);
});

/** Etichetele de deschidere care poarta clasa data intr-un `className` scris ca sir, cu locul lor in sursa. */
const eticheteCuClasa = (s: string, clasa: string): { eticheta: string; clase: string[]; loc: number }[] => {
  const gasite: { eticheta: string; clase: string[]; loc: number }[] = [];
  for (const m of s.matchAll(/className="([^"]*)"/g)) {
    const clase = m[1].split(/\s+/);
    if (!clase.includes(clasa)) continue;
    const inceput = s.lastIndexOf("<", m.index);
    const sfarsit = s.indexOf(">", m.index + m[0].length - 1);
    gasite.push({ eticheta: s.slice(inceput, sfarsit + 1), clase, loc: inceput });
  }
  return gasite;
};

/** Inaltimea fixa, fara prag de ecran, a unui rand (`h-14` = 56 px, `h-16` = 64 px), sau `null`. */
const inaltimeaPeTelefon = (clase: string[]): number | null => {
  const fixe = clase.map((c) => /^h-(\d+)$/.exec(c)).filter((m): m is RegExpExecArray => m !== null);
  return fixe.length === 1 ? Number(fixe[0][1]) * 4 : null;
};

test("in fiecare antet, randul siglei se inalta cu ea pe calculator si o incape pe telefon", () => {
  const antete = readdirSync(DOSAR).filter((f) => /^Header[A-Z]\w*\.tsx$/.test(f));
  assert.ok(antete.length >= 9, `astept cel putin 9 antete in ${DOSAR}, am gasit ${antete.length}`);

  for (const fisier of antete) {
    const s = faraComentarii(cod(`${DOSAR}/${fisier}`));

    const randuri = eticheteCuClasa(s, "st-rand-sigla");
    assert.equal(randuri.length, 1, `${fisier}: astept exact un rand cu \`st-rand-sigla\`, am gasit ${randuri.length}`);
    const rand = randuri[0];

    // Pe telefon randul are o inaltime fixa, iar capatul siglei de pe telefon trebuie sa incapa in ea.
    const peTelefon = inaltimeaPeTelefon(rand.clase);
    assert.ok(peTelefon !== null, `${fisier}: randul siglei nu mai are o singura inaltime fara prag de ecran (\`h-14\` / \`h-16\`): ${rand.clase.join(" ")}`);
    assert.ok(peTelefon >= SIGLA_MAX_TELEFON, `${fisier}: randul de pe telefon are ${peTelefon} px, iar sigla poate avea ${SIGLA_MAX_TELEFON}: iese din antet`);

    // Sigla sta in randul acela: randul se deschide inaintea ei.
    const sigla = s.search(/<img src=\{cdnImage\(business\.logo_url, \d+\)\}/);
    assert.ok(sigla > rand.loc, `${fisier}: randul cu \`st-rand-sigla\` nu e cel in care sta sigla`);

    // Variabila randului: o singura data in antet, pe rand sau (la „pana colorata”) pe invelisul care tine si pana.
    const variabile = [...s.matchAll(/style=\{stilRandAntet\(logoSize\)\}/g)];
    assert.equal(variabile.length, 1, `${fisier}: astept o singura punere a variabilei randului (\`style={stilRandAntet(logoSize)}\`), am gasit ${variabile.length}`);
    if (fisier === "HeaderWedge.tsx") {
      const invelis = eticheteCuClasa(s, "overflow-hidden").filter((e) => e.clase.includes("relative") && e.loc < rand.loc);
      assert.equal(invelis.length, 1, `${fisier}: nu mai gasesc invelisul benzii (\`relative overflow-hidden\`) dinaintea randului`);
      assert.match(invelis[0].eticheta, /style=\{stilRandAntet\(logoSize\)\}/, `${fisier}: variabila randului trebuie sa stea pe invelisul benzii, ca sa o citeasca si pana`);
      /*
       * Pana isi tine taietura la 45 de grade: varful ei sta la inaltimea randului de pe calculator. Cand randul creste
       * cu sigla, varful se muta cu aceeasi variabila. Numarul din taietura trebuie sa fie chiar inaltimea randului.
       */
      const inaltimeLg = rand.clase.map((c) => /^lg:h-\[(\d+)px\]$/.exec(c)).find((m) => m !== null)?.[1];
      assert.ok(inaltimeLg, `${fisier}: randul nu mai are inaltimea de calculator scrisa ca \`lg:h-[…px]\``);
      const pana = eticheteCuClasa(s, `lg:[clip-path:polygon(max(${inaltimeLg}px,var(--sigla-rand,0px))_0,100%_0,100%_100%,0_100%)]`);
      assert.equal(pana.length, 1, `${fisier}: taietura penei de pe calculator nu mai urmeaza inaltimea randului (max(${inaltimeLg}px, variabila randului))`);
    } else {
      assert.match(rand.eticheta, /style=\{stilRandAntet\(logoSize\)\}/, `${fisier}: variabila randului trebuie sa stea chiar pe rand`);
    }
  }
});

test("regula imaginii chiar prinde: forma veche, marimile in stilul incorporat si clasa lipsa sunt vazute", () => {
  const buna = '<img src={cdnImage(business.logo_url, 480)} alt={nume} style={stilSiglaAntet(logoSize)} className="w-auto object-contain st-sigla" />';
  assert.deepEqual(necazurileImaginii(buna), []);
  assert.deepEqual(necazurileImaginii(buna.replace("st-sigla", "min-w-0 st-sigla-clasic")), []);

  // Forma de pana pe 24.11.2026: inaltimea in stilul incorporat, aceeasi pe orice ecran.
  const veche = necazurileImaginii('<img src={cdnImage(business.logo_url, 480)} alt={nume} style={stilSigla(logoSize)} className="w-auto object-contain" />');
  assert.equal(veche.length, 2, veche.join("; "));
  const incorporat = necazurileImaginii('<img src={cdnImage(business.logo_url, 320)} alt={nume} style={{ height: logoSize, maxWidth: logoSize * 4.2 }} className="w-auto object-contain min-w-0 st-sigla-clasic" />');
  assert.ok(incorporat.some((n) => n.includes("stilul incorporat")), incorporat.join("; "));
  // Plafonul in pixeli fara `min-w-0`, amandoua regulile deodata, si imaginea care refuza stramtarea.
  assert.equal(necazurileImaginii(buna.replace("st-sigla", "st-sigla-clasic")).length, 1);
  assert.equal(necazurileImaginii(buna.replace("st-sigla", "st-sigla st-sigla-clasic min-w-0")).length, 1);
  assert.equal(necazurileImaginii(buna.replace("w-auto", "w-auto shrink-0")).length, 1);
  assert.equal(necazurileImaginii(buna.replace(" object-contain", "")).length, 1);
});

/*
 * Regulile din foaia de stil. Proiectul n-are jsdom si nici un motor de CSS in probe, deci foaia se citeste ca text; dar
 * nu se cere forma literala a declaratiilor, ci CE variabila citeste fiecare regula si in ce context de ecran sta.
 */
type Regula = { selector: string; corp: string; media: string | null };

/** Regulile unei foi, cu `@media` in care stau (un singur nivel; `@layer` se deschide, restul regulilor cu `@` se sar). */
const reguliCss = (css: string): Regula[] => {
  const iesire: Regula[] = [];
  const umbla = (text: string, media: string | null) => {
    let i = 0;
    while (i < text.length) {
      const deschide = text.indexOf("{", i);
      if (deschide < 0) break;
      const brut = text.slice(i, deschide);
      const antet = brut.slice(Math.max(brut.lastIndexOf(";"), brut.lastIndexOf("}")) + 1).trim().replace(/\s+/g, " ");
      let adancime = 1;
      let j = deschide + 1;
      for (; j < text.length && adancime > 0; j++) {
        if (text[j] === "{") adancime++;
        else if (text[j] === "}") adancime--;
      }
      const corp = text.slice(deschide + 1, j - 1);
      if (antet.startsWith("@media")) umbla(corp, antet);
      else if (antet.startsWith("@layer")) umbla(corp, media);
      else if (!antet.startsWith("@")) iesire.push({ selector: antet, corp: corp.trim().replace(/\s+/g, " "), media });
      i = j;
    }
  };
  umbla(css, null);
  return iesire;
};

test("cititorul de reguli chiar citeste: contextul de ecran, straturile si regulile cu `@` sarite", () => {
  const css = `@import "x"; .a { color: red; }
    @layer base { .b { color: blue; } }
    @media (min-width: 64rem) { .a { color: green; } .c { margin: 0; } }
    @keyframes k { from { opacity: 0; } to { opacity: 1; } }
    .d { height: 1px; }`;
  assert.deepEqual(reguliCss(css), [
    { selector: ".a", corp: "color: red;", media: null },
    { selector: ".b", corp: "color: blue;", media: null },
    { selector: ".a", corp: "color: green;", media: "@media (min-width: 64rem)" },
    { selector: ".c", corp: "margin: 0;", media: "@media (min-width: 64rem)" },
    { selector: ".d", corp: "height: 1px;", media: null },
  ]);
});

test("foaia comuna: telefonul si calculatorul citesc inaltimi diferite, iar randul creste doar pe calculator", () => {
  const css = faraComentarii(cod("src/app/stil-comun.css"));
  const ale = reguliCss(css).filter((r) => /(^|[\s,])\.st-(?:sigla|sigla-clasic|rand-sigla)(?![\w-])/.test(r.selector));
  // ⚠ Pragul lui `lg`: la el trec antetele de la asezarea de telefon la cea de calculator (`lg:h-…`, `lg:hidden`).
  const LG = "@media (min-width: 64rem)";
  const una = (selector: string, media: string | null): string => {
    const gasite = ale.filter((r) => r.selector === selector && r.media === media);
    assert.equal(gasite.length, 1, `astept o singura regula \`${selector}\` ${media ? `in ${media}` : "in afara oricarui prag"}, am gasit ${gasite.length}`);
    return gasite[0].corp;
  };
  // Cinci reguli si nimic altceva: una in plus (alt prag, alt selector) ar putea rasturna cele de mai jos.
  assert.deepEqual(ale.map((r) => `${r.selector} | ${r.media ?? "-"}`).sort(), [
    `.st-rand-sigla | ${LG}`, ".st-sigla | -", `.st-sigla | ${LG}`, ".st-sigla-clasic | -", `.st-sigla-clasic | ${LG}`,
  ]);

  const declaratie = (corp: string, proprietate: string): string => {
    const m = new RegExp(`(?:^|;)\\s*${proprietate}\\s*:\\s*([^;]+);`).exec(corp);
    assert.ok(m, `lipseste \`${proprietate}\` din „${corp}”`);
    return m[1].trim();
  };
  const citeste = (valoare: string): string[] => [...valoare.matchAll(/var\((--[\w-]+)/g)].map((m) => m[1]);

  // Forma plafonului de pana acum: de cinci ori inaltimea de pe telefon, dar niciodata peste locul pe care il are.
  const CU_LOC = `min(calc(var(--sigla-tel, ${SIGLA_IMPLICITA}px) * ${PLAFON_LATIME}), 100%)`;
  for (const selector of [".st-sigla", ".st-sigla-clasic"]) {
    for (const [media, variabila] of [[null, "--sigla-tel"], [LG, "--sigla"]] as const) {
      const corp = una(selector, media);
      const unde = media ? "pe calculator" : "pe telefon";
      const inaltime = declaratie(corp, "height");
      const latime = declaratie(corp, "max-width");
      assert.deepEqual([...new Set(citeste(inaltime))], [variabila], `\`${selector}\` ${unde}: inaltimea trebuie sa vina din \`${variabila}\`, nu din „${inaltime}”`);
      // Rezerva: daca variabila lipseste (o imagine fara stil), sigla are inaltimea implicita, nu marimea fisierului.
      assert.ok(inaltime.includes(`var(${variabila}, ${SIGLA_IMPLICITA}px)`), `\`${selector}\` ${unde}: inaltimea nu are rezerva de ${SIGLA_IMPLICITA}px`);
      /*
       * ⚠ LATIMEA NU CITESTE NICIODATA INALTIMEA DE PE CALCULATOR (`--sigla`). Peste 56 px sigla creste in inaltime, dar
       * latimea ei ramane cea de la capatul vechi: lasata sa se lateasca, scotea pagina din ecran (masurat in browser).
       */
      assert.ok(!citeste(latime).includes("--sigla"), `\`${selector}\` ${unde}: plafonul de latime „${latime}” citeste inaltimea de pe calculator; o sigla lata ar ajunge la 480 px`);
      if (selector === ".st-sigla-clasic") {
        // Antetul simplu: plafon in pixeli, FARA procent (cu procent, latimea ancorei nu mai tine cont de plafon).
        assert.equal(latime, `calc(var(--sigla-tel, ${SIGLA_IMPLICITA}px) * 4.2)`, `\`.st-sigla-clasic\` ${unde}: plafonul nu mai e 4,2 x inaltimea de pe telefon, in pixeli`);
        // `min-w-0` vine din marcaj; o declaratie aici (in afara straturilor) l-ar rasturna.
        assert.doesNotMatch(corp, /min-width/, `\`.st-sigla-clasic\` ${unde}: regula nu are voie sa scrie \`min-width\``);
      } else if (media === null) {
        assert.equal(latime, CU_LOC, "`.st-sigla` pe telefon: plafonul nu mai e forma de pana acum");
        assert.doesNotMatch(corp, /min-width/, "`.st-sigla` pe telefon: regula de pana acum nu scria `min-width`");
      } else {
        // Pe calculator: plafonul in pixeli cand exista (`--sigla-lat`, doar peste 56 px), altfel forma de pana acum.
        assert.equal(latime, `var(--sigla-lat, ${CU_LOC})`, "`.st-sigla` pe calculator: plafonul nu mai e „`--sigla-lat`, altfel forma de pana acum”");
        // `auto` e valoarea de la care porneste orice element: fara variabila, declaratia nu schimba nimic.
        assert.equal(declaratie(corp, "min-width"), "var(--sigla-stramta, auto)", "`.st-sigla` pe calculator: imaginea trebuie sa se poata stramta doar cand i se cere");
      }
    }
  }
  assert.equal(stilSigla(1).maxWidth, `min(${PLAFON_LATIME}px, 100%)`, "subsolurile folosesc acelasi plafon de cinci inaltimi");

  // Randul: `min-height`, deci inaltimea din clase ramane minimul; citeste variabila randului, cu rezerva zero.
  const rand = declaratie(una(".st-rand-sigla", LG), "min-height");
  assert.equal(rand, "var(--sigla-rand, 0px)");

  // Regulile site-ului de prezentare nu ajung in foaia magazinelor: cele ale siglei nu au ce cauta acolo.
  assert.doesNotMatch(faraComentarii(cod("src/app/stil-site.css")), /\.st-(?:sigla|rand-sigla)/);
});

test("cursorul din editor are aceleasi capete ca randarea", () => {
  const s = faraComentarii(cod("src/components/editor-magazin/continut/ContinutChrome.tsx"));
  const cursoare = [...s.matchAll(/<input type="range"[^>]*aria-label="Mărimea logo-ului[^"]*"/g)].map((m) => m[0]);
  // Antetul si subsolul.
  assert.equal(cursoare.length, 2, `astept doua cursoare de marime a logo-ului in editor, am gasit ${cursoare.length}`);
  for (const cursor of cursoare) {
    assert.match(cursor, /\bmin=\{SIGLA_MIN\} max=\{SIGLA_MAX\}/, `capetele cursorului nu mai vin din \`logo-box.ts\`: ${cursor}`);
  }
  // Nota despre telefon foloseste si ea constanta, nu un numar scris de mana.
  assert.match(s, /marime > SIGLA_MAX_TELEFON/, "nota despre marimea de pe telefon nu mai apare de la capatul de pe telefon in sus");
});
