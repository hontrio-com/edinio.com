import { strict as assert } from "node:assert";
import { test } from "node:test";
import { existaPaginaStatica, adreseRedirectate } from "./rute-pe-disc";
import {
  TOP_NAV,
  SOLUTION_COLUMNS,
  RESOURCES,
  COMPETITORS,
  INDUSTRY_LINKS,
  SOLUTION_FEATURED,
  COMPARE_FEATURED,
  RESOURCES_FEATURED,
} from "./nav";
import { FOOTER_COLUMNS } from "./footer";
import { PRESETARI_INDEMN } from "@/lib/blog/indemn";

/*
  ═══════════════════════════════════════════════════════════════════════════
  ORICE ADRESĂ SCRISĂ ÎN COD TREBUIE SĂ DUCĂ UNDEVA
  ═══════════════════════════════════════════════════════════════════════════

  ⚠ PROBA ASTA S-A NĂSCUT DINTR-O SCĂPARE, PE 31.08.2026. La ștergerea paginii
  `/start` am căutat cine o leagă și am raportat „zero" — bara, subsolul,
  meniurile, paginile. Adevărat cuvânt cu cuvânt, și incomplet: căutasem
  `href="/start"`, iar în `src/lib/blog/indemn.ts` scria

      adresa: "/start"

  Era presetarea implicită a DOUĂ din patru șabloane de articol de blog.

  ⚠ ȘI NOTA DIN CAPUL ACELUI FIȘIER PROMITEA CĂ AȘA CEVA NU SE POATE: „ștergerea
  paginii sparge compilarea, sau măcar se vede la o căutare". Nu sparge nimic —
  `adresa` e un `string`, iar `tsc` și build-ul trec liniștite. Iar căutarea
  chiar s-a făcut și a găsit zero, fiindcă adresele nu se scriu peste tot la fel.

  De asta proba nu caută TEXT. Ia obiectele de configurare EXACT așa cum le
  citește aplicația, și le confruntă cu discul.

  ⚠ O ADRESĂ REDIRECTATĂ TRECE. Un buton către `/roadmap` nu e rupt: pagina nu
  există, dar `next.config.ts` îl duce la `/blog`. Ce nu trece e adresa care nu
  duce nicăieri.
*/

/** Adresele externe și ancorele de pe aceeași pagină nu se verifică pe disc. */
const esteInterna = (h: string) => h.startsWith("/") && !h.startsWith("//");

/*
  ⚠ CÂMPURILE DIFERĂ DE LA O CONFIGURAȚIE LA ALTA, și tocmai asta e problema pe
  care o rezolvă proba. Adresa se cheamă `href` în navigație și în subsol, dar
  `adresa` în presetările de îndemn. Numele butonului e `label` într-un loc,
  `eticheta` în altul, `name` la concurenți, `cta` la panourile de promovare.
  O căutare de text peste `href="…"` le vede doar pe unele — exact așa a scăpat
  `/start` din `indemn.ts`.
*/
type Intrare = { href?: string; adresa?: string; label?: string; eticheta?: string; name?: string; cta?: string };

function adreseleDin(nume: string, lista: Intrare[]) {
  return lista
    .map((x) => ({
      sursa: nume,
      href: x.href ?? x.adresa ?? "",
      nume: x.label ?? x.eticheta ?? x.name ?? x.cta ?? "",
    }))
    .filter((x) => x.href && esteInterna(x.href));
}

function toateAdresele() {
  const out: Array<{ sursa: string; href: string; nume: string }> = [];

  out.push(...adreseleDin("nav.ts / TOP_NAV", TOP_NAV.filter((t): t is { href: string; label: string } => "href" in t)));
  for (const col of SOLUTION_COLUMNS) out.push(...adreseleDin("nav.ts / SOLUTION_COLUMNS", col.items));
  out.push(...adreseleDin("nav.ts / RESOURCES", RESOURCES));
  out.push(...adreseleDin("nav.ts / COMPETITORS", COMPETITORS));
  out.push(...adreseleDin("nav.ts / INDUSTRY_LINKS", INDUSTRY_LINKS));
  out.push(...adreseleDin("nav.ts / FEATURED", [SOLUTION_FEATURED, COMPARE_FEATURED, RESOURCES_FEATURED]));
  /* ⚠ Subsolul își cheamă lista `links`, nu `items`. */
  for (const col of FOOTER_COLUMNS) out.push(...adreseleDin("footer.ts / FOOTER_COLUMNS", col.links));
  out.push(...adreseleDin("blog/indemn.ts / PRESETARI", Object.values(PRESETARI_INDEMN)));

  return out;
}

const declarate = () => toateAdresele().filter((a) => !a.href.startsWith("/#")); // fără ancorele de pe pagina curentă
const arata = (a: { sursa: string; href: string; nume: string }) =>
  `${a.sursa}: "${a.href}"${a.nume ? ` (butonul „${a.nume}")` : ""}`;

test("nicio adresă declarată nu duce în 404", () => {
  const redirectate = adreseRedirectate();
  const rupte = declarate()
    .filter((a) => !existaPaginaStatica(a.href) && !redirectate.has(a.href.split("#")[0]))
    .map(arata);

  assert.deepEqual(
    rupte,
    [],
    "Adrese care nu duc nici la o pagină de pe disc, nici la o redirectare din " +
      "`next.config.ts`. Un om care apasă butonul ajunge în 404:\n  " +
      rupte.join("\n  "),
  );
});

test("nicio adresă declarată nu se sprijină pe o redirectare", () => {
  /*
    ⚠ PROBA DE DEASUPRA ERA PREA BLÂNDĂ, ȘI AM AFLAT-O CONFRUNTÂND-O. Am pus la
    loc `adresa: "/start"` în `indemn.ts` — chiar defectul pentru care s-a scris
    proba — și a TRECUT. Fiindcă între timp `/start` căpătase o redirectare, iar
    „duce undeva" era satisfăcut.

    Deci regula adevărată e alta, și e mai strictă:

      REDIRECTĂRILE SUNT PENTRU LUMEA DIN AFARĂ, nu pentru butoanele noastre.

    O adresă veche care mai trăiește în Google, într-un semn de carte sau într-un
    e-mail vechi merită o redirectare. Dar un buton pe care îl desenăm noi, din
    configurația noastră, trebuie să arate direct spre ținta adevărată. Altfel
    fiecare apăsare costă un drum în plus, iar butonul „Începe gratuit" ajunge la
    pagina de start în loc de înscriere — exact ce era să pățim.
  */
  const redirectate = adreseRedirectate();
  const ocolite = declarate()
    .filter((a) => !existaPaginaStatica(a.href) && redirectate.has(a.href.split("#")[0]))
    .map(arata);

  assert.deepEqual(
    ocolite,
    [],
    "Adrese care ajung la destinație doar printr-o redirectare. Nu dau 404, dar " +
      "trimit omul pe un drum în plus — și de obicei nu chiar unde trebuie. " +
      "Scrie în configurație ținta adevărată:\n  " + ocolite.join("\n  "),
  );
});

test("proba chiar are ce verifica", () => {
  /*
    ⚠ MARTORUL. Fără el, proba de sus ar fi verde și dacă `toateAdresele()` ar
    întoarce o listă goală — de exemplu fiindcă o configurație a fost redenumită
    și importul a rămas la un obiect gol. Zero adrese verificate arată exact la
    fel ca zero adrese rupte.
  */
  const toate = toateAdresele();
  assert.ok(toate.length >= 20, `verifică doar ${toate.length} adrese — s-a rupt vreo citire de configurație?`);

  const surse = new Set(toate.map((a) => a.sursa.split(" / ")[0]));
  assert.ok(surse.has("nav.ts"), "nu se mai citește nicio adresă din `nav.ts`");
  assert.ok(surse.has("footer.ts"), "nu se mai citește nicio adresă din `footer.ts`");
  assert.ok(surse.has("blog/indemn.ts"), "nu se mai citește nicio adresă din `blog/indemn.ts`");
});

test("control negativ: rezolvatorul chiar poate raspunde „nu”", () => {
  /*
    ⚠ Aceeași grijă ca în `footer.test.ts`: o funcție care spune mereu „da" ar
    face proba de sus veșnic verde. Și verific în plus că segmentele dinamice NU
    se potrivesc — cu ele, `app/(public)/[slug]` ar fi făcut orice adresă să
    „existe", inclusiv una scrisă greșit.
  */
  assert.equal(existaPaginaStatica("/pagina-care-sigur-nu-exista-9137"), false);
  assert.equal(existaPaginaStatica("/"), true, "pagina de start stă într-un grup de rute — coborârea prin `(website)` s-a rupt");
  assert.equal(existaPaginaStatica("/preturi"), true);

  /* Adresa ștearsă pe 31.08: nu mai e pe disc, dar redirectarea o prinde. */
  assert.equal(existaPaginaStatica("/start"), false, "`/start` a fost ștearsă — dacă a reapărut, scoate redirectarea");
  assert.ok(adreseRedirectate().has("/start"), "redirectarea `/start` → `/` a dispărut din `next.config.ts`");
});
