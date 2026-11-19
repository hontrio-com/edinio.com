import { cssFeteRomanesti } from "@/lib/fonturi-ro-css";

/** Calculat o data: lista e fixa (`lib/fonturi-ro.ts`, generata). */
const CSS_TOATE = cssFeteRomanesti();

/**
 * Fetele de font cu literele romanesti (`lib/fonturi-ro-css.ts` spune de ce exista si de ce stau aici).
 *
 * ⚠ Un `<style>` simplu, in corpul paginii, INAINTEA continutului: trebuie sa vina dupa foile din `<head>` (acolo isi
 * declara `next/font` fetele) si inaintea primului text. Fara `href` / `precedence`, deci React nu-l muta in `<head>`.
 * Continutul e o constanta a noastra (nume de familii si de fisiere generate), nimic scris de comerciant.
 */
export function FeteRomanesti() {
  return <style data-fete-ro="" dangerouslySetInnerHTML={{ __html: CSS_TOATE }} />;
}
