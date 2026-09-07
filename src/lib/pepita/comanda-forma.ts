/**
 * Sarcina utila a comenzii Pepita, citita cu neincredere.
 *
 * ═══ ⚠ EXEMPLUL DIN DOCUMENTATIA LOR NU E JSON VALID ═══
 *
 * In PDF-ul „Automatic order forwarding” scrie, textual, `"payment_mode":cod` (fara
 * ghilimele), `"total_shipping_price_currency":"HUF""voucher": ""` (fara virgula
 * intre campuri) si virgule la coada listelor. Deci exemplul lor NU se poate lipi
 * intr-un parser.
 *
 * Din asta NU urmeaza ca trebuie sa acceptam orice: e o greseala de redactare a
 * documentului, nu forma cererilor lor. Urmeaza doar ca nu putem construi schema
 * copiind exemplul, si ca trebuie sa fim toleranti la lucrurile care nu schimba
 * intelesul (numar sau sir la `id`, camp lipsa unde avem o valoare implicita
 * sigura), si neinduplecati la cele care il schimba (fara `id`, fara produse,
 * cantitate zero).
 *
 * ═══ ⚠ SI NUMELE CAMPULUI DE LIVRARE E SCRIS `delivery_mod` ═══
 *
 * Asa e si in definitia campului, si in exemplu: „delivery_mod”, nu
 * „delivery_mode”. Se citesc amandoua, fiindca e cu putinta sa fie o greseala de
 * tipar in documentatie si sa vina forma lunga. Ce nu se face e sa se aleaga una
 * si sa se spere.
 *
 * ⚠ MODUL PUR: nicio citire din baza. Ce iese de aici e o comanda NORMALIZATA,
 * inca nelegata de niciun produs si de niciun magazin.
 */

/** Cat de lung poate fi un sir venit de la ei inainte sa fie taiat. */
const MAX_SIR = 2000;
/** Cate linii poate avea o comanda. Peste atat, e o greseala, nu o comanda. */
export const MAX_LINII = 200;

export interface LiniePepita {
  /** `id` din sarcina lor: identificatorul Pepita al produsului. Opac pentru noi. */
  idPepita: string | null;
  /** `sku`: ce le-am dat noi in feed. Cheia potrivirii. */
  sku: string | null;
  moneda: string | null;
  cantitate: number;
  /** Pretul BRUT unitar, asa cum l-au trimis. Nu se recalculeaza niciodata. */
  pret: number;
  tva: number | null;
}

export interface ClientPepita {
  nume: string;
  prenume: string;
  telefon: string;
  /** ⚠ Poate fi un alias Pepita. Se pastreaza exact; nu e adresa personala a clientului. */
  email: string | null;
  facturare: {
    nume: string | null; tara: string | null; oras: string | null;
    strada: string | null; numeStrada: string | null; numar: string | null; codPostal: string | null;
  };
  livrare: {
    tara: string | null; judet: string | null; oras: string | null;
    strada: string | null; numeStrada: string | null; numar: string | null; codPostal: string | null;
  };
  codFiscal: string | null;
}

export interface ComandaPepita {
  externalId: string;
  origine: string | null;
  /** Data lor, PASTRATA CA SIR. Vezi nota de la `citesteComanda`. */
  dataBruta: string | null;
  modPlata: string | null;
  starePlata: string | null;
  modLivrare: string | null;
  status: string | null;
  mesajClient: string | null;
  mesajCurier: string | null;
  transport: number;
  monedaTransport: string | null;
  voucher: number;
  client: ClientPepita;
  linii: LiniePepita[];
}

export type Verdict =
  | { ok: true; comanda: ComandaPepita }
  | { ok: false; cod: string; mesaj: string; externalId: string | null };

function sir(v: unknown): string | null {
  if (typeof v === "string") {
    const s = v.trim();
    return s ? s.slice(0, MAX_SIR) : null;
  }
  if (typeof v === "number" && Number.isFinite(v)) return String(v);
  return null;
}

/**
 * Numarul, cand chiar e numar.
 *
 * ⚠ `Number("")` E ZERO, iar zero e o valoare cu inteles la transport si la
 * voucher. Un camp gol trebuie sa insemne „lipseste”, nu „zero lei”, altfel un
 * transport netrimis ar aparea ca transport gratuit.
 */
function numar(v: unknown): number | null {
  if (typeof v === "number") return Number.isFinite(v) ? v : null;
  if (typeof v === "string") {
    const s = v.trim().replace(",", ".");
    if (!s) return null;
    const n = Number(s);
    return Number.isFinite(n) ? n : null;
  }
  return null;
}

function obiect(v: unknown): Record<string, unknown> {
  return v && typeof v === "object" && !Array.isArray(v) ? (v as Record<string, unknown>) : {};
}

/** Codul de moneda, daca arata a cod de moneda. */
function moneda(v: unknown): string | null {
  const s = sir(v);
  return s && /^[A-Za-z]{3}$/.test(s) ? s.toUpperCase() : null;
}

/**
 * Comanda lor, citita si normalizata.
 *
 * ⚠ CAMPURILE NECUNOSCUTE NU OPRESC NIMIC. Ei pot adauga maine un camp; o
 * comanda respinsa pentru asta ar fi o comanda pierduta, si ar cadea toate
 * comenzile deodata. Campurile CRITICE lipsa opresc, fiindca fara ele comanda
 * nu inseamna nimic.
 *
 * ⚠ DATA NU SE CONVERTESTE. Formatul lor e „2018-05-21 10:23:41”, fara fus orar
 * si fara ca documentatia sa spuna in ce fus e. Interpretata drept UTC, o comanda
 * de la ora 01:00 ar aparea in Edinio in ziua precedenta; interpretata local, o
 * comanda din alt fus ar sari inainte. Se pastreaza SIRUL, langa comanda, iar
 * `orders.created_at` ramane clipa in care am primit-o noi, care e adevarata si
 * nu depinde de nicio presupunere.
 */
export function citesteComanda(brut: unknown): Verdict {
  const c = obiect(brut);
  const externalId = sir(c.id);

  if (Object.keys(c).length === 0) {
    return { ok: false, cod: "corp-gol", mesaj: "Sarcina utila lipseste sau nu este un obiect JSON.", externalId: null };
  }
  if (!externalId) {
    return { ok: false, cod: "fara-id", mesaj: "Comanda nu are `id`.", externalId: null };
  }

  const produseBrute = Array.isArray(c.products) ? c.products : null;
  if (!produseBrute || produseBrute.length === 0) {
    return { ok: false, cod: "fara-produse", mesaj: "Comanda nu are niciun produs.", externalId };
  }
  if (produseBrute.length > MAX_LINII) {
    return { ok: false, cod: "prea-multe-linii", mesaj: `Comanda are ${produseBrute.length} linii, peste limita de ${MAX_LINII}.`, externalId };
  }

  const linii: LiniePepita[] = [];
  for (const p of produseBrute) {
    const l = obiect(p);
    const cantitate = numar(l.quantity);
    const pret = numar(l.price);
    /*
     * ⚠ CANTITATEA SI PRETUL SE VERIFICA PE LINIE, nu la total. O linie cu
     * cantitate zero sau negativa ar creste stocul la consum, iar una cu pret
     * negativ ar face un total mai mic decat ce a incasat marketplace-ul.
     */
    if (cantitate == null || !Number.isInteger(cantitate) || cantitate <= 0) {
      return { ok: false, cod: "cantitate-nevalida", mesaj: "O linie are cantitate nevalidă.", externalId };
    }
    if (pret == null || pret < 0) {
      return { ok: false, cod: "pret-nevalid", mesaj: "O linie are preț nevalid.", externalId };
    }
    linii.push({
      idPepita: sir(l.id),
      sku: sir(l.sku),
      moneda: moneda(l.currency),
      cantitate,
      pret,
      tva: numar(l.vat),
    });
  }

  const cl = obiect(c.customer);
  const client: ClientPepita = {
    nume: sir(cl.last_name) ?? "",
    prenume: sir(cl.first_name) ?? "",
    telefon: sir(cl.phone) ?? "",
    email: sir(cl.email),
    facturare: {
      nume: sir(cl.billing_name),
      tara: sir(cl.billing_country),
      oras: sir(cl.billing_city),
      strada: sir(cl.billing_street),
      numeStrada: sir(cl.billing_street_address),
      numar: sir(cl.billing_house_number),
      codPostal: sir(cl.billing_postal_code),
    },
    livrare: {
      tara: sir(cl.shipping_country),
      /* ⚠ „only for Romanian orders”, scrie in documentatia lor. Deci pe alte piete lipseste. */
      judet: sir(cl.shipping_county),
      oras: sir(cl.shipping_city),
      strada: sir(cl.shipping_street),
      numeStrada: sir(cl.shipping_street_address),
      numar: sir(cl.shipping_house_number),
      codPostal: sir(cl.shipping_postal_code),
    },
    codFiscal: sir(cl.tax_number),
  };

  return {
    ok: true,
    comanda: {
      externalId,
      origine: sir(c.origin),
      dataBruta: sir(c.date),
      modPlata: sir(c.payment_mode),
      starePlata: sir(c.payment_status),
      /* ⚠ Ambele scrieri. Vezi nota din capul fisierului. */
      modLivrare: sir(c.delivery_mod) ?? sir(c.delivery_mode),
      status: sir(c.status),
      mesajClient: sir(c.customer_message),
      mesajCurier: sir(c.courier_message),
      transport: numar(c.total_shipping_price) ?? 0,
      monedaTransport: moneda(c.total_shipping_price_currency),
      voucher: numar(c.voucher) ?? 0,
      client,
      linii,
    },
  };
}
