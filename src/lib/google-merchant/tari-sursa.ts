import { getDataSource, setDataSourceCountries } from "./client";

/**
 * Tara in care pot aparea produsele: campul `countries` al sursei de date.
 *
 * ═══ ⚠⚠ CAUZA CELOR 276 DE OFERTE FARA DESTINATIE (17.09.2026) ═══
 *
 * Ghidul „Data sources”: „Note that the data source feedLabel has no impact on targeted country. For example,
 * using US as a label doesn't automatically target users in the United States.” Tarile vin fie din `countries`
 * pe sursa de date, fie din atributul `shipping` al fiecarui produs. Sursa noastra se crea doar cu
 * `feedLabel: "RO"`, iar produsele nu trimit `shipping`, deci Google nu avea nicio tara in care sa le arate:
 * zero destinatii si zero probleme, la 6 din 7 magazine, desi TOATE aveau listarile gratuite pornite.
 *
 * ⚠ S-a crezut intai ca programele sunt oprite. Fotografia `programs.list` din productie a aratat contrariul
 * (free-listings `ENABLED` la toate 7), iar abia atunci s-a gasit fraza de mai sus. Nu se presupune o cauza
 * din simptom.
 *
 * ⚠ Pe sursa, nu pe produs: ghidul recomanda `countries` pentru o sursa care vinde intr-o singura tara, iar
 * `shipping` pe produs ar fi putut suprascrie tarifele de livrare setate de comerciant in cont.
 *
 * ⚠ ADAUGA tara, nu inlocuieste lista: o tara pusa de comerciant in Merchant Center nu se sterge de aici.
 */
export type RezultatTari =
  | { stare: "corecta"; tari: string[] }
  | { stare: "reparata"; inainte: string[]; tari: string[] }
  | { stare: "eroare"; mesaj: string; reason?: string };

export async function asiguraTarileSursei(token: string, dataSourceName: string, tara: string): Promise<RezultatTari> {
  const cod = tara.trim().toUpperCase();
  const sursa = await getDataSource(token, dataSourceName);
  if ("error" in sursa) return { stare: "eroare", mesaj: sursa.error, reason: sursa.reason };
  const primara = sursa.data.primaryProductDataSource;
  if (!primara) return { stare: "eroare", mesaj: "Sursa de date nu e o sursa primara de produse." };
  const inainte = primara.countries ?? [];
  if (inainte.includes(cod)) return { stare: "corecta", tari: inainte };
  const tari = [...inainte, cod];
  const r = await setDataSourceCountries(token, dataSourceName, tari);
  if ("error" in r) return { stare: "eroare", mesaj: r.error, reason: r.reason };
  return { stare: "reparata", inainte, tari: r.data.primaryProductDataSource?.countries ?? tari };
}
