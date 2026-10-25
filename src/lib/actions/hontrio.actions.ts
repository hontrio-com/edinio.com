"use server";

/**
 * Actiunile panoului Hontrio: aprobarea si refuzul cererii de autorizare, si deconectarea.
 *
 * ⚠ NICIUNA NU PRIMESTE DE LA BROWSER ADRESA DE INTOARCERE SAU MAGAZINUL. Adresa se citeste din
 * cookie-ul cererii si se verifica din nou pe lista din mediu (`cerereaDinCookie`); magazinul e cel
 * al omului logat. Un browser care ar trimite el adresa ar putea indrepta codul oriunde.
 *
 * ⚠ RASPUNSUL E O ADRESA, NU O REDIRECTARE: pagina pleaca acolo cu o navigare de document
 * (`window.location.assign`), ca logarea. O redirectare din actiune catre alt site ar fi depins de
 * `form-action` din CSP, care permite numai `'self'` si Facebook.
 */

import { cookies } from "next/headers";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { logError } from "@/lib/error-logger";
import { adreseleDeIntoarcere, hontrioConfigurat } from "@/lib/hontrio/config";
import { COOKIE_CERERE, adresaCuCod, adresaCuEroare, cerereaDinCookie } from "@/lib/hontrio/cerere";
import { creeazaCod, revocaConexiunileMagazinului } from "@/lib/hontrio/conexiuni";

const CALE = "/dashboard/features/hontrio";

/**
 * Omul logat si magazinul lui.
 *
 * ⚠ SE VERIFICA LA FIECARE ACTIUNE, nu o data la incarcarea paginii: actiunile de server se cheama
 * direct, dintr-un manifest global, deci o poarta pusa numai in pagina n-ar fi pe drumul lor.
 */
async function magazinulMeu(): Promise<{ userId: string; businessId: string } | { error: string }> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: "Neautorizat" };
  const { data, error } = await supabase
    .from("businesses").select("id")
    .eq("user_id", user.id).eq("type", "ministore")
    .order("created_at").limit(1).maybeSingle();
  /* ⚠ O citire cazuta nu e „n-ai magazin": mesajele trebuie sa fie diferite. */
  if (error) return { error: "Nu am putut verifica magazinul. Încearcă din nou." };
  if (!data) return { error: "Nu ai un magazin Edinio pe care să-l conectezi." };
  return { userId: user.id, businessId: data.id };
}

export async function aprobaHontrio(): Promise<{ catre: string } | { error: string }> {
  const m = await magazinulMeu();
  if ("error" in m) return m;

  const jar = await cookies();
  const cerere = cerereaDinCookie(jar.get(COOKIE_CERERE)?.value, adreseleDeIntoarcere(), hontrioConfigurat(), Date.now());
  if (!cerere) return { error: "Cererea de conectare a expirat. Pornește din nou conectarea din Hontrio." };

  let cod: string;
  try {
    cod = await creeazaCod(createAdminClient(), {
      businessId: m.businessId, userId: m.userId, redirectUri: cerere.redirectUri, codeChallenge: cerere.codeChallenge,
    });
  } catch (e) {
    await logError({
      action: "hontrio/aproba",
      message: e instanceof Error ? e.message : String((e as { message?: unknown })?.message ?? e),
      businessId: m.businessId, userId: m.userId, severity: "error",
    });
    return { error: "Nu am putut crea conexiunea. Încearcă din nou." };
  }

  /* ⚠ Cererea se sterge abia dupa ce codul exista: cazut la mijloc, omul poate apasa din nou. */
  jar.delete(COOKIE_CERERE);
  return { catre: adresaCuCod(cerere.redirectUri, cod, cerere.state) };
}

/** „Anuleaza": Hontrio afla ca omul a refuzat (`access_denied`), ca sa nu astepte la nesfarsit. */
export async function refuzaHontrio(): Promise<{ catre: string }> {
  const jar = await cookies();
  const cerere = cerereaDinCookie(jar.get(COOKIE_CERERE)?.value, adreseleDeIntoarcere(), hontrioConfigurat(), Date.now());
  jar.delete(COOKIE_CERERE);
  return { catre: cerere ? adresaCuEroare(cerere.redirectUri, "access_denied", cerere.state) : CALE };
}

/**
 * Deconectarea din Edinio: jetonul lui Hontrio moare pe loc, iar urmatoarea lui citire primeste 401.
 *
 * ⚠ Magazinul vine de la browser, deci se verifica: trebuie sa fie chiar al omului logat.
 */
export async function deconecteazaHontrio(businessId: string): Promise<{ ok: true } | { error: string }> {
  const m = await magazinulMeu();
  if ("error" in m) return m;
  if (m.businessId !== businessId) return { error: "Magazin negăsit" };
  try {
    await revocaConexiunileMagazinului(createAdminClient(), businessId, "comerciant");
  } catch (e) {
    await logError({
      action: "hontrio/deconecteaza",
      message: e instanceof Error ? e.message : String((e as { message?: unknown })?.message ?? e),
      businessId, userId: m.userId, severity: "error",
    });
    return { error: "Nu am putut opri legătura. Încearcă din nou." };
  }
  revalidatePath(CALE);
  return { ok: true };
}
