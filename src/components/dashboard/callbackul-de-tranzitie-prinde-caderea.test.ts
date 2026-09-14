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

   ⚠ MASURAT (14.09.2026): 219 callbackuri de tranzitie cu corp-bloc in `src`, TOATE asteapta
   ceva, 9 prind caderea si 210 nu, raspandite in 64 de fisiere. Sunt panouri vii, folosite
   chiar acum. Nu le ating intr-un singur val, si nici nu le las sa se inmulteasca.

   Harta de mai jos spune cate sunt INCA descoperite in fiecare fisier, iar afirmatia cere
   EGALITATE cu masuratoarea. Deci: o reparatie care nu coboara numarul cade, si un callback
   nou fara `catch` cade la fel, cu numele fisierului in mesaj.

   ⚠ NUMARUL, NU SCUTIREA FISIERULUI. `ColeteAwbModal` si `WootAwbModal` au manere BUNE langa
   altele; o scutire pe fisier intreg le-ar fi lasat tocmai pe cele reparate nepazite. Aici
   fisierele lor nici nu apar in harta, deci numarul lor asteptat e ZERO.

   ═══ ⚠ CE NU APARA PROBA ASTA, SCRIS CINSTIT ═══

   Se cere un `catch` UNDEVA in corpul callbackului, nu neaparat pe drumul asteptarii. Un
   `catch` intr-o functie scrisa pe loc inauntru ar trece, desi apelul de afara ramane
   descoperit. Plasa e deci mai larga decat regula.

   Asta o face sa greseasca INTR-O SINGURA DIRECTIE: poate numi reparat ceva ce nu e, niciodata
   invers. Riscul e marginit, fiindca singurele intrari noi in categoria „prinde" sunt
   reparatiile mele, scrise in forma casei de mai jos. Cand un lot repara un fisier, ingustimea
   se cere acolo, pe apelul anume, nu aici.

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
 * reparat de tot IESE din harta. Scrisa de scaner, nu de mana: un numar din 64 transcris gresit
 * ar cere o masuratoare care n-a existat niciodata.
 */
const INCA_DESCOPERITE: Record<string, number> = {
  "admin/AdminAnnouncementsClient.tsx": 1,
  "dashboard/AbandonedAutomationsTab.tsx": 1,
  "dashboard/BundleForm.tsx": 1,
  "dashboard/BundlesClient.tsx": 1,
  "dashboard/CustomersClient.tsx": 1,
  "dashboard/DashboardTopbar.tsx": 2,
  "dashboard/DiscountsClient.tsx": 3,
  "dashboard/FacebookFeeduriClient.tsx": 1,
  "dashboard/FeaturesClient.tsx": 1,
  "dashboard/GpsrSettings.tsx": 1,
  "dashboard/OfferForm.tsx": 1,
  "dashboard/OffersClient.tsx": 2,
  "dashboard/ReturnsClient.tsx": 3,
  "dashboard/SelectorProduseFeed.tsx": 1,
  "dashboard/SettingsClient.tsx": 1,
};

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

type Callback = { cheie: string; rand: number; nume: string; asteapta: boolean; prinde: boolean };

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

      toate.push({
        cheie,
        rand,
        nume: m[1],
        asteapta: corp.includes("await "),
        prinde: /catch\s*[({]/.test(corp),
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
    + `asteptat = ${JSON.stringify(INCA_DESCOPERITE, null, 2)}`,
  );
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
      `${cheie} · start${nume}: nu mai prinde caderea. Era unul dintre cele 9 reparate, iar `
      + "acum o actiune care arunca acolo inlocuieste pagina cu 500. Pune `catch`-ul inapoi.");
  }

  const cateBune = toate.filter((c) => c.asteapta && c.prinde).length;
  assert.ok(cateBune >= PRIND_DEJA.length,
    `doar ${cateBune} callbackuri prind caderea, asteptam macar ${PRIND_DEJA.length}`);
});
