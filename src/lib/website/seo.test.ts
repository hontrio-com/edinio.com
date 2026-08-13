import { strict as assert } from "node:assert";
import { test } from "node:test";
import { existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import {
  CARDURI_SEO,
  CAUTARE,
  REZULTATE_ORGANICE,
  REZULTATE_SHOPPING,
  INDEXARE,
  PAGINI_INDEXATE,
  SITEMAP_EXEMPLU,
  SITEMAP_GAZDA,
} from "./seo";

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
  /* ⚠ PATRU, atâtea a cerut clientul, și toate patru au acum textele lui.
     Numărul nu mai e un interval: grila e de două coloane, deci un al cincilea
     card ar rămâne singur pe ultimul rând, iar trei ar lăsa o celulă goală. */
  assert.equal(CARDURI_SEO.length, 4, "secțiunea are exact patru carduri");
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

/* ─── Cardul 3: sitemap ───────────────────────────────────────────────────── */

test("sitemapul din ilustrație are chiar valorile generatorului", () => {
  /*
    ⚠ ASTA E O LISTĂ DE VERIFICAT FAȚĂ DE `app/sitemap.ts`, nu o probă de desen.

    Tabelul de mai jos e CITIT dintr-un sitemap viu scos de Edinio
    (`bricosmart.ro` prin `edinio.com`, 1169 de adrese, 13.08.2026). Clientul a
    cerut ilustrația „identică 1 la 1 cu realitatea", iar singurul fel în care
    asta rămâne adevărat peste șase luni e ca proba să cadă când generatorul se
    schimbă și ilustrația nu.

    Dacă proba pică după o modificare la sitemap: deschide sitemapul unui magazin
    adevărat, citește ce scrie acum și potrivește AICI, apoi în `SITEMAP_EXEMPLU`.
  */
  const ASTEPTAT: Record<string, { changefreq: string; priority: string }> = {
    acasa: { changefreq: "weekly", priority: "1" },
    catalog: { changefreq: "daily", priority: "0.9" },
    categorie: { changefreq: "daily", priority: "0.8" },
    produs: { changefreq: "weekly", priority: "0.7" },
    politica: { changefreq: "yearly", priority: "0.3" },
  };

  for (const intrare of SITEMAP_EXEMPLU) {
    const astept = ASTEPTAT[intrare.fel];
    assert.ok(astept, `fel necunoscut: ${intrare.fel}`);
    assert.equal(
      intrare.changefreq,
      astept.changefreq,
      `${intrare.fel}: changefreq ar trebui ${astept.changefreq}`,
    );
    assert.equal(
      intrare.priority,
      astept.priority,
      `${intrare.fel}: priority ar trebui ${astept.priority}`,
    );
  }
});

test("lastmod e ISO întreg, cum îl scrie toISOString", () => {
  /*
    Generatorul folosește `toISOString()`, deci scrie milisecunde și `Z`. Forma
    lungă e chiar semnul că e ieșire de mașină; scurtată la o dată simplă „ca să
    încapă", ilustrația ar arăta ca un tabel scris de noi.
  */
  for (const intrare of SITEMAP_EXEMPLU) {
    assert.match(
      intrare.lastmod,
      /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/,
      `lastmod scris altfel: ${intrare.lastmod}`,
    );
    assert.equal(
      Number.isNaN(new Date(intrare.lastmod).getTime()),
      false,
      `lastmod nu e o dată adevărată: ${intrare.lastmod}`,
    );
  }
});

test("paginile magazinului împart o oră, produsul are alta", () => {
  /*
    În sitemapul viu, paginile magazinului poartă toate `updated_at`-ul
    magazinului, iar fiecare produs pe al lui. E amănuntul care spune că harta se
    reface pe bucăți, nu toată odată — și singurul care s-ar pierde dacă cineva
    ar pune aceeași oră peste tot „ca să fie curat".
  */
  const alePaginilor = new Set(
    SITEMAP_EXEMPLU.filter((i) => i.fel !== "produs").map((i) => i.lastmod),
  );
  const aleProduselor = new Set(
    SITEMAP_EXEMPLU.filter((i) => i.fel === "produs").map((i) => i.lastmod),
  );

  assert.equal(alePaginilor.size, 1, "paginile magazinului ar trebui să aibă aceeași oră");
  for (const ora of aleProduselor) {
    assert.equal(alePaginilor.has(ora), false, "produsul are aceeași oră ca paginile");
  }
});

test("ilustrația arată și pagini, și produse", () => {
  /* Cerut de client: „un exemplu de sitemap cu pagini și produse în el". */
  const feluri = new Set(SITEMAP_EXEMPLU.map((i) => i.fel));
  assert.ok(feluri.has("produs"), "lipsește un produs din exemplu");
  assert.ok(feluri.size >= 3, "exemplul arată prea puține feluri de pagini");
  assert.ok(feluri.has("acasa"), "lipsește pagina de start");
});

test("adresele din sitemap sunt pe aceeași gazdă de pildă ca la cardul 2", () => {
  /*
    Aceeași gazdă la amândouă ilustrațiile: sunt același magazin, o dată în
    rezultate și o dată în harta lui. Și, ca la cardul 2, e un domeniu care nu se
    rezolvă — un sitemap plin de adrese ale cuiva adevărat, pe pagina noastră, ar
    fi altceva decât un desen.
  */
  assert.equal(SITEMAP_GAZDA, "https://www.exemplu.ro");

  const cai = new Set(SITEMAP_EXEMPLU.map((i) => i.cale));
  assert.equal(cai.size, SITEMAP_EXEMPLU.length, "două intrări au aceeași cale");

  for (const intrare of SITEMAP_EXEMPLU) {
    assert.ok(
      intrare.cale === "" || intrare.cale.startsWith("/"),
      `calea „${intrare.cale}" nu începe cu /`,
    );
  }
});

/* ─── Cardul 4: raportul de indexare ──────────────────────────────────────── */

test("raportul arată un magazin sănătos, dar nu unul care se laudă", () => {
  /*
    În captura trimisă de client scria 1,9 mii neindexate față de 95 indexate —
    un site pe care Google nu-l poate citi. Aici e pe dos, și asta e mesajul.

    ⚠ DAR NU ZERO NEINDEXATE, și nu din modestie. Coșul și finalizarea comenzii
    sunt `noindex` la noi dinadins: sunt pași ai cumpărării, n-au ce căuta în
    căutări. Un raport cu zero neindexate ar fi arătat ca un magazin care nu știe
    ce face. Dacă cineva „rotunjește" cifra la 0 ca să pară mai bine, proba cade.
  */
  const indexate = Number(INDEXARE.indexate.valoare);
  const neindexate = Number(INDEXARE.neindexate.valoare);

  assert.ok(Number.isFinite(indexate) && Number.isFinite(neindexate), "cifre necitibile");
  assert.ok(indexate > neindexate * 20, "raportul nu arată destul de sănătos");
  assert.ok(neindexate > 0, "zero neindexate: coșul și finalizarea SUNT noindex, dinadins");
});

test("lista de pagini e a aceluiași magazin ca la cardurile 2 și 3", () => {
  /*
    Cele patru ilustrații ale secțiunii sunt patru priviri asupra ACELUIAȘI
    magazin: cum arată în rezultate, ce scrie în harta lui, ce vede Google când o
    citește. Cu alt magazin la fiecare card, secțiunea s-ar citi ca patru capturi
    adunate de pe internet.

    Aici se verifică doar că paginile sunt căi, nu adrese întregi: gazda o pune
    componenta, din `SITEMAP_GAZDA`, deci nu poate să se depărteze.
  */
  assert.ok(PAGINI_INDEXATE.length >= 3, "prea puține pagini în listă");
  for (const pagina of PAGINI_INDEXATE) {
    assert.ok(pagina.cale.startsWith("/"), `„${pagina.cale}" nu e o cale`);
    assert.ok(
      !pagina.cale.includes("://"),
      `„${pagina.cale}" e o adresă întreagă; gazda o pune componenta`,
    );
  }

  const cai = new Set(PAGINI_INDEXATE.map((p) => p.cale));
  assert.equal(cai.size, PAGINI_INDEXATE.length, "aceeași pagină de două ori în listă");
});

test("datele din listă sunt scrise cum le scrie Search Console în românește", () => {
  /* „13 aug. 2026" — zi, lună prescurtată cu punct, an. */
  const LUNI = ["ian.", "feb.", "mar.", "apr.", "mai", "iun.", "iul.", "aug.", "sept.", "oct.", "nov.", "dec."];
  for (const pagina of PAGINI_INDEXATE) {
    const parti = pagina.accesata.split(" ");
    assert.equal(parti.length, 3, `dată scrisă altfel: ${pagina.accesata}`);
    assert.ok(LUNI.includes(parti[1]), `lună necunoscută: ${parti[1]}`);
    assert.match(parti[0], /^\d{1,2}$/, `zi ciudată: ${parti[0]}`);
    assert.match(parti[2], /^\d{4}$/, `an ciudat: ${parti[2]}`);
  }
});

test("fiecare card SEO are ilustrația lui", () => {
  /*
    Ilustrațiile se aleg pe `id` în `SectiuneSeo`, nu pe poziție. Proba ține
    minte care sunt cele patru chei: dacă cineva redenumește una în `CARDURI_SEO`,
    cardul rămâne pe pagină cu titlu și descriere, dar FĂRĂ ilustrație — și nimic
    nu se plânge, fiindcă `card.id === "..."` pur și simplu nu se mai potrivește.
  */
  const CU_ILUSTRATIE = ["gasire", "prezentare", "sitemap", "indexare"];
  for (const id of CU_ILUSTRATIE) {
    assert.ok(
      CARDURI_SEO.some((c) => c.id === id),
      `nu mai există cardul „${id}", dar SectiuneSeo încă îi caută ilustrația`,
    );
  }
});
