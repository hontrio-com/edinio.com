import { strict as assert } from "node:assert";
import { test } from "node:test";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

/*
 * Proba care ar fi prins constructia cazuta din 24.08.2026.
 *
 * ═══ CE S-A INTAMPLAT ═══
 *
 * `EmagCampanii.tsx` — componenta de CLIENT — importa doua constante
 * (`REDUCERE_MINIMA`, `REDUCERE_MAXIMA`) din `lib/emag/campanii.ts`, ca sa le scrie
 * sub un camp. Perfect rezonabil la citit.
 *
 * Dar `campanii.ts` importa `client.ts`, iar `client.ts` aduce `undici` si
 * `node:async_hooks`. Niciunul nu exista in browser. `npm run build` a cazut cu:
 *
 *   the chunking context (unknown) does not support external modules
 *   (request: node:async_hooks)
 *
 * ═══ DE CE O PROBA CARE CITESTE FISIERE ═══
 *
 * Fiindca `npx tsc --noEmit` TRECE. Tipurile sunt in regula; ce nu e in regula e unde
 * ajunge codul. Singurul lucru care prindea defectul era constructia — adica pasul
 * cel mai lung si cel mai scump din tot lantul.
 *
 * Aici se prinde in cateva milisecunde, la `npm test`.
 *
 * ⚠ S-a mai intamplat o data, si tot asa s-a reparat: `coleteDeTrimis` a fost scos din
 * `awb.ts` intr-un `colete.ts` fara niciun import, fiindca modalul de AWB il cerea.
 * Tiparul e acelasi, deci merita pazit, nu tinut minte.
 */

/** Dosarul cu componente. */
const COMPONENTE = join(process.cwd(), "src", "components");

/**
 * Module care NU au ce cauta intr-o componenta de client, nici direct, nici prin
 * altele.
 *
 * ⚠ Lista e a CAILOR CARE AJUNG LA RETEA sau la baza de date. Nu e o lista de
 * „fisiere mari": `mapping.ts`, `colete.ts`, `propuneri.ts`, `deriva.ts`,
 * `pregatire.ts` si `ean.ts` sunt curate dinadins si POT fi importate.
 */
const INTERZISE = [
  "@/lib/emag/client",
  "@/lib/emag/campanii",
  "@/lib/emag/awb",
  "@/lib/emag/jurnal",
  "@/lib/emag/jurnal-scriere",
  "@/lib/emag/trimite",
  "@/lib/emag/orders",
  "@/lib/emag/sync",
  "@/lib/emag/taxonomy",
  "@/lib/emag/rma",
  "@/lib/emag/facturi",
  "@/lib/emag/import",
  "@/lib/emag/import-run",
  "@/lib/emag/import-produse",
  "@/lib/emag/queue",
  "@/lib/supabase/admin",
];

function fisiere(dir: string): string[] {
  const gasite: string[] = [];
  for (const intrare of readdirSync(dir, { withFileTypes: true })) {
    const cale = join(dir, intrare.name);
    if (intrare.isDirectory()) gasite.push(...fisiere(cale));
    else if (intrare.name.endsWith(".tsx")) gasite.push(cale);
  }
  return gasite;
}

test("componentele de client NU importa module care ajung la retea sau la baza", () => {
  const vinovate: string[] = [];

  for (const cale of fisiere(COMPONENTE)) {
    const text = readFileSync(cale, "utf8");

    /* Numai componentele de client. Cele de server au voie la tot. */
    if (!/^\s*["']use client["']/m.test(text)) continue;

    for (const modul of INTERZISE) {
      /*
       * ⚠ Se cauta importul, nu simpla pomenire. Un comentariu care EXPLICA de ce nu
       * se importa `client.ts` — exact cel scris in `EmagCampanii.tsx` — n-are voie sa
       * dea proba peste cap; altfel prima reactie ar fi fost stergerea explicatiei.
       */
      const tipar = new RegExp(`from\\s+["']${modul.replace(/[.*+?^${}()|[\\]\\\\]/g, "\\\\$&")}["']`);
      if (tipar.test(text)) {
        vinovate.push(`${cale.replace(process.cwd(), "")} → ${modul}`);
      }
    }
  }

  assert.deepEqual(
    vinovate,
    [],
    "O componenta de client importa un modul de server. Constructia va cadea cu "
    + "„does not support external modules”. Muta partea CURATA intr-un fisier fara "
    + "importuri de rulare, ca `colete.ts` sau `propuneri.ts`.",
  );
});

test("proba stie sa deosebeasca un import de o pomenire in comentariu", () => {
  /* ⚠ Fara asta, proba de mai sus ar fi putut trece degeaba (daca nu prinde nimic
     niciodata) sau ar fi cazut pe explicatii (daca prinde orice text). Se verifica
     amandoua sensurile, pe siruri scrise aici. */
  const tipar = new RegExp(`from\\s+["']@/lib/emag/client["']`);
  assert.equal(tipar.test('import { scrie } from "@/lib/emag/client";'), true, "prinde importul");
  assert.equal(tipar.test("/* nu se importa @/lib/emag/client fiindca aduce undici */"), false,
    "nu cade pe o explicatie");
});
