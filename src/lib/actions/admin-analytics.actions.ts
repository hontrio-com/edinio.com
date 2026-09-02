"use server";

import { requireAdminApi } from "@/lib/admin-guard";
import { buildAuthUrl, googleAnalyticsConfigured } from "@/lib/google-analytics/oauth";
import { semneazaStareAdmin } from "@/lib/admin-analytics/stare-oauth";
import { stergeConexiune } from "@/lib/admin-analytics/conexiune";
import { revalidatePath } from "next/cache";

/*
  Plecarea catre Google pentru rapoartele din admin.

  ⚠ ACEEASI APLICATIE GOOGLE ca la magazine, acelasi `redirect_uri`, acelasi
  scope `analytics.readonly`. Deosebirea e numai in starea semnata: aterizarea o
  citeste si stie ca intoarcerea e a platformei, nu a unui magazin.

  ⚠ ACTIUNE, NU RUTA GET, si nu din stil. O adresa care porneste o legare de
  conturi n-are ce cauta intr-un `<a href>`: Next preincarca legaturile, deci
  fluxul ar fi putut porni fara ca nimeni sa apese. Asa se face si la magazine
  (`google-analytics.actions.ts`).
*/
export async function porneste(): Promise<{ url: string } | { error: string }> {
  const admin = await requireAdminApi();
  if (!admin) return { error: "Nu esti administrator." };

  if (!googleAnalyticsConfigured()) {
    return { error: "Aplicatia Google nu e configurata pe server (GOOGLE_MERCHANT_CLIENT_ID / _SECRET)." };
  }

  return { url: buildAuthUrl(semneazaStareAdmin()) };
}

/**
 * Rupe legatura.
 *
 * ⚠ STERGE DOAR LA NOI. Accesul dat aplicatiei Edinio ramane in contul Google
 * pana cand omul il retrage de acolo — randul asta e ca sa nu creada cineva ca
 * apasarea revoca si de partea lor.
 */
export async function deconecteaza(): Promise<{ ok: true } | { error: string }> {
  const admin = await requireAdminApi();
  if (!admin) return { error: "Nu esti administrator." };

  await stergeConexiune();
  revalidatePath("/admin/analytics");
  return { ok: true };
}
