/**
 * Ritmul catre un furnizor, numarat INTR-UN SINGUR LOC pentru toate instantele.
 *
 * ═══ ⚠ GALEATA DIN MEMORIE NU POATE NUMARA CE FAC CELELALTE INSTANTE ═══
 *
 * O galeata locala taie varfurile fara sa coste nimic, si e bine s-o ai. Dar traieste in
 * memoria instantei, iar acelasi cont de vanzator e folosit din mai multe locuri deodata:
 *
 *   cronul, pe o instanta          bugetul intreg
 *   importul, pe alta              bugetul intreg
 *   un buton apasat de om          bugetul intreg
 *   un webhook sosit intre timp    bugetul intreg
 *
 * Fiecare crede ca are tot bugetul. Furnizorul vede suma.
 *
 * ⚠ Iar depasirea nu se plateste doar cu un 429: si eMAG, si Trendyol numara si cererile
 * RESPINSE in limita. Deci bugetul ars e chiar cel prin care trebuie sa plece o miscare de
 * stoc dupa o vanzare — iar aceea intarziata inseamna supravanzare.
 *
 * ═══ ⚠ SE CADE DESCHIS, NU INCHIS ═══
 *
 * Daca baza nu raspunde, cererea PLEACA. Doua motive, si sunt hotaratoare:
 *
 *   1. Mai exista o plasa care nu tine de baza: antetele lor si 429-ul. Depasirea costa o
 *      intarziere, nu date pierdute.
 *   2. Cazuta inchis, o pana a bazei ar opri TOATE cererile catre furnizor ale tuturor
 *      magazinelor — inclusiv confirmarile de comenzi si miscarile de stoc. Adica un
 *      incident mult mai mare decat cel de care ne aparam.
 *
 * ⚠ MUTAT AICI DIN `src/lib/emag/ritm.ts` PE 26.08.2026: auditul Trendyol a aratat ca acolo
 * nu exista niciun limitator impartit, doar o pauza de 350 ms in bucla cronului. Regula era
 * scrisa, dar statea intr-un folder pe care Trendyol n-avea cum sa-l vada — a treia oara
 * intr-o zi cand se intampla asta.
 */

import { createAdminClient } from "@/lib/supabase/admin";
import { logError } from "@/lib/error-logger";

export interface RaspunsJeton {
  ok: boolean;
  asteapta_ms: number;
  folosite: number;
  limita: number;
  /** Furnizorul ne-a spus sa tacem; nu e o simpla depasire de galeata. */
  pauza?: boolean;
}

/**
 * Cere un jeton. Intoarce cate milisecunde sa se astepte; `0` inseamna „pleaca acum".
 *
 * ⚠ La orice necaz cu baza se raspunde `0`. Vezi nota de sus: se cade DESCHIS.
 */
export async function ceruJeton(
  cheie: string, limita: number, fereastraMs: number, unde = "ritm",
): Promise<RaspunsJeton> {
  try {
    const { data, error } = await createAdminClient().rpc("ia_jeton_extern", {
      p_cheie: cheie, p_limita: limita, p_fereastra_ms: fereastraMs,
    });
    if (error) {
      /* ⚠ Se scrie, dar nu se opreste nimic. Un contor de ritm cazut e o problema de
         observat, nu una care are voie sa taie legatura cu marketplace-ul. */
      void logError({
        action: `${unde}.ritm`,
        message: `jetonul de ritm nu s-a putut lua: ${error.message}`,
        details: { limita, fereastraMs },
        severity: "warning",
      });
      return { ok: true, asteapta_ms: 0, folosite: 0, limita };
    }
    const r = (data ?? {}) as Partial<RaspunsJeton>;
    return {
      ok: r.ok !== false,
      asteapta_ms: Number(r.asteapta_ms) || 0,
      folosite: Number(r.folosite) || 0,
      limita: Number(r.limita) || limita,
      pauza: r.pauza === true,
    };
  } catch {
    return { ok: true, asteapta_ms: 0, folosite: 0, limita };
  }
}

/**
 * Cat se poate astepta, cu totul, dupa un jeton.
 *
 * ═══ ⚠ UN LIMITATOR CARE DOARME CAT TOATA TRECEREA NU LIMITEAZA, BLOCHEAZA ═══
 *
 * Cronurile au un minut. O asteptare „pana se elibereaza fereastra" poate dormi singura cat
 * toata trecerea — si atunci nu mai pleaca NIMIC: nici confirmarile de comenzi, nici
 * miscarile de stoc dupa vanzari, care sunt cele mai grabite dintre toate.
 *
 * Deci se asteapta cel mult atat, si se raspunde cinstit daca n-a venit.
 */
const ASTEPTARE_MAXIMA_MS = 5000;

/** Cat se doarme intre doua incercari. Se recitesc des, ca sa nu se piarda o fereastra. */
const PAS_ASTEPTARE_MS = 750;

/**
 * Asteapta pana cand contul are loc pentru inca o cerere.
 *
 * Intoarce `false` daca n-a venit in bugetul de timp. NU e o eroare — e raspunsul, iar ce se
 * intampla mai departe hotaraste apelantul.
 */
export async function asteaptaJetonImpartit(
  cheie: string, limita: number, fereastraMs: number, unde = "ritm",
): Promise<boolean> {
  const pana = Date.now() + ASTEPTARE_MAXIMA_MS;
  for (;;) {
    const r = await ceruJeton(cheie, limita, fereastraMs, unde);
    if (r.ok) return true;
    if (Date.now() >= pana) return false;
    await new Promise((gata) => setTimeout(gata, Math.min(PAS_ASTEPTARE_MS, Math.max(1, r.asteapta_ms))));
  }
}

/**
 * Furnizorul a spus „prea repede". O spune TUTUROR instantelor.
 *
 * ═══ ⚠ FARA ASTA, UN 429 IL IA FIECARE PE RAND ═══
 *
 * Prima instanta ia 429 si se opreste; celelalte trei continua sa bata la aceeasi usa, si
 * fiecare pana isi arde propriile jetoane. Iar cererile respinse se numara si ele in limita
 * lor, deci pauza necoordonata face raul mai mare, nu mai mic.
 *
 * ⚠ NU SCURTEAZA O PAUZA EXISTENTA (`greatest` in SQL): doua instante care iau 429 in aceeasi
 * secunda, una cu `Retry-After: 60` si alta fara antet, n-au voie sa se calce — cea care stie
 * mai mult castiga.
 */
export async function spunePauza(cheie: string, ms: number, unde = "ritm"): Promise<void> {
  try {
    const { error } = await createAdminClient().rpc("pune_pauza_ritm_extern", {
      p_cheie: cheie, p_ms: Math.max(1000, Math.round(ms)),
    });
    if (error) {
      void logError({
        action: `${unde}.ritm`,
        message: `pauza de ritm nu s-a putut scrie: ${error.message}`,
        details: { ms }, severity: "warning",
      });
    }
  } catch {
    /* ⚠ Tacere dinadins: pauza e o imbunatatire, nu o conditie. Cererea urmatoare va lua tot
       un 429 si va incerca din nou s-o scrie. */
  }
}

/**
 * Cate milisecunde cere furnizorul sa asteptam, din antetele raspunsului.
 *
 * ⚠ `Retry-After` poate fi si SECUNDE, si o DATA HTTP — amandoua sunt in standard, si ambele
 * apar in salbaticie. Citita gresit, o data ar fi iesit `NaN` si pauza ar fi fost implicita.
 */
export function asteptareaCerutaDeEi(antete: Headers, implicitMs = 30_000): number {
  const brut = antete.get("retry-after") ?? antete.get("Retry-After");
  if (brut) {
    const secunde = Number(brut.trim());
    if (Number.isFinite(secunde) && secunde >= 0) return Math.round(secunde * 1000);
    const data = Date.parse(brut);
    if (Number.isFinite(data)) return Math.max(0, data - Date.now());
  }
  return implicitMs;
}
