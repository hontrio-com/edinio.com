import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

/*
 * ═══════════════════════════════════════════════════════════════════════════
 * O FUNCTIE `SECURITY DEFINER` NU RAMANE DESCHISA TUTUROR        (15.09.2026)
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * ⚠ IN POSTGRES, `EXECUTE` PE O FUNCTIE E AL LUI `PUBLIC` DIN OFICIU. O functie noua, fara ACL
 * scris de cineva, poate fi chemata de oricine, inclusiv de `anon`. Cand functia e si
 * `SECURITY DEFINER`, ea ruleaza cu drepturile PROPRIETARULUI, deci ocoleste RLS.
 *
 * Lectia e platita de doua ori in casa:
 *
 *   * 19.08.2026: `privat.decripteaza` era chemabila de `anon`, adica un oracol de decriptare.
 *     ⚠ Si `revoke ... from anon` singur NU face nimic acolo: dreptul nu e al lui `anon`, e al lui
 *     `PUBLIC`. Primele doua probe scrise atunci „au trecut" fara sa apere nimic;
 *   * 07.09.2026: un `DROP` + `CREATE` a recapatat implicitele, iar `ALTER DEFAULT PRIVILEGES` al
 *     lui Supabase a adaugat pe deasupra granturi EXPLICITE catre `anon` si `authenticated`, pe
 *     care `revoke from public` nu le atinge. Alta cauza, aceeasi urmare.
 *
 * ═══ ⚠ SI A TREIA OARA, GASITA DE PROBA ASTA (15.09.2026) ═══
 *
 * `privat.pazeste_secretele`, adaugata pe 28.09 dupa auditul de securitate, statea cu ACL IMPLICIT,
 * deci deschisa lui `anon`. Nu era oracol (amandoua argumentele vin de la apelant), dar putea SCRIE
 * randuri `critical` in `public.error_logs` cu drepturi de definer, adica acoperi cu zgomot chiar
 * jurnalul comerciantului. Si nimic din baza n-o mai chema: declansatorul care o folosea si-a
 * rescris regula inauntru pe 10.10.
 *
 * Proba asta ar fi cazut in ZIUA in care a fost adaugata.
 *
 * ═══ CE MASOARA, SI DE CE DIN FISIER ═══
 *
 * Baseline-ul e schema PRODUCTIEI, regenerata la fiecare schimbare si verificata de CI fata de
 * productie. Deci intrebarea „are functia asta o revocare?" se poate pune aici, fara nicio
 * credentiala si fara retea, in fiecare rulare de probe.
 */

const BASELINE = "migrations/000-schema-baseline.sql";

/**
 * ⚠ SINGURA CARE RAMANE FARA REVOCARE, si cu motivul scris.
 *
 * `public.is_admin()` n-are NICIUN argument si citeste `auth.uid()`, deci nu poate raspunde decat
 * despre cel care o cheama. Deschisa, ea nu spune nimic despre altcineva.
 *
 * ⚠ Oricare alta care ajunge aici trebuie sa vina cu propriul rand de motiv. Daca nu poti scrie
 * motivul, raspunsul e revocarea, nu adaugarea in lista.
 */
const FARA_REVOCARE_DINADINS = ["public.is_admin"];

function baseline(): string {
  return readFileSync(BASELINE, "utf8").replace(/\r\n/g, "\n");
}

/** Numele functiilor declarate `SECURITY DEFINER`, si ale celor care au o revocare de la `public`. */
function masoara(text: string) {
  const definer = new Set<string>();
  let total = 0;
  const re = /CREATE OR REPLACE FUNCTION ([a-z_]+)\.([a-z_0-9]+)\(([^)]*)\)([\s\S]*?)(?=CREATE OR REPLACE FUNCTION|\n-- ── |$)/g;
  for (const m of text.matchAll(re)) {
    total++;
    if (/SECURITY DEFINER/.test(m[4])) definer.add(`${m[1]}.${m[2]}`);
  }
  const revocate = new Set(
    [...text.matchAll(/^revoke execute on function ([a-z_]+)\.([a-z_0-9]+)\(/gm)].map((m) => `${m[1]}.${m[2]}`),
  );
  return { total, definer, revocate };
}

test("⚠ proba insasi vede fisierul, si chiar gaseste functii in el", () => {
  /*
   * ⚠ Fara randul asta, o schimbare de forma in generator ar duce tiparul la ZERO potriviri, iar
   * afirmatia de mai jos ar trece triumfal peste o schema pe care n-a citit-o nimeni. Aceeasi
   * capcana ca „zero randuri nu e succes".
   */
  const { total, definer, revocate } = masoara(baseline());
  assert.ok(total > 100, `am gasit doar ${total} functii in baseline: tiparul nu mai prinde`);
  assert.ok(definer.size > 50, `am gasit doar ${definer.size} functii SECURITY DEFINER`);
  assert.ok(revocate.size > 50, `am gasit doar ${revocate.size} revocari`);
});

test("⚠⚠ fiecare functie SECURITY DEFINER are o revocare de la `public`", () => {
  const { definer, revocate } = masoara(baseline());
  const fara = [...definer].filter((f) => !revocate.has(f)).sort();

  assert.deepEqual(
    fara,
    FARA_REVOCARE_DINADINS,
    "Functiile de mai sus ruleaza cu drepturile PROPRIETARULUI si pot fi chemate de oricine,"
      + " fiindca in Postgres `EXECUTE` e al lui `PUBLIC` din oficiu. Scrie in migratie"
      + " `revoke execute on function … from public, anon, authenticated;` si apoi `grant` inapoi"
      + " CUI chiar trebuie. ⚠ `revoke … from anon` SINGUR nu face nimic: dreptul nu e al lui.",
  );
});

test("⚠ si revocarea se scrie de la `public`, nu doar de la `anon`", () => {
  /*
   * ⚠ Capcana din 19.08.2026, pusa aici ca sa nu se mai poata repeta: o migratie care revoca doar
   * de la `anon` lasa dreptul intreg, fiindca el vine de la `PUBLIC`. Numarul de revocari de la
   * `public` trebuie sa ramana cel putin cat numarul functiilor definer minus cele iertate.
   */
  const { definer, revocate } = masoara(baseline());
  const trebuie = definer.size - FARA_REVOCARE_DINADINS.length;
  const are = [...definer].filter((f) => revocate.has(f)).length;
  assert.equal(are, trebuie, `${are} revocari pentru ${trebuie} functii care le cer`);
});
