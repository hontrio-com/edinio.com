import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";

/**
 * Fisierul incarcat de cumparator ramane privat, si ajunge la atelier?
 *
 * ═══ ⚠ DE CE E ALTFEL DECAT ORICE INCARCARE DIN PLATFORMA ═══
 *
 * Tot ce urca azi vine de la un comerciant autentificat. Aici urca vizitatorul unui magazin: n-are
 * cont, nu i se poate inchide contul, si nu raspunde de nimic. Fiecare proba de mai jos pazeste una
 * dintre consecintele acelui fapt — si niciuna nu se poate scrie ca proba de unitate, fiindca ce
 * apara e o LEGATURA intre bucati care se pot dezlega tacut.
 */

const SRC = path.resolve(process.cwd(), "src");

/** ⚠ Terminatiile se normalizeaza: repo-ul are si fisiere CRLF. */
function sursa(relativ: string): string {
  return readFileSync(path.join(SRC, relativ), "utf8").replace(/\r\n/g, "\n");
}

/**
 * Sursa fara comentarii.
 *
 * ⚠ Fara ea, `includes("category: null")` gaseste chiar NOTA care explica de ce nu mai e asa,
 * si proba cade pe cod bun. Mi s-a intamplat scriind proba de dedesubt.
 */
function faraComentarii(s: string): string {
  return s.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
}

const INCARCARE = "app/api/configurator/fisier/route.ts";
const SERVIRE = "app/api/configurator/fisier/[id]/route.ts";

test("⚠ probele stiu sa citeasca fisierele", () => {
  // Perechea obligatorie a oricarei probe pe sursa: un cititor rupt le-ar face pe toate verzi.
  assert.ok(sursa(INCARCARE).length > 3000);
  assert.ok(sursa(SERVIRE).length > 1500);
});

/* ══════════════════════════════════════════════════════════════════════════
   INCARCAREA
   ══════════════════════════════════════════════════════════════════════════ */

test("⚠ incarcarea cere un CAMP ADEVARAT dintr-o versiune PUBLICATA", () => {
  /*
   * ⚠ Fara asta, ruta e un depozit gratuit deschis oricui: `POST` cu orice octeti si gata. Si nici
   * n-ar exista limite de aplicat — „cel mult 2 MB" e o proprietate a CAMPULUI, deci fara camp nu
   * se poate cere nimic.
   *
   * `configuratorulProdusului` citeste doar versiunea ACTIVA a unui configurator ACTIV legat de
   * produsul cerut: deci nu o ciorna, nu unul oprit, si nu unul al altui magazin.
   */
  const s = sursa(INCARCARE);
  assert.match(s, /await configuratorulProdusului\(businessId, \{\s+id: productId/);
  assert.match(s, /nodurileDeFisiere\([\s\S]{0,60}\)\.get\(nodId\)/);
  assert.match(s, /if \(!nod\) \{[\s\S]{0,120}status: 404/);
});

test("⚠ tipul se hotaraste din OCTETI, niciodata din antetul clientului", () => {
  /*
   * ⚠ Un fisier numit „poza.png" cu `type: "text/html"` a fost deja o data acceptat si apoi SERVIT
   * ca HTML de pe domeniul CDN al platformei — XSS stocat pe origine proprie. Reparatia de atunci
   * (`uploadImage`) a fost tocmai asta: decide serverul, din octeti, si ce accepta, si ce antet pune.
   */
  const s = sursa(INCARCARE);
  assert.match(s, /const tipReal = detectImageMime\(octeti\)/);
  assert.equal(s.includes("fisier.type"), false, "tipul trimis de client nu se foloseste nicaieri");
  assert.match(s, /tipurilePermise\(nod\)\.includes\(tipReal\)/);
});

test("⚠ pragul se consuma INAINTE de citirea octetilor", () => {
  /*
   * ⚠ Verificat dupa, o rafala de cereri de 25 MB ar fi fost intai descarcata intreaga si abia apoi
   * refuzata — adica pragul ar fi aparat depozitul si deloc latimea de banda. Si sunt DOUA straturi:
   * cel din memorie taie rafalele, cel din Postgres limiteaza cu adevarat, fiindca instantele sunt
   * multe si fiecare are contorul ei.
   */
  const s = sursa(INCARCARE);
  const iRata = s.indexOf("consumaLimita");
  const iCorp = s.indexOf("req.formData()");
  assert.ok(iRata > 0 && iCorp > 0, "lipseste unul dintre cele doua");
  assert.ok(iRata < iCorp, "pragul se consuma dupa ce s-a citit corpul cererii");
  assert.match(s, /rateLimit\(`cfgFisier:\$\{ip\}`/, "lipseste stratul din memorie");
});

test("⚠ obiectul se urca `private, no-store`, nu cu implicitul de un an", () => {
  /*
   * ⚠ Implicitul lui `uploadToR2` e `public, max-age=31536000, immutable`, si e bun pentru o poza de
   * produs. Aici obiectul e al unui strain — o dedicatie, un act, chipul cuiva — si n-are voie sa
   * fie tinut de niciun intermediar.
   */
  assert.match(sursa(INCARCARE), /uploadToR2\(octeti, cheie, tipReal, "private, no-store"\)/);
});

test("⚠ nu se intoarce niciodata o adresa de CDN", () => {
  /*
   * ⚠ `uploadToR2` INTOARCE adresa publica, si e chiar ce trebuie pentru o poza de produs. Trimisa
   * de aici la browser, ea ar fi ocolit pentru totdeauna ruta care pune `private, no-store` — si ar
   * fi ajuns in cosul din `localStorage`, deci copiabila de oriunde.
   */
  const s = sursa(INCARCARE);
  assert.equal(s.includes("R2_PUBLIC_URL"), false);
  assert.match(s, /url: `\/api\/configurator\/fisier\/\$\{id\}`/, "se intoarce ruta, nu adresa din depozit");
  assert.equal(/return NextResponse\.json\(\{[^}]*cheie/.test(s), false, "cheia din depozit nu pleaca la client");
});

/* ══════════════════════════════════════════════════════════════════════════
   SERVIREA
   ══════════════════════════════════════════════════════════════════════════ */

test("⚠ servirea pune `private, no-store` si `nosniff`", () => {
  /*
   * ⚠ Fisierul e ales de un strain si servit de pe originea platformei. `nosniff` opreste browserul
   * sa ghiceasca alt tip decat cel scris — adica sa execute ca HTML ceva ce noi am hotarat, din
   * octeti, ca e o imagine.
   */
  const s = sursa(SERVIRE);
  assert.match(s, /"Cache-Control": "private, no-store"/);
  assert.match(s, /"X-Content-Type-Options": "nosniff"/);
});

test("⚠ un PDF se descarca, nu se deschide in pagina", () => {
  /*
   * ⚠ Un PDF deschis `inline` ruleaza in vizualizatorul browserului, PE ORIGINEA NOASTRA. Pentru un
   * fisier urcat de un strain, exact asta nu vrem. Imaginile se deseneaza si nu executa nimic, iar
   * cumparatorul chiar trebuie sa-si vada poza in pagina.
   */
  const s = sursa(SERVIRE);
  assert.match(s, /const inline = data\.mime !== "application\/pdf"/);
  assert.match(s, /\$\{inline \? "inline" : "attachment"\}/);
});

test("⚠ numele din antet se curata inainte sa intre in el", () => {
  /*
   * ⚠ Numele vine de la cel care a incarcat. Ghilimelele si randurile noi dintr-un
   * `Content-Disposition` sunt chiar felul in care se sparge un antet in doua.
   */
  assert.match(sursa(SERVIRE), /replace\(\/\[\^\\w\.\\-\]\+\/g, "_"\)/);
});

test("⚠ forma id-ului se verifica INAINTE de interogare", () => {
  /*
   * ⚠ `id` vine din adresa, iar PostgREST raspunde cu `22P02` la orice nu e uuid — adica o eroare de
   * server pentru o cerere pur si simplu prost formulata. Aceeasi lectie ca la `.contains()`, unde
   * URL-ul dadea 200 si clientul real cadea cu 22P02.
   */
  const s = sursa(SERVIRE);
  const iForma = s.search(/\[0-9a-f\]\{8\}-/);
  const iCitire = s.indexOf('.from("configurator_fisiere")');
  assert.ok(iForma > 0 && iCitire > 0);
  assert.ok(iForma < iCitire, "se interogheaza inainte sa se stie ca id-ul e macar un uuid");
});

/* ══════════════════════════════════════════════════════════════════════════
   DE LA INCARCARE PANA LA ATELIER
   ══════════════════════════════════════════════════════════════════════════ */

test("⚠ AMANDOUA caile de comanda leaga fisierele", () => {
  /*
   * ⚠ CE COSTA O CALE UITATA. Randul se naste ORFAN si se matura peste o saptamana. Uitat pe o
   * cale, fiecare comanda venita pe acolo isi pierde pozele peste sapte zile — o comanda PLATITA,
   * al carei atelier deschide specificatia si gaseste o trimitere catre nimic. Si se intampla la o
   * saptamana dupa vanzare, deci nimeni nu leaga cele doua.
   */
  const s = sursa("lib/actions/order.actions.ts");
  const apeluri = s.match(/await legaFisiereleDeComanda\(/g) ?? [];
  assert.equal(apeluri.length, 2, `se leaga pe ${apeluri.length} cai, nu pe 2`);
});

test("⚠ legarea cere si MAGAZINUL, si ca randul sa fie inca orfan", () => {
  /*
   * ⚠ Instantaneul poarta ce a trimis clientul. Fara `business_id`, un id incarcat in ALT magazin
   * s-ar fi legat de comanda asta: fisierul altcuiva ramanea viu pe socoteala noastra si vizibil de
   * pe o comanda care nu e a lui.
   *
   * ⚠ Fara `comanda_id is null`, doi cumparatori care lipesc acelasi id — se poate, id-ul circula
   * prin cosul din browser — ar fi rupt legatura primei comenzi, iar poza EI ar fi plecat la maturare.
   */
  const s = sursa("lib/configurators/legare-fisiere.ts");
  assert.match(s, /\.eq\("business_id", businessId\)/);
  assert.match(s, /\.is\("comanda_id", null\)/);
});

test("⚠ maturarea sterge INTAI randul si abia apoi obiectul", () => {
  /*
   * ⚠ ORDINEA E TOT. Intre citirea listei si stergere trece timp, iar in timpul ala o comanda poate
   * lega chiar unul dintre randurile citite. Sters intai din depozit, obiectul ar fi plecat inainte
   * ca `comanda_id` sa ajunga pe rand: comanda ramanea cu o trimitere catre o poza care nu mai
   * exista nicaieri. IREPARABIL.
   *
   * Asa, hotaraste BAZA, atomic: pleaca doar randurile inca orfane, si doar cheile intoarse de
   * acolo se sterg din depozit.
   */
  const s = sursa("app/api/cron/discount-release/fisiere-orfane.ts");
  const iSterge = s.indexOf(".delete()");
  // ⚠ APELUL, nu importul: `deleteFromR2` sta si in linia de import, adica inaintea oricarui cod.
  const iR2 = s.indexOf("deleteFromR2(rand.cheie)");
  assert.ok(iSterge > 0 && iR2 > 0);
  assert.ok(iSterge < iR2, "obiectul pleaca din depozit inainte ca baza sa fi hotarat");
  assert.match(s, /\.delete\(\)\s*\n\s*\.is\("comanda_id", null\)/, "stergerea nu mai cere ca randul sa fie orfan");
  assert.match(s, /\.select\("id, cheie"\)/, "cheile trebuie sa vina CHIAR de la randurile sterse");

  /*
   * ⚠ SI PESTE CARE LISTA SE MERGE, nu doar in ce ordine. Prima forma a probei cerea doar ca
   * `.delete()` sa fie scris INAINTEA lui `deleteFromR2` — si trecea verde peste chiar defectul pe
   * care exista sa-l prinda: bucla mutata pe `candidati` (lista CERUTA) in loc de `plecate` (lista
   * pe care baza a acceptat s-o stearga) sterge din depozit exact obiectele randurilor pe care
   * DELETE le-a refuzat, adica ale comenzilor legate intre timp. Ordinea era buna, paguba la fel.
   */
  assert.match(
    s,
    /for \(const rand of plecate \?\? \[\]\) \{[\s\S]{0,200}deleteFromR2\(rand\.cheie\)/,
    "din depozit se sterg alte obiecte decat cele pe care baza le-a scos",
  );
});

test("⚠ maturarea asteapta cat traieste un cos, nu o zi", () => {
  /*
   * ⚠ Cosul traieste in `localStorage`, iar platforma trimite emailuri de recuperare a cosului
   * abandonat — adica ii spune omului, zile mai tarziu, sa se intoarca si sa termine comanda. Cu o
   * zi, el se intorcea si gasea comanda REFUZATA: poza lui fusese stearsa.
   */
  const s = sursa("app/api/cron/discount-release/fisiere-orfane.ts");
  assert.match(s, /ZILE_PANA_LA_MATURARE = 7/);
  assert.ok(sursa("app/api/cron/discount-release/route.ts").includes("maturaFisiereleOrfane(admin)"));
});

test("⚠ serverul verifica fisierele DIN NOU la plasarea comenzii", () => {
  /*
   * ⚠ Verificarea de la incarcare singura n-ar fi aparat nimic: cine cheama ruta poate sari peste ea
   * si trimite de-a dreptul un id vechi, al altui camp, cu alta marime. Sau un id inventat — si
   * atunci atelierul primeste o specificatie care trimite la o poza inexistenta.
   */
  const s = sursa("lib/configurators/repretuire.ts");
  assert.match(s, /const fisiere = await fisiereleLiniilor\(businessId, linii, configuratoare\)/);
  assert.match(s, /verificaRaspunsul\(compilat, configuratie, pretCatalog, fisiere\)/);
  assert.match(s, /\.eq\("business_id", businessId\)/, "un fisier al ALTUI magazin ar trece");
});

test("⚠ cand citirea fisierelor PICA, comanda nu se refuza in bloc", () => {
  /*
   * ⚠ O harta goala ar fi insemnat „niciun fisier nu exista", deci REFUZ pentru fiecare comanda cu
   * poza, la fiecare pana de o clipa a bazei. `undefined` inseamna „nu se stie", si atunci se sare
   * peste verificarea asta — exact ca in browser, care oricum n-o poate face. Restul raman intregi.
   */
  const s = sursa("lib/configurators/repretuire.ts");
  assert.match(s, /if \(error\) return undefined;/);
  assert.match(sursa("lib/configurators/raspuns.ts"), /if \(!fisiere\) return;/);
});

test("⚠ comerciantul poate DESCHIDE fisierul de pe comanda", () => {
  /*
   * ⚠ Rezumatul scrie „1 fisier" — atat incape intr-un rand de cos sau de email. Dar comanda din
   * panou e ecranul dupa care se PRODUCE: fara legatura, comerciantul stie ca exista o poza si n-are
   * cum s-o vada, iar gravura pleaca dupa ce si-a inchipuit el.
   */
  const s = sursa("components/dashboard/OrderDetailClient.tsx");
  assert.match(s, /href=\{`\/api\/configurator\/fisier\/\$\{id\}`\}/);
  const r = sursa("lib/configurators/rezumat.ts");
  assert.match(r, /fisiere\?: string\[\]/, "rezumatul nu mai poarta id-urile");
});

test("⚠ id-urile citite din comanda se verifica pe forma", () => {
  /*
   * ⚠ Ele ajung intr-o ADRESA, iar instantaneul poate fi scris de o versiune veche de cod sau atins
   * dintr-o consola. Fara verificare, continutul comenzii ar fi putut compune calea.
   */
  assert.match(sursa("lib/configurators/instantaneu.ts"), /UUID\.test\(f\)/);
});

test("⚠ incarcarea citeste CATEGORIA adevarata a produsului", () => {
  /*
   * ⚠ AICI STATEA `category: null`, si rupea TACUT jumatate din modelul de aplicare.
   *
   * Un configurator legat de o CATEGORIE (`aplicaLaCategorii`) nu lasa niciun rand in
   * `configurator_produse` — rezolvitorul il gaseste numai prin numele categoriei. Cu `null`,
   * `rezolvitorul` intoarce „niciunul” din prima linie (`if (!categorie) return`), deci
   * cumparatorul primea 404 la FIECARE incercare de incarcare — pe un produs care ARATA campul,
   * fiindca pagina il deseneaza din aceeasi versiune publicata. Comerciantul ar fi cautat
   * greseala in builder, unde nu era.
   *
   * ⚠ Citirea cere SI `business_id`: pe calea prin categorie nu mai exista randul din
   * `configurator_produse` care sa lege magazinul de produs, deci fara filtrul asta oricine putea
   * numi orice pereche magazin-produs.
   */
  const s = faraComentarii(sursa(INCARCARE));
  assert.equal(s.includes("category: null"), false, "categoria pleaca inca goala catre rezolvitor");
  assert.match(s, /\.from\("products"\)[\s\S]{0,200}\.eq\("business_id", businessId\)/);
  assert.match(s, /category: produs\.category \?\? null/);
});

test("⚠ antetul de cache NU se mai numeste a doua incuietoare", () => {
  /*
   * ⚠ `Cache-Control` nu e control de acces. Depozitul R2 e public-read (`/api/img/route.ts` o
   * scrie pe fata), deci cine afla cheia ia obiectul de pe CDN indiferent ce antet am pus la
   * urcare. Singurul lucru care apara fisierul e ca CHEIA NU SE POATE COMPUNE — semnatura HMAC.
   *
   * Proba pazeste o NOTA, si asta e dinadins: o nota care promite mai multa aparare decat exista
   * e mai rea decat lipsa ei, fiindca il opreste pe urmatorul din a se mai uita.
   */
  const s = sursa(INCARCARE);
  assert.equal(s.includes("a doua incuietoare"), false, "nota falsa s-a intors");
  assert.ok(s.includes("CHEIA NU SE POATE COMPUNE"), "nota nu mai spune unde sta apararea adevarata");
});
