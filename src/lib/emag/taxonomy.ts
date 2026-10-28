/**
 * Nomenclatoarele eMAG: categorii, caracteristici, cote de TVA, timpi de pregatire.
 *
 * ═══ CE E DIFERIT FATA DE TRENDYOL ═══
 *
 * La eMAG, categoria nu e doar o eticheta: ea hotaraste CE E OBLIGATORIU pe produs.
 * `category/read` cu un id intoarce, o data cu numele, si:
 *   - `characteristics[]`, fiecare cu `is_mandatory`
 *   - `family_types[]`, fara de care variantele nu se pot grupa
 *   - `is_ean_mandatory` si `is_warranty_mandatory`
 *
 * Deci nu se poate publica nimic intr-o categorie inainte de a o citi. Iar
 * `is_allowed` spune daca vanzatorul are voie in ea — o categorie interzisa
 * primeste produsele si le respinge, ceea ce arata ca o eroare de documentatie.
 */

import { citesteCategorii, citesteTimpiPregatire, citesteTva, isEmagError, type EmagAuth } from "./client";
import type {
  EmagCaracteristicaCategorie, EmagCategorie, EmagCotaTva, EmagValoareTimpPregatire,
} from "./types";
/*
 * ⚠ SE REFOLOSESTE POTRIVITORUL LUI TRENDYOL, nu se scrie al doilea.
 *
 * `potriveste(nume, frunze)` e generic: primeste `{id, label}` si intoarce scoruri
 * cu grade de incredere. Regula lui — „mai bine nicio sugestie decat una gresita",
 * cu prag PE SCOR si prag PE AVANS fata de a doua varianta — e exact ce trebuie si
 * aici, si e deja reglata pe date reale.
 *
 * Ce e specific Trendyol in el (sinonimele de imbracaminte, penalizarea pe segment
 * femei/barbati/copii) ramane inert pentru categoriile eMAG care nu sunt de moda:
 * `segment()` intoarce `null` si nu se aplica nicio penalizare.
 *
 * Sta in dosarul lui Trendyol fiindca acolo a fost scris si acolo e probat. Daca
 * apare un al TREILEA consumator, se muta in `src/lib/marketplace/`. Cu doi, o
 * mutare ar fi insemnat sa umblu la un fisier reglat fin, fara niciun castig.
 */
import { potriveste, type PotrivireCategorie } from "@/lib/trendyol/category-match";

export type { PotrivireCategorie };

/* ═══════════════════════════════════════════════════════════════════════════
   CITIRE
   ═══════════════════════════════════════════════════════════════════════════ */

/**
 * Cate pagini de categorii se citesc cel mult.
 *
 * ⚠ 100 de randuri pe pagina (plafonul lor) si 3 cereri pe secunda cumulat pentru
 * tot ce nu e comanda. 60 de pagini inseamna 6000 de categorii si ~20 de secunde
 * numai pentru asta. Peste, s-ar manca bugetul altor treceri din aceeasi rulare.
 */
const MAX_PAGINI_CATEGORII = 60;

/**
 * Cate pagini se cer deodata.
 *
 * ⚠ Masurat in productie pe 28.10.2026, la MNY AROMA: 2.928 de categorii, adica 30 de
 * pagini, au venit una dupa alta in ~45 de secunde. Piedica nu era ritmul (la 3 pe
 * secunda, 30 de pagini incap in 10 s), ci asteptarea fiecarei pagini: ~1,5 s la ei,
 * fiindca vine cu toate caracteristicile categoriilor. Trei deodata umplu ritmul fara
 * sa-l depaseasca, iar galetile din `client.ts` tin oricum socoteala, si pe instanta,
 * si pe contul lor.
 */
const PAGINI_DEODATA = 3;

/**
 * Cate reluari primeste o pagina cazuta trecator (502, timp expirat).
 *
 * ⚠ Inainte, primul 502 oprea toata citirea. Pe 28.10.2026, doua apasari pe
 * „Sugerează” s-au intors cu „eMAG a răspuns cu 502” dupa ce citisera deja pagini
 * intregi, iar omul a luat-o de la capat de fiecare data. Un 502 la ei e o pagina,
 * nu tot raftul.
 *
 * ⚠ Numai la `trecatoare`. Un refuz (400) sau o cheie respinsa (401) dau acelasi
 * raspuns si a doua oara, iar cererile invalide se numara si ele in ritmul magazinului.
 */
const RELUARI_PAGINA = 2;

/**
 * Cat are voie sa dureze toata citirea.
 *
 * ⚠ Actiunea ruleaza sub `maxDuration = 300` al paginii eMAG. Cu reluari, o zi proasta
 * la ei ar fi putut trece de plafon, iar o functie taiata nu-i spune nimic omului.
 * Peste termen nu se mai reia nimic si se spune ca lista n-a venit intreaga.
 */
const TERMEN_CITIRE_MS = 150_000;

export interface CategoriiAduse {
  categorii: EmagCategorie[];
  /** ⚠ `true` cand s-a atins plafonul: lista NU e completa. */
  trunchiat: boolean;
  error: string | null;
}

/** Ce se poate inlocui in probe: citirea de la eMAG, ceasul si pauza dintre reluari. */
export interface UnelteCategorii {
  citeste?: typeof citesteCategorii;
  acum?: () => number;
  asteapta?: (ms: number) => Promise<void>;
}

async function aduPagina(
  auth: EmagAuth,
  pagina: number,
  termen: number,
  u: Required<UnelteCategorii>,
): Promise<{ lot: EmagCategorie[] } | { error: string }> {
  for (let reluare = 0; ; reluare++) {
    const r = await u.citeste(auth, { currentPage: pagina, itemsPerPage: 100 });
    if (!isEmagError(r)) return { lot: Array.isArray(r.data) ? r.data : [] };
    const maiIncerc = r.verdict === "trecatoare" && reluare < RELUARI_PAGINA && u.acum() < termen;
    if (!maiIncerc) return { error: r.error };
    await u.asteapta(1000 * (reluare + 1));
  }
}

/**
 * Toate categoriile, paginat.
 *
 * ⚠ `trunchiat` nu e decorativ. O lista taiata tacut ar fi insemnat ca potrivirea
 * automata nu vede jumatate din raft si sugereaza categoria gresita cu incredere
 * mare, adica exact greseala pe care potrivitorul e construit s-o evite.
 *
 * ⚠ Paginile vin cate `PAGINI_DEODATA`, dar se asaza IN ORDINEA LOR, iar sfarsitul se
 * afla tot din prima pagina mai scurta de 100. Paginile cerute dupa ea in acelasi val
 * vin goale si nu se pun nicaieri: costul e cel mult doua cereri, o data.
 */
export async function aduCategorii(auth: EmagAuth, unelte: UnelteCategorii = {}): Promise<CategoriiAduse> {
  const u: Required<UnelteCategorii> = {
    citeste: unelte.citeste ?? citesteCategorii,
    acum: unelte.acum ?? Date.now,
    asteapta: unelte.asteapta ?? ((ms) => new Promise((gata) => setTimeout(gata, ms))),
  };
  const termen = u.acum() + TERMEN_CITIRE_MS;
  const categorii: EmagCategorie[] = [];

  for (let prima = 1; prima <= MAX_PAGINI_CATEGORII; prima += PAGINI_DEODATA) {
    if (u.acum() >= termen) {
      return {
        categorii,
        trunchiat: true,
        error: "eMAG răspunde foarte încet acum. Încearcă din nou peste câteva minute.",
      };
    }

    const pagini: number[] = [];
    for (let p = prima; p < prima + PAGINI_DEODATA && p <= MAX_PAGINI_CATEGORII; p++) pagini.push(p);

    const loturi = await Promise.all(pagini.map((p) => aduPagina(auth, p, termen, u)));
    for (const l of loturi) {
      if ("error" in l) return { categorii, trunchiat: true, error: l.error };
      categorii.push(...l.lot);
      if (l.lot.length < 100) return { categorii, trunchiat: false, error: null };
    }
  }

  return { categorii, trunchiat: true, error: null };
}

/**
 * Raftul, in forma in care se tine minte: numai ce trebuie ca sa CAUTI in el.
 *
 * ⚠ Masurat pe 28.10.2026: lista de la eMAG vine cu caracteristicile si tipurile de
 * familie ale fiecarei categorii, ~2,3 KB pe categorie, adica 6,7 MB pentru 2.928 de
 * categorii. Tot blocul se scria in baza si se citea inapoi la FIECARE tasta din
 * cautare, desi cautarea si sugestiile se uita doar la id, nume si `is_allowed`.
 *
 * Caracteristicile nu se pierd: cand omul alege o categorie, `aduCategorie(id)` le
 * cere proaspete, cu tot cu valorile lor, pe care lista oricum nu le are.
 */
export function categoriiPentruRaft(categorii: EmagCategorie[]): EmagCategorie[] {
  return categorii.map((c) => ({
    id: c.id,
    name: c.name,
    parent_id: c.parent_id,
    is_allowed: c.is_allowed,
  }));
}

/**
 * O categorie, cu tot ce cere ea.
 *
 * ⚠ Fara apelul asta nu se poate construi nicio incarcatura de publicare: numai
 * aici afli `characteristics[]` cu `is_mandatory`, `family_types[]` si daca EAN-ul
 * si garantia sunt obligatorii.
 */
export async function aduCategorie(auth: EmagAuth, id: number): Promise<EmagCategorie | { error: string }> {
  const r = await citesteCategorii(auth, { id });
  if (isEmagError(r)) return { error: r.error };
  const prima = Array.isArray(r.data) ? r.data[0] : undefined;
  if (!prima) return { error: "eMAG nu a întors nicio categorie pentru id-ul cerut." };
  return prima;
}

/* ═══════════════════════════════════════════════════════════════════════════
   POTRIVIREA CATEGORIILOR
   ═══════════════════════════════════════════════════════════════════════════ */

/**
 * Categoriile in care vanzatorul CHIAR are voie sa vanda.
 *
 * ⚠ `is_allowed !== 1` nu inseamna „ascunde din lista", inseamna „produsele trimise
 * acolo se resping". Iar respingerea vine ca eroare de documentatie, deci arata
 * exact ca o caracteristica lipsa — comerciantul ar fi cautat zile intregi in
 * datele produsului o problema care era de acces.
 */
export function categoriiIngaduite(categorii: EmagCategorie[]): { id: number; label: string }[] {
  return categorii
    .filter((c) => c.is_allowed === 1 && typeof c.id === "number" && (c.name ?? "").trim().length > 0)
    .map((c) => ({ id: c.id, label: (c.name ?? "").trim() }));
}

/** Sugestii pentru o categorie a magazinului. Nimic nu se aplica singur. */
export function sugereazaCategorie(
  numeCategorieEdinio: string,
  categorii: EmagCategorie[],
  limita = 3,
): PotrivireCategorie[] {
  return potriveste(numeCategorieEdinio, categoriiIngaduite(categorii), limita);
}

/* ═══════════════════════════════════════════════════════════════════════════
   CARACTERISTICI
   ═══════════════════════════════════════════════════════════════════════════ */

/**
 * Ce trebuie neaparat completat ca sa fie primita o oferta in categoria asta.
 *
 * Sta separat, ca functie pura, ca sa poata fi probata fara retea — aceeasi
 * alegere ca la `atribute-obligatorii.ts` de la Trendyol.
 */
export function caracteristiciObligatorii(cat: EmagCategorie): EmagCaracteristicaCategorie[] {
  return (cat.characteristics ?? []).filter((c) => c.is_mandatory === 1);
}

/**
 * Ce lipseste dintr-o incarcatura fata de ce cere categoria.
 *
 * ⚠ Se verifica INAINTE de trimitere. Fara asta, fiecare produs incomplet ar fi
 * plecat, ar fi consumat din cele 3 cereri pe secunda si s-ar fi intors cu
 * `isError: true` — adica exact costul pe care verificarea locala il scuteste.
 */
export function caracteristiciLipsa(
  cat: EmagCategorie,
  trimise: { id: number; value: string }[],
): EmagCaracteristicaCategorie[] {
  const completate = new Set(
    trimise.filter((c) => (c.value ?? "").toString().trim().length > 0).map((c) => c.id),
  );
  return caracteristiciObligatorii(cat).filter((c) => !completate.has(c.id));
}

/* ═══════════════════════════════════════════════════════════════════════════
   TVA
   ═══════════════════════════════════════════════════════════════════════════ */

export async function aduCoteTva(auth: EmagAuth): Promise<EmagCotaTva[] | { error: string }> {
  const r = await citesteTva(auth);
  if (isEmagError(r)) return { error: r.error };
  return Array.isArray(r.data) ? r.data : [];
}

/**
 * Cota de TVA a magazinului, tradusa in `vat_id`-ul lor.
 *
 * ═══ ⚠ CELE DOUA FELURI DE A SCRIE O COTA ═══
 *
 * `store_settings.vat_rate` e in PROCENTE (21 pentru 21%). eMAG intoarce `vat_rate`
 * fara sa spuna in ce unitate, si in practica se vede si `21`, si `0.21`.
 *
 * Citit gresit, 21 s-ar potrivi cu 0.21 doar din intamplare — sau, mai rau, nu s-ar
 * potrivi nimic si s-ar alege cota IMPLICITA a contului, care poate fi alta. Iar un
 * `vat_id` gresit nu da eroare: oferta se publica si se vinde, cu TVA-ul altcuiva,
 * si se afla la contabilitate.
 *
 * De aceea amandoua formele se aduc la procente inainte de comparat, iar cand nu se
 * potriveste nimic se intoarce `null` — NU cota implicita. Mai bine o intrebare
 * pusa comerciantului decat un numar ales de noi.
 */
export function alegeCotaTva(cote: EmagCotaTva[], rataMagazin: number): EmagCotaTva | null {
  if (!Number.isFinite(rataMagazin)) return null;

  const inProcente = (v: number | undefined): number | null => {
    if (typeof v !== "number" || !Number.isFinite(v)) return null;
    /* Sub 1 inseamna fractie (0.21), altfel sunt deja procente (21). ⚠ Zero e o
       cota adevarata — magazinele neplatitoare de TVA o folosesc — deci se trece
       explicit, nu prin `v < 1`. */
    if (v === 0) return 0;
    return v < 1 ? v * 100 : v;
  };

  const tinta = Math.round(rataMagazin * 100) / 100;

  for (const c of cote) {
    const r = inProcente(c.vat_rate);
    if (r === null) continue;
    if (Math.abs(r - tinta) < 0.01) return c;
  }

  return null;
}

/* ═══════════════════════════════════════════════════════════════════════════
   TIMPUL DE PREGATIRE
   ═══════════════════════════════════════════════════════════════════════════ */

/**
 * Numarul de zile dintr-un element de raspuns, oricum l-ar numi ei.
 *
 * ═══ ⚠ FORMA NU E IN SCHEMA LOR ═══
 *
 * `/handling_time/read` are in OpenAPI doar `ApiResponse` — un obiect fara camp
 * descris. Deci `{ value }` era o PRESUPUNERE de-a noastra.
 *
 * Masurat in productie, 24.08.2026: ecranul arata o lista lunga de „undefined zile",
 * fiindca elementele n-au `value`. Presupunerea era gresita, si nimic n-o verifica.
 *
 * Se citeste din formele plauzibile, si se intoarce `null` cand nu se recunoaste
 * niciuna — NU zero. Un zero inventat ar fi insemnat „expediez in aceeasi zi", adica
 * o promisiune pe care comerciantul n-a facut-o si pe care eMAG o numara.
 */
export function zileleDinTimp(brut: unknown): number | null {
  if (typeof brut === "number") return Number.isFinite(brut) ? brut : null;
  if (typeof brut === "string" && /^\d+$/.test(brut.trim())) return Number(brut.trim());
  if (!brut || typeof brut !== "object") return null;

  const o = brut as Record<string, unknown>;
  for (const cheie of ["value", "handling_time", "days", "zile", "id", "name"]) {
    const v = o[cheie];
    if (typeof v === "number" && Number.isFinite(v)) return v;
    if (typeof v === "string" && /^\d+$/.test(v.trim())) return Number(v.trim());
  }
  return null;
}

export async function aduTimpiPregatire(
  auth: EmagAuth,
): Promise<EmagValoareTimpPregatire[] | { error: string }> {
  const r = await citesteTimpiPregatire(auth);
  if (isEmagError(r)) return { error: r.error };
  if (!Array.isArray(r.data)) return [];

  /*
   * ⚠ SE NORMALIZEAZA AICI, nu la fiecare consumator. `alegeTimpPregatire` si ecranul
   * de setari citeau amandoua `.value`; lasata nenormalizata, forma lor ar fi trebuit
   * ghicita in doua locuri, iar al doilea s-ar fi despartit de primul.
   *
   * ⚠ Se arunca ce nu se recunoaste, si se dedubleaza: „3 zile" de doua ori intr-un
   * meniu arata a defect.
   */
  const vazute = new Set<number>();
  const curate: EmagValoareTimpPregatire[] = [];
  for (const x of r.data as unknown[]) {
    const zile = zileleDinTimp(x);
    if (zile == null || zile < 0 || vazute.has(zile)) continue;
    vazute.add(zile);
    curate.push({ ...(x && typeof x === "object" ? x : {}), value: zile });
  }
  return curate.sort((a, b) => a.value - b.value);
}

/**
 * Cea mai apropiata valoare INGADUITA, la sau peste cea dorita.
 *
 * ⚠ Se rotunjeste IN SUS, nu la cea mai apropiata. Un magazin care expediaza in
 * trei zile si trimite „2" fiindca 2 e mai aproape decat 5 promite clientului mai
 * repede decat poate — iar la eMAG intarzierea se numara si scade nota
 * vanzatorului. Rotunjirea in sus e conservatoare in singurul sens care conteaza.
 */
export function alegeTimpPregatire(valori: EmagValoareTimpPregatire[], dorit: number): number | null {
  const numere = valori
    .map((v) => v.value)
    .filter((v): v is number => typeof v === "number" && Number.isFinite(v))
    .sort((a, b) => a - b);

  if (numere.length === 0) return null;

  const potrivit = numere.find((v) => v >= dorit);
  /* Peste cea mai mare valoare ingaduita: se ia cea mai mare. Nu se inventeaza una. */
  return potrivit ?? numere[numere.length - 1];
}
