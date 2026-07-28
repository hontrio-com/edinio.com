/**
 * Potrivirea automata a categoriilor magazinului cu cele din Trendyol.
 *
 * Trendyol nu are un serviciu de sugestii (spre deosebire de OLX), deci potrivirea
 * se face la noi, peste arborele lor de categorii finale. Regula care conduce tot
 * fisierul: **mai bine nicio sugestie decat una gresita**. O categorie mapata
 * gresit nu da eroare — produsele chiar se listeaza, dar in raftul altcuiva, cu
 * atributele altei categorii, si comerciantul afla abia din reclamatii.
 *
 * De aceea:
 *  - potrivirea sigura cere si scor mare, SI distanta fata de urmatoarea varianta
 *    (daca doua categorii sunt la fel de bune, alegerea e pe ghicite);
 *  - un conflict de segment (femei / barbati / copii) taie scorul la un sfert,
 *    fiindca exact acolo se greseste cel mai des si cel mai scump;
 *  - nimic nu se aplica singur: totul trece prin confirmarea comerciantului.
 */

export type Incredere = "sigura" | "probabila" | "slaba";

export interface FrunzaTrendyol {
  id: number;
  /** Calea completa, ex. „Îmbrăcăminte > Femei > Rochii". */
  label: string;
}

export interface PotrivireCategorie {
  categoryId: number;
  label: string;
  /** 0..1 */
  scor: number;
  incredere: Incredere;
}

// ── Normalizare ───────────────────────────────────────────────────────────────

const STOPWORDS = new Set([
  "de", "si", "cu", "din", "la", "pentru", "pe", "in", "a", "al", "ale", "un", "o",
  "the", "and", "for", "with", "ve", "other", "altele", "diverse",
]);

/**
 * Sinonime, ca sa mearga si daca Trendyol raspunde in engleza sau turca.
 *
 * Nomenclatoarele vin traduse dupa `Accept-Language`, dar nu toate categoriile
 * sunt traduse complet, iar pe vitrinele non-RO limba e engleza. Adaugam variantele
 * ca simboluri suplimentare, nu inlocuim — asa o potrivire romaneasca ramane la fel
 * de buna.
 */
const SINONIME: Record<string, string[]> = {
  rochi: ["dress", "elbise"],
  tricou: ["tshirt", "tisort", "shirt"],
  camas: ["shirt", "gomlek"],
  bluz: ["blouse", "bluz"],
  fust: ["skirt", "etek"],
  pantalon: ["pants", "trousers", "pantolon"],
  blug: ["jeans", "denim", "kot"],
  geac: ["jacket", "ceket", "mont"],
  palton: ["coat", "kaban"],
  hanorac: ["hoodie", "sweatshirt"],
  pulover: ["sweater", "kazak"],
  costum: ["suit", "takim"],
  lenjeri: ["underwear", "lingerie", "ic giyim"],
  pijama: ["pyjamas", "pijama"],
  sosf: ["socks"],
  sosetc: ["socks", "corap"],
  incaltamint: ["shoes", "footwear", "ayakkabi"],
  pantof: ["shoes", "ayakkabi"],
  cizm: ["boots", "bot"],
  sandal: ["sandals", "sandalet"],
  adidas: ["sneakers", "sneaker", "spor ayakkabi"],
  papuc: ["slippers", "terlik"],
  geant: ["bag", "canta"],
  rucsac: ["backpack", "sirt cantasi"],
  portofel: ["wallet", "cuzdan"],
  cure: ["belt", "kemer"],
  palari: ["hat", "sapka"],
  sapc: ["cap", "sapka"],
  esarf: ["scarf", "sal"],
  manus: ["gloves", "eldiven"],
  ochelar: ["glasses", "sunglasses", "gozluk"],
  ceas: ["watch", "saat"],
  bijuteri: ["jewelry", "jewellery", "taki"],
  parfum: ["perfume", "fragrance"],
  crem: ["cream", "krem"],
  machiaj: ["makeup", "cosmetics", "makyaj"],
  sampon: ["shampoo"],
  telefon: ["phone", "smartphone", "telefon"],
  laptop: ["laptop", "notebook"],
  tablet: ["tablet"],
  cast: ["headphones", "earphones", "kulaklik"],
  boxa: ["speaker", "hoparlor"],
  televizor: ["tv", "television", "televizyon"],
  jucari: ["toy", "toys", "oyuncak"],
  mobil: ["furniture", "mobilya"],
  covor: ["carpet", "hali"],
  perdea: ["curtain", "perde"],
  lenj: ["bedding", "nevresim"],
  vas: ["cookware", "dishes"],
  scul: ["tools", "alet"],
  unelt: ["tools", "alet"],
  manus_protectie: ["safety gloves"],
  casc: ["helmet", "kask"],
  salopet: ["overalls", "tulum"],
  vest: ["vest", "yelek"],
  // Segmente.
  femei: ["women", "woman", "kadin", "dama"],
  barbat: ["men", "man", "erkek"],
  copil: ["kids", "child", "children", "cocuk"],
  bebelus: ["baby", "bebek"],
};

function faraDiacritice(s: string): string {
  return s.normalize("NFD").replace(/\p{M}+/gu, "");
}

export function simboluri(text: string): string[] {
  const brut = faraDiacritice(text)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .split(" ")
    .filter((t) => t.length > 1 && !STOPWORDS.has(t));

  const out = new Set<string>();
  for (const t of brut) {
    out.add(t);
    for (const [radacina, extra] of Object.entries(SINONIME)) {
      if (t.startsWith(radacina) || radacina.startsWith(t)) {
        for (const e of extra) for (const parte of e.split(" ")) out.add(parte);
      }
    }
  }
  return [...out];
}

/**
 * Doua simboluri inseamna acelasi lucru?
 *
 * Prefixul comun tine loc de radacinare: romana schimba sfarsitul cuvantului
 * („rochie" / „rochii" / „rochiilor"), iar un stemmer adevarat ar fi mai fragil
 * decat folositor pe nomenclatoare scurte.
 */
function acelasiSimbol(a: string, b: string): boolean {
  if (a === b) return true;
  const scurt = a.length <= b.length ? a : b;
  const lung = a.length <= b.length ? b : a;
  return scurt.length >= 4 && lung.startsWith(scurt);
}

function seGaseste(simbol: string, intre: string[]): boolean {
  return intre.some((x) => acelasiSimbol(simbol, x));
}

// ── Segmente (femei / barbati / copii) ────────────────────────────────────────

type Segment = "femei" | "barbati" | "copii";

const SEMNE_SEGMENT: Record<Segment, string[]> = {
  femei: ["femei", "femeie", "dama", "dame", "women", "woman", "kadin", "ladies"],
  barbati: ["barbati", "barbat", "men", "man", "erkek", "mens"],
  copii: ["copii", "copil", "fete", "fetite", "baieti", "kids", "child", "children", "cocuk", "bebe", "bebelusi", "baby", "bebek"],
};

export function segment(text: string): Segment | null {
  const t = faraDiacritice(text).toLowerCase();
  // Ordinea conteaza: „îmbrăcăminte copii femei" e tot copii.
  for (const s of ["copii", "femei", "barbati"] as Segment[]) {
    if (SEMNE_SEGMENT[s].some((semn) => new RegExp(`\\b${semn}`).test(t))) return s;
  }
  return null;
}

// ── Scor ──────────────────────────────────────────────────────────────────────

const PRAG_SIGURA = 0.82;
/** Cat trebuie sa fie in fata prima varianta ca sa nu fie o alegere pe ghicite. */
const AVANS_MINIM = 0.12;
const PRAG_PROBABILA = 0.55;

function segmenteCale(label: string): { frunza: string; cale: string } {
  const parti = label.split(">").map((p) => p.trim()).filter(Boolean);
  return { frunza: parti[parti.length - 1] ?? label, cale: parti.join(" ") };
}

/**
 * O categorie pregatita pentru comparat.
 *
 * Tokenizarea e partea scumpa, iar catalogul Trendyol are mii de categorii finale:
 * facuta la fiecare comparatie, maparea unui magazin cu 50 de categorii ar fi
 * insemnat sute de mii de tokenizari identice. Se face o singura data, in index.
 */
export interface CategoriePregatita {
  id: number;
  label: string;
  frunzaNorm: string;
  simbFrunza: string[];
  simbCale: string[];
  seg: Segment | null;
}

export function pregateste(id: number, label: string): CategoriePregatita {
  const { frunza, cale } = segmenteCale(label);
  return {
    id,
    label,
    frunzaNorm: faraDiacritice(frunza).toLowerCase(),
    simbFrunza: simboluri(frunza),
    simbCale: simboluri(cale),
    seg: segment(label),
  };
}

export function indexeazaFrunze(frunze: FrunzaTrendyol[]): CategoriePregatita[] {
  return frunze.map((f) => pregateste(f.id, f.label));
}

function scorPregatit(e: CategoriePregatita, t: CategoriePregatita): number {
  if (e.simbFrunza.length === 0 || t.simbFrunza.length === 0) return 0;

  // Potrivire exacta pe numele final: cazul fericit, nu mai are rost sa cantarim.
  if (e.frunzaNorm === t.frunzaNorm) return 0.97;

  const acoperire = e.simbFrunza.filter((s) => seGaseste(s, t.simbFrunza)).length / e.simbFrunza.length;
  const acoperireInversa = t.simbFrunza.filter((s) => seGaseste(s, e.simbFrunza)).length / t.simbFrunza.length;
  // Media armonica: pedepseste si potrivirea partiala, si categoria prea larga.
  let scor = acoperire + acoperireInversa > 0
    ? (2 * acoperire * acoperireInversa) / (acoperire + acoperireInversa)
    : 0;

  // Contextul din calea magazinului („Îmbrăcăminte > Rochii") confirma alegerea.
  const suplimentar = e.simbCale.filter((s) => !seGaseste(s, e.simbFrunza));
  if (suplimentar.length > 0) {
    const confirmate = suplimentar.filter((s) => seGaseste(s, t.simbCale)).length / suplimentar.length;
    scor = Math.min(1, scor + 0.15 * confirmate);
  }

  // Segmentul: aici se greseste cel mai scump (rochii de dama listate la barbati).
  if (e.seg && t.seg && e.seg !== t.seg) scor *= 0.25;
  else if (!e.seg && t.seg) scor *= 0.85;

  return Math.max(0, Math.min(1, scor));
}

export function scorPotrivire(numeEdinio: string, label: string): number {
  return scorPregatit(pregateste(0, numeEdinio), pregateste(0, label));
}

export function potrivesteIndexat(
  numeEdinio: string, index: CategoriePregatita[], limita = 3,
): PotrivireCategorie[] {
  const e = pregateste(0, numeEdinio);
  const cotate = index
    .map((t) => ({ categoryId: t.id, label: t.label, scor: scorPregatit(e, t) }))
    .filter((c) => c.scor > 0.2)
    .sort((a, b) => b.scor - a.scor || a.label.length - b.label.length)
    .slice(0, limita);

  return cotate.map((c, i) => ({
    ...c,
    incredere: increderea(c.scor, i === 0 ? cotate[1]?.scor ?? 0 : c.scor),
  }));
}

export function potriveste(numeEdinio: string, frunze: FrunzaTrendyol[], limita = 3): PotrivireCategorie[] {
  return potrivesteIndexat(numeEdinio, indexeazaFrunze(frunze), limita);
}

function increderea(scor: number, alDoilea: number): Incredere {
  if (scor >= PRAG_SIGURA && scor - alDoilea >= AVANS_MINIM) return "sigura";
  if (scor >= PRAG_PROBABILA) return "probabila";
  return "slaba";
}
