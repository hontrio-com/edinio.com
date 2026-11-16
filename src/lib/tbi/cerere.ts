import type { TbiConfig } from "./config";

/**
 * Cererea de finantare trimisa la tbi Fusion Pay (`RegisterApplication`, campul criptat `data`),
 * construita din comanda. Modul PUR.
 *
 * ═══ FORMA LOR (documentatia „RO Fusion Pay", „Encrypted JSON Parameters") ═══
 *
 *   orderid, firstname, lastname, email, phone,
 *   items [ { name, description, qty, price, sku, category, imagelink } ],
 *   statusURL, successRedirectURL, failRedirectURL
 *
 * Obligatorii dupa documentatie: `orderid`, `items`, iar in fiecare articol `name`, `qty`, `price`,
 * `sku`, `category`, `imagelink`. Tipurile din tabel: `qty` si `category` numere intregi, `price`
 * numar cu zecimale (exemplele lor le scriu ca text; serverul de test le primeste pe amandoua).
 *
 * ⚠ Serverul de test e mai ingaduitor decat documentatia (masurat 16.11.2026): a primit si un
 * `orderid` gol, si un articol fara `sku`, cu avertismente PHP in raspuns. Nu ne bizuim pe asta:
 * pleaca mereu toate campurile.
 *
 * ═══ ⚠ ARTICOLELE ADUNA EXACT TOTALUL ═══
 *
 * tbi isi socoteste suma din articole („Total basket amount (74200) is below or above financing
 * limits", eroarea 210), nu dintr-un camp de total. Daca articolele ar aduna altceva decat comanda
 * (transportul lipsa, o reducere scazuta doar din total, TVA adaugat peste preturi fara TVA), banca
 * ar finanta alta suma decat cea de incasat. Modulul lor de WooCommerce trimite pretul DUPA reducere
 * (`line_total / qty`), deci si la ei lista urmeaza totalul.
 *
 * Aici: produsele si transportul, apoi diferenta fata de total se imparte proportional pe linii, in
 * bani, fiecare linie ramanand un multiplu al cantitatii ei (ca `qty x price` sa dea exact linia).
 * Ce nu se poate imparti asa (cel mult cativa bani) merge pe o linie cu cantitatea 1, iar daca nu
 * exista niciuna, pe o linie „Ajustare". Niciun pret negativ: nu stim daca tbi le primeste.
 */

export type ComandaPentruTbi = {
  id: string;
  order_number: string;
  total: number | string;
  items: unknown;
  shipping_cost: number | string | null;
  customer_name: string;
  customer_email: string | null;
  customer_phone: string;
};

export type ProdusPentruTbi = { sku?: string | null; imagine?: string | null };

export type ArticolTbi = {
  name: string;
  qty: number;
  price: number;
  sku: string;
  category: number;
  imagelink: string;
};

export type CerereTbi = {
  orderid: string;
  firstname: string;
  lastname: string;
  email: string;
  phone: string;
  items: ArticolTbi[];
  statusURL: string;
  successRedirectURL: string;
  failRedirectURL: string;
};

type Linie = { nume: string; cantitate: number; bani: number; sku: string; imagine: string };

const text = (v: unknown, max = 200) => (typeof v === "string" ? v.trim().slice(0, max) : "");

/** Lei -> bani, cu rotunjire la cel mai apropiat ban. */
export function inBani(lei: unknown): number {
  const n = Number(lei);
  return Number.isFinite(n) ? Math.round(n * 100) : 0;
}

/**
 * Numele, despartit in prenume si nume. Formularul are un singur camp, deci primul cuvant devine
 * prenumele, iar restul numele. Un singur cuvant merge in amandoua, ca niciunul sa nu plece gol.
 */
export function imparteNumele(complet: string): { fname: string; lname: string } {
  const parti = String(complet ?? "").trim().split(/\s+/).filter(Boolean);
  if (parti.length === 0) return { fname: "", lname: "" };
  if (parti.length === 1) return { fname: parti[0].slice(0, 60), lname: parti[0].slice(0, 60) };
  return { fname: parti[0].slice(0, 60), lname: parti.slice(1).join(" ").slice(0, 100) };
}

/**
 * Telefonul in forma romaneasca din exemplele lor („0777777777"). `+40`, `0040` si `40` din fata
 * se scot; un numar strain ramane cum l-a scris omul (fara spatii).
 */
export function telefonRomanesc(t: string): string {
  const curat = String(t ?? "").replace(/[^\d+]/g, "");
  let cifre = curat.replace(/^\+/, "");
  if (cifre.startsWith("0040")) cifre = cifre.slice(4);
  else if (cifre.startsWith("40") && cifre.length === 11) cifre = cifre.slice(2);
  if (/^7\d{8}$/.test(cifre)) return `0${cifre}`;
  if (/^0\d{9}$/.test(cifre)) return cifre;
  return curat.slice(0, 20);
}

/**
 * Liniile, aduse sa adune EXACT `tinta` (in bani). Vezi antetul fisierului.
 *
 * ⚠ In BigInt: o linie de 300.000 lei (3e7 bani) inmultita cu un total de acelasi ordin trece de
 * 2^53, iar `Number` ar rotunji tacut exact produsul din care se face impartirea.
 */
export function potrivesteLiniile(linii: Linie[], tinta: number): Linie[] {
  const pline = linii.filter((l) => l.bani > 0 && l.cantitate > 0);
  const suma = pline.reduce((s, l) => s + l.bani, 0);
  if (tinta <= 0) return [];
  if (pline.length === 0 || suma <= 0) {
    return [{ nume: "Comanda", cantitate: 1, bani: tinta, sku: "COMANDA", imagine: "" }];
  }
  if (suma === tinta) return pline;

  const T = BigInt(tinta);
  const S = BigInt(suma);
  const iesire = pline.map((l) => {
    const q = BigInt(l.cantitate);
    const bucati = (BigInt(l.bani) * T) / (S * q); // impartire intreaga = podea
    return { ...l, bani: Number(bucati * q) };
  });
  let rest = tinta - iesire.reduce((s, l) => s + l.bani, 0);
  if (rest > 0) {
    /* Pe cea mai mare linie cu cantitatea 1: acolo cativa bani in plus se vad cel mai putin. */
    const unice = iesire.filter((l) => l.cantitate === 1);
    if (unice.length > 0) {
      const tinta1 = unice.reduce((a, b) => (b.bani > a.bani ? b : a));
      tinta1.bani += rest;
      rest = 0;
    } else {
      iesire.push({ nume: "Ajustare", cantitate: 1, bani: rest, sku: "AJUSTARE", imagine: "" });
      rest = 0;
    }
  }
  const finale = iesire.filter((l) => l.bani > 0);
  return finale.length > 0 ? finale : [{ nume: "Comanda", cantitate: 1, bani: tinta, sku: "COMANDA", imagine: "" }];
}

type LinieComanda = { name?: unknown; price?: unknown; quantity?: unknown; product_id?: unknown };

/** Liniile comenzii, in bani, cu sku si imagine din catalog cand le avem. */
export function liniileComenzii(c: ComandaPentruTbi, produse: Map<string, ProdusPentruTbi>): Linie[] {
  const items = Array.isArray(c.items) ? (c.items as LinieComanda[]) : [];
  const linii: Linie[] = [];
  for (const it of items) {
    const cantitate = Math.max(1, Math.round(Number(it.quantity) || 1));
    const unitar = inBani(it.price);
    const id = typeof it.product_id === "string" ? it.product_id : "";
    const p = id ? produse.get(id) : undefined;
    linii.push({
      nume: text(it.name) || "Produs",
      cantitate,
      bani: unitar * cantitate,
      sku: text(p?.sku, 64) || id.slice(0, 64) || "PRODUS",
      imagine: /^https:\/\//i.test(p?.imagine ?? "") ? String(p!.imagine).slice(0, 1000) : "",
    });
  }
  const transport = inBani(c.shipping_cost);
  if (transport > 0) linii.push({ nume: "Transport", cantitate: 1, bani: transport, sku: "TRANSPORT", imagine: "" });
  return linii;
}

export function construiesteCererea(p: {
  comanda: ComandaPentruTbi;
  cfg: Pick<TbiConfig, "categorie">;
  /** Id-ul cererii la noi; pleaca drept `orderid` si se intoarce ca `OrderId` in vesti. */
  idCerere: number | string;
  /** `statusURL`: adresa la care tbi trimite fiecare schimbare de stare a cererii. */
  adresaVesti: string;
  /** Unde se intoarce clientul dupa pagina tbi: cererea trimisa, respectiv abandonata. */
  intoarcere: { reusita: string; esuata: string };
  produse: Map<string, ProdusPentruTbi>;
}): CerereTbi {
  const { comanda, cfg } = p;
  const total = inBani(comanda.total);
  const nume = imparteNumele(comanda.customer_name);
  const categorie = Number(cfg.categorie) || 1;

  /*
   * O reducere (cupon) priveste MARFA, nu transportul: cand totalul e sub suma liniilor, transportul
   * ramane cum l-a vazut omul si se potrivesc doar produsele. In sens invers (preturi fara TVA, la
   * care totalul are TVA-ul adaugat), se potrivesc toate, transportul inclusiv.
   */
  const toate = liniileComenzii(comanda, p.produse);
  const transport = toate.find((l) => l.sku === "TRANSPORT");
  const marfa = toate.filter((l) => l !== transport);
  const sumaToate = toate.reduce((s, l) => s + l.bani, 0);
  const linii = transport && sumaToate > total && total - transport.bani > 0
    ? [...potrivesteLiniile(marfa, total - transport.bani), transport]
    : potrivesteLiniile(toate, total);

  return {
    orderid: String(p.idCerere),
    firstname: nume.fname,
    lastname: nume.lname,
    email: text(comanda.customer_email, 120),
    phone: telefonRomanesc(comanda.customer_phone),
    items: linii.map((l) => ({
      name: l.nume,
      qty: l.cantitate,
      /* Multiplu exact de cantitate (vezi `potrivesteLiniile`), deci impartirea nu lasa rest. */
      price: Math.round(l.bani / l.cantitate) / 100,
      sku: l.sku,
      category: categorie,
      imagelink: l.imagine,
    })),
    statusURL: p.adresaVesti,
    successRedirectURL: p.intoarcere.reusita,
    failRedirectURL: p.intoarcere.esuata,
  };
}

/** Suma articolelor, in bani: trebuie sa fie chiar totalul comenzii. Folosita de probe si de jurnal. */
export function sumaArticolelor(c: CerereTbi): number {
  return c.items.reduce((s, a) => s + Math.round(a.price * 100) * a.qty, 0);
}
