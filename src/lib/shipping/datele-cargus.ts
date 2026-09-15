/**
 * Datele, in formatele pe care le cere FIECARE ruta Cargus.
 *
 * ═══ ⚠ DOUA FORMATE IN ACELASI API, SI NU E O GLUMA ═══
 *
 * Documentatia lor V3 le scrie una sub alta, in doua capitole vecine:
 *
 *     AwbTrace/GetDeltaEvents:  FromDate - from date (format :mm-dd-yyyy)
 *     CashAccount/GetByDate:    FromDate - start date in yyyy-mm-dd format
 *
 * Prima e americana, a doua e ISO. Trimise invers, cele doua nu dau eroare: `03-11-2026`
 * citit ca ISO e o data valida (11 martie), iar `2026-03-11` citit american e tot o data
 * valida. Deci intervalul cerut e ALTUL decat cel vrut, raspunsul vine gol sau strain, si
 * cronul raporteaza linistit „zero de verificat". Vezi `zero-randuri-nu-e-succes`.
 *
 * ⚠ De-aia cele doua au NUME diferite aici, si nu un parametru care se poate uita.
 */

function bucati(d: Date): { an: string; luna: string; zi: string } {
  return {
    an: String(d.getUTCFullYear()),
    luna: String(d.getUTCMonth() + 1).padStart(2, "0"),
    zi: String(d.getUTCDate()).padStart(2, "0"),
  };
}

/** `mm-dd-yyyy`, cum cere `AwbTrace/GetDeltaEvents`. */
export function dataEvenimentelorCargus(d: Date): string {
  const { an, luna, zi } = bucati(d);
  return `${luna}-${zi}-${an}`;
}

/** `yyyy-mm-dd`, cum cere `CashAccount/GetByDate`. */
export function dataRambursurilorCargus(d: Date): string {
  const { an, luna, zi } = bucati(d);
  return `${an}-${luna}-${zi}`;
}

/**
 * O data de-a lor, adusa la ziua ISO pe care o cere coloana din baza.
 *
 * ⚠ Ei trimit si `2026-03-11T00:00:00`, si `2026-03-11`, si uneori nimic. Se taie la zi si
 * atat: ora unui decont nu inseamna nimic, iar o data neinteleasa nu se inventeaza.
 */
export function ziuaLorCargus(x: unknown): string | null {
  if (typeof x !== "string") return null;
  const m = x.trim().match(/^(\d{4})-(\d{2})-(\d{2})/);
  return m ? `${m[1]}-${m[2]}-${m[3]}` : null;
}
