/**
 * GPSR — cine raspunde pentru siguranta produsului.
 *
 * ═══ ⚠ DE CE E AICI, SI NU IN `src/lib/olx/` (30.08.2026) ═══
 *
 * Regulamentul european de siguranta generala a produselor cere ca fiecare produs vandut catre
 * consumatori din UE sa arate cine e producatorul si cine e persoana responsabila din Uniune. OLX
 * il cere prin `product_safety_regulation`; eMAG si About You cer acelasi lucru, cu alte nume.
 *
 * Scris in `olx/mapping.ts`, ar fi trebuit rescris la fiecare integrare — si de la a doua ar fi
 * inceput sa se departeze. E o insusire a PRODUSULUI si a MAGAZINULUI, nu a canalului.
 *
 * ⚠ CERINTA LEGALA IL PRIVESTE PE ORICINE VINDE IN UE, deci datele exista pentru toata lumea.
 * Cerinta TEHNICA — un API care refuza — e numai a marketplace-urilor, si de-aia ecranul le cere
 * doar cand e conectata o integrare care le foloseste.
 */

/** O persoana raspunzatoare: producatorul, sau reprezentantul din Uniune. */
export interface GpsrPersoana {
  name?: string;
  address?: string;
  email?: string;
  phone?: string;
}

export interface GpsrDate {
  /**
   * Produsul a fost pus pe piata INAINTE de 13 decembrie 2024.
   *
   * ⚠ Pentru astea, regulamentul nu cere datele de mai jos. E singurul camp care nu poate veni din
   * setarile magazinului: tine de produs, nu de comerciant.
   */
  placed_before_2024?: boolean;
  /** Producatorul. */
  manufacturer?: GpsrPersoana;
  /** Persoana responsabila din UE (reprezentantul), cand producatorul e din afara Uniunii. */
  contact_person?: GpsrPersoana;
  /** Avertismentele si instructiunile de siguranta, asa cum apar pe ambalaj. */
  warning_and_safety?: string;
}

/** Ce tine magazinul: producatorul si reprezentantul, aceiasi pentru tot catalogul. */
export type GpsrConfig = Pick<GpsrDate, "manufacturer" | "contact_person" | "warning_and_safety">;

function persoanaAreCeva(p: GpsrPersoana | undefined): boolean {
  if (!p) return false;
  return [p.name, p.address, p.email, p.phone].some((x) => typeof x === "string" && x.trim() !== "");
}

function curataPersoana(p: GpsrPersoana | undefined): GpsrPersoana | undefined {
  if (!persoanaAreCeva(p)) return undefined;
  const out: GpsrPersoana = {};
  if (p!.name?.trim()) out.name = p!.name.trim();
  if (p!.address?.trim()) out.address = p!.address.trim();
  if (p!.email?.trim()) out.email = p!.email.trim();
  if (p!.phone?.trim()) out.phone = p!.phone.trim();
  return out;
}

/** Citeste `page_sections.gpsr` fara sa presupuna nimic despre forma lui. */
export function gpsrDinProdus(pageSections: unknown): Partial<GpsrDate> {
  const g = (pageSections as { gpsr?: unknown } | null)?.gpsr;
  if (!g || typeof g !== "object" || Array.isArray(g)) return {};
  return g as Partial<GpsrDate>;
}

/**
 * Ce se trimite pentru produsul asta: ce scrie pe el, iar ce nu scrie — din setarile magazinului.
 *
 * ⚠ SUPRASCRIEREA E LA NIVEL DE PERSOANA, NU DE CAMP. Imbinate camp cu camp, s-ar putea naste o
 * adresa jumatate a unui producator si jumatate a altuia — o informatie legala FALSA, si mai rea
 * decat una lipsa. Un revanzator scrie producatorul intreg sau deloc.
 */
export function gpsrEfectiv(pageSections: unknown, config: GpsrConfig | null | undefined): GpsrDate | null {
  const alProdusului = gpsrDinProdus(pageSections);
  const c = config ?? {};

  const manufacturer = curataPersoana(alProdusului.manufacturer) ?? curataPersoana(c.manufacturer);
  const contact = curataPersoana(alProdusului.contact_person) ?? curataPersoana(c.contact_person);
  const avertisment = (alProdusului.warning_and_safety ?? c.warning_and_safety ?? "").trim();
  const inaintea2024 = alProdusului.placed_before_2024 === true;

  /*
   * ⚠ UN OBIECT GOL NU SE TRIMITE. Furnizorii il valideaza, iar `{}` inseamna „am declarat ceva" —
   * ceea ce nu e adevarat. Lipsa e mai cinstita decat o declaratie fara continut, si se vede in
   * mesajul lor de refuz.
   */
  if (!manufacturer && !contact && !avertisment && !inaintea2024) return null;

  const out: GpsrDate = {};
  if (inaintea2024) out.placed_before_2024 = true;
  if (manufacturer) out.manufacturer = manufacturer;
  if (contact) out.contact_person = contact;
  if (avertisment) out.warning_and_safety = avertisment;
  return out;
}

/**
 * Ce lipseste ca declaratia sa fie intreaga.
 *
 * ⚠ NU BLOCHEAZA NIMIC, si asta e dinadins: nu putem sti din cod in ce categorii o cere fiecare
 * furnizor, iar un refuz al nostru intr-o categorie unde ei n-o cer ar opri o vanzare degeaba.
 * Se ARATA, in ecran, ca omul sa stie inainte de a primi refuzul lor.
 */
export function gpsrLipsuri(date: GpsrDate | null): string[] {
  if (date?.placed_before_2024) return [];
  const lipsuri: string[] = [];
  if (!date?.manufacturer?.name) lipsuri.push("numele producătorului");
  if (!date?.manufacturer?.address) lipsuri.push("adresa producătorului");
  const areContact = !!(date?.contact_person?.name || date?.contact_person?.email);
  if (!areContact) lipsuri.push("persoana responsabilă din UE (nume și e-mail sau telefon)");
  return lipsuri;
}
