import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { normalizeazaDefinitia, TIPURI } from "./definitie";
import { normalizeazaValorile } from "./valori";
import { sePoateRandaCaImagine } from "./adresa";
import { verificaPersonalizarea } from "./comanda";
import { cheieIncarcare } from "./fisiere-private";
import { detectDocMime, detectImageMime, isAllowedImage } from "@/lib/utils/file-signature";

/**
 * Al zecelea tip de camp: `fisier` (PDF sau imagine).
 *
 * ═══ ⚠ DE CE UN TIP NOU, SI NU UN `image` LARGIT ═══
 *
 * Cele 29 de produse personalizabile din productie au deja campuri `image`, iar trei locuri le
 * randeaza ca IMAGINI: vitrina (`<img>`), panoul de comenzi (`<Image>` cu miniatura) si emailul.
 * Largit `image` ca sa primeasca PDF, toate trei ar fi inceput sa deseneze o miniatura pentru un
 * document — adica o poza rupta pe fiecare, pe produse pe care nimeni nu le-a atins.
 *
 * ⚠ SI CAPATUL DE INCARCARE E PUBLIC. Felul continutului i-l spune tot clientul (`documente=1`),
 * deci el nu poate fi o poarta: oricine poate cere „documente" si urca un PDF, apoi il trimite
 * intr-un camp de IMAGINE. Poarta adevarata sta la COMANDA, unde se stie definitia produsului.
 */

process.env.R2_PUBLIC_URL = "https://pub-alnostru.r2.dev";
process.env.CUSTOMIZATION_FILE_SECRET = "secret-de-proba-pentru-fisiere";

const BIZ = "11111111-1111-4111-8111-111111111111";

/**
 * Un fisier al magazinului asta, in forma pe care o scrie ruta de incarcare: cheie semnata.
 *
 * ⚠ ERA O ADRESA PANA PE 07.09.2026, cand s-a inchis fereastra de desfasurare si poarta comenzii
 * a incetat sa mai primeasca adrese. Numele se da tot ca „ceva.ext", fiindca aici se probeaza
 * TERMINATIA — dar el se desface si intra in chiar textul semnat, deci ce ajunge la poarta e
 * exact ce ar veni din productie.
 *
 * ⚠ Un nume fara punct iese cu terminatia `bin` (vezi `cheieIncarcare`), adica tot un caz de
 * „terminatie pe care n-o primeste niciun tip" — ce cerea si varianta de dinainte.
 */
const punct = (nume: string) => nume.lastIndexOf(".");
const adr = (nume: string) =>
  cheieIncarcare(
    BIZ,
    punct(nume) === -1 ? nume : nume.slice(0, punct(nume)),
    punct(nume) === -1 ? "" : nume.slice(punct(nume) + 1),
  );

function produs(tip: "image" | "fisier") {
  return {
    customization: {
      enabled: true,
      fields: [{ id: "f", type: tip, label: "Fisierul de tipar", required: true, max_files: 2 }],
    },
  };
}

test("⚠ `fisier` e in lista de tipuri, si se citeste cu reglajele lui", () => {
  assert.ok((TIPURI as readonly string[]).includes("fisier"));
  const d = normalizeazaDefinitia(produs("fisier").customization)!;
  assert.equal(d.fields[0].type, "fisier");
  assert.equal(d.fields[0].max_files, 2, "reglajele de fisiere nu se citesc la tipul nou");
});

test("⚠ valorile se curata IDENTIC cu `image` — deosebirea o face serverul", () => {
  /*
   * In browser nu se poate sti daca adresa e a depozitului nostru: variabilele de mediu ale
   * serverului nu exista acolo. Deci `valori.ts` verifica FORMA, si atat — la fel pentru amandoua
   * tipurile.
   */
  for (const tip of ["image", "fisier"] as const) {
    const d = normalizeazaDefinitia(produs(tip).customization)!;
    const v = normalizeazaValorile(d, { f: [adr("x.pdf")] });
    assert.equal(v.ok, true, tip);
    assert.deepEqual(v.valori.get("f"), { fel: "fisiere", adrese: [adr("x.pdf")] }, tip);
  }
});

test("⚠ UN PDF INTR-UN CAMP DE IMAGINE SE REFUZA LA COMANDA", () => {
  /*
   * ⚠ ASTA E POARTA, si merita citita de doua ori.
   *
   * Ruta de incarcare accepta PDF numai cand i se cere (`documente=1`) — dar cererea aia vine de
   * la client, pe un capat PUBLIC si neautentificat. Deci oricine poate urca un PDF si il poate
   * trimite apoi intr-un camp de imagine. Consecinta nu e teoretica: panoul comerciantului
   * randeaza `type === "image"` cu `<Image>`, deci pe hartia dupa care se produce marfa ar fi
   * aparut o poza rupta in dreptul fisierului.
   *
   * Se poate verifica fiindca TERMINATIA E PUSA DE NOI: ruta o alege din OCTETII fisierului
   * (`EXT_BY_MIME`), nu din numele trimis de browser. Deci intrebarea „ce e in fisierul asta?"
   * are deja raspuns, si el sta chiar in cheie.
   */
  const laImagine = verificaPersonalizarea(produs("image"), { f: [adr("tipar.pdf")] }, BIZ);
  assert.equal(laImagine.fel, "eroare", "un PDF a intrat intr-un camp de imagine");
  assert.match(String((laImagine as { mesaj: string }).mesaj), /doar imagini/);

  /* Perechea, si fara ea proba n-ar insemna nimic: la campul de FISIER acelasi PDF trece. */
  const laFisier = verificaPersonalizarea(produs("fisier"), { f: [adr("tipar.pdf")] }, BIZ);
  assert.equal(laFisier.fel, "ok", "campul de fisier refuza chiar fisierele pentru care exista");

  /* Si o imagine trece pe amandoua — tipul nou nu inchide nimic din ce mergea. */
  assert.equal(verificaPersonalizarea(produs("image"), { f: [adr("poza.jpg")] }, BIZ).fel, "ok");
  assert.equal(verificaPersonalizarea(produs("fisier"), { f: [adr("poza.jpg")] }, BIZ).fel, "ok");
});

test("⚠ o terminatie inventata nu trece pe niciun tip", () => {
  /* Cheia e semnata de noi, pentru magazinul asta — si totusi nu poate veni de la ruta noastra. */
  for (const tip of ["image", "fisier"] as const) {
    for (const nume of ["ceva.exe", "ceva.svg", "fara-terminatie"]) {
      assert.equal(
        verificaPersonalizarea(produs(tip), { f: [adr(nume)] }, BIZ).fel, "eroare",
        `${tip} a acceptat ${nume}`,
      );
    }
  }
});

test("⚠ PDF-ul se recunoaste din OCTETI, si SEPARAT de imagini", () => {
  /*
   * ⚠ `detectImageMime` e chemat din sase locuri care inteleg toate prin „da" ca fisierul e o
   * IMAGINE si ca se poate randa, redimensiona sau trimite mai departe ca atare. O ramura de PDF
   * acolo l-ar fi facut sa minta in toate sase, tacut — inclusiv in conducta de optimizare.
   */
  const pdf = Buffer.from("%PDF-1.7\n%\xe2\xe3\xcf\xd3\n", "binary");
  assert.equal(detectDocMime(pdf), "application/pdf");
  assert.equal(detectImageMime(pdf), null, "PDF-ul trece drept imagine");
  assert.equal(isAllowedImage(pdf, ["image/jpeg", "image/png"]), false);

  /* Perechea: o imagine adevarata nu devine document. */
  const jpg = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0, 0, 0, 0, 0, 0, 0, 0]);
  assert.equal(detectImageMime(jpg), "image/jpeg");
  assert.equal(detectDocMime(jpg), null);

  /* Si un fisier prea scurt nu arunca. */
  assert.equal(detectDocMime(Buffer.from("%PD")), null);
});

test("⚠ lantul e INTREG: ruta cere felul, iar cele trei ecrane nu deseneaza miniaturi", () => {
  /*
   * Un tip care se vede in meniu si nu functioneaza e mai rau decat unul care lipseste:
   * comerciantul il alege, salveaza, si afla abia din prima comanda ca nu se poate incarca nimic.
   * Probele de mai jos sunt pe SURSA fiindca proiectul n-are jsdom.
   */
  const sursa = (r: string) =>
    readFileSync(path.resolve(process.cwd(), r), "utf8").replace(/\r\n/g, "\n");

  /*
   * 1. Ruta: plafon propriu si octeti verificati separat.
   *
   * ⚠ DE UNDE VINE „E DOCUMENT" S-A SCHIMBAT PE 07.09.2026, si asta e chiar o reparatie.
   *
   * Steagul venea de la CLIENT (`documente=1` in formular), iar ruta si-o marturisea singura in
   * comentariu: „NU E O POARTA DE AUTORIZARE... oricine poate cere «documente»". Adica plafonul de
   * 40 MB al documentelor se cerea si de pe un camp de imagine, unde el e 10 — pe cel mai expus
   * capat din proiect, care scrie in depozit platit.
   *
   * Acum felul iese din PERMISUL semnat pe server, deci din definitia produsului. Ce se cere aici
   * ramane aceeasi garantie — ca documentele au plafonul si verificarea LOR —, dar sursa felului
   * nu mai poate fi aleasa de cel care incarca.
   */
  /*
   * ⚠ S-A DESPARTIT IN DOUA PE 07.09.2026, si scrie aici pe unde s-a dus fiecare bucata.
   *
   * Octetii nu mai trec prin functie — Vercel refuza cererile de peste 4,5 MB, iar platforma
   * promitea 10 si 40 MB. Deci: ruta de VOIE da un link semnat (si acolo se cere plafonul, pe
   * marimea declarata), iar ruta de FINALIZARE citeste octetii adevarati din depozit si hotaraste.
   *
   * Felul campului iese din permis in AMANDOUA, ca inainte: nu se mai poate cere de la client.
   */
  const ruta = sursa("src/app/api/upload-customization/route.ts");
  const fin = sursa("src/app/api/upload-customization/finalizeaza/route.ts");
  assert.match(ruta, /const cereDocumente = verdict\.document;/);
  assert.match(fin, /const cereDocumente = verdict\.document;/);
  assert.match(fin, /const document = cereDocumente \? detectDocMime\(inceput\) : null;/);
  assert.match(fin, /"application\/pdf": "pdf",/, "finalizarea n-ar sti ce terminatie sa puna");
  /*
   * ═══ ⚠ AFIRMATIA S-A INTORS PE 07.09.2026 ═══
   *
   * Aici se cerea `const plafon = cereDocumente ? MAX_SIZE_DOC : MAX_SIZE`, adica plafonul GLOBAL,
   * 10 MB la imagini si 40 la documente. Era tot ce stia serverul, iar limita pe care comerciantul
   * o punea pe camp („Logo: cel mult 2 MB") traia numai in browser: cine trimitea cererea de mana
   * cerea link pentru 8 MB pe campul de 2 si il primea.
   *
   * Acum plafonul vine din PERMIS, deja impletit cu cel global (vezi `campurileDeIncarcare`), deci
   * amandoua rutele intreaba un singur numar in loc sa aleaga intre doua. Proba cere chiar asta:
   * numarul sa vina din permis, nu din constantele modulului.
   */
  assert.match(ruta, /const plafon = verdict\.maxOcteti;/,
    "voia nu mai margineste marimea declarata cu limita CAMPULUI");
  assert.match(fin, /const plafon = verdict\.maxOcteti;/,
    "finalizarea nu mai margineste marimea ADEVARATA cu limita CAMPULUI");
  /*
   * ⚠ SI PERECHEA: plafoanele globale n-au voie sa se mai citeasca de aici. Lasate alaturi, prima
   * „reparatie" care le pune la loc ar sterge tacut limita comerciantului, si suita ar fi verde.
   */
  for (const [nume, v] of [["voia", ruta], ["finalizarea", fin]] as const) {
    assert.equal(
      /MAX_SIZE|MB_IMAGINE|MB_DOCUMENT/.test(v), false,
      `${nume} judeca iar pe plafonul global, nu pe cel al campului`,
    );
  }
  /* ⚠ Si felul nu se mai poate cere din formular — altfel vechea usa ar fi ramas deschisa alaturi. */
  for (const [nume, v] of [["voia", ruta], ["finalizarea", fin]] as const) {
    assert.equal(
      /documente"\)/.test(v), false,
      `${nume} accepta iar felul campului de la client`,
    );
  }

  /*
   * 2. Carligul spune CARE camp, iar felul lui il stie permisul.
   *
   * Fara `camp`, permisul n-ar avea ce verifica si fiecare PDF ar fi refuzat; iar cu felul trimis
   * tot de aici, reparatia de mai sus ar fi fost degeaba.
   */
  const carlig = sursa("src/components/storefront/sections/product/_shared/usePersonalizare.ts");
  /*
   * ⚠ PLAFONUL FIECARUI TIP vine dintr-un singur loc: `megaoctetiiCampului(camp.type)` — 10 MB la
   * imagine, 40 la fisier. Aici se cerea un steag local `documente`, care a ramas fara treaba cand
   * felul campului a inceput sa iasa din PERMIS; scos, sursa e una singura.
   */
  assert.match(carlig, /megaoctetiiCampului\(camp\.type\)/, "carligul nu mai stie plafonul tipului");
  assert.match(carlig, /camp: camp\.id/, "carligul nu mai spune CARE camp");
  /*
   * ⚠ SI NU MAI DECLARA EL FELUL. Trimitea `documente=1`, adica cerea singur plafonul de 40 MB —
   * si il putea cere si de pe un camp de imagine, unde el e 10.
   */
  /*
   * ⚠ SE CITESTE CODUL, NU COMENTARIILE — a treia oara cand proiectul cade pe asta. Chiar nota care
   * EXPLICA de ce nu se mai trimite `documente=1` contine cuvantul, si proba pica pe ea.
   */
  assert.equal(
    /documente/.test(carlig.replace(/\/\*[\s\S]*?\*\//g, "")), false,
    "carligul declara iar singur ca urca un document",
  );

  /* 3. Vitrina si panoul nu randeaza miniatura pentru un document. */
  /*
   * ⚠ PROBA ASTA INGHETASE FORMA, si a picat cand forma s-a facut mai buna.
   *
   * Ea cerea textual `{adrese.length > 0 && !documente && (` — adica doua liste paralele, una
   * pentru documente si una pentru imagini. Purtarea aia era corecta pentru PDF si GRESITA pentru
   * HEIC: o poza de pe iPhone e o imagine adevarata, intr-un camp de imagini, si tot nu se poate
   * desena. Intrebarea buna nu e „ce fel de CAMP e", ci „se poate desena ADRESA asta".
   *
   * Se cere acum REGULA: fiecare adresa trece prin `sePoateRandaCaImagine`, in amandoua ecranele.
   */
  const vitrina = sursa("src/components/storefront/sections/product/_shared/CampuriPersonalizare.tsx");
  assert.match(vitrina, /sePoateRandaCaImagine\(url\) \? \(/,
    "vitrina deseneaza miniaturi fara sa intrebe daca se poate");
  assert.equal(
    /\{adrese\.length > 0 && !documente && \(/.test(vitrina), false,
    "vitrina alege iar dupa TIPUL campului, nu dupa ce se poate desena",
  );

  const panou = sursa("src/components/dashboard/OrderDetailClient.tsx");
  assert.match(
    panou, /field\.type === "fisier" && Array\.isArray\(field\.value\) \?/,
    "panoul de comenzi randeaza un PDF ca imagine",
  );
  assert.match(panou, /sePoateRandaCaImagine\(url\) \? \(/,
    "panoul cere miniatura si pentru ce nu se poate decoda");

  /* 4. Comerciantul poate CHIAR sa aleaga tipul. */
  const editor = sursa("src/components/dashboard/PersonalizareCampuri.tsx");
  assert.match(editor, /fisier: "Fisier \(PDF sau imagine\)",/, "tipul nu se poate alege din meniu");
});

test("⚠ HEIC e o imagine ADEVARATA care nu se poate DESENA", () => {
  /*
   * ⚠ DOUA INTREBARI DIFERITE, si aici se vede de ce n-au acelasi raspuns.
   *
   * `TERMINATII` spune ce are voie intr-un camp: `.heic` e o imagine, trece de verificarea pe
   * octeti, si are voie intr-un camp de tip `image`. `sePoateRandaCaImagine` spune altceva: se
   * poate DESENA? Nu — Chrome, Firefox si Edge n-au decodor HEIC, iar `/api/img` refuza `.heic`
   * dinadins, ca octetii HEIF trimisi de un anonim sa nu ajunga la libheif.
   *
   * ⚠ CE COSTA CAND CELE DOUA SE CONFUNDA, masurat inainte de reparatie: clientul de pe Windows
   * alege `IMG_0421.HEIC`, incarcarea REUSESTE (200), si vede un patrat rupt exact in locul unde
   * tocmai a pus poza — fara niciun mesaj, fiindca nu e nicio eroare. Iar in panou `/api/img`
   * raspundea 404, deci comerciantul vedea acelasi patrat gol pe hartia dupa care produce marfa —
   * in ORICE browser, Safari inclusiv.
   */
  /*
   * ⚠ DOUA FORME, DINADINS, fiindca sunt doua intrebari diferite.
   *
   * Poarta comenzii primeste doar CHEIA semnata (`adr`) — fereastra adreselor s-a inchis pe
   * 07.09.2026. `sePoateRandaCaImagine` traieste in `adresa.ts`, care citeste si adresa intreaga,
   * fiindca el raspunde despre CE SE ARATA pe un rand deja scris: comenzile de dinaintea cheilor
   * si orice alta valoare ajunsa in panou. Probata numai pe chei, regula aia si-ar fi pierdut
   * tacut jumatate din intrebuintare.
   */
  const nostru = (n: string) => `https://pub-alnostru.r2.dev/products/customizations/${BIZ}/${n}`;

  /* Are VOIE intr-un camp de imagini... */
  assert.equal(verificaPersonalizarea(produs("image"), { f: [adr("poza.heic")] }, BIZ).fel, "ok");
  /* ...dar NU se deseneaza. */
  assert.equal(sePoateRandaCaImagine(nostru("poza.heic")), false);
  assert.equal(sePoateRandaCaImagine(nostru("poza.heif")), false);

  /*
   * ⚠ SI PE FORMA VIE, CHEIA. Randurile de deasupra o probeaza pe cea din comenzile vechi; asta e
   * cea pe care o scrie ruta azi, deci cea care hotaraste ce vede cumparatorul sub camp. Exact
   * despartirea asta — regula probata pe forma veche, folosita pe cea noua — a lasat pe 06.09 un
   * defect blocant sub 6.292 de probe verzi.
   */
  assert.equal(sePoateRandaCaImagine(adr("poza.heic")), false, "cheia HEIC se crede desenabila");
  assert.equal(sePoateRandaCaImagine(adr("poza.jpg")), true, "cheia JPG nu se mai deseneaza");
  assert.equal(sePoateRandaCaImagine(adr("tipar.pdf")), false);

  /* Perechea: formatele care chiar se pot desena. */
  for (const n of ["poza.jpg", "poza.jpeg", "poza.PNG", "poza.webp", "poza.gif"]) {
    assert.equal(sePoateRandaCaImagine(nostru(n)), true, n);
  }
  /* Si documentele, care n-au fost niciodata desenabile. */
  assert.equal(sePoateRandaCaImagine(nostru("tipar.pdf")), false);
  /*
   * ⚠ TERMINATIA SE IA DIN CALE, nu din tot sirul — si asta a prins-o un mutant.
   *
   * O adresa poate purta un parametru (`?v=2`, sau prefixul de redimensionare al CDN-ului). Citita
   * ca sir intreg, `poza.jpg?x=.pdf` ar fi parut un PDF, iar `tipar.pdf?v=.jpg` o imagine — adica
   * exact pe dos, si tocmai pe adresele pe care le compune singur CDN-ul.
   */
  assert.equal(sePoateRandaCaImagine(nostru("poza.jpg") + "?x=.pdf"), true);
  assert.equal(sePoateRandaCaImagine(nostru("tipar.pdf") + "?v=.jpg"), false);

  /* O adresa care nu se poate citi nu se deseneaza pe o presupunere. */
  assert.equal(sePoateRandaCaImagine("nu-e-o-adresa"), false);
  assert.equal(sePoateRandaCaImagine(nostru("fara-terminatie")), false);
});
