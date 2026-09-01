import { createHash } from "node:crypto";

/*
  ═══════════════════════════════════════════════════════════════════════════════
  CAND E UN CONT CU ADEVARAT NOU, SI SUB CE ID SE NUMARA
  ═══════════════════════════════════════════════════════════════════════════════

  ⚠ DE CE EXISTA FISIERUL ASTA. Pana pe 01.09.2026, `sign_up` se trimitea dintr-un
  singur loc: `register()`, actiunea pentru inregistrarea cu email si parola.

  Dar inscrierea prin Google nu trece pe acolo. Ea merge prin
  `app/auth/callback/route.ts`, unde nimeni nu masura nimic.

  MASURAT IN BAZA, 01.09.2026: din 168 de conturi, 28 sunt prin Google — si 26 din
  cele 147 facute in ultimele 90 de zile. Adica aproape UNA DIN SASE inscrieri era
  invizibila in palnie: lipsea din GA4, lipsea din Meta, lipsea din TikTok.

  Nimic nu cadea. Rapoartele aratau o rata de conversie cu vreo 15% mai mica decat
  adevarul, si nimeni n-avea de unde sti.
*/

/**
 * E prima autentificare a contului asta, adica tocmai s-a nascut?
 *
 * ═══ ⚠ DE CE SE SCAD CELE DOUA DATE, IN LOC SA SE COMPARE CU CEASUL NOSTRU ═══
 *
 * Amandoua vin de la Supabase, deci diferenta dintre ele nu depinde de ceasul
 * serverului nostru. Un `now() - created_at` ar fi masurat si decalajul dintre
 * doua masini, care nu are nicio legatura cu intrebarea.
 *
 * ═══ ⚠ DE UNDE VINE FEREASTRA, SI CE SE INTAMPLA DACA E GRESITA ═══
 *
 * MASURAT pe toate conturile: la o inscriere adevarata prin Google, diferenta cea
 * mai mare a fost sub 5 secunde (minimul 0.39s) — atat dureaza dusul si intorsul
 * pe la Google. Fereastra de 60 de secunde e larga dinadins, cu mult peste ce s-a
 * vazut vreodata.
 *
 * ⚠ Ca sa cada gresit, cineva ar trebui sa iasa din cont si sa intre din nou in
 * mai putin de un minut de la crearea lui. Iar chiar si atunci paguba e mica:
 * `event_id`-ul e ACELASI (vezi mai jos), deci Meta si TikTok il unesc cu primul.
 * Numai GA4 ar vedea doua `sign_up`-uri.
 *
 * ⚠ SI NU: NU se poate folosi `onboarding_completed` singur ca semnal. Cine si-a
 * facut cont acum trei saptamani si n-a terminat onboardingul intra pe aceeasi
 * cale de fiecare data cand se autentifica — s-ar numara la nesfarsit.
 */
const FEREASTRA_MS = 60_000;

export function ePrimaAutentificare(
  utilizator: { created_at?: string | null; last_sign_in_at?: string | null } | null | undefined,
): boolean {
  if (!utilizator?.created_at || !utilizator.last_sign_in_at) return false;

  const nascut = Date.parse(utilizator.created_at);
  const intrat = Date.parse(utilizator.last_sign_in_at);
  if (Number.isNaN(nascut) || Number.isNaN(intrat)) return false;

  /*
    ⚠ `intrat < nascut` NU e cu neputinta: cele doua campuri se scriu de servicii
    deosebite ale Supabase si pot ajunge cu cateva milisecunde pe dos. Se ia
    valoarea absoluta, altfel exact inscrierile cele mai rapide ar fi respinse.
  */
  return Math.abs(intrat - nascut) < FEREASTRA_MS;
}

/*
  ⚠ SAREA NU E UN SECRET SI N-ARE DE CE SA FIE. Rostul ei e ca id-ul trimis catre
  Meta si TikTok sa nu FIE chiar id-ul din baza noastra — nu sa fie de nedescifrat
  de cine are deja id-ul. Pusa intr-o variabila de mediu, ar fi introdus o cheie
  care, schimbata din greseala, ar rupe tacut deduplicarea dintre browser si
  server. Scrisa aici, nu se schimba niciodata din greseala.
*/
const SARE = "edinio.marketing.conversie.v1";

/**
 * Id-ul sub care se numara o inscriere, peste tot.
 *
 * ═══ ⚠ DE CE NU UN `randomUUID()`, ASA CUM ERA ═══
 *
 * Un id aleator e unic, dar nu se poate REPRODUCE. Si asta strica doua lucruri:
 *
 * 1. TRIMITEREA DE PE SERVER. Cand acelasi cont nou pleaca si prin CAPI, serverul
 *    trebuie sa poata calcula ACELASI id fara sa-l care nimeni prin cookie-uri.
 *    Cu un uuid aleator, ar fi trebuit pastrat undeva — inca o stare care se
 *    poate pierde.
 * 2. NUMARATUL DE DOUA ORI. Daca semnalul pleaca din doua locuri (calea cu email
 *    si calea Google), doua id-uri aleatoare inseamna doua conversii. Acelasi id
 *    calculat din acelasi cont inseamna una singura, oricate drumuri ar avea.
 *
 * ⚠ SI NU PLEACA ID-UL NOSTRU CA ATARE. Ce iese e o amprenta, nu cheia dupa care
 * cautam un om in baza.
 */
export function idConversieCont(idUtilizator: string): string {
  return createHash("sha256").update(`${SARE}:${idUtilizator}`).digest("hex").slice(0, 32);
}
