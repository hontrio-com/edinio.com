import { cell, type ParsedCsv } from "@/lib/import/csv";
import { take } from "@/lib/import/header-match";
import type { CustomerFeedMapping, CustomerFeedRow } from "./types";

/**
 * Ghicirea coloanelor si citirea randurilor. Functii pure, testabile fara baza.
 */

/* „client” lipseste dinadins: ar fura o coloana „Client id”. */
const NAME_HINTS = ["nume complet", "full name", "fullname", "nume client", "customer name", "nume", "name"];
const FIRST_HINTS = ["prenume", "firstname", "first name", "first_name", "given name"];
const LAST_HINTS = ["nume de familie", "lastname", "last name", "last_name", "surname", "familie"];
const EMAIL_HINTS = ["email", "e-mail", "adresa email", "mail"];
const PHONE_HINTS = ["telefon", "telephone", "phone", "mobil", "mobile", "nr telefon", "tel"];
const ADDRESS_HINTS = ["adresa", "address_1", "address1", "address", "strada", "street"];
const CITY_HINTS = ["oras", "localitate", "city", "town"];
const COUNTY_HINTS = ["judet", "county", "state", "region", "regiune"];
const POSTCODE_HINTS = ["cod postal", "cod_postal", "codpostal", "postcode", "postal code", "zip", "postal"];
const EXTERNAL_HINTS = ["customer id", "customer_id", "id client", "id_client", "client id", "external id", "id"];

/**
 * Ordinea conteaza, si nu e cea de la care am plecat.
 *
 * Prenumele si numele se REZERVA primele, chiar daca la final vrem numele intreg.
 * Motivul l-a prins un test pe antetul adevarat de OpenCart: indiciul „name”
 * potriveste partial „Firstname”, deci coloana de prenume era luata drept nume
 * complet si toti clientii ar fi intrat fara nume de familie.
 *
 * Cu ele rezervate, coloana de nume intreg se caută din ce a RAMAS. Daca exista
 * una („Nume complet”), ea castiga si bucatile se lasa nefolosite.
 *
 * `externalId` se caută la FINAL, pentru ca indiciul lui cel mai slab e „id”, iar
 * pana acolo coloanele adevarate sunt deja luate.
 */
export function autoMapCustomerColumns(headers: string[]): CustomerFeedMapping {
  const taken = new Set<string>();
  const mapping: CustomerFeedMapping = {};

  const first = take(headers, FIRST_HINTS, taken);
  const last = take(headers, LAST_HINTS, taken);

  const name = take(headers, NAME_HINTS, taken);
  if (name) {
    mapping.name = name;
  } else {
    if (first) mapping.firstName = first;
    if (last) mapping.lastName = last;
  }

  const email = take(headers, EMAIL_HINTS, taken);
  if (email) mapping.email = email;

  const phone = take(headers, PHONE_HINTS, taken);
  if (phone) mapping.phone = phone;

  const address = take(headers, ADDRESS_HINTS, taken);
  if (address) mapping.address = address;

  const city = take(headers, CITY_HINTS, taken);
  if (city) mapping.city = city;

  const county = take(headers, COUNTY_HINTS, taken);
  if (county) mapping.county = county;

  const postcode = take(headers, POSTCODE_HINTS, taken);
  if (postcode) mapping.postcode = postcode;

  const externalId = take(headers, EXTERNAL_HINTS, taken);
  if (externalId) mapping.externalId = externalId;

  return mapping;
}

function text(row: Record<string, string>, header: string | undefined): string {
  return cell(row, header).trim();
}

function orNull(value: string): string | null {
  return value === "" ? null : value;
}

/** Randurile din fisier, in forma pe care o cere planificatorul. */
export function readCustomerRows(
  parsed: ParsedCsv,
  mapping: CustomerFeedMapping,
): CustomerFeedRow[] {
  return parsed.rows.map((row, i) => {
    /* Numele intreg bate bucatile; bucatile se lipesc cu un spatiu. */
    const whole = text(row, mapping.name);
    const name = whole !== ""
      ? whole
      : [text(row, mapping.firstName), text(row, mapping.lastName)].filter(Boolean).join(" ");

    return {
      rowIndex: i + 1,
      name,
      email: orNull(text(row, mapping.email)),
      phone: orNull(text(row, mapping.phone)),
      address: orNull(text(row, mapping.address)),
      city: orNull(text(row, mapping.city)),
      county: orNull(text(row, mapping.county)),
      postcode: orNull(text(row, mapping.postcode)),
      externalId: orNull(text(row, mapping.externalId)),
    };
  });
}
