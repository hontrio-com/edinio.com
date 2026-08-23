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

export interface CategoriiAduse {
  categorii: EmagCategorie[];
  /** ⚠ `true` cand s-a atins plafonul: lista NU e completa. */
  trunchiat: boolean;
  error: string | null;
}

/**
 * Toate categoriile, paginat.
 *
 * ⚠ `trunchiat` nu e decorativ. O lista taiata tacut ar fi insemnat ca potrivirea
 * automata nu vede jumatate din raft si sugereaza categoria gresita cu incredere
 * mare — adica exact greseala pe care potrivitorul e construit s-o evite.
 */
export async function aduCategorii(auth: EmagAuth): Promise<CategoriiAduse> {
  const categorii: EmagCategorie[] = [];

  for (let pagina = 1; pagina <= MAX_PAGINI_CATEGORII; pagina++) {
    const r = await citesteCategorii(auth, { currentPage: pagina, itemsPerPage: 100 });
    if (isEmagError(r)) {
      return { categorii, trunchiat: true, error: r.error };
    }
    const lot = Array.isArray(r.data) ? r.data : [];
    categorii.push(...lot);
    if (lot.length < 100) return { categorii, trunchiat: false, error: null };
  }

  return { categorii, trunchiat: true, error: null };
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

export async function aduTimpiPregatire(
  auth: EmagAuth,
): Promise<EmagValoareTimpPregatire[] | { error: string }> {
  const r = await citesteTimpiPregatire(auth);
  if (isEmagError(r)) return { error: r.error };
  return Array.isArray(r.data) ? r.data : [];
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
