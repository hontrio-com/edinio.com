import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { apiFaraPoarta } from "@/lib/auth/poarta-mfa";
import {
  MARKETPLACE_CU_CICLU_PROPRIU, MARKETPLACE_ORIGINI, deriveOrigin,
  marketplaceCareTineComanda, mementoulMarketplace,
} from "@/lib/orders/origin";
import { PEPITA, PIETE } from "./types";
import { sablonMesajPepita } from "./activare";
import { citesteConfig, peticDePornire } from "./config";

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
   * ⚠ Cele PATRU raspunsuri pe care le cer: variatii, cost de transport, termen de livrare
   * si tara. Iar raspunsul la primul e „nu", fiindca aplatizam: crezand altceva, ar astepta
   * structura `<Variations>` si ar putea grupa gresit articolele.
   */
  assert.match(m, /NU conține produse cu variații/);
  assert.match(m, /transport/i);
  assert.match(m, /termen/i);
  /*
   * ⚠ A PATRA A FOST ADAUGATA PE 09.09.2026, si proba asta a fost VERDE peste lipsa ei.
   *
   * Se numea „raspunde la tot ce cere Seller Center-ul lor" si verifica trei lucruri, fiindca
   * trei scriau in documentatia lor. Apoi Pepita a intrebat un comerciant, prin email, „pentru
   * ce tara a fost creat acest lucru", si atunci s-a vazut ca „tot" insemna „tot ce stiam noi".
   *
   * ⚠ Lectia nu e despre Pepita: o proba care numara punctele unei liste nu poate afla ca lista
   * e incompleta. Vezi [[forma-noua-si-probele-vechi]]. Cand mai apare o cerinta de la ei,
   * randul ei se adauga AICI, nu doar in sablon.
   */
  assert.match(m, /Țara pentru care este creat feedul/);
  assert.match(m, /România/);
  assert.match(m, /RON/);
  /*
   * ⚠ SI ADRESA LOR E `pepita.com/ro`, NU `pepita.ro`.
   *
   * Prima forma a randului spunea `pepita.ro`, si acel domeniu NU EXISTA: nu raspunde deloc,
   * verificat prin HTTP pe 09.09.2026. Piata romaneasca sta pe o cale, nu pe un domeniu de
   * tara, exact ca la alte marketplace-uri regionale.
   *
   * ⚠ Proba asta nu poate afla ca un domeniu raspunde, si nici nu incearca. Ea apara altceva:
   * ca nimeni nu „indreapta" adresa inapoi la forma care pare logica. Greseala n-a fost prinsa
   * de cod, ci de proprietar, dupa ce textul plecase deja spre un comerciant.
   */
  assert.match(m, /pepita\.com\/ro/);
  assert.ok(!/pepita\.ro/.test(m), "pepita.ro nu exista; adresa pietei romanesti e pepita.com/ro");
  assert.equal(PIETE.ro.adresa, "pepita.com/ro");
});

/* ══════════════════════════════════════════════════════════════════════════
   PORNIREA NU ARE VOIE SA LASE FEEDUL GOL
   ══════════════════════════════════════════════════════════════════════════

   ⚠ 09.09.2026. Toate cele trei magazine cu Pepita pornit serveau un `<Catalog>` valid si
   GOL, iar unul dintre ele avea 1.353 de produse active. Defectul l-a gasit Pepita, printr-un
   email catre comerciant („fluxurile trimise sunt goale”), fiindca nimic din Edinio nu-l
   putea arata: feedul raspundea 200, panoul arata bifa verde „Pepita citește feedul”, si
   citirile lor chiar aveau loc, in fiecare zi.

   Cauza: `activeazaPepita` scria doar `{activ: true}` plus cheile, iar `citesteConfig`
   citeste un `mod_includere` lipsa ca „selectate”. Zero randuri in `pepita_listari` inseamna
   atunci zero produse in feed.
   ══════════════════════════════════════════════════════════════════════════ */

test("⚠ pornirea scrie modul de includere cand el LIPSESTE, ca feedul sa nu plece gol", () => {
  /* Chiar starea celor trei magazine: pornit, adresele trimise, si nimic despre produse. */
  assert.deepEqual(
    peticDePornire({ activ: true, trimis_la: "2026-09-08T15:24:20.950Z" }),
    { mod_includere: "toate" },
  );
  assert.deepEqual(peticDePornire({}), { mod_includere: "toate" });
  assert.deepEqual(peticDePornire(null), { mod_includere: "toate" });
  /* Un JSON stricat nu trebuie sa arunce: pornirea integrarii n-are voie sa cada din asta. */
  assert.deepEqual(peticDePornire("nu e obiect"), { mod_includere: "toate" });
  assert.deepEqual(peticDePornire({ mod_includere: "aiurea" }), { mod_includere: "toate" });
});

test("⚠ dar NU atinge o alegere pe care omul a facut-o deja", () => {
  /*
   * Cazul care face regula sa merite o functie: cine a ales dinadins „doar produsele alese
   * de mine”, apoi a oprit si a repornit integrarea, si-ar fi vazut TOT catalogul plecand la
   * Pepita fara sa fi cerut asta. O reparatie care rezolva feedul gol si publica in schimb
   * catalogul cuiva nu e o reparatie.
   */
  assert.deepEqual(peticDePornire({ activ: false, mod_includere: "selectate" }), {});
  assert.deepEqual(peticDePornire({ mod_includere: "toate" }), {});
});

test("⚠ implicitul din `citesteConfig` RAMANE „selectate”, si asta nu e o scapare", () => {
  /*
   * Cele doua reguli trag in directii opuse, dinadins, fiindca apara lucruri diferite.
   * `citesteConfig` apara un JSON stricat sau golit de o salvare partiala: acolo „nu trimite”
   * e directia sigura. `peticDePornire` apara apasarea pe „pornește integrarea”, care e o
   * cerere limpede de a vinde pe Pepita.
   *
   * Proba asta exista ca sa nu „simplifice” cineva mutand implicitul pe „toate”: atunci un
   * `pepita_config` stricat ar publica singur tot catalogul.
   */
  assert.equal(citesteConfig({ activ: true }).mod_includere, "selectate");
  assert.equal(citesteConfig(null).mod_includere, "selectate");
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
   ⚠ OPRIREA CHIAR STERGE CHEILE
   ══════════════════════════════════════════════════════════════════════════

   `jsonb_merge_config` trata un `null` pe o cale secreta ca pe „lasa valoarea veche", fiindca
   verificarea se facea pe `#>>`, iar `#>>` da SQL NULL si pentru „calea lipseste", si pentru
   „valoarea e JSON null". Deci `deconecteazaPepita` NU stergea cheile, desi comentariul lui
   spunea raspicat ca le sterge, iar `activeazaPepita` le gasea acolo si INVIA adresa veche.
   Cine isi oprea integrarea fiindca i se scursese adresa si-o rearma la repornire.

   Reparat in `migrations/2027-01-06-null-pe-un-secret-inseamna-sterge.sql`, probat pe productie
   intr-o tranzactie anulata: `null` sterge, sirul gol pastreaza, calea lipsa ramane neatinsa.

   ⚠ Probele de aici pazesc partea din TypeScript. Daca cineva schimba `null` in `""` „ca sa fie
   ca la celelalte ecrane", stergerea se stinge in tacere si nimic n-ar mai arata-o: functia din
   Postgres ar face exact ce i se cere.
   ══════════════════════════════════════════════════════════════════════════ */

test("⚠ oprirea trimite `null`, nu sir gol: numai `null` sterge secretul", () => {
  const bucata = ACTIUNI.slice(ACTIUNI.indexOf("export async function deconecteazaPepita"));
  assert.match(bucata, /feed_token: null/, "sir gol inseamna pastreaza, deci cheia ar supravietui opririi");
  assert.match(bucata, /order_key: null/);
});

test("⚠ migratia exista si desparte cele trei intelesuri", () => {
  const m = readFileSync("migrations/2027-01-06-null-pe-un-secret-inseamna-sterge.sql", "utf8");
  /* Stergerea se citeste din PETIC, nu din documentul imbinat: altfel un `null` mai vechi ar
     sterge campul la orice salvare care nu-l pomeneste. */
  assert.match(m, /jsonb_typeof\(p_patch #> v_parti\) = 'null'/);
  assert.match(m, /v_nou := v_nou #- v_parti/);
  /* Iar plasa pentru parola mascata RAMANE: fara ea, orice salvare de formular ar goli cheia. */
  assert.match(m, /coalesce\(v_nou_val, ''\) = '' and coalesce\(v_vechi, ''\) <> ''/);
});

/* ══════════════════════════════════════════════════════════════════════════
   ⚠ BIFA VERDE NU ARE VOIE SA STEA PESTE UN FEED GOL
   ══════════════════════════════════════════════════════════════════════════

   09.09.2026. Starea din „Conexiune" se socotea din `activ && areFeedToken && areOrderKey`
   plus ultima citire: „exista chei" si „cineva a deschis adresa". Nimic despre CONTINUT. Trei
   magazine din trei au avut bifa verde si „Pepita citește feedul" peste un `<Catalog>` gol,
   unul dintre ele cu 1.353 de produse active, iar comerciantul a aflat dintr-un email al lor.

   Acelasi tipar ca [[santinela-continut]]: patru defecte grave care raspund toate 200.
   ══════════════════════════════════════════════════════════════════════════ */

test("⚠ starea panoului duce si o cifra despre CATALOG, nu doar despre comenzi", () => {
  assert.match(ACTIUNI, /produseAlese: number \| null/,
    "panoul a ramas fara nicio cifra despre ce contine feedul");
  assert.match(ACTIUNI, /CITIRI_PANOU\.produse/,
    "o citire cazuta a catalogului nu mai spune CE n-a mers");
});

test("⚠ si cifra aia poate fi NECUNOSCUTA, nu doar zero", () => {
  /* Un zero inventat dintr-o citire cazuta aprinde alarma de feed gol peste un feed plin. */
  assert.match(ACTIUNI, /active\.error \|\| exceptii\.error\s*\n?\s*\? null/,
    "`count ?? 0` peste o citire cazuta da un zero fals, adica o alarma falsa");
});

test("⚠ numaratoarea sare peste produsele DEZACTIVATE", () => {
  /*
   * Fara `products!inner` + `is_active`, o listare ramasa pe un produs dezactivat s-ar fi
   * numarat: pe „toate" ar fi scazut din total un produs care oricum nu pleaca, iar pe
   * „selectate" ar fi umflat cifra. Panoul ar fi mintit despre feed exact in felul pe care
   * `COLOANE_PRODUS` il evita, prin aceeasi lectie.
   */
  assert.match(ACTIUNI, /products!inner/);
  assert.match(ACTIUNI, /\.eq\("products\.is_active", true\)/);
});

test("⚠ feedul gol se recunoaste cu `=== 0`, NU cu o verificare adevarat/fals", () => {
  /*
   * `produseAlese` e `number | null`. Cu `!produseAlese`, si `null` ar fi trecut drept feed
   * gol, deci o pana a bazei ar fi aprins alarma peste un feed plin: minciuna inversa, si la
   * fel de rea. Aceeasi lectie ca la [[boolean-devenit-obiect-se-redenumeste]]: forma
   * valorii decide ce verificare e corecta.
   */
  const panou = readFileSync("src/components/dashboard/PepitaClient.tsx", "utf8");
  assert.match(panou, /const feedGol = stare\.produseAlese === 0;/);
  assert.ok(!/!stare\.produseAlese/.test(panou), "verificare adevarat/fals peste `number | null`");
  /* Si bifa verde chiar atarna de ea, in amandoua ramurile ei. */
  assert.match(panou, /gata && !feedGol && aCitit/);
  assert.match(panou, /gata && !feedGol && !aCitit/);
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
