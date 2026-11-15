import type { TbiConfig } from "./config";

/**
 * Cererea de finantare trimisa la tbi („Finalize"), construita din comanda. Modul PUR.
 *
 * ═══ FORMA LOR (documentatia + „4. Send application Code Example.php" + „7. Request example") ═══
 *
 *   store_id, order_id, back_ref, order_total, username, password,
 *   customer { fname, lname, cnp, email, phone, billing_*, shipping_*, promo },
 *   items [ { name, qty, price, category, sku, ImageLink } ]
 *
 * Ordinea cheilor e chiar a exemplelor lor. Campurile scrise cu ROSU in documentatie (deci
 * obligatorii) sunt `order_total`, `promo` si tot ce e in `items`; restul se trimite oricum,
 * fiindca il avem si fiindca pagina lor de cerere il precompleteaza.
 *
 * ═══ ⚠ ARTICOLELE ADUNA EXACT TOTALUL ═══
 *
 * Banca finanteaza `order_total`. Daca articolele ar aduna altceva (transportul lipsa, o reducere
 * scazuta doar din total, TVA adaugat peste preturi fara TVA), clientul ar vedea in cererea lui o
 * lista de produse care nu da suma pe care o semneaza, iar tbi ar putea s-o refuze. Modulul lor de
 * WooCommerce trimite pretul DUPA reducere (`line_total / qty`), deci si la ei lista urmeaza totalul.
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
  shipping_address: unknown;
};

export type ProdusPentruTbi = { sku?: string | null; imagine?: string | null };

export type ArticolTbi = {
  name: string;
  qty: string;
  price: number;
  category: string;
  sku: string;
  ImageLink: string;
};

export type CerereTbi = {
  store_id: string;
  order_id: string;
  back_ref: string;
  order_total: string;
  username: string;
  password: string;
  customer: {
    fname: string;
    lname: string;
    cnp: string;
    email: string;
    phone: string;
    billing_address: string;
    billing_city: string;
    billing_county: string;
    shipping_address: string;
    shipping_city: string;
    shipping_county: string;
    promo: 0 | 1;
  };
  items: ArticolTbi[];
};

type Linie = { nume: string; cantitate: number; bani: number; sku: string; imagine: string };

const text = (v: unknown, max = 200) => (typeof v === "string" ? v.trim().slice(0, max) : "");

/** Lei -> bani, cu rotunjire la cel mai apropiat ban. */
export function inBani(lei: unknown): number {
  const n = Number(lei);
  return Number.isFinite(n) ? Math.round(n * 100) : 0;
}

/** Bani -> text cu doua zecimale, cum arata `order_total` in exemplele lor („1234.00"). */
export function leiText(bani: number): string {
  return (bani / 100).toFixed(2);
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
 * Telefonul in forma romaneasca pe care o asteapta exemplele lor („0752000000"). `+40`, `0040` si
 * `40` din fata se scot; un numar strain ramane cum l-a scris omul (fara spatii).
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

function adresa(raw: unknown): { address: string; city: string; county: string } {
  const a = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
  return { address: text(a.address), city: text(a.city, 100), county: text(a.county, 100) };
}

export function construiesteCererea(p: {
  comanda: ComandaPentruTbi;
  cfg: Pick<TbiConfig, "store_id" | "username" | "password" | "promo" | "categorie">;
  /** Id-ul cererii la noi; pleaca drept `order_id`. Numar intreg, cum cere documentatia. */
  idCerere: number | string;
  /** `back_ref`: adresa la care tbi trimite fiecare schimbare de stare. */
  adresaInapoi: string;
  produse: Map<string, ProdusPentruTbi>;
}): CerereTbi {
  const { comanda, cfg } = p;
  const total = inBani(comanda.total);
  const nume = imparteNumele(comanda.customer_name);
  const livrare = adresa(comanda.shipping_address);
  const categorie = cfg.categorie || "1";

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
    store_id: cfg.store_id,
    order_id: String(p.idCerere),
    back_ref: p.adresaInapoi,
    order_total: leiText(total),
    username: cfg.username,
    password: cfg.password,
    customer: {
      fname: nume.fname,
      lname: nume.lname,
      cnp: "",
      email: text(comanda.customer_email, 120),
      phone: telefonRomanesc(comanda.customer_phone),
      /* Plata in rate e numai pentru persoane fizice (formularul o ascunde la comanda pe firma),
         deci facturarea e chiar adresa omului. */
      billing_address: livrare.address,
      billing_city: livrare.city,
      billing_county: livrare.county,
      shipping_address: livrare.address,
      shipping_city: livrare.city,
      shipping_county: livrare.county,
      promo: cfg.promo ? 1 : 0,
    },
    items: linii.map((l) => ({
      name: l.nume,
      qty: String(l.cantitate),
      /* Multiplu exact de cantitate (vezi `potrivesteLiniile`), deci impartirea nu lasa rest. */
      price: Math.round(l.bani / l.cantitate) / 100,
      category: categorie,
      sku: l.sku,
      ImageLink: l.imagine,
    })),
  };
}

/** Suma articolelor, in bani: trebuie sa fie chiar `order_total`. Folosita de probe si de jurnal. */
export function sumaArticolelor(c: CerereTbi): number {
  return c.items.reduce((s, a) => s + Math.round(a.price * 100) * Number(a.qty), 0);
}
