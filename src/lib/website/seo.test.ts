import { strict as assert } from "node:assert";
import { test } from "node:test";
import { existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { CARDURI_SEO, CAUTARE, REZULTATE_ORGANICE, REZULTATE_SHOPPING } from "./seo";

const AICI = dirname(fileURLToPath(import.meta.url));
const PUBLIC = join(AICI, "..", "..", "..", "public");

test("fiecare rezultat are chiar fișierul lui pe disc", () => {
  /*
    O poză lipsă nu dă nicio eroare: `next/image` desenează o casetă goală, iar
    ilustrația arată ca un raft cu rafturi goale. Se vede doar dacă cineva se uită
    exact la cardul ăla, pe ecranul ăla.
  */
  for (const r of REZULTATE_SHOPPING) {
    const cale = join(PUBLIC, r.imagine.replace(/^\//, ""));
    assert.ok(existsSync(cale), `lipsește ${r.imagine}`);
  }
});

test("rezultatele sunt patru, cu prețuri toate diferite", () => {
  /* Patru: atâtea a trimis clientul, și atâtea intră în grila de două pe două. */
  assert.equal(REZULTATE_SHOPPING.length, 4);

  /* „Un preț, dar să fie diferit la toate" — cerut de client. Două prețuri egale
     într-un raft de rezultate se citesc ca o scăpare de copiere. */
  const preturi = new Set(REZULTATE_SHOPPING.map((r) => r.pret));
  assert.equal(preturi.size, REZULTATE_SHOPPING.length, "două rezultate au același preț");

  const nume = new Set(REZULTATE_SHOPPING.map((r) => r.nume));
  assert.equal(nume.size, REZULTATE_SHOPPING.length, "două rezultate au același nume");

  const poze = new Set(REZULTATE_SHOPPING.map((r) => r.imagine));
  assert.equal(poze.size, REZULTATE_SHOPPING.length, "aceeași poză la două rezultate");
});

test("prețurile sunt scrise cum le scrie Google", () => {
  /* ⚠ „RON", nu „lei", deși restul site-ului scrie „lei": desenul e al lor, deci
     și scrierea. În captura trimisă de client toate opt scriu RON. */
  for (const r of REZULTATE_SHOPPING) {
    assert.match(r.pret, /^\d{1,3}(\.\d{3})*,\d{2} RON$/, `preț ciudat: ${r.pret}`);
  }
});

test("numele intră pe două rânduri în tigla cea mai îngustă", () => {
  /*
    Tigla taie numele la două rânduri (`line-clamp-2`), iar cutia are exact
    două: așa stau cele patru prețuri pe aceeași linie.

    ⚠ PRAGUL E MĂSURAT, NU GHICIT. Tigla cea mai îngustă e de 104px (minimul din
    `PanouCautareGoogle`), din care scăzând spațierea rămân vreo 79px de text la
    corp de 10,4px — cam 17-18 semne pe rând. Măsurat în browser pe 320-1920,
    toate patru numele de acum stau pe două rânduri; cel mai lung are 35 de
    semne. Peste 36 începe să se taie cu trei puncte CHIAR PE ECRANELE MICI,
    unde nimeni nu se uită, deci proba e singurul loc unde se vede.

    ⚠ Pragul a mai fost o dată 60, când numele stăteau pe trei rânduri. Clientul
    a cerut (13.08) ca al patrulea să intre pe două ca celelalte, deci cutia a
    coborât la două rânduri și pragul odată cu ea.
  */
  for (const r of REZULTATE_SHOPPING) {
    assert.ok(r.nume.length <= 36, `${r.nume}: ${r.nume.length} semne, se va tăia`);
  }
});

test("căutarea e chiar cea cerută", () => {
  assert.equal(CAUTARE, "Camera de Supraveghere");
});

test("cardurile secțiunii au tot ce le trebuie", () => {
  const vazute = new Set<string>();
  for (const card of CARDURI_SEO) {
    assert.equal(vazute.has(card.id), false, `${card.id} apare de două ori`);
    vazute.add(card.id);
    assert.ok(card.titlu.length > 0);
    assert.ok(card.descriere.length > 30, `${card.id}: descriere prea scurtă`);
  }
  /* ⚠ Clientul a cerut PATRU. Când vin și celelalte trei texte, numărul de aici
     se ridică la 4 — până atunci proba spune limpede unde a rămas lucrul. Grila e
     de două coloane, deci orice număr impar lasă o celulă goală. */
  assert.ok(
    CARDURI_SEO.length >= 1 && CARDURI_SEO.length <= 4,
    "secțiunea are între unu și patru carduri",
  );
});

/* ─── Cardul 2: rezultate obișnuite pe Google ─────────────────────────────── */

test("unul singur e al nostru", () => {
  /* Zero: ilustrația arată trei magazine străine și nu spune nimic. Două:
     chenarul verde apare de două ori și comparația se destramă. */
  const alenoastre = REZULTATE_ORGANICE.filter((r) => r.alNostru);
  assert.equal(alenoastre.length, 1, "trebuie exact un rezultat al nostru");
});

test("adresa noastră e una de pildă, nu a cuiva", () => {
  /*
    ⚠ ASTA E O PROBĂ DE SIGURANȚĂ, nu de desen.

    Adresele firești pentru un exemplu românesc — `magazinul-tau.ro`,
    `magazinultau.ro`, `acme.ro` — sunt TOATE LUATE. Verificat prin DNS, nu
    presupus. Oricare dintre ele, scrisă lângă un chenar verde și eticheta
    „optimizat", ar lega magazinul altcuiva de reclama noastră.

    `exemplu.ro` nu se rezolvă și spune singur ce e. Dacă cineva pune vreodată
    altceva, proba îl oprește.
  */
  const alNostru = REZULTATE_ORGANICE.find((r) => r.alNostru);
  assert.ok(alNostru, "lipsește rezultatul nostru");
  assert.ok(
    alNostru.cale.startsWith("www.exemplu.ro"),
    `adresa noastră e pe ${alNostru.cale} — trebuie una de pildă, nu a cuiva`,
  );
});

test("vecinii au nume care par adevărate, pe adrese care nu sunt", () => {
  /*
    ⚠ CEA MAI IMPORTANTĂ PROBĂ DIN FIȘIER.

    Clientul a cerut ca vecinii să arate a magazine adevărate, nu a substituenți
    — și au nume care sună a magazin. Dar titlurile lor sunt SCRISE DE NOI, scurte
    și goale, ca să se vadă prost optimizate, iar asta se întâmplă pe pagina
    noastră de vânzare. Pe numele unui magazin adevărat, ar fi o afirmație despre
    firma aia, și una inventată: titlul nu e al lor.

    De aceea fiecare domeniu de aici a fost verificat prin DNS și NU SE REZOLVĂ.
    Lista de mai jos ține minte ce am găsit LUAT, ca nimeni să nu le pună înapoi
    fiindcă „sună bine". Cine adaugă un vecin nou verifică întâi domeniul.
  */
  const LUATE = [
    "magazinul-tau.ro",
    "www.magazinultau.ro",
    "magazinultau.ro",
    "acme.ro",
    "demo.ro",
    "tehnomarket.ro",
    "securityshop.ro",
    "electrocasa.ro",
    "magazin.ro",
    "shop.ro",
  ];
  for (const r of REZULTATE_ORGANICE) {
    if (r.alNostru) continue;
    const gazda = r.cale.split(" ")[0];
    assert.ok(
      !LUATE.includes(gazda),
      `${gazda} e un domeniu adevărat, al altcuiva — nu se pune lângă un titlu slab scris de noi`,
    );
    assert.ok(!gazda.startsWith("edinio."), `${gazda}: un vecin slab nu stă pe domeniul nostru`);
  }
});

test("titlurile vecinilor sunt scurte și goale", () => {
  /*
    Cerut de client: „titluri scurte și slabe, să pară prost optimizate față de
    ale noastre". Aici se măsoară chiar deosebirea aia — dacă cineva le
    îmbunătățește din greșeală, cardul nu mai are ce arăta.
  */
  const alNostru = REZULTATE_ORGANICE.find((r) => r.alNostru);
  assert.ok(alNostru);
  for (const r of REZULTATE_ORGANICE) {
    if (r.alNostru) continue;
    assert.ok(
      r.titlu.length <= 22,
      `„${r.titlu}" are ${r.titlu.length} semne — prea lung ca să treacă drept titlu nelucrat`,
    );
    assert.ok(
      alNostru.titlu.length > r.titlu.length * 2,
      `titlul nostru nu se deosebește destul de „${r.titlu}"`,
    );
  }
});

test("titlul și descrierea noastră intră întregi", () => {
  /*
    ⚠ PRAGURILE SUNT MĂSURATE ÎN BROWSER, nu luate din ghiduri de SEO.

    Panoul e de 196-438px, după lățimea ferestrei. Titlul se taie la două
    rânduri, descrierea la trei. La 438px (calculator) încap vreo 60 de semne pe
    rândul de titlu și vreo 62 pe cel de descriere.

    Rostul: tăierea trebuie să lovească rezultatele SLABE, nu pe al nostru. Prima
    formă avea titlul tăiat la un rând și descrierea la două, iar ce ieșea ciuntit
    era chiar textul lucrat — adică desenul spunea pe dos față de card.
  */
  const alNostru = REZULTATE_ORGANICE.find((r) => r.alNostru);
  assert.ok(alNostru);
  assert.ok(
    alNostru.titlu.length <= 60,
    `titlul nostru are ${alNostru.titlu.length} semne; peste 60 se taie și pe Google`,
  );
  assert.ok(
    alNostru.descriere.length <= 120,
    `descrierea noastră are ${alNostru.descriere.length} semne; peste 120 se taie pe calculator`,
  );
});

test("cele trei rezultate sunt deosebite între ele", () => {
  const cai = new Set(REZULTATE_ORGANICE.map((r) => r.cale));
  const titluri = new Set(REZULTATE_ORGANICE.map((r) => r.titlu));
  assert.equal(cai.size, REZULTATE_ORGANICE.length, "două rezultate au aceeași adresă");
  assert.equal(titluri.size, REZULTATE_ORGANICE.length, "două rezultate au același titlu");

  for (const r of REZULTATE_ORGANICE) {
    assert.equal(r.initiala.length, 1, `${r.site}: bulina ține o singură literă`);
    assert.ok(r.descriere.length > 20, `${r.site}: descriere prea scurtă ca să pară adevărată`);
  }
});
