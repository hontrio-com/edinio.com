/**
 * Adresa pe care o dam ALTORA ca sa ne cheme inapoi.
 *
 * ═══ ⚠⚠ MASURAT PE PRODUCTIE, 17.09.2026 ═══
 *
 * Platforma avea DOUA variabile pentru acelasi lucru, si raspundeau diferit:
 *
 *   `NEXT_PUBLIC_SITE_URL` = `https://edinio.com`      (APEX, folosit de notice.ro)
 *   `NEXT_PUBLIC_APP_URL`  = nesetata                  (deci SMSO cadea pe `https://www.edinio.com`)
 *
 * ⚠ **Apexul raspunde `308` catre `www`.** Verificat cu o cerere adevarata. Pentru un om intr-un
 * browser nu se vede; pentru un server care ne cheama inapoi, e o presupunere in plus: multi
 * furnizori de webhook-uri nu urmeaza deloc redirectarile, iar cine n-o urmeaza nu ne mai gaseste si
 * nu ne spune nimic. Un esec perfect tacut, exact felul de esec pe care nu-l observi luni de zile.
 *
 * ⚠ SI `??` NU E DE AJUNS. Toate cele 33 de locuri din platforma scriu
 * `process.env.NEXT_PUBLIC_SITE_URL ?? "…"`, dar `??` cade doar pe `null`, nu si pe SIRUL GOL, iar
 * local variabila chiar e `""`. Deci adresa devenea `"/api/…"`, adica relativa, adica trimisa unui
 * server strain care n-are ce face cu ea. Aici se foloseste `||`, si se verifica si forma.
 */

/** Gazda catre care ne redirectam oricum. Cine ne cheama inapoi trebuie sa vina direct aici. */
const CANONICA = "https://www.edinio.com";

/**
 * Radacina absoluta a platformei, potrivita pentru a fi data unui server strain.
 *
 * Fara „/” la coada, mereu `https`, mereu pe gazda canonica.
 */
export function adresaPublica(): string {
  const brut = (process.env.NEXT_PUBLIC_APP_URL || process.env.NEXT_PUBLIC_SITE_URL || "").trim();
  if (!brut) return CANONICA;

  let u: URL;
  try {
    u = new URL(brut);
  } catch {
    /* O valoare stricata nu are voie sa dea o adresa stricata mai departe. */
    return CANONICA;
  }
  /* ⚠ Apexul se ridica la `www`, altfel fiecare chemare inapoi trece printr-o redirectare. */
  if (u.hostname === "edinio.com") u.hostname = "www.edinio.com";
  return `${u.protocol}//${u.host}`.replace(/\/+$/, "");
}
