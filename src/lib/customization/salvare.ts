import {
  MAX_CAMPURI, MAX_OPTIUNI, normalizeazaDefinitia,
} from "./definitie";

/**
 * Poarta de SCRIERE a personalizarii: ce salveaza comerciantul se si serveste, sau afla de ce nu.
 *
 * ═══ ⚠ SE RAPORTEAZA, NU SE REPARA ═══
 *
 * Cititorul (`normalizeazaDefinitia`) e bland dinadins: nu arunca niciodata, si trece peste ce nu
 * intelege. Purtarea aia apara CITIREA — un `page_sections` scris strambe, de orice drum, n-are
 * voie sa opreasca o vanzare.
 *
 * Dar la SCRIERE aceeasi blandete devine tacere. Comerciantul adauga al 31-lea camp, primeste
 * „Salvat", si vitrina serveste 30 — fara ca ceva pe ecran sa spuna care lipseste. Sau pune
 * tarifele pe optiuni si lasa caseta „Tarif lei/m²" pe 0: modul „pe suprafata" cade inapoi pe
 * „adaugat", ecranul arata un fel de pretuire, si se incaseaza altul.
 *
 * ⚠ NICI FORMA NORMALIZATA NU SE SCRIE IN BAZA. Ar fi atins cele 29 de randuri existente si ar fi
 * stricat exact proprietatea pentru care poarta sta la citire. Se scrie ce a trimis omul; i se
 * spune doar cand ce a trimis nu se poate servi intreg.
 *
 * ⚠ Sta in modulul PUR, nu langa actiunea de server, si nu din gust: `product.actions.ts` e
 * „use server", iar acolo FIECARE export e un capat public — deci functia n-ar fi putut fi
 * exportata ca s-o probeze cineva.
 */

/** Un obiect simplu — nu null, nu tablou. */
function esteObiectSimplu(x: unknown): x is Record<string, unknown> {
  return !!x && typeof x === "object" && !Array.isArray(x);
}

export function problemaPersonalizarii(pageSections: unknown): string | null {
  const ps = esteObiectSimplu(pageSections) ? pageSections : null;
  const brut = ps?.customization;
  if (!esteObiectSimplu(brut) || brut.enabled !== true) return null;

  const campuriTrimise = Array.isArray(brut.fields) ? brut.fields : [];
  if (campuriTrimise.length === 0) return null;

  const citita = normalizeazaDefinitia(brut);
  if (!citita) {
    return "Personalizarea e pornita, dar niciun camp nu se poate folosi. Fiecare camp are nevoie"
      + " de un tip cunoscut si de un nume propriu.";
  }

  if (campuriTrimise.length > MAX_CAMPURI) {
    return `Personalizarea accepta cel mult ${MAX_CAMPURI} campuri; ai ${campuriTrimise.length}.`;
  }
  if (citita.fields.length < campuriTrimise.length) {
    const cate = campuriTrimise.length - citita.fields.length;
    return (cate === 1
      ? "Un camp de personalizare nu se poate folosi"
      : `${cate} campuri de personalizare nu se pot folosi`)
      + " — verifica sa aiba fiecare un tip cunoscut, si un nume care nu se repeta.";
  }

  for (const camp of citita.fields) {
    const trimis = campuriTrimise.find((f) => esteObiectSimplu(f) && f.id === camp.id);
    const optiuniTrimise =
      esteObiectSimplu(trimis) && Array.isArray(trimis.optiuni) ? trimis.optiuni : null;
    if (!optiuniTrimise) continue;
    if (optiuniTrimise.length > MAX_OPTIUNI) {
      return `Campul „${camp.label}” accepta cel mult ${MAX_OPTIUNI} optiuni;`
        + ` ai ${optiuniTrimise.length}.`;
    }
    if ((camp.optiuni ?? []).length < optiuniTrimise.length) {
      return `Campul „${camp.label}” are optiuni care nu se pot folosi — fiecare are nevoie de un`
        + " nume propriu, care nu se repeta.";
    }
  }

  /*
   * ⚠ MODUL DE PRET CAZUT INAPOI e cel mai scump caz din functia asta, fiindca e SINGURUL care
   * schimba banii fara sa schimbe nimic pe ecran: comerciantul vede „Calculat din suprafata", si
   * se incaseaza pretul de catalog. Vezi `citestePret` pentru cele cinci conditii.
   */
  const felTrimis = esteObiectSimplu(brut.pret) ? brut.pret.fel : undefined;
  if (felTrimis === "suprafata" && citita.pret?.fel !== "suprafata") {
    return "Pretul pe suprafata nu se poate aplica asa. Ai nevoie de: un camp de dimensiuni ales,"
      + " cu margini (sau cu o suprafata minima facturabila), si un tarif mai mare ca zero — fie in"
      + " casuta „Tarif lei/m²”, fie pe FIECARE optiune a campului care da tariful.";
  }
  return null;
}
