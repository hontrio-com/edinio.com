"use server";

import { requireAdminApi } from "@/lib/admin-guard";
import { buildAuthUrl, credentialeAdminGata, credentialeCorporate, VARIABILE_CREDITE } from "@/lib/google-analytics/oauth";
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

  /*
    ⚠ SE INTREABA DE CREDITELE PE CARE LE FOLOSESTE CHIAR RANDUL DE MAI JOS.
    Forma veche chema `googleAnalyticsConfigured()`, care cantareste creditele
    COMERCIANTILOR — deci cine pusese numai perechea corporate primea „nu e
    configurat" desi era. Vezi `credentialeAdminGata`.
  */
  if (!credentialeAdminGata()) {
    return {
      error: "Aplicatia Google nu e configurata pe server. Pune una din perechile: " +
        VARIABILE_CREDITE.join(", ") + ".",
    };
  }

  /*
    ⚠ CREDITELE PLATFORMEI, nu ale comerciantilor. Fara variabilele corporate sunt
    aceleasi — vezi `credentialeCorporate()`. Cu ele, plecarea si intoarcerea
    trebuie sa foloseasca ACEEASI aplicatie: un cod cerut de o aplicatie nu poate
    fi schimbat de alta.
  */
  return { url: buildAuthUrl(semneazaStareAdmin(), credentialeCorporate()) };
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
