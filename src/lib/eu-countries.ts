/**
 * EU countries for international shipping.
 *
 * `dpdCountryId` is the ISO 3166-1 *numeric* code, which is exactly what the
 * DPD Romania API (Speedy engine) uses as `countryId` (confirmed: RO=642,
 * BG=100, GR=300, US=840). So no runtime country lookup is needed for the EU.
 */

export interface EuCountry {
  iso2: string;
  /** ISO 3166-1 numeric == DPD `countryId`. */
  dpdCountryId: number;
  /** Romanian display name. */
  name: string;
}

export const ROMANIA_COUNTRY_ID = 642;

/** EU-27, sorted by Romanian name. Romania itself is the domestic default and is not in this list. */
export const EU_COUNTRIES: EuCountry[] = [
  { iso2: "AT", dpdCountryId: 40,  name: "Austria" },
  { iso2: "BE", dpdCountryId: 56,  name: "Belgia" },
  { iso2: "BG", dpdCountryId: 100, name: "Bulgaria" },
  { iso2: "CY", dpdCountryId: 196, name: "Cipru" },
  { iso2: "CZ", dpdCountryId: 203, name: "Cehia" },
  { iso2: "HR", dpdCountryId: 191, name: "Croatia" },
  { iso2: "DK", dpdCountryId: 208, name: "Danemarca" },
  { iso2: "EE", dpdCountryId: 233, name: "Estonia" },
  { iso2: "FI", dpdCountryId: 246, name: "Finlanda" },
  { iso2: "FR", dpdCountryId: 250, name: "Franta" },
  { iso2: "DE", dpdCountryId: 276, name: "Germania" },
  { iso2: "GR", dpdCountryId: 300, name: "Grecia" },
  { iso2: "IE", dpdCountryId: 372, name: "Irlanda" },
  { iso2: "IT", dpdCountryId: 380, name: "Italia" },
  { iso2: "LV", dpdCountryId: 428, name: "Letonia" },
  { iso2: "LT", dpdCountryId: 440, name: "Lituania" },
  { iso2: "LU", dpdCountryId: 442, name: "Luxemburg" },
  { iso2: "MT", dpdCountryId: 470, name: "Malta" },
  { iso2: "NL", dpdCountryId: 528, name: "Olanda" },
  { iso2: "PL", dpdCountryId: 616, name: "Polonia" },
  { iso2: "PT", dpdCountryId: 620, name: "Portugalia" },
  { iso2: "SK", dpdCountryId: 703, name: "Slovacia" },
  { iso2: "SI", dpdCountryId: 705, name: "Slovenia" },
  { iso2: "ES", dpdCountryId: 724, name: "Spania" },
  { iso2: "SE", dpdCountryId: 752, name: "Suedia" },
  { iso2: "HU", dpdCountryId: 348, name: "Ungaria" },
].sort((a, b) => a.name.localeCompare(b.name, "ro"));

const BY_ISO2 = new Map(EU_COUNTRIES.map((c) => [c.iso2, c]));
const BY_DPD_ID = new Map(EU_COUNTRIES.map((c) => [c.dpdCountryId, c]));

export function euCountryByIso2(iso2: string | null | undefined): EuCountry | null {
  return iso2 ? BY_ISO2.get(iso2.toUpperCase()) ?? null : null;
}

export function euCountryByDpdId(id: number | null | undefined): EuCountry | null {
  return id != null ? BY_DPD_ID.get(id) ?? null : null;
}
