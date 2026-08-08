"use server";

import { headers } from "next/headers";
import { rateLimit, clientIpFromHeaders } from "@/lib/utils/rate-limit";
import { consumaLimita } from "@/lib/utils/limita-durabila";
import { sugestiiDeCautare } from "@/lib/storefront/catalog/cauta-server";
import type { StorefrontProduct } from "@/lib/storefront/product.types";

/**
 * Produsele gasite, pentru panoul de sub caseta de cautare din header.
 *
 * DE CE EXISTA. Panoul se alimenta din `visibleProducts`, adica din catalogul
 * trimis in browser. Pe palierul server acolo sta o SINGURA pagina, deci panoul
 * ar fi raspuns cu incredere „2 produse gasite" pentru un termen care are 300 in
 * magazin — nu gol, ci GRESIT, care e mai rau. Cautarea se face acum unde stau
 * datele, prin exact acelasi motor.
 *
 * ATENTIE, `"use server"` expune FIECARE export din fisier, si fiecare export
 * trebuie sa fie o functie async. De aia aici nu sta nimic altceva: nici o
 * constanta, nici un ajutator. Vezi [[use-server-expune-fiecare-export]].
 */

/** Cate litere merita cautate. Sub doua, orice interogare potriveste prea mult. */
const MIN_LITERE = 2;

export interface SugestiiCautare {
  produse: StorefrontProduct[];
  total: number;
}

/**
 * Cauta in magazinul dat si intoarce primele cateva potriviri.
 *
 * `null` inseamna „nu pot raspunde aici" — magazin neindexat, termen prea comun,
 * sau limita atinsa — si apelantul ascunde panoul, lasand Enter sa duca in
 * catalog, unde raspunsul e intreg. NU inseamna „zero rezultate": alea vin ca
 * `total: 0`, si trebuie spuse, altfel vizitatorul asteapta un panou care nu mai
 * apare.
 *
 * DOUA LIMITE, ca la orice alta cale publica: prima in memorie (gratis, taie
 * rafalele), a doua durabila in Postgres (tine peste instante si peste deploy).
 * Fara ele, un script care cere sugestii in bucla ar plati o cautare pe fiecare
 * cerere — iar cautarea e cea mai scumpa interogare a catalogului. Vezi
 * [[limitare-rata-in-memorie]].
 */
export async function cautaSugestii(args: {
  businessId: string;
  q: string;
  faraImagini: boolean;
  faraStocAscuns: boolean;
}): Promise<SugestiiCautare | null> {
  const q = (args.q ?? "").trim().slice(0, 100);
  if (q.length < MIN_LITERE) return null;
  // Forma id-ului se verifica INAINTE de a ajunge in interogare: `businessId` vine
  // din props-urile paginii, dar o actiune de server poate fi chemata cu orice
  // corp — vezi [[actiuni-server-manifest-global]].
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(args.businessId ?? "")) {
    return null;
  }

  const ip = clientIpFromHeaders(await headers());
  if (!rateLimit(`cautare:${ip}`, 60, 60_000)) return null;
  if (!(await consumaLimita(`cautare:${ip}`, 300, 3600)).permis) return null;

  return sugestiiDeCautare({
    businessId: args.businessId,
    q,
    faraImagini: args.faraImagini === true,
    faraStocAscuns: args.faraStocAscuns === true,
  });
}
