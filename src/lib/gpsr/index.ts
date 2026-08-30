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

/**
 * O persoana raspunzatoare: producatorul, sau reprezentantul din Uniune.
 *
 * ⚠ `country` E CERUT DE OLX si lipsea cu totul (30.08.2026, tarziu). Schema lor pentru
 * `ProductSafetyRegulationsParty` are `name`, `country`, `address`, `email` — si atat.
 *
 * ⚠ `phone` RAMANE AICI, dar NU pleaca la OLX. Alte marketplace-uri il cer, iar structura asta e
 * comuna; ce nu incape in schema fiecaruia se lasa afara la maparea LUI, nu se sterge de la toti.
 */
export interface GpsrPersoana {
  name?: string;
  /** Codul de tara, doua litere (`RO`, `DE`). Cerut de OLX. */
  country?: string;
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
  return [p.name, p.country, p.address, p.email, p.phone]
    .some((x) => typeof x === "string" && x.trim() !== "");
}

function curataPersoana(p: GpsrPersoana | undefined): GpsrPersoana | undefined {
  if (!persoanaAreCeva(p)) return undefined;
  const out: GpsrPersoana = {};
  if (p!.name?.trim()) out.name = p!.name.trim();
  /* ⚠ Cod de tara, deci se aduce la forma pe care o cer: doua litere mari. */
  if (p!.country?.trim()) out.country = p!.country.trim().toUpperCase().slice(0, 2);
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
  if (!date?.manufacturer?.country) lipsuri.push("țara producătorului");
  /*
   * ⚠ NUME SI E-MAIL, nu „e-mail sau telefon": schema OLX pentru persoana responsabila n-are
   * `phone` deloc. Ceruta asa, validarea noastra ar fi spus ca e in regula un contact pe care ei
   * nu-l pot primi — iar omul ar fi aflat abia din refuzul lor.
   */
  const areContact = !!(date?.contact_person?.name && date?.contact_person?.email);
  if (!areContact) lipsuri.push("persoana responsabilă din UE (nume și e-mail)");
  return lipsuri;
}

/**
 * Declaratia, in schema pe care o cere CHIAR OLX.
 *
 * ═══ ⚠ STRUCTURA COMUNA NU E STRUCTURA LOR (30.08.2026, tarziu) ═══
 *
 * `GpsrDate` e comuna celor trei marketplace-uri, fiindca informatia e aceeasi. Dar schema OLX
 * pentru `ProductSafetyRegulationsParty` are exact `name`, `country`, `address`, `email`. Trimis
 * asa cum il tinem noi, corpul purta un `phone` pe care schema lor nu-l cunoaste — iar campurile in
 * plus sunt tocmai ce respinge o validare stricta.
 *
 * ⚠ Deci maparea LOR taie ce nu incape, in loc sa saracim structura comuna: telefonul ramane pentru
 * cine il cere.
 */
export function gpsrPentruOlx(date: GpsrDate | null): Record<string, unknown> | null {
  if (!date) return null;
  const parte = (p: GpsrPersoana | undefined) => {
    if (!p) return undefined;
    const out: Record<string, string> = {};
    if (p.name) out.name = p.name;
    if (p.country) out.country = p.country;
    if (p.address) out.address = p.address;
    if (p.email) out.email = p.email;
    return Object.keys(out).length > 0 ? out : undefined;
  };
  const out: Record<string, unknown> = {};
  if (date.placed_before_2024) out.placed_before_2024 = true;
  const man = parte(date.manufacturer);
  if (man) out.manufacturer = man;
  const con = parte(date.contact_person);
  if (con) out.contact_person = con;
  if (date.warning_and_safety) out.warning_and_safety = date.warning_and_safety;
  /* ⚠ Ca si `gpsrEfectiv`: un obiect gol inseamna „am declarat ceva", si nu e adevarat. */
  return Object.keys(out).length > 0 ? out : null;
}
