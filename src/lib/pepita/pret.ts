/**
 * Pretul trimis la Pepita: o singura socoteala, chemata din feed si din ecran.
 *
 * ⚠ DE CE INTR-UN SINGUR LOC. Panoul arata comerciantului „pretul pe Pepita", iar
 * feedul il trimite. Doua socoteli inseamna doua raspunsuri, si prima zi in care
 * se despart e ziua in care omul vede 110 lei si marketplace-ul vinde cu 100.
 *
 * ⚠ SI IN BANI INTREGI, nu in virgula mobila. `100 * 1.1` da 110.00000000000001 in
 * JavaScript, iar `19.99 + 0.01` da 20.000000000000004. Rotunjit la doua zecimale
 * nu se vede, dar adunat pe o comanda de 40 de linii se vede, si atunci feedul
 * anunta un pret pe care checkout-ul nu-l recunoaste.
 */

import { CONFIG_IMPLICIT, type StrategiePret } from "./types";

/** Rotunjire comerciala la doua zecimale, prin bani intregi. */
export function rotunjeste2(valoare: number): number {
  if (!Number.isFinite(valoare)) return 0;
  return Math.round((valoare + Number.EPSILON) * 100) / 100;
}

/**
 * Pretul de vitrina, dus la pretul de Pepita prin strategia aleasa.
 *
 * ⚠ NU COBOARA SUB ZERO. Un adaos fix negativ (comerciantul poate scrie „-5" ca
 * sa vanda mai ieftin pe marketplace) aplicat unui produs de 3 lei ar da un pret
 * negativ, iar Pepita ar respinge produsul fara sa spuna de ce. Se opreste in
 * zero, iar validatorul refuza apoi zero: astfel greseala se vede pe ecran,
 * langa produs, nu intr-un raport de import al lor.
 */
export function aplicaStrategia(pretVitrina: number, strategie: StrategiePret): number {
  const p = Number(pretVitrina);
  if (!Number.isFinite(p) || p <= 0) return 0;
  const v = Number(strategie?.valoare);
  const valoare = Number.isFinite(v) ? v : 0;
  let rezultat: number;
  switch (strategie?.fel) {
    case "procent": rezultat = p * (1 + valoare / 100); break;
    case "fix": rezultat = p + valoare; break;
    default: rezultat = p;
  }
  return Math.max(0, rotunjeste2(rezultat));
}

export interface RegimTvaMagazin {
  vat_enabled: boolean;
  vat_rate: number;
  prices_include_vat: boolean;
}

/**
 * Cota trimisa in `<VatPercent>`.
 *
 * ⚠ NU E HARDCODATA. Romania a trecut de la 19 la 21 in 2026, si orice numar
 * scris in cod ar fi devenit fals peste noapte. Sursa e setarea magazinului,
 * aceeasi pe care o citeste si facturarea.
 *
 * ⚠ Un magazin neplatitor de TVA trimite 0. Campul e obligatoriu la ei, deci nu
 * poate lipsi, iar 0 e adevarul: pretul nu contine TVA.
 */
export function cotaTva(magazin: RegimTvaMagazin): number {
  if (!magazin?.vat_enabled) return 0;
  const r = Number(magazin.vat_rate);
  return Number.isFinite(r) && r > 0 ? r : 0;
}

/**
 * Pretul BRUT, adica cel pe care il cere Pepita.
 *
 * Documentatia lor nu spune „brut" in tabel, dar subsolul fiecarei pagini de
 * magazin spune: „A feltüntetett árak bruttó árak, tartalmazzák az általános
 * forgalmi adót." Preturile afisate sunt brute si contin TVA. Deci un magazin
 * Edinio care tine preturile FARA TVA trebuie sa adauge cota inainte de export,
 * altfel ar vinde pe Pepita cu 21% mai ieftin decat crede.
 */
export function pretBrut(pretMagazin: number, magazin: RegimTvaMagazin): number {
  const p = Number(pretMagazin);
  if (!Number.isFinite(p) || p <= 0) return 0;
  if (!magazin?.vat_enabled || magazin.prices_include_vat) return rotunjeste2(p);
  return rotunjeste2(p * (1 + cotaTva(magazin) / 100));
}

export interface PreturiPepita {
  /** `<Price>`: pretul normal, brut. */
  pret: number;
  /** `<DiscountedPrice>`: pretul redus, brut. Lipseste cand nu exista promotie. */
  pretRedus: number | null;
  /** `<VatPercent>` */
  tva: number;
}

/**
 * Cele doua preturi ale unui articol, gata de scris in feed.
 *
 * ⚠ CUM SE TRADUC CELE DOUA MODELE. In Edinio, `price` e ce plateste clientul si
 * `compare_at_price` e pretul taiat, cel dinainte de reducere. La Pepita, `Price`
 * e pretul normal si `DiscountedPrice` e cel redus. Deci, cand exista pret taiat
 * mai MARE, el devine `Price` si pretul de vanzare devine `DiscountedPrice`.
 * Scrise invers, produsul ar aparea la Pepita fara nicio reducere, iar la un
 * `compare_at_price` mai mic decat pretul ar aparea cu o „reducere" in sus.
 *
 * ⚠ `DiscountedPrice` nu se trimite niciodata mai mare sau egal cu `Price`.
 */
export function preturilePentruFeed(
  pretVitrina: number,
  pretTaiat: number | null,
  strategie: StrategiePret,
  magazin: RegimTvaMagazin,
): PreturiPepita {
  const tva = cotaTva(magazin);
  const vanzare = pretBrut(aplicaStrategia(pretVitrina, strategie), magazin);
  const taiat = pretTaiat != null && Number(pretTaiat) > 0
    ? pretBrut(aplicaStrategia(Number(pretTaiat), strategie), magazin)
    : null;

  if (taiat != null && taiat > vanzare) return { pret: taiat, pretRedus: vanzare, tva };
  return { pret: vanzare, pretRedus: null, tva };
}

/** Strategia salvata, adusa la o forma pe care socoteala o poate folosi. */
export function citesteStrategia(brut: unknown): StrategiePret {
  const s = (brut ?? {}) as Partial<StrategiePret>;
  const fel = s.fel === "procent" || s.fel === "fix" ? s.fel : "identic";
  const v = Number(s.valoare);
  return { fel, valoare: Number.isFinite(v) ? v : CONFIG_IMPLICIT.strategie_pret.valoare };
}
