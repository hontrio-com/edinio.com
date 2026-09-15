import type { WootRamburs } from "@/lib/woot";

/**
 * ═══════════════════════════════════════════════════════════════════════════
 * RAMBURSUL LA WOOT: BANII CUMPARATORULUI, PE DRUMUL INAPOI     (15.09.2026)
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * Masurat in productie pe 15.09.2026: prin Woot au plecat **199 de comenzi cu ramburs**, in
 * valoare de aproape **15.600 lei**, si nimic din platforma nu spunea vreodata daca banii au fost
 * chiar virati inapoi comerciantului. 192 dintre ele stau si azi pe `payment_status = 'unpaid'`.
 *
 * ⚠ SI AICI, SPRE DEOSEBIRE DE STARILE COMENZII, EI CHIAR DOCUMENTEAZA STARILE. Pe campul
 * `status_id` al schemei `Repayment` scrie negru pe alb:
 *
 *     0=Cancelled, 1=Unpicked, 2=Picked up, 3=Paid, 4=External
 *
 * De aceea harta de mai jos NU e ghicita, cum ar fi fost una a starilor de colet (vezi
 * `@/lib/shipping/statusuri-woot`, unde tocmai de asta nu exista niciuna). E citata.
 */

/** Exact lista lor, tradusa pentru comerciant. Cheile sunt numerele LOR. */
export const STARI_RAMBURS_WOOT: Readonly<Record<number, string>> = {
  0: "Anulat",
  1: "Neincasat",
  2: "Incasat de curier",
  3: "Virat",
  4: "Incasat in afara Woot",
};

/** `null` pentru un numar pe care ei nu l-au documentat: nu se inventeaza o eticheta. */
export function etichetaRambursWoot(statusId: number | null | undefined): string | null {
  if (statusId === null || statusId === undefined) return null;
  return STARI_RAMBURS_WOOT[statusId] ?? null;
}

/** Starea „banii au ajuns la comerciant". Numai 3, si numai ea. */
export const RAMBURS_VIRAT = 3;

/**
 * ⚠ DE CE NUMAI 3, SI DE CE NU SI 4.
 *
 * `4=External` e singura din cele cinci al carei inteles nu e limpede din numele lui: „extern"
 * poate insemna incasat pe alt drum decat al lor, sau virat de altcineva. Un ramburs scris drept
 * DECONTARE pe temeiul unei ghiceli ar pune bani in pagina de bani a comerciantului fara ca ei sa
 * fi intrat vreodata in cont. Deci 4 se ARATA pe comanda, cu eticheta lui, dar nu produce niciun
 * rand de decontare. Cand vom sti ce inseamna, se adauga aici, cu masuratoarea langa.
 */
export function eVirat(r: WootRamburs | null | undefined): boolean {
  return Number(r?.status_id) === RAMBURS_VIRAT;
}

/**
 * Ziua in care banii au fost virati, din istoricul rambursului.
 *
 * ⚠ SE IA DIN `history`, NU DIN `updated`. `updated` e ultima atingere a randului, oricare ar fi
 * ea; ziua virarii e momentul in care starea a DEVENIT 3. Pe un ramburs corectat mai tarziu, cele
 * doua difera, iar `transfer_date` e cheie in tabelul de decontari: ziua gresita ar face un al
 * doilea rand pentru aceiasi bani.
 *
 * ⚠ Se ia CEA MAI VECHE intrare cu starea 3: daca randul a trecut de doua ori prin ea, virarea e
 * prima. Si se intoarce doar ziua („2026-09-15"), fiindca `transfer_date` e `date`, nu moment.
 *
 * `null` cand nu se poate afla: atunci randul de decontare NU se scrie deloc, fiindca ziua e
 * obligatorie si o zi inlocuita cu „azi" ar fi o data inventata intr-o pagina de bani.
 */
export function ziuaVirarii(r: WootRamburs | null | undefined): string | null {
  if (!eVirat(r)) return null;

  const zile: string[] = [];
  for (const e of r?.history ?? []) {
    if (Number(e?.status_id) !== RAMBURS_VIRAT) continue;
    const zi = ziISO(e?.added);
    if (zi) zile.push(zi);
  }
  if (zile.length > 0) return zile.sort()[0];

  /* Fara istoric, `updated` e singurul reper. E mai slab, si de aceea vine abia al doilea. */
  return ziISO(r?.updated);
}

/** Suma rambursului, curatata. `null` cand nu e un numar folosibil. */
export function sumaRambursului(r: WootRamburs | null | undefined): number | null {
  const v = Number(r?.value);
  return Number.isFinite(v) && v > 0 ? Math.round(v * 100) / 100 : null;
}

/**
 * „2026-09-15" dintr-un moment scris de ei.
 *
 * ⚠ Se taie SIRUL, nu se trece prin `new Date()`. Ei scriu „2026-09-15T10:00:00", fara fus; citit
 * ca moment si intors inapoi in ziua masinii, un ramburs virat dimineata devreme ar putea aluneca
 * in ziua dinainte, iar `transfer_date` e cheie: ziua mutata inseamna un rand nou pentru aceiasi
 * bani. Tot ce se cere e ca forma sa fie a unei zile.
 */
function ziISO(valoare: unknown): string | null {
  if (typeof valoare !== "string") return null;
  const zi = valoare.trim().slice(0, 10);
  return /^\d{4}-\d{2}-\d{2}$/.test(zi) ? zi : null;
}
