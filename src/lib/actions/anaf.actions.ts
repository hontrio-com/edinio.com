"use server";

import { headers } from "next/headers";
import { clientIpFromHeaders, rateLimit } from "@/lib/utils/rate-limit";
import { lookupAnaf, type AnafCompany } from "@/lib/anaf/lookup";

/**
 * Autocompletarea datelor de firma din formularul de comanda.
 *
 * PUBLICA, fara sesiune: cumparatorul care completeaza checkout-ul e anonim, iar
 * ruta autentificata `/api/anaf/lookup` i-ar raspunde 401.
 *
 * De ce e totusi in regula sa fie deschisa. Datele intoarse sunt oricum publice
 * (registrul ANAF e interogabil de oricine, gratuit, fara cont) — deci nu se
 * scurge nimic. Riscul e altul: sa devenim un releu comod catre un serviciu al
 * statului, de pe IP-urile Vercel pe care le impart toate magazinele, si sa ne
 * trezim ca ANAF ne raspunde 429 tuturor deodata. De aceea doua garduri, in
 * ordinea asta:
 *
 *   1. cifra de control a CUI-ului, LOCAL — un sir tastat aiurea nu pleaca nicaieri;
 *   2. limita pe IP — un om completeaza un CUI, nu douasprezece pe minut.
 *
 * Limita e mai stransa decat cea de la retururi (12/min) fiindca aici cererea
 * pleaca mai departe, catre altcineva.
 */
export async function lookupCuiPublic(
  cui: string
): Promise<{ ok: true; company: AnafCompany } | { ok: false; error: string }> {
  const ip = clientIpFromHeaders(await headers());
  if (!rateLimit(`anafLookup:${ip}`, 8, 60_000)) {
    return { ok: false, error: "Prea multe cautari. Asteapta un minut si incearca din nou." };
  }

  const result = await lookupAnaf(cui ?? "");
  if (!result.ok) return { ok: false, error: result.error };
  return { ok: true, company: result.company };
}
