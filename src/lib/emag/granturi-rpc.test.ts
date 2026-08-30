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
  /*
   * ⚠ `is_blog_editor` A FOST AICI SI A PLECAT, si merita spus de ce: lista asta
   * trebuie sa se scurteze, nu sa creasca.
   *
   * Pe 30.08.2026 a fost adaugata cu motivul bun de atunci — o chemau politicile
   * RLS de blog, care ruleaza sub rolul apelantului. Pe 31.08.2026 politicile
   * acelea au fost sterse cu totul: blogul nu mai are nicio cale de scriere
   * directa prin `authenticated`, fiindca tot ce scrie trece prin actiuni de
   * server cu cheia de serviciu. Fara politici care s-o cheme, functia n-are de ce
   * sa mai fie deschisa — deci grantul i-a fost retras, si exceptia a devenit
   * inutila.
   */
  catalog_cauta: "cautarea din vitrina publica, fara autentificare",
  catalog_pagina: "paginarea vitrinei publice",
  catalog_randuri: "randurile vitrinei publice",
  /*
   * ⚠ VERIFICAT INAINTE SA FIE TRECUTA AICI, si aproape am inchis-o gresit.
   *
   * E chemata din `privat.store_settings_upd()` — declansatorul `INSTEAD OF UPDATE` al
   * vederii `public.store_settings`. Iar acela NU e `SECURITY DEFINER`, deci ruleaza sub
   * rolul celui care face UPDATE-ul. Fara EXECUTE pentru PUBLIC, orice salvare de setari
   * facuta de un utilizator autentificat ar pica, si secretele n-ar mai fi pastrate.
   *
   * ⚠ Si nu expune nimic: e o transformare PURA. Primeste `vechi` si `nou` ca argumente
   * si le imbina; secretele vin din ce a trimis apelantul, nu din datele altcuiva.
   */
  pazeste_secretele: "chemata din declansatorul vederii, care ruleaza sub rolul apelantului",
  /*
   * ⚠ GASITA DE PROBA DE MAI JOS, la prima ei rulare, si NU e o exceptie de comoditate.
   *
   * `privat.cripteaza_rand(p_rand jsonb)` e chemata din `privat.store_settings_ins` si
   * `privat.store_settings_upd` — declansatoarele `INSTEAD OF` ale vederii `public.store_settings`.
   * Verificat in productie: NICIUNUL dintre cele trei apelante nu e `SECURITY DEFINER`, deci
   * ruleaza sub rolul celui care scrie. Fara EXECUTE pentru `authenticated`, orice salvare de
   * setari ar pica.
   *
   * ⚠ Si nu expune nimic: CRIPTEAZA ce i se da, nu descifreaza. Primeste randul apelantului si il
   * intoarce cu campurile secrete inchise; nu citeste datele nimanui altcuiva.
   */
  cripteaza_rand: "chemata din declansatoarele vederii `store_settings`, care ruleaza sub rolul apelantului",
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

/* ══════════════════════════════════════════════════════════════════════════
   REFACEREA BAZEI NU ARE VOIE SA REDESCHIDA CE S-A INCHIS (25.08.2026)
   ══════════════════════════════════════════════════════════════════════════

   ⚠ Productia era reparata; REFACEREA ei nu.

   Generatorul de baseline serializa doar granturile catre `anon`, `authenticated` si
   `service_role`. Iar Postgres da EXECUTE lui PUBLIC din oficiu la orice functie nou
   creata. Deci pe o baza refacuta din `prelude + baseline`, fiecare functie redevenea
   executabila de oricine.

   Masurat pe productia zilei: **64 de functii SECURITY DEFINER** ar fi fost publice dupa
   un restore, dintre care si cele doua ale integrarii eMAG, inchise cu o zi inainte.

   ⚠ Nu se vedea in niciun fel: `--check` compara baseline-ul cu productia si trecea,
   fiindca amandoua erau generate de acelasi generator orb.
*/

/** Numele functiilor `SECURITY DEFINER` din baseline. */
function functiiSecurityDefiner(baseline: string): string[] {
  const nume: string[] = [];
  const bucati = baseline.split("CREATE OR REPLACE FUNCTION ");
  for (const b of bucati.slice(1)) {
    const antet = b.slice(0, b.indexOf("AS $function$"));
    if (!/SECURITY DEFINER/i.test(antet)) continue;
    const m = b.match(/^(\w+)\.(\w+)\(/);
    if (m) nume.push(`${m[1]}.${m[2]}`);
  }
  return [...new Set(nume)];
}

test("fiecare `security definer` isi revoca EXECUTE de la PUBLIC in baseline", () => {
  /*
   * ⚠ Se citeste din baseline fiindca ACOLO e problema: el e reteta din care se reface
   * baza. Productia poate fi inchisa corect si refacerea sa deschida tot — chiar cazul
   * gasit de auditul extern.
   *
   * ⚠ Cele care CHIAR trebuie sa fie publice se recunosc singure: generatorul emite
   * `revoke` numai pentru functiile care in productie n-au PUBLIC. Deci daca o functie
   * n-are nici revoke, nici motiv scris aici, e o gaura.
   */
  const baseline = readFileSync("migrations/000-schema-baseline.sql", "utf8");
  const secdef = functiiSecurityDefiner(baseline);
  assert.ok(secdef.length > 30, `prea putine functii gasite (${secdef.length}): proba nu citeste`);

  const fara = secdef.filter((nume) => {
    if (nume.split(".")[1] in PUBLICE_DINADINS) return false;
    /* Declansatoarele nu se cheama prin PostgREST. */
    if (nume.split(".")[1].startsWith("trg_")) return false;
    return !baseline.includes(`revoke execute on function ${nume}(`);
  });

  assert.deepEqual(
    fara, [],
    "functii SECURITY DEFINER care, dupa un restore din baseline, ar fi executabile de "
    + "oricine: Postgres da EXECUTE lui PUBLIC din oficiu, iar baseline-ul nu-l revoca.",
  );
});

test("baseline-ul chiar contine revocari, nu doar granturi", () => {
  /* ⚠ O proba care nu gaseste nimic trece intotdeauna. Aceeasi lectie ca mai sus. */
  const baseline = readFileSync("migrations/000-schema-baseline.sql", "utf8");
  const cate = baseline.split(String.fromCharCode(10))
    .filter((l) => l.startsWith("revoke execute on function ")).length;
  assert.ok(cate > 40, `numai ${cate} revocari in baseline: generatorul le-a pierdut`);
});


/* ══════════════════════════════════════════════════════════════════════════
   `revoke … from public` NU IA SI GRANTURILE DATE PE NUME (28.08.2026)
   ══════════════════════════════════════════════════════════════════════════

   Proba de mai sus cerea revocarea de la PUBLIC, si atat. A trecut verde luni intregi peste o
   gaura pe care tocmai ea trebuia s-o vada: Supabase da EXECUTE lui `anon` si `authenticated` PE
   NUME, prin privilegii implicite, iar `revoke … from public` nu atinge un grant nominal.

   Citit in productie, nu in fisier: SAISPREZECE functii `security definer` aveau `anon=X`, printre
   ele `aboutyou_incheie_scoaterea`, care face `delete from public.aboutyou_listings` ocolind RLS.

   ⚠ SI DE CE NU O MATURARE. Patru dintre cele saisprezece TREBUIE sa ramana deschise: cele trei
   `catalog_*` sunt chemate chiar de vitrina publica, cu cheia anonima, iar `is_admin` e folosita de
   noua politici RLS — care ruleaza sub rolul apelantului. Inchise, ar fi cazut si magazinul, si
   fiecare politica. De-aia lista de mai jos e o lista ALEASA, nu o exceptie de comoditate.
*/
test("nicio functie `security definer` nu ramane deschisa lui anon sau authenticated", () => {
  const baseline = readFileSync("migrations/000-schema-baseline.sql", "utf8");
  const secdef = new Set(functiiSecurityDefiner(baseline).map((n) => n.split(".")[1]));
  assert.ok(secdef.size > 30, `prea putine functii gasite (${secdef.size}): proba nu citeste`);

  const deschise: string[] = [];
  for (const linie of baseline.split(NL)) {
    const m = /^grant execute on function (\w+)\.(\w+)\(.* to (anon|authenticated);$/.exec(linie);
    if (!m) continue;
    if (!secdef.has(m[2])) continue;              /* fara `security definer` nu ocoleste RLS */
    if (m[2] in PUBLICE_DINADINS) continue;
    deschise.push(`${m[2]} -> ${m[3]}`);
  }

  assert.deepEqual(deschise, [],
    "functii SECURITY DEFINER pe care `anon` sau `authenticated` le pot chema. `revoke … from "
    + "public` NU le inchide: granturile catre rolurile astea sunt date pe nume si cer "
    + "`revoke … from anon, authenticated`.");
});

test("si lista celor lasate dinadins deschise e chiar cea masurata", () => {
  /*
   * ⚠ O lista de exceptii care creste in tacere devine, in cateva luni, o poarta. Aici se cere ca
   * fiecare nume din ea sa fie inca `security definer` in baseline — altfel e o intrare moarta,
   * ramasa de la o functie stearsa, care nu mai apara nimic si doar slabeste proba de mai sus.
   */
  const baseline = readFileSync("migrations/000-schema-baseline.sql", "utf8");
  const secdef = new Set(functiiSecurityDefiner(baseline).map((n) => n.split(".")[1]));
  const moarte = Object.keys(PUBLICE_DINADINS).filter((n) => !secdef.has(n));
  assert.deepEqual(moarte, [], "intrari ramase in lista celor publice dinadins, fara functie in spate");
});
