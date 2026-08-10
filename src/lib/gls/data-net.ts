/**
 * Datele MyGLS vin in formatul serializatorului .NET, nu ISO.
 *
 *     /Date(1712345678000+0200)/
 *
 * Trecut direct intr-un `new Date()`, iese „Invalid Date", iar in panou apare un
 * camp gol pe care nimeni nu-l leaga de format.
 *
 * ═══ ⚠ DE CE NU STA IN `gls.actions.ts` ═══
 *
 * Fisierele cu `"use server"` au doua reguli care se uita usor:
 *
 * 1. **Fiecare export devine o actiune apelabila** de oriunde, cu un simplu POST.
 *    Un ajutor pur n-are ce cauta expus asa. (Lectia e deja platita in proiect:
 *    un helper de logare devenise scriere anonima in baza.)
 * 2. **Toate exporturile trebuie sa fie functii async.** O functie sincura
 *    exportata de acolo pica la build — dar nu la `tsc`, deci se descopera tarziu.
 *
 * Aici e si probabil: un fisier obisnuit se poate importa direct in probe.
 */

/**
 * `/Date(1712345678000+0200)/` → ISO 8601.
 *
 * Intoarce `null` cand nu se poate citi, nu „Invalid Date": un camp gol se
 * citeste ca lipsa de date, pe cand „Invalid Date" arata ca un defect al nostru
 * si trimite pe drum gresit.
 *
 * ⚠ Decalajul din paranteza (`+0200`) se IGNORA dinadins. Numarul dinaintea lui
 * e deja milisecunde de la epoca UTC — decalajul spune doar in ce fus a fost
 * afisata data la ei. Aplicat inca o data peste, ora ar iesi mutata cu doua ore.
 */
export function dataDinNet(valoare: string | null | undefined): string | null {
  if (!valoare) return null;

  const m = /\/Date\((-?\d+)([+-]\d{4})?\)\//.exec(valoare);
  if (m) {
    const ms = Number(m[1]);
    return Number.isFinite(ms) ? new Date(ms).toISOString() : null;
  }

  /* Daca GLS trece vreodata pe ISO, nu vrem sa ne prefacem ca nu intelegem. */
  const direct = new Date(valoare);
  return Number.isNaN(direct.getTime()) ? null : direct.toISOString();
}
