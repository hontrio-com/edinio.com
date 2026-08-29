import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

/* ══════════════════════════════════════════════════════════════════════════
   CHEIA APARA INTENTIA. TINTA CERE O A DOUA INCUIETOARE.        (03.09.2026)
   ══════════════════════════════════════════════════════════════════════════

   Runda trecuta cheia unei plati a trecut de la ziua UTC la un ID DE INTENTIE. A fost bine — dar
   intentia traieste in `localStorage`, iar registrul e atomic pentru ACEEASI cheie, nu pentru
   acelasi LUCRU cumparat sub doua intentii. Trei drumuri catre plata dubla, toate reale:

     ALT CALCULATOR   `localStorage` gol -> intentie noua -> alta cheie -> `POST` a doua oara.
     INTENTIA EXPIRA  o tinem sase ore; randul poate fi INCA `necunoscut` la sapte.
     DOUA FILE        amandoua citesc `localStorage` gol in aceeasi clipa si isi scriu intentia.

   ⚠ SI E MAI PERICULOS LA PACHETE. La promovari mai exista o plasa: se intreaba OLX daca
   promovarea e deja activa. La pachete nu exista nicio dovada pe care sa ne sprijinim — chiar
   reconcilierul nostru o spune — fiindca raspunsul lor spune cate pachete ai, nu cand le-ai luat.

   ⚠ CE APARA PROBELE DE AICI, si ce nu. Suita nu atinge baza (cheile din `.env.local` nu intra in
   probe, dinadins). Deci aici se apara FORMA invariantului: indexul partial exista, cuprinde
   `in_curs` si `necunoscut` si NU `reusit`, iar codul chiar trimite tinta. Purtarea insasi —
   inclusiv cursa dintre doua cereri simultane — s-a probat pe baza adevarata; blocul rulabil e in
   `migrations/2026-12-26-registru-tinta-idempotenta.sql`, iar cursa in scriptul de acolo.

   Rezultatul masurat la 03.09.2026, sase runde de cate opt cereri simultane pe aceeasi tinta:
   EXACT UN CASTIGATOR de fiecare data, ceilalti sapte refuzati cu `alta_intentie`.
*/

const baseline = readFileSync("migrations/000-schema-baseline.sql", "utf8");
const registru = readFileSync("src/lib/operatii/registru.ts", "utf8");
const actiuni = readFileSync("src/lib/actions/olx.actions.ts", "utf8");

function faraComentarii(t: string): string {
  return t.replace(/\/\*[\s\S]*?\*\//g, " ").replace(/\/\/[^\n]*/g, " ");
}

/** Corpul lui `rezerva_operatie_externa` din schema PRODUCTIEI, nu dintr-o migratie istorica. */
function rpcRezervare(): string {
  const i = baseline.indexOf("CREATE OR REPLACE FUNCTION public.rezerva_operatie_externa");
  assert.ok(i > 0, "RPC-ul de rezervare a disparut din baseline");
  return baseline.slice(i, baseline.indexOf("\n$function$", i));
}

test("⚠ incuietoarea semantica NU cuprinde `reusit`", () => {
  /*
   * ⚠ ASTA E TOATA DEOSEBIREA, si e usor de stricat cu bune intentii. Daca `reusit` ar intra in
   * index, un pachet cumparat cu SUCCES ar face imposibila a doua cumparare a aceluiasi pachet —
   * pentru totdeauna. Incuietoarea semantica are voie sa existe doar cat timp o cumparare
   * anterioara e DESCHISA sau NELAMURITA.
   *
   * Cealalta incuietoare, cea pe `cheie`, cuprinde si `reusit` — si trebuie: acolo e vorba de
   * ACEEASI intentie, iar o reluare a aceleiasi apasari trebuie sa primeasca `deja`.
   */
  const i = baseline.indexOf("CREATE UNIQUE INDEX operatii_externe_tinta_deschisa_idx");
  assert.ok(i > 0, "indexul semantic lipseste din schema");
  const idx = baseline.slice(i, baseline.indexOf(";", i));

  assert.match(idx, /UNIQUE/, "fara `unique`, indexul nu opreste nimic");
  assert.match(idx, /tinta_idempotenta IS NOT NULL/,
    "fara asta, toate operatiile fara tinta s-ar ciocni intre ele");
  assert.match(idx, /'in_curs'::text, 'necunoscut'::text/, "starile deschise trebuie cuprinse");
  assert.doesNotMatch(idx, /'reusit'/,
    "`reusit` in incuietoarea semantica ar interzice pe veci a doua cumparare legitima");

  /* ⚠ Si cheia indexului poarta furnizorul si felul: doua case de plata pe aceeasi tinta sunt
     operatii DIFERITE, si amandoua au voie sa se intample. */
  assert.match(idx, /furnizor, fel, tinta_idempotenta/, "cheia indexului nu separa furnizorii");
  /* ⚠ Si `coalesce` pe magazin, ca la indexul de chei: `NULL != NULL` ar deschide o gaura tacuta
     exact la operatiile PLATFORMEI. */
  assert.match(idx, /COALESCE\(business_id/, "operatiile platformei ar scapa neincuiate");

  /* ⚠ Iar cealalta incuietoare ramane cum era, cu `reusit` cu tot. */
  const j = baseline.indexOf("CREATE UNIQUE INDEX operatii_externe_cheie_activa_idx");
  assert.ok(j > 0, "indexul pe cheie a disparut");
  assert.match(baseline.slice(j, baseline.indexOf(";", j)), /'reusit'::text/,
    "pe CHEIE, `reusit` trebuie sa ramana: o reluare a aceleiasi apasari primeste `deja`");
});

test("⚠ hotararea sta in `INSERT`, nu intr-un `SELECT` de dinainte", () => {
  /*
   * ⚠ Un „mai exista una deschisa?" urmat de un `insert` e chiar cursa pe care o inchidem: doua
   * cereri simultane citesc amandoua „nu exista" si scriu amandoua. Indexul unic e arbitrul.
   *
   * ⚠ SI `on conflict` E FARA TINTA DE INDEX, dinadins. Cu doua incuietori, un
   * `on conflict (index_a) do nothing` prinde numai ciocnirile cu `index_a`; una cu `index_b` ar
   * ARUNCA, iar apelantul ar primi „registrul nu a raspuns" in loc de un mesaj care spune ce are
   * omul de facut.
   */
  const rpc = rpcRezervare();
  assert.match(rpc, /on conflict do nothing/,
    "forma cu tinta de index ar arunca la ciocnirea cu a doua incuietoare");
  const iInsert = rpc.indexOf("insert into public.operatii_externe");
  const iCauta = rpc.indexOf("tinta_idempotenta = v_tinta");
  assert.ok(iInsert > 0 && iCauta > iInsert,
    "cautarea tintei trebuie sa vina DUPA inserare: inainte, ar fi chiar cursa");
});

test("⚠ aceeasi cheie primeste raspunsul de dinainte, nu pe cel de tinta", () => {
  /*
   * ⚠ ORDINEA CAUTARILOR E INFORMATIE. O reluare a ACELEIASI apasari trebuie sa primeasca
   * `in_curs`/`reusit`/`necunoscut` — mesajele care spun „e in lucru" sau „s-a facut deja".
   * Cautata a doua, ar fi primit mesajul de tinta, care spune altceva si trimite omul in alta
   * parte: „verifica in cont si lamureste" pentru o operatie care e pur si simplu in zbor.
   */
  const rpc = rpcRezervare();
  const iCheie = rpc.indexOf("o.cheie = p_cheie");
  const iTinta = rpc.indexOf("o.tinta_idempotenta = v_tinta");
  assert.ok(iCheie > 0 && iTinta > iCheie,
    "cheia se cauta INAINTEA tintei, altfel o reluare primeste mesajul gresit");

  /* ⚠ Si pe randul altei intentii NU se creste `incercari`: randul acela apartine altei apasari,
     iar numarul incercarilor lui ar deveni mincinos. */
  const dupaTinta = rpc.slice(iTinta);
  assert.doesNotMatch(dupaTinta, /incercari\s*=\s*o\.incercari \+ 1/,
    "nu se umfla contorul unei operatii care nu e a apasarii de acum");
});

test("⚠ registrul duce tinta pana la baza, si stie sa spuna ce s-a intamplat", () => {
  const cod = faraComentarii(registru);
  assert.match(cod, /tinta\?: string;/, "`CerereOperatie` nu poarta tinta");
  assert.match(cod, /p_tinta: cerere\.tinta \?\? null,/, "tinta nu ajunge la RPC");
  assert.match(cod, /case "alta_intentie":/, "motivul nou n-are mesaj, deci iese unul generic");

  /*
   * ⚠ SI MESAJUL NU SPUNE „reincarca pagina". Aici reincarcarea nu schimba nimic: cealalta
   * cumparare ramane nelamurita pana o lamureste cineva. Un sfat care nu duce nicaieri e chiar
   * felul de mesaj care il trimite pe om sa cumpere de pe olx.ro, adica a doua oara.
   */
  const i = registru.indexOf('case "alta_intentie":');
  const ram = registru.slice(i, registru.indexOf("case \"cursa\":", i));
  assert.doesNotMatch(faraComentarii(ram), /Reincarca pagina|reincarca pagina/,
    "mesajul trebuie sa spuna ce e de facut, nu sa trimita la o reincarcare fara rost");
  assert.match(ram, /lamureste-o din panoul/, "mesajul trebuie sa numeasca iesirea adevarata");

  /*
   * ⚠ SI PRAGUL E ACELASI CU AL PANOULUI. `eAtarnata` ascunde din panou o operatie `in_curs` mai
   * tanara de trei minute, tocmai ca omul sa nu deblocheze una care CHIAR se executa. Fara
   * deosebire, mesajul l-ar fi trimis „in panoul de sanatate" dupa un rand pe care panoul inca nu-l
   * arata — doua praguri care nu se vorbesc, si un sfat care nu duce nicaieri.
   */
  assert.match(ram, /eAtarnata\(\{ stare: "in_curs", creatLa \}\)/,
    "mesajul trebuie sa foloseasca ACELASI prag ca panoul");
  assert.match(faraComentarii(registru), /mesajBlocat\(r\.motiv, cerere, r\.incercari, r\.creat_la\)/,
    `fara creat_la, mesajul nu poate deosebi „tocmai a plecat” de „a ramas asa”`);
});

test("⚠ toate cele trei cumparari trimit tinta, si e ALTA decat cheia", () => {
  /*
   * ⚠ Daca tinta ar fi identica cu cheia, a doua incuietoare n-ar incuia nimic: s-ar suprapune
   * peste prima si toate cele trei drumuri catre plata dubla ar ramane deschise. Tinta e chiar
   * cheia FARA id-ul de intentie.
   */
  for (const fn of ["buyOlxCategoryPacket", "buyOlxAdvertPacket", "buyOlxPaidFeature"]) {
    const i = actiuni.indexOf(`export async function ${fn}(`);
    assert.ok(i > 0, `${fn} a disparut`);
    const corp = faraComentarii(actiuni.slice(i, actiuni.indexOf("\nexport ", i + 10)));

    const mCheie = corp.match(/cheie: cheiaPlatii\((ce[A-Za-z]+\([^)]*\)), intentId\),/);
    const mTinta = corp.match(/tinta: (ce[A-Za-z]+\([^)]*\)),/);
    assert.ok(mCheie, `${fn} nu-si mai compune cheia prin cheiaPlatii`);
    assert.ok(mTinta, `${fn} nu trimite tinta, deci alt browser poate plati a doua oara`);
    assert.equal(mTinta![1], mCheie![1],
      `${fn}: tinta trebuie sa descrie ACELASI lucru ca si cheia, fara intentie`);
    assert.doesNotMatch(mTinta![1], /intentId/,
      `${fn}: tinta cu intentie in ea nu incuie nimic`);
  }
});
