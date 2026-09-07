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
   * chiar lucrul de care fisierele astea au scapat.
   *
   * ⚠ S-A MUTAT PE 07.09.2026, si nu s-a slabit. Octetii nu mai trec deloc prin functie — Vercel
   * refuza cererile de peste 4,5 MB, iar platforma promitea 10 si 40 MB. Browserul ii pune de-a
   * dreptul in depozit, printr-un link semnat de noi CATRE GALEATA INCARCARILOR. Deosebirea fata de
   * `uploadToR2` ramane aceeasi: aia scrie in galeata publica si intoarce adresa publica.
   */
  const ruta = sursa("src/app/api/upload-customization/route.ts");
  assert.match(
    ruta, /linkDeIncarcarePrivata\(referinta, tip, octeti\)/,
    "incarcarea nu mai trece prin galeata privata",
  );
  assert.doesNotMatch(
    ruta, /uploadToR2\(|createPresignedPutUrl\(/,
    "incarcarea arata iar catre galeata publica",
  );
});

test("⚠ servirea citeste din galeata privata, nu din cea publica", () => {
  /*
   * ⚠ SI SERVIREA S-A MUTAT: ruta nu mai citeste octetii, ci intreaba in ce galeata sta cheia si da
   * un link semnat scurt. Vercel refuza si RASPUNSURILE de peste 4,5 MB, deci tocmai fisierul de
   * tipar de 20 MB era cel pe care comerciantul nu si-l putea descarca.
   */
  const ruta = sursa("src/app/api/customization-file/route.ts");
  assert.match(ruta, /galeataCheii\(cheie\)/, "ruta de servire nu cauta in galeata privata");
  assert.match(ruta, /linkDeCitirePrivata\(/, "ruta de servire nu da niciun link semnat");
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

test("⚠ variabila e OBLIGATORIE in productie, si fara ea nu se scrie nicaieri", () => {
  /*
   * ═══ ⚠ PROBA S-A INTORS PE 07.09.2026, DUPA CE GALEATA A FOST CREATA ═══
   *
   * Aici scria ca lipsa variabilei inseamna „ca ieri", si ca ea trebuie doar STRIGATA in jurnal:
   * o desfasurare oprita pentru o galeata care nu exista inca ar fi lasat magazinele fara vanzare
   * de produse personalizate. Purtarea aia a fost corecta exact cat a durat.
   *
   * Galeata exista acum, variabila e pusa in Vercel, si drumul a fost probat de la capat la capat:
   * un fisier urcat din formularul public a aterizat CHIAR in `edinio-uploads-privat`. De aici
   * incolo, lipsa variabilei nu mai inseamna „ca ieri" — inseamna ca pozele de familie ale
   * cumparatorilor se intorc TACUT pe un domeniu public.
   *
   * ⚠ Deci doua lucruri, si amandoua se cer: desfasurarea de productie se OPRESTE fara ea, iar
   * scrierea REFUZA sa cada pe galeata publica. Prima e ieftina si reversibila; a doua e plasa
   * pentru cazul in care cineva sterge variabila dupa o desfasurare reusita.
   */
  const cfg = sursa("next.config.ts");
  const obligatorii = cfg.slice(cfg.indexOf("const CHEI_OBLIGATORII"), cfg.indexOf("const CHEI_ASTEPTATE"));
  assert.match(obligatorii, /"R2_BUCKET_PRIVAT"/, "cheia nu mai opreste o desfasurare fara galeata privata");

  const asteptate = cfg.slice(cfg.indexOf("const CHEI_ASTEPTATE"), cfg.indexOf("function verificaCheileDeProductie"));
  assert.doesNotMatch(
    asteptate, /"R2_BUCKET_PRIVAT"/,
    "cheia e in amandoua listele: una dintre ele minte despre ce se intampla fara ea",
  );

  /*
   * ═══ ⚠ DAR O GALEATA „PRIVATA" CARE E CHIAR CEA PUBLICA OPRESTE DESFASURAREA ═══
   *
   * Cele doua cazuri nu se poarta la fel, si nu e o nepotrivire:
   *
   *   LIPSA e o aparare care inca nu exista. Purtarea fara ea e exact cea de pana acum, deci se
   *   striga si atat — o oprire ar fi lasat magazinele fara vanzare de produse personalizate.
   *
   *   PUSA GRESIT e mai rau decat lipsa: spune „gata, fisierele cumparatorilor sunt private" si nu
   *   sunt. Cine o pune se uita o data la panou, vede variabila acolo, si nu se mai intoarce — iar
   *   pozele de familie ale clientilor raman pe un domeniu public, cu convingerea ca nu sunt.
   *
   * O desfasurare oprita cu numele cheii in jurnal e ieftina si reversibila. O falsa siguranta nu
   * se vede niciodata.
   */
  assert.match(
    cfg, /if \(privat && privat === process\.env\.R2_BUCKET_NAME\?\.trim\(\)\) \{\s*\n\s*throw new Error\(/,
    "o galeata „privata” pusa pe chiar galeata publica trece de build",
  );
});

test("⚠ niciun drum de SCRIERE nu compune o adresa publica, si niciunul nu cade pe galeata publica", () => {
  /*
   * ═══ ⚠ PROBA S-A INTORS PE 07.09.2026, PE ACELASI SUBIECT ═══
   *
   * Ea cerea ca `incarcaPrivat` sa intoarca doar cheia. Functia aia a fost SCOASA: octetii nu mai
   * trec prin functie, deci n-o mai chema nimeni. Ce apara ea ramane insa adevarat, si acum trebuie
   * cerut de la drumurile care i-au luat locul.
   *
   * ⚠ NICIO ADRESA PUBLICA: `uploadToR2` intoarce una fiindca asa o cer cele doua duzini de locuri
   * care urca imagini de PRODUS. Pe drumul cumparatorilor, o adresa intoarsa ar ajunge din nou
   * intr-o comanda si intr-un email — de unde a fost scoasa cu atata truda.
   */
  const r2 = sursa("src/lib/r2.ts");
  const bucata = (nume: string) => {
    const de = r2.indexOf(`export async function ${nume}`);
    assert.ok(de > 0, `n-am gasit ${nume}`);
    return r2.slice(de, r2.indexOf("\n}", de));
  };

  for (const nume of ["linkDeIncarcarePrivata", "mutaIncarcarea", "stergeIncarcarea"]) {
    assert.doesNotMatch(bucata(nume), /PUBLIC_URL/, `${nume} compune o adresa publica`);
  }
  /* Si antetul ramane, chiar si intr-o galeata privata: un intermediar n-are voie s-o tina. */
  assert.match(
    bucata("mutaIncarcarea"), /private, no-store/,
    "s-a pierdut antetul care opreste cache-ul intermediarilor",
  );
  assert.match(
    bucata("linkDeCitirePrivata"), /ResponseCacheControl: "private, no-store"/,
    "linkul semnat lasa fisierul cumparatorului sa fie tinut pe drum",
  );

  /*
   * ═══ ⚠ `inline`, NU `attachment` — SI PROBA ASTA LIPSEA ═══
   *
   * Cand servirea a trecut pe link semnat, dispozitia a fost scrisa din greseala `attachment`. Ea
   * hotaraste ce se intampla la CLIC in panou: `inline` deschide fisierul intr-o fila noua, cum il
   * stiu comerciantii; `attachment` il descarca.
   *
   * ⚠ SI NU S-AR FI VAZUT. Miniaturile mergeau si asa (Chrome randeaza `<img>` dupa `Content-Type`,
   * nu dupa dispozitie), iar probele de atunci ceruse doar NUMELE fisierului — chiar eu scosesem
   * `inline; filename=` din ele cand am intors afirmatiile. Deosebirea s-ar fi aratat abia la
   * primul clic al unui comerciant care se astepta la altceva.
   */
  assert.match(
    bucata("linkDeCitirePrivata"), /`inline; filename=/,
    "clicul din panou descarca fisierul in loc sa-l deschida, cum facea pana acum",
  );

  /*
   * ═══ ⚠ SI SCRIEREA NU MAI CADE PE GALEATA PUBLICA ═══
   *
   * `BUCKET_PRIVAT || BUCKET` a fost purtarea corecta cat timp galeata nu exista: fara ea, o cadere
   * ar fi oprit vanzarea produselor personalizate pe toata platforma. Acum galeata exista si cheia e
   * obligatorie — deci caderea n-ar mai apara nimic, ar face doar ca o variabila stearsa din greseala
   * sa trimita TACUT pozele cumparatorilor inapoi pe un domeniu public. Un capat care refuza se
   * vede; unul care scrie in alta parte, nu.
   */
  assert.match(
    r2, /throw new Error\(\s*\n\s*"\[r2\] R2_BUCKET_PRIVAT lipseste/,
    "scrierea cade iar pe galeata publica cand variabila lipseste",
  );

  /*
   * ⚠ DAR CITIREA NU ARUNCA, si asta e perechea. Fisierele urcate inainte de mutare stau in galeata
   * veche, iar cheile lor sunt deja in comenzi: o exceptie acolo ar ascunde comerciantului chiar
   * machetele dupa care produce marfa.
   */
  assert.match(
    bucata("citestePrivat"), /if \(!incarcarileSuntPrivate\(\)\) return citesteDinGaleata\(BUCKET, key\);/,
    "citirea arunca fara variabila, in loc sa caute in galeata veche",
  );
});
