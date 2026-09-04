import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

/*
  ═══════════════════════════════════════════════════════════════════════════
  „DUCE ADRESA ASTA UNDEVA?" — SOCOTEALA, SCRISĂ O SINGURĂ DATĂ
  ═══════════════════════════════════════════════════════════════════════════

  ⚠ ERAU DOUĂ COPII, ACUM E UNA. Aceeași funcție trăia și în `footer.test.ts`, și
  în `features.test.ts`, cu aceleași comentarii copiate. Pe 31.08.2026 era pe
  cale să apară a treia, iar trei copii ale unei socoteli înseamnă că peste un an
  două din ele nu mai știu de un caz pe care l-a învățat a treia.

  ⚠ FIȘIERUL ĂSTA E DOAR PENTRU PROBE. Citește discul cu `node:fs`, deci n-are ce
  căuta în nimic ce ajunge în browser. Nu-l importa din cod de aplicație.
*/

const AICI = dirname(fileURLToPath(import.meta.url));
const APP = join(AICI, "..", "..", "app");
const RADACINA = join(AICI, "..", "..", "..");

/**
 * Adevărat dacă App Router-ul are o pagină STATICĂ pentru adresa dată.
 *
 * ⚠ SEGMENTELE DINAMICE SE POTRIVESC, DAR NU ORIUNDE. Prima variantă le respingea
 * pe toate, cu motivul corect: `app/(public)/[slug]` e spațiul magazinelor și ar
 * fi făcut ORICE adresă să „existe", adică proba ar fi fost verde pe orice
 * greșeală de scriere.
 *
 * Dar respingerea în bloc arunca și rutele bune: `/vs/shopify` chiar are pagină,
 * la `app/(website)/vs/[competitor]/page.tsx`, prerandată din
 * `generateStaticParams`. Prima rulare a lui `adrese-declarate.test.ts` a raportat
 * cinci concurenți și șapte industrii ca fiind adrese rupte. Nu erau.
 * (Industriile au fost sterse cu totul pe 04.09.2026; randul de mai sus
 * ramane fiindca povesteste de ce exista fisierul asta, nu ce mai e viu.)
 *
 * Deosebirea adevărată nu e „dinamic sau nu", ci CINE deține segmentul:
 *   - `(public)/[slug]` e numele ales de un comerciant. Nu e o rută de site.
 *   - `(website)/vs/[competitor]` e o pagină de-a noastră, cu listă închisă.
 *
 * Deci se coboară prin segmente dinamice peste tot, în afară de `(public)`.
 * Controlul negativ din probe dovedește că funcția mai poate răspunde „nu".
 */
export function existaPaginaStatica(href: string): boolean {
  /* Se taie ancora și șirul de interogare: `/preturi#planuri` e tot `/preturi`. */
  const cale = href.split("#")[0].split("?")[0];
  return cauta(APP, cale.split("/").filter(Boolean));
}

/** Spațiul magazinelor. Nicio adresă de site nu trăiește aici. */
const GRUP_MAGAZINE = "(public)";

function cauta(dir: string, segmente: string[]): boolean {
  if (segmente.length === 0) {
    if (existsSync(join(dir, "page.tsx")) || existsSync(join(dir, "page.ts"))) return true;
    /*
      ⚠ PAGINA DE START STĂ ÎNTR-UN GRUP DE RUTE (`app/(website)/page.tsx`), iar
      grupurile nu apar în adresă. Fără coborârea asta, `existaPaginaStatica("/")`
      răspundea „nu" — prins de controlul negativ, nu citind codul. Se vede doar
      la adresa „/", fiindcă e singura fără niciun segment.
    */
    for (const e of readdirSync(dir, { withFileTypes: true })) {
      if (e.isDirectory() && e.name.startsWith("(") && e.name.endsWith(")")) {
        if (cauta(join(dir, e.name), [])) return true;
      }
    }
    return false;
  }
  const [cap, ...coada] = segmente;
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    if (!e.isDirectory()) continue;

    /* ⚠ Spațiul magazinelor nu se traversează deloc. Vezi nota de sus. */
    if (e.name === GRUP_MAGAZINE) continue;

    /* Grup de rute: nu consumă niciun segment, se coboară prin el. */
    if (e.name.startsWith("(") && e.name.endsWith(")")) {
      if (cauta(join(dir, e.name), segmente)) return true;
    } else if (e.name === cap && cauta(join(dir, e.name), coada)) {
      return true;
    } else if (e.name.startsWith("[") && e.name.endsWith("]") && cauta(join(dir, e.name), coada)) {
      /*
        Segment dinamic al nostru: `/vs/[competitor]`,
        `/ajutor/[categorie]/[ghid]`. Consumă un segment, ca unul obișnuit.
      */
      return true;
    }
  }
  return false;
}

/**
 * Adresele care au o redirectare permanentă în `next.config.ts`.
 *
 * ⚠ O ADRESĂ REDIRECTATĂ E LA FEL DE BUNĂ CA UNA CARE EXISTĂ, din punctul de
 * vedere al unui buton: omul ajunge undeva, nu în 404. De asta se citește și
 * lista asta, nu doar discul. `/roadmap` e exemplul viu — pagina nu mai există,
 * dar butonul care duce acolo nu e rupt.
 */
export function adreseRedirectate(): Set<string> {
  const config = readFileSync(join(RADACINA, "next.config.ts"), "utf8").replace(/\/\*[\s\S]*?\*\//g, "");
  const out = new Set<string>();
  for (const m of config.matchAll(/source:\s*["']([^"']+)["']/g)) out.add(m[1]);
  return out;
}
