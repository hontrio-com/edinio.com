/**
 * Care factura are o comanda, si de unde se ia PDF-ul ei.
 *
 * ═══ ⚠ MUTAT AICI DIN `src/lib/emag` PE 26.08.2026 ═══
 *
 * Trendyol are nevoie de exact aceeasi socoteala: comerciantul emite prin SmartBill, Oblio sau
 * fGO, iar noi trebuie sa stim CARE factura e a comenzii si de unde se ia. Importata din
 * `emag/facturi.ts`, ar fi tras clientul eMAG cu tot cu dependintele lui in pachetul Trendyol.
 *
 * ⚠ MODUL FARA LEGATURI GRELE: nu stie de baza, de retea si de niciun furnizor. Asa poate fi
 * probat fara nimic in jur, si folosit din amandoua integrarile.
 *
 * Singura legatura e `semnaturaCheii` (`node:crypto` + o variabila de mediu), ceruta de
 * `cheiaPdfFactura`. Restul functiilor raman pure. ⚠ O proba care cheama `cheiaPdfFactura`
 * trebuie sa-si puna un secret de proba — vezi `emag/awb-propriu.test.ts`.
 */
import { semnaturaCheii } from "@/lib/utils/cheie-neghicibila";

export interface Factura {
  furnizor: "smartbill" | "oblio" | "fgo";
  /** Seria si numarul, lipite: „EDN1234". */
  numar: string;
  /** Adresa de unde se aduce PDF-ul, cu acreditarile comerciantului. */
  url: string;
}

/**
 * Care factura are comanda.
 *
 * ⚠ PUR SI EXPORTAT. Ordinea furnizorilor e aceeasi ca in `invoice-auto.actions.ts`; o comanda
 * nu poate avea doua facturi, dar daca ar avea, se ia PRIMA gasita — nu se incarca amandoua la
 * marketplace, fiindca acolo ar aparea ca doua documente fiscale pentru aceeasi comanda.
 *
 * ⚠ SE CER AMANDOUA, si numarul si adresa. Un numar fara adresa inseamna ca factura exista dar
 * n-avem de unde-i lua PDF-ul — iar o urcare pornita asa ar esua abia la aducere, dupa ce si-a
 * consumat locul in registru.
 */
export function facturaComenzii(o: {
  smartbill_invoice_number?: string | null; smartbill_invoice_series?: string | null; smartbill_invoice_url?: string | null;
  oblio_invoice_number?: string | null; oblio_invoice_series?: string | null; oblio_invoice_link?: string | null;
  fgo_invoice_number?: string | null; fgo_invoice_series?: string | null; fgo_invoice_link?: string | null;
}): Factura | null {
  const numar = (serie?: string | null, nr?: string | null) =>
    [(serie ?? "").trim(), (nr ?? "").trim()].filter(Boolean).join("");

  if (o.smartbill_invoice_number && o.smartbill_invoice_url) {
    return {
      furnizor: "smartbill",
      numar: numar(o.smartbill_invoice_series, o.smartbill_invoice_number),
      url: o.smartbill_invoice_url,
    };
  }
  if (o.oblio_invoice_number && o.oblio_invoice_link) {
    return { furnizor: "oblio", numar: numar(o.oblio_invoice_series, o.oblio_invoice_number), url: o.oblio_invoice_link };
  }
  if (o.fgo_invoice_number && o.fgo_invoice_link) {
    return { furnizor: "fgo", numar: numar(o.fgo_invoice_series, o.fgo_invoice_number), url: o.fgo_invoice_link };
  }
  return null;
}

/**
 * Octetii adusi chiar SUNT un PDF?
 *
 * ═══ ⚠⚠ DE CE EXISTA, SI DE CE AICI ═══
 *
 * Adresa documentului vine de la casa de facturare si se aduce cu `fetch(f.url)` FARA nicio
 * acreditare, fiindca marketplace-ul trebuie sa poata lua fisierul. Daca adresa aceea se dovedeste
 * a fi una care CERE autentificare, raspunsul nu e o eroare: e `200` cu pagina de login. Iar
 * `uploadToR2(..., "application/pdf")` o urca mai departe la eMAG sau Trendyol ca document fiscal.
 *
 * ⚠ Nu e o grija inchipuita. La SmartBill raspunsul are DOUA adrese: `documentViewUrl`, publica,
 * si `documentUrl`, care „cere autentificare". Pe 16.09.2026 era gata sa se pastreze cea gresita.
 * La Oblio, `link` are forma unei adrese cu jeton (`?it=<32 hex>`), deci pare publica, dar
 * documentatia lor NU spune, iar zero facturi emise inseamna ca nimeni n-a probat-o vreodata.
 *
 * Deci nu se mai raspunde la intrebarea „e publica adresa?" pentru fiecare casa in parte. Se
 * verifica CE A VENIT, la toate trei deodata: un PDF incepe cu `%PDF-`, si nimic altceva nu incepe
 * asa. O pagina de login, un HTML de eroare sau un corp gol cad toate aici.
 *
 * ⚠ Se verifica DOAR antetul, nu tot fisierul: e singurul lucru pe care standardul il garanteaza,
 * si nu vrem sa refuzam un PDF bun fiindca e neobisnuit inauntru.
 */
export function esteChiarPdf(octeti: ArrayBuffer): boolean {
  if (octeti.byteLength < 5) return false;
  const cap = new Uint8Array(octeti.slice(0, 5));
  /* `%PDF-` */
  return cap[0] === 0x25 && cap[1] === 0x50 && cap[2] === 0x44 && cap[3] === 0x46 && cap[4] === 0x2d;
}

/** Ce i se spune omului cand ce a venit nu e un document. */
export const NU_E_PDF =
  "Ce s-a descarcat de la casa de facturare nu e un PDF (probabil o pagina de autentificare sau o "
  + "eroare). Factura NU s-a urcat la marketplace, ca sa nu ajunga acolo un fisier care nu e document "
  + "fiscal. Verifica in panou ca linkul facturii se deschide fara sa fii logat.";

/**
 * Gazdele de TEST ale caselor de facturare.
 *
 * ⚠ Lista contine DOAR ce am masurat sau ce scrie in codul nostru, nu ce am banui. Azi, una
 * singura: fGO are `api-testuat.fgo.ro` drept `TEST_BASE` (`src/lib/fgo.ts`), iar documentele emise
 * acolo intorc linkuri pe `testuat.fgo.ro`. SmartBill si Oblio n-au comutator de sandbox in
 * configurarea noastra, deci n-au ce cauta aici; puse pe ghicite, ar taia documente bune.
 */
export const GAZDE_DE_TEST = ["testuat.fgo.ro"];

/**
 * Documentul vine din mediul de TEST al casei de facturare?
 *
 * ═══ ⚠⚠ DE CE CONTEAZA, SI DE CE NU-L PRINDE `esteChiarPdf` ═══
 *
 * Un document de sandbox e un PDF perfect valid. Trece de orice verificare de format, arata ca o
 * factura, si are numar si serie. Nu e insa un document FISCAL.
 *
 * ⚠ Masurat pe 16.09.2026: magazinul `itp-blk` are `fgo_config.sandbox = true` si a emis TREI
 * facturi, toate cu link pe `testuat.fgo.ro`, apoi le-a stornat pe toate trei. Pe randul comenzii
 * ele arata exact ca niste facturi adevarate: acelasi `fgo_invoice_number`, aceeasi serie, acelasi
 * fel de link. Nimic, nicaieri, nu spunea ca sunt de test.
 *
 * Pericolul nu e ecranul, e urcarea la marketplace: `facturaComenzii` le-ar fi dat drept factura
 * comenzii, iar la eMAG sau Trendyol ar fi ajuns un document de TEST pe post de document fiscal.
 *
 * ⚠ Se citeste din LINK, nu din configurare: configurarea spune ce e ACUM, iar documentul a fost
 * emis candva. Un comerciant care iese din modul de testare nu preface retroactiv in documente
 * fiscale facturile emise cat timp era in el.
 */
export function eDocumentDeTest(url: string): boolean {
  const u = (url ?? "").toLowerCase();
  return GAZDE_DE_TEST.some((g) => u.includes(g));
}

/** Ce i se spune omului cand documentul comenzii e unul de proba. */
export const DOCUMENT_DE_TEST =
  "Factura comenzii a fost emisa in modul de TESTARE al casei de facturare, deci nu e un document "
  + "fiscal. NU s-a urcat la marketplace. Opreste modul de testare din configurare si emite factura "
  + "din nou.";

/**
 * Cheia sub care sta PDF-ul rehostat.
 *
 * ⚠ DE NEGHICIT, SI STABILA. De neghicit fiindca adresa e singura paza a unui document cu
 * datele cumparatorului: marketplace-ul trebuie sa poata veni sa-l ia, deci nu exista
 * autentificare la mijloc. Stabila fiindca a doua incercare, dupa o cadere de retea, trebuie sa
 * scrie in ACELASI loc — altfel fiecare reincercare ar lasa in urma inca o copie a facturii.
 *
 * `orderId` e un UUID, deci are deja 122 de biti de nedeterminare. Numarul facturii intra si el:
 * dupa un storno si o reemitere, documentul e ALTUL si trebuie sa aiba alta adresa.
 *
 * ⚠ SI O SEMNATURA, din 06.09.2026.
 *
 * Argumentul de mai sus tine impotriva CAUTARII oarbe — nimeni nu ghiceste un UUID. Nu tinea
 * insa impotriva cuiva care ARE deja datele comenzii: comerciantul le are pe ale lui, si un
 * fost angajat la fel, iar numarul facturii e de obicei consecutiv. Cu ele, adresa se putea
 * RECONSTRUI, iar documentul se lua fara nicio autentificare. Etichetele GLS rezolvasera deja
 * exact asta (`lib/gls/eticheta.ts`); facturile ramasesera in urma.
 *
 * ⚠ Fisierele urcate INAINTE raman unde sunt, si asa trebuie: adresa lor e deja la
 * marketplace, iar cheia nu se recompune niciodata ca sa le citim noi — se compune o
 * singura data, la urcare, si pleaca odata cu atasamentul.
 */
export function cheiaPdfFactura(
  folder: string, businessId: string, orderId: string, numarFactura: string,
): string {
  const curat = numarFactura.replace(/[^A-Za-z0-9._-]/g, "");
  const semnatura = semnaturaCheii(`factura:${folder}:${businessId}:${orderId}:${curat}`);
  return `${folder}/${businessId}/${orderId}-${curat}-${semnatura}.pdf`;
}
