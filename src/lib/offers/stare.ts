/**
 * ═══════════════════════════════════════════════════════════════════════════
 * ÎN CE STARE E O OFERTĂ                                        (22.09.2026)
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * Până acum ecranul arăta DOUĂ stări, și una singură pe ecran: o etichetă
 * cenușie „Inactiv” când comutatorul era stins. Atât. O ofertă a cărei perioadă
 * a trecut arăta exact ca una care merge.
 *
 * ⚠ REGULA STĂ AICI, ÎNTR-UN SINGUR LOC, fiindcă o vor întreba și lista, și
 * filtrul, și sertarul, și cardurile din cap. Scrisă de patru ori, s-ar fi
 * despărțit — și atunci filtrul „Expirate” ar fi arătat alte oferte decât cele
 * scrise „Expirat” în tabel.
 *
 * ⚠⚠ PATRU STĂRI, NU CINCI. La coduri există și „epuizat”, fiindcă un cod are
 * `max_uses`. O ofertă nu are plafon de utilizări, deci starea aia n-ar fi căzut
 * niciodată pe nimic — iar o opțiune de filtru care nu găsește nimic e o
 * promisiune goală care-l trimite pe om să caute un defect.
 *
 * ⚠ Am cântărit și o a cincea, „incompletă” (o ofertă configurată care nu poate
 * porni: fără produse oferite, sau fără praguri). Măsurat pe producție la
 * 22.09.2026: ZERO oferte din 13 sunt în forma aia, fiindcă formularul le
 * oprește la salvare. Deci nu există — se poate remăsura oricând.
 *
 * ⚠ FIȘIER SEPARAT DE `lib/discounts/stare.ts`, dinadins: cele două au
 * vocabulare deosebite („codul” față de „oferta”), stări deosebite și explicații
 * deosebite. Ce e cu adevărat comun — ziua românească — a fost mutat în
 * `lib/zi-romaneasca.ts` și se cheamă din amândouă.
 */

/** Ce ține o ofertă din a se aprinde acum. `activ` înseamnă că nimic n-o ține. */
export const STARI_OFERTA = ["activ", "oprit", "programat", "expirat"] as const;
export type StareOferta = (typeof STARI_OFERTA)[number];

/** Cât știe regula despre o ofertă. Numai atât — ca să poată fi probată cu numere. */
export interface OfertaDeJudecat {
  is_active: boolean;
  starts_at: string | null;
  ends_at: string | null;
}

function clipa(iso: string | null | undefined): number | null {
  if (!iso) return null;
  const t = new Date(iso).getTime();
  return Number.isFinite(t) ? t : null;
}

/**
 * Starea unei oferte, dintr-o singură privire.
 *
 * ⚠⚠ ORDINEA E CEA A LUCRULUI DE FĂCUT, nu una întâmplătoare. O ofertă poate fi
 * deodată oprită ȘI expirată; pe rând încape o singură etichetă, și trebuie să
 * fie cea care îi spune comerciantului ce are de făcut:
 *
 *   1. `oprit`     comutatorul e pe nu. Se repară dintr-o apăsare, și e singura
 *                  stare pusă de om — deci prima care trebuie știută.
 *   2. `expirat`   a trecut data. Se repară schimbând data.
 *   3. `programat` nu e nimic de reparat: pornește singură.
 *   4. `activ`     nimic n-o ține.
 *
 * ⚠ Aceeași ordine ca la coduri, și de-aia: comerciantul vede amândouă ecranele.
 */
export function stareaOfertei(o: OfertaDeJudecat, acum: number = Date.now()): StareOferta {
  if (!o.is_active) return "oprit";

  const pana = clipa(o.ends_at);
  if (pana !== null && pana < acum) return "expirat";

  const de = clipa(o.starts_at);
  if (de !== null && de > acum) return "programat";

  return "activ";
}

/** Toate motivele pentru care o ofertă nu merge acum, nu doar primul. */
export function toateMotiveleOfertei(o: OfertaDeJudecat, acum: number = Date.now()): StareOferta[] {
  const out: StareOferta[] = [];
  if (!o.is_active) out.push("oprit");

  const pana = clipa(o.ends_at);
  if (pana !== null && pana < acum) out.push("expirat");

  const de = clipa(o.starts_at);
  if (de !== null && de > acum) out.push("programat");

  return out;
}

/** Se aprinde oferta acum, pentru un cumpărător? */
export function ofertaMergeAcum(o: OfertaDeJudecat, acum: number = Date.now()): boolean {
  return toateMotiveleOfertei(o, acum).length === 0;
}

/**
 * Tonul fiecărei stări, pentru `EtichetaStare`.
 *
 * ⚠ SE TRECE TONUL, NU CULOAREA. Ecranele spun „stare de așteptare”, nu
 * „galben”: dacă mâine „Programat” trebuie să arate altfel, se schimbă într-un
 * singur loc, în `eticheta-stare.tsx`.
 *
 * ⚠ „Oprit” e NEUTRU, nu roșu: o ofertă pe care comerciantul a închis-o
 * dinadins nu e un defect. Roșul rămâne pentru ce s-a terminat fără voia lui.
 *
 * ⚠ Aceleași tonuri ca la coduri, pentru cele patru stări comune. Cine vede
 * ambele ecrane trebuie să citească aceeași culoare cu același înțeles.
 */
export const TONUL_STARII_OFERTA = {
  activ: "bun",
  oprit: "neutru",
  programat: "info",
  expirat: "rau",
} as const;

export const DESPRE_STAREA_OFERTEI: Record<StareOferta, { text: string; explicatie: string }> = {
  activ: {
    text: "Activă",
    explicatie: "Se arată cumpărătorilor chiar acum.",
  },
  oprit: {
    text: "Oprită",
    explicatie: "Ai oprit-o tu din comutator. Pornește-o la loc ca să se vadă din nou.",
  },
  programat: {
    text: "Programată",
    explicatie: "Pornește singură la data pe care ai pus-o. Până atunci nu se arată nimănui.",
  },
  expirat: {
    text: "Expirată",
    explicatie: "A trecut data până la care era valabilă. Schimbă data ca să meargă din nou.",
  },
};
