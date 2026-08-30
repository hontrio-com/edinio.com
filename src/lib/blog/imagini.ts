/**
 * Ce adrese de imagine primim de la editor.
 *
 * ⚠ STĂ ÎNTR-UN FIȘIER PROPRIU CA SĂ POATĂ FI PROBATĂ.
 *
 * Era în `blog.actions.ts`, care are `"use server"` — iar de acolo se pot
 * exporta numai funcții asincrone, deci un ajutor sincron nu putea ieși ca să fie
 * pus față în față cu adevărul. Iar tocmai el hotărăște ce intră în pagină.
 */

/** Gazdele de la care acceptăm imagini, citite din mediu la fiecare folosire. */
function gazdeleNoastre(): string[] {
  const din = (a: string | undefined) => {
    if (!a) return null;
    try {
      return new URL(a).hostname.toLowerCase();
    } catch {
      return null;
    }
  };
  return [din(process.env.R2_PUBLIC_URL), din(process.env.NEXT_PUBLIC_CDN_URL)].filter(
    (g): g is string => !!g,
  );
}

export type AdresaDeImagine = { ok: true; adresa: string | null } | { ok: false; motiv: string };

/**
 * E o adresă de imagine de la noi?
 *
 * ⚠ ACȚIUNEA DE SERVER E O ADRESĂ POST, NU UN FORMULAR.
 *
 * Imaginile din CORPUL articolului treceau deja prin curățător, care acceptă doar
 * gazdele noastre. Coperta și imaginea de partajare nu treceau prin nimic: erau
 * verificate doar ca lungime. Ecranul obișnuit trimite mereu o adresă proprie,
 * fiindcă poza se încarcă la noi — dar o cerere scrisă de mână putea pune orice
 * adresă externă, iar de acolo ies două lucruri:
 *
 *   * un pixel care raportează altcuiva cine ne citește articolele;
 *   * o copertă care dispare în ziua în care gazda străină o șterge, fără ca
 *     nimeni de la noi să afle.
 *
 * ⚠ NU SE ACCEPTĂ ORICE `*.r2.dev`, deși `r2-url.ts` o face. Acolo întrebarea e
 * alta — „e obiectul ăsta al nostru, ca să-l putem șterge?" — și acolo o plasă
 * largă e bună. Aici întrebarea e „primim asta de la cineva?", iar `r2.dev` e
 * domeniul public pe care Cloudflare îl dă oricărei găleți, a oricui.
 *
 * ⚠ GOLUL E ÎNGĂDUIT: amândouă câmpurile sunt opționale.
 */
export function adresaDeImagine(brut: string | null | undefined, camp: string): AdresaDeImagine {
  const v = (brut ?? "").trim();
  if (!v) return { ok: true, adresa: null };

  /* `//gazda/poza.png` începe cu `/` dar duce în altă parte: e o adresă cu
     protocol moștenit. Aceeași capcană ca la curățător, deci același răspuns. */
  if (v.startsWith("//")) return { ok: false, motiv: `${camp} nu e o adresă de la noi.` };

  /* O cale din `public/`, deci a noastră. */
  if (v.startsWith("/")) return { ok: true, adresa: v };

  let u: URL;
  try {
    u = new URL(v);
  } catch {
    return { ok: false, motiv: `${camp} nu e o adresă validă.` };
  }

  if (u.protocol !== "https:") {
    return { ok: false, motiv: `${camp} trebuie să fie o adresă https.` };
  }

  const gazda = u.hostname.toLowerCase();
  const aNoastra =
    gazdeleNoastre().includes(gazda) || gazda === "edinio.com" || gazda.endsWith(".edinio.com");

  if (!aNoastra) {
    return {
      ok: false,
      motiv: `${camp} trebuie să fie o imagine încărcată la noi, nu una de pe alt site.`,
    };
  }

  return { ok: true, adresa: u.toString() };
}
