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

/**
 * Ce lipseste ca sa poti expedia comanda cu mijloacele tale. Gol inseamna „se poate".
 *
 * Ordinea e cea in care le completeaza omul in formular, ca mesajul sa se citeasca firesc.
 */
export function lipsuriLivrare(c: ComandaPepita): string[] {
  /* Livrarea Pepitei nu cere nimic de la noi: coletul pleaca cu eticheta lor. */
  if (esteLivrarePepita(c.modLivrare)) return [];

  const l = c.client.livrare;
  const f = c.client.facturare;
  const lipsuri: string[] = [];

  const nume = [c.client.prenume, c.client.nume].filter(Boolean).join(" ").trim() || (c.client.facturare.nume ?? "");
  if (!nume.trim()) lipsuri.push("numele clientului");
  if (!areTelefon(c.client.telefon)) lipsuri.push("telefonul");

  /* ⚠ „only for Romanian orders", scrie in documentatia lor: pe alte piete judetul lipseste pe drept. */
  if (eRomania(l.tara ?? f.tara) && !(l.judet ?? "").trim()) lipsuri.push("județul");

  /* Aceleasi doua caderi pe facturare ca in `adresaLivrare`: datele le avem, doar in alt camp. */
  if (!((l.oras ?? f.oras) ?? "").trim()) lipsuri.push("localitatea");
  const strada = l.strada ?? ([l.numeStrada, l.numar].filter(Boolean).join(" ") || null)
    ?? f.strada ?? ([f.numeStrada, f.numar].filter(Boolean).join(" ") || null);
  if (!(strada ?? "").trim()) lipsuri.push("strada");

  return lipsuri;
}

/** Motivul de carantina pentru o comanda pe care nu o poti expedia. `null` daca nu lipseste nimic. */
export function motivNelivrabila(lipsuri: string[]): string | null {
  if (lipsuri.length === 0) return null;
  const ce = lipsuri.join(", ");
  return lipsuri.length === 1
    ? `Nu se poate expedia: lipsește ${ce}.`
    : `Nu se poate expedia: lipsesc ${ce}.`;
}
