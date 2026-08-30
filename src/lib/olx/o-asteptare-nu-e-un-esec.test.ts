import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { asteptareaCeruta } from "./client";
import { classify, asteptareaLor } from "./sync";

/*
  ⚠ CITIRILE DE SURSĂ SE NORMALIZEAZĂ LA \n.

  Pe Windows, git scrie fișierele cu CRLF în copia de lucru. O probă care caută
  în sursă cu un tipar ce trece peste un rând — orice `\n` dintr-un regex — nu
  mai potrivește nimic, fiindcă în fișier scrie `\r\n`.

  Nu e o închipuire: exact asta a doborât patru probe, printre care și cea care
  verifică FIECARE coloană scrisă din tot depozitul. Aceea a răspuns „am găsit 0
  tabele în tipuri" — deci plasa care apără împotriva scrierii într-o coloană
  inexistentă era căzută, tocmai capcana din care s-a născut ea (vezi nota de
  sus despre `posta_config`).

  ⚠ ÎN DEPOZIT MAI SUNT ~370 DE CITIRI NENORMALIZATE, în ~140 de fișiere de
  probă. Cele mai multe trec fiindcă tiparele lor stau pe un singur rând. Sunt
  fragile la fel; se repară pe măsură ce se ating.
*/


/* ══════════════════════════════════════════════════════════════════════════
   O ASTEPTARE NU E UN ESEC (31.08.2026)
   ══════════════════════════════════════════════════════════════════════════

   Un `429` ardea o incercare, la fel ca o pana de retea. Dar cele cinci incercari se consuma in
   1+2+4+8 minute, deci o limitare OLX de un sfert de ora facea SCRISORI MOARTE din toata munca
   unui magazin:

       omul schimba pretul la treizeci de produse
       OLX ne limiteaza — au dreptul, si o spun limpede prin `Retry-After`
       cinci refuzuri in cincisprezece minute -> `abandonat_la`
       -> limitarea trece, dar nimic nu se mai reia

   ⚠ DEOSEBIREA E INTRE „N-A MERS" SI „NU ACUM". Un refuz spune ceva despre lucrare; o limitare
   spune ceva despre CLIPA. Numai primul are voie sa consume din rabdarea noastra.
*/

const sync = readFileSync("src/lib/olx/sync.ts", "utf8").replace(/\r\n/g, "\n");
const cron = readFileSync("src/app/api/cron/olx-sync/route.ts", "utf8").replace(/\r\n/g, "\n");
const coada = readFileSync("src/lib/olx/queue.ts", "utf8").replace(/\r\n/g, "\n");

/**
 * Codul, fara comentarii.
 *
 * ⚠ De doua ori azi o proba a cazut fiindca ancora ei s-a potrivit in PROPRIA MEA PROZA: nota
 * spune „`attempts` ramane NEATINS", si scanarea a citit cuvantul ca pe cod. O regula despre ce
 * FACE codul se cere pe cod.
 */
function faraComentarii(t: string): string {
  return t.replace(/\/\*[\s\S]*?\*\//g, " ").replace(/\/\/[^\n]*/g, " ");
}

const antet = (v: string | null) => new Headers(v == null ? {} : { "retry-after": v });

test("⚠ `Retry-After` se citeste in amandoua formele din RFC", () => {
  assert.equal(asteptareaCeruta(antet("120")), 120_000);
  assert.equal(asteptareaCeruta(antet("  30  ")), 30_000, "spatiile din jur nu schimba intelesul");
  /* Forma cu data: se masoara de la ceasul nostru, deci se cere doar sa cada in fereastra buna. */
  const peste90 = asteptareaCeruta(antet(new Date(Date.now() + 90_000).toUTCString()));
  assert.ok(peste90 != null && peste90 > 80_000 && peste90 <= 90_000, `am primit ${peste90}`);
});

test("⚠ un antet fara inteles ne lasa politica noastra, nu una inventata", () => {
  /*
   * ⚠ `Number("")` da ZERO, nu `NaN` — deci un antet gol, citit increzator, ar fi insemnat
   * „intoarce-te imediat", si am fi batut in ei fara oprire exact cand ne cereau sa nu o facem.
   */
  for (const gunoi of [null, "", "   ", "curand", "-5", "NaN", new Date(Date.now() - 60_000).toUTCString()]) {
    assert.equal(asteptareaCeruta(antet(gunoi)), undefined, `n-a rezistat la ${JSON.stringify(gunoi)}`);
  }
});

test("⚠ asteptarea are un capat de sus", () => {
  /*
   * Un antet gresit — sau ostil — ar putea spune „intoarce-te peste o saptamana", iar noi am parca
   * lucrarea pana atunci fara ca nimeni sa afle. Un sfert de ora e peste orice limitare reala a lor.
   */
  assert.equal(asteptareaCeruta(antet("604800")), 15 * 60_000);
  assert.equal(asteptareaCeruta(antet(new Date(Date.now() + 7 * 86_400_000).toUTCString())), 15 * 60_000);
});

test("⚠ antetul chiar ajunge din raspuns pana in politica", () => {
  /*
   * ⚠ `asteptareaCeruta` poate fi perfecta si nefolosita. Intre ea si `classify` sta o singura
   * legatura — campul dus mai departe din raspunsul lor — si taiata, toate probele de mai sus ar fi
   * ramas verzi peste un `429` care arde iar incercari.
   */
  const client = readFileSync("src/lib/olx/client.ts", "utf8").replace(/\r\n/g, "\n");
  assert.match(client, /return \{ error: msg, status: res\.status, validation, retryAfterMs: asteptareaCeruta\(res\.headers\) \};/);
});

test("⚠ `429` e o asteptare, nu un refuz", () => {
  const v = classify({ error: "prea multe cereri", status: 429 });
  assert.equal(v.permanent, false);
  assert.equal(v.asteptare, 60_000, "fara antet, ramane implicitul nostru");
  /* Iar cand il trimit, al lor bate implicitul. */
  assert.equal(classify({ error: "x", status: 429, retryAfterMs: 5_000 }).asteptare, 5_000);
  /* Si orice alta stare care poarta antetul e tot o asteptare: `503` la o mentenanta anuntata. */
  assert.equal(classify({ error: "x", status: 503, retryAfterMs: 9_000 }).asteptare, 9_000);
});

test("⚠ un `400` ramane refuz chiar daca poarta `Retry-After`", () => {
  /*
   * ⚠ Ordinea din `classify` e chiar regula: peticul e gresit, si intors peste un minut va fi tot
   * gresit. Asteptarea nu repara o cerere pe care ei au inteles-o si au respins-o — iar socotita
   * asteptare, ar fi tinut la nesfarsit in coada un produs care nu putea trece niciodata.
   */
  const v = classify({ error: "camp lipsa", status: 400, retryAfterMs: 60_000 });
  assert.equal(v.permanent, true);
  assert.equal(v.asteptare, undefined);
});

test("⚠ o pana obisnuita nu devine asteptare", () => {
  for (const status of [0, 401, 403, 404, 500, 502, 504]) {
    const v = classify({ error: "x", status });
    assert.equal(v.permanent, false, `status ${status}`);
    assert.equal(v.asteptare, undefined, `status ${status} n-are voie sa amane singur`);
  }
  assert.equal(asteptareaLor({ status: 500 }), undefined);
});

test("⚠ o asteptare nu atinge contorul de incercari", () => {
  /*
   * ⚠ AICI E TOT ROSTUL. `attempts` numara cat de rau e peticul, nu cat de ocupati sunt ei. Ramura
   * de asteptare n-are voie sa-l creasca, si nici sa scrie `abandonat_la`.
   */
  const i = cron.indexOf("res.asteptare != null && !preaBatran(item)");
  assert.notEqual(i, -1, "ramura de asteptare a disparut din cron");
  const ramura = faraComentarii(cron.slice(i, cron.indexOf("} else {", i)));
  assert.doesNotMatch(ramura, /attempts/, "o asteptare care creste `attempts` e chiar defectul reparat");
  assert.doesNotMatch(ramura, /abandonat_la/, "o asteptare nu abandoneaza");
  assert.match(ramura, /next_retry_at: new Date\(Date\.now\(\) \+ res\.asteptare\)/);
});

test("⚠ dar asteptarea are si ea un capat, altfel lucrarea sta pe veci", () => {
  /*
   * De cand un `429` nu mai arde o incercare, `attempts` singur nu mai marginește nimic: un magazin
   * limitat la nesfarsit ar avea lucrari amanate din minut in minut, fara ca nimeni sa afle ca
   * pretul lui nu s-a dus niciodata. Varsta o marginește.
   */
  assert.match(cron, /const VIATA_MAXIMA_MS = 24 \* 60 \* 60_000;/);
  assert.match(cron, /res\.asteptare != null && !preaBatran\(item\)/,
    "fara paza de varsta, asteptarea n-are capat");
  /*
   * ⚠ DAR ABANDONUL OBISNUIT NU SE UITA LA VARSTA, si e o deosebire pe care am gresit-o o data.
   * Un rand poate sta zile intregi fara sa fie nici macar incercat — magazinul cere reconectare,
   * iar cronul il lasa neatins dinadins. Judecat dupa varsta, ar fi murit la PRIMA lui incercare
   * de dupa reconectare, in loc sa-si primeasca cele cinci. Varsta spune ce s-a AMANAT, nu ce a
   * esuat.
   */
  assert.match(cron, /\.\.\.\(attempts >= MAX_ATTEMPTS \? \{ abandonat_la: now \} : \{\}\)/);
  /* ⚠ Al DOILEA `failed++`: primul e al ramurii permanente, si o taietura de acolo inghitea si
     ramura de asteptare — care are dreptul la `preaBatran`. */
  const iEsec = cron.indexOf(`failed++;
        const attempts`);
  const ramuraEsec = cron.slice(iEsec, cron.indexOf("await pause(PACE_MS);", iEsec));
  assert.doesNotMatch(ramuraEsec, /preaBatran/,
    "varsta n-are ce cauta in abandonul dupa un esec adevarat");
  /* ⚠ Iar o data necitibila NU inseamna „batran": ar fi aruncat lucrarea din prima. */
  assert.match(cron, /Number\.isFinite\(nascut\) && Date\.now\(\) - nascut > VIATA_MAXIMA_MS/);
});

test("⚠ o intentie noua reporneste si ceasul varstei", () => {
  /*
   * Fara asta, un rand vechi de o saptamana, reinviat de o apasare de azi, ar fi fost aruncat la
   * prima trecere — adica tocmai intentia proaspata ar fi murit cel mai repede.
   */
  assert.match(coada, /const CEAS_NOU = \(\) => \(\{ created_at: new Date\(\)\.toISOString\(\) \}\);/);
  const scrieri = [...coada.matchAll(/await admin\.from\("olx_sync_queue"\)\.upsert\(/g)];
  assert.ok(scrieri.length >= 3);
  for (const m of scrieri) {
    const dupa = coada.slice(m.index ?? 0, (m.index ?? 0) + 460);
    assert.match(dupa, /\.\.\.CEAS_NOU\(\)/, "o punere la coada fara ceas nou imbatraneste intentia altcuiva");
  }
});

/* ── Ce a reusit la ei se scrie si la noi: ultimele doua locuri oarbe ─────── */

test("⚠ motivul refuzului se SCRIE, altfel produsul tace", () => {
  /*
   * `saveError` mergea oarba, iar cine chema iesea cu `permanent: true` — deci cronul stergea
   * elementul din coada si nimic nu mai reincerca:
   *
   *     OLX refuza anuntul (categorie nemapata, atribut lipsa)
   *     scrierea motivului pica -> nimeni n-o afla
   *     -> produsul pur si simplu NU apare pe OLX, si ecranul nu spune de ce
   */
  assert.match(sync, /\): Promise<\{ ok: true \} \| \{ ok: false; error: string \}> \{\n  const now = new Date\(\)\.toISOString\(\);\n  const \{ error \} = await admin\.from\("olx_adverts"\)\.upsert\(/,
    "`saveError` trebuie sa-si citeasca scrierea si s-o raporteze");
  /* ⚠ Si TOATE chemarile ei citesc raspunsul: una lasata pe dinafara pierde motivul la fel de bine. */
  const chemari = [...sync.matchAll(/await saveError\(/g)];
  assert.equal(chemari.length, 4, `asteptam patru chemari, sunt ${chemari.length}`);
  for (const m of chemari) {
    const inainte = sync.slice(Math.max(0, (m.index ?? 0) - 22), m.index);
    assert.match(inainte, /const scris = $/,
      `o chemare nu-si citeste rezultatul: …${sync.slice(Math.max(0, (m.index ?? 0) - 60), (m.index ?? 0) + 40)}`);
    const dupa = sync.slice(m.index ?? 0, (m.index ?? 0) + 260);
    assert.match(dupa, /if \(!scris\.ok\) return \{ ok: false, permanent: false,/,
      "o scriere picata trebuie sa faca lucrarea reluabila, nu s-o inchida definitiv");
  }
});

test("⚠ o actualizare reusita la OLX se scrie si la noi", () => {
  /*
   * Ultimul loc oarb din familia de ieri: `PUT` reusea, scrierea locala pica, si se raporta `ok` —
   * deci coada se golea, iar pretul nou, starea si `last_synced_at` ramaneau in urma pe veci.
   */
  const i = sync.indexOf('const advert = res.data ?? ({ id: row.olx_advert_id');
  assert.notEqual(i, -1);
  const dupa = sync.slice(i, i + 900);
  assert.match(dupa, /const \{ error: eProaspat \} = await admin\.from\("olx_adverts"\)\.upsert\(/);
  assert.match(dupa, /if \(eProaspat\) \{[\s\S]{0,220}?permanent: false,/);
});

test("⚠ un `404` inseamna acelasi lucru pe amandoua caile", () => {
  /*
   * ═══ ACEEASI HOTARARE, DOUA RASPUNSURI DEOSEBITE (31.08.2026) ═══
   *
   * Sondarea invatase ca un `404` inseamna „omul l-a sters de mana pe OLX" si punea o piatra.
   * Ramura de ACTUALIZARE scria pe dos: stergea legatura si il recrea la trecerea urmatoare.
   *
   * ⚠ Iar ea o ia inaintea celeilalte, mereu: sondarea vine din doua in doua ore, pe cand coada se
   * umple la FIECARE editare de pret. Deci reparatia de ieri era ocolita aproape de fiecare data.
   */
  /* ⚠ Se pleaca de la `404` INAINTE, nu inapoi de la piatra: intre ele sta o nota lunga. */
  const cod = faraComentarii(sync);
  /*
   * ⚠ SE CER USILE, NU NUMARUL LOR. Prima varianta cerea „exact doua"; de cand si dezactivarea stie
   * ce inseamna un `404`, sunt trei — iar un numar fix ar fi picat tocmai la ADAUGAREA celei de-a
   * treia, adica exact cand regula se respecta mai bine.
   */
  const usi = [...cod.matchAll(/res\.status === 404/g)];
  assert.ok(usi.length >= 3, `asteptam cel putin trei usi de \`404\`, sunt ${usi.length}`);
  for (const m of usi) {
    const ramura = cod.slice(m.index ?? 0, (m.index ?? 0) + 500);
    assert.match(ramura, /status: "sters_de_om"/, "un `404` fara piatra lasa anuntul sa reapara");
    assert.match(ramura, /sters_de_om_la: now/);
  }
  assert.equal((cod.match(/sters_de_om_la: now/g) ?? []).length, usi.length,
    "fiecare usa de `404` isi pune piatra ei");
  /* ⚠ Pe COD, nu pe fisier: nota de mai sus citeaza chiar vorba veche, si a picat proba de trei ori. */
  assert.doesNotMatch(cod, /va fi recreat/,
    "recrearea dupa un `404` desface hotararea omului");
});

test("⚠ o sesiune care cere mana omului nu arde incercari", () => {
  /*
   * ═══ COMENTARIUL SPUNEA UN LUCRU, CODUL FACEA ALTUL (31.08.2026) ═══
   *
   * Nota de langa ramura scria „elementul ramane in coada; daca omul reconecteaza maine, pleaca de
   * la sine". Dar codul ardea o incercare de fiecare data, iar cronul porneste din minut in minut:
   *
   *     tokenul expira la ora 9
   *     9:01, 9:02, 9:04, 9:08, 9:15 -> cele cinci incercari
   *     9:15: toata coada magazinului e moarta
   *     18:00, omul reconecteaza -> nimic nu mai era acolo sa porneasca
   *
   * ⚠ Adica CHIAR asta era boala pentru care invierea la reconectare e leacul. Deosebirea e aceeasi
   * ca la `429`: sesiunea nu spune nimic despre lucrare, spune ceva despre CLIPA.
   */
  const i = cron.indexOf("const cereMana = r.stare === \"cere-reconectare\";");
  assert.notEqual(i, -1, "ramura de asteptare la reconectare a disparut");
  const ramura = faraComentarii(cron.slice(i, cron.indexOf("const attempts = (it.attempts ?? 0) + 1;", i)));
  assert.doesNotMatch(ramura, /attempts/, "asteptarea dupa mana omului n-are voie sa arda incercari");
  assert.doesNotMatch(ramura, /abandonat_la/);
  assert.match(ramura, /next_retry_at: new Date\(Date\.now\(\) \+ ASTEPTARE_RECONECTARE_MS\)/);
  /*
   * ⚠ CONDITIA INTREAGA, nu o bucata din ea. O proba care cere doar ca `cereMana && !preaBatran`
   * sa apara undeva a lasat sa treaca un `if (false && cereMana && !preaBatran(it))` — ramura era
   * pe loc, cu tot ce trebuie inauntru, si nu se mai deschidea niciodata.
   */
  assert.ok(cron.includes("        if (cereMana && !preaBatran(it)) {"),
    "conditia ramurii de asteptare s-a schimbat");
  /*
   * ⚠ NUMAI „cere-reconectare". O pana trecatoare — retea, baza, OLX cazut — e un esec adevarat si
   * isi arde incercarile: altfel n-ar mai muri niciodata nimic.
   */
  assert.match(cron, /const cereMana = r\.stare === "cere-reconectare";/);
});
