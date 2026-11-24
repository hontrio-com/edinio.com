import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync, statSync } from "node:fs";

import {
  adresaContNouHontrio, adresaPrezentareHontrio, APLICATIA_HONTRIO, LOCURI_PROMOVARE,
  pretCaInGoogle, primaImagine, PRODUSE_IN_EXEMPLU, produseDeExemplu, SITE_HONTRIO,
  URMARIREA_HONTRIO,
} from "./hontrio";
import { LATIMI } from "../latimi-imagini";

const BUTON = "src/components/dashboard/ButonHontrio.tsx";
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
    for (const adresa of [adresaPrezentareHontrio(loc), adresaContNouHontrio(loc)]) {
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

test("⚠⚠ pe telefon butonul nu sta in bara, ci in meniul lateral", () => {
  /*
   * ⚠ MASURAT pe 24.11.2026, nu banuit. Cu butonul in bara, cautarea ramanea cu 91 px
   * pe un ecran de 390 si cu 70 pe unul de 360 (fara el: 130 si 100): o caseta in
   * care se vad trei litere. De aceea sub `sm` butonul e ascuns.
   *
   * ⚠ SI A DOUA JUMATATE, fara de care prima ar fi o stergere: ascuns din bara si
   * nepus nicaieri, Hontrio n-ar mai exista pentru cine lucreaza de pe telefon. De
   * aceea meniul lateral are randul lui, cu propria cheie de raport.
   */
  const sursa = readFileSync(BUTON, "utf8");
  const buton = sursa.slice(sursa.indexOf("export function ButonHontrio"), sursa.indexOf("export function RandHontrio"));
  assert.match(buton, /className="hidden [^"]*sm:inline-flex"/, "butonul din bara se vede si pe telefon");

  const rand = sursa.slice(sursa.indexOf("export function RandHontrio"));
  assert.match(rand, /adresaPrezentareHontrio\("meniu-telefon"\)/, "randul din meniu nu are cheia lui de raport");
  assert.match(rand, /rel="noopener noreferrer"/);

  const bara = readFileSync(BARA, "utf8");
  const meniu = bara.slice(bara.indexOf("{/* Mobile drawer */}"));
  assert.ok(meniu.length > 0 && meniu.includes("<RandHontrio "), "meniul lateral de pe telefon nu mai are randul Hontrio");
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

test("⚠ bannerul se arata doar cui nu e deja conectat", () => {
  /*
   * Un magazin legat de Hontrio are cardul „Activ" la Marketing. Indemnul „Creează
   * cont gratuit" pus peste el ar fi o reclama pentru ceva ce omul foloseste deja.
   */
  const pagina = readFileSync(PAGINA, "utf8");
  assert.match(pagina, /\{!hontrioActive && <BannerHontrio /, "bannerul nu mai atarna de starea legaturii");
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

test("⚠ exemplul cu produse scrie ca e un exemplu", () => {
  /*
   * Reproducerea arata ca rezultatele Google, cu produsele adevarate ale
   * magazinului. Fara eticheta, ar parea captura unor reclame care ruleaza deja.
   */
  const sursa = readFileSync(BANNER, "utf8");
  assert.match(sursa, /Exemplu cu produsele tale/);
  assert.match(sursa, /aria-label="Exemplu:/, "cititoarele de ecran nu mai afla ca e un exemplu");
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

test("prima poza se ia doar daca e o adresa http", () => {
  assert.equal(primaImagine(["https://a.ro/x.webp", "https://a.ro/y.webp"]), "https://a.ro/x.webp");
  assert.equal(primaImagine(["  https://a.ro/x.webp "]), "https://a.ro/x.webp");
  /* `images` e `jsonb`: poate veni orice, inclusiv forme vechi sau stricate. */
  for (const stricat of [null, undefined, "https://a.ro/x.webp", [], [null], [{ url: "x" }], ["/local.png"], ["javascript:alert(1)"]]) {
    assert.equal(primaImagine(stricat), null, JSON.stringify(stricat));
  }
});

test("⚠ exemplul are toate produsele sau niciunul", () => {
  /*
   * Un exemplu cu un singur card arata ca o pagina stricata, iar unul completat cu
   * produse inventate n-ar mai fi „produsele tale".
   */
  assert.equal(produseDeExemplu([rand("a"), rand("b"), rand("c"), rand("d")]).length, PRODUSE_IN_EXEMPLU);
  assert.deepEqual(produseDeExemplu([rand("a"), rand("b")]), []);
  assert.deepEqual(produseDeExemplu([]), []);
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
