import { strict as assert } from "node:assert";
import { test } from "node:test";
import { readFileSync, readdirSync } from "node:fs";
import { join, sep } from "node:path";

/*
  ═══════════════════════════════════════════════════════════════════════════════
  INSTRUMENTAREA PAGINILOR — ID-URI STABILE, FARA DUBLURI
  ═══════════════════════════════════════════════════════════════════════════════

  ⚠ DE CE CONTEAZA STABILITATEA. Un `cta_id` ajunge in fiecare raport. Daca se
  schimba — fiindca butonul si-a schimbat textul, sau fiindca cineva l-a rescris
  altfel — istoricul se rupe in doua serii care nu se pot compara, si nimic nu
  cade. De aceea id-urile spun UNDE si CE FACE, niciodata ce scrie pe buton.

  ⚠ SI DE CE CONTEAZA UNICITATEA. Doua butoane cu acelasi id se aduna intr-un
  singur rand de raport. Nu e o eroare vizibila: e un numar mai mare decat
  adevarul, pe care nimeni nu-l pune la indoiala.
*/

const RAD = process.cwd();

function fisiere(dir: string): string[] {
  const out: string[] = [];
  const mers = (d: string) => {
    let intrari;
    try { intrari = readdirSync(d, { withFileTypes: true }); } catch { return; }
    for (const it of intrari) {
      const p = join(d, it.name);
      if (it.isDirectory()) mers(p);
      else if (/\.tsx$/.test(it.name)) out.push(p);
    }
  };
  mers(join(RAD, dir));
  return out;
}

const citeste = (p: string) => readFileSync(p, "utf8");
const scurt = (p: string) => p.slice(RAD.length + 1).split(sep).join("/");

/** Toate perechile (id, fisier) marcate pentru urmarire. */
function marcaje(atribut: string): { id: string; fisier: string }[] {
  const gasite: { id: string; fisier: string }[] = [];
  const tipar = new RegExp(`${atribut}="([^"]+)"`, "g");
  for (const zona of ["src/components/website", "src/app/(website)"]) {
    for (const f of fisiere(zona)) {
      for (const m of citeste(f).matchAll(tipar)) gasite.push({ id: m[1], fisier: scurt(f) });
    }
  }
  return gasite;
}

/* ═══ 1. CTA-uri ═══ */

test("butoanele mari catre inregistrare sunt toate marcate", () => {
  /*
    ⚠ CINCI, si toate cinci conteaza. Palnia noastra incepe la unul dintre ele;
    unul nemarcat inseamna o cale de intrare invizibila in rapoarte — si tocmai
    aceea ar putea fi cea mai buna.
  */
  const asteptate = [
    "header_incepe", "final_incepe", "preturi_incepe",
    "pagina_incepe", "meniu_mobil_incepe",
  ];
  const gasite = new Set(marcaje("data-analytics-cta").map(x => x.id));
  for (const id of asteptate) {
    assert.ok(gasite.has(id), `butonul "${id}" nu mai e marcat — intrarea aia nu se mai vede in rapoarte`);
  }
});

test("⚠ niciun id de CTA nu se repeta", () => {
  const toate = marcaje("data-analytics-cta");
  const dupaId = new Map<string, string[]>();
  for (const { id, fisier } of toate) {
    dupaId.set(id, [...(dupaId.get(id) ?? []), fisier]);
  }
  const dublate = [...dupaId.entries()].filter(([, f]) => f.length > 1);
  assert.deepEqual(
    dublate.map(([id, f]) => `${id}: ${f.join(", ")}`), [],
    "doua butoane poarta acelasi id — clicurile lor se aduna intr-un singur rand,\n" +
    "iar numarul iese mai mare decat adevarul fara ca nimic sa cada",
  );
});

test("fiecare CTA marcat spune si UNDE se afla", () => {
  /*
    Fara `location`, doua butoane care duc in acelasi loc nu se pot deosebi in
    raport — si atunci nu se poate raspunde la singura intrebare care conteaza:
    care dintre ele aduce oameni.
  */
  for (const zona of ["src/components/website", "src/app/(website)"]) {
    for (const f of fisiere(zona)) {
      const s = citeste(f);
      const cate = (s.match(/data-analytics-cta="/g) ?? []).length;
      if (!cate) continue;
      const cuLoc = (s.match(/data-analytics-location="/g) ?? []).length;
      assert.ok(
        cuLoc >= cate,
        `${scurt(f)}: ${cate} butoane marcate, dar doar ${cuLoc} spun unde se afla`,
      );
    }
  }
});

test("id-urile nu poarta textul butonului", () => {
  /*
    ⚠ Un id ca `incepe_gratuit_acum` se leaga de eticheta afisata. Eticheta se
    schimba la prima campanie; id-ul ar trebui sa nu se schimbe niciodata.
    Regula practica: id-ul e `<unde>_<ce face>`, cu doua-trei bucati.
  */
  for (const { id, fisier } of marcaje("data-analytics-cta")) {
    assert.match(id, /^[a-z][a-z0-9_]*$/, `${fisier}: id-ul "${id}" nu e snake_case`);
    assert.ok(id.length <= 40, `${fisier}: id-ul "${id}" e prea lung ca sa fie stabil`);
    assert.ok(id.split("_").length <= 4, `${fisier}: id-ul "${id}" pare o propozitie, nu un identificator`);
  }
});

/* ═══ 2. Sectiuni ═══ */

test("sectiunile mari de pe pagina principala sunt marcate, si o singura data", () => {
  const asteptate = ["functionalitati", "integrari", "comparatie", "preturi", "intrebari", "final"];
  const toate = marcaje("data-analytics-section");
  const gasite = toate.map(x => x.id);

  for (const nume of asteptate) {
    assert.ok(gasite.includes(nume), `sectiunea "${nume}" nu mai e marcata`);
  }
  /*
    ⚠ O sectiune marcata de doua ori ar trage doua `section_view` pe aceeasi
    pagina — iar runtime-ul le deosebeste dupa NUME, deci a doua ar fi inghitita
    tacut si numai una din cele doua ar fi masurata. Care din ele, nu se stie.
  */
  const dublate = gasite.filter((n, i) => gasite.indexOf(n) !== i);
  assert.deepEqual([...new Set(dublate)], [], "sectiuni marcate de mai multe ori");
});

/* ═══ 3. Martorul ═══ */

test("martor: probele chiar gasesc marcaje", () => {
  /*
    Fara asta, o cale gresita ar face fiecare proba de mai sus sa treaca pe o
    lista goala — adica sa pazeasca nimic, foarte convingator.
  */
  assert.ok(marcaje("data-analytics-cta").length >= 5, "n-am gasit niciun CTA marcat — calea e gresita?");
  assert.ok(marcaje("data-analytics-section").length >= 6, "n-am gasit sectiuni marcate");
});
