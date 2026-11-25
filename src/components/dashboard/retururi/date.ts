/*
  Datele paginii de Retururi: o cerere din `return_requests` adusa la forma pe care o deseneaza
  lista, si ce se intampla cu lista cand omul apasa un buton (aproba, respinge, am rambursat,
  citit, sterge), inainte sa raspunda serverul.

  ⚠ Modul PUR: nimic de aici nu citeste si nu scrie in baza. Schimbarea listei la o apasare
  (`aplicaActiunea`) sta aici, nu in componenta, ca sa poata fi probata: numarul de pe o fila
  trebuie sa ramana numarul cererilor din lista ei si in clipa dintre apasare si raspuns.
*/

import type { TonEticheta } from "@/components/ui/eticheta-stare";
import type { ComandaLista, DocumentComanda } from "@/components/dashboard/comenzi/date";
import { STARI_RETUR, type StareRetur } from "./filtre";

/** Coloanele din `return_requests` pe care le citeste `cerereDinRand`. */
export const COLOANE_RETUR =
  "id, order_id, order_number, customer_name, customer_email, customer_phone, items, reason, refund_method, refund_iban, status, is_read, created_at";

export interface ProdusRetur {
  nume: string;
  cantitate: number;
  pret: number;
  poza: string | null;
}

export interface CerereRetur {
  id: string;
  numarComanda: string;
  /** Comanda din care vine cererea, cat mai exista: pentru legatura catre ea. */
  idComanda: string | null;
  creatLa: string;
  citit: boolean;
  client: { nume: string | null; telefon: string | null; email: string | null };
  produse: ProdusRetur[];
  bucati: number;
  /** Cat e de dat inapoi: suma liniilor returnate. */
  valoare: number;
  motiv: string | null;
  /** Cum vrea clientul banii inapoi. `scurt` e forma care incape sub o suma. */
  rambursare: { fel: string | null; eticheta: string; scurt: string; iban: string | null };
  status: { cheie: StareRetur; eticheta: string; ton: TonEticheta };
  /** Ce se stie despre comanda din care vine: cum s-a platit si ce document are. */
  comanda: {
    plata: string;
    /** Banii comenzii au fost deja dati inapoi (starea platii, nu a cererii). */
    plataRambursata: boolean;
    total: number;
    moneda: string;
    document: DocumentComanda | null;
  } | null;
}

/** Numele starilor, cu diacritice si acordate cu „cererea". */
export const STARI_AFISATE: Record<StareRetur, { eticheta: string; ton: TonEticheta }> = {
  nou: { eticheta: "Nouă", ton: "asteptare" },
  aprobat: { eticheta: "Aprobată", ton: "info" },
  respins: { eticheta: "Respinsă", ton: "rau" },
  rambursat: { eticheta: "Rambursată", ton: "bun" },
};

/** Cum vrea clientul banii inapoi: numele intreg si forma scurta. */
const RAMBURSARI: Record<string, { eticheta: string; scurt: string }> = {
  iban: { eticheta: "Transfer bancar", scurt: "Transfer bancar" },
  original: { eticheta: "Aceeași metodă de plată", scurt: "Aceeași metodă" },
  card: { eticheta: "Pe card", scurt: "Pe card" },
};

type Rand = Record<string, unknown>;
const text = (v: unknown): string | null => (typeof v === "string" && v.trim() !== "" ? v.trim() : null);
const numar = (v: unknown): number => {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
};

/** Aduce un rand din `return_requests` la forma pe care o deseneaza lista. */
export function cerereDinRand(
  r: Rand,
  pozeProduse: Record<string, string>,
  comenzi: Record<string, ComandaLista>,
): CerereRetur {
  /* ⚠ `items` e `jsonb`: o linie care nu e obiect (un `null`, un text) se sare, nu darama lista. */
  const linii = (Array.isArray(r.items) ? r.items : []).filter((p): p is Rand => typeof p === "object" && p !== null && !Array.isArray(p));
  const produse: ProdusRetur[] = linii.map((p) => ({
    nume: text(p.name) ?? "Produs",
    cantitate: numar(p.quantity) || 1,
    pret: numar(p.price),
    poza: pozeProduse[String(p.product_id ?? "")] ?? null,
  }));
  const stareBruta = String(r.status ?? "nou");
  const stare: StareRetur = (STARI_RETUR as readonly string[]).includes(stareBruta) ? (stareBruta as StareRetur) : "nou";
  const fel = text(r.refund_method);
  const rambursare = fel ? RAMBURSARI[fel] ?? { eticheta: fel, scurt: fel } : { eticheta: "Nespecificată", scurt: "Nespecificată" };
  const comanda = r.order_id ? comenzi[String(r.order_id)] : undefined;

  return {
    id: String(r.id),
    numarComanda: String(r.order_number ?? ""),
    idComanda: r.order_id ? String(r.order_id) : null,
    creatLa: String(r.created_at),
    citit: r.is_read === true,
    client: { nume: text(r.customer_name), telefon: text(r.customer_phone), email: text(r.customer_email) },
    produse,
    bucati: produse.reduce((s, p) => s + p.cantitate, 0),
    /* In bani intregi: cateva linii cu doua zecimale, adunate ca fractii, pot iesi 59,970000000000006. */
    valoare: produse.reduce((s, p) => s + Math.round(p.pret * 100) * p.cantitate, 0) / 100,
    motiv: text(r.reason),
    rambursare: { fel, ...rambursare, iban: text(r.refund_iban) },
    status: { cheie: stare, ...STARI_AFISATE[stare] },
    comanda: comanda
      ? {
        plata: comanda.plata.eticheta,
        plataRambursata: comanda.plata.stare === "rambursata",
        total: comanda.total,
        moneda: comanda.moneda,
        document: comanda.factura.document,
      }
      : null,
  };
}

/* ── Ce face o apasare cu lista, pana raspunde serverul ───────────────────── */

/** Ce se vede pe ecran: pagina de cereri si numerele din jurul ei. */
export interface StareLista {
  /** Pagina curenta de cereri, gata filtrata. */
  cereri: CerereRetur[];
  /** Cate cereri are magazinul in fiecare stare: numerele de pe file. */
  numarari: Record<string, number>;
  /** Toate cererile magazinului. */
  total: number;
  /** Cate cereri are filtrul curent, pe toate paginile. */
  totalFiltru: number;
}

/** Cele trei schimbari al caror rezultat il stim dinainte, fara sa intrebam serverul. */
export type ActiuneRetur =
  | { tip: "stare"; id: string; stare: StareRetur }
  | { tip: "citit"; id: string; citit: boolean }
  | { tip: "sterge"; id: string };

const scade = (n: number | undefined) => Math.max(0, (n ?? 0) - 1);

/**
 * Lista asa cum va arata dupa ce serverul face ce i s-a cerut. Se vede pe loc; cand vine
 * raspunsul, pagina adusa de server ii ia locul.
 *
 * ⚠ NUMERELE SE MISCA ODATA CU RANDUL. O cerere aprobata din fila „Noi" pleaca din lista ei
 * (nu mai e noua), iar „Noi" scade si „Aprobate" creste in aceeasi clipa. Altfel, pana la
 * raspuns, fila ar spune un numar si lista ar avea altul.
 *
 * @param filtruStare Fila pe care e omul: „all" sau o stare. O cerere mutata in alta stare
 *   decat cea a filei iese din lista.
 */
export function aplicaActiunea(s: StareLista, a: ActiuneRetur, filtruStare: "all" | StareRetur): StareLista {
  const cerere = s.cereri.find((r) => r.id === a.id);
  if (!cerere) return s;

  if (a.tip === "citit") {
    return { ...s, cereri: s.cereri.map((r) => (r.id === a.id ? { ...r, citit: a.citit } : r)) };
  }

  const veche = cerere.status.cheie;
  if (a.tip === "sterge") {
    return {
      cereri: s.cereri.filter((r) => r.id !== a.id),
      numarari: { ...s.numarari, [veche]: scade(s.numarari[veche]) },
      total: scade(s.total),
      totalFiltru: scade(s.totalFiltru),
    };
  }

  if (a.stare === veche) return s;
  const numarari = { ...s.numarari, [veche]: scade(s.numarari[veche]), [a.stare]: (s.numarari[a.stare] ?? 0) + 1 };
  if (filtruStare !== "all" && filtruStare !== a.stare) {
    return { ...s, cereri: s.cereri.filter((r) => r.id !== a.id), numarari, totalFiltru: scade(s.totalFiltru) };
  }
  return {
    ...s,
    numarari,
    /* O cerere careia i s-a hotarat starea e si citita: la fel scrie si `updateReturnStatus`. */
    cereri: s.cereri.map((r) => (r.id === a.id ? { ...r, citit: true, status: { cheie: a.stare, ...STARI_AFISATE[a.stare] } } : r)),
  };
}
