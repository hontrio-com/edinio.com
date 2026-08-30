/**
 * Stocul schimbat de o vânzare se duce și pe CELELALTE canale.
 *
 * ═══ ⚠ DE CE EXISTĂ (audit 24.08.2026) ═══
 *
 * Calea magazinului propriu face lucrul ăsta de mult, corect, pe toate cinci canalele
 * (`order.actions.ts`, la crearea comenzii). Căile de marketplace — Trendyol, About You,
 * eMAG — **nu-l fac pe niciunul.**
 *
 * Deci: se vinde o bucată pe Trendyol, stocul Edinio scade, iar eMAG rămâne cu valoarea
 * veche și continuă s-o vândă. Comerciantul primește a doua comandă pentru marfa pe care
 * n-o mai are, o anulează, și plătește anularea în bani și în punctaj la ei.
 *
 * ⚠ ȘI E CHIAR ROSTUL INTEGRĂRII. „Un singur inventar" e propoziția cu care se vinde
 * Edinio. Fără pasul ăsta, un singur inventar există doar cât timp se vinde pe un singur
 * canal — adică exact până când integrarea începe să fie folosită.
 *
 * ═══ ⚠ DE CE NU E DE AJUNS DERIVA ═══
 *
 * Plasa de dedesubt există: pasul de derivă compară ce e la ei cu ce avem noi. Dar cere
 * ACEEAȘI diferență văzută de două ori, ca să nu reacționeze la o citire de moment, și
 * trece prin catalog câte o pagină de 100 pe rulare. La 4.673 de oferte înseamnă
 * patruzeci și șapte de rulări pentru o trecere, înmulțit cu două confirmări.
 *
 * Ore, pentru o vânzare care se întâmplă în secunde. Plasa e pentru ce scapă, nu pentru
 * calea obișnuită.
 *
 * ═══ ⚠ CANALUL DE UNDE A VENIT COMANDA SE SARE ═══
 *
 * El știe deja: chiar el a vândut bucata și și-a scăzut stocul singur. Trimis înapoi, ar
 * fi o cerere arsă din cota magazinului la fiecare comandă — iar cotele alea sunt exact
 * cele prin care trebuie să plece mișcările astea.
 */

import { enqueueAboutYouStockMany } from "@/lib/aboutyou/queue";
import { enqueueEmagStocMany } from "@/lib/emag/queue";
import { enqueueGmcSyncMany } from "@/lib/google-merchant/queue";
import { enqueueOlxSyncMany } from "@/lib/olx/queue";
import { enqueueTrendyolInventoryMany } from "@/lib/trendyol/queue";

/** Canalele care pot primi o mișcare de stoc. */
export type Canal = "emag" | "trendyol" | "aboutyou" | "gmc" | "olx";

const IMPINGERI: Record<Canal, (b: string, p: (string | null | undefined)[]) => Promise<unknown>> = {
  emag: enqueueEmagStocMany,
  trendyol: enqueueTrendyolInventoryMany,
  aboutyou: enqueueAboutYouStockMany,
  gmc: enqueueGmcSyncMany,
  olx: enqueueOlxSyncMany,
};

/**
 * Pune la coadă noul stoc pe toate canalele, în afară de cel care a vândut.
 *
 * ⚠ NU ARUNCĂ NICIODATĂ. Se cheamă din calea de preluare a comenzilor, iar acolo o
 * excepție ar opri marcajul ferestrei și ar bloca intrarea comenzilor următoare. Fiecare
 * `enqueue…` are deja `inghiteDarScrie` înăuntru; `catch`-ul de aici e pentru ce ar putea
 * scăpa între ele.
 *
 * ⚠ Și nu se așteaptă rezultatul fiecăreia pe rând: cinci cozi, una câte una, ar adăuga
 * latență pe calea comenzilor pentru o muncă ce oricum se face în fundal.
 */
export async function impingeStoculPeCeleLalteCanale(
  businessId: string,
  productIds: (string | null | undefined)[],
  venitDe: Canal,
): Promise<void> {
  const curate = [...new Set(productIds.filter((x): x is string => !!x))];
  if (curate.length === 0) return;

  const canale = (Object.keys(IMPINGERI) as Canal[]).filter((c) => c !== venitDe);
  await Promise.allSettled(canale.map((c) => IMPINGERI[c](businessId, curate)));
}
