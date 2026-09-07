import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { numeleFisierului } from "./adresa";

/**
 * Panoul comerciantului si fisierele incarcate de cumparator.
 *
 * ═══ ⚠ DE CE E NEVOIE DE PROBA ASTA ═══
 *
 * De cand emailul nu mai poarta nici nume, nici legaturi („2 fisiere incarcate”), PANOUL E
 * SINGURUL LOC in care un fisier al clientului mai poate fi identificat si deschis. Deci tot ce
 * tine legatura aia in picioare trebuie sa aiba o proba, iar pana acum n-avea NICIUNA: ruta
 * `/api/customization-file` se proba fata de ea insasi (isi compunea singura adresa in
 * `poarta-fisierului.test.ts`), si nimic nu se uita la singurul ei apelant.
 *
 * ⚠ O POARTA PE CARE N-O CHEAMA NIMENI APARA EXACT CAT UNA CARE NU EXISTA (vezi `comanda.test.ts`).
 * Aceeasi disciplina, de partea cealalta: un apelant pe care nu-l verifica nimeni poate ramane pe
 * numele vechi al unui parametru — sau poate cadea inapoi pe `href={url}` la o rezolvare de
 * conflict — si TOATE probele raman verzi, iar comerciantul primeste 404 pe fiecare fisier.
 *
 * ⚠ PROBELE PE SURSA, fiindca proiectul n-are jsdom: acelasi tipar ca in `fisier.test.ts`. Ce se
 * poate proba ca PURTARE se probeaza ca purtare — `adresaFisierului` se scoate din sursa si se
 * RULEAZA, si numele fisierului se cere chiar regulii comune.
 */

const PANOU = "src/components/dashboard/OrderDetailClient.tsx";
const RUTA = "src/app/api/customization-file/route.ts";

const sursa = (r: string) =>
  readFileSync(path.resolve(process.cwd(), r), "utf8").replace(/\r\n/g, "\n");

const panou = sursa(PANOU);

/**
 * Sursa panoului fara comentarii.
 *
 * ⚠ UN COMENTARIU CARE POVESTESTE UN DEFECT NU E DEFECTUL. Nota lasata in locul copiei sterse
 * scrie chiar sirul `new URL(url).pathname`, ca sa se stie de ce nu se mai citeste asa — iar o
 * proba care cauta pe textul brut ar fi picat pe propria explicatie. Se taie doar comentariile de
 * bloc si randurile care INCEP cu `//`, ca un `https://` dintr-un sir sa ramana intreg.
 */
const codul = panou.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");

const BIZ = "11111111-1111-4111-8111-111111111111";
const COMANDA = "22222222-2222-4222-8222-222222222222";
const cheia = (nume: string) => `products/customizations/${BIZ}/${nume}`;
const CHEIE_JPG = cheia("aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee-286c3c198813fbe4a2a96737.jpg");
const CHEIE_PDF = cheia("aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee-9dc7928fd4d9cf1a541e2330.pdf");

/**
 * Scoate o functie de nivel de fisier din sursa panoului si o face rulabila.
 *
 * ⚠ SE RULEAZA CHIAR CODUL DIN PANOU, nu o copie a lui rescrisa in proba. O copie ar fi inghetat
 * ce am scris EU aici, nu ce randeaza ecranul — exact felul de proba care a stat verde peste
 * `new URL()` pe o cheie. Panoul e o componenta „use client” plina de React si de iconite, deci
 * nu se poate importa dintr-un test de Node: se taie bucata si i se scot adnotarile de tip.
 */
function functiaDinPanou(nume: string): (...a: string[]) => string {
  const start = panou.indexOf(`function ${nume}(`);
  assert.notEqual(start, -1, `${nume} nu mai exista in ${PANOU}`);
  const stop = panou.indexOf("\n}\n", start);
  assert.notEqual(stop, -1, `nu gasesc capatul lui ${nume}`);
  const js = panou.slice(start, stop + 2).replace(/: string/g, "");
  return new Function(`return (${js})`)() as (...a: string[]) => string;
}

/**
 * Cele doua locuri in care panoul deseneaza cate un fisier al cumparatorului, luate ca BLOCURI.
 *
 * ⚠ FIECARE BUCLA CU BUCATA EI DE SURSA, altfel proba se indeplineste pe alt rand decat cel
 * despre care vorbeste: lista de fisiere ar putea pierde numele si totusi sa treaca, fiindca
 * randarea imaginilor de mai jos inca il scrie. Blocul se taie la urmatoarea bucla sau la
 * urmatoarea ramura `field.type ===`.
 */
function randariDeFisier(): { indice: string; bloc: string }[] {
  return [...codul.matchAll(/\.map\(\(url, ([A-Za-z0-9_]+)\) =>/g)].map((m) => {
    const start = m.index;
    const dupa = codul.slice(start + 1);
    const capete = [dupa.indexOf(".map((url,"), dupa.indexOf("field.type ===")].filter((n) => n >= 0);
    const stop = capete.length > 0 ? start + 1 + Math.min(...capete) : codul.length;
    return { indice: m[1], bloc: codul.slice(start, stop) };
  });
}

test("⚠ panoul NU-si mai scrie singur numele fisierului: il ia din regula comuna", () => {
  /*
   * Panoul avea o copie proprie, pe `new URL(url).pathname`. Valoarea din comanda e o CHEIE
   * relativa, deci `new URL` arunca la fiecare apel si FIECARE fisier iesea „Fisierul N”, fara
   * terminatie: un atelier de tipar vedea trei randuri identice pentru doua machete si o poza.
   */
  assert.match(
    codul,
    /import \{[^}]*\bnumeleFisierului\b[^}]*\} from "@\/lib\/customization\/adresa";/,
    "panoul nu mai importa regula comuna a numelui",
  );
  /* ⚠ Intai se dovedeste ca taierea comentariilor n-a mancat si codul, altfel ce urmeaza trece degeaba. */
  assert.match(codul, /function adresaFisierului\(/, "curatarea de comentarii a mancat codul");
  assert.equal(
    (codul.match(/adresaFisierului\(url, order\.business_id, order\.id\)/g) ?? []).length,
    (panou.match(/adresaFisierului\(url, order\.business_id, order\.id\)/g) ?? []).length,
    "curatarea de comentarii a mancat randari",
  );

  assert.doesNotMatch(codul, /function numeleFisierului\b/, "a reaparut copia locala a regulii");
  assert.doesNotMatch(codul, /new URL\(url\)/, "s-a intors citirea prin `new URL` pe o cheie");

  /* Si regula insasi, ca purtare: pe chei, nu pe adrese. Terminatia e ce deosebeste randurile. */
  assert.equal(numeleFisierului(CHEIE_JPG, 0), "Fisierul 1.jpg");
  assert.equal(numeleFisierului(CHEIE_PDF, 1), "Fisierul 2.pdf");
  /* ⚠ Perechea care face proba sa insemne ceva: fara terminatie randurile ar fi identice. */
  assert.notEqual(numeleFisierului(CHEIE_JPG, 0), numeleFisierului(CHEIE_PDF, 0));
});

test("⚠ numele scris pe ecran vine din regula comuna SI poarta pozitia randului", () => {
  /*
   * ⚠ CE APARA: cele doua feluri in care defectul reparat se poate intoarce cu suita verde, si
   * amandoua au fost masurate ca trec peste probele de mai sus.
   *
   * (1) POZITIA PIERDUTA LA APEL — `numeleFisierului(url, 0)` in loc de indicele buclei.
   *     Tipografia vede iar trei randuri IDENTICE, „Fisierul 1.pdf” de trei ori, si pe deasupra
   *     ele nu se mai potrivesc cu numele sub care se salveaza fisierul: ruta de servire scrie
   *     `pozitie: i + 1` peste ACELASI sir de valori (`customization-file/route.ts`), deci
   *     „Fisierul 2.pdf” din panou e chiar fisierul 2 de pe disc. Nimic nu apara potrivirea asta.
   * (2) NUMELE CAZUT INAPOI PE VALOAREA BRUTA — `{numeleFisierului(url, fiI)}` -> `{url}`.
   *     Comerciantul citeste 65 de caractere de cheie in locul unui nume; proba de mai jos
   *     pazeste doar `href=`/`src=`, nu si textul dinauntrul legaturii.
   *
   * Proba de deasupra afirma regula IZOLAT si prezenta importului; niciuna nu cerea ca panoul sa
   * TREACA MAI DEPARTE indicele buclei. Aici se cere pe blocuri: in fiecare `.map((url, i) => …)`
   * numele se scrie, si se scrie cu `i`-ul buclei aleia.
   */
  const locuri = randariDeFisier();
  assert.equal(
    locuri.length,
    2,
    "panoul deseneaza fisierele in doua bucle `.map((url, i) => …)`; daca s-a redenumit bucla, muta si proba",
  );

  for (const { indice, bloc } of locuri) {
    const apeluri = [...bloc.matchAll(/numeleFisierului\(([^)]*)\)/g)].map((m) => m[1].trim());
    assert.ok(
      apeluri.length > 0,
      `lista pe \`${indice}\` nu mai trece numele prin regula comuna: pe ecran a ramas ceva brut`,
    );
    for (const argumente of apeluri) {
      assert.equal(
        argumente,
        `url, ${indice}`,
        `numele din lista pe \`${indice}\` nu mai poarta pozitia randului: \`numeleFisierului(${argumente})\``,
      );
    }
  }

  /* ⚠ Si ca pozitia CHIAR schimba numele — altfel randurile de sus ar pazi un argument fara efect. */
  assert.notEqual(
    numeleFisierului(CHEIE_JPG, 0),
    numeleFisierului(CHEIE_JPG, 1),
    "acelasi fisier iese cu acelasi nume pe randuri diferite",
  );
});

test("⚠ legatura din panou chiar cere ruta privata, cu TREI parametri cu numele pe care ruta le citeste", () => {
  const adresaFisierului = functiaDinPanou("adresaFisierului");
  const u = new URL(adresaFisierului(CHEIE_JPG, BIZ, COMANDA), "https://magazin.exemplu");

  assert.equal(u.pathname, "/api/customization-file", "fisierul nu se mai cere de la ruta privata");

  const trimisi = [...u.searchParams.keys()].sort();
  assert.deepEqual(trimisi, ["businessId", "cheie", "comanda"]);
  assert.equal(u.searchParams.get("cheie"), CHEIE_JPG);
  assert.equal(u.searchParams.get("businessId"), BIZ);
  assert.equal(u.searchParams.get("comanda"), COMANDA);

  /*
   * ⚠ SI VALOAREA PLEACA INTREAGA, ORICARE AR FI EA. Azi cheile sunt un UUID plus 24 de
   * hexazecimale, deci n-au ce coda — dar forma pe care o primeste comanda e
   * `.+-[0-9a-f]{24}\.[a-z0-9]{1,5}` (`areFormaCheii`, in `fisiere-private.ts`), adica ORICE
   * inaintea semnaturii. Panoul n-are voie sa atarne de alfabetul ales in alt fisier: fara codare,
   * un `#` din valoare taie tot ce urmeaza, iar ruta primeste o cerere fara magazin si fara
   * comanda — 400, pe fiecare fisier, la o schimbare facuta doi pasi mai incolo.
   */
  const ostila = cheia("poza mare#2&w=1-286c3c198813fbe4a2a96737.jpg");
  const uo = new URL(adresaFisierului(ostila, BIZ, COMANDA), "https://magazin.exemplu");
  assert.equal(uo.searchParams.get("cheie"), ostila, "valoarea nu ajunge intreaga la ruta");
  assert.equal(uo.searchParams.get("comanda"), COMANDA, "ce vine dupa cheie s-a pierdut pe drum");

  /*
   * ⚠ SI ACELEASI NUME LA CELALALT CAPAT. Fara randul asta, proba ar fi inghetat doar ce scrie
   * panoul: ruta si-ar fi putut redenumi `cheie` in altceva, proba ei s-ar fi redenumit odata cu
   * ea, iar panoul ar fi ramas pe numele vechi — 404 pe fiecare fisier, cu suita verde.
   */
  const ceruti = [...sursa(RUTA).matchAll(/cauta\.get\("([^"]+)"\)/g)].map((m) => m[1]).sort();
  assert.deepEqual(ceruti, trimisi, "ruta si panoul nu mai vorbesc despre aceiasi parametri");
});

test("⚠ o comanda VECHE, cu adresa intreaga, pleaca NEATINSA catre depozit", () => {
  /*
   * Comenzile de dinaintea trecerii la chei poarta adrese absolute. Ele nu au ce cauta pe ruta
   * privata (cheia lor n-ar trece de verificarea de forma), deci valoarea pleaca neatinsa.
   *
   * ⚠ ATAT SE MASOARA AICI: ADRESA. Ce se VEDE pe randul unei comenzi vechi s-a schimbat totusi —
   * numele vine acum din regula comuna, deci scrie „Fisierul N.ext” in loc de ultima bucata din
   * adresa. E o schimbare voita: bucata aia era `<uuid>.jpg`, adica tot nu numele omului.
   */
  const adresaFisierului = functiaDinPanou("adresaFisierului");
  const veche = "https://pub-alnostru.r2.dev/products/customizations/x/poza.jpg";
  assert.equal(adresaFisierului(veche, BIZ, COMANDA), veche);
});

test("⚠ nicio valoare de fisier nu mai pleaca BRUTA in `href` sau `src`", () => {
  /*
   * O cheie pusa direct in `href` da o legatura RELATIVA:
   * `/dashboard/orders/<id>/products/customizations/…` — adica 404, si ruta privata ar ramane cod
   * mort. E chiar felul in care se pierde piesa la o rezolvare de conflict.
   */
  assert.doesNotMatch(codul, /(href|src)=\{url\}/, "o valoare de fisier pleaca neinvelita");
  const folosiri = codul.match(/adresaFisierului\(url, order\.business_id, order\.id\)/g) ?? [];
  assert.ok(
    folosiri.length >= 4,
    `panoul arata fisierele in patru locuri (doua liste si doua feluri de miniatura); gasite ${folosiri.length}`,
  );
});

test("⚠ optimizatorul de imagini nu mai e importat in panou", () => {
  /*
   * `<Image>` cere o adresa pe care o poate citi CHIAR EL, iar ruta noastra cere sesiunea
   * comerciantului: miniatura ar fi raspuns 401. Randarile au trecut pe `<img>`, importul a ramas
   * — nimic nu-l semnaleaza (proiectul n-are `noUnusedLocals`, CI-ul nu ruleaza eslint), dar
   * lasa in fisier semnul ca pagina inca trece prin optimizator, exact de unde a fost scoasa.
   */
  assert.doesNotMatch(codul, /from "next\/image"/, "importul nefolosit s-a intors");
  assert.equal(
    (codul.match(/<Image[\s/]/g) ?? []).length,
    0,
    "a reaparut o randare `<Image>` — ea ar cere adresa publica, deci 401 sau poza rupta",
  );
});

test("⚠ miniatura de 56px nu mai cere originalul pe firul care deseneaza", () => {
  /*
   * Ruta intoarce OCTETII ORIGINALI (pana la 10 MB pe imagine, `MB_IMAGINE`) si cu
   * `private, no-store`, deci nici browserul nu-i tine: o comanda cu cinci poze de telefon costa
   * ~40 MB la FIECARE deschidere a paginii. Din panou se poate face doar atat: `lazy` amana ce nu
   * se vede, `async` scoate decodarea de pe firul principal. Restul cere un parametru de latime
   * PE RUTA, care nu se schimba de aici.
   */
  const tag = codul.match(/<img\s[^>]*adresaFisierului\([^>]*\/>/);
  assert.ok(tag, "nu mai exista miniatura fisierului in panou");
  assert.match(tag[0], /loading="lazy"/, "miniatura se cere si cand nu se vede");
  assert.match(tag[0], /decoding="async"/, "decodarea sta pe firul care deseneaza pagina");
});
