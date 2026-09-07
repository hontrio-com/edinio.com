import assert from "node:assert/strict";
import { test, before, beforeEach } from "node:test";
import { register } from "node:module";
import { NextRequest } from "next/server";
import { cheieIncarcare } from "@/lib/customization/fisiere-private";

/**
 * OPTIMIZATORUL PUBLIC DE IMAGINI NU ARE VOIE LA FISIERELE CUMPARATORILOR.
 *
 * ═══ ⚠ CE APARA FISIERUL ASTA ═══
 *
 * Fisierele urcate din formularul public de personalizare (poza de nunta, poza copilului,
 * macheta de tipar) nu mai circula ca adresa publica, ci ca o cheie semnata, servita numai prin
 * `/api/customization-file`, care cere sesiune, proprietatea magazinului si ca cheia sa fie chiar
 * pe comanda ceruta.
 *
 * `/api/img` sta chiar langa ea si nu cere nimic: e scutita dinadins de poarta MFA, si `KEY_RE`
 * primeste orice cheie de sub `products/` — adica si prefixul incarcarilor, caracter cu caracter.
 * Deci toate cele patru porti se ocoleau cu un GET fara cont, pe trei drumuri deodata: octetii cu
 * `public, max-age=31536000, immutable`, o COPIE permanenta scrisa inapoi in depozit sub
 * `_optim/…` cu acelasi antet public, si — cand octetii lipseau din depozit — un 302 catre chiar
 * adresa publica pe care toata piesa exista ca s-o scoata din circulatie.
 *
 * ⚠ FARA `w` NU se dadea 302, cum scria aici. `parseInt` da NaN, `|| 0` da 0, `Math.max(16, 0)`
 * da 16: latimea nu poate fi zero, deci se serveau tot OCTETII, la 16 pixeli. Masurat, cu cheia
 * in depozit si refuzul scos: `actual: 200`. Drumul fara `w` ramane probat mai jos — dar ca al
 * doilea fel de „se dau octetii”, nu ca redirectare.
 *
 * ═══ ⚠ DE CE SE CHEAMA CHIAR `GET`, SI DE CE PERECHEA POZITIVA E OBLIGATORIE ═══
 *
 * O proba pe sursa („exista sirul PREFIX_INCARCARI in fisier”) ar fi trecut peste un refuz pus
 * dupa citirea din depozit, peste unul care raspunde prin `fallback()` (adica prin chiar
 * redirectarea 302 de care ne aparam) si peste un `startsWith` ocolibil cu litere mari. Se cheama
 * ruta.
 *
 * Si fiecare refuz are perechea lui POZITIVA: fara ea, „ruta raspunde 404” s-ar fi putut
 * indeplini stricand optimizatorul cu totul — imaginile de produs ale tuturor magazinelor —, iar
 * proba ar fi ramas verde. Deci: cheia de personalizare e refuzata pe TOATE drumurile, si in
 * aceeasi trecere cheia obisnuita de produs primeste octeti, isi scrie varianta si cade pe 302
 * cand nu e in depozit.
 *
 * ═══ ⚠ DE CE FIECARE REFUZ RULEAZA PESTE TREI TERMINATII ═══
 *
 * Cat timp cheia se producea o singura data, cu `jpg`, un refuz ingustat la
 * `key.endsWith(".jpg") && esteIncarcareDeCumparator(key)` trecea 9 din 9 — masurat. Si nu e o
 * gaura teoretica: `/api/upload-customization` scrie `jpg`, `png` SI `webp`, iar `KEY_RE` le
 * primeste pe toate trei. Poza PNG a unui cumparator ar fi ramas servita public, cu copie
 * `_optim/` si cu tot, iar suita ar fi ramas verde. (`heic` lipseste dinadins din lista: `KEY_RE`
 * nu-l are, deci nu ajunge niciodata pana la refuz.)
 */

const BIZ = "11111111-1111-4111-8111-111111111111";
const R2_PUBLIC = "https://pub-exemplu.r2.dev";
/** O cheie obisnuita, cum o scrie `/api/upload`: `products/<id>/<uuid>.<ext>`. */
const CHEIE_PRODUS = "products/22222222-2222-4222-8222-222222222222/33333333-3333-4333-8333-333333333333.jpg";
/** Terminatiile pe care ruta de incarcare chiar le scrie SI pe care `KEY_RE` le primeste. */
const TERMINATII = ["jpg", "png", "webp"] as const;

/* ── Ce se inlocuieste: depozitul si decodorul. Ruta e cea adevarata. ─────────────────────── */

const HOOK = `data:text/javascript,${encodeURIComponent(
  `export async function resolve(specifier, context, next) {
     if (specifier === "@/lib/r2") {
       return {
         url: "data:text/javascript," + encodeURIComponent(
           "export const getFromR2 = async (k) => globalThis.__r2Citeste(k); export const uploadToR2 = async (b, k, t) => globalThis.__r2Scrie(b, k, t);"
         ),
         shortCircuit: true, format: "module",
       };
     }
     if (specifier === "sharp") {
       return {
         url: "data:text/javascript," + encodeURIComponent(
           "const api = { rotate: () => api, resize: () => api, webp: () => api, toBuffer: async () => Buffer.from('octeti-webp') }; export default function sharp(octeti, optiuni) { globalThis.__sharpChemat.push(optiuni); return api; }"
         ),
         shortCircuit: true, format: "module",
       };
     }
     return next(specifier, context);
   }`,
)}`;

type Global = typeof globalThis & {
  __r2Citeste: (k: string) => Promise<Buffer | null>;
  __r2Scrie: (b: Buffer, k: string, t: string) => Promise<string>;
  __sharpChemat: unknown[];
};

/** Ce are depozitul. */
let depozit: Record<string, Buffer> = {};
/** Cheile CITITE de la ultima golire. Asa se vede daca depozitul a fost atins. */
let citiri: string[] = [];
/** Cheile SCRISE de la ultima golire — adica copiile publice lasate in urma. */
let scrieri: string[] = [];

let GET: (req: NextRequest) => Promise<Response>;
/** Cheia adevarata, produsa de chiar semnatarul din productie — cate una pe terminatie. */
const CHEI: Record<string, string> = {};
/** Prescurtare pentru probele in care terminatia nu conteaza (caile stramb scrise). */
let CHEIE_INCARCARE = "";

before(async () => {
  process.env.R2_PUBLIC_URL = R2_PUBLIC;
  process.env.CUSTOMIZATION_FILE_SECRET = "secret-de-proba-pentru-semnatura";

  for (const ext of TERMINATII) CHEI[ext] = cheieIncarcare(BIZ, "aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee", ext);
  CHEIE_INCARCARE = CHEI.jpg;

  register(HOOK);
  const g = globalThis as Global;
  g.__r2Citeste = async (k) => {
    citiri.push(k);
    return depozit[k] ?? null;
  };
  g.__r2Scrie = async (_b, k) => {
    scrieri.push(k);
    return `${R2_PUBLIC}/${k}`;
  };
  g.__sharpChemat = [];

  ({ GET } = (await import("./route")) as unknown as { GET: typeof GET });
});

beforeEach(() => {
  citiri = [];
  scrieri = [];
  depozit = {};
});

function cere(p: string, w?: number) {
  const u = new URL("https://magazin.edinio.com/api/img");
  u.searchParams.set("p", p);
  if (w !== undefined) u.searchParams.set("w", String(w));
  return new NextRequest(u.toString());
}

/* ═══════════════════════════════════════════════════════════════════════════════════════════
   REFUZUL — pe fiecare drum al rutei, si pe fiecare terminatie pe care ruta de incarcare o scrie
   ═══════════════════════════════════════════════════════════════════════════════════════════ */

for (const ext of TERMINATII) {
  test(`⚠ cu \`w\`, .${ext}: octetii nu se dau, si depozitul nici nu se atinge`, async () => {
    /*
     * ⚠ NU E DOAR „raspunde 404”. Refuzul trebuie sa cada INAINTEA depozitului: pus dupa, ruta ar
     * fi citit fisierul si — mai rau — ar fi scris varianta `_optim/…` cu antet public de un an,
     * o a doua copie a pozei pe care nicio poarta si niciun drum de stergere nu o mai ating.
     */
    const cheie = CHEI[ext];
    depozit[cheie] = Buffer.from("poza-de-familie");

    const r = await GET(cere(cheie, 512));

    assert.equal(r.status, 404, `fisierul .${ext} al unui cumparator s-a servit fara sesiune`);
    assert.deepEqual(citiri, [], `depozitul a fost atins: ${citiri.join(", ")}`);
    assert.deepEqual(scrieri, [], `s-a scris o copie publica: ${scrieri.join(", ")}`);
  });

  test(`⚠ fara \`w\`, .${ext}: tot 404 sec, si niciun \`Location\``, async () => {
    /*
     * ⚠ DOUA LUCRURI DEODATA, si niciunul nu e „inca o data acelasi 404”.
     *
     * 1. Fara `w` latimea cade pe 16 (vezi nota de la `fallback()` in ruta), deci inainte de
     *    refuz cererea asta primea OCTETII pozei, la 16 pixeli — masurat, `actual: 200`. Un
     *    refuz pus doar pe ramura cu `w` ar fi lasat drumul asta deschis.
     * 2. `location === null` pinuieste ca refuzul NU e scris prin `fallback()`: scris asa, ar fi
     *    raspuns cu chiar redirectarea 302 catre adresa publica de care ne aparam.
     */
    const cheie = CHEI[ext];
    depozit[cheie] = Buffer.from("poza-de-familie");

    const r = await GET(cere(cheie));

    assert.equal(r.status, 404, `fisierul .${ext} s-a servit ca miniatura, fara sesiune`);
    assert.equal(r.headers.get("location"), null, "s-a dat inapoi adresa publica a fisierului");
    assert.deepEqual(citiri, [], `depozitul a fost atins: ${citiri.join(", ")}`);
  });
}

for (const [cum, strica] of [
  ["litere mari", (c: string) => c.toUpperCase()],
  ["doua bare", (c: string) => c.replace("products/", "products//")],
  ["un punct in cale", (c: string) => c.replace("products/", "products/./")],
] as const) {
  test(`⚠ si scrisa cu ${cum}, cheia e tot a unui cumparator`, async () => {
    /*
     * ⚠ DE-AIA REFUZUL E PE SEGMENTE, NU UN `startsWith`. `KEY_RE` e insensibila la litere si
     * `[\w./-]+` primeste si `//`, si `/./`. Toate trei treceau de o comparatie de prefix si
     * plecau ca `Location` catre un intermediar care aduna segmentele caii inapoi in cheie.
     */
    const cheie = strica(CHEIE_INCARCARE);

    const cuLatime = await GET(cere(cheie, 512));
    assert.equal(cuLatime.status, 404, `cheia scrisa cu ${cum} a trecut`);

    const faraLatime = await GET(cere(cheie));
    assert.equal(faraLatime.status, 404, `cheia scrisa cu ${cum} a primit redirectare`);
    assert.equal(faraLatime.headers.get("location"), null);

    assert.deepEqual(citiri, [], `depozitul a fost atins: ${citiri.join(", ")}`);
    assert.deepEqual(scrieri, []);
  });
}

test("⚠ refuzul e pe PREFIX, la orice adancime — nu pe forma de azi a cheii", async () => {
  /*
   * ⚠ CE APARA RANDUL ASTA, spus cinstit: nu un drum umblat azi. `cheieIncarcare` nu scrie
   * subdosare (si `esteCheiaNoastra` refuza cheile cu `/` in coada), deci obiectul asta nu exista
   * in R2 acum. Apara ziua in care cheia capata inca un nivel — gruparea pe comanda, de pilda —,
   * fiindca refuzul ingustat la o singura forma trece TOATE probele: masurat, cu
   * `if (segmente.length !== 4) return false;` pus in fata potrivirii, 9 din 9 verzi.
   *
   * ⚠ Si se pune dinadins in depozitul de proba: altfel esecul vizibil ar fi doar 302-ul, iar
   * proba n-ar putea observa ca s-au servit chiar octetii. Masurat cu refuzul scos: 200.
   */
  const cheie = CHEIE_INCARCARE.replace("customizations/", "customizations/comenzi/");
  depozit[cheie] = Buffer.from("poza-de-familie");

  const cuLatime = await GET(cere(cheie, 512));
  assert.equal(cuLatime.status, 404, "cheia cu un nivel in plus a trecut de refuz");

  const faraLatime = await GET(cere(cheie));
  assert.equal(faraLatime.status, 404, "cheia cu un nivel in plus a primit redirectare");
  assert.equal(faraLatime.headers.get("location"), null);

  assert.deepEqual(citiri, [], `depozitul a fost atins: ${citiri.join(", ")}`);
  assert.deepEqual(scrieri, []);
});

test("⚠ si bara LITERALA, si `%2F`: amandoua sunt aceeasi cale", async () => {
  /*
   * ⚠ DE CE DOUA SCRIERI. `u.searchParams.set` codeaza el insusi `/` ca `%2F` — masurat, iese
   * octet cu octet aceeasi adresa ca `encodeURIComponent`. Deci toate probele de mai sus trimit
   * DEJA forma procentuala, si niciuna nu trimitea o bara nemodificata. Aici se trimit
   * amandoua: un refuz scris pe sirul BRUT al cererii ar vedea `%2F` si n-ar recunoaste calea,
   * unul scris pe sirul brut in cealalta parte ar rata forma literala; al nostru se uita la
   * valoarea DECODATA, ca si `KEY_RE`, deci le vede la fel.
   *
   * ⚠ SI CHEIA STA IN DEPOZIT. Fara ea singurul esec pe care proba il poate vedea e 302-ul —
   * masurat cu refuzul scos, `actual: 302` —, adica n-ar putea observa niciodata ca s-au servit
   * chiar octetii.
   */
  for (const scriere of [CHEIE_INCARCARE, encodeURIComponent(CHEIE_INCARCARE)]) {
    citiri = [];
    scrieri = [];
    depozit = { [CHEIE_INCARCARE]: Buffer.from("poza-de-familie") };

    const r = await GET(new NextRequest(`https://magazin.edinio.com/api/img?p=${scriere}&w=512`));

    assert.equal(r.status, 404, `cheia scrisa ca „${scriere}” a trecut de refuz`);
    assert.deepEqual(citiri, [], `depozitul a fost atins: ${citiri.join(", ")}`);
    assert.deepEqual(scrieri, [], `s-a scris o copie publica: ${scrieri.join(", ")}`);
  }
});

/* ═══════════════════════════════════════════════════════════════════════════════════════════
   PERECHEA POZITIVA — fara ea, probele de mai sus trec si cu ruta stricata cu totul
   ═══════════════════════════════════════════════════════════════════════════════════════════ */

test("⚠ POZITIV: imaginea de produs primeste octeti si isi scrie varianta", async () => {
  depozit[CHEIE_PRODUS] = Buffer.from("octetii-produsului");

  const r = await GET(cere(CHEIE_PRODUS, 512));

  assert.equal(r.status, 200, "refuzul a prins si imaginile de produs ale tuturor magazinelor");
  assert.equal(r.headers.get("Content-Type"), "image/webp");
  assert.equal(Buffer.from(await r.arrayBuffer()).toString(), "octeti-webp");
  assert.deepEqual(scrieri, [`_optim/w512q75/${CHEIE_PRODUS}.webp`], "varianta nu s-a mai scris");
});

test("⚠ POZITIV: imaginea de produs care nu e in depozit cade tot pe 302", async () => {
  /* Drumul redirectarii ramane viu — deci 404-ul de mai sus e un REFUZ, nu purtarea obisnuita. */
  const r = await GET(cere(CHEIE_PRODUS, 512));

  assert.equal(r.status, 302, "s-a inchis si redirectarea imaginilor obisnuite");
  assert.equal(r.headers.get("location"), `${R2_PUBLIC}/${CHEIE_PRODUS}`);
});

test("⚠ POZITIV: o poza de produs al carei NUME contine cuvantul trece — refuzul e pe segment", async () => {
  /* `customizations.jpg` e un NUME de fisier, nu dosarul incarcarilor. Un refuz scris ca
     „contine cuvantul” ar fi ascuns imagini de produs cinstite. */
  const cheie = "products/22222222-2222-4222-8222-222222222222/customizations.jpg";
  depozit[cheie] = Buffer.from("octetii-produsului");

  const r = await GET(cere(cheie, 512));

  assert.equal(r.status, 200, "refuzul se uita la substring, nu la segmentele caii");
});
