import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

/* ══════════════════════════════════════════════════════════════════════════
   PATRU LUCRURI CERUTE DE COMERCIANT, LA LISTA DE PRODUSE      (30.08.2026)
   ══════════════════════════════════════════════════════════════════════════

   Toate patru vin din folosirea zilnica, nu dintr-un audit — si trei dintre ele lovesc exact pe
   cine lucreaza mai incet sau se uita mai atent.
*/

const pagina = readFileSync("src/app/(dashboard)/dashboard/products/page.tsx", "utf8");
const lista = readFileSync("src/components/dashboard/ProductsClient.tsx", "utf8");
const editare = readFileSync("src/app/(dashboard)/dashboard/products/[productId]/edit/page.tsx", "utf8");
const sigla = readFileSync("src/components/dashboard/SiglaMarketplace.tsx", "utf8");
const formular = readFileSync("src/components/dashboard/ProductForm.tsx", "utf8");

function faraComentarii(t: string): string {
  return t.replace(/\/\*[\s\S]*?\*\//g, " ").replace(/\/\/[^\n]*/g, " ");
}

test("⚠ lista nu se remonteaza la fiecare litera scrisa in cautare", () => {
  /*
   * ═══ CINE SCRIE INCET PIERDEA FOCUSUL DUPA FIECARE LITERA ═══
   *
   * `<Suspense key={JSON.stringify(filtre)}>` cuprindea si textul cautat. Fiecare litera ajunsa la
   * server schimba cheia, React demonta tot `ProductsClient`, si caseta de cautare devenea alt nod
   * DOM: focusul se ducea, iar intre timp se vedea scheletul.
   *
   * ⚠ Un om care scrie repede nu simtea nimic — asteptarea de 400 ms ii aduna literele intr-o
   * singura cerere. Reclamat de un comerciant cu dificultati locomotorii: defectul lovea exact pe
   * cine scrie mai greu.
   */
  const cod = faraComentarii(pagina);
  assert.doesNotMatch(cod, /<Suspense[^>]*key=/,
    "o cheie pe `Suspense` remonteaza lista, deci arunca si caseta de cautare");
  assert.match(cod, /<Suspense fallback=/, "scheletul ramane, doar cheia pleaca");
});

test("⚠ dar selectia tot se goleste cand se schimba ce se vede", () => {
  /*
   * ⚠ Remontarea avea un rost adevarat: altfel raman bifate produse care nu mai sunt in lista, iar
   * actiunile in masa — inclusiv STERGEREA — ar lucra pe ele. Rostul ramane, mijlocul se schimba.
   */
  const cod = faraComentarii(lista);
  assert.match(cod, /const semnaturaFiltre = JSON\.stringify\(filtre\);/,
    "nu se urmareste schimbarea filtrelor");
  const i = cod.indexOf("semnaturaVeche.current = semnaturaFiltre;");
  assert.ok(i > 0, "nu se tine minte semnatura veche");
  const ram = cod.slice(i, i + 200);
  assert.match(ram, /clearSelection\(\);/,
    "la schimbarea filtrelor selectia trebuie golita, altfel se lucreaza pe produse nevazute");
});

test("⚠ intoarcerea din editare poarta TOATE filtrele, nu doar pagina", () => {
  /*
   * ⚠ Se ducea numai `?page=`. Cine cautase ceva se intorcea dupa „Salveaza" intr-o lista
   * NEFILTRATA — la aceeasi pagina, dar cu alte produse. Iar cand lista lui filtrata avea o
   * singura pagina, `currentPage` era 1, deci nu se trimitea nimic si intoarcerea ateriza chiar
   * la inceputul catalogului.
   */
  const cod = faraComentarii(lista);
  /*
   * ⚠ SE DECUPEAZA CHIAR `interogareLista`, nu se cauta in tot fisierul. `cereFiltre` scrie
   * ACELEASI linii `p.set(…)` cateva randuri mai sus — iar o cautare larga ramane verde cand se
   * scoate o cheie de aici, fiindca se potriveste cu ea. Confruntarea cu defectul a aratat-o.
   */
  const iI = cod.indexOf("const interogareLista = () => {");
  assert.ok(iI > 0, "interogareLista a disparut");
  const corpI = cod.slice(iI, cod.indexOf("};", iI));
  for (const cheie of ["search", "cat", "stare", "stoc", "page"]) {
    assert.match(corpI, new RegExp(`p\\.set\\("${cheie}"`),
      `adresa de intoarcere nu poarta \`${cheie}\``);
  }
  assert.match(cod, /const editHref = \(id: string\) => \{/, "editHref nu mai compune interogarea");
  assert.match(cod, /interogareLista\(\)/, "editHref nu foloseste interogarea listei");

  /* ⚠ Si pagina de editare le citeste inapoi pe toate, nu doar pe una. */
  const ed = faraComentarii(editare);
  assert.match(ed, /function intoarcereLaLista\(/, "editarea nu reface adresa listei");
  for (const cheie of ["search", "cat", "stare", "stoc", "page"]) {
    assert.match(ed, new RegExp(`sp\\.${cheie}`), `intoarcerea nu citeste \`${cheie}\``);
  }
  assert.doesNotMatch(ed, /page=\$\{encodeURIComponent\(page\)\}/,
    "forma veche ducea numai pagina");
});

test("⚠ siglele marketplace-urilor isi pastreaza raportul", () => {
  /*
   * ═══ TOATE ERAU STRIVITE INTR-UN PATRAT DE 16×16 ═══
   *
   * Niciuna nu e patrata: Trendyol 4,35:1, eMAG 3,73:1, About You 9,86:1, OLX 1,73:1. Reclamat cu
   * poza: literele ieseau lipite si ilizibile.
   */
  assert.match(sigla, /width: "auto"/, "latimea trebuie sa iasa din raport, nu sa fie impusa");
  assert.match(sigla, /object-contain/, "fara `object-contain`, un parinte tot o poate intinde");
  assert.match(sigla, /maxWidth: latimeMax/,
    "fara margine de latime, About You ar impinge butonul afara din rand");

  /*
   * ⚠ Si nicaieri nu se mai deseneaza o sigla de marketplace cu latime SI inaltime fixate. Asta e
   * chiar forma defectului, si e usor de scris din nou din obisnuinta.
   */
  for (const [nume, sursa] of [["ProductForm", formular], ["ProductsClient", lista]] as const) {
    assert.doesNotMatch(sursa, /integrations\/(olx|trendyol|emag|aboutyou)[^"]*"[^/]*className="h-\d/,
      `${nume} deseneaza o sigla cu dimensiuni fixate`);
    assert.match(sursa, /<SiglaMarketplace piata=/, `${nume} nu foloseste componenta`);
  }
});

test("⚠ bara de selectie publica numai unde exista o cale pe ID-uri", () => {
  /*
   * ⚠ ABOUT YOU LIPSESTE DINADINS. Caile lui in masa pornesc de la `aboutyou_listings`, deci ating
   * numai produsele care AU DEJA o listare acolo. Un buton „Publica pe About You" ar fi sarit tacut
   * exact produsele pe care le-ar bifa cineva care vrea sa le publice — chiar defectul documentat
   * la eMAG, unde „la prima folosire nu se punea nimic la rand" si mesajul dadea vina pe altceva.
   */
  const cod = faraComentarii(lista);
  assert.match(cod, /publishProductsToOlx\(businessId/, "OLX");
  assert.match(cod, /bulkPublishTrendyol\(businessId/, "Trendyol");
  assert.match(cod, /publicaSelectiaPeEmag\(businessId/, "eMAG");
  assert.doesNotMatch(cod, /aboutyou|AboutYou/i,
    "About You n-are cale pe id-uri; un buton acolo ar sari tacut produsele nelistate");

  /* ⚠ Si fiecare buton apare numai daca integrarea lui e chiar conectata. */
  for (const steag of ["olxConnected", "trendyolConnected", "emagConnected"]) {
    assert.match(cod, new RegExp(`\\{${steag} && \\(`), `butonul nu se ascunde cand lipseste ${steag}`);
  }
  /* ⚠ Iar steagurile vin de la server, citite din configurari. */
  const p = faraComentarii(pagina);
  assert.match(p, /trendyol_config, emag_config/, "pagina nu citeste conexiunile");
});

/* ══════════════════════════════════════════════════════════════════════════
   „SELECTEAZA TOT" = PAGINA CURENTA                            (24.09.2026)
   ══════════════════════════════════════════════════════════════════════════

   Cerut de comerciant: bifa din capul listei lua TOATE produsele filtrate (mii, la un magazin
   mare), desi pe ecran erau 25, iar de ea atarna actiunile in masa, inclusiv stergerea. Acum bifa
   ia pagina, iar toate paginile se aleg anume, din bara de selectie.
*/

function corpulFunctiei(cod: string, nume: string): string {
  const i = cod.indexOf(`function ${nume}(`);
  assert.ok(i > 0, `lipseste ${nume}`);
  const j = cod.indexOf("\n  function ", i + 10);
  const k = cod.indexOf("\n  async function ", i + 10);
  const capete = [j, k].filter((x) => x > 0);
  return cod.slice(i, capete.length ? Math.min(...capete) : i + 1500);
}

test("⚠ bifa din capul listei selecteaza NUMAI pagina curenta", () => {
  const cod = faraComentarii(lista);
  const toggleAll = corpulFunctiei(cod, "toggleAll");
  assert.doesNotMatch(toggleAll, /idurileProduselorFiltrate/, "bifa nu mai cere de la server toate produsele");
  assert.match(toggleAll, /setSelected\(new Set\(paginated\.map\(p => p\.id\)\)\)/, "bifa ia id-urile paginii");
  assert.match(cod, /const allSelected = paginated\.length > 0 && paginated\.every\(p => selected\.has\(p\.id\)\);/,
    "bifa se aprinde dupa pagina, nu dupa „toate paginile”");
  assert.equal((lista.match(/aria-label="Selecteaza produsele de pe pagina curenta"/g) ?? []).length, 2,
    "amandoua bifele (mobil si tabel) spun ca e pagina");
});

test("⚠ toate paginile se aleg anume, din bara, iar un raspuns intarziat nu bifeaza lista veche", () => {
  const cod = faraComentarii(lista);
  const toate = corpulFunctiei(cod, "selecteazaToatePaginile");
  assert.match(toate, /idurileProduselorFiltrate\(businessId, filtre\)/);
  assert.match(toate, /if \(semnaturaVeche\.current !== ceruta\) return;/,
    "filtrele schimbate cat astepta: raspunsul ar fi bifat produse nevazute");
  assert.ok(toate.indexOf("semnaturaVeche.current !== ceruta") < toate.indexOf("setSelected("));
  assert.match(cod, /allSelected && !selectieTotala && maiMultePagini && \(/, "butonul apare dupa pagina bifata");
  assert.match(lista, /Selecteaza toate paginile \(\{totalFiltrate\}\)/);
  /* O bifa scoasa de mana nu mai lasa selectia sa se numeasca „toate paginile”. */
  assert.match(corpulFunctiei(cod, "toggleOne"), /setSelectieTotala\(false\);/);
});

/* ══════════════════════════════════════════════════════════════════════════
   „STERG SI NU SE STERGE”, „SALVEZ SI SE FACE COPIE”          (21.10.2026)
   ══════════════════════════════════════════════════════════════════════════

   Reclamat de un comerciant nou, si dovedit din jurnalele API: serverul era corect. Randul avea
   doua iconite fara text, „Duplica” PRIMA si nicio stergere. Duplicarea pornea la o apasare si
   deschidea editarea COPIEI, care arata ca originalul; omul apasa acolo „Sterge produsul” si
   stergea copia. In doua zile: 16 copii, 9 sterse la cateva secunde dupa, originalul neatins.
*/

/* Corpul unei functii din componenta, pana la acolada ei de inchidere (doua spatii in fata). */
function corpExact(cod: string, nume: string): string {
  const i = cod.indexOf(`function ${nume}(`);
  assert.ok(i > 0, `lipseste ${nume}`);
  const j = cod.indexOf("\n  }\n", i);
  assert.ok(j > i, `nu gasesc capatul lui ${nume}`);
  return cod.slice(i, j);
}

/* Elementul JSX care poarta eticheta data, de la `<` pana la `>`-ul care il deschide. */
function elementul(cod: string, eticheta: string): string {
  const i = cod.indexOf(`aria-label="${eticheta}"`);
  assert.ok(i > 0, `lipseste butonul „${eticheta}”`);
  const start = cod.lastIndexOf("<", i);
  const sfarsit = cod.indexOf(">", cod.indexOf("className=", i));
  return cod.slice(start, sfarsit);
}

test("⚠ duplicarea porneste NUMAI din „Da, creeaza copia”, nu din iconita", () => {
  const cod = faraComentarii(lista);
  assert.equal((cod.match(/duplicateProduct\(/g) ?? []).length, 1, "duplicarea se cheama dintr-un singur loc");
  assert.match(corpExact(cod, "duplica"), /await duplicateProduct\(product\.id, businessId\)/);
  const iconita = elementul(cod, "Duplica");
  assert.doesNotMatch(iconita, /duplica\(|duplicateProduct\(/, "iconita nu duplica direct");
  assert.match(iconita, /setConfirmaRand\(/, "iconita deschide confirmarea");
  assert.match(corpExact(cod, "bandaConfirmare"), /sterg \? sterge\(product\) : duplica\(product\)/,
    "„Da” din banda e singurul care duplica");
});

test("⚠ dupa duplicare nu se deschide singura editarea copiei", () => {
  const corp = corpExact(faraComentarii(lista), "duplica");
  /* Singura navigare permisa e butonul din notificare, apasat de om. */
  const faraButon = corp.replace(/action: \{[^}]*\}/, "");
  assert.doesNotMatch(faraButon, /router\.push\(/, "duplicarea navigheaza singura spre copie");
  assert.match(corp, /label: "Deschide copia", onClick: \(\) => router\.push\(editHref\(idCopie\)\)/);
  /* ⚠ Notificarile panoului dispar implicit dupa 1,8 s: „Produs duplicat” abia se vedea.
     ⚠ Se citeste durata mesajului de SUCCES: prima din functie e a erorii (12 s), si o proba
     care o citea pe aceea ramanea verde cu succesul pus inapoi pe 1,8 s. Bancul a aratat-o. */
  const succes = corp.slice(corp.indexOf("toast.success("));
  const durata = Number(succes.match(/duration: (\d+)/)?.[1] ?? 0);
  assert.ok(durata >= 5000, `mesajul despre copie sta prea putin pe ecran (${durata} ms)`);
  assert.match(corp, /originalul a ramas neschimbat/, "mesajul nu spune ca originalul n-a fost atins");
});

test("⚠ stergerea din rand cere confirmare si e chiar stergerea produsului", () => {
  const cod = faraComentarii(lista);
  assert.equal((cod.match(/deleteProduct\(/g) ?? []).length, 1, "stergerea se cheama dintr-un singur loc");
  assert.match(corpExact(cod, "sterge"), /await deleteProduct\(product\.id, businessId\)/);
  const iconita = elementul(cod, "Sterge");
  assert.doesNotMatch(iconita, /sterge\(|deleteProduct\(/, "iconita nu sterge direct");
  assert.match(iconita, /setConfirmaRand\(/, "iconita deschide confirmarea");
  /* Confirmarea scrie NUMELE: „stergi definitiv” fara nume ar lasa loc exact greselii de mai sus. */
  const banda = corpExact(cod, "bandaConfirmare");
  assert.match(banda, /Stergi definitiv „\$\{product\.name\}”\?/);
  assert.match(banda, /Creezi o copie a produsului „\$\{product\.name\}”\?/);
  /* Un produs sters nu ramane bifat pentru actiunile in masa. */
  assert.match(corpExact(cod, "sterge"), /n\.delete\(product\.id\)/);
});

test("⚠ „Editeaza” e primul buton al randului, si fiecare spune ce face", () => {
  const cod = faraComentarii(lista);
  const butoane = corpExact(cod, "butoaneRand");
  const e = butoane.indexOf('aria-label="Editeaza"');
  const d = butoane.indexOf('aria-label="Duplica"');
  const s = butoane.indexOf('aria-label="Sterge"');
  assert.ok(e > 0 && d > e && s > d, "ordinea trebuie sa fie Editeaza, Duplica, Sterge");
  for (const eticheta of ["Editeaza", "Duplica", "Sterge"]) {
    assert.match(elementul(butoane, eticheta), /title="[^"]+"/, `„${eticheta}” n-are explicatie la trecerea mouse-ului`);
  }
  /* ⚠ O SINGURA copie a butoanelor, pentru telefon si pentru tabel: inainte erau doua, scrise de mana. */
  assert.equal((cod.match(/aria-label="Duplica"/g) ?? []).length, 1, "butoanele sunt scrise de doua ori");
  assert.equal((cod.match(/\{butoaneRand\(product\)\}/g) ?? []).length, 2, "telefonul sau tabelul nu folosesc butoanele comune");
  assert.match(cod, /\{bandaConfirmare\(product\)\}/, "confirmarea lipseste pe telefon");
  assert.match(cod, /bandaConfirmare\(product, true\)/, "confirmarea lipseste in tabel");
});
