import type { Verdict } from "@/lib/operatii/eroare-furnizor";

/**
 * A INTRAT PLATA, SAU NU? Hotararea, scoasa afara ca sa poata fi probata cu mesaje adevarate.
 * ══════════════════════════════════════════════════════════════════════════ (02.09.2026)
 *
 * Statea in `olx.actions.ts`, adica intr-un modul `"use server"`, unde nu se poate proba altfel
 * decat scanand sursa. Si asa a si fost pazita: proba verifica doar ca lista ALBA exista si ca nu
 * contine cuvantul „unknown". Nu i-a dat niciodata un mesaj real — iar daca i-ar fi dat, ar fi
 * gasit ca cel mai obisnuit refuz de la OLX nu se potrivea cu niciun tipar din ea.
 *
 * ═══ TRADUCEREA NOASTRA OMORA LISTA ALBA ═══
 *
 * Se arunca `new Error(mapPaymentError(res.error))` — textul deja tradus in romana — iar lista se
 * confrunta tocmai cu textul ala. Trei din sase tipare nu se puteau potrivi niciodata:
 *
 *     ei: „not enough credits"      -> noi: „Sold insuficient pe contul OLX…"
 *     ei: „invalid payment method"  -> noi: „Metoda de plata selectata nu este disponibila…"
 *     ei: „postpaid not activated"  -> noi: „Plata pe factura nu este activata…"
 *
 * ⚠ SI ASTA E CALEA CEA MAI UMBLATA. Soldul insuficient e refuzul obisnuit. Neprins, verdictul
 * iesea `necunoscut`, slotul RAMANEA blocat, iar omul care alimenta portofelul si apasa din nou
 * primea „O cumparare identica e deja in curs". Fund de sac pe drumul cel mai des — si de cand
 * cheia poarta intentia in loc de zi, unul care nu se mai desface peste noapte.
 */

/**
 * ⚠ LISTA E ALBA, NU NEAGRA. Se numesc situatiile in care ei ne-au spus limpede ca n-au facut
 * nimic; orice altceva ramane `necunoscut`.
 *
 * Prima varianta cauta si `unknown`. Dar „Unknown error" spune exact pe dos: SERVERUL nu stie ce
 * s-a intamplat. Eliberat pe un mesaj ca acela, slotul lasa a doua apasare sa treaca — si plata se
 * face de doua ori, tocmai in cazul in care nimeni nu stie daca prima a intrat.
 */
export const REFUZ_LIMPEDE = [
  /insufficient\s+(funds|credits|balance)/i,
  /not\s+enough\s+(funds|credits|money|balance)/i,
  /invalid\s+payment\s+method/i,
  /payment\s+method\s+not\s+(allowed|supported|available)/i,
  /postpaid\s+not\s+activated/i,
  /fonduri\s+insuficiente/i,
];

/**
 * Codurile prin care ei spun „am respins cererea", deci nimic nu s-a intamplat.
 *
 * ⚠ NU SUNT AICI: `408` si `429` (cererea poate sa fi ajuns si sa se fi executat), `409` (un
 * conflict inseamna adesea ca lucrul EXISTA deja), `5xx` si `0` (caderea de retea din `call`).
 * Acolo indoiala se plateste cu o intrebare, nu cu inca o plata.
 *
 * ⚠ Si codul cantareste mai mult decat textul: textul lor se schimba cand vor ei, codul nu.
 */
export const CODURI_DE_REFUZ = new Set([400, 401, 402, 403, 404, 422]);

/** Ce a raspuns OLX, asa cum a raspuns EL. `status: 0` inseamna ca n-am ajuns la ei. */
export interface RaspunsDePlata {
  /** Textul LOR, netradus. Traducerea se face separat, pentru ecran. */
  brut: string;
  status: number;
}

export function verdictulPlatii(r: RaspunsDePlata): Verdict {
  if (CODURI_DE_REFUZ.has(r.status)) return "esuat";
  return REFUZ_LIMPEDE.some((x) => x.test(r.brut)) ? "esuat" : "necunoscut";
}
