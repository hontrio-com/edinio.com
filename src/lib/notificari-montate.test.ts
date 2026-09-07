import { strict as assert } from "node:assert";
import { test } from "node:test";
import { readFileSync, existsSync, readdirSync, statSync } from "node:fs";
import { join, dirname, resolve, relative, sep } from "node:path";

/*
  ═══════════════════════════════════════════════════════════════════════════
  ORICE PAGINĂ CARE POATE CHEMA `toast` TREBUIE SĂ AIBĂ UN `<Toaster>` DEASUPRA
  ═══════════════════════════════════════════════════════════════════════════

  ⚠ DE CE E NEVOIE DE O PROBĂ, ȘI NU DE ATENȚIE. Pentru că greșeala e TĂCUTĂ.
  `toast.error("Eroare la initializarea platii.")` nu aruncă nimic când nu
  există niciun `<Toaster>` montat — sonner pune notificarea într-o coadă pe
  care n-o citește nimeni. Nu apare în consolă, nu cade nicio probă, build-ul e
  verde. Singurul simptom e un om care apasă un buton și nu vede nimic.

  ⚠ CE A FĂCUT-O NECESARĂ. Pe 31.08.2026 `<Toaster>` a fost mutat din
  `app/layout.tsx` (unde ajungea peste tot, inclusiv pe 28 de rute de prezentare
  care nu-l foloseau deloc) în cele cinci aspecte care chiar au nevoie de el.
  În clipa aia, `/reactivare` — singura rută din afara oricărui grup care cheamă
  `toast` — a rămas pentru un moment descoperită. Și tocmai acolo notificarea
  contează cel mai mult: un comerciant cu magazinul oprit, care încearcă să
  plătească.

  ⚠ CUM CAUTĂ. Urmărește importurile de la fișierul de rută în jos, prin `@/` și
  prin căi relative, până dă de `sonner`. Nu se uită după numele „toast" în text
  — un fișier care importă o componentă care importă alta care cheamă `toast` e
  la fel de vinovat, iar căutarea de text n-ar vedea asta.

  ⚠ CE NU ACOPERĂ: importurile dinamice (`next/dynamic`, `import()`). Astăzi nu
  există niciunul în `src/app` — se verifică mai jos, ca proba să cadă în ziua în
  care apare primul și cineva să vină să citească rândurile astea.
*/

const RAD = process.cwd();
const APP = join(RAD, "src/app");

const curat = (p: string) => relative(RAD, p).split(sep).join("/");

const cache = new Map<string, boolean>();

function rezolva(spec: string, dinFisier: string): string | null {
  let baza: string;
  if (spec.startsWith("@/")) baza = join(RAD, "src", spec.slice(2));
  else if (spec.startsWith(".")) baza = resolve(dirname(dinFisier), spec);
  else return null; // pachet din node_modules
  for (const ext of [".tsx", ".ts", "/index.tsx", "/index.ts"]) {
    if (existsSync(baza + ext) && statSync(baza + ext).isFile()) return baza + ext;
  }
  return existsSync(baza) && statSync(baza).isFile() ? baza : null;
}

/** Ajunge fișierul ăsta la `sonner`, direct sau prin oricâte importuri? */
function atingeSonner(fisier: string): boolean {
  const gata = cache.get(fisier);
  if (gata !== undefined) return gata;
  cache.set(fisier, false); // taie ciclurile de importuri
  const sursa = readFileSync(fisier, "utf8");
  if (/from\s+["']sonner["']/.test(sursa)) {
    cache.set(fisier, true);
    return true;
  }
  for (const m of sursa.matchAll(/from\s+["']([^"']+)["']/g)) {
    const t = rezolva(m[1], fisier);
    if (t && atingeSonner(t)) {
      cache.set(fisier, true);
      return true;
    }
  }
  return false;
}

function toateFisierele(dir: string): string[] {
  const out: string[] = [];
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    const p = join(dir, e.name);
    if (e.isDirectory()) out.push(...toateFisierele(p));
    else if (/\.tsx?$/.test(e.name)) out.push(p);
  }
  return out;
}

/** Are vreun aspect de la `dir` în sus un `<Toaster>` montat? */
function areToasterDeasupra(dir: string): string | null {
  let d = dir;
  for (;;) {
    const l = join(d, "layout.tsx");
    if (existsSync(l)) {
      const s = readFileSync(l, "utf8").replace(/\/\*[\s\S]*?\*\//g, "");
      if (/<NotificariToast\b|<Toaster\b/.test(s)) return curat(l);
    }
    if (d === APP) return null;
    const sus = dirname(d);
    if (sus === d) return null;
    d = sus;
  }
}

const RUTE = toateFisierele(APP).filter((f) => /\/page\.tsx$/.test(curat(f)));

test("fiecare pagină care ajunge la `sonner` are un `<Toaster>` într-un aspect părinte", () => {
  const descoperite: string[] = [];
  let cuToast = 0;

  for (const f of RUTE) {
    if (!atingeSonner(f)) continue;
    cuToast++;
    if (!areToasterDeasupra(dirname(f))) descoperite.push(curat(f));
  }

  assert.ok(cuToast > 0, "nicio pagină nu ajunge la `sonner` — urmărirea importurilor s-a stricat");
  assert.deepEqual(
    descoperite,
    [],
    "paginile astea pot chema `toast` fără să aibă vreun `<Toaster>` deasupra. " +
      "Notificările lor NU se văd, și nimic nu dă eroare. " +
      "Pune `<NotificariToast />` în aspectul lor:\n  " +
      descoperite.join("\n  "),
  );
});

test("site-ul de prezentare și magazinele NU cară `sonner` degeaba", () => {
  /*
    Reversul: nu doar că toată lumea care are nevoie e acoperită, ci și că cine
    n-are nevoie nu plătește. Dacă cineva pune din nou `<Toaster>` în rădăcină,
    proba de sus rămâne verde — asta e cea care cade.
  */
  const radacina = readFileSync(join(APP, "layout.tsx"), "utf8").replace(/\/\*[\s\S]*?\*\//g, "");
  assert.doesNotMatch(
    radacina,
    /<NotificariToast\b|<Toaster\b/,
    "`app/layout.tsx` e părintele TUTUROR rutelor. Un `<Toaster>` aici ajunge și " +
      "pe cele 28 de rute de prezentare și pe cele 15 de magazin, care nu cheamă " +
      "niciodată `toast`. Pune-l în aspectul grupului care are nevoie.",
  );

  for (const grup of ["(website)", "(ajutor)", "(public)"]) {
    const dir = join(APP, grup);
    if (!existsSync(dir)) continue;
    const ating = toateFisierele(dir)
      .filter((f) => /\/(page|layout)\.tsx$/.test(curat(f)))
      .filter(atingeSonner)
      .map(curat);
    assert.deepEqual(
      ating,
      [],
      `${grup} a început să importe \`sonner\`. Dacă e intenționat, grupul are ` +
        "nevoie de `<NotificariToast />` în aspectul lui — și atunci scoate-l de " +
        `aici. Rute:\n  ${ating.join("\n  ")}`,
    );
  }
});

test("nu au apărut importuri dinamice, pe care urmărirea nu le vede", () => {
  /*
    ⚠ MARGINEA PROBEI, SPUSĂ CU VOCE TARE. `next/dynamic` și `import()` rup lanțul
    de importuri pe care se bizuie totul mai sus. Azi nu există niciunul în
    `src/app`. Când apare primul, proba asta cade — nu fiindcă e greșit să-l
    folosești, ci ca să vină cineva să verifice de mână dacă ruta aia mai are
    `<Toaster>` deasupra.
  */
  const cu: string[] = [];
  for (const f of toateFisierele(APP)) {
    const nume = curat(f);
    /*
      ⚠ `route.ts` NU SE NUMĂRĂ, și nu e o scutire de convenență: un manipulator
      de rută întoarce un `Response`, nu randează niciodată React, deci nu poate
      avea și nu are nevoie de `<Toaster>`. Trei dintre ele chiar folosesc
      `import()` azi — Stripe, impersonare, încărcare de fișiere — și e în
      regulă. Ce contează aici e arborele care ajunge pe ecran.
    */
    if (/\/route\.tsx?$/.test(nume)) continue;
    /*
      ⚠ NICI PROBELE. Un `*.test.ts` de lângă o rută nu ajunge niciodată în
      arborele randat — el chiar RULEAZĂ ruta, și pentru asta îi înlocuiește
      capetele cu `await import(...)`. Numărat aici, ar fi cerut cuiva să caute un
      `<Toaster>` deasupra unui fișier care nu se randează nicăieri.
    */
    if (/\.test\.tsx?$/.test(nume)) continue;
    const s = readFileSync(f, "utf8").replace(/\/\*[\s\S]*?\*\//g, "");
    if (/from\s+["']next\/dynamic["']|[^.\w]import\s*\(/.test(s)) cu.push(nume);
  }
  assert.deepEqual(
    cu,
    [],
    "importuri dinamice în `src/app` — urmărirea de mai sus nu le poate urma. " +
      "Verifică de mână că rutele astea au `<Toaster>` deasupra dacă folosesc " +
      `\`toast\`, apoi mută-le pe lista de excepții:\n  ${cu.join("\n  ")}`,
  );
});
/*
  ═══════════════════════════════════════════════════════════════════════════
  INSTIINTAREA CARE PLEACA GOALA: `emailPayload` PE FIECARE CALE DE COMANDA
  ═══════════════════════════════════════════════════════════════════════════

  ⚠ DE CE STA AICI, langa Toaster. Fisierul asta apara un lucru anume: instiintarea
  care NU ajunge la om si nu doboara nimic pe drum. Emailul de comanda noua e acelasi
  fel de greseala. Cand `emailPayload` pleaca fara instantaneul personalizarii, emailul
  se trimite mai departe la fel de verde, doar ca atelierul primeste „Fototapet
  personalizat x1 — 778,75 lei” si nimic despre ce are de tiparit: nici tsc, nici
  build-ul, nici emailul insusi nu se plang. Proba veche a lantului sta in
  `personalizarea-ajunge-in-email.test.ts`; ea citeste DOAR prima aparitie a lui
  `const emailPayload = {` din `order.actions.ts` — adica cea din `placeOrder` — deci a
  ramas verde peste gaura de pe calea cosului. Cand fisierul ala se elibereaza, blocul
  de aici ii e casa mai potrivita.

  ⚠ CE A COSTAT LIPSA EI. `placeCartOrder` (checkout-ul din cos, calea pe care merg cei
  mai multi cumparatori) trimitea liniile fara `customization`, desi le scria corect in
  `orders.items`. Aceeasi comanda facuta din modalul „Comanda acum” purta dimensiunile,
  materialul si numarul de fisiere; facuta din cos, nu. Si de cand emailul nu mai poarta
  nici adresele fisierelor incarcate, instantaneul e SINGURUL lucru care mai iese despre
  ce s-a comandat.

  ⚠ TREI INELE, TREI PROBE. Instantaneul trece prin trei maini pana in email: se SCRIE pe
  linia comenzii (`customization: pers.instantaneu`), se COPIAZA in `emailPayload.items`
  (spread-ul conditionat) si se PREDA celor doua expedieri. Un singur jalon apara un
  singur inel — golit la sursa, emailul iese la fel de gol, iar numaratoarea de pe spread
  ramane verde; predat ciuntit (`{ ...emailPayload, items: [] }`), la fel. MASURAT: cu o
  singura proba, pusa pe jalonul din mijloc, au trecut verde PATRU mutanti deodata — sursa
  golita, campul stins imediat dupa spread, spread-ul comentat pe loc, payload-ul ciuntit la
  predare. Fiecare dintre ei pica acum o proba anume, si mesajul ei spune care inel s-a rupt.

  ⚠ CUM TAIE, SI DE CE NU ALTFEL. Marginile sunt CAILE DE COMANDA
  (`export async function placeOrder(` pana la urmatorul export de nivel zero), NU jalonul
  cautat. Taiata chiar din `const emailPayload = {`, proba ar fi trecut verde peste un
  mutant care sterge jalonul: fara felie, n-ar mai fi avut ce sa citeasca. Asa, fiecare
  aparitie a jalonului din TOT fisierul trebuie sa cada intr-o cale cunoscuta, iar o a
  treia cale de email aparuta maine pica proba pana e trecuta pe lista cu buna stiinta.

  ⚠ CE NU ACOPERA: un al cincilea apelant al celor doua expedieri, nascut in ALT fisier
  (un webhook, ingestul de marketplace). Azi nu exista niciunul — `sendNewOrderEmail` si
  `sendOrderConfirmationToCustomer` se cheama numai din `order.actions.ts` — dar probele
  de mai jos se ancoreaza pe numele fisierului, deci n-ar vedea o cale nascuta aiurea.
*/

const ORDER_ACTIONS = "src/lib/actions/order.actions.ts";

/** Caile care compun un email de comanda. A treia se adauga AICI, nu se ignora. */
const CAI_DE_COMANDA = ["placeOrder", "placeCartOrder"];

const JALON_PAYLOAD = "const emailPayload = {";

/**
 * ⚠ TIPARE, nu siruri. `map(i => ({` si `map((i) => ({` sunt acelasi cod; cu jalon-sir, o
 * simpla trecere de formatare (`eslint --fix`) pica proba cu mesajul „liniile emailului nu
 * mai vin din `allItems`”, adica trimite pe cineva sa caute un defect care nu exista.
 */
const TIPAR_MAPARE = /items:\s*allItems\.map\(\s*\(?\s*i\s*\)?\s*=>\s*\(\{/g;
const TIPAR_INSTANTANEU =
  /\.\.\.\(\s*["']customization["']\s+in\s+i\s*\?\s*\{\s*customization:\s*i\.customization\s*\}\s*:\s*\{\}\s*\)/g;
/** Inelul dinaintea emailului: instantaneul SERVERULUI scris pe linia comenzii. */
const TIPAR_SURSA = /customization:\s*pers\.instantaneu\b/g;

/** Predarea: fiecare expediere primeste chiar `emailPayload`, nu o copie ciuntita. */
const TRIMITERI = [
  { nume: "sendNewOrderEmail", tipar: /sendNewOrderEmail\(\s*[A-Za-z_$][\w.$]*\s*,\s*emailPayload\s*,/g },
  {
    nume: "sendOrderConfirmationToCustomer",
    tipar: /sendOrderConfirmationToCustomer\(\s*[A-Za-z_$][\w.$]*\s*,\s*emailPayload\s*,/g,
  },
];

const spatii = (s: string) => s.replace(/[^\n]/g, " ");

/**
 * ⚠ COMENTARIILE DEVIN SPATII INAINTE DE ORICE NUMARATOARE. O linie stearsa si lasata
 * comentata pe loc (`// ...("customization" in i ? ...`) e felul cel mai obisnuit in care o
 * linie chiar se dezactiveaza — numarata ca text, ar tine proba verde peste chiar defectul
 * aparat. MASURAT: fara masca, mutantul asta trecea verde.
 *
 * ⚠ Spatii, nu stergere: pozitiile si randurile raman exacte, deci liniile raportate mai jos
 * sunt chiar cele din fisier. Adresele (`https://`) nu se ating — al doilea tipar cere
 * inceput de rand sau spatiu inaintea lui `//`.
 */
function maschezaComentariile(text: string): string {
  return text
    .replace(/\/\*[\s\S]*?\*\//g, spatii)
    .replace(/(^|[ \t])\/\/.*$/gm, (m, inainte: string) => inainte + spatii(m.slice(inainte.length)));
}

/** ⚠ `order.actions.ts` e CRLF in arbore; fara normalizare, jaloanele de mai jos nu prind. */
function sursaActiuni(): string {
  return maschezaComentariile(readFileSync(join(RAD, ORDER_ACTIONS), "utf8").replace(/\r\n/g, "\n"));
}

/** Marginea INDEPENDENTA: de la antetul caii pana la urmatorul export de nivel zero. */
function zonaCaii(text: string, nume: string): { nume: string; start: number; stop: number } {
  const start = text.indexOf("export async function " + nume + "(");
  assert.notEqual(start, -1, nume + " nu mai exista in " + ORDER_ACTIONS);
  const dupa = text.indexOf("\nexport ", start + 1);
  return { nume, start, stop: dupa === -1 ? text.length : dupa };
}

function cate(text: string, bucata: string): number {
  return text.split(bucata).length - 1;
}

function cateTipar(text: string, tipar: RegExp): number {
  return (text.match(tipar) || []).length;
}

/**
 * Corpul chemarii `.map(...)`, taiat pe paranteze echilibrate.
 *
 * ⚠ Marginea NU e jalonul cautat: incepe la paranteza lui `map` si se opreste la perechea
 * ei, deci un camp adaugat DUPA spread (`..., customization: undefined`) cade tot inauntru
 * si se vede. Numaratoarea de subsiruri singura nu poate vedea o suprascriere.
 */
function corpulMaparii(corp: string, deLa: number): string {
  const desch = corp.indexOf("(", deLa);
  if (desch === -1) throw new Error("maparea liniilor nu mai are paranteza in " + ORDER_ACTIONS);
  let adanc = 0;
  for (let i = desch; i < corp.length; i++) {
    if (corp[i] === "(") adanc++;
    else if (corp[i] === ")" && --adanc === 0) return corp.slice(desch, i + 1);
  }
  throw new Error("paranteze neinchise in maparea liniilor din " + ORDER_ACTIONS);
}

test("⚠ instantaneul personalizarii pleaca in email pe FIECARE cale de comanda", () => {
  const text = sursaActiuni();
  const lipsuri: string[] = [];

  for (const nume of CAI_DE_COMANDA) {
    const z = zonaCaii(text, nume);
    const corp = text.slice(z.start, z.stop);

    assert.ok(corp.includes(JALON_PAYLOAD), nume + ": nu mai construieste niciun `emailPayload`");

    const mapari = [...corp.matchAll(TIPAR_MAPARE)];
    assert.ok(
      mapari.length > 0,
      nume + ": nu se mai recunoaste `items: allItems.map(i => ({` in corpul caii. Ori s-a mutat " +
        "constructia liniilor emailului, ori si-a schimbat forma. Daca doar s-a reformatat, largeste " +
        "`TIPAR_MAPARE` — proba nu poate numara ce nu recunoaste.",
    );

    const instantanee = cateTipar(corp, TIPAR_INSTANTANEU);
    if (instantanee !== mapari.length) {
      lipsuri.push(nume + ": " + mapari.length + " mapari de linii, dar " + instantanee + " cu instantaneu");
    }

    for (const m of mapari) {
      const trup = corpulMaparii(corp, m.index ?? 0);
      if (trup.replace(TIPAR_INSTANTANEU, "").includes("customization")) {
        lipsuri.push(
          nume + ": maparea liniilor atinge `customization` si in afara spread-ului conditionat — " +
            "un camp pus dupa el il stinge, iar numaratoarea de mai sus tot ar iesi",
        );
      }
    }
  }

  assert.deepEqual(
    lipsuri,
    [],
    "emailul comerciantului SI cel al clientului pleaca fara ce a personalizat " +
      "cumparatorul. `randPersonalizare` din `email.ts` citeste `linie.customization`: " +
      "fara spread-ul conditionat intoarce sir gol si randul nu se tipareste deloc.\n  " +
      lipsuri.join("\n  "),
  );
});

test("⚠ instantaneul se SCRIE pe linia comenzii, pe fiecare cale — inelul dinaintea emailului", () => {
  const text = sursaActiuni();
  const fara: string[] = [];

  for (const nume of CAI_DE_COMANDA) {
    const z = zonaCaii(text, nume);
    if (cateTipar(text.slice(z.start, z.stop), TIPAR_SURSA) === 0) fara.push(nume);
  }

  assert.deepEqual(
    fara,
    [],
    "calea asta nu mai scrie `customization: pers.instantaneu` pe linia comenzii. Spread-ul din " +
      "`emailPayload` ramane la locul lui si proba de deasupra ramane verde, dar copiaza un camp " +
      "care nu mai exista: atelierul primeste iar „nume x1” si atat, si nici `orders.items` nu-l " +
      "mai are.\n  ⚠ De ce se cere pe FIECARE cale: `niciun-drum-nu-ocoleste.test.ts` cauta acelasi " +
      "tipar pe TOT fisierul, deci copia din `placeOrder` il multumeste singura chiar cand calea " +
      "cosului e goala.\n  " + fara.join("\n  "),
  );
});

test("⚠ ce s-a construit e chiar ce se PREDA celor doua expedieri", () => {
  const text = sursaActiuni();
  const rele: string[] = [];

  for (const nume of CAI_DE_COMANDA) {
    const z = zonaCaii(text, nume);
    const corp = text.slice(z.start, z.stop);
    for (const t of TRIMITERI) {
      const chemari = cate(corp, t.nume + "(");
      const curate = cateTipar(corp, t.tipar);
      if (chemari === 0) rele.push(nume + ": nu mai cheama `" + t.nume + "`");
      else if (curate !== chemari) {
        rele.push(nume + ": " + chemari + " chemari `" + t.nume + "`, dintre care " + curate + " cu chiar `emailPayload`");
      }
    }
  }

  assert.deepEqual(
    rele,
    [],
    "intre `emailPayload` si expediere s-a strecurat altceva. Probele de deasupra masoara " +
      "CONSTRUCTIA: cu `{ ...emailPayload, items: [] }` la predare, ele raman verzi si emailul " +
      "pleaca gol. Daca predarea chiar are voie sa schimbe ceva, spune AICI ce si de ce.\n  " +
      rele.join("\n  "),
  );
});

test("⚠ niciun `emailPayload` nu sta in afara cailor pe care le apara proba de deasupra", () => {
  const text = sursaActiuni();
  const zone = CAI_DE_COMANDA.map((nume) => zonaCaii(text, nume));

  const gasite: number[] = [];
  for (let i = text.indexOf(JALON_PAYLOAD); i !== -1; i = text.indexOf(JALON_PAYLOAD, i + 1)) gasite.push(i);
  assert.ok(gasite.length > 0, "`" + JALON_PAYLOAD + "` a disparut cu totul din " + ORDER_ACTIONS);

  const linia = (i: number) => text.slice(0, i).split("\n").length;
  const straine = gasite.filter((i) => !zone.some((z) => i >= z.start && i < z.stop)).map(linia);
  assert.deepEqual(
    straine,
    [],
    "un `emailPayload` construit in afara lui " + CAI_DE_COMANDA.join("/") + " (liniile de mai sus). " +
      "Probele de deasupra NU se uita acolo, deci calea aia poate trimite emailuri fara " +
      "instantaneu fara sa cada nimic. Treci calea in `CAI_DE_COMANDA`.",
  );

  for (const z of zone) {
    const cateInZona = cate(text.slice(z.start, z.stop), JALON_PAYLOAD);
    assert.equal(
      cateInZona,
      1,
      z.nume + ": " + cateInZona + " `emailPayload`, asteptam exact unul. Cu doua, unul poate ramane " +
        "fara instantaneu si numaratoarea de mai sus tot ar putea iesi.",
    );
  }
});
