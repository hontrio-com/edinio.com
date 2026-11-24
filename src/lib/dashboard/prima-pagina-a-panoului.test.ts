import test from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";

/*
 * Doua hotarari ale proprietarului despre prima pagina a panoului, luate pe 24.11.2026.
 * Amandoua sunt SCOATERI, iar o scoatere se pierde usor: cine reface candva pagina dupa o
 * versiune veche, sau „pune la loc ce lipseste”, le-ar aduce inapoi fara sa stie ca au
 * fost scoase dinadins.
 */

const PAGINA = "src/app/(dashboard)/dashboard/page.tsx";
const PASI = "src/components/dashboard/ActivationChecklist.tsx";

/** Sursa fara comentarii: notele care povestesc ce a fost scos pomenesc chiar vorbele cautate. */
const faraComentarii = (cale: string) =>
  readFileSync(cale, "utf8").replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");

test("⚠ magazinul complet configurat nu mai primeste niciun indemn de plan", () => {
  /*
   * ⚠ CE ERA. Dupa ultimul pas bifat, conturile fara abonament vedeau „Magazinul tau e
   * complet configurat. Alege un plan ca sa ramai online dupa {data}”. Era facut pentru
   * testarea gratuita de 15 zile, scoasa pe 12.10.2026: de atunci magazinul se creeaza
   * numai dupa o plata confirmata.
   *
   * ⚠ CUM S-A VAZUT. Proprietarul l-a gasit pe contul lui de administrator: „Alege un plan
   * ca sa ramai online dupa 9 iunie”. Administratorii trec de poarta de plata, deci
   * ajungeau in panou si fara abonament, iar data se scria fara an.
   */
  const cod = faraComentarii(PASI);
  assert.match(cod, /if \(allDone\) return null;/, "lista completa nu mai dispare pe orice plan");
  assert.doesNotMatch(cod, /Alege un plan|ramai online|complet configurat/, "indemnul de plan a revenit in lista de pasi");
  assert.doesNotMatch(cod, /planExpiresAt|isTrial/, "lista de pasi se uita iar la planul contului");

  /* Si pagina nu-i mai trimite planul: altfel proprietatea ar sta acolo, gata de refolosit. */
  const apel = /<ActivationChecklist[\s\S]*?\/>/.exec(faraComentarii(PAGINA));
  assert.ok(apel, "nu am gasit lista de pasi pe prima pagina a panoului");
  assert.doesNotMatch(apel[0], /plan/i, "prima pagina ii trimite iar listei planul contului");
});

test("⚠ sectiunea „Noutăți” nu mai e pe prima pagina a panoului", () => {
  /*
   * Cerut cu vorbele „Scoate sectiunea aia cu noutati”. Sectiunea avea lista ultimelor
   * cinci anunturi publicate din administrare si, in capul ei, legatura „Ce e nou în
   * editor” (turul actualizarii). Au plecat amandoua.
   *
   * ⚠ Componenta listei (`ListaNoutati`) nu mai avea alt apelant si a fost stearsa. Pagina
   * de administrare a anunturilor a ramas, la fel si adresa turului (vezi
   * `tur-actualizare.test.ts`).
   */
  const cod = faraComentarii(PAGINA);
  assert.doesNotMatch(cod, /Noutăți|Noutati/, "titlul sectiunii a revenit pe prima pagina");
  assert.doesNotMatch(cod, /ListaNoutati|getLatestAnnouncements/, "lista de anunturi a revenit pe prima pagina");
  assert.doesNotMatch(cod, /tur=actualizare/, "legatura turului a revenit pe prima pagina");
  assert.equal(existsSync("src/components/dashboard/ListaNoutati.tsx"), false, "componenta listei de noutati exista din nou");
});
