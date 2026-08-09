// Statisticile ofertelor: ce se numara si CINE scrie.
//
// Infrastructura exista de la inceput — coloanele `offers.impressions`,
// `offers.conversions`, `offers.revenue_added`, RPC-ul atomic
// `increment_offer_stats` si citirea din panou (`OffersClient.tsx:139-142`).
// Lipsea doar scrierea: `recordOfferEvent` avea ZERO apelanti, cu tot cu
// comentariul „Wired up in 1B/Faza 2".
//
// Masurat in productie pe 2026-08-04: toate cele 9 oferte (3 magazine, dintre
// care 2 publicate) aveau impressions 0, conversions 0, revenue_added 0 —
// inclusiv cele trei bump-uri si recomandarea de la suporti-numar, create pe 13
// iulie pe un magazin cu 51 de comenzi. Panoul ascunde randul de statistici cat timp AMBELE
// contoare sunt zero, deci comerciantul nu vedea nici macar zerourile: o oferta
// care ruleaza de trei saptamani arata la fel ca una nemasurata.
//
// Aici stau: normalizarea id-urilor primite de la browser si UNICUL loc care
// scrie contoarele. Nu se importa nimic din `next/*`, ca modulul sa poata fi
// incarcat de teste.

import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/types/database.types";
import { normalizeazaIds } from "./offer-pricing";

type Client = SupabaseClient<Database>;

function round2(n: number): number {
  return Math.round((Number(n) || 0) * 100) / 100;
}

/**
 * Cate afisari poate revendica o singura cerere venita din browser.
 *
 * E un plafon impotriva abuzului, nu o regula de afisare: `resolveProductOffers`
 * nu limiteaza cate oferte poate arata o pagina de produs, dar in productie azi
 * niciun produs nu aprinde mai mult de UNA (cele 4 oferte de la caian-textile se
 * declanseaza pe categorii disjuncte, iar cele 3 bump-uri de la suporti-numar
 * traiesc pe suprafata „checkout", nu pe pagina de produs). Restul se taie in
 * tacere: contorul are voie sa piarda o afisare, nu are voie sa fie umflat de
 * un sir trimis de mana.
 */
export const MAX_OFERTE_PE_AFISARE = 12;

/**
 * Id-urile de oferta primite de la browser, curatate pentru contor.
 *
 * Curatarea propriu-zisa e chiar `normalizeazaIds`, cea folosita si la ofertele
 * revendicate pe comanda: coloanele sunt `uuid`, deci un sir care nu se poate
 * converti face interogarea sa cada, iar deduplicarea trebuie sa fie aceeasi in
 * ambele parti. Diferenta e ce se intampla la depasire — comanda REFUZA, aici se
 * TAIE, fiindca o statistica nu are voie sa opreasca nimic.
 */
export function idsDeAfisare(brute: string[] | undefined): string[] {
  return normalizeazaIds(brute).ids.slice(0, MAX_OFERTE_PE_AFISARE);
}

export interface EvenimentOferta {
  offerId: string;
  impressions?: number;
  conversions?: number;
  /** Venitul adus de oferta, in lei. Niciodata negativ. */
  revenue?: number;
}

/**
 * Contoarele, marite atomic prin RPC. UNICUL loc din cod care le scrie.
 *
 * Se cheama cu clientul ADMIN: `offers` nu e citibila anonim si RPC-ul e lasat
 * pe seama service_role-ului. Apelantul raspunde de faptul ca ofertele chiar
 * apartin magazinului — cele venite din `resolveCartOffers` vin deja dintr-o
 * interogare filtrata pe `business_id`, iar calea publica
 * (`recordOfferImpressions`) verifica separat.
 *
 * Cate o chemare pe oferta, in paralel: PostgREST nu stie sa faca aritmetica pe
 * coloana, deci un singur UPDATE cu `impressions + 1` nu se poate exprima fara o
 * migratie. Cu cel mult o oferta pe pagina azi, o chemare inseamna o chemare.
 *
 * Nicio eroare nu iese de aici. Statistica se scrie dupa ce raspunsul a plecat
 * (vezi `after` la apelanti) si nu are voie sa strice nici magazinul, nici o
 * comanda.
 */
export async function scrieStatisticiOferte(admin: Client, evenimente: EvenimentOferta[]): Promise<void> {
  if (evenimente.length === 0) return;
  await Promise.all(
    evenimente.map(async (e) => {
      try {
        await admin.rpc("increment_offer_stats", {
          p_offer_id: e.offerId,
          p_impressions: Math.max(0, Math.trunc(Number(e.impressions) || 0)),
          p_conversions: Math.max(0, Math.trunc(Number(e.conversions) || 0)),
          p_revenue: Math.max(0, round2(e.revenue ?? 0)),
        });
      } catch {
        // statistica e best-effort
      }
    }),
  );
}
