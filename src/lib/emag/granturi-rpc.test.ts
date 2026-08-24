import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";

/* ══════════════════════════════════════════════════════════════════════════
   ORICE `SECURITY DEFINER` CARE SCRIE TREBUIE SA-SI REVOCE USA (24.08.2026)
   ══════════════════════════════════════════════════════════════════════════

   ⚠ POSTGRES DA `EXECUTE` LUI **PUBLIC** DIN OFICIU, LA ORICE FUNCTIE NOUA.

   Un `grant execute … to service_role;` NU restrange nimic — adauga peste ce are deja
   toata lumea. Scrisa asa, o functie `SECURITY DEFINER` ruleaza cu drepturile
   proprietarului si trece peste RLS, pentru oricine o cheama prin PostgREST.

   Masurat in productie cu `pg_proc.proacl`:

     ajusteaza_stoc_comanda_marketplace → =X/postgres | anon=X | authenticated=X | service_role=X
     consuma_stoc_comanda_marketplace   → postgres=X  | service_role=X          ← cum trebuie

   A doua e scrisa mai demult si e inchisa corect. Diferenta nu e de pricepere: acolo
   cineva a scris `revoke`, in cea noua nu.

   ⚠ CE PUTEA COSTA: un comerciant autentificat putea trimite `p_business_id = NULL` si
   id-uri de produs ale ALTUI magazin, iar stocul acelora se modifica.

   ⚠ SI `create or replace` REFACE granturile implicite. Deci `revoke` trebuie sa vina
   DUPA fiecare definitie, nu o data la inceputul fisierului.
*/

/**
 * Functiile publice DINADINS, si de ce.
 *
 * ⚠ Fiecare intrare isi poarta motivul. Cine adauga una noua trebuie sa raspunda intai
 * la „de ce trebuie sa fie publica?" — daca raspunsul e „o cheama serverul", atunci NU
 * trebuie, si merge pe `service_role`.
 */
const PUBLICE_DINADINS: Record<string, string> = {
  is_admin: "chemata din politicile RLS, deci trebuie sa mearga sub rolul utilizatorului",
  catalog_cauta: "cautarea din vitrina publica, fara autentificare",
  catalog_pagina: "paginarea vitrinei publice",
  catalog_randuri: "randurile vitrinei publice",
};

const NL = String.fromCharCode(10);

/** Numele functiilor din baseline acordate lui `anon` sau `authenticated`. */
function deschiseCatrePublic(): string[] {
  /*
   * ⚠ SE CITESTE DIN BASELINE, care e un DUMP AL PRODUCTIEI, nu din migratii.
   *
   * Prima forma a probei cerea `revoke` in ACEEASI migratie cu `create`. Suna riguros si
   * era gresit: `decrement_variant_stock_batch` n-are revoke in migratia ei, dar in
   * productie e inchisa corect — revocata altundeva. Proba ar fi strigat la cod sanatos,
   * chiar tiparul reparat de trei ori azi in panoul comerciantului.
   *
   * Baseline-ul spune ce e ADEVARAT acum. Regenerat, proba masoara realitatea.
   */
  const baseline = readFileSync("migrations/000-schema-baseline.sql", "utf8");
  const nume = new Set<string>();

  for (const l of baseline.split(NL)) {
    if (!/^grant\s+execute\s+on\s+function\s+public\./i.test(l)) continue;
    if (!/\sto\s+(anon|authenticated)\s*;/i.test(l)) continue;
    const m = l.match(/public\.(\w+)/);
    if (!m) continue;
    /* Declansatoarele nu se pot chema prin PostgREST: intorc tipul `trigger`. */
    if (m[1].startsWith("trg_")) continue;
    if (m[1] in PUBLICE_DINADINS) continue;
    nume.add(m[1]);
  }
  return [...nume];
}

test("proba insasi vede granturile din baseline", () => {
  /*
   * ⚠ O PROBA CARE NU GASESTE NIMIC TRECE INTOTDEAUNA.
   *
   * Prima forma a acestei probe avea un `\b` de regex trecut printr-un strat de Python si
   * ajuns in fisier ca un caracter BACKSPACE adevarat. Regexul nu se potrivea cu nimic,
   * lista iesea goala, iar proba trecea verde peste 24 de functii deschise.
   *
   * Adica exact greseala pe care o vaneaza: o verificare care tace si pare in regula.
   * Deci intai se dovedeste ca proba CHIAR citeste ceva.
   */
  const baseline = readFileSync("migrations/000-schema-baseline.sql", "utf8");
  const granturi = baseline.split(NL)
    .filter((l) => /^grant\s+execute\s+on\s+function\s+public\./i.test(l));

  assert.ok(granturi.length > 50, `prea putine granturi gasite (${granturi.length}): proba nu citeste`);
  assert.ok(
    granturi.some((l) => /\sto\s+(anon|authenticated)\s*;/i.test(l)),
    "niciun grant catre anon/authenticated gasit — filtrul e rupt, nu baza curata",
  );
});

test("nicio functie a integrarii nu e deschisa catre anon sau authenticated", () => {
  /*
   * ⚠ Se verifica NUMAI functiile integrarii, nu toata baza. Restul platformei are inca
   * functii publice mai vechi — unele legitime, altele de revizuit — dar nu le repar aici
   * si nici nu blochez integrarea pentru ele. O proba care cade pe cod strain se
   * dezactiveaza, nu se repara.
   */
  const aleNoastre = deschiseCatrePublic().filter(
    (n) => n.includes("emag") || n.includes("marketplace") || n.includes("oferte"),
  );

  assert.deepEqual(
    aleNoastre, [],
    "functii ale integrarii deschise catre anon/authenticated. Postgres da EXECUTE lui "
    + "PUBLIC din oficiu la orice functie noua, iar un grant catre service_role NU-l ia "
    + "inapoi: trebuie `revoke all … from public, anon, authenticated`, DUPA fiecare "
    + "`create or replace`.",
  );
});

test("cele doua functii scrise azi sunt inchise in baseline", () => {
  const baseline = readFileSync("migrations/000-schema-baseline.sql", "utf8");

  for (const nume of ["ajusteaza_stoc_comanda_marketplace", "numara_ofertele_emag"]) {
    const linii = baseline.split(NL)
      .filter((l) => l.includes(nume) && /^grant\s+execute/i.test(l));

    assert.ok(linii.length > 0, `${nume}: niciun grant in baseline — a disparut functia?`);
    for (const l of linii) {
      assert.ok(
        /\sto\s+service_role\s*;/i.test(l),
        `${nume}: grant catre altcineva decat service_role: ${l.trim()}`,
      );
    }
  }
});

test("ajustarea stocului cere `business_id` si verifica proprietarul produselor", () => {
  /*
   * ⚠ Usa inchisa e primul strat. Astea sunt celelalte doua, si conteaza: `create or
   * replace` reface granturile implicite, iar peste un an cineva poate muta un `grant`
   * fara sa stie de ce era acolo.
   */
  const migratie = readdirSync("migrations")
    .filter((f) => f.endsWith(".sql") && /^\d{4}-/.test(f))
    .sort()
    .map((f) => readFileSync(`migrations/${f}`, "utf8"))
    .filter((t) => t.includes("ajusteaza_stoc_comanda_marketplace"))
    .pop();
  assert.ok(migratie, "n-am gasit migratia functiei de ajustare");

  assert.match(
    migratie!, /p_business_id\s+is\s+null/i,
    "NULL trebuie refuzat. Forma dinainte scria `if p_business_id is not null and …`, "
    + "deci un NULL trimis din afara sarea peste verificarea de magazin.",
  );
  assert.match(
    migratie!, /business_id\s*=\s*v_biz/i,
    "produsele trebuie verificate ca sunt ale magazinului: `consuma_stoc_marketplace` "
    + "face `update products … where id = pid`, fara nicio legatura cu business_id.",
  );
});
