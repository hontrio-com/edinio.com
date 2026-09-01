import { strict as assert } from "node:assert";
import { test } from "node:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";

/*
  ═══════════════════════════════════════════════════════════════════════════
  GESTIUNEA, PENTRU CONTURILE OBLIO CU STOCURI
  ═══════════════════════════════════════════════════════════════════════════

  ⚠ DEFECTUL A TRAIT TREI SAPTAMANI SI N-A DAT NICIUN SEMN. Un cont Oblio cu
  stocuri pornite refuza documentul INTREG daca o linie stocabila n-are
  `management`. Mesajul lor: „Produsul X nu are Gestiune (parametrul
  `management`)".

  Masurat pe VetDepo (business 635bc524, magazinul `okxi`), 01.09.2026 — coloana
  `ultima_eroare` din `operatii_externe`, copiata cuvant cu cuvant, toate
  incercarile de la conectare incoace:

      11.08  ORD-MR1XQAAZ-VQV  „nu are stoc suficient. Actualizeaza stocul"
      25.08  TY-4080251858     „nu are stoc suficient. Actualizeaza stocul"
      01.09  TY-4103280908     „nu are Gestiune (parametrul `management`)"
      01.09  TY-4103280908     „nu are Gestiune (parametrul `management`)"

  ⚠ PRIMA VARIANTA A ACESTEI NOTE SPUNEA „PATRU DIN PATRU — nu are Gestiune".
  Fals. Doua sunt gestiune, doua sunt stoc. Rezumasem din memorie in loc sa
  recitesc coloana. Probele de mai jos pazesc gestiunea — adica DOUA din patru.
  Refuzul pe stoc ramane deschis; vezi `OblioInvoiceData.useStock`.

  Zero facturi emise vreodata — si nu doar aici: pe toate cele trei conturi cu
  Oblio de pe platforma, zero.

  ⚠ SI DE CE N-A VAZUT NIMENI: integrarea aparea sanatoasa. Acreditarile treceau,
  nomenclatorul de firme se citea, seria se citea, formularul se salva cu bine.
  Singurul loc unde se vedea adevarul era lista de operatii externe — unde nu se
  uita nimeni pana nu se plange clientul.

  Documentatia lor (oblio.eu/api) spune despre `management` ca „este valabil doar
  dupa activarea stocurilor pentru produse stocabile" si NU il marcheaza
  obligatoriu — adevarat pentru conturile fara stocuri, inselator pentru cele cu.
*/

const RAD = process.cwd();
const citeste = (cale: string) => readFileSync(join(RAD, cale), "utf8").replace(/\r\n/g, "\n");

const faraComentarii = (s: string) =>
  s.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\{\/\*[\s\S]*?\*\/\}/g, "");

const CLIENT = citeste("src/lib/oblio.ts");
const ACTIUNI = citeste("src/lib/actions/oblio.actions.ts");
const FORMULAR = citeste("src/components/dashboard/OblioConfigClient.tsx");

test("clientul stie sa citeasca nomenclatorul de gestiuni", () => {
  const cod = faraComentarii(CLIENT);
  assert.match(cod, /export async function getManagement\(/, "`getManagement` a disparut din client");
  assert.match(
    cod,
    /["']\/api\/nomenclature\/management["']/,
    "calea nomenclatorului nu mai e cea din documentatia Oblio",
  );
  assert.match(cod, /\{ cif \}/, "nomenclatorul de gestiuni cere `cif` — vezi documentatia lor");
});

test("gestiunea ajunge pe liniile de MARFA, si numai pe ele", () => {
  /*
    ⚠ CELE DOUA JUMATATI CONTEAZA LA FEL.

    Fara `gestiune &&` — se trimite `management: undefined` pe conturile fara
    stocuri, unde campul n-are inteles.

    Fara `!esteServiciu` — transportul, extraoptiunile si ajustarea de rotunjire
    ar pleca cu o gestiune. Oblio le ignora pentru servicii, deci n-ar strica
    nimic vizibil — dar ar ramane in cod o afirmatie falsa despre ce e linia aia,
    si cineva ar construi peste ea.
  */
  const cod = faraComentarii(ACTIUNI);
  assert.match(
    cod,
    /gestiune && !esteServiciu \? \{ management: gestiune \}/,
    "linia de produs nu mai pune `management` doar pe marfa. " +
      "Fara conditie, se trimite pe servicii sau pe conturi fara stocuri.",
  );
  assert.match(cod, /config\.management\?\.trim\(\)/, "gestiunea nu mai vine din configuratie");
});

test("formularul FOLOSESTE hotararile probate, nu si le rescrie pe ale lui", () => {
  /*
    ⚠ PROBA ASTA S-A SCHIMBAT DUPA CE A FOST PUSA LA INCERCARE, SI E BINE SA SE
    STIE DE CE. In forma veche cerea sa existe textul `gestiuni.length > 0 &&
    !management` in componenta. Confruntata cu defectul, a trecut VERDE pentru:

        - `return;`-ul de dupa `toast.error` sters, deci salvarea continua
        - conditia inconjurata cu `if (false && ...)`
        - campul randat cu `hidden`
        - lista luata din `accountData.vatRates` in loc de `.management`

    Adica pazea forma, nu regula. Regula s-a mutat in `src/lib/oblio-stare.ts`, si
    acolo e probata prin CHEMARE, in `oblio-stare.test.ts`: noua mutatii, noua
    prinse. Aici a ramas doar ce nu se poate chema fara React — legatura.

    ⚠ CE PAZESTE DECI RANDUL DE MAI JOS: ca legatura exista. Nu ca ea opreste ceva
    — aia se dovedeste in cealalta plasa.
  */
  const cod = faraComentarii(FORMULAR);
  assert.match(cod, /from "@\/lib\/oblio-stare"/, "componenta nu mai foloseste hotararile comune");
  assert.match(cod, /stareOblio\(\{/, "starea nu mai vine din `stareOblio`");
  /*
    ⚠ CELE DOUA TREBUIE SA FIE ACELASI RAND, NU DOUA RANDURI CARE EXISTA AMANDOUA.
    Prima forma a randului asta era `assert.match(cod, /return;/)` — care se
    potriveste cu ORICE `return;` din tot fisierul, deci trecea verde si cu
    oprirea stearsa. Exact greseala pe care proba asta o povesteste mai sus, si
    am facut-o din nou, la trei randuri sub ea. Acum `return;`-ul se cere INAUNTRU.
  */
  assert.match(
    cod,
    /if \(!poateSalva\) \{[\s\S]{0,300}?return;[\s\S]{0,40}?\}/,
    "salvarea nu se mai opreste cand `poateSalva` e fals",
  );
  assert.match(cod, /management \? \{ management \}/, "gestiunea nu mai ajunge in configuratia salvata");
});

test("componenta nu-si rescrie regula pe langa cea probata", () => {
  /*
    ⚠ IMPOTRIVA DERIVEI. Daca cineva pune la loc un `gestiuni.length > 0` in
    componenta, ajung doua reguli care spun acelasi lucru — si care se pot
    desparti fara ca nimic sa cada. Regula are voie sa existe intr-un singur loc.
  */
  const cod = faraComentarii(FORMULAR);
  assert.doesNotMatch(
    cod,
    /gestiuni\.length\s*[><=]/,
    "regula despre gestiuni s-a intors in componenta, pe langa `gestiuneaECeruta`",
  );
});

test("campul se arata DOAR cand contul are stocuri", () => {
  /*
    Un camp obligatoriu, gol, pe care omul n-are cum sa-l completeze — fiindca
    firma lui n-are gestiuni — ar fi mai rau decat lipsa lui. Conturile fara
    stocuri trebuie sa vada exact formularul de dinainte.

    ⚠ Cele trei intelesuri ale listei (nestiut / fara stocuri / cu stocuri) sunt
    probate prin chemare in `oblio-stare.test.ts`. Aici doar ca randarea le
    intreaba pe ele.
  */
  const cod = faraComentarii(FORMULAR);
  assert.match(cod, /\{gestiuneaECeruta\(gestiuni\) && \(/, "campul nu mai intreaba `gestiuneaECeruta`");
});

test("pagina cere nomenclatorul si singura, la deschidere", () => {
  /*
    ⚠ FARA ASTA TOATA REPARATIA E MOARTA, si chiar a fost: campul era desfasurat
    in productie si VetDepo tot a salvat fara gestiune, fiindca `accountData` se
    umplea DOAR la apasarea butonului „Testeaza si incarca date". Cine deschidea
    pagina si apasa direct Salveaza nu vedea campul si nu declansa validarea.
  */
  const cod = faraComentarii(FORMULAR);
  assert.match(cod, /useEffect\(/, "nu se mai cere nimic la deschiderea paginii");
  assert.match(
    cod,
    /useEffect\([\s\S]{0,600}?loadOblioSeriesForCif\(/,
    "efectul de la montare nu mai cere nomenclatorul",
  );
});

test("serverul pastreaza gestiunea chiar daca browserul n-o trimite", () => {
  /*
    Plasa care nu poate fi ocolita din browser. Purtarea ei e probata prin chemare
    in `oblio-stare.test.ts`; aici doar ca salvarea trece prin ea.
  */
  const cod = faraComentarii(ACTIUNI);
  assert.match(cod, /pastreazaGestiunea\(configSecrete, /, "salvarea nu mai trece prin `pastreazaGestiunea`");
});

test("nomenclatorul de gestiuni nu are voie sa pice pasul de conectare", () => {
  /*
    ⚠ MASURA DE PRUDENTA, NU DE STIL. Cele trei nomenclatoare pleaca in acelasi
    `Promise.all`. Fara `catch`, un refuz pe gestiuni — un plan Oblio care nu-l
    expune, o schimbare la ei — ar lasa omul si fara serii, si fara cote, adica
    fara sa poata configura NIMIC, din cauza unui camp care poate nici nu i se
    aplica.
  */
  const cod = faraComentarii(ACTIUNI);
  const cuCatch = [...cod.matchAll(/getManagement\([^)]*\)\.catch\(/g)].length;
  const total = [...cod.matchAll(/getManagement\(/g)].length;
  assert.equal(
    cuCatch,
    total,
    `${total - cuCatch} din ${total} apeluri la \`getManagement\` n-au \`catch\`. ` +
      "Un refuz acolo ar rupe tot pasul de conectare.",
  );
});

test("martor: proba chiar citeste fisierele adevarate", () => {
  /*
    Fara rândul asta, toate cele de sus ar fi verzi daca `citeste()` ar intoarce
    text gol sau alt fisier. Se cere ca fiecare sursa sa contina ceva ce stim
    sigur ca e in ea, dinainte de schimbarea asta.
  */
  assert.match(CLIENT, /oblio\.eu/, "`oblio.ts` nu pare fisierul clientului Oblio");
  assert.match(ACTIUNI, /buildProducts/, "`oblio.actions.ts` nu pare fisierul cu actiunile");
  assert.match(FORMULAR, /Serie factura/, "`OblioConfigClient.tsx` nu pare formularul");
});
