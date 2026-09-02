import { sarcinaTikTok, eRefuz } from "./sarcina-tiktok";
import type { SarcinaPastrata } from "./coada-conversii";
import { ID_PIXEL_TIKTOK } from "../pixel-tiktok";

/*
  ═══════════════════════════════════════════════════════════════════════════════
  TRIMITEREA CATRE TIKTOK EVENTS API
  ═══════════════════════════════════════════════════════════════════════════════

  ⚠ SINGURUL LOC CARE STIE CUM SE VORBESTE CU EI. Forma mesajului o hotaraste
  `sarcina-tiktok.ts`, care la randul lui foloseste cartografierea din browser.
  Aici e doar drumul: adresa, antetul, si citirea raspunsului.
*/

const ADRESA = "https://business-api.tiktok.com/open_api/v1.3/event/track/";

export type Rezultat =
  | { fel: "trimis" }
  /** Merita reincercat: retea, limitare, o eroare de-a lor. */
  | { fel: "esec"; motiv: string }
  /** Nu merita: mesajul nostru e gresit, iar reincercarea ar da acelasi raspuns. */
  | { fel: "refuzat"; motiv: string };

/*
  ⚠ ACELASI ID CA IN BROWSER, dintr-un singur loc. Doua citiri deosebite ar putea
  da doua valori, iar atunci deduplicarea n-ar mai avea ce uni.
*/
function pixel(): string {
  return ID_PIXEL_TIKTOK;
}

export async function trimiteTikTok(s: SarcinaPastrata): Promise<Rezultat> {
  const token = process.env.TIKTOK_EVENTS_TOKEN?.trim();
  if (!token) return { fel: "esec", motiv: "TIKTOK_EVENTS_TOKEN lipseste" };

  const mesaj = sarcinaTikTok(s.ev, s.ctx, pixel(), s.amprentaOmului, s.cand);
  if (eRefuz(mesaj)) return { fel: "refuzat", motiv: mesaj.motiv };

  let raspuns: Response;
  try {
    raspuns = await fetch(ADRESA, {
      method: "POST",
      headers: { "Content-Type": "application/json", "Access-Token": token },
      body: JSON.stringify(mesaj),
      cache: "no-store",
    });
  } catch (e) {
    return { fel: "esec", motiv: e instanceof Error ? e.message : "reteaua a cazut" };
  }

  /*
    ⚠ CODUL HTTP NU E VERDICTUL. TikTok raspunde 200 si pentru refuzuri; adevarul
    e in `code` din corp — `0` inseamna primit, orice altceva inseamna respins.
    Probat pe 02.09.2026: un pixel la care tokenul n-avea drept a intors HTTP 200
    cu `code: 40001`.
  */
  let corp: { code?: number; message?: string } = {};
  try {
    corp = (await raspuns.json()) as typeof corp;
  } catch {
    return { fel: "esec", motiv: `raspuns necitibil (HTTP ${raspuns.status})` };
  }

  if (corp.code === 0) return { fel: "trimis" };

  /*
    ⚠ SI TOT ACOLO SE DESPART CELE DOUA FELURI DE ESEC. Un drept lipsa sau un
    mesaj stricat dau acelasi raspuns oricat s-ar reincerca — deci reincercarea ar
    fi doar zgomot pana la abandon. O limitare sau o pana de-a lor trec.
  */
  const permanent = corp.code === 40001 || corp.code === 40002 || corp.code === 40100;
  const motiv = `code ${corp.code}: ${corp.message ?? "fara mesaj"}`;
  return permanent ? { fel: "refuzat", motiv } : { fel: "esec", motiv };
}
