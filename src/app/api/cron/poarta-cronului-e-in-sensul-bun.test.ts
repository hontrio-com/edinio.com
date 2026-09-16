import { strict as assert } from "node:assert";
import { test, describe } from "node:test";
import { readFileSync, readdirSync, existsSync } from "node:fs";
import { join } from "node:path";

/*
 * ═══════════════════════════════════════════════════════════════════════════
 * POARTA CRONULUI E IN SENSUL BUN, LA TOATE                  (16.09.2026)
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * `verificaCron(req)` intoarce un `boolean`, nu un raspuns. Deci forma corecta e
 * `if (!verificaCron(req)) return 401`, iar tiparul care arata a paza dar e pe dos,
 *
 *     const refuz = verificaCron(req);
 *     if (refuz) return refuz;
 *
 * face cronul sa ruleze **DOAR pentru cine NU e autorizat**, si sa intoarca `true` in loc de un
 * raspuns. Adica exact pe dos fata de ce pare ca scrie.
 *
 * ⚠⚠ L-am scris chiar eu, azi, intr-un cron nou, copiind tiparul unei rute care intoarce
 * `NextResponse | null`. Si nu m-a prins nimic din ce rulez de obicei:
 *   * `tsc --noEmit` a TRECUT;
 *   * proba mea care cerea ca poarta sa fie INAINTEA bazei a trecut si ea, fiindca masura locul,
 *     nu sensul;
 *   * a cazut abia `npm run build`, care verifica tipurile rutelor generate de Next.
 *
 * Un build care prinde o gaura de autorizare e noroc, nu plasa. Proba asta o face plasa, si o
 * intinde peste TOATE cronurile: masurat la scrierea ei, 43 corecte si zero gresite, deci nu
 * repara nimic azi. Exista pentru al 44-lea.
 *
 * ⚠ Nu se pune in dosarul unui cron: regula e a tuturor, ca la refuzul tokenului celor trei
 * clienti.
 */

const CRONURI = join("src", "app", "api", "cron");

const viu = (cale: string) =>
  readFileSync(cale, "utf8").replace(/\r\n/g, "\n")
    .replace(/\/\*[\s\S]*?\*\//g, "").replace(/^[ \t]*\/\/.*$/gm, "");

function rute(): { nume: string; cale: string }[] {
  return readdirSync(CRONURI, { withFileTypes: true })
    .filter((d) => d.isDirectory())
    .map((d) => ({ nume: d.name, cale: join(CRONURI, d.name, "route.ts") }))
    .filter((r) => existsSync(r.cale))
    .sort((a, b) => a.nume.localeCompare(b.nume));
}

describe("Toate cronurile isi apara poarta in sensul bun", () => {
  test("⚠ cititorul chiar gaseste rutele", () => {
    /* Fara garda asta, o mutare de dosar ar face toate probele de mai jos sa treaca peste nimic. */
    assert.ok(rute().length >= 40, `s-au gasit doar ${rute().length} rute de cron`);
  });

  test("⚠⚠ niciuna nu foloseste rezultatul lui `verificaCron` DREPT raspuns", () => {
    /*
     * Tiparul `const x = verificaCron(req); if (x) return x;` inverseaza poarta: trece exact cine
     * n-ar trebui. Se cauta forma, nu efectul, fiindca efectul nu se poate rula de aici.
     */
    const gresite: string[] = [];
    for (const { nume, cale } of rute()) {
      const s = viu(cale);
      if (!s.includes("verificaCron")) continue;
      if (/const\s+\w+\s*=\s*verificaCron\(req\);\s*\n\s*if\s*\(\s*\w+\s*\)\s*return\s+\w+;/.test(s)) {
        gresite.push(nume);
      }
    }
    assert.deepEqual(gresite, [], "poarta e inversata: cronul ruleaza pentru cine NU e autorizat");
  });

  test("⚠⚠ si fiecare ruta de cron CHIAR are poarta", () => {
    /*
     * Un cron fara poarta e o ruta publica ce scrie in baza cu rol de serviciu, adica ocolind RLS.
     * Masurat azi: zero fara. Proba exista ca sa ramana asa.
     */
    const fara: string[] = [];
    for (const { nume, cale } of rute()) {
      if (!viu(cale).includes("verificaCron")) fara.push(nume);
    }
    assert.deepEqual(fara, [], "ruta de cron fara verificare de autorizare");
  });

  test("⚠ si poarta vine INAINTEA deschiderii bazei", () => {
    /*
     * Ordinea singura nu e de ajuns (vezi antetul), dar lipsa ei inseamna ca ruta lucreaza pentru
     * un apelant neverificat: deschide clientul cu rol de serviciu si abia apoi intreaba cine e.
     */
    const tarziu: string[] = [];
    for (const { nume, cale } of rute()) {
      const s = viu(cale);
      if (!s.includes("verificaCron")) continue;
      const i = s.search(/export async function (GET|POST)/);
      if (i < 0) continue;
      const corp = s.slice(i);
      const poarta = corp.indexOf("verificaCron");
      const baza = corp.search(/createClient|createAdminClient/);
      if (poarta >= 0 && baza >= 0 && poarta > baza) tarziu.push(nume);
    }
    assert.deepEqual(tarziu, [], "cronul deschide baza inainte sa verifice cine il cheama");
  });
});
