/**
 * Ritmul catre eMAG, numarat INTR-UN SINGUR LOC.
 *
 * ═══ ⚠ GALEATA DIN MEMORIE NU POATE NUMARA CE FAC CELELALTE INSTANTE ═══
 *
 * `client.ts` are de mult o galeata cu jetoane, si e bine ca o are: taie varfurile locale
 * fara sa coste nimic. Dar traieste in memoria instantei, iar aceeasi cheie de vanzator e
 * folosita din mai multe locuri deodata:
 *
 *   cronul, pe o instanta          3/s
 *   importul, pe alta              3/s
 *   un buton apasat de om          3/s
 *   un webhook sosit intre timp    3/s
 *
 * Fiecare crede ca are bugetul intreg. eMAG vede suma.
 *
 * ⚠ Iar depasirea nu se plateste doar cu un 429: documentatia lor spune ca si cererile
 * INVALIDE se numara in limita. Deci bugetul ars e chiar cel prin care trebuie sa plece o
 * mișcare de stoc dupa o vanzare — iar aceea intarziata inseamna supravanzare.
 *
 * ═══ ⚠ SE CADE DESCHIS, NU INCHIS ═══
 *
 * Daca baza nu raspunde, cererea PLEACA. Doua motive, si sunt hotaratoare:
 *
 *   1. Avem deja o a doua plasa care nu tine de baza — antetele lor si 429-ul, in
 *      `franeazaDupaAntete`. Depasirea costa o intarziere, nu date pierdute.
 *   2. Cazuta inchis, o pana a bazei ar opri TOATE cererile catre eMAG ale tuturor
 *      magazinelor — inclusiv confirmarile de comenzi si mișcarile de stoc. Adica un
 *      incident mult mai mare decat cel de care ne aparam.
 */

import { createAdminClient } from "@/lib/supabase/admin";
import { createHash } from "node:crypto";
import { logError } from "@/lib/error-logger";
import type { EmagAuth } from "./client";

/**
 * Cheia contului la ei, nu a magazinului la noi.
 *
 * ⚠ Limita e a VANZATORULUI. Doua magazine Edinio legate la acelasi cont eMAG impart
 * acelasi buget, iar numarate separat ar fi trecut de el impreuna fara sa vada nimeni.
 *
 * ⚠ Numele de utilizator e o adresa de e-mail, deci nu se scrie ca atare intr-o masa de
 * contorizare: se trece printr-o amprenta. Cheia ramane stabila si nu mai duce nicaieri.
 */
export function cheiaContului(auth: Pick<EmagAuth, "username" | "tara">): string {
  const brut = `${auth.tara ?? "ro"}:${(auth.username ?? "").trim().toLowerCase()}`;
  return createHash("sha256").update(brut).digest("hex").slice(0, 32);
}

/** Limitele lor, din documentatie. */
export const LIMITE_RITM = {
  /** `/order*` */
  comenzi: { limita: 12, fereastraMs: 1000 },
  /** Tot restul, cumulat. */
  restul: { limita: 3, fereastraMs: 1000 },
  /*
   * ⚠ `documentation/find_by_eans` are limite PROPRII, mai stranse decat restul API-ului,
   * si una dintre ele e ZILNICA. Pe un plafon de zi, o galeata din memorie nu poate face
   * nimic: instanta moare cu mult inainte sa se termine ziua.
   */
  eanSecunda: { limita: 5, fereastraMs: 1000 },
  eanMinut: { limita: 200, fereastraMs: 60_000 },
  eanZi: { limita: 5000, fereastraMs: 86_400_000 },
} as const;

interface RaspunsJeton { ok: boolean; asteapta_ms: number; folosite: number; limita: number }

/**
 * Cere un jeton. Intoarce cate milisecunde sa se astepte; `0` inseamna „pleaca acum".
 *
 * ⚠ La orice necaz cu baza se raspunde `0`. Vezi nota de sus: se cade DESCHIS.
 */
export async function ceruJeton(
  cheie: string, limita: number, fereastraMs: number,
): Promise<RaspunsJeton> {
  try {
    const { data, error } = await createAdminClient().rpc("ia_jeton_extern", {
      p_cheie: cheie, p_limita: limita, p_fereastra_ms: fereastraMs,
    });
    if (error) {
      /* ⚠ Se scrie, dar nu se opreste nimic. Un contor de ritm cazut e o problema de
         observat, nu una care are voie sa taie legatura cu marketplace-ul. */
      void logError({
        action: "emag.ritm",
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
    };
  } catch {
    return { ok: true, asteapta_ms: 0, folosite: 0, limita };
  }
}

/**
 * Cate incercari se fac pe o fereastra de o secunda inainte sa se plece oricum.
 *
 * ⚠ NU E UN NUMAR DE FRUMUSETE. Un limitator care asteapta la nesfarsit e mai rau decat
 * unul care lasa sa treaca o cerere in plus: ar tine pe loc trecerea cronului pana la
 * `maxDuration`, iar atunci nu mai pleaca NIMIC — nici confirmarile de comenzi, nici
 * mișcarile de stoc. Peste prag se pleaca, si 429-ul lor ramane plasa de dedesubt.
 */
const INCERCARI_MAXIM = 30;

/**
 * Asteapta pana cand contul are loc pentru inca o cerere.
 *
 * ⚠ Numai pentru ferestrele SCURTE. Pe plafonul zilnic nu se asteapta: acolo raspunsul
 * corect e „nu azi", si il da `maiAreBugetZilnic`.
 */
export async function asteaptaJetonImpartit(
  cheie: string, limita: number, fereastraMs: number,
): Promise<void> {
  for (let i = 0; i < INCERCARI_MAXIM; i++) {
    const r = await ceruJeton(cheie, limita, fereastraMs);
    if (r.ok) return;
    await new Promise((res) => setTimeout(res, Math.min(Math.max(r.asteapta_ms, 15), fereastraMs)));
  }
  void logError({
    action: "emag.ritm",
    message: `jetonul n-a venit dupa ${INCERCARI_MAXIM} incercari; cererea pleaca oricum`,
    details: { cheie, limita, fereastraMs },
    severity: "warning",
  });
}

/**
 * Mai are contul cautari dupa cod de bare azi?
 *
 * ⚠ NU se asteapta si NU se cade deschis pe plafonul zilnic — sunt cele doua deosebiri
 * fata de ferestrele de o secunda:
 *
 *   asteptarea ar fi de ore. Cronul are `maxDuration = 60`.
 *   trecutul cu vederea ar insemna sa lovim plafonul lor si sa ne trezim cu ruta inchisa
 *     pentru tot restul zilei — inclusiv pentru publicarile care chiar contau.
 *
 * ⚠ Dar tot NU se cade inchis la o pana a BAZEI: `ceruJeton` raspunde `ok` cand nu poate
 * intreba, iar asta e voit. Se opreste numai cand baza spune limpede „s-a terminat".
 */
export async function maiAreBugetZilnicEan(auth: Pick<EmagAuth, "username" | "tara">): Promise<boolean> {
  const r = await ceruJeton(
    `emag:${cheiaContului(auth)}:ean:zi`,
    LIMITE_RITM.eanZi.limita,
    LIMITE_RITM.eanZi.fereastraMs,
  );
  return r.ok;
}
