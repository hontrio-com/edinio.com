import test from "node:test";
import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";

/* ══════════════════════════════════════════════════════════════════════════
   O ACTIUNE CARE ARUNCA INTR-O TRANZITIE IA TOT PANOUL      (14.09.2026)
   ══════════════════════════════════════════════════════════════════════════

   Tiparul, scris la fel in tot panoul comerciantului:

       startSave(async () => {
         const r = await updateCeva(businessId, date);      // ⚠ poate ARUNCA
         if ("error" in r) toast.error(r.error);
         else toast.success("S-a salvat.");
       });

   O actiune de server nu raspunde intotdeauna cu `{ error }`. La o desfasurare in curs, o
   retea cazuta sau un termen depasit, ea ARUNCA, si acolo nu o prinde nimeni.

   ═══ CE SE INTAMPLA ATUNCI, MASURAT IN SURSA REACT INSTALATA ═══

   Sonda peste `react-dom-client.development.js` (React 19.2.4), pe functiile scoase verbatim
   pe intervale de randuri: la respingere, numaratoarele tranzitiei CHIAR se elibereaza, dar
   valoarea inlantuita ajunge `status: "rejected"`, iar `trackUsedThenable` o RE-ARUNCA la
   randare (`case "rejected": throw thenable.reason`). Deci nu e o eroare inghitita, ci una
   mutata: din callback, in randare.

   De acolo urca pana la cea mai apropiata bariera de erori. In tot proiectul sunt DOUA,
   `src/app/error.tsx` si `src/app/global-error.tsx`, amandoua la radacina lui `app/`. Cea
   dintai (citita, nu presupusa) randeaza o pagina intreaga: „500", „Ceva nu a functionat
   corect" si un buton „Incearca din nou".

   Adica: comerciantul apasa Salveaza, si in loc de un mesaj primeste o pagina de 500 peste tot
   panoul. Pierde formularul completat si NU afla daca s-a salvat sau nu.

   ═══ DE CE O HARTA CU NUMERE, SI NU O REPARATIE INTR-UN SINGUR VAL ═══

   ⚠ LA PORNIREA ARCULUI (14.09.2026): 219 callbackuri de tranzitie cu corp-bloc in `src`, toate
   asteptand ceva, 9 prindeau caderea si 210 nu, raspandite in 64 de fisiere. Erau panouri vii,
   folosite chiar atunci, deci nu le-am atins intr-un singur val.

   ⚠ ARCUL S-A INCHEIAT in aceeasi zi, si harta e acum GOALA. Cifrele de mai sus sunt istorie
   DATATA, nu starea de acum; le las tocmai ca sa se vada de ce a fost nevoie de harta. De aici
   incolo ea nu mai masoara o datorie, ci prinde REGRESIILE.

   Harta de mai jos spune cate sunt INCA descoperite in fiecare fisier, iar afirmatia cere
   EGALITATE cu masuratoarea. Deci: o reparatie care nu coboara numarul cade, si un callback
   nou fara `catch` cade la fel, cu numele fisierului in mesaj.

   ⚠ NUMARUL, NU SCUTIREA FISIERULUI. `ColeteAwbModal` si `WootAwbModal` au manere BUNE langa
   altele; o scutire pe fisier intreg le-ar fi lasat tocmai pe cele reparate nepazite. Aici
   fisierele lor nici nu apar in harta, deci numarul lor asteptat e ZERO.

   ═══ ⚠ PANA PE 11.11.2026 PLASA ERA MAI LARGA DECAT REGULA ═══

   Se cerea un `catch` UNDEVA in corpul callbackului, nu pe drumul asteptarii, si asa a trecut
   chiar drumul banilor: `checkout-core.ts` (cosul si /checkout) era in `PRIND_DEJA` fiindca
   prindea `res.json()`, iar `placeCartOrder` si `fetch`-ul platii erau descoperite. O cadere
   dadea pagina „500” peste cos, si putea face a doua comanda. Gasit la recitirea probei de
   dinaintea lansarii, nu de proba asta.

   Acum se cere pentru FIECARE `await`: sa stea intr-un `try { }` al callbackului sau sa aiba
   `.catch(` pe acelasi enunt. Singurele exceptii sunt apelurile care isi prind singure caderile,
   numite in `NU_ARUNCA`, fiecare cu motivul. O asteptare intr-o functie scrisa pe loc si chemata
   din `try` ar fi socotita descoperita (greseala in directia sigura); masurat pe 11.11: niciuna.

   ═══ FORMA CASEI, LUATA DIN CELE 9 CARE PRIND DEJA ═══

   Doua forme, si alegerea intre ele nu e de gust:

     * LARGA (`EditorDescriereCategorie`): tot corpul in `try`, un `catch` la sfarsit. Buna
       cand dupa apel nu urmeaza decat mesaje.
     * INGUSTA (`ColeteAwbModal`): in `try` DOAR apelul, rezultatul declarat inainte,
       ramificarea afara, plus `finally` pentru steag. ⚠ Obligatorie cand dupa apel se face
       ceva ce poate arunca la randul lui: altfel `catch`-ul spune „nu stim daca a ajuns"
       pentru o operatie care CHIAR reusise. Un mesaj fals exact cand omul are nevoie de unul
       adevarat. Vezi `steagul-se-stinge-in-finally`.
*/

const RADACINA = "src";

/** ⚠ Cheia lasa `src/components/` deoparte, fiindca acolo stau toate azi. Una aparuta in
    `src/app/` ar intra in harta cu calea INTREAGA, deci s-ar vedea ca e altundeva. */
const PREFIX = "src/components/";

/**
 * Cate callbackuri de tranzitie mai asteapta reparatia, pe fisier.
 *
 * ⚠ LISTA SCADE, si fiecare numar coborat merge in ACELASI commit cu reparatia lui. Un fisier
 * reparat de tot IESE din harta. Scrisa de scaner, nu de mana: un numar transcris gresit ar cere
 * o masuratoare care n-a existat niciodata.
 *
 * ⚠ Aici a scris „un numar din 64", adica numarul de randuri de atunci. Reparatiile l-au facut
 * fals fara sa-l atinga nimeni, si tocmai proba asta le-a numarat. Cifra a fost scoasa, nu
 * inlocuita: una noua s-ar invechi la fel, iar propozitia isi spune adevarul si fara ea.
 */
/* ⚠ GOALA. Nu mai exista in `src` niciun callback de tranzitie care asteapta fara sa prinda.
   Un rand nou aici inseamna o regresie, si fiindca proba cere EGALITATE, el nu poate aparea
   tacut: ori cade proba, ori cineva scrie de ce. */
const INCA_DESCOPERITE: Record<string, number> = {};

/**
 * Cele care prind deja, cu numele manerului. Ele NU sunt in harta, deci numarul lor asteptat e
 * zero; randul asta exista ca sa se vada de ce, si ca scoaterea unui `catch` de acolo sa cada
 * cu un mesaj care spune CARE, nu doar ca un numar nu mai potriveste.
 */
const PRIND_DEJA: Array<[string, string]> = [
  ["dashboard/ColeteAwbModal.tsx", "PriceTransition"],
  ["dashboard/ColeteAwbModal.tsx", "CreateTransition"],
  ["dashboard/EditorDescriereCategorie.tsx", "Transition"],
  ["dashboard/WootAwbModal.tsx", "Create"],
  ["dashboard/WootAwbModal.tsx", "Cancel"],
  ["ministore/OrderModal.tsx", "Transition"],
  ["storefront/sections/checkout/checkout-core.ts", "Transition"],
  ["website/ContactForm.tsx", "Transition"],
  ["website/sections/migrare/FormularMigrare.tsx", "Transition"],
];

/* ── Citirea surselor ─────────────────────────────────────────────────────── */

function fisiere(dir: string, afara: string[] = []): string[] {
  for (const intrare of readdirSync(dir, { withFileTypes: true })) {
    const cale = `${dir}/${intrare.name}`;
    if (intrare.isDirectory()) fisiere(cale, afara);
    else if (/\.tsx?$/.test(intrare.name) && !/\.test\.tsx?$/.test(intrare.name)) afara.push(cale);
  }
  return afara;
}

/** ⚠ Comentariile se taie, si randurile se PASTREAZA la numar: o nota care pomeneste `catch`
    nu prinde nimic, dar numarul de rand din mesaj trebuie sa fie cel din fisier. */
function faraComentarii(t: string): string {
  return t
    .replace(/\r\n/g, "\n")
    .replace(/\/\*[\s\S]*?\*\//g, (m) => "\n".repeat((m.match(/\n/g) ?? []).length))
    /* ⚠ Doar comentariul care ocupa randul INTREG: un `//` la mijloc ar taia si `https://`. */
    .replace(/^[ \t]*\/\/.*$/gm, "");
}

/* ── Potrivirea callbackului ──────────────────────────────────────────────── */

const PERECHI: Record<string, string> = { "(": ")", "{": "}", "<": ">" };

function pereche(t: string, i: number): number {
  const deschis = t[i];
  const inchis = PERECHI[deschis];
  let adanc = 0;
  for (let k = i; k < t.length; k++) {
    if (t[k] === deschis) adanc++;
    else if (t[k] === inchis) {
      adanc--;
      if (adanc === 0) return k;
    }
  }
  return -1;
}

type Forma = "bloc" | "expresie" | "necitit";

/**
 * Corpul lui `async <generice?>(parametri) => …`, mergand pe STRUCTURA.
 *
 * ⚠ PRIMA VARIANTA A SCANERULUI MEU ERA STRICATA AICI, si merita scris de ce. Cautam prima
 * acolada de dupa `async (`, fara sa trec peste lista de parametri si peste sageata. La un
 * corp-expresie acolada gasita ar fi fost a ALTCUIVA, de mai jos, iar corpul imprumutat putea
 * sa contina un `catch` strain. Asta nu umfla numarul: il SCADE, adica declara prins un
 * callback care nu prinde nimic. Exact felul de greseala care nu se vede.
 */
function corpDeCallback(t: string, dupaAsync: number): { corp: string | null; forma: Forma } {
  let i = dupaAsync;

  if (t[i] === "<") {
    const j = pereche(t, i);
    if (j < 0) return { corp: null, forma: "necitit" };
    i = j + 1;
    while (i < t.length && /\s/.test(t[i])) i++;
  }

  if (t[i] !== "(") return { corp: null, forma: "necitit" };
  const inchidereParametri = pereche(t, i);
  if (inchidereParametri < 0) return { corp: null, forma: "necitit" };

  const sageata = t.indexOf("=>", inchidereParametri);
  if (sageata < 0) return { corp: null, forma: "necitit" };

  /* Intre `)` si `=>` incape doar o adnotare de tip (`: Promise<void>`). O acolada sau un
     punct-si-virgula acolo inseamna ca am iesit din constructie si citesc altceva. */
  if (/[{;]/.test(t.slice(inchidereParametri + 1, sageata))) return { corp: null, forma: "necitit" };

  i = sageata + 2;
  while (i < t.length && /\s/.test(t[i])) i++;
  if (t[i] !== "{") return { corp: null, forma: "expresie" };

  const inchidereCorp = pereche(t, i);
  if (inchidereCorp < 0) return { corp: null, forma: "necitit" };
  return { corp: t.slice(i, inchidereCorp + 1), forma: "bloc" };
}

const DESCHIDERE = /\bstart([A-Z][A-Za-z0-9]*)\s*\(\s*async\s*(?=[(<])/g;

/**
 * Asteptarile care NU pot arunca, deci nu cer `try`. Fiecare cu motivul; o intrare noua aici e o
 * afirmatie despre codul chemat, de verificat in el, nu o scutire de comoditate.
 */
const NU_ARUNCA: Array<[RegExp, string]> = [
  [/^await contLaComanda\.maiECerut\(\)/,
    "`maiECerut` (contul-la-comanda.ts) cheama `intreaba`, care isi prinde singura cererea si intoarce null"],
];

/**
 * Enunturile cu `await` din corp care nu stau intr-un `try { }` al corpului si n-au `.catch(` pe
 * acelasi enunt. Corpul vine fara comentarii (vezi `faraComentarii`).
 */
function asteptariDescoperite(corp: string): string[] {
  const incercari: Array<[number, number]> = [];
  for (const m of corp.matchAll(/\btry\s*\{/g)) {
    const deschis = (m.index ?? 0) + m[0].length - 1;
    const inchis = pereche(corp, deschis);
    if (inchis > 0) incercari.push([deschis, inchis]);
  }
  const descoperite: string[] = [];
  for (const m of corp.matchAll(/\bawait\s+/g)) {
    const p = m.index ?? 0;
    if (incercari.some(([a, b]) => p > a && p < b)) continue;
    const sfarsit = corp.indexOf(";", p);
    const enunt = corp.slice(p, sfarsit > 0 ? sfarsit : p + 200).replace(/\s+/g, " ");
    if (/\.catch\s*\(/.test(enunt)) continue;
    if (NU_ARUNCA.some(([re]) => re.test(enunt))) continue;
    descoperite.push(enunt.slice(0, 120));
  }
  return descoperite;
}

type Callback = { cheie: string; rand: number; nume: string; asteapta: boolean; prinde: boolean; descoperite: string[] };

function callbackuri(): { toate: Callback[]; ciudate: string[] } {
  const toate: Callback[] = [];
  const ciudate: string[] = [];

  for (const cale of fisiere(RADACINA)) {
    const brut = readFileSync(cale, "utf8");
    if (!brut.includes("start")) continue;
    const t = faraComentarii(brut);
    const cheie = cale.startsWith(PREFIX) ? cale.slice(PREFIX.length) : cale;

    for (const m of t.matchAll(DESCHIDERE)) {
      const inceput = m.index ?? 0;
      const rand = t.slice(0, inceput).split("\n").length;
      const { corp, forma } = corpDeCallback(t, inceput + m[0].length);

      if (forma !== "bloc" || corp === null) {
        ciudate.push(`${cheie}:${rand} · start${m[1]} (${forma})`);
        continue;
      }

      const descoperite = asteptariDescoperite(corp);
      toate.push({
        cheie,
        rand,
        nume: m[1],
        asteapta: corp.includes("await "),
        // Pe APEL (din 11.11.2026), nu „un catch oriunde in corp”: vezi nota de sus.
        prinde: descoperite.length === 0,
        descoperite,
      });
    }
  }

  return { toate, ciudate };
}

/* ── Regula ───────────────────────────────────────────────────────────────── */

test("⚠ plasa are pe cine cadea, si citeste FIECARE callback", () => {
  const { toate, ciudate } = callbackuri();

  /*
   * ⚠ SE NUMARA. Fara randul asta, o schimbare de asezare care nu mai potriveste `DESCHIDERE`
   * ar face proba sa treaca peste ZERO callbackuri si sa iasa verde. Masurat: 219, toate cu
   * asteptare. Pragul e sub masuratoare dinadins, ca stergerea cinstita a catorva sa nu para
   * o regresie.
   */
  assert.ok(toate.length >= 200,
    `gasite doar ${toate.length} callbackuri de tranzitie: plasa n-are pe cine cadea`);

  const cuAsteptare = toate.filter((c) => c.asteapta);
  assert.ok(cuAsteptare.length >= 200,
    `doar ${cuAsteptare.length} callbackuri asteapta ceva: plasa s-a ingustat pe nesimtite`);

  /*
   * ⚠ UN CALLBACK NECITIT E O GAURA, nu o scutire: nu stiu nici daca asteapta, nici daca
   * prinde, deci n-ar intra in harta si n-ar cadea niciodata. Masurat: ZERO.
   */
  assert.deepEqual(ciudate, [],
    "callbackurile astea n-au putut fi citite pe structura, deci regula nu li se aplica si ar "
    + `trece nevazute. Largeste \`corpDeCallback\`, nu harta:\n${ciudate.join("\n")}`);
});

test("⚠⚠ un callback de tranzitie care asteapta trebuie sa PRINDA caderea", () => {
  const { toate } = callbackuri();
  const descoperite = toate.filter((c) => c.asteapta && !c.prinde);

  const masurat: Record<string, number> = {};
  for (const c of descoperite) masurat[c.cheie] = (masurat[c.cheie] ?? 0) + 1;

  /*
   * ⚠ EGALITATE, nu „cel mult". Un `>=` ar lasa reparatiile sa se piarda tacut, iar un `<=` ar
   * lasa harta sa ramana in urma. Asa cad amandoua: si regresia, si reparatia nedeclarata.
   */
  assert.deepEqual(
    masurat, INCA_DESCOPERITE,
    "harta callbackurilor care nu prind caderea nu mai e cea scrisa. Daca ai REPARAT unul, "
    + "coboara numarul (sau scoate fisierul din harta) in acelasi commit; daca a aparut unul "
    + "nou, o actiune care arunca inlocuieste tot panoul cu pagina de 500 de la radacina si "
    + "comerciantul pierde formularul completat:\n"
    + `masurat  = ${JSON.stringify(masurat, null, 2)}\n`
    + `asteptat = ${JSON.stringify(INCA_DESCOPERITE, null, 2)}\n`
    + `asteptarile descoperite:\n${descoperite.map((c) => `${c.cheie}:${c.rand} start${c.nume}: ${c.descoperite.join(" | ")}`).join("\n")}`,
  );
});

test("⚠⚠ plasa e pe APEL: un `catch` pus altundeva in corp nu mai apara o asteptare descoperita", () => {
  // Forma exacta in care a scapat cosul pana pe 11.11.2026: `catch` doar pe `res.json()`.
  const corp = `{
    const result = await placeCartOrder(payload);
    if ("error" in result) return;
    const res = await fetch(endpoint, { method: "POST" });
    let data = {};
    try { data = await res.json(); } catch { }
  }`;
  assert.deepEqual(asteptariDescoperite(corp).map((e) => e.split("(")[0]),
    ["await placeCartOrder", "await fetch"]);

  const reparat = `{
    let result;
    try { result = await placeCartOrder(payload); } catch { return; }
    const r = await fetch(x).catch(() => null);
    if (contLaComanda.necesar && (await contLaComanda.maiECerut())) return;
  }`;
  assert.deepEqual(asteptariDescoperite(reparat), []);
});

test("⚠⚠ cele care prind deja raman prinse, si sunt numite", () => {
  const { toate } = callbackuri();

  for (const [cheie, nume] of PRIND_DEJA) {
    const gasit = toate.find((c) => c.cheie === cheie && c.nume === nume);

    assert.ok(gasit,
      `\`start${nume}\` din ${cheie} nu mai potriveste niciun callback: redenumit sau sters. `
      + "Adu lista la zi, altfel ea apara neantul.");

    assert.ok(gasit.asteapta,
      `${cheie} · start${nume}: nu mai asteapta nimic. Daca e adevarat, scoate-l din lista; `
      + "daca nu, potrivirea corpului s-a stricat.");

    assert.ok(gasit.prinde,
      `${cheie} · start${nume}: nu mai prinde caderea (${gasit.descoperite.join(" | ")}). Era unul `
      + "dintre cele reparate, iar acum o actiune care arunca acolo inlocuieste pagina cu 500. Pune `catch`-ul inapoi.");
  }

  const cateBune = toate.filter((c) => c.asteapta && c.prinde).length;
  assert.ok(cateBune >= PRIND_DEJA.length,
    `doar ${cateBune} callbackuri prind caderea, asteptam macar ${PRIND_DEJA.length}`);
});
