import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { test } from "node:test";
import { TEME } from "@/lib/teme/teme";
import { culoareaPesteTema, CULOARE_IMPLICITA } from "./aspect";
import { pentruCine, temelePeScurt } from "@/lib/teme/teme-pe-scurt";

/*
  ═══ TEMELE LA PASUL „ASPECT” AL INSCRIERII (16.11.2026) ═══

  Cerut de el: „La Aspect in loc de stilul magazinului, adaugi Teme”. Raspunsurile lui: culoarea „Rămâne, după temă”,
  bifa datelor demo „pornita by default”, nicio tema aleasa la intrare. Probele de mai jos apara regulile astea si pe
  cea a pachetului: cele 30 de teme intregi (designuri, date demo) raman pe server.
*/

const cod = (cale: string) => readFileSync(cale, "utf8").replace(/\/\*[\s\S]*?\*\/|^\s*\/\/.*$/gm, "");

test("lista pasului: toate temele, in ordinea lui, fiecare cu captura, culoarea si pentru cine e", () => {
  const lista = temelePeScurt("localhost:3000");
  assert.deepEqual(lista.map((t) => t.cheie), TEME.map((t) => t.cheie));
  for (const t of lista) {
    assert.ok(t.captura, `${t.cheie}: fara captura, cardul ar fi gol`);
    assert.ok(existsSync(`public${t.captura.adresa}`), `${t.cheie}: captura lipseste din public/`);
    assert.match(t.culoare, /^#[0-9a-fA-F]{6}$/, t.cheie);
    assert.match(t.pentru, /^Pentru /, t.cheie);
    assert.ok(t.pentru.length < t.descriere.length, `${t.cheie}: „pentru cine” trebuie sa fie scurt`);
    assert.equal(t.adresaDemo, `http://${t.cheie}.localhost:3000`);
    assert.ok(t.demo.produse > 0, `${t.cheie}: bifa ar promite date demo pe care tema nu le are`);
  }
  assert.equal(temelePeScurt("www.edinio.com")[0].adresaDemo, `https://${TEME[0].cheie}.edinio.com`);
});

test("„pentru cine”: descrierea pana la primele doua puncte; fara ele, intreaga", () => {
  assert.equal(pentruCine("Pentru magazine de modă: alb-negru, colțuri drepte."), "Pentru magazine de modă");
  assert.equal(pentruCine("Pentru orice magazin"), "Pentru orice magazin");
});

test("⚠⚠ culoarea peste tema: a omului castiga doar cand e alta; o lipsa NU devine verdele platformei", () => {
  assert.equal(culoareaPesteTema("#0B3D7A", "#0b3d7a"), null, "aceeasi culoare, scrisa altfel: ramane a temei");
  assert.equal(culoareaPesteTema(" #E11D48 ", "#0B3D7A"), "#E11D48");
  for (const gresita of [undefined, null, "", "rosu", "#12345", "#1234567", 42]) {
    assert.equal(culoareaPesteTema(gresita, "#0B3D7A"), null, `${String(gresita)}: ar fi sters culoarea temei`);
  }
  assert.notEqual(culoareaPesteTema(undefined, "#0B3D7A"), CULOARE_IMPLICITA);
});

test("⚠⚠ pachetul pasului NU trage temele: pagina e de server si da clientului doar lista mica", () => {
  const pagina = cod("src/app/(onboarding)/onboarding/aspect/page.tsx");
  assert.doesNotMatch(pagina, /"use client"/, "pagina a devenit client: `TEME` ar intra in pachet");
  assert.match(pagina, /<AspectInscriere teme=\{temelePeScurt\(gazda\)\} \/>/);
  const client = cod("src/components/onboarding/AspectInscriere.tsx");
  assert.match(client, /^"use client";/);
  assert.doesNotMatch(client, /^import (?!type )[^;]*from "@\/lib\/teme\//m, "componenta client importa VALORI din lib/teme: designurile si datele demo intra in pachet");
  assert.match(client, /import type \{ TemaPeScurt \} from "@\/lib\/teme\/teme-pe-scurt";/,
    "lista se importa doar ca TIP: modulul e `server-only`");
  assert.match(cod("src/lib/teme/teme-pe-scurt.ts"), /^import "server-only";/);
});

test("⚠ raspunsurile lui pe ecran: nicio tema la intrare, bifa demo pornita, culoarea sare pe a temei", () => {
  const c = cod("src/components/onboarding/AspectInscriere.tsx");
  assert.match(c, /const \[cheie, setCheie\] = useState<string \| null>\(null\);/, "o tema aleasa din oficiu");
  assert.match(c, /const \[dateDemo, setDateDemo\] = useState\(true\);/, "bifa datelor demo trebuie sa porneasca PORNITA");
  assert.match(c, /const poateContinua = !!ciorna && !!tema;/);
  assert.match(c, /dezactivat=\{!poateContinua\}/);
  assert.match(c, /disabled=\{!poateContinua\}/);
  assert.match(c, /function alegeTema\(t: TemaPeScurt\) \{\s*setCheie\(t\.cheie\);\s*setCuloare\(t\.culoare\);\s*scrieCiorna\(\{ tema: t\.cheie, culoare: t\.culoare \}\);/);
  assert.match(c, /scrieCiorna\(\{ tema: tema\.cheie, culoare, dateDemo \}\);/);
});

test("⚠⚠ crearea magazinului aplica tema pe drumul paginii „Teme”, dupa designul de pornire, fara sa opreasca crearea", () => {
  const plan = cod("src/app/(onboarding)/onboarding/plan/page.tsx");
  assert.match(plan, /tema: details\.tema,\s*dateDemo: details\.dateDemo === true,/);

  const s = cod("src/lib/actions/business.actions.ts");
  const design = s.indexOf("const design = designInitial(stil.id, ctx);");
  const tema = s.indexOf("const tema = temaDupaCheie(data.tema);");
  const aplica = s.indexOf("const aplicata = await aplicaTema(business.id, tema.cheie, cuDateDemo);");
  const gata = s.indexOf(".update({ onboarding_completed: true } as never)");
  assert.ok(design > 0 && tema > design, "tema trebuie aplicata DUPA designul de pornire (care intra in Istoric)");
  assert.ok(aplica > tema && gata > aplica, "tema, inainte de onboardingul incheiat");
  // Datele demo: doar un `true` adevarat si doar cat incape planul.
  assert.match(s, /let cuDateDemo = data\.dateDemo === true;\s*if \(cuDateDemo\) \{/);
  assert.match(s, /const loc = await citesteLoculPentruDemo\(supabase, user\.id, business\.id, tema\.cheie, tema\.date\);\s*cuDateDemo = !\("error" in loc\) && loc\.incap;/);
  /*
    ⚠⚠ Dupa o plata confirmata de Stripe, planul il scrie webhook-ul, poate DUPA cererea asta: limita citita inainte e a
    planului gratuit (10 produse), iar tema ar fi intrat fara datele demo. Asteptarea vine INAINTEA citirii limitei.
  */
  const asteapta = s.indexOf("if (plata.ok) await asteaptaPlanulPlatit(adminDb, user.id, 6_000);");
  const citeste = s.indexOf("const loc = await citesteLoculPentruDemo(");
  assert.ok(asteapta > tema && asteapta < citeste, "limita datelor demo se citeste fara sa astepte planul platit");
  assert.match(s, /^async function asteaptaPlanulPlatit\(/m, "ajutorul trebuie sa ramana NEEXPORTAT: in fisierul asta orice export e o actiune");
  // Si actiunea are timp pentru asteptare si import: onboardingul ridica limita functiei.
  assert.match(cod("src/app/(onboarding)/layout.tsx"), /^export const maxDuration = 60;/m);
  // O tema cazuta se scrie in jurnal si crearea merge mai departe (fara `return` pe ramura ei).
  const ramura = s.slice(aplica, gata);
  assert.match(ramura, /if \("error" in aplicata\) \{\s*await logError\(\{ action: "createBusiness\.tema"/);
  assert.doesNotMatch(ramura, /\breturn\b/, "o tema cazuta nu are voie sa opreasca crearea magazinului");
  // Culoarea omului, doar dupa tema aplicata si doar cand e alta.
  assert.match(ramura, /\} else \{\s*const culoare = culoareaPesteTema\(data\.primary_color, tema\.identitate\.culoare\);\s*if \(culoare\)/);
});
