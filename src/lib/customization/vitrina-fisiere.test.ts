import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import React from "react";
import { PREFIX_INCARCARI, numeleFisierului, sePoateRandaCaImagine } from "./adresa";
import type { CampPersonalizare } from "./definitie";
import { usePersonalizare } from "@/components/storefront/sections/product/_shared/usePersonalizare";

/**
 * Ce vede CUMPARATORUL cand isi incarca poza, dupa trecerea la chei semnate.
 *
 * ═══ ⚠ DE CE SE RULEAZA CHIAR CARLIGUL, SI NU SE CITESTE SURSA LUI ═══
 *
 * Proiectul n-are jsdom si n-are React Testing Library, deci tiparul casei pentru garantiile de
 * componenta e citirea sursei (vezi `fisier.test.ts`). Numai ca aici constatarile sunt despre
 * PURTARE IN TIMP: „mesajul rosu ramane dupa o reusita”, „a doua incarcare o suprascrie pe prima”,
 * „obiectul nu se elibereaza la scoatere”. Toate trei se pot afirma pe sursa, si toate trei ar
 * ramane verzi peste un carlig care face ordinea gresita — fiindca sursa nu are ordine, are text.
 *
 * Deci carligul se MONTEAZA. React 19 isi ia `useState`/`useEffect` dintr-un „dispatcher” pus
 * intr-un slot global (`H`); harnasamentul de mai jos pune acolo unul propriu, minuscul, si
 * cheama chiar `usePersonalizare`. Ce se probeaza asa e purtarea adevarata a codului livrat, nu o
 * copie a lui rescrisa in proba.
 *
 * ⚠ CE RAMANE PE SURSA, si de ce: RANDAREA. Ramura de miniatura din `CampuriPersonalizare` nu se
 * poate executa fara DOM, iar tocmai ea era moarta. Pentru ea se cere forma din sursa — dar pe o
 * sursa din care s-au SCOS COMENTARIILE, fiindca altfel proba se potriveste pe propriile mele
 * explicatii (fiecare sir cautat mai jos apare si intr-un comentariu de deasupra lui).
 */

const BIZ = "11111111-1111-4111-8111-111111111111";
const VITRINA = "src/components/storefront/sections/product/_shared/CampuriPersonalizare.tsx";
const CARLIG = "src/components/storefront/sections/product/_shared/usePersonalizare.ts";

/** Cheia asa cum o compune ruta: `<prefix><magazin>/<uuid>-<24 hexa>.<ext>`. */
function cheia(n: number, ext: string): string {
  return `${PREFIX_INCARCARI}${BIZ}/aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeee0${n}-0123456789abcdef01234567.${ext}`;
}

/* ═══════════════════════════════════════════════════════════════════════════
   HARNASAMENTUL: un React de buzunar, cat sa poata trai un carlig
   ═══════════════════════════════════════════════════════════════════════════ */

type Dependinte = readonly unknown[] | undefined;

interface Celula {
  v?: unknown;
  current?: unknown;
  deps?: Dependinte;
  efect?: () => (() => void) | void;
  curat?: (() => void) | void;
}

function aceleasi(a: Dependinte, b: Dependinte): boolean {
  if (!a || !b || a.length !== b.length) return false;
  return a.every((x, i) => Object.is(x, b[i]));
}

interface Montat<T> {
  readonly stare: T;
  act: (fn: () => unknown) => Promise<void>;
  demonteaza: () => void;
}

function monteaza<T>(carlig: () => T): Montat<T> {
  const celule: Array<Celula | undefined> = [];
  const deRulat: number[] = [];
  let i = 0;
  let murdar = false;
  let rezultat!: T;

  const D = {
    useState(init: unknown) {
      const idx = i++;
      let c = celule[idx];
      if (!c) {
        c = { v: typeof init === "function" ? (init as () => unknown)() : init };
        celule[idx] = c;
      }
      const celula = c;
      return [
        celula.v,
        (n: unknown) => {
          const nou = typeof n === "function" ? (n as (x: unknown) => unknown)(celula.v) : n;
          if (!Object.is(nou, celula.v)) {
            celula.v = nou;
            murdar = true;
          }
        },
      ];
    },
    useRef(init: unknown) {
      const idx = i++;
      let c = celule[idx];
      if (!c) {
        c = { current: init };
        celule[idx] = c;
      }
      return c;
    },
    useMemo(fn: () => unknown, deps: Dependinte) {
      const idx = i++;
      let c = celule[idx];
      if (!c || !aceleasi(c.deps, deps)) {
        c = { v: fn(), deps };
        celule[idx] = c;
      }
      return c.v;
    },
    useCallback(fn: unknown, deps: Dependinte) {
      return D.useMemo(() => fn, deps);
    },
    useEffect(fn: () => (() => void) | void, deps: Dependinte) {
      const idx = i++;
      const c = celule[idx];
      if (!c || !aceleasi(c.deps, deps)) {
        celule[idx] = { deps, efect: fn, curat: c?.curat };
        deRulat.push(idx);
      }
    },
  };

  const interne = (React as unknown as {
    __CLIENT_INTERNALS_DO_NOT_USE_OR_WARN_USERS_THEY_CANNOT_UPGRADE: { H: unknown };
  }).__CLIENT_INTERNALS_DO_NOT_USE_OR_WARN_USERS_THEY_CANNOT_UPGRADE;

  const randeaza = () => {
    i = 0;
    murdar = false;
    const anterior = interne.H;
    interne.H = D;
    try {
      rezultat = carlig();
    } finally {
      interne.H = anterior;
    }
    for (const idx of deRulat.splice(0)) {
      const c = celule[idx];
      if (!c) continue;
      if (typeof c.curat === "function") c.curat();
      c.curat = c.efect ? c.efect() : undefined;
    }
  };

  randeaza();

  return {
    get stare() {
      return rezultat;
    },
    async act(fn: () => unknown) {
      await fn();
      let paza = 0;
      while (murdar && paza++ < 50) randeaza();
    },
    demonteaza() {
      for (const c of celule) if (c && typeof c.curat === "function") c.curat();
    },
  };
}

/* ═══════════════════════════════════════════════════════════════════════════
   IMPREJURIMILE: reteaua si obiectele de browser, tinute in mana
   ═══════════════════════════════════════════════════════════════════════════ */

interface Raspuns {
  cheie?: string;
  error?: string;
}

interface Retea {
  /** Acelasi raspuns la orice cerere: cheia data, sau eroarea data. */
  raspunde: (r: Raspuns) => void;
  /**
   * Cate un raspuns pe NUMELE fisierului urcat.
   *
   * ⚠ FARA ASTA NU SE VEDE UN LOT, si asta a costat un mutant supravietuitor. Cu o singura cheie
   * fixa pe toata proba, cele trei fisiere ale unui lot capatau ACEEASI cheie — deci un carlig
   * care ia numele si obiectul mereu de la primul fisier al lotului era de nedeosebit de unul
   * corect. Se raspunde dupa fisierul chiar din cerere, nu dupa ordinea sosirii: cu rulari
   * suprapuse tinute in aer, ordinea nu mai e cea din proba.
   */
  raspundePeNume: (dupaNume: Record<string, Raspuns>) => void;
  /** Tine cererile in aer pana la `dezleaga()`. */
  tine: () => void;
  dezleaga: () => void;
  cereri: number;
}

interface Imprejurimi {
  retea: Retea;
  facute: string[];
  eliberate: string[];
  restaureaza: () => void;
}

function pregateste(): Imprejurimi {
  const fetchVechi = globalThis.fetch;
  const creeazaVechi = URL.createObjectURL;
  const revocaVechi = URL.revokeObjectURL;

  const facute: string[] = [];
  const eliberate: string[] = [];
  let urmatorul: Raspuns = {};
  let dupaNume: Record<string, Raspuns> | null = null;
  let tinute: Array<() => void> | null = null;

  const retea: Retea = {
    raspunde(r) {
      urmatorul = r;
      dupaNume = null;
    },
    raspundePeNume(h) {
      dupaNume = h;
    },
    tine() {
      tinute = [];
    },
    dezleaga() {
      const c = tinute ?? [];
      tinute = null;
      for (const f of c) f();
    },
    cereri: 0,
  };

  /*
   * ═══ ⚠ RETEAUA DE PROBA URMEAZA CEI TREI PASI ═══
   *
   * De pe 07.09.2026 octetii nu mai trec prin serverul nostru: Vercel refuza cererile de peste
   * 4,5 MB, iar campurile promiteau 10 si 40. Deci carligul face trei cereri pe fisier:
   *
   *   1. POST /api/upload-customization           -> { incarcare, referinta }
   *   2. PUT  <linkul semnat>                     -> octetii, direct in depozit
   *   3. POST /api/upload-customization/finalizeaza -> { cheie }
   *
   * ⚠ NUMELE FISIERULUI SE AFLA ABIA LA PASUL 2, fiindca pasul 1 trimite doar tipul si marimea —
   * serverul n-are nevoie de nume, si nu i-l dam degeaba. Deci proba leaga `referinta` de nume
   * cand vede PUT-ul, si raspunde la pasul 3 dupa legatura aia. Asa raspunsurile raman legate de
   * FISIER, nu de ordinea sosirii — iar cererile tinute in aer se termina oricum in alta ordine.
   */
  let nrRef = 0;
  const numeDupaRef = new Map<string, string>();

  globalThis.fetch = (async (adresa: unknown, optiuni?: { body?: unknown }): Promise<Response> => {
    retea.cereri += 1;
    const url = String(adresa);

    /* Pasul 2: octetii. Aici se afla ce fisier e. */
    if (!url.startsWith("/api/upload-customization")) {
      const f = optiuni?.body;
      const ref = new URL(url).searchParams.get("ref") ?? "";
      if (f instanceof File) numeDupaRef.set(ref, f.name);
      if (tinute) await new Promise<void>((rezolva) => { tinute?.push(rezolva); });
      return { ok: true, json: async () => ({}) } as unknown as Response;
    }

    /* Pasul 1: voia. Nu se stie inca ce fisier e, deci raspunsul e generic. */
    if (!url.includes("/finalizeaza")) {
      const referinta = `ref-${++nrRef}`;
      if (tinute) await new Promise<void>((rezolva) => { tinute?.push(rezolva); });
      return {
        ok: true,
        json: async () => ({ incarcare: `https://depozit-de-proba.invalid/put?ref=${referinta}`, referinta }),
      } as unknown as Response;
    }

    /* Pasul 3: verdictul. Acum se stie fisierul, prin `referinta`. */
    let corp = urmatorul;
    if (dupaNume) {
      const trup = optiuni?.body;
      const ref = typeof trup === "string" ? (JSON.parse(trup) as { referinta?: string }).referinta ?? "" : "";
      const n = numeDupaRef.get(ref) ?? "";
      corp = dupaNume[n] ?? { error: `proba: fisier neasteptat „${n}”` };
    }
    if (tinute) await new Promise<void>((rezolva) => { tinute?.push(rezolva); });
    return { ok: true, json: async () => corp } as unknown as Response;
  }) as typeof globalThis.fetch;

  /*
   * ⚠ OBIECTUL POARTA NUMELE FISIERULUI DIN CARE S-A FACUT, si nu e o infrumusetare.
   *
   * Fara el, un carlig care face toate obiectele din PRIMUL fisier al lotului ramanea de
   * nedeosebit: obiectele ies oricum diferite (fiecare apel isi are numarul lui), deci „sunt
   * distincte” nu spune nimic. Cu numele in obiect se poate cere ca miniatura fiecarui rand sa
   * vina chiar din fisierul randului aceluia.
   */
  URL.createObjectURL = ((f: Blob): string => {
    const nume = f instanceof File ? f.name : "necunoscut";
    const o = `blob:proba/${facute.length}-${nume}`;
    facute.push(o);
    return o;
  }) as typeof URL.createObjectURL;

  URL.revokeObjectURL = ((o: string) => {
    eliberate.push(o);
  }) as typeof URL.revokeObjectURL;

  return {
    retea,
    facute,
    eliberate,
    restaureaza() {
      globalThis.fetch = fetchVechi;
      URL.createObjectURL = creeazaVechi;
      URL.revokeObjectURL = revocaVechi;
    },
  };
}

const CAMP: CampPersonalizare = {
  id: "f",
  type: "image",
  label: "Poza ta",
  required: true,
  max_files: 5,
};

const PAGINA = {
  customization: {
    enabled: true,
    fields: [{ id: "f", type: "image", label: "Poza ta", required: true, max_files: 5 }],
  },
};

/** Un `FileList` cat sa treaca prin `Array.from` si `.length`. */
function lista(...nume: string[]): FileList {
  return nume.map((n) => new File(["x"], n, { type: "image/jpeg" })) as unknown as FileList;
}

function fisiereleDin(stare: { valori: Record<string, unknown> }): string[] {
  const v = stare.valori.f;
  return Array.isArray(v) ? (v as string[]) : [];
}

/* ═══════════════════════════════════════════════════════════════════════════
   SURSA, FARA COMENTARII
   ═══════════════════════════════════════════════════════════════════════════ */

function sursa(rel: string): string {
  return readFileSync(path.resolve(process.cwd(), rel), "utf8").replace(/\r\n/g, "\n");
}

/**
 * ⚠ MARGINEA PROBELOR PE SURSA.
 *
 * Fiecare sir cautat mai jos apare si in comentariul scris deasupra randului. O proba care
 * cauta in tot fisierul ar fi ramas verde si dupa ce cineva sterge codul, cat timp lasa
 * explicatia — adica ar fi certificat o intentie, nu o purtare. Se cauta doar in cod.
 */
function faraComentarii(s: string): string {
  return s
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .split("\n")
    .filter((l) => !l.trim().startsWith("//"))
    .join("\n");
}

test("⚠ marginea insasi: `faraComentarii` chiar taie comentariile", () => {
  /*
   * Fara proba asta, tot ce urmeaza atarna de o functie neverificata: daca ea ar intoarce sursa
   * neatinsa, fiecare afirmatie de mai jos s-ar putea potrivi pe un comentariu.
   */
  const carlig = sursa(CARLIG);
  assert.ok(carlig.includes("node:crypto"), "sirul de control a disparut din comentariu");
  assert.equal(
    faraComentarii(carlig).includes("node:crypto"), false,
    "comentariile raman in text, deci probele de mai jos se pot potrivi pe ele",
  );

  const vitrina = sursa(VITRINA);
  assert.ok(vitrina.includes("`URL.createObjectURL`"));
  assert.equal(faraComentarii(vitrina).includes("`URL.createObjectURL`"), false);
});

/* ═══════════════════════════════════════════════════════════════════════════
   16 + 24 — MINIATURA
   ═══════════════════════════════════════════════════════════════════════════ */

test("⚠ 16/24 miniatura: AMANDOUA jumatatile pazei sunt adevarate pe o cheie adevarata", async () => {
  /*
   * ⚠ CE A COSTAT: ramura de miniatura e pazita de `previzualizari[url] && sePoateRandaCaImagine(url)`.
   * A doua jumatate trecea prin `new URL()` pe o CHEIE, care arunca, deci intorcea `false` pentru
   * ORICE fisier: ramura era cod mort din prima zi. Cumparatorul care tocmai pusese poza nepotului
   * pe un tablou de 250 lei vedea in locul ei un rand de hexazecimal.
   *
   * Se probeaza pe cheia pe care o produce CHIAR carligul, si pe amandoua jumatatile deodata —
   * fiindca ramura moare daca oricare din ele e falsa.
   */
  const im = pregateste();
  try {
    const h = monteaza(() => usePersonalizare(PAGINA, BIZ));
    im.retea.raspunde({ cheie: cheia(1, "jpg") });
    await h.act(() => h.stare.incarcaFisiere(CAMP, lista("nunta-2026.jpg")));

    const chei = fisiereleDin(h.stare);
    assert.deepEqual(chei, [cheia(1, "jpg")], "cheia serverului n-a ajuns in valoarea campului");

    const url = chei[0];
    assert.ok(h.stare.previzualizari[url], "prima jumatate: nu exista previzualizare pe cheie");
    assert.equal(sePoateRandaCaImagine(url), true, "a doua jumatate: cheia nu se poate desena");

    h.demonteaza();
  } finally {
    im.restaureaza();
  }
});

test("⚠ 16/24 perechea: pe un PDF ramura NU se aprinde, si nici obiect nu se face", async () => {
  /*
   * Fara perechea asta, proba de mai sus ar trece si peste un `sePoateRandaCaImagine` care spune
   * mereu „da” — adica peste o miniatura rupta in dreptul fiecarui PDF de tipar.
   */
  const im = pregateste();
  try {
    const h = monteaza(() => usePersonalizare(PAGINA, BIZ));
    im.retea.raspunde({ cheie: cheia(2, "pdf") });
    await h.act(() => h.stare.incarcaFisiere(CAMP, lista("tipar.pdf")));

    const url = fisiereleDin(h.stare)[0];
    assert.equal(url, cheia(2, "pdf"));
    assert.equal(sePoateRandaCaImagine(url), false, "un PDF s-ar desena ca imagine");
    assert.equal(h.stare.previzualizari[url], undefined, "s-a facut obiect pentru ce nu se deseneaza");
    assert.equal(im.facute.length, 0, "octetii unui PDF de 35 MB raman prinsi in fila degeaba");

    h.demonteaza();
  } finally {
    im.restaureaza();
  }
});

test("⚠ 16/24 randarea: paza din vitrina e chiar cea de mai sus, si vine din modulul PUR", () => {
  /* Purtarea de mai sus nu apara nimic daca ecranul intreaba altceva. */
  const cod = faraComentarii(sursa(VITRINA));
  assert.match(
    cod, /previzualizari\[url\] && sePoateRandaCaImagine\(url\) \? \(/,
    "vitrina nu mai pazeste miniatura cu cele doua jumatati probate",
  );
  /*
   * ⚠ SI SURSA IMAGINII, nu doar paza — asta a prins-o un mutant.
   *
   * Cerand numai paza, `<img src={url}>` ramanea verde. Dar valoarea e o CHEIE
   * (`products/customizations/...`), nu o adresa: browserul o rezolva relativ la pagina de produs,
   * primeste 404 si deseneaza chiar patratul rupt pe care paza il inchidea. Octetii ii are deja
   * fila, in obiectul facut la incarcare; de acolo se ia poza.
   */
  assert.match(
    cod, /<img src=\{previzualizari\[url\]\}/,
    "miniatura se trage iar din cheie: 404 si patrat rupt in locul pozei clientului",
  );
  assert.match(
    cod, /from "@\/lib\/customization\/adresa"/,
    "vitrina si-a luat ajutoarele din alta parte",
  );
  assert.equal(
    /from "@\/lib\/customization\/comanda"/.test(cod), false,
    "vitrina importa iar poarta de server, deci `node:crypto` intra in pachetul browserului",
  );
});

/* ═══════════════════════════════════════════════════════════════════════════
   17 — NUMELE
   ═══════════════════════════════════════════════════════════════════════════ */

test("⚠ 17 numele: se tine cel ADEVARAT, si se cade cinstit cand nu-l avem", async () => {
  /*
   * ⚠ CE A COSTAT: ultima bucata a cheii e `<uuid>-<semnatura>.<ext>` — 65 de caractere de
   * hexazecimal, taiate de `truncate` pe telefon la primele cateva. Trei poze aratau IDENTIC, si
   * cine voia sa scoata poza gresita apasa X-ul altei poze.
   */
  const im = pregateste();
  try {
    const h = monteaza(() => usePersonalizare(PAGINA, BIZ));
    im.retea.raspunde({ cheie: cheia(3, "jpg") });
    await h.act(() => h.stare.incarcaFisiere(CAMP, lista("nunta-2026.jpg")));

    const url = fisiereleDin(h.stare)[0];
    assert.equal(h.stare.nume[url], "nunta-2026.jpg", "numele omului nu s-a pastrat");
    assert.equal(numeleFisierului(url, 0, h.stare.nume[url]), "nunta-2026.jpg");

    /* Perechea: dupa reincarcarea paginii harta e goala, si atunci se spune ce se poate sti. */
    assert.equal(numeleFisierului(url, 0, undefined), "Fisierul 1.jpg");
    assert.equal(numeleFisierului(url, 2, ""), "Fisierul 3.jpg");
    /* Si nu se intoarce niciodata hexazecimalul. */
    assert.equal(numeleFisierului(url, 0).includes("0123456789abcdef"), false);

    h.demonteaza();
  } finally {
    im.restaureaza();
  }
});

test("⚠ 17 + 16/24 un LOT de trei: fiecare rand isi capata numele LUI si miniatura LUI", async () => {
  /*
   * ⚠ CE A COSTAT, SI DE CE N-AR FI PRINS NICIUNA DIN PROBELE DE MAI SUS.
   *
   * Cine alege trei poze deodata primeste trei randuri. Daca numele si obiectul se iau de la
   * PRIMUL fisier al lotului in loc de cel din mana, toate trei randurile arata identic — adica
   * exact paguba de la care a plecat totul, cine vrea sa scoata poza gresita apasa X-ul altei
   * poze, doar ca acum cu un nume frumos in loc de hexazecimal.
   *
   * Nicio proba de pana acum nu urca mai mult de un fisier cu chei DISTINCTE: falsa retea intorcea
   * o singura cheie fixa, deci in orice lot randurile cadeau oricum pe aceeasi cheie si diferenta
   * nu se putea vedea. Aici reteaua da trei chei, si fiecare rand se cere pe numele lui.
   */
  const im = pregateste();
  try {
    const h = monteaza(() => usePersonalizare(PAGINA, BIZ));
    im.retea.raspundePeNume({
      "a.jpg": { cheie: cheia(1, "jpg") },
      "b.jpg": { cheie: cheia(2, "jpg") },
      "c.jpg": { cheie: cheia(3, "jpg") },
    });
    await h.act(() => h.stare.incarcaFisiere(CAMP, lista("a.jpg", "b.jpg", "c.jpg")));

    const chei = fisiereleDin(h.stare);
    assert.deepEqual(
      chei, [cheia(1, "jpg"), cheia(2, "jpg"), cheia(3, "jpg")],
      "cele trei chei ale serverului n-au ajuns intregi in valoarea campului",
    );

    const asteptate = ["a.jpg", "b.jpg", "c.jpg"];
    assert.deepEqual(
      chei.map((k) => h.stare.nume[k]), asteptate,
      "un rand poarta numele altui fisier: trei randuri scriu la fel",
    );
    /* Si miniatura: obiectul fiecarui rand vine din fisierul randului. Vezi `pregateste`. */
    assert.deepEqual(
      chei.map((k) => h.stare.previzualizari[k].replace(/^blob:proba\/\d+-/, "")), asteptate,
      "miniatura unui rand se face din alt fisier: trei poze arata IDENTIC",
    );
    assert.equal(im.facute.length, 3, "nu s-a facut cate un obiect pentru fiecare fisier");

    h.demonteaza();
  } finally {
    im.restaureaza();
  }
});

test("⚠ 17 randarea: vitrina cheama ajutorul comun cu numele, si n-a mai pastrat o copie", () => {
  const cod = faraComentarii(sursa(VITRINA));
  /*
   * ⚠ SE CER TOATE APELURILE, UNUL CATE UNUL, si asta au prins-o doi mutanti la rand.
   *
   * Prima forma cerea doar ca `numeleFisierului(url, i, nume[url])` sa apara UNDEVA: mutantul care
   * scotea harta din `alt`-ul miniaturii ramanea verde, fiindca celelalte apeluri o pastrau.
   * A doua forma numara „cel putin trei cu harta” si interzicea `numeleFisierului(url, i)`: al
   * doilea mutant a trecut si de ea, fiindca `numeleFisierului(url, i, "")` are al treilea argument
   * (deci nu se potriveste cu interdictia) si mai raman patru apeluri bune (deci pragul trece).
   * Omul vedea iar „Fisierul 1.jpg” in loc de „nunta-2026.jpg” pe randul chiar reparat.
   *
   * Deci se aduna TOATE apelurile din vitrina si se cere ca multimea lor sa aiba o SINGURA forma,
   * cea cu harta. Orice al treilea argument strain — lipsa, gol, altceva — sare in ochi.
   */
  const apeluri = cod.match(/numeleFisierului\([^)]*\)/g) ?? [];
  assert.ok(apeluri.length >= 5, `numele adevarat nu ajunge pe ecran (apeluri: ${apeluri.length})`);
  assert.deepEqual(
    [...new Set(apeluri)], ["numeleFisierului(url, i, nume[url])"],
    "un loc din vitrina cere numele fara harta, deci acolo se vede tot hexazecimal",
  );
  assert.equal(
    /const numeleFisierului =/.test(cod), false,
    "vitrina si-a scris iar propria copie a regulii; erau doua si se departasera deja",
  );
});

/* ═══════════════════════════════════════════════════════════════════════════
   4 + 18 — ELIBERAREA OBIECTELOR
   ═══════════════════════════════════════════════════════════════════════════ */

test("⚠ 4/18 scoaterea unui fisier ELIBEREAZA obiectul lui", async () => {
  /*
   * ⚠ CE A COSTAT: un blob tine octetii fisierului vii cat traieste documentul, iar App Router
   * pastreaza documentul peste navigarile din magazin. Cine scotea cu X o poza de 8 MB si punea
   * alta ramanea cu amandoua in memoria filei — pe telefon, dupa a treia oara, sistemul omora fila
   * CU FORMULARUL IN EA.
   */
  const im = pregateste();
  try {
    const h = monteaza(() => usePersonalizare(PAGINA, BIZ));
    im.retea.raspunde({ cheie: cheia(4, "jpg") });
    await h.act(() => h.stare.incarcaFisiere(CAMP, lista("poza.jpg")));

    const url = fisiereleDin(h.stare)[0];
    const obiect = h.stare.previzualizari[url];
    assert.equal(im.facute.length, 1);
    assert.deepEqual(im.eliberate, [], "s-a eliberat prea devreme");

    await h.act(() => h.stare.scoateFisier("f", 0, url));

    assert.deepEqual(im.eliberate, [obiect], "obiectul scos de pe ecran a ramas in memorie");
    assert.deepEqual(fisiereleDin(h.stare), [], "cheia a ramas in valoarea campului");
    assert.equal(h.stare.previzualizari[url], undefined, "intrarea a ramas in harta");
    assert.equal(h.stare.nume[url], undefined, "numele a ramas in harta");

    h.demonteaza();
    assert.deepEqual(im.eliberate, [obiect], "s-a eliberat de doua ori acelasi obiect");
  } finally {
    im.restaureaza();
  }
});

test("⚠ 4/18 demontarea elibereaza TOT ce a mai ramas", async () => {
  const im = pregateste();
  try {
    const h = monteaza(() => usePersonalizare(PAGINA, BIZ));
    im.retea.raspunde({ cheie: cheia(5, "jpg") });
    await h.act(() => h.stare.incarcaFisiere(CAMP, lista("una.jpg")));
    im.retea.raspunde({ cheie: cheia(6, "png") });
    await h.act(() => h.stare.incarcaFisiere(CAMP, lista("doua.png")));

    assert.equal(im.facute.length, 2);
    assert.deepEqual(im.eliberate, [], "nimic nu s-a scos de pe ecran, deci nimic nu se elibereaza");

    h.demonteaza();
    assert.deepEqual(
      [...im.eliberate].sort(), [...im.facute].sort(),
      "la plecarea de pe pagina octetii raman prinsi in fila",
    );
  } finally {
    im.restaureaza();
  }
});

test("⚠ 4/18 randarea: FIECARE X trece cheia carligului, altfel nu se elibereaza nimic", () => {
  /*
   * ⚠ DE CE NU AJUNGE PROBA DE PURTARE DE MAI SUS.
   *
   * Ea cheama ea insasi `scoateFisier("f", 0, url)` — adica ii da carligului chiar argumentul pe
   * care ECRANUL trebuia sa i-l dea, deci certifica carligul, nu randul. Iar `cheie` e optional in
   * semnatura: un rand intors la `scoateFisier(camp.id, i)` iese pe `if (!cheie) return;` inainte
   * de orice eliberare. Obiectul ramane prins in fila, intrarile raman in `previzualizari` si in
   * `nume`, si toata reparatia sta deconectata de la ecran fara ca nimic sa se aprinda.
   *
   * ⚠ SE CER TOATE APELURILE, nu unul. Randurile sunt doua — miniatura si numele — si fiecare are
   * X-ul lui; cerut doar „undeva”, mutantul care strica un singur rand ramane verde.
   */
  const cod = faraComentarii(sursa(VITRINA));
  const apeluri = cod.match(/scoateFisier\([^)]*\)/g) ?? [];
  assert.ok(apeluri.length >= 2, `vitrina nu mai are doua X-uri (apeluri: ${apeluri.length})`);
  assert.deepEqual(
    [...new Set(apeluri)], ["scoateFisier(camp.id, i, url)"],
    "un X cheama scoaterea fara cheie, deci acolo obiectul ramane prins in fila",
  );
});

/* ═══════════════════════════════════════════════════════════════════════════
   19 — MESAJUL ROSU
   ═══════════════════════════════════════════════════════════════════════════ */

test("⚠ 19 eroarea de la incercarea trecuta se stinge la incercarea urmatoare", async () => {
  /*
   * ⚠ CE A COSTAT: steagul si textul se puneau la esec si nu se stergeau niciodata. Cine alegea o
   * poza de 18 MB pe un camp cu plafon 10, o micsora si o incarca din nou cu SUCCES, citea in
   * continuare, cu rosu, „Fisierul depaseste limita de 10MB.” — si concluziona ca nici a doua oara
   * n-a mers.
   */
  const im = pregateste();
  try {
    const h = monteaza(() => usePersonalizare(PAGINA, BIZ));

    im.retea.raspunde({ error: "Fisierul depaseste limita de 10MB." });
    await h.act(() => h.stare.incarcaFisiere(CAMP, lista("uriasa.jpg")));
    assert.equal(h.stare.incarca["f:eroare"], true, "esecul nu se semnaleaza deloc");
    assert.equal(h.stare.motive.f, "Fisierul depaseste limita de 10MB.");

    im.retea.raspunde({ cheie: cheia(7, "jpg") });
    await h.act(() => h.stare.incarcaFisiere(CAMP, lista("micsorata.jpg")));

    assert.equal(!!h.stare.incarca["f:eroare"], false, "mesajul rosu a ramas dupa o reusita");
    assert.equal(h.stare.motive.f || "", "", "textul serverului a ramas dupa o reusita");
    assert.deepEqual(fisiereleDin(h.stare), [cheia(7, "jpg")]);

    h.demonteaza();
  } finally {
    im.restaureaza();
  }
});

test("⚠ 19 perechea: un esec NOU aprinde mesajul, cu cuvintele serverului", async () => {
  /* Fara ea, „se sterge mereu” ar trece si peste un carlig care nu mai aprinde nimic. */
  const im = pregateste();
  try {
    const h = monteaza(() => usePersonalizare(PAGINA, BIZ));
    im.retea.raspunde({ cheie: cheia(8, "jpg") });
    await h.act(() => h.stare.incarcaFisiere(CAMP, lista("buna.jpg")));
    assert.equal(!!h.stare.incarca["f:eroare"], false);

    im.retea.raspunde({ error: "Formatul nu se accepta." });
    await h.act(() => h.stare.incarcaFisiere(CAMP, lista("stricata.jpg")));
    assert.equal(h.stare.incarca["f:eroare"], true, "al doilea esec nu se mai vede");
    assert.equal(h.stare.motive.f, "Formatul nu se accepta.");

    h.demonteaza();
  } finally {
    im.restaureaza();
  }
});

/* ═══════════════════════════════════════════════════════════════════════════
   20 — DOUA INCARCARI SUPRAPUSE
   ═══════════════════════════════════════════════════════════════════════════ */

test("⚠ 20 doua incarcari suprapuse: NICIUNA nu o pierde pe cealalta", async () => {
  /*
   * ⚠ CE A COSTAT: `acum` se citea la INTRARE si se scria la IESIRE, dupa `await`-uri de retea.
   * Pe 4G, cine alegea doua poze si mai adauga una in timpul urcarii ramanea cu una singura in
   * formular. Fisierele primei serii erau deja in R2 — platite, orfane — si dispareau din valoare
   * fara niciun semn.
   *
   * ⚠ Proba tine cererile IN AER dinadins: fara suprapunerea asta, orice forma de scriere trece.
   */
  const im = pregateste();
  try {
    const h = monteaza(() => usePersonalizare(PAGINA, BIZ));

    /*
     * ⚠ RASPUNSUL SE LEAGA DE FISIER, nu de ordinea sosirii — si asta a devenit obligatoriu de cand
     * incarcarea are trei pasi. Cu un singur raspuns „urmatorul", verdictul se citea abia la pasul
     * 3, adica dupa ce amandoua incarcarile plecasera: amandoua ar fi primit ultima cheie pusa, si
     * proba ar fi masurat altceva decat spune.
     */
    im.retea.raspundePeNume({
      "prima.jpg": { cheie: cheia(1, "jpg") },
      "adoua.jpg": { cheie: cheia(2, "jpg") },
    });

    im.retea.tine();
    const prima = h.stare.incarcaFisiere(CAMP, lista("prima.jpg"));

    /* Randare intre timp: exact ce se intampla in pagina cand se aprinde „Se incarca...”. */
    await h.act(() => Promise.resolve());

    const adoua = h.stare.incarcaFisiere(CAMP, lista("adoua.jpg"));

    im.retea.dezleaga();
    await h.act(() => Promise.all([prima, adoua]));

    /*
     * ⚠ SASE, NU DOUA: trei cereri pe fisier (voie, octeti, finalizare). Ce se masoara ramane
     * acelasi lucru — ca amandoua incarcarile au plecat si s-au suprapus.
     */
    assert.equal(im.retea.cereri, 6, "n-au plecat doua incarcari, deci nu s-au suprapus");
    assert.deepEqual(
      [...fisiereleDin(h.stare)].sort(), [cheia(1, "jpg"), cheia(2, "jpg")].sort(),
      "a doua incarcare a suprascris-o pe prima: fisiere platite, orfane, si nimeni nu afla",
    );

    h.demonteaza();
  } finally {
    im.restaureaza();
  }
});

test("⚠ 20 plafonul depasit de doua rulari suprapuse SE SPUNE, nu se taie in tacere", async () => {
  /*
   * ⚠ AICI SE APARA O REGULA A PROIECTULUI, NU O COMODITATE.
   *
   * Doua rulari suprapuse cred amandoua ca lista e goala, deci taietura de la INTRARE le lasa sa
   * treaca impreuna peste plafon — trei chei intr-un camp de doua. Tentatia e sa se taie si la
   * scriere, cu un `.slice(0, maxim)`. Nu are voie: cheile taiate sunt fisiere DEJA URCATE, deci
   * ar dispare din formular fara `refuzat` si fara motiv (clientul nu afla nimic, octetii raman
   * platiti si orfani in R2, iar randul taiat n-ar mai avea niciun X care sa-i elibereze
   * obiectul), si — mai rau — valoarea n-ar mai depasi niciodata plafonul, deci constatarea din
   * `normalizeazaValorile` scrisa anume pentru asta n-ar mai putea sa se aprinda vreodata.
   *
   * `valori.ts` o spune negru pe alb: „CE E PESTE PLAFON SE SPUNE, NU SE TAIE IN TACERE” —
   * taierea tacuta e singura cale din tot sistemul prin care o comanda iese buna cu date lipsa.
   *
   * Deci se cer trei lucruri deodata: cheile RAMAN toate trei (nimic urcat nu dispare pe tacute),
   * butonul de comanda e STINS, si dupa apasare omul citeste chiar cate se pot trimite.
   */
  const im = pregateste();
  try {
    const camp: CampPersonalizare = { ...CAMP, max_files: 2 };
    const pagina = {
      customization: {
        enabled: true,
        fields: [{ id: "f", type: "image", label: "Poza ta", required: true, max_files: 2 }],
      },
    };
    const h = monteaza(() => usePersonalizare(pagina, BIZ));

    im.retea.tine();
    im.retea.raspundePeNume({
      "a.jpg": { cheie: cheia(1, "jpg") },
      "b.jpg": { cheie: cheia(2, "jpg") },
      "c.jpg": { cheie: cheia(3, "jpg") },
    });
    const a = h.stare.incarcaFisiere(camp, lista("a.jpg", "b.jpg"));
    await h.act(() => Promise.resolve());
    const b = h.stare.incarcaFisiere(camp, lista("c.jpg"));
    im.retea.dezleaga();
    await h.act(() => Promise.all([a, b]));

    assert.deepEqual(
      [...fisiereleDin(h.stare)].sort(),
      [cheia(1, "jpg"), cheia(2, "jpg"), cheia(3, "jpg")].sort(),
      "o cheie urcata a fost taiata in tacere din formular: fisier platit, orfan, si nimeni nu afla",
    );
    assert.equal(h.stare.gata, false, "se poate comanda peste plafon");

    await h.act(() => {
      assert.equal(h.stare.verifica(), false, "verificarea lasa comanda sa treaca peste plafon");
    });
    assert.match(
      h.stare.constatari.f ?? "", /cel mult 2/,
      "omul nu afla langa camp cate fisiere se pot trimite",
    );

    h.demonteaza();
  } finally {
    im.restaureaza();
  }
});

test("⚠ 20 randarea: campul se INCHIDE cat timp urca, si promite CHIAR plafonul aparat", () => {
  const cod = faraComentarii(sursa(VITRINA));
  assert.match(cod, /disabled=\{seIncarca\}/, "input-ul ramane deschis in timpul incarcarii");
  /*
   * ⚠ O SINGURA CIFRA PENTRU AMANDOUA. Vitrina isi socotea plafonul singura, `camp.max_files ?? 5`,
   * iar carligul si poarta de comanda il socotesc cu `fisiereleCampului`, adica cel mult 20. Pentru
   * un camp cu 50 scris in panou, ecranul scria „Cel mult 50 imagini” si mai invita la incarcare si
   * dupa al 20-lea: fisiere urcate si platite, pe o comanda pe care serverul o oprea oricum.
   */
  assert.match(
    cod, /const maxim = fisiereleCampului\(camp\)/,
    "vitrina isi socoteste iar propriul plafon, deci promite alta cifra decat cea aparata",
  );
});
