import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { apiFaraPoarta } from "@/lib/auth/poarta-mfa";
import {
  MARKETPLACE_CU_CICLU_PROPRIU, MARKETPLACE_ORIGINI, deriveOrigin,
  marketplaceCareTineComanda, mementoulMarketplace,
} from "@/lib/orders/origin";
import { PEPITA } from "./types";
import { sablonMesajPepita } from "./activare";

/* ══════════════════════════════════════════════════════════════════════════
   POARTA
   ══════════════════════════════════════════════════════════════════════════ */

test("⚠ cele trei adrese Pepita trec pe langa poarta MFA", () => {
  /*
   * Sunt chemate de o masina, fara cookie, cu cheia lor in cale. Feedul de stoc e citit din
   * ora in ora pentru fiecare magazin conectat; o cerere spre serverul de autentificare la
   * fiecare citire ar fi cost curat.
   */
  assert.equal(apiFaraPoarta("/api/pepita/produse/abc.xml"), true);
  assert.equal(apiFaraPoarta("/api/pepita/stoc/abc.xml"), true);
  assert.equal(apiFaraPoarta("/api/pepita/comenzi/abc"), true);
  assert.equal(apiFaraPoarta("/api/pepita/comenzi"), true);
});

test("scutirea nu se scurge peste alte rute", () => {
  /* `startsWith` e larg: o scutire scrisa „/api/pep" ar fi deschis si alte cai. */
  assert.equal(apiFaraPoarta("/api/products/export"), false);
  assert.equal(apiFaraPoarta("/api/pepitax/ceva"), false);
});

/* ══════════════════════════════════════════════════════════════════════════
   PANOUL COMENZII
   ══════════════════════════════════════════════════════════════════════════ */

const sursa = { marketplace: PEPITA, order_number: "555001" };

test("comanda Pepita se recunoaste in lista, cu eticheta ei", () => {
  /* Fara randul din `MARKETPLACE_ORIGINI`, s-ar vedea in tabel exact ca una din magazin. */
  assert.ok(MARKETPLACE_ORIGINI[PEPITA], "Pepita are eticheta si culoare");
  assert.equal(deriveOrigin(sursa).marketplace, PEPITA);
});

test("⚠ Pepita NU e printre marketplace-urile care tin starea comenzii", () => {
  /*
   * Acolo sunt cele care ne spun ele starea, deci butoanele noastre se INCHID, fiindca
   * exista o cale oficiala alternativa. La Pepita nu exista NICIO cale, in niciun sens.
   * Inchise, butoanele l-ar fi lasat pe comerciant fara nicio posibilitate de a-si duce
   * comanda la capat, si fara factura si AWB.
   */
  assert.equal(MARKETPLACE_CU_CICLU_PROPRIU.has(PEPITA), false);
  assert.equal(marketplaceCareTineComanda(sursa), null);
});

test("⚠ dar comanda poarta mementoul: aceeasi miscare se face si in Pepita Admin", () => {
  /* Fara el, comerciantul ar apasa „expediat" in Edinio si ar crede ca a confirmat comanda
     la ei. Pepita cere confirmarea in cel mult o zi. */
  const m = mementoulMarketplace(sursa);
  assert.ok(m && m.includes("Pepita Admin"));
  assert.equal(mementoulMarketplace({ marketplace: "emag" }), null, "numai unde chiar e nevoie");
  assert.equal(mementoulMarketplace(null), null);
  assert.equal(mementoulMarketplace({}), null);
});

/* ══════════════════════════════════════════════════════════════════════════
   CE NU ARE VOIE SA SCRIE IN PANOU
   ══════════════════════════════════════════════════════════════════════════

   ⚠ Proba de mai jos SCANEAZA TEXTUL, si stie ce poate si ce nu poate: nu spune ca panoul
   se poarta bine, spune doar ca nu contine promisiuni pe care integrarea nu le poate tine.
   E chiar felul de greseala care se strecoara la a treia reparatie de interfata, cand
   cineva adauga un buton „Confirmă la Pepita" fiindca pare firesc sa existe.
*/

/**
 * Sursa panoului, FARA comentarii.
 *
 * ⚠ A CAZUT PE PROPRIUL MEU COMENTARIU la prima rulare: panoul explica, in comentariu, de ce
 * NU scrie „Conectat la Pepita”, iar scanarea a citit chiar explicatia drept incalcare. O
 * plasa care nu deosebeste codul de comentarii pedepseste tocmai nota care apara regula.
 */
const PANOU = readFileSync("src/components/dashboard/PepitaClient.tsx", "utf8")
  .replace(/\/\*[\s\S]*?\*\//g, " ")
  .replace(/^\s*\/\/.*$/gm, " ");

test("⚠ panoul nu promite nicio actiune trimisa spre Pepita", () => {
  const interzise = [
    /Confirmă (comanda )?(la|către|în) Pepita/i,
    /Trimite (AWB|statusul|factura|comanda) (la|către) Pepita/i,
    /Anulează la Pepita/i,
    /Sincroniz\w* cu Pepita/i,
    /Conectat la Pepita/i,
    /Pepita Sandbox/i,
    /*
     * ⚠ ADAUGATE ODATA CU BUTONUL „Reprocesează”. Butonul lucreaza NUMAI in Edinio: leaga din
     * nou liniile de catalog si duce stocul la capat. Un nume care ar suna a trimitere ar fi
     * fost o minciuna, iar lista de mai sus nu-l prindea: „Retrimite la Pepita” trecea de toate
     * cele sase tipare de dinainte.
     *
     * ⚠ TIPARELE SUNT INGUSTE DINADINS. Unul larg, de felul „trimite … către Pepita”, ar fi
     * cazut pe o propozitie adevarata din panou: „nu le publica si nu le trimite decat catre
     * Pepita”, despre adresele cu chei. O plasa care pedepseste textul corect se scoate.
     */
    /Retrimite (la|către|în) Pepita/i,
    /Actualizează (comanda|statusul) (la|în) Pepita/i,
  ];
  for (const r of interzise) {
    assert.ok(!r.test(PANOU), `panoul nu are voie sa contina ${r}`);
  }
});

test("⚠ panoul spune limpede ca statusul se opereaza si la ei", () => {
  assert.match(PANOU, /Pepita Admin/);
});

/* ══════════════════════════════════════════════════════════════════════════
   MESAJUL DE ACTIVARE
   ══════════════════════════════════════════════════════════════════════════ */

test("mesajul catre Pepita raspunde la tot ce cere Seller Center-ul lor", () => {
  const m = sablonMesajPepita({
    feedProduse: "https://www.edinio.com/api/pepita/produse/CHEIE.xml",
    feedStoc: "https://www.edinio.com/api/pepita/stoc/CHEIE.xml",
    comenzi: "https://www.edinio.com/api/pepita/comenzi/CHEIE2",
  });
  assert.ok(m.includes("https://www.edinio.com/api/pepita/produse/CHEIE.xml"));
  assert.ok(m.includes("https://www.edinio.com/api/pepita/stoc/CHEIE.xml"));
  assert.ok(m.includes("https://www.edinio.com/api/pepita/comenzi/CHEIE2"));
  /*
   * ⚠ Cele trei raspunsuri pe care le cer: variatii, cost de transport, termen de livrare.
   * Iar raspunsul la primul e „nu", fiindca aplatizam: crezand altceva, ar astepta structura
   * `<Variations>` si ar putea grupa gresit articolele.
   */
  assert.match(m, /NU conține produse cu variații/);
  assert.match(m, /transport/i);
  assert.match(m, /termen/i);
});

/* ══════════════════════════════════════════════════════════════════════════
   FIECARE ACTIUNE E O USA PUBLICA
   ══════════════════════════════════════════════════════════════════════════

   ⚠ Intr-un fisier `"use server"`, FIECARE export e un capat pe care oricine il poate
   chema, cu ce argumente vrea. `businessId` vine din browser, deci o actiune fara poarta
   ar lucra pe magazinul altcuiva. tsc si eslint nu au ce sa spuna despre asta.

   ⚠ Proba SCANEAZA SURSA, si stie ce poate: confirma ca fiecare functie CHEAMA poarta, nu
   ca poarta e corecta. Corectitudinea portii sta in `poarta()` insasi, intr-un singur loc,
   si acolo se citeste.
*/

test("⚠ fiecare actiune Pepita trece prin poarta de proprietate", () => {
  const cod = readFileSync("src/lib/actions/pepita.actions.ts", "utf8");
  assert.match(cod, /^"use server";/, "fisierul chiar e unul de actiuni");

  const bucati = cod.split(/\nexport (?:async )?function /).slice(1);
  assert.ok(bucati.length >= 10, `asteptam actiunile, am gasit ${bucati.length}`);

  const fara: string[] = [];
  for (const b of bucati) {
    const nume = b.slice(0, b.indexOf("("));
    const sfarsit = b.indexOf("\n}\n");
    const corp = sfarsit === -1 ? b : b.slice(0, sfarsit);
    if (!corp.includes("await poarta(")) fara.push(nume);
  }
  assert.deepEqual(fara, [], "actiuni fara poarta de proprietate");
});

test("⚠ cheile nu pleaca spre browser odata cu starea integrarii", () => {
  /*
   * `configFaraChei` le scoate, si numai `dezvaluieAdresele` le mai poate scoate din baza.
   * Daca vreodata mai apare un loc, regula „cheia nu coboara cu pagina" se pierde fara ca
   * nimic sa dea eroare: ar sta in sarcina RSC a fiecarei incarcari.
   */
  const cod = readFileSync("src/lib/actions/pepita.actions.ts", "utf8");
  const citiri = cod.match(/config\.(feed_token|order_key)/g) ?? [];
  const bucati = cod.split(/\nexport (?:async )?function /).slice(1);
  const careLeCitesc = bucati
    .filter((b) => /config\.(feed_token|order_key)/.test(b))
    .map((b) => b.slice(0, b.indexOf("(")));
  assert.ok(citiri.length > 0, "proba stie sa gaseasca citirile");
  assert.deepEqual(careLeCitesc.sort(), ["activeazaPepita", "dezvaluieAdresele"]);
});

/* ══════════════════════════════════════════════════════════════════════════
   ZEROUL FALS
   ══════════════════════════════════════════════════════════════════════════

   ⚠ O interogare PostgREST cazuta NU ARUNCA: intoarce `{ count: null, error }`. Cifrele din
   panou se citeau cu `count ?? 0`, iar `catch`-ul de dedesubt nu se aprindea niciodata. Deci o
   pana a bazei arata exact ca un magazin fara nicio comanda: „0 primite, 0 cu probleme".

   ⚠ CE APARA PROBELE DE AICI, SI CE NU. Ele scaneaza sursa, deci spun ca forma e cea buna, nu
   ca se poarta bine la o pana adevarata. Purtarea o apara `tsc`: `comenziTotal` fiind
   `number | null`, niciun consumator nu mai poate trata necunoscutul ca pe un numar fara sa fie
   numit. Proba pazeste tocmai intoarcerea la tipul care nu se poate gresi.
*/

const ACTIUNI = readFileSync("src/lib/actions/pepita.actions.ts", "utf8");

test("⚠ cifrele panoului pot fi NECUNOSCUTE, nu doar zero", () => {
  assert.match(ACTIUNI, /comenziTotal: number \| null/, "cifra a redevenit un numar care nu poate lipsi");
  assert.match(ACTIUNI, /comenziCarantina: number \| null/);
  assert.match(ACTIUNI, /citiriPicate/, "nu se mai spune CE nu s-a putut citi");
});

test("⚠ o citire cazuta nu se mai numara ca zero", () => {
  assert.match(ACTIUNI, /total\.error \? null :/, "`count ?? 0` peste o citire cazuta da zero fals");
  assert.match(ACTIUNI, /carantina\.error \? null :/);
});

test("⚠ panoul arata necunoscutul ca necunoscut", () => {
  const panou = readFileSync("src/components/dashboard/PepitaClient.tsx", "utf8");
  assert.match(panou, /valoare \?\? "—"/, "cifra necunoscuta se randeaza tot ca un numar");
});

/* ══════════════════════════════════════════════════════════════════════════
   VERIFICAREA PRODUSELOR: PLIMBARE PE CHEIE, SI NECUNOSCUTUL NU E ZERO
   ══════════════════════════════════════════════════════════════════════════

   ⚠ Aici nu conteaza doar ca citirea e completa. Articolele unui produs SARIT de o plimbare pe
   offset raman in evidenta si sunt numarate ORFANE, iar comerciantului i se spune sa ceara
   scoaterea lor de la Pepita: adica sa-si stinga listari vii.
*/

test("⚠ verificarea produselor se plimba pe CHEIE, nu pe offset", () => {
  /*
   * ⚠ ANCORAT PE RANDUL EXACT. Prima forma cerea doar „exista un `.gt(\"id\"` in bucata", iar
   * bucata mai contine unul: sondajul care afla daca mai e ceva dincolo de plafon. Mutantul care
   * scotea plimbarea trecea verde.
   */
  const bucata = ACTIUNI.slice(ACTIUNI.indexOf("let dupaId"), ACTIUNI.indexOf("const exempleOrfane"));
  assert.match(bucata, /if \(dupaId\) q = q\.gt\("id", dupaId\)/,
    "plimbare pe offset: un import care ruleaza in acelasi timp face sa fie sarit un produs");
  assert.ok(!/\.range\(/.test(bucata), "a ramas o plimbare pe offset");

  /*
   * ⚠ SI SONDAJUL DE PLAFON NU-SI INGHITE EROAREA. Inghitita, ea da `partial: false`, adica „am
   * parcurs tot catalogul" — iar de asta atarna blocul de orfani: pe un catalog citit pe
   * jumatate, produsele nevazute apar ca articole ORFANE, si comerciantului i se spune sa ceara
   * scoaterea lor de la Pepita, adica sa-si stinga listari vii.
   */
  assert.match(bucata, /eSondaj \? true :/, "o citire cazuta se citeste drept „am parcurs tot catalogul”");
});

test("⚠ orfanii nu se socotesc cand nu se poate: `null`, nu zero", () => {
  /* Ancorat pe CAMPUL din interfata: variabila locala are acelasi tip si trecea in locul lui. */
  assert.match(ACTIUNI, /orfane: number \| null;\s*\n\s*exempleOrfane: string\[\];/,
    "campul din rezumat a redevenit un numar care nu poate lipsi");

  /*
   * ⚠ SI CATCH-UL TREBUIE SA INGHITA, nu sa arunce mai departe: blocul asta e o socoteala in
   * plus, iar o exceptie din el sterge TOT ecranul de verificare.
   */
  const i = ACTIUNI.indexOf("const exempleOrfane");
  const bucata = ACTIUNI.slice(i, i + 2400);
  const j = bucata.indexOf("} catch (e) {");
  assert.ok(j > 0, "blocul orfanilor n-are catch propriu");
  /*
   * ⚠ CORPUL SE TAIE PE ACOLADE, nu pe un numar de semne. Fereastra de 200 nu acoperea corpul,
   * care are 267: un `throw e;` pus in coada lui trecea verde.
   */
  let adanc = 0;
  let sfarsit = bucata.length;
  for (let k = bucata.indexOf("{", j); k < bucata.length; k++) {
    if (bucata[k] === "{") adanc++;
    else if (bucata[k] === "}") { adanc--; if (adanc === 0) { sfarsit = k; break; } }
  }
  const corp = bucata.slice(j, sfarsit);
  assert.ok(!/throw/.test(corp), "catch-ul arunca mai departe, deci sterge tot panoul");
  assert.match(corp, /orfane = null/, "catch-ul nu marcheaza cifra ca necunoscuta");
});

test("⚠ „ultima comanda” nu se afirma pe o citire cazuta", () => {
  assert.match(ACTIUNI, /ultimaComanda: ultima\.error \? null :/,
    "o citire cazuta se scrie ca „nicio comanda”, adica exact zeroul fals");
});
