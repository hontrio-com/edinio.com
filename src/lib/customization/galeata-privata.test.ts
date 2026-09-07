import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";

/**
 * FISIERELE CUMPARATORILOR NU MAI STAU IN GALEATA PUBLICA.
 *
 * ═══ ⚠ ULTIMA GAURA DIN LUCRAREA DE PERSONALIZARE ═══
 *
 * Fisierele urcate din formularul public — poza de nunta, poza copilului, macheta de tipar — au
 * capatat pe rand, in doua zile: o cheie cu semnatura HMAC, o ruta de servire care cere sesiune si
 * proprietatea magazinului, cerinta ca fisierul sa fie chiar pe comanda ceruta, antetul
 * `private, no-store`, si refuzul din `/api/img`.
 *
 * ⚠ SI TOTUSI OCTETII STATEAU IN GALEATA PUBLICA. Cine are cheia INTREAGA — iar cheia o primeste
 * chiar clientul care a urcat fisierul — o putea lipi dupa domeniul public si ocolea toate cele
 * patru porti. Chiar comentariul din `fisiere-private.ts` o spunea: neghicibil nu inseamna privat.
 *
 * Probele de aici masoara ce nu se poate masura din afara: ca scrierea merge in alta galeata, ca
 * citirea o cauta acolo, si ca fisierele vechi tot se gasesc.
 */

const sursa = (r: string) => readFileSync(path.resolve(process.cwd(), r), "utf8").replace(/\r\n/g, "\n");

test("⚠ incarcarea NU mai scrie prin `uploadToR2`", () => {
  /*
   * ⚠ DEOSEBIREA CARE CONTEAZA: `uploadToR2` scrie in galeata publica SI intoarce adresa publica —
   * chiar lucrul de care fisierele astea au scapat. `incarcaPrivat` scrie in cealalta galeata si
   * intoarce doar cheia.
   */
  const ruta = sursa("src/app/api/upload-customization/route.ts");
  assert.match(ruta, /incarcaPrivat\(buffer, key, detected\)/, "incarcarea nu mai trece prin galeata privata");
  assert.doesNotMatch(
    ruta, /uploadToR2\(/,
    "incarcarea inca scrie prin `uploadToR2`, adica in galeata publica",
  );
});

test("⚠ servirea citeste din galeata privata, nu din cea publica", () => {
  const ruta = sursa("src/app/api/customization-file/route.ts");
  assert.match(ruta, /citestePrivat\(cheie\)/, "ruta de servire nu cauta in galeata privata");
  assert.doesNotMatch(ruta, /citesteDinR2\(/, "ruta de servire citeste inca din galeata publica");
});

test("⚠ citirea CADE INAPOI pe galeata veche, altfel comenzile de saptamana trecuta se rup", () => {
  /*
   * ⚠ CADEREA INAPOI E MIGRAREA, nu o slabiciune. Fisierele urcate inainte de galeata privata stau
   * in cea veche, iar cheile lor sunt DEJA scrise in comenzi. Citite doar din cea noua,
   * comerciantul ar fi deschis o comanda de saptamana trecuta si n-ar mai fi gasit macheta dupa
   * care trebuie sa produca marfa.
   *
   * ⚠ Si nu largeste nimic: caderea e la CITIRE, pe ruta care cere deja sesiune, proprietatea
   * magazinului si ca fisierul sa fie chiar pe comanda ceruta.
   */
  const r2 = sursa("src/lib/r2.ts");
  const corp = r2.slice(r2.indexOf("export async function citestePrivat"));
  const capat = corp.indexOf("\n}");
  const functia = capat === -1 ? corp : corp.slice(0, capat);

  assert.match(functia, /galeataIncarcarilor\(\)/, "citirea nu incearca intai galeata privata");
  assert.match(
    functia, /citesteDinGaleata\(BUCKET, key\)/,
    "citirea nu mai cade inapoi pe galeata veche: comenzile de dinainte isi pierd fisierele",
  );
  /* ⚠ Si NUMAI pe lipsa: o eroare de retea nu trebuie sa trimita cererea in a doua galeata. */
  assert.match(functia, /principala\.fel !== "lipsa"/, "caderea inapoi se face si pe eroare, nu doar pe lipsa");
});

test("⚠ cronul curata AMANDOUA galetile, si sterge din cea potrivita", () => {
  /*
   * ⚠ FARA ASTA, tocmai fisierele din galeata PUBLICA ar fi ramas acolo pe veci — adica exact cele
   * expuse. Retentia ar fi curatat doar ce era deja in siguranta.
   *
   * ⚠ SI GALEATA VINE CU OBIECTUL, nu se ghiceste: aceeasi cheie poate exista in amandoua in
   * timpul migrarii, iar stearsa din cea gresita ar fi iesit „stearsa" fara sa dispara nimic. Cronul
   * ar fi raportat, in fiecare zi, o curatenie care nu s-a facut.
   */
  const cron = sursa("src/app/api/cron/curata-fisiere/route.ts");
  assert.match(cron, /listeazaIncarcari\(PREFIX_INCARCARI, MAX_OBIECTE_LISTATE\)/, "cronul listeaza o singura galeata");
  assert.match(cron, /stergeIncarcari\(/, "cronul sterge fara sa stie din ce galeata");
  assert.match(cron, /galeataCheii/, "cronul nu duce galeata mai departe pana la stergere");

  const r2 = sursa("src/lib/r2.ts");
  assert.match(r2, /const galeti = incarcarileSuntPrivate\(\) \? \[galeataIncarcarilor\(\), BUCKET\] : \[BUCKET\]/,
    "listarea nu mai trece prin amandoua galetile");
});

test("⚠ fara variabila, purtarea e EXACT cea de pana acum", () => {
  /*
   * ⚠ HOTARARE, NU SCAPARE. O desfasurare care refuza incarcarile pana cand cineva pune o variabila
   * ar fi fost o paguba mai mare decat cea pe care o apara: magazinele n-ar mai fi putut vinde
   * produse personalizate deloc.
   *
   * Deci lipsa ei inseamna „ca ieri", si atat. Iar ca sa nu ramana asa in tacere, cheia e trecuta
   * in `CHEI_ASTEPTATE` din `next.config.ts`, care STRIGA in jurnalul de build la fiecare
   * desfasurare de productie.
   */
  const r2 = sursa("src/lib/r2.ts");
  assert.match(r2, /return BUCKET_PRIVAT \|\| BUCKET;/, "fara variabila nu se mai cade pe galeata de pana acum");

  const cfg = sursa("next.config.ts");
  const lista = cfg.slice(cfg.indexOf("const CHEI_ASTEPTATE"), cfg.indexOf("function verificaCheileDeProductie"));
  assert.match(lista, /"R2_BUCKET_PRIVAT"/, "lipsa cheii nu se mai striga la build");

  /*
   * ⚠ SI NU E IN `CHEI_OBLIGATORII`: acolo, o desfasurare de productie s-ar OPRI. Se muta abia dupa
   * ce galeata exista si variabila e pusa — pana atunci, oprirea ar fi paguba, nu paza.
   */
  const obligatorii = cfg.slice(cfg.indexOf("const CHEI_OBLIGATORII"), cfg.indexOf("const CHEI_ASTEPTATE"));
  assert.doesNotMatch(obligatorii, /R2_BUCKET_PRIVAT/, "cheia opreste desfasurarea inainte sa existe galeata");
});

test("⚠ `incarcaPrivat` nu intoarce nicio adresa", () => {
  /*
   * Perechea negativa a intregii lucrari: `uploadToR2` intoarce adresa publica fiindca asa o cer
   * cele doua duzini de locuri care urca imagini de produs. Aici, o adresa intoarsa ar fi putut
   * ajunge din nou intr-o comanda sau intr-un email — de unde a fost scoasa cu atata truda.
   */
  const r2 = sursa("src/lib/r2.ts");
  const corp = r2.slice(r2.indexOf("export async function incarcaPrivat"));
  const functia = corp.slice(0, corp.indexOf("\n}"));
  assert.match(functia, /return key;/, "`incarcaPrivat` nu mai intoarce cheia");
  assert.doesNotMatch(functia, /PUBLIC_URL/, "`incarcaPrivat` compune iar o adresa publica");
  /* Si antetul ramane, chiar si intr-o galeata privata: un intermediar n-are voie s-o tina. */
  assert.match(functia, /private, no-store/, "s-a pierdut antetul care opreste cache-ul intermediarilor");
});
