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

test("formularul nu lasa un cont cu stocuri sa se salveze fara gestiune", () => {
  /*
    ⚠ ASTA E PAZA CARE LIPSEA. Pana acum formularul se salva multumit, iar
    refuzul aparea abia la prima comanda — intr-un loc pe care nu-l vede nimeni.
    Acum omul afla in clipa in care apasa Salveaza.
  */
  const cod = faraComentarii(FORMULAR);
  assert.match(
    cod,
    /gestiuni\.length > 0 && !management/,
    "s-a pierdut oprirea salvarii cand contul are gestiuni si nu s-a ales niciuna",
  );
  assert.match(
    cod,
    /management \? \{ management \}/,
    "gestiunea nu mai ajunge in configuratia salvata",
  );
});

test("campul se arata DOAR cand contul are stocuri", () => {
  /*
    Un camp obligatoriu, gol, pe care omul n-are cum sa-l completeze — fiindca
    firma lui n-are gestiuni — ar fi mai rau decat lipsa lui. Conturile fara
    stocuri trebuie sa vada exact formularul de dinainte.
  */
  const cod = faraComentarii(FORMULAR);
  assert.match(cod, /\{gestiuni\.length > 0 && \(/, "campul de gestiune nu mai e ascuns pentru conturile fara stocuri");
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
