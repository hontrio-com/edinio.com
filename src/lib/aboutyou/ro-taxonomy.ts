/*
 * Potrivirea categoriilor romanesti cu taxonomia About You.
 *
 * PROBLEMA, pe scurt: arborele About You e in ENGLEZA (851 de frunze, cai de
 * forma `Fashion|Women|Accessories|Bags & suitcases|Handbag`), iar categoriile
 * din magazinele noastre sunt in romana („Genti", „Rochii de seara"). Cautarea
 * de pe serverul About You (`?query=`) compara sirul brut cu numele caii, deci
 * un comerciant care scrie „rochii" primeste zero rezultate si nu are de unde
 * sa stie ca trebuia sa scrie „dress". Nu e o problema de cautare, e de limba.
 *
 * De aceea aici traducem intai si abia apoi potrivim. Fisierul are trei parti:
 *   1. normalizarea textului (diacritice, semne, cuvinte de legatura),
 *   2. un dictionar roman -> englez de termeni de imbracaminte,
 *   3. un scor de potrivire explicabil, care intoarce si motivul alegerii.
 *
 * DE CE UN DICTIONAR SI NU UN MODEL: potrivirea trebuie sa fie deterministica
 * si verificabila. Cine apasa „potriveste automat" trebuie sa primeasca acelasi
 * rezultat maine si sa poata vedea pe ce s-a bazat alegerea.
 */

import type { AboutYouCategory } from "./types";

export type PublicTinta = "women" | "men" | "girls" | "boys";

// Diacriticele se scot descompunand in NFD si stergand DOAR semnele combinate.
// Orice alta clasa de caractere ar manca si litere.
export function faraDiacritice(text: string): string {
  return text.normalize("NFD").replace(/\p{M}+/gu, "");
}

export function normalizeaza(text: string): string {
  return faraDiacritice(text)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

// Cuvinte care nu poarta inteles de categorie. „Genti de dama" si „Genti dama"
// trebuie sa dea acelasi lucru.
const LEGATURI = new Set([
  "de", "din", "pentru", "cu", "la", "si", "sau", "a", "al", "ale", "ai",
  "o", "un", "pe", "in", "the", "of", "for", "and", "with",
]);

export function tokenizeaza(text: string): string[] {
  return normalizeaza(text).split(" ").filter((t) => t.length > 0 && !LEGATURI.has(t));
}

// ── Publicul tinta ────────────────────────────────────────────────────────────
const PUBLIC: Record<string, PublicTinta> = {
  femei: "women", femeie: "women", dama: "women", dame: "women", damesc: "women",
  feminin: "women", feminine: "women", women: "women", woman: "women", ladies: "women", lady: "women",
  barbati: "men", barbat: "men", barbatesc: "men", barbatesti: "men", barbateasca: "men",
  masculin: "men", masculine: "men", men: "men", man: "men", mens: "men",
  fete: "girls", fetite: "girls", fetita: "girls", girls: "girls", girl: "girls",
  baieti: "boys", baiat: "boys", baietei: "boys", boys: "boys", boy: "boys",
};

// Cuvinte care spun „copii" fara sa spuna si sexul. Fara sex explicit nu putem
// alege intre ramura Girls si ramura Boys, deci le tinem separat.
const COPII = new Set([
  "copii", "copil", "kids", "kid", "junior", "juniori",
  "bebe", "bebelusi", "bebelus", "baby", "newborn",
]);

const SPORTIVE = new Set(["sport", "sportiv", "sportive", "sportivi", "sports", "fitness", "antrenament"]);
const TRADITIONALE = new Set(["traditional", "traditionala", "traditionale", "popular", "populara", "populare", "ie"]);

/*
 * Dictionar roman -> englez, in notatie compacta:
 *   `|` desparte SINONIME (oricare se potriveste)
 *   `+` desparte cuvinte care trebuie sa apara TOATE
 *
 * Distinctia conteaza. „genti" -> `bag|handbag` inseamna „Bag SAU Handbag", deci
 * frunza `Handbag` se potriveste complet. Daca ar fi fost „bag" simplu, singurele
 * frunze cu tokenul `bag` ar fi fost `Belt bag`, `Laundry bag`, `Beach bag` —
 * adica exact categoriile gresite, pentru ca `Handbag` e un singur cuvant.
 *
 * Formele de plural sunt scrise explicit: taierea algoritmica de sufixe romanesti
 * greseste des („cizme" -> „cizm") si nu castiga nimic la cateva sute de intrari.
 */
const DICTIONAR: Record<string, string> = {
  // Genti si bagaje
  geanta: "bag|handbag", genti: "bag|handbag", gentuta: "bag|handbag", gentute: "bag|handbag",
  poseta: "handbag|bag", posete: "handbag|bag",
  rucsac: "backpack", rucsacuri: "backpack", ghiozdan: "backpack", ghiozdane: "backpack",
  portofel: "wallet", portofele: "wallet",
  valiza: "suitcase", valize: "suitcase", troler: "trolley", trolere: "trolley",
  borseta: "belt + bag", borsete: "belt + bag",
  plic: "clutch", plicuri: "clutch",
  sacosa: "shopper", sacose: "shopper", shopper: "shopper",
  bagaj: "suitcase", bagaje: "suitcase",
  breloc: "key + ring", brelocuri: "key + ring", portchei: "key + ring",
  husa: "case", huse: "case",

  // Piese de imbracaminte
  rochie: "dress", rochii: "dress",
  fusta: "skirt", fuste: "skirt",
  bluza: "blouse", bluze: "blouse",
  /*
   * ⚠ „Cămașă" NU e `shirt`, oricat de mult ar parea.
   *
   * In taxonomia lor, `shirt` singur prinde intai frunzele de TRICOURI
   * („T-shirt"), deci „Cămăși" se auto-aplica pe categoria de tricouri — iar
   * categoria nu se mai poate schimba dupa aprobare. Frunzele corecte sunt
   * `Blouse` la femei si `Button-up shirt` la barbati; dictionarul nu vede
   * publicul, deci le dam pe amandoua ca sinonime si lasam scorul sa aleaga.
   */
  camasa: "blouse|button", camasi: "blouse|button",
  tricou: "t + shirt|tshirt", tricouri: "t + shirt|tshirt",
  maieu: "top", maieuri: "top", maiou: "top", maiouri: "top",
  top: "top", topuri: "top",
  tunica: "tunic", tunici: "tunic",
  pulover: "sweater", pulovere: "sweater", pulovar: "sweater",
  hanorac: "sweatshirt", hanorace: "sweatshirt",
  cardigan: "cardigan", cardigane: "cardigan",
  vesta: "vest", veste: "vest",
  sacou: "blazer", sacouri: "blazer",
  costum: "suit", costume: "suit",
  palton: "coat", paltoane: "coat", pardesiu: "coat", trenci: "coat",
  geaca: "jacket", geci: "jacket", jacheta: "jacket", jachete: "jacket",
  parka: "parka",
  pantaloni: "trousers", pantalon: "trousers",
  blugi: "jeans", jeans: "jeans", jeansi: "jeans", denim: "jeans",
  colanti: "leggings", colant: "leggings", leggings: "leggings",
  /*
   * ⚠ „Șort" dus la `shorts` propunea COSTUME DE BAIE: in cele 851 de frunze,
   * `shorts` apare mai ales in `Swim shorts`, iar sorturile de strada n-au frunza
   * proprie. Cea mai apropiata familie corecta e `Bottoms|Trousers`.
   */
  sort: "trousers", sorturi: "trousers", shorts: "trousers", pantalonasi: "trousers",
  salopeta: "dungarees|overall", salopete: "dungarees|overall",
  combinezon: "jumpsuit", combinezoane: "jumpsuit", jumpsuit: "jumpsuit",
  trening: "tracksuit", treninguri: "tracksuit",
  bolero: "bolero", poncho: "cape", capa: "cape", pelerina: "cape",
  kimono: "kimono",

  // Lenjerie, plaja, noapte
  // „Lenjerie" singur inseamna lenjerie de corp, nu lingerie fina: sinonimul
  // `lingerie` ar impinge in fata frunze de nisa („Crotchless lingerie").
  lenjerie: "underwear",
  chiloti: "panty|underpants", chilot: "panty|underpants",
  boxeri: "boxer + shorts", boxer: "boxer + shorts",
  sutien: "bra", sutiene: "bra",
  body: "bodysuit", bodyuri: "bodysuit",
  pijama: "pajama|pajamas", pijamale: "pajama|pajamas",
  neglijeu: "negligee",
  halat: "bathrobe|dressing", halate: "bathrobe|dressing",
  sosete: "socks", soseta: "socks", ciorapi: "socks|stockings", ciorap: "socks|stockings",
  dres: "tights", dresuri: "tights",
  bikini: "bikini", slip: "slip", tankini: "tankini",
  slapi: "slipper", slap: "slipper",

  // Incaltaminte
  /*
   * ⚠ `shoe` singur prinde intai ACCESORIILE pentru pantofi („Shoe care",
   * „Shoe accessories"). Frunzele reale de pantofi sunt `Low shoe|Lace-up shoe`,
   * `Low shoe|Slip-ons` si `Pumps|Pumps`. „Încălțăminte" e termen-umbrela si nu
   * are frunza: il lasam sa dea propuneri slabe, nu o potrivire care se aplica
   * singura pe o categorie greșita si ireversibila.
   */
  incaltaminte: "lace + up + shoe", incaltari: "lace + up + shoe",
  pantofi: "lace + up + shoe", pantof: "lace + up + shoe",
  adidasi: "trainers|sneakers", adidas: "trainers|sneakers", sneakers: "trainers|sneakers", tenisi: "trainers|sneakers",
  ghete: "bootie|booties", gheata: "bootie", botine: "bootie", botina: "bootie",
  cizme: "boots|boot", cizma: "boot|boots",
  sandale: "sandal", sandala: "sandal",
  papuci: "slipper", papuc: "slipper", saboti: "clogs",
  balerini: "ballerina", balerin: "ballerina",
  espadrile: "espadrilles", mocasini: "moccasin", mocasin: "moccasin",
  galosi: "rubber + boot",

  // Accesorii
  accesorii: "accessories|accessory", accesoriu: "accessory|accessories",
  curea: "belt", curele: "belt", centura: "belt", centuri: "belt",
  caciula: "beanie", caciuli: "beanie", fes: "beanie",
  sapca: "cap", sepci: "cap",
  palarie: "hat", palarii: "hat",
  esarfa: "scarf", esarfe: "scarf", fular: "scarf", fulare: "scarf", sal: "shawl", saluri: "shawl",
  manusi: "gloves", manusa: "gloves",
  bijuterii: "jewelry", bijuterie: "jewelry",
  inel: "ring", inele: "ring",
  cercei: "earrings|earring", cercel: "earring|earrings",
  colier: "necklace", coliere: "necklace", lantisor: "necklace", lantisoare: "necklace",
  bratara: "bracelet", bratari: "bracelet",
  pandantiv: "pendant", pandantive: "pendant",
  brosa: "brooch", brose: "brooch",
  ceas: "watch", ceasuri: "watch",
  ochelari: "glasses", umbrela: "umbrella", umbrele: "umbrella",
  casti: "headphones", bentita: "headband", bentite: "headband",
  bretele: "suspenders", cravata: "tie", cravate: "tie", papion: "bow + tie",
  butoni: "cufflinks",

  // Calificative si contexte
  plaja: "beach", iarna: "winter", vara: "summer", ploaie: "rain",
  seara: "evening", ocazie: "cocktail|evening", mireasa: "evening", nunta: "evening",
  birou: "business", office: "business",
  schi: "ski", snowboard: "snowboard", inot: "swimming", alergare: "running",
  fotbal: "soccer", yoga: "yoga", drumetie: "outdoor", munte: "outdoor",
  gravide: "nursing", maternitate: "nursing", alaptare: "nursing",
  tricotat: "knit|knitted", tricotate: "knit|knitted",
  lung: "long", lunga: "long", scurt: "short", scurta: "short",
  oversize: "oversized", supradimensionat: "oversized",
};

// Expresii de doua-trei cuvinte care nu se traduc pe bucati:
// „costum de baie" nu e „suit" plus „bath".
const EXPRESII: { ro: string[]; en: string }[] = [
  { ro: ["costum", "baie"], en: "swimsuit" },
  { ro: ["costume", "baie"], en: "swimsuit" },
  { ro: ["camasa", "noapte"], en: "nightgown" },
  { ro: ["camasi", "noapte"], en: "nightgown" },
  { ro: ["pantaloni", "scurti"], en: "shorts" },
  { ro: ["ochelari", "soare"], en: "sunglasses" },
  { ro: ["cizme", "cauciuc"], en: "rubber + boot" },
  { ro: ["geanta", "voiaj"], en: "travel + bag|handbag" },
  { ro: ["genti", "voiaj"], en: "travel + bag|handbag" },
  { ro: ["geanta", "laptop"], en: "laptop + bag|handbag" },
  { ro: ["genti", "laptop"], en: "laptop + bag|handbag" },
  { ro: ["geanta", "umar"], en: "shoulder + bag|handbag" },
  { ro: ["genti", "umar"], en: "shoulder + bag|handbag" },
  { ro: ["geanta", "plaja"], en: "beach + bag|handbag" },
  { ro: ["genti", "plaja"], en: "beach + bag|handbag" },
  { ro: ["rochie", "seara"], en: "evening + dress" },
  { ro: ["rochii", "seara"], en: "evening + dress" },
  { ro: ["rochie", "vara"], en: "summer + dress" },
  { ro: ["rochii", "vara"], en: "summer + dress" },
  { ro: ["papuci", "casa"], en: "slipper" },
];

// „bag|handbag + travel" -> [["bag","handbag"],["travel"]]
function desfa(spec: string): string[][] {
  return spec
    .split("+")
    .map((parte) => parte.split("|").map((t) => t.trim()).filter(Boolean))
    .filter((g) => g.length > 0);
}

// Pluralele englezesti nu merita un dictionar: „handbags" trebuie sa gaseasca
// „Handbag", iar forma de singular e doar inca un sinonim in acelasi grup.
function cuSingularEnglez(token: string): string[] {
  const forme = [token];
  if (token.length > 4 && token.endsWith("es")) forme.push(token.slice(0, -2));
  if (token.length > 3 && token.endsWith("s")) forme.push(token.slice(0, -1));
  return [...new Set(forme)];
}

export interface InterogareTradusa {
  /** Fiecare grup e un set de sinonime: potrivit daca oricare token din el apare. */
  grupuri: string[][];
  public: PublicTinta | null;
  copii: boolean;
  sport: boolean;
  traditional: boolean;
}

/** Traduce un nume de categorie din magazin in tokenuri englezesti. */
export function traduCategorie(nume: string): InterogareTradusa {
  const tokenuri = tokenizeaza(nume);

  let publicTinta: PublicTinta | null = null;
  let copii = false;
  let sport = false;
  let traditional = false;

  // Expresiile se consuma primele, ca partile lor sa nu mai fie traduse separat.
  const ramase = [...tokenuri];
  const grupuri: string[][] = [];
  for (const expr of EXPRESII) {
    if (!expr.ro.every((w) => ramase.includes(w))) continue;
    grupuri.push(...desfa(expr.en));
    for (const w of expr.ro) {
      const i = ramase.indexOf(w);
      if (i >= 0) ramase.splice(i, 1);
    }
  }

  for (const t of ramase) {
    if (PUBLIC[t]) { publicTinta = publicTinta ?? PUBLIC[t]; continue; }
    if (COPII.has(t)) { copii = true; continue; }
    if (SPORTIVE.has(t)) { sport = true; continue; }
    if (TRADITIONALE.has(t)) { traditional = true; continue; }

    const spec = DICTIONAR[t];
    if (spec) { grupuri.push(...desfa(spec)); continue; }

    // Netradus: il pastram ca atare. Multi comercianti isi scriu categoriile
    // direct in engleza, iar „backpack" trebuie sa mearga fara dictionar.
    grupuri.push(cuSingularEnglez(t));
  }

  /*
   * „Sport" si „traditional" nu sunt doar semnale, sunt si cuvinte din numele
   * frunzei: `Sports backpack`, `Traditional bag`. Fara sa le punem in cerere,
   * `Backpack` simplu ar castiga oricum, pentru ca acopera integral frunza, iar
   * o penalizare oricat de mare pe cealalta parte ar strica scorurile normale.
   */
  if (sport) grupuri.push(["sports", "sport", "athletic"]);
  if (traditional) grupuri.push(["traditional"]);

  return { grupuri, public: publicTinta, copii, sport, traditional };
}

// ── Potrivirea ────────────────────────────────────────────────────────────────

// Segmente de cale care ingusteaza categoria. Cine nu le-a cerut, nu le vrea:
// „cizme" nu inseamna `Outdoor shoe|Boots`.
const CALIFICATIVE = new Set(["outdoor", "weatherproof", "traditional", "sports", "sport", "athletic"]);

interface CategoriePregatita {
  cat: AboutYouCategory;
  frunza: string[];
  cale: string[];
  publicTinta: PublicTinta | null;
  copii: boolean;
  sport: boolean;
  traditional: boolean;
  hardware: boolean;
  calificativeNecerute: number;
  adancime: number;
}

function publicDinCale(bucati: string[]): { publicTinta: PublicTinta | null; copii: boolean } {
  const j = bucati.map((b) => b.toLowerCase());
  const copii = j.includes("kids");
  if (j.includes("women")) return { publicTinta: "women", copii };
  if (j.includes("men")) return { publicTinta: "men", copii };
  if (j.includes("girls")) return { publicTinta: "girls", copii };
  if (j.includes("boys")) return { publicTinta: "boys", copii };
  return { publicTinta: null, copii };
}

function pregateste(cat: AboutYouCategory): CategoriePregatita {
  const bucati = (cat.path ?? cat.name ?? "").split("|").map((b) => b.trim()).filter(Boolean);
  const frunzaText = cat.name || bucati[bucati.length - 1] || "";
  const { publicTinta, copii } = publicDinCale(bucati);
  // Primele trei segmente sunt Root|Gen|Grup — nu descriu produsul.
  const segmenteInterioare = bucati.slice(3, Math.max(3, bucati.length - 1));
  return {
    cat,
    frunza: tokenizeaza(frunzaText),
    cale: tokenizeaza(bucati.slice(0, Math.max(0, bucati.length - 1)).join(" ")),
    publicTinta,
    copii,
    sport: /^sports?\b|^athletic\b/i.test(frunzaText.trim()),
    traditional: /^traditional\b/i.test(frunzaText.trim()),
    hardware: bucati[0]?.toLowerCase() === "hardware",
    calificativeNecerute: segmenteInterioare
      .flatMap((s) => tokenizeaza(s))
      .filter((t) => CALIFICATIVE.has(t)).length,
    adancime: bucati.length,
  };
}

/*
 * Cat de bine se suprapun grupurile cerute peste o lista de tokenuri.
 *
 * Se masoara in ambele sensuri, iar media armonica le imbina: „cate din ce am
 * cerut se regaseste" singur ar da 1 si pentru `Sports gym bag` cand ai cerut
 * doar „bag"; „cat din frunza e acoperit" singur ar favoriza frunzele scurte
 * indiferent de cerere.
 */
function scorLista(grupuri: string[][], lista: string[]): number {
  if (grupuri.length === 0 || lista.length === 0) return 0;
  const set = new Set(lista);
  let grupuriPotrivite = 0;
  const acoperite = new Set<string>();
  for (const g of grupuri) {
    let potrivit = false;
    for (const t of g) {
      if (set.has(t)) { potrivit = true; acoperite.add(t); }
    }
    if (potrivit) grupuriPotrivite++;
  }
  if (grupuriPotrivite === 0) return 0;
  const a = grupuriPotrivite / grupuri.length;
  const b = acoperite.size / lista.length;
  return (2 * a * b) / (a + b);
}

export interface SugestieCategorie {
  category_id: number;
  name: string;
  path: string;
  scor: number;   // 0..1
  /** Numele frunzei acopera exact ce s-a cerut, fara cuvinte in plus si fara lipsuri. */
  exact: boolean;
  motiv: string;  // de ce a fost aleasa, pe intelesul comerciantului
}

export interface OptiuniPotrivire {
  /** Publicul implicit al magazinului, cand numele categoriei nu il spune. */
  publicImplicit?: PublicTinta | null;
  limita?: number;
}

/**
 * Ordoneaza categoriile About You dupa cat de bine se potrivesc cu un nume de
 * categorie din magazin. Intoarce si un scor, ca interfata sa poata deosebi
 * „sigur asta e" de „pare, dar confirma tu".
 */
export function potrivesteCategorie(
  numeEdinio: string,
  categorii: AboutYouCategory[],
  optiuni: OptiuniPotrivire = {},
): SugestieCategorie[] {
  const q = traduCategorie(numeEdinio);
  if (q.grupuri.length === 0) return [];

  const publicCerut = q.public ?? optiuni.publicImplicit ?? null;
  const publicExplicit = q.public !== null;
  const limita = optiuni.limita ?? 8;

  /*
   * DOAR FRUNZELE POT FI ALESE. Plasa de siguranta, nu reparatie.
   *
   * ⚠ ONESTITATE: filtrul asta a fost adaugat crezand ca `GET /categories/`
   * intoarce si nodurile intermediare, si ca de acolo vine potrivirea „Cizme damă"
   * pe `Fashion|Women|Shoes|Boots`. PROBA PE API-UL REAL (17.08, cheia
   * comerciantului) spune altceva: cele 851 de randuri sunt TOATE frunze —
   * `parent_id` trimite spre 211 noduri parinte care NU sunt in raspuns. Deci
   * multimea de mai jos iese goala si filtrul e un no-op.
   *
   * Il pastram fiindca nu costa nimic (un `Set` peste o lista deja adusa) si
   * fiindca alegerea e IREVERSIBILA: „once the product category is published &
   * approved, there is no possibility of changing the category." Daca About You
   * incepe vreodata sa intoarca si parintii, filtrul e deja acolo.
   */
  const parinti = new Set<number>();
  for (const c of categorii) {
    if (c.parent_id != null) parinti.add(c.parent_id);
  }

  const rezultate: SugestieCategorie[] = [];
  for (const cat of categorii) {
    if (parinti.has(cat.id)) continue;
    const p = pregateste(cat);

    const potrivireFrunza = scorLista(q.grupuri, p.frunza);
    if (potrivireFrunza === 0) continue;   // fara atingere pe frunza nu e categoria cautata

    /*
     * SUBSTANTIVUL trebuie atins, nu doar calificativul.
     *
     * Primul grup produs de `traduCategorie` e substantivul („mănuși"), restul
     * sunt calificative („de iarnă"). Fara conditia asta, o frunza care prinde
     * DOAR calificativul trecea: „Mănuși de iarnă" propunea „Winter coat", iar
     * scorul putea urca destul cat sa se aplice singura — pe o categorie care nu
     * se mai poate schimba dupa aprobare.
     */
    if (q.grupuri.length > 1 && scorLista([q.grupuri[0]], p.frunza) === 0) continue;

    let scor = 0.8 * potrivireFrunza + 0.2 * scorLista(q.grupuri, p.cale);

    /*
     * Publicul tinta. Scris de comerciant in numele categoriei, o nepotrivire e
     * eroare grava; venit din setarea magazinului, e doar o preferinta.
     *
     * ⚠ Cand numele spune explicit „copii", setarea magazinului NU se mai aplica:
     * altfel un magazin cu `target_audience = women` impingea in fata frunza de
     * ADULTI pentru o categorie numita „Rochii copii", si o penalizare de 0,30 nu
     * ajungea ca sa o intoarca. Nepotrivirea devine eliminatorie.
     */
    if (q.copii) {
      if (!p.copii) continue;
    } else if (publicCerut) {
      if (p.publicTinta === publicCerut) scor += 0.10;
      else if (p.publicTinta) scor -= publicExplicit ? 0.45 : 0.16;
    }
    if (!q.copii && p.copii && !publicExplicit) scor -= 0.08;

    // „Sports X" si „Traditional X" sunt categorii distincte pe About You.
    if (p.sport !== q.sport) scor -= q.sport ? 0.12 : 0.10;
    if (p.traditional !== q.traditional) scor -= q.traditional ? 0.12 : 0.10;
    if (p.hardware && !q.sport) scor -= 0.12;
    scor -= p.calificativeNecerute * (q.sport ? 0.02 : 0.07);

    // La scor egal, categoria mai generala (mai sus in arbore) e alegerea sigura.
    scor -= Math.max(0, p.adancime - 4) * 0.015;

    if (scor <= 0) continue;
    rezultate.push({
      category_id: cat.id,
      name: cat.name,
      path: cat.path ?? cat.name,
      scor: Math.min(1, scor),
      exact: potrivireFrunza >= 0.999,
      motiv: explica(q, p, potrivireFrunza),
    });
  }

  rezultate.sort((a, b) => b.scor - a.scor || a.path.length - b.path.length);
  return rezultate.slice(0, limita);
}

const ETICHETA_PUBLIC: Record<PublicTinta, string> = {
  women: "Femei", men: "Bărbați", girls: "Fete", boys: "Băieți",
};

function explica(q: InterogareTradusa, p: CategoriePregatita, potrivireFrunza: number): string {
  const cuvinte = q.grupuri.map((g) => g[0]).join(", ");
  const cat = potrivireFrunza >= 0.999 ? "potrivire exactă" : "potrivire parțială";
  const gen = p.publicTinta ? ETICHETA_PUBLIC[p.publicTinta] : null;
  return gen ? `${cat} pe „${cuvinte}", secțiunea ${gen}` : `${cat} pe „${cuvinte}"`;
}

/*
 * Cand se aplica singura o potrivire, si cand se cere confirmare.
 *
 * Trei conditii, toate necesare:
 *   - frunza acopera EXACT cererea. „Adidasi" ajunge pe `Platform trainers`
 *     doar pentru ca About You n-are o frunza „Trainers" simpla; a alege singuri
 *     un stil anume in locul comerciantului ar fi o inventie, nu o potrivire.
 *   - scorul e mare, deci si contextul (sectiunea, calea) se potriveste.
 *   - urmatoarea sugestie e vizibil mai slaba. „Hanorace copii" cade la egalitate
 *     intre Fete si Baieti — acolo raspunsul corect e o intrebare, nu o alegere.
 */
export const PRAG_SIGUR = 0.75;
export const MARJA_SIGURA = 0.06;

export function potrivireSigura(sugestii: SugestieCategorie[]): SugestieCategorie | null {
  const prima = sugestii[0];
  if (!prima || !prima.exact || prima.scor < PRAG_SIGUR) return null;
  const marja = sugestii[1] ? prima.scor - sugestii[1].scor : 1;
  return marja >= MARJA_SIGURA ? prima : null;
}

/**
 * Cauta liber in taxonomia About You, cu traducere din romana.
 *
 * Inlocuieste filtrarea de pe serverul About You, care nu intelege romana. Aici
 * cautam intai dupa termenul scris ca atare — cine stie deja cuvantul englezesc
 * ori a inceput sa-l scrie („hand" -> „Handbag") trebuie sa-l gaseasca — si abia
 * apoi completam cu potrivirile obtinute prin traducere.
 */
export function cautaCategorii(
  termen: string,
  categorii: AboutYouCategory[],
  optiuni: OptiuniPotrivire = {},
): AboutYouCategory[] {
  const brut = normalizeaza(termen);
  if (brut.length < 2) return [];
  const limita = optiuni.limita ?? 40;

  const directe = categorii.filter((c) => normalizeaza(c.path ?? c.name).includes(brut));
  const vazute = new Set(directe.map((c) => c.id));

  const dupaId = new Map(categorii.map((c) => [c.id, c]));
  const traduse = potrivesteCategorie(termen, categorii, { ...optiuni, limita })
    .filter((s) => !vazute.has(s.category_id))
    .map((s) => dupaId.get(s.category_id))
    .filter((c): c is AboutYouCategory => !!c);

  return [...directe, ...traduse].slice(0, limita);
}
