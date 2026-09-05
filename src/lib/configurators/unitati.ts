/**
 * Unitatile configuratorului, si REGULA DE SCARA a intregului motor.
 *
 * ═══ O SINGURA REGULA, SCRISA AICI ═══
 *
 * Inauntrul motorului **totul e `number` obisnuit, in unitatea de baza**:
 *
 *   - lungimile in MILIMETRI;
 *   - suprafetele in MILIMETRI PATRATI;
 *   - volumele in MILIMETRI CUBI;
 *   - masele in GRAME;
 *   - banii in LEI;
 *   - orice altceva (bucati, caractere) fara unitate.
 *
 * Conversia se face la GRANITA — cand valoarea intra dinspre comerciant sau dinspre
 * cumparator — si niciodata in mijlocul unui calcul.
 *
 * ⚠ DE CE NU EXISTA VIRGULA FIXA, DESI E VORBA DE BANI
 *
 * O prima forma a proiectului tinea numerele „intregi la scara" (2 se pastra ca 20000) si
 * separat limitele campurilor „in unitatea de baza" (2800 mm se pastra ca 2800). Evaluatorul
 * n-avea de unde sti care operand e de care fel, si nici ce scara poarta rezultatul. Pe
 * `latime * 2` ar fi iesit 56.000.000 in loc de 5.600 — un pret de zece mii de ori mai mare.
 *
 * Aici nu exista doua feluri de numere, deci nu exista nici intrebarea. Iar determinismul
 * intre browser si server — singurul motiv pentru care cineva ar vrea virgula fixa — vine din
 * altceva: clientul si serverul ruleaza ACELASI modul, iar `+ - * /` sunt exact specificate in
 * IEEE-754, deci dau bit cu bit acelasi rezultat. De aceea lista de operatori a motorului e
 * inchisa si nu contine functii a caror precizie standardul o lasa la voia implementarii
 * (`pow`, `sqrt` pe cazuri generale, trigonometrie).
 *
 * ⚠ Rotunjirea la bani se face O SINGURA DATA, la iesire, cu `round2` — niciodata intre pasi.
 * `orders.items[].price` ramane NEROTUNJIT dinadins, ca `pret x cantitate` sa dea exact
 * subtotalul comenzii; vezi `order.actions.ts` si `billing/reconcile.ts`.
 */

/** Unitatile de lungime pe care le poate alege comerciantul in interfata. */
export type UnitateLungime = "mm" | "cm" | "m";

/** Unitatile de masa. */
export type UnitateMasa = "g" | "kg";

/** Cate milimetri are o unitate de lungime. Exact, fara zecimale periodice. */
const MM_PER: Record<UnitateLungime, number> = { mm: 1, cm: 10, m: 1000 };

/** Cate grame are o unitate de masa. */
const G_PER: Record<UnitateMasa, number> = { g: 1, kg: 1000 };

export function esteUnitateLungime(v: unknown): v is UnitateLungime {
  return v === "mm" || v === "cm" || v === "m";
}

export function esteUnitateMasa(v: unknown): v is UnitateMasa {
  return v === "g" || v === "kg";
}

/**
 * Lungime -> milimetri.
 *
 * ⚠ Se INMULTESTE cu un intreg, nu se imparte: `2,5 m` da `2500`, nu `2499,9999999999995`.
 * Drumul invers (`inLungime`) imparte, si abia acolo pot aparea zecimale — de aceea el se
 * cheama doar la AFISARE, niciodata inaintea unui calcul.
 */
export function inMilimetri(valoare: number, unitate: UnitateLungime): number {
  return valoare * MM_PER[unitate];
}

/** Milimetri -> unitatea ceruta. Numai pentru afisare. */
export function inLungime(mm: number, unitate: UnitateLungime): number {
  return mm / MM_PER[unitate];
}

/** Masa -> grame. */
export function inGrame(valoare: number, unitate: UnitateMasa): number {
  return valoare * G_PER[unitate];
}

/** Grame -> unitatea ceruta. Numai pentru afisare. */
export function inMasa(g: number, unitate: UnitateMasa): number {
  return g / G_PER[unitate];
}

/** Un milimetru patrat, in metri patrati. */
const MMP_IN_MP = 1_000_000;
/** Un milimetru cub, in metri cubi. */
const MMC_IN_MC = 1_000_000_000;

/**
 * Suprafata in metri patrati, din milimetri patrati.
 *
 * Exista ca functie, si nu ca inmultire scrisa de mana, fiindca pretul pe metru patrat e cel
 * mai des folosit calcul al configuratorului (fototapet, banner, tablou) si a fost scris
 * altfel in fiecare sablon din prima schita. Un singur loc, o singura constanta.
 */
export function mpDinMmp(mmp: number): number {
  return mmp / MMP_IN_MP;
}

/** Volum in metri cubi, din milimetri cubi. */
export function mcDinMmc(mmc: number): number {
  return mmc / MMC_IN_MC;
}

/** Metri liniari din milimetri. */
export function mDinMm(mm: number): number {
  return mm / MM_PER.m;
}

/** Kilograme din grame. */
export function kgDinG(g: number): number {
  return g / G_PER.kg;
}

/**
 * Rotunjirea la bani, aceeasi ca in restul proiectului.
 *
 * ⚠ NU e „jumatate in sus" consecvent, fiindca lucreaza pe binar: `round2(1.005)` da `1,00`,
 * iar `round2(2.675)` da `2,68`. E acceptat dinadins — restul proiectului foloseste exact
 * aceeasi formula (`order.actions.ts`, `cart/pricing.ts`, `billing/reconcile.ts`), si o a doua
 * regula de rotunjire ar fi produs documente care nu se mai reconciliaza.
 *
 * ⚠ Postgres rotunjeste ALTFEL la scrierea intr-o coloana `numeric(10,2)`: acolo regula e
 * „jumatate departe de zero" pe zecimalul exact, deci `1.005` devine `1,01`. Diferenta atinge
 * doar sumele agregate ale comenzii, nu preturile de linie, care stau in `jsonb`.
 */
export function round2(n: number): number {
  return Math.round((Number(n) || 0) * 100) / 100;
}

/**
 * Numarul e folosibil intr-un calcul?
 *
 * `NaN` si `±Infinity` sunt refuzate amandoua: o formula care le produce (impartire la zero,
 * un camp gol citit ca numar) nu are voie sa iasa din motor ca pret. Motorul opreste calculul
 * si spune ca e nevalid, in loc sa duca mai departe o valoare pe care `round2` ar transforma-o
 * tacut in `0` — iar zero, la pret, inseamna marfa data pe gratis.
 */
export function eNumarBun(n: unknown): n is number {
  return typeof n === "number" && Number.isFinite(n);
}
