import type { ComandaPepita } from "./comanda-forma";
import { esteLivrarePepita } from "./mapare";

/**
 * Motivele carantinei, si ce inseamna „comanda asta nu se poate expedia asa cum a venit".
 *
 * ═══ ⚠ DE CE MOTIVELE SE ADUNA, NU SE INLOCUIESC ═══
 *
 * Ingestul scria motivul in doua locuri deosebite: intai „coduri fara corespondent", apoi,
 * daca scaderea stocului cadea, `motiv: MOTIV_STOC_NEFACUT` peste el. Al doilea il STERGEA pe
 * primul. Iar cronul de stoc scoate din carantina randurile al caror motiv e EXACT motivul de
 * stoc: deci o comanda cu linii nelegate SI stoc nescazut ar fi iesit din carantina cu
 * problema dintai nerezolvata, adica ar fi disparut din lista comerciantului.
 *
 * De aceea motivele se leaga cu un semn anume, iar cronul isi scoate doar bucata lui.
 */

/** Semnul dintre motive. Ales ca sa nu apara in text scris de om. */
const LEGATURA = " | ";

/** Cat incape in coloana. */
const MAX = 500;

/**
 * Lipeste motivele intr-unul singur.
 *
 * ⚠ Cu un singur motiv INTOARCE EXACT sirul acela. De asta atarna randurile deja aflate in
 * carantina in productie: schimbat, cronul nu si-ar mai recunoaste propriul motiv si nu le-ar
 * mai scoate niciodata.
 */
export function compuneMotiv(parti: (string | null | undefined)[]): string | null {
  const bune = parti.map((p) => (p ?? "").trim()).filter(Boolean);
  if (bune.length === 0) return null;
  return bune.join(LEGATURA).slice(0, MAX);
}

/**
 * Scoate o bucata din motiv si intoarce ce ramane (sau `null`, daca nu mai ramane nimic).
 *
 * ⚠ Nu e o comparatie pe egalitate: cronul de stoc trebuie sa poata scoate DOAR bucata lui
 * dintr-un motiv compus, si sa lase comanda in carantina daca mai ramane ceva de rezolvat.
 */
export function scoateBucata(motiv: string | null | undefined, bucata: string): string | null {
  if (!motiv) return null;
  const ramase = motiv.split(LEGATURA).map((p) => p.trim()).filter((p) => p && p !== bucata.trim());
  return ramase.length ? ramase.join(LEGATURA) : null;
}

/* ═══════════════════════════════════════════════════════════════════════════
   COMANDA CARE NU SE POATE EXPEDIA
   ═══════════════════════════════════════════════════════════════════════════

   ⚠ REGULA E „CE-TI TREBUIE CA SA O EXPEDIEZI TU", nu „ce campuri sunt goale".

   La `gls` si `gls_parcelshop` coletul e dus de GLS-ul contractat de PEPITA, cu eticheta lor:
   comerciantul doar il preda. Acolo o adresa incompleta nu opreste nimic, iar la automatul de
   colet nici nu primim identificatorul punctului, deci adresa POATE lipsi pe drept.

   La curier propriu (`shipping`, `mpl`, sau un mod necunoscut) comerciantul emite el AWB-ul,
   si fara telefon sau fara strada acesta nu poate pleca. Aia e o comanda pe care nu o poti
   duce la capat, si a raspunde „importata" pentru ea inseamna sa o ascunzi pana cand clientul
   intreaba unde e coletul.

   ⚠ CODUL POSTAL NU INTRA IN LISTA, dinadins: checkout-ul propriu il cere doar la comenzile
   internationale, iar Pepita nu il trimite mereu. Ramane un risc stiut la eColet, care il cere
   la fiecare adresa; acolo cotarea se intoarce fara oferte, si asta se vede la emitere.
*/

/** Cate cifre are cel mai scurt numar de telefon adevarat. Sub atat e altceva. */
const CIFRE_TELEFON = 7;

function areTelefon(t: string): boolean {
  return (t.match(/\d/g) ?? []).length >= CIFRE_TELEFON;
}

/** Tara e romaneasca (sau nespusa, ceea ce pentru un magazin din Romania inseamna la fel). */
function eRomania(tara: string | null): boolean {
  const t = (tara ?? "").trim().toUpperCase();
  return t === "" || t === "RO" || t === "ROU" || t === "ROMANIA" || t === "ROMÂNIA";
}

/** Campurile de care atarna hotararea, oricare ar fi izvorul lor. */
export interface CampuriLivrare {
  nume: string;
  telefon: string;
  judet: string;
  oras: string;
  strada: string;
  tara: string;
  /** Coletul e dus de GLS-ul contractat de Pepita: atunci nu se cere nimic. */
  livrarePepita: boolean;
}

/**
 * Ce lipseste ca sa poti expedia comanda cu mijloacele tale. Gol inseamna „se poate".
 *
 * Ordinea e cea in care le completeaza omul in formular, ca mesajul sa se citeasca firesc.
 *
 * ⚠ SOCOTEALA E PE CAMPURI, NU PE SARCINA LOR, fiindca se pune aceeasi intrebare de doua ori,
 * din doua locuri: la sosire, despre ce ne-au trimis ei, si la reprocesare, despre comanda
 * asa cum arata ACUM, dupa ce comerciantul a completat-o de mana. Doua socoteli apropiate ar
 * fi ajuns sa raspunda diferit, si atunci butonul „Reprocesează" n-ar mai fi scos comanda din
 * carantina niciodata.
 */
export function lipsuriDinCampuri(c: CampuriLivrare): string[] {
  if (c.livrarePepita) return [];

  const lipsuri: string[] = [];
  if (!c.nume.trim()) lipsuri.push("numele clientului");
  if (!areTelefon(c.telefon)) lipsuri.push("telefonul");
  /* ⚠ „only for Romanian orders", scrie in documentatia lor: pe alte piete judetul lipseste pe drept. */
  if (eRomania(c.tara) && !c.judet.trim()) lipsuri.push("județul");
  if (!c.oras.trim()) lipsuri.push("localitatea");
  if (!c.strada.trim()) lipsuri.push("strada");
  return lipsuri;
}

/** Lipsurile, citite din sarcina primita de la ei. */
export function lipsuriLivrare(c: ComandaPepita): string[] {
  const l = c.client.livrare;
  const f = c.client.facturare;
  /* Aceleasi caderi pe facturare ca in `adresaLivrare`: datele le avem, doar in alt camp. */
  return lipsuriDinCampuri({
    nume: [c.client.prenume, c.client.nume].filter(Boolean).join(" ").trim() || (f.nume ?? ""),
    telefon: c.client.telefon,
    judet: l.judet ?? "",
    oras: l.oras ?? f.oras ?? "",
    strada: l.strada ?? ([l.numeStrada, l.numar].filter(Boolean).join(" ") || null)
      ?? f.strada ?? ([f.numeStrada, f.numar].filter(Boolean).join(" ") || "") ?? "",
    tara: l.tara ?? f.tara ?? "",
    livrarePepita: esteLivrarePepita(c.modLivrare),
  });
}

/**
 * Lipsurile, citite din comanda ASA CUM E SCRISA in Edinio.
 *
 * ⚠ Asta e drumul reprocesarii: sarcina bruta nu se pastreaza nicaieri, dinadins (`rezumat`
 * n-are date personale). Dupa ce comerciantul completeaza adresa din „Editează comanda",
 * adevarul e pe comanda, si tot de acolo se citeste.
 */
export function lipsuriComandaScrisa(o: {
  customer_name?: string | null;
  customer_phone?: string | null;
  shipping_address?: unknown;
  order_source?: unknown;
}): string[] {
  const a = (o.shipping_address ?? {}) as {
    address?: unknown; city?: unknown; county?: unknown; country?: unknown;
  };
  const text = (v: unknown) => (typeof v === "string" ? v : "");
  return lipsuriDinCampuri({
    nume: o.customer_name ?? "",
    telefon: o.customer_phone ?? "",
    judet: text(a.county),
    oras: text(a.city),
    strada: text(a.address),
    tara: text(a.country),
    /* ⚠ Semnul e scris pe comanda la ingest; recalculat aici din modul de livrare, ar fi cerut
       sarcina lor, care nu se pastreaza. */
    livrarePepita: (o.order_source as { livrare_pepita?: unknown } | null)?.livrare_pepita === true,
  });
}

/*
 * ⚠ INCEPUTURILE MOTIVELOR, ca sa poata fi RECUNOSCUTE mai tarziu.
 *
 * Reprocesarea recalculeaza motivele pe care le poate afla din nou si le PASTREAZA pe cele pe
 * care nu le poate (moneda necitita, de pilda: sarcina bruta nu se mai are de unde citi). Ca
 * sa le deosebeasca, trebuie sa recunoasca inceputul fiecarui motiv scris de noi. Constantele
 * de aici sunt singurul loc unde sunt scrise.
 */
export const INCEPUT_CODURI = "Coduri fără corespondent în Edinio: ";
export const INCEPUT_NELIVRABILA = "Nu se poate expedia: ";

/** Motivul de carantina pentru liniile pe care nu le-am putut lega de catalog. */
export function motivCoduri(nelegate: string[]): string | null {
  return nelegate.length ? `${INCEPUT_CODURI}${nelegate.join(", ")}` : null;
}

/** Motivul de carantina pentru o comanda pe care nu o poti expedia. `null` daca nu lipseste nimic. */
export function motivNelivrabila(lipsuri: string[]): string | null {
  if (lipsuri.length === 0) return null;
  const ce = lipsuri.join(", ");
  return lipsuri.length === 1
    ? `${INCEPUT_NELIVRABILA}lipsește ${ce}.`
    : `${INCEPUT_NELIVRABILA}lipsesc ${ce}.`;
}

/**
 * Bucatile motivului pe care reprocesarea NU le poate recalcula, deci le pastreaza asa cum sunt.
 *
 * ⚠ Alegerea e „pastreaza ce nu cunosti". Invers, o bucata scrisa maine de altcineva ar fi
 * disparut tacut la prima apasare pe „Reprocesează", si comanda ar fi iesit din carantina cu
 * problema nerezolvata.
 */
export function motiveNerecalculabile(motiv: string | null | undefined, cunoscute: string[]): string[] {
  if (!motiv) return [];
  return motiv.split(LEGATURA).map((p) => p.trim()).filter(Boolean)
    .filter((p) => !cunoscute.some((c) => p === c || p.startsWith(c)));
}
