import test from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";

import {
  adresaAplicatieiHontrio, adresaContNouHontrio, adresaPrezentareHontrio, APLICATIA_HONTRIO, LOCURI_PROMOVARE,
  pretCaInGoogle, primaImagine, PRODUSE_IN_EXEMPLU, PRODUSE_STANDARD, produseDeExemplu,
  produseleBannerului, SITE_HONTRIO, URMARIREA_HONTRIO,
} from "./hontrio";
import { LATIMI } from "../latimi-imagini";
import { adresaVarianteiTemei } from "../teme/variante-imagini";

const BUTON = "src/components/dashboard/ButonHontrio.tsx";
const STOC = "src/components/dashboard/ScapaDeStoc.tsx";
const BANNER = "src/components/dashboard/BannerHontrio.tsx";
const BARA = "src/components/dashboard/DashboardTopbar.tsx";
const PAGINA = "src/app/(dashboard)/dashboard/features/page.tsx";

/* ── Adresele ───────────────────────────────────────────────────────────── */

test("⚠ legaturile duc la capatul lantului de redirectari, pe https", () => {
  /*
   * Masurat pe 24.11.2026: `hontrio.com` raspunde 307 catre `www.hontrio.com`, iar
   * `/register` de acolo inca un 307 catre `app.hontrio.com`. Parametrii au trecut
   * prin amandoua, dar fiecare redirectare e un loc unde se pot pierde, si atunci
   * vizita trimisa de noi apare la ei fara sursa.
   */
  const prezentare = new URL(adresaPrezentareHontrio("bara-de-sus"));
  assert.equal(prezentare.protocol, "https:");
  assert.equal(prezentare.hostname, "www.hontrio.com");
  assert.equal(prezentare.pathname, "/");

  const cont = new URL(adresaContNouHontrio("banner-integrari"));
  assert.equal(cont.protocol, "https:");
  assert.equal(cont.hostname, "app.hontrio.com");
  assert.equal(cont.pathname, "/register");

  /* Cine are deja cont merge in aplicatie, nu la formularul de cont nou. */
  const aplicatie = new URL(adresaAplicatieiHontrio("banner-integrari"));
  assert.equal(aplicatie.protocol, "https:");
  assert.equal(aplicatie.hostname, "app.hontrio.com");
  assert.equal(aplicatie.pathname, "/");

  assert.equal(new URL(SITE_HONTRIO).hostname, "www.hontrio.com");
  assert.equal(new URL(APLICATIA_HONTRIO).hostname, "app.hontrio.com");
});

test("⚠⚠ fiecare legatura spune de unde a plecat omul", () => {
  /*
   * ⚠ ASTA E CE FACE PROMOVAREA MASURABILA. Fara `utm_campaign`, in rapoartele
   * Hontrio butonul din bara si bannerul din Integrari sunt o singura gramada, si
   * nu se mai poate hotari care dintre ele merita pastrat.
   */
  const vazute = new Set<string>();
  for (const loc of LOCURI_PROMOVARE) {
    for (const adresa of [adresaPrezentareHontrio(loc), adresaContNouHontrio(loc), adresaAplicatieiHontrio(loc)]) {
      const u = new URL(adresa);
      for (const [cheie, valoare] of Object.entries(URMARIREA_HONTRIO)) {
        assert.equal(u.searchParams.get(cheie), valoare, `${adresa}: lipseste sau s-a schimbat ${cheie}`);
      }
      assert.equal(u.searchParams.get("utm_campaign"), loc);
    }
    vazute.add(loc);
  }
  assert.equal(vazute.size, LOCURI_PROMOVARE.length, "doua locuri au aceeasi cheie de raport");
});

test("ancora ajunge in adresa fara sa strice parametrii", () => {
  const u = new URL(adresaPrezentareHontrio("banner-integrari", "how"));
  assert.equal(u.hash, "#how");
  assert.equal(u.searchParams.get("utm_campaign"), "banner-integrari");
});

test("⚠ nicio componenta nu scrie de mana o adresa Hontrio", () => {
  /*
   * Un al doilea loc care scrie domeniul ar fi o legatura FARA parametrii de
   * urmarire, sau una pe gazda cu redirectare. Adresele se iau din fisierul asta.
   *
   * ⚠ SE CITESTE DISCUL, nu `git grep`: acela nu vede fisierele neurmarite, adica
   * tocmai fisierele noi in care ar aparea copia (lectia de la Scapa de Stoc).
   *
   * Probele conectorului (`src/lib/hontrio/*.test.ts`) scriu si ele domeniul, ca
   * adresa de intoarcere OAuth. Nu sunt legaturi pentru oameni si stau in `lib`,
   * deci aici se cauta doar in ce se randeaza: `components` si `app`.
   */
  const gasite: string[] = [];
  const mergi = (dir: string) => {
    for (const nume of readdirSync(dir)) {
      const cale = `${dir}/${nume}`;
      if (statSync(cale).isDirectory()) { mergi(cale); continue; }
      if (!/\.(ts|tsx)$/.test(nume)) continue;
      if (/https?:\/\/[a-z.]*hontrio\.com/i.test(readFileSync(cale, "utf8"))) gasite.push(cale);
    }
  };
  mergi("src/components");
  mergi("src/app");
  assert.deepEqual(gasite, [], "adresa Hontrio e scrisa de mana; se ia din `@/lib/parteneri/hontrio`");
});

/* ── Butonul din bara de sus ────────────────────────────────────────────── */

test("⚠ butonul deschide fila noua fara sa dea paginii lor acces la panou", () => {
  const sursa = readFileSync(BUTON, "utf8");
  assert.match(sursa, /href=\{adresaPrezentareHontrio\("bara-de-sus"\)\}/, "butonul nu ia adresa din singurul loc");
  /*
   * Fara `noopener`, fila deschisa primeste `window.opener` si poate muta panoul de sub om.
   *
   * ⚠ SE NUMARA PE FIECARE LEGATURA, nu „apare undeva in fisier". Prima forma cerea
   * doar ca `rel="noopener noreferrer"` sa existe in fisier, iar fisierul are DOUA
   * legaturi: butonul din bara si randul din meniu. Confruntata cu defectul (butonul
   * ramas cu `rel="noreferrer"`), trecea, fiindca randul din meniu il avea pe al lui.
   */
  const filaNoua = sursa.match(/target="_blank"/g) ?? [];
  const pazite = sursa.match(/rel="noopener noreferrer"/g) ?? [];
  assert.equal(filaNoua.length, 2, "fisierul nu mai are cele doua legaturi: butonul si randul din meniu");
  assert.equal(pazite.length, filaNoua.length, "o legatura catre fila noua a ramas fara `noopener`");
});

test("⚠ butonul isi spune numele si cand eticheta e ascunsa", () => {
  /*
   * Sub `xl` eticheta e `display:none`, iar ce e ascuns asa nu intra in numele
   * accesibil. Fara `aria-label`, numele ar fi venit din `title`: toata descrierea,
   * citita la fiecare trecere.
   */
  const sursa = readFileSync(BUTON, "utf8");
  assert.match(sursa, /aria-label=\{`\$\{INDEMN_HONTRIO\}/, "butonul n-are nume scris explicit");
  assert.match(sursa, /hidden whitespace-nowrap xl:inline/, "eticheta nu mai e ascunsa pe ecrane inguste");
});

/** Clasele PRIMULUI element de felul cerut dintr-o bucata de sursa: ale butonului insusi, nu ale copiilor lui. */
function claseleElementului(bucata: string, eticheta: "a" | "button"): string {
  const gasit = new RegExp(`<${eticheta}\\s[\\s\\S]*?className="([^"]*)"`).exec(bucata);
  assert.ok(gasit, `nu am gasit niciun <${eticheta}> cu clase in bucata citita`);
  return gasit[1];
}

test("⚠⚠ pe telefon, in bara de sus sta Hontrio, iar Scapa de Stoc doar de la laptop in sus", () => {
  /*
   * ⚠ HOTARAREA PROPRIETARULUI, dupa prima versiune (24.11.2026): „Pe mobil acolo in
   * topbar in loc de logo de la scapa de stoc, pui Hontrio. Scapadestoc sa se vada
   * doar de pe laptop/pc sau ecrane mai mari".
   *
   * ⚠ CELE DOUA JUMATATI SE TIN UNA PE ALTA, de aceea stau in aceeasi proba. Hontrio
   * aratat pe telefon FARA ca Scapa de Stoc sa fie ascuns inseamna doua butoane de
   * partener in bara: masurat, cautarii ii ramaneau 91 px la un ecran de 390 si 70 la
   * unul de 360. Scapa de Stoc ascuns FARA Hontrio la vedere inseamna un telefon fara
   * nicio usa catre vreuna din cele doua platforme.
   *
   * ⚠ SE CITESC CLASELE BUTONULUI INSUSI, nu „apare undeva in fisier": eticheta din
   * butonul Hontrio are si ea `hidden` (pana la `xl`), iar o cautare pe tot fisierul
   * ar fi luat-o drept ascunderea butonului.
   */
  const sursa = readFileSync(BUTON, "utf8");
  const butonHontrio = sursa.slice(sursa.indexOf("export function ButonHontrio"), sursa.indexOf("export function RandHontrio"));
  const claseHontrio = claseleElementului(butonHontrio, "a").split(/\s+/);
  assert.ok(claseHontrio.includes("inline-flex"), "butonul Hontrio nu mai e la vedere pe orice latime");
  assert.ok(!claseHontrio.includes("hidden"), "butonul Hontrio e ascuns pe o treapta de latime: pe telefon trebuie sa se vada");

  const sursaStoc = readFileSync(STOC, "utf8");
  const butonStoc = sursaStoc.slice(sursaStoc.indexOf("export function ButonScapaDeStoc"), sursaStoc.indexOf("function Fereastra"));
  const claseStoc = claseleElementului(butonStoc, "button").split(/\s+/);
  assert.ok(claseStoc.includes("hidden"), "Scapa de Stoc se vede si pe telefon");
  assert.ok(claseStoc.includes("lg:inline-flex"), "Scapa de Stoc nu mai apare de la `lg` in sus");
  for (const prag of ["sm:inline-flex", "md:inline-flex"]) {
    assert.ok(!claseStoc.includes(prag), `Scapa de Stoc apare de la ${prag}, adica si pe tableta`);
  }
});

test("⚠ meniul lateral de pe telefon spune numele intreg, cu cheia lui de raport", () => {
  /*
   * In bara, sub `xl`, butonul Hontrio e doar semnul „H", iar pe un ecran cu atingere
   * nu exista nici indiciul de la trecerea cu mausul. Randul din meniu e locul in care
   * scrie ce e. Cheia lui de raport e alta decat a butonului, ca sa se vada in
   * rapoartele Hontrio daca randul e folosit.
   */
  const sursa = readFileSync(BUTON, "utf8");
  const rand = sursa.slice(sursa.indexOf("export function RandHontrio"), sursa.indexOf("function SemnHontrio"));
  assert.match(rand, /adresaPrezentareHontrio\("meniu-telefon"\)/, "randul din meniu nu are cheia lui de raport");
  assert.match(rand, /\{INDEMN_HONTRIO\}/, "randul din meniu nu mai scrie indemnul");

  const bara = readFileSync(BARA, "utf8");
  const meniu = bara.slice(bara.indexOf("{/* Mobile drawer */}"));
  assert.ok(meniu.length > 1 && meniu.includes("<RandHontrio "), "meniul lateral de pe telefon nu mai are randul Hontrio");
});

test("⚠ semnul Hontrio nu se inverseaza pe o tema care nu exista", () => {
  /*
   * Panoul n-are tema intunecata: `.zona-aplicatie` fixeaza fundalul pe alb. Cu
   * `dark:invert` scris, in ziua in care clasa `dark` ajunge pe un stramos semnul
   * iese alb pe bara alba. Cele doua randuri de mai jos leaga regula de motivul ei:
   * cand panoul capata tema intunecata, a doua afirmatie cade si regula se regandeste.
   */
  assert.ok(!/dark:invert/.test(readFileSync(BUTON, "utf8").replace(/\/\*[\s\S]*?\*\//g, "")), "semnul se inverseaza pe `dark`");
  const stil = readFileSync("src/app/stil-comun.css", "utf8");
  const zona = stil.slice(stil.indexOf(".zona-aplicatie {"));
  assert.match(zona.slice(0, zona.indexOf("}")), /--background:\s*oklch\(1 0 0\)/, "panoul nu mai fixeaza fundalul pe alb: verifica siglele negre din bara");
});

test("⚠ „Adaugă” ramane ultimul buton dinaintea clopotelului", () => {
  /*
   * Regula barii: actiunea proprie a comerciantului sta cel mai la indemana, iar
   * usile catre alte platforme vin INAINTEA ei. Un buton de partener pus dupa
   * „Adaugă” i-ar lua locul de langa clopotel.
   */
  const bara = readFileSync(BARA, "utf8");
  const hontrio = bara.indexOf("<ButonHontrio />");
  const stoc = bara.indexOf("<ButonScapaDeStoc />");
  const adauga = bara.indexOf("<ButonAdauga />");
  assert.ok(hontrio > 0, "butonul Hontrio nu mai e in bara de sus");
  assert.ok(hontrio < adauga && stoc < adauga, "un buton de partener a ajuns dupa „Adaugă”");
});

/* ── Bannerul din Integrari ─────────────────────────────────────────────── */

test("⚠ bannerul se arata tuturor, si magazinelor deja conectate", () => {
  /*
   * Cerut de proprietar pe 25.11.2026, dupa ce l-a cautat in productie si nu l-a mai gasit:
   * „era un banner promotional practic, ar trebui sa apara la toata lumea”. Prima forma il
   * arata doar magazinelor neconectate la Hontrio.
   */
  const pagina = readFileSync(PAGINA, "utf8");
  assert.ok(
    pagina.includes("<BannerHontrio businessId={business?.id ?? null} conectat={hontrioActive} />"),
    "bannerul nu mai e in pagina sau nu mai afla daca magazinul e conectat",
  );
  assert.doesNotMatch(pagina, /&& <BannerHontrio /, "bannerul atarna iar de o conditie");
});

test("⚠ celui deja conectat butonul ii deschide aplicatia, nu ii cere sa-si faca un cont pe care il are", () => {
  const sursa = readFileSync(BANNER, "utf8");
  assert.ok(sursa.includes(
    "href={conectat ? adresaAplicatieiHontrio(\"banner-integrari\") : adresaContNouHontrio(\"banner-integrari\")}",
  ), "butonul principal nu mai tine cont de legatura magazinului");
  assert.ok(sursa.includes("{conectat ? \"Deschide Hontrio\" : \"Creează cont pe Hontrio\"}"));
  /* Fara proprietate, bannerul ramane cel de cont nou: asa il vede cine n-are magazin sau legatura. */
  assert.ok(sursa.includes("export function BannerHontrio({ businessId, conectat = false }: {"));
});

test("⚠ fiecare legatura din banner care deschide o fila noua are `noopener`", () => {
  const sursa = readFileSync(BANNER, "utf8");
  const filaNoua = sursa.match(/target="_blank"/g) ?? [];
  const pazite = sursa.match(/rel="noopener noreferrer"/g) ?? [];
  assert.ok(filaNoua.length >= 2, "bannerul nu mai are cele doua legaturi catre Hontrio");
  assert.equal(pazite.length, filaNoua.length, "o legatura catre fila noua a ramas fara `noopener`");
  assert.match(sursa, /adresaContNouHontrio\("banner-integrari"\)/);
  assert.match(sursa, /adresaPrezentareHontrio\("banner-integrari", "how"\)/);
});

test("⚠ exemplul cu produse scrie ca e un exemplu, si nu spune „ale tale” peste cele standard", () => {
  /*
   * Reproducerea arata ca rezultatele Google. Fara eticheta, ar parea captura unor
   * reclame care ruleaza deja.
   *
   * ⚠ SI ETICHETA ATARNA DE ALE CUI SUNT PRODUSELE. De cand bannerul arata produse
   * standard magazinului care n-are inca trei cu poza, „Exemplu cu produsele tale"
   * pus peste ele ar fi o minciuna, chiar pe randul care spune ca reproducerea e
   * cinstita. Cele doua etichete se aleg dupa `aleMagazinului`, si la fel numele
   * citit de cititoarele de ecran.
   */
  const sursa = readFileSync(BANNER, "utf8");
  assert.match(
    sursa, /\{aleMagazinului \? "Exemplu cu produsele tale" : "Exemplu de reclame"\}/,
    "eticheta de deasupra exemplului nu se mai alege dupa ale cui sunt produsele",
  );
  assert.match(
    sursa,
    /aria-label=\{\s*aleMagazinului\s*\? "Exemplu: trei produse din magazinul tău[^"]*"\s*: "Exemplu: trei produse arătate[^"]*"\s*\}/,
    "numele citit de cititoarele de ecran nu se mai alege dupa ale cui sunt produsele",
  );
});

test("⚠ cat se asteapta produsele magazinului, in locul lor nu se arata nimic", () => {
  /*
   * Produsele standard puse ca stare de asteptare ar fi aparut o clipa si ar fi fost
   * inlocuite cu ale magazinului: un palpait la fiecare deschidere a paginii.
   */
  const sursa = readFileSync(BANNER, "utf8");
  assert.match(sursa, /<Suspense fallback=\{null\}>\s*<ReclameleMagazinului /);
});

test("⚠ produsele din banner vin intr-o ordine care nu lasa nicio egalitate", () => {
  /*
   * Pe magazinul demo, sase produse scoase in fata au toate `sort_order` 0. Fara
   * departajare, baza le intoarce in ce ordine vrea: vazut pe 24.11.2026, aceeasi
   * asezare ceruta pe doua cai a pus in fata alte trei produse. Un exemplu care isi
   * poate schimba produsele de la o deschidere la alta pare stricat.
   *
   * `id` la coada e cel care inchide orice egalitate: e cheia primara.
   */
  const sursa = readFileSync(BANNER, "utf8");
  const criterii = [...sursa.matchAll(/\.order\("([a-z_]+)"/g)].map((m) => m[1]);
  assert.deepEqual(criterii, ["is_featured", "sort_order", "created_at", "id"]);
});

test("⚠ pozele din banner cer o latime de pe scara casei", () => {
  /*
   * Fiecare latime distincta e o varianta in plus de taiat si de pastrat, pentru
   * fiecare poza careia i se cere (vezi `latimi-imagini.ts`). Un „120" pus aici
   * fiindca atat are cardul ar fi deschis o scara paralela.
   */
  const sursa = readFileSync(BANNER, "utf8");
  const latimi = [...sursa.matchAll(/<Image[^>]*?width=\{(\d+)\}/g)].map((m) => Number(m[1]));
  assert.ok(latimi.length > 0, "nu am gasit nicio poza de produs in banner");
  for (const l of latimi) assert.ok(LATIMI.includes(l), `latimea ${l} nu e pe scara`);
});

/* ── Produsele din exemplu ──────────────────────────────────────────────── */

const rand = (id: string, peste: Record<string, unknown> = {}) => ({
  id,
  name: `Produs ${id}`,
  price: 100,
  compare_at_price: null,
  images: [`https://cdn.exemplu.ro/products/${id}.webp`],
  ...peste,
});

test("prima poza folosibila: o adresa http sau o cale din radacina site-ului", () => {
  assert.equal(primaImagine(["https://a.ro/x.webp", "https://a.ro/y.webp"]), "https://a.ro/x.webp");
  assert.equal(primaImagine(["  https://a.ro/x.webp "]), "https://a.ro/x.webp");
  /* Prima din lista poate fi stricata; se ia urmatoarea buna, nu se renunta la produs. */
  assert.equal(primaImagine([null, "", "https://a.ro/y.webp"]), "https://a.ro/y.webp");
  /* `images` e `jsonb`: poate veni orice, inclusiv forme vechi sau stricate. */
  for (const stricat of [null, undefined, "https://a.ro/x.webp", [], [null], [{ url: "x" }], ["local.png"], ["javascript:alert(1)"], ["data:image/png;base64,AAAA"]]) {
    assert.equal(primaImagine(stricat), null, JSON.stringify(stricat));
  }
});

test("⚠⚠ produsele puse de o tema au pozele pe cai din radacina, si se vad in banner", () => {
  /*
   * ⚠ DEFECT ADEVARAT AL PRIMEI FORME, prins pe magazinul demo (24.11.2026). Functia
   * cerea `http(s)://`. Produsele venite cu datele demo ale unei teme isi tin poza ca
   * `/teme/mercur/produse/minge-cauciuc.webp`, deci erau sarite toate: primele sase
   * produse din vitrina lipseau din banner, fara nicio eroare, iar in locul lor
   * apareau abia al saptelea, al optulea si al noualea.
   *
   * Proba de atunci scria chiar asta ca regula (`["/local.png"]` trebuia refuzat).
   * Era o presupunere, nu ceva citit din baza.
   */
  assert.equal(primaImagine(["/teme/mercur/produse/minge-cauciuc.webp"]), "/teme/mercur/produse/minge-cauciuc.webp");
  const alese = produseDeExemplu([
    rand("a", { images: ["/teme/mercur/produse/a.webp"] }),
    rand("b", { images: ["/teme/mercur/produse/b.webp"] }),
    rand("c", { images: ["/teme/mercur/produse/c.webp"] }),
  ]);
  assert.deepEqual(alese.map((p) => p.id), ["a", "b", "c"]);
});

test("⚠ `//gazda/poza` nu e o cale din radacina, ci o adresa catre alta gazda", () => {
  /*
   * Scrisa fara protocol, adresa incepe tot cu `/`, dar duce la gazda numita dupa
   * cele doua bare. Luata drept cale locala, ar fi incarcat in panou o poza de pe un
   * site ales de cine a scris-o in campul produsului.
   */
  assert.equal(primaImagine(["//rau.ro/x.png"]), null);
  assert.equal(primaImagine(["//rau.ro/x.png", "/teme/a.webp"]), "/teme/a.webp");
});

test("⚠ din produsele magazinului se iau toate trei sau niciunul", () => {
  /*
   * Un exemplu cu un singur card arata ca o pagina stricata, iar unul completat cu
   * produse de-ale noastre n-ar mai fi „produsele tale".
   */
  assert.equal(produseDeExemplu([rand("a"), rand("b"), rand("c"), rand("d")]).length, PRODUSE_IN_EXEMPLU);
  assert.deepEqual(produseDeExemplu([rand("a"), rand("b")]), []);
  assert.deepEqual(produseDeExemplu([]), []);
});

test("⚠⚠ magazinul fara trei produse cu poza vede produsele standard, nu un banner gol", () => {
  /*
   * ⚠ HOTARAREA PROPRIETARULUI, dupa prima versiune (24.11.2026): „daca nu are
   * produse sau imagini la produse sa apara astea standard". Prima versiune lasa
   * atunci bannerul doar cu textul.
   *
   * ⚠ SI NICIODATA AMESTECATE. Cu doua produse ale lui si unul standard, eticheta
   * n-ar mai putea spune nici „ale tale", nici „exemplu de reclame" fara sa minta
   * despre unul din carduri.
   */
  const ale = produseleBannerului([rand("a"), rand("b"), rand("c")]);
  assert.equal(ale.aleMagazinului, true);
  assert.deepEqual(ale.produse.map((p) => p.id), ["a", "b", "c"]);

  for (const preaPutine of [[], [rand("a")], [rand("a"), rand("b")], [rand("a"), rand("b"), rand("fara-poza", { images: [] })]]) {
    const rezultat = produseleBannerului(preaPutine);
    assert.equal(rezultat.aleMagazinului, false, `${preaPutine.length} randuri`);
    assert.deepEqual(rezultat.produse, PRODUSE_STANDARD, `${preaPutine.length} randuri: produsele nu sunt cele standard, intregi`);
  }
});

test("⚠ produsele standard au pozele pe disc, cu varianta mica pe care o cere bannerul", () => {
  /*
   * ⚠ O POZA STANDARD CARE LIPSESTE E O POZA RUPTA IN PANOUL FIECARUI MAGAZIN NOU, si
   * nu s-ar vedea nicaieri in probe: `next/image` nu verifica nimic la construire.
   * Pozele sunt ale temei Marte; daca tema isi redenumeste un fisier, proba cade aici.
   *
   * Se cauta si VARIANTA pe care o cere bannerul (`adresaVarianteiTemei`, la latimea
   * din cod), nu doar poza mare: loaderul cere varianta, nu originalul.
   */
  assert.equal(PRODUSE_STANDARD.length, PRODUSE_IN_EXEMPLU);
  const sursa = readFileSync(BANNER, "utf8");
  const latime = Number(/<Image[^>]*?width=\{(\d+)\}/.exec(sursa)?.[1]);
  assert.ok(latime > 0, "nu am gasit latimea pozei in banner");

  for (const p of PRODUSE_STANDARD) {
    assert.equal(primaImagine([p.imagine]), p.imagine, `${p.id}: poza n-ar trece de propria noastra verificare`);
    assert.ok(existsSync(`public${p.imagine}`), `${p.id}: lipseste public${p.imagine}`);
    for (const densitate of [1, 2]) {
      const varianta = adresaVarianteiTemei(p.imagine, latime * densitate);
      assert.ok(varianta, `${p.id}: loaderul nu recunoaste poza ca fiind a unei teme`);
      assert.ok(existsSync(`public${varianta}`), `${p.id}: lipseste varianta public${varianta}`);
    }
    assert.ok(p.nume.trim().length > 0 && p.pret > 0, `${p.id}: nume sau pret lipsa`);
    assert.ok(p.pretVechi === null || p.pretVechi > p.pret, `${p.id}: pretul vechi nu e mai mare decat cel curent`);
  }
  assert.equal(new Set(PRODUSE_STANDARD.map((p) => p.id)).size, PRODUSE_STANDARD.length, "doua produse standard au acelasi id");
});

test("⚠ produsele fara poza, fara nume sau fara pret sunt sarite, in ordinea primita", () => {
  const alese = produseDeExemplu([
    rand("fara-poza", { images: [] }),
    rand("a"),
    rand("fara-nume", { name: "   " }),
    rand("gratuit", { price: 0 }),
    rand("b"),
    rand("pret-stricat", { price: null }),
    rand("c"),
    rand("d"),
  ]);
  assert.deepEqual(alese.map((p) => p.id), ["a", "b", "c"]);
});

test("pretul vechi apare doar cand chiar e mai mare", () => {
  const [redus, egal, maiMic] = produseDeExemplu([
    rand("a", { price: 80, compare_at_price: 100 }),
    rand("b", { price: 80, compare_at_price: 80 }),
    rand("c", { price: 80, compare_at_price: 50 }),
  ]);
  assert.equal(redus.pretVechi, 100);
  assert.equal(egal.pretVechi, null);
  assert.equal(maiMic.pretVechi, null);
});

test("pretul se scrie ca in Google: doua zecimale si codul monedei", () => {
  /* `Intl` pune un spatiu nedespartitor intre suma si moneda; aici se compara cu spatiul obisnuit. */
  const curat = (s: string) => s.replace(/ /g, " ");
  assert.equal(curat(pretCaInGoogle(189)), "189,00 RON");
  assert.equal(curat(pretCaInGoogle(1249.5)), "1.249,50 RON");
});
