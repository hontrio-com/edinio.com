/**
 * ═══════════════════════════════════════════════════════════════════════════
 * DE CÂND PÂNĂ CÂND ȚINE UN COD                                 (21.09.2026)
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * ⚠⚠ ZIUA PE CARE O SCRIE COMERCIANTUL E O ZI ROMÂNEASCĂ, nu una UTC.
 *
 * Ce era, și e un defect măsurat, nu o închipuire: formularul trimitea
 * „2026-08-31”, Postgres îl citea pe ceasul lui (verificat: `TimeZone` = UTC pe
 * proiect) și punea în coloană `2026-08-31 00:00:00+00`. Adică ora 03:00
 * dimineața, ora României, în CHIAR ziua aceea. Comerciantul care scria „ține
 * până pe 31 august” pierdea douăzeci și una de ore din ultima zi, iar codul
 * murea în somn.
 *
 * `starts_at` moștenea exact aceeași capcană, pe dos: un cod pus să pornească
 * „pe 1 octombrie” ar fi pornit pe 30 septembrie, la 21:00.
 *
 * ⚠ DE-AIA ZIUA SE PREFACE ÎN CLIPĂ AICI, o singură dată, și se scrie în bază
 * clipa exactă:
 *     de când  = 00:00:00,000 ora României, în ziua aleasă
 *     până când = 23:59:59,999 ora României, în ziua aleasă
 *
 * Așa, cele două ceasuri care judecă un cod — cel al procesului Node, în
 * `validateDiscount`, și `now()` al Postgresului, în `claim_discount_use` — se
 * uită la aceeași clipă și nu se mai pot certa decât pe milisecunde de rețea.
 *
 * ⚠ ORA DE VARĂ SE SOCOTEȘTE SINGURĂ. Decalajul nu e scris nicăieri ca „+3”:
 * se citește din chiar fusul, la clipa aceea. Un cod care pornește pe 25
 * octombrie, noaptea schimbării, pornește la miezul nopții adevărat.
 */

const ZI = /^\d{4}-\d{2}-\d{2}$/;

/**
 * Ceasul românesc, citit bucată cu bucată.
 *
 * ⚠ `hour12: false` poate da „24” pentru miezul nopții, după versiunea de ICU —
 * de-aia `% 24`. Fără el, miezul nopții ar fi ieșit cu o zi mai încolo, și numai
 * pe unele mașini.
 */
const CEASUL = new Intl.DateTimeFormat("en-CA", {
  timeZone: "Europe/Bucharest",
  hour12: false,
  year: "numeric", month: "2-digit", day: "2-digit",
  hour: "2-digit", minute: "2-digit", second: "2-digit",
});

/** Cu cât e înaintea UTC-ului ceasul românesc, la clipa dată (milisecunde). */
function decalajul(ms: number): number {
  const p: Record<string, string> = {};
  for (const x of CEASUL.formatToParts(new Date(ms))) p[x.type] = x.value;
  const caUtc = Date.UTC(
    Number(p.year), Number(p.month) - 1, Number(p.day),
    Number(p.hour) % 24, Number(p.minute), Number(p.second),
  );
  /* Părțile nu poartă milisecunde, deci se scade clipa tăiată la secundă. */
  return caUtc - Math.floor(ms / 1000) * 1000;
}

/**
 * Clipa exactă a unui moment din ceasul românesc.
 *
 * ⚠ DOUĂ TRECERI, nu una. Decalajul se cere la o clipă, iar clipa se află din
 * decalaj: în noaptea schimbării orei, prima ghicire cade de partea greșită a
 * graniței. A doua trecere o așază la loc. Mai mult de două nu trebuie: după
 * corecție, clipa e deja în aceeași parte a graniței cu ea însăși.
 */
function clipaRomaneasca(zi: string, ore: number, minute: number, secunde: number, milisecunde: number): Date {
  const [an, luna, ziua] = zi.split("-").map(Number);
  const tinta = Date.UTC(an, luna - 1, ziua, ore, minute, secunde, milisecunde);
  let t = tinta - decalajul(tinta);
  t = tinta - decalajul(t);
  return new Date(t);
}

/** E o zi scrisă „YYYY-MM-DD”, și chiar există în calendar? */
export function ziValida(zi: string | null | undefined): zi is string {
  if (!zi || !ZI.test(zi)) return false;
  const [an, luna, ziua] = zi.split("-").map(Number);
  if (luna < 1 || luna > 12 || ziua < 1 || ziua > 31) return false;
  /*
    ⚠ `Date.UTC` nu se plânge de 31 februarie, o rostogolește în 3 martie. De-aia
    se face drumul înapoi și se cere aceeași zi: altfel o dată inventată ar fi
    intrat în bază ca altceva decât a scris omul.
  */
  const d = new Date(Date.UTC(an, luna - 1, ziua));
  return d.getUTCFullYear() === an && d.getUTCMonth() === luna - 1 && d.getUTCDate() === ziua;
}

/** Începutul zilei românești, ca text ISO pentru bază. `null` la o zi lipsă. */
export function inceputulZilei(zi: string | null | undefined): string | null {
  if (!ziValida(zi)) return null;
  return clipaRomaneasca(zi, 0, 0, 0, 0).toISOString();
}

/** Sfârșitul zilei românești, ca text ISO pentru bază. `null` la o zi lipsă. */
export function sfarsitulZilei(zi: string | null | undefined): string | null {
  if (!ziValida(zi)) return null;
  return clipaRomaneasca(zi, 23, 59, 59, 999).toISOString();
}

/**
 * Ziua românească în care cade o clipă.
 *
 * ⚠ ASTA E DRUMUL ÎNAPOI CĂTRE FORMULAR, și nu se poate face cu `slice(0, 10)`.
 * Un cod care pornește pe 1 octombrie e păstrat ca `2026-09-30T21:00:00Z`;
 * tăiat cu `slice`, formularul ar fi arătat „30 septembrie” — cu o zi mai
 * devreme decât a scris omul, de fiecare dată când deschide editarea.
 */
export function ziuaClipei(iso: string | null | undefined): string | null {
  if (!iso) return null;
  const t = new Date(iso).getTime();
  if (!Number.isFinite(t)) return null;
  const p: Record<string, string> = {};
  for (const x of CEASUL.formatToParts(new Date(t))) p[x.type] = x.value;
  return `${p.year}-${p.month}-${p.day}`;
}

/** Ziua de azi, ora României — pentru `min` pe câmpurile de dată. */
export function ziuaDeAzi(acum: Date = new Date()): string {
  return ziuaClipei(acum.toISOString())!;
}

/**
 * Ce înseamnă, în cuvinte, cele două zile alese.
 *
 * ⚠ SE SCRIE ȘI ORA, nu doar ziua. „De la 1 octombrie” nu spune de la ce oră,
 * iar răspunsul — miezul nopții, ora României — e chiar lucrul care era greșit
 * până azi. Comerciantul care programează o campanie de Black Friday trebuie să
 * știe dacă începe la miezul nopții sau dimineața, fiindcă își scrie emailurile
 * după asta.
 */
export function descriePerioada(
  deCand: string | null | undefined,
  panaCand: string | null | undefined,
): string {
  const de = ziValida(deCand) ? zileleRo(deCand) : null;
  const pana = ziValida(panaCand) ? zileleRo(panaCand) : null;

  if (!de && !pana) return "Merge de acum, până îl oprești tu.";
  if (de && !pana) return `Pornește singur pe ${de}, la miezul nopții, și merge până îl oprești tu.`;
  if (!de && pana) return `Merge de acum până pe ${pana}, inclusiv — toată ziua aceea.`;
  return `Pornește pe ${de} la miezul nopții și ține până pe ${pana}, inclusiv — toată ziua aceea.`;
}

const LUNILE = [
  "ianuarie", "februarie", "martie", "aprilie", "mai", "iunie",
  "iulie", "august", "septembrie", "octombrie", "noiembrie", "decembrie",
];

/**
 * Ziua scrisă românește, din chiar textul „YYYY-MM-DD”.
 *
 * ⚠ NU se trece prin `new Date(zi)`: acolo s-ar fi întors exact capcana de fus
 * pe care fișierul ăsta o închide. Aici nu e nicio clipă de convertit — sunt
 * trei numere pe care omul le-a scris.
 */
function zileleRo(zi: string): string {
  const [an, luna, ziua] = zi.split("-").map(Number);
  return `${ziua} ${LUNILE[luna - 1]} ${an}`;
}

/**
 * Perioada cerută de comerciant, gata de scris în bază.
 *
 * ⚠ SE REFUZĂ O PERIOADĂ ÎNTOARSĂ. „De pe 10, până pe 3” nu e o campanie, e o
 * greșeală de tastare — și, scrisă așa, ar fi dat un cod pe care ecranul îl
 * arată „Programat” și care nu pornește niciodată. Mai bine o oprire în
 * formular decât un cod mort pe care comerciantul îl caută o săptămână.
 */
export function perioadaCodului(
  deCand: string | null | undefined,
  panaCand: string | null | undefined,
): { starts_at: string | null; expires_at: string | null } | { error: string } {
  const de = inceputulZilei(deCand);
  const pana = sfarsitulZilei(panaCand);

  if (deCand && de === null) return { error: "Data de început nu e o dată validă." };
  if (panaCand && pana === null) return { error: "Data de sfârșit nu e o dată validă." };

  if (de !== null && pana !== null && new Date(de) > new Date(pana)) {
    return { error: "Data de început e după cea de sfârșit. Schimbă-le între ele." };
  }

  return { starts_at: de, expires_at: pana };
}
