import { normalizePhone } from "@/lib/customers";
import type {
  CustomerFeedRow,
  CustomerPatch,
  CustomerPlan,
  CustomerRecord,
  CustomerRowIssue,
  CustomerUpdate,
  ExistingCustomer,
} from "./types";

/**
 * Spune EXACT ce se va scrie. Functie pura: nu atinge baza de date.
 *
 * Trei reguli din care nu se iese:
 *
 * 1. **Cheia se calculeaza la fel ca in baza.** Coloana `customers.key` e generata
 *    de Postgres cu aceeasi regula (telefon normalizat, altfel email). Daca cele
 *    doua s-ar despartii, un client ar trece de verificarea noastra si ar cadea pe
 *    constrangerea UNIQUE, cu o eroare de baza pe care nimeni n-o poate citi.
 *
 * 2. **Nu se suprascrie nimic.** La o fisa care exista deja se completeaza doar
 *    golurile. Un export vechi n-are voie sa strice o corectura facuta de mana.
 *
 * 3. **Un client fara telefon SI fara email nu intra.** N-ar putea fi legat
 *    niciodata de o comanda, deci ar fi un rand mort in tabel.
 */

/**
 * Cheia de identitate a unui client.
 *
 * OGLINDA EXACTA a coloanei generate `customers.key` si a functiei
 * `order_customer_key`. Fara „@” obligatoriu in email si fara validare de telefon,
 * dinadins: orice regula in plus aici s-ar rupe de baza, care nu o are.
 */
export function customerKey(phone: string | null, email: string | null): string | null {
  const p = normalizePhone(phone);
  if (p !== "") return p;
  const e = (email ?? "").trim().toLowerCase();
  if (e !== "") return `email:${e}`;
  return null;
}

/** Cum arata un telefon pe care baza il va cheia la fel ca o comanda viitoare. */
function phoneLooksUsable(phone: string | null): boolean {
  if (phone === null || phone.trim() === "") return true; /* lipsa nu e „ciudat” */
  const d = normalizePhone(phone);
  return d.length >= 6 && d.length <= 15;
}

function emailLooksUsable(email: string | null): boolean {
  if (email === null || email.trim() === "") return true;
  return email.includes("@");
}

/** Ce sa scrie in raport pentru un rand. */
function label(row: CustomerFeedRow): string {
  return row.name || row.email || row.phone || `randul ${row.rowIndex}`;
}

/** Primul lucru care nu e gol. Randurile de mai sus au prioritate. */
function firstFilled(a: string | null, b: string | null): string | null {
  if (a !== null && a.trim() !== "") return a;
  if (b !== null && b.trim() !== "") return b;
  return null;
}

function isEmpty(value: string | null): boolean {
  return value === null || value.trim() === "";
}

export function buildCustomerPlan(
  rows: CustomerFeedRow[],
  existingByKey: Map<string, ExistingCustomer>,
  orderKeys: Set<string>,
): CustomerPlan {
  const issues: CustomerRowIssue[] = [];
  let oddPhones = 0;
  let oddEmails = 0;

  /*
   * Contopirea randurilor care descriu acelasi om.
   *
   * Un export are des acelasi client de mai multe ori, cu date completate pe
   * jumatate in fiecare rand. Nu le aruncam pe cele de mai jos: le UNIM, si
   * fiecare camp il ia de la primul rand care il are. Asa se pastreaza si adresa
   * scrisa doar la a doua aparitie.
   */
  const merged = new Map<string, CustomerRecord>();

  for (const row of rows) {
    if (!phoneLooksUsable(row.phone)) oddPhones++;
    if (!emailLooksUsable(row.email)) oddEmails++;

    const key = customerKey(row.phone, row.email);
    if (key === null) {
      issues.push({
        rowIndex: row.rowIndex,
        label: label(row),
        problem: "no_key",
        detail: "Randul nu are nici telefon, nici email, deci clientul nu poate fi identificat.",
      });
      continue;
    }

    const seen = merged.get(key);
    if (!seen) {
      merged.set(key, { ...row, key });
      continue;
    }

    issues.push({
      rowIndex: row.rowIndex,
      label: label(row),
      problem: "merged_duplicate",
      detail: `Acelasi client apare si la randul ${seen.rowIndex}. Datele din amandoua s-au unit intr-o singura fisa.`,
    });

    merged.set(key, {
      ...seen,
      name: seen.name || row.name,
      email: firstFilled(seen.email, row.email),
      phone: firstFilled(seen.phone, row.phone),
      address: firstFilled(seen.address, row.address),
      city: firstFilled(seen.city, row.city),
      county: firstFilled(seen.county, row.county),
      postcode: firstFilled(seen.postcode, row.postcode),
      externalId: firstFilled(seen.externalId, row.externalId),
    });
  }

  /* ── Adaugare sau completare ── */
  const toInsert: CustomerRecord[] = [];
  const toUpdate: CustomerUpdate[] = [];
  let willMergeWithOrders = 0;

  for (const record of merged.values()) {
    const existing = existingByKey.get(record.key);

    if (!existing) {
      toInsert.push(record);
      /* Are deja comenzi: importul se lipeste de fisa lui, nu apare unul nou. */
      if (orderKeys.has(record.key)) willMergeWithOrders++;
      continue;
    }

    const patch: CustomerPatch = {};
    if (isEmpty(existing.name) && record.name) patch.name = record.name;
    if (isEmpty(existing.email) && record.email) patch.email = record.email;
    if (isEmpty(existing.phone) && record.phone) patch.phone = record.phone;
    if (isEmpty(existing.address) && record.address) patch.address = record.address;
    if (isEmpty(existing.city) && record.city) patch.city = record.city;
    if (isEmpty(existing.county) && record.county) patch.county = record.county;
    if (isEmpty(existing.postcode) && record.postcode) patch.postcode = record.postcode;
    if (isEmpty(existing.externalId) && record.externalId) patch.externalId = record.externalId;

    /* Nimic de completat: fisa e deja mai buna decat fisierul. Nu o atingem. */
    if (Object.keys(patch).length === 0) continue;

    toUpdate.push({ id: existing.id, key: record.key, rowIndex: record.rowIndex, patch });
  }

  return {
    toInsert,
    toUpdate,
    issues,
    totalRows: rows.length,
    willMergeWithOrders,
    oddPhones,
    oddEmails,
  };
}

/** Cifrele pentru ecranul de previzualizare. */
export function summarizeCustomerPlan(plan: CustomerPlan) {
  const byProblem = { no_key: 0, merged_duplicate: 0 };
  for (const issue of plan.issues) byProblem[issue.problem]++;

  return {
    totalRows: plan.totalRows,
    newCustomers: plan.toInsert.length,
    enriched: plan.toUpdate.length,
    willMergeWithOrders: plan.willMergeWithOrders,
    oddPhones: plan.oddPhones,
    oddEmails: plan.oddEmails,
    ...byProblem,
  };
}
