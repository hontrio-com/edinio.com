/*
  ═══════════════════════════════════════════════════════════════════════════════
  COADA EVENIMENTELOR DE COMANDA CATRE MAILCHIMP, BREVO SI KLAVIYO
  ═══════════════════════════════════════════════════════════════════════════════

  Randurile le scrie triggerul de pe `orders` (migratia `2027-01-28-email-marketing-coada.sql`):
  cate unul pe (comanda, furnizor, fel), numai pentru furnizorii conectati cu sincronizarea
  e-commerce pornita. Aici se revendica, se trimit si se insemneaza.

  Acelasi tipar ca coada de conversii (`edinio-marketing/server/coada-conversii.ts`): arenda in loc
  de incuietoare, esecul reprogramat (nu reluat pe loc), refuzul abandonat pe loc cu motivul scris.
  Ritmul reincercarilor e chiar al ei (`ritm-reincercari.ts`), probat acolo.
*/

import { createAdminClient } from "@/lib/supabase/admin";
import { logError } from "@/lib/error-logger";
import { dupaEsec, candSeReincearca } from "@/lib/edinio-marketing/server/ritm-reincercari";

export type Furnizor = "mailchimp" | "brevo" | "klaviyo";
export type FelEveniment = "creata" | "platita" | "expediata" | "livrata" | "anulata" | "rambursata";

export type RandDeTrimis = {
  id: number;
  business_id: string;
  order_id: string;
  furnizor: Furnizor;
  fel: FelEveniment;
  incercari: number;
};

/**
 * Ce s-a intamplat cu un eveniment.
 *
 * - `trimis`: furnizorul l-a primit;
 * - `sarit`: nu era nimic de trimis (plata inca neincasata, integrare oprita intre timp, comanda
 *   de marketplace). Randul se incheie, cu motivul scris;
 * - `refuzat`: furnizorul a spus NU (4xx). La a saptea incercare ar spune la fel: abandon pe loc;
 * - `esuat`: nu s-a putut afla (retea, 5xx, 429 dupa reluari). Se reprogrameaza.
 */
export type Verdict =
  | { fel: "trimis" }
  | { fel: "sarit"; motiv: string }
  | { fel: "refuzat"; motiv: string }
  | { fel: "esuat"; motiv: string };

/**
 * Verdictul unei erori de la furnizor, dupa status. Fara status = n-a raspuns (retea, termen).
 *
 * ⚠ 408, 409 si 429 NU sunt refuzuri: primul e un termen, al doilea o intrecere cu o alta cerere
 * (se lamureste la reluare), al treilea „mai tarziu”. Restul de 4xx inseamna ca mesajul nostru sau
 * dreptul cheii e gresit, si reluarea nu schimba nimic.
 */
export function verdictDinEroare(e: { error: string; status?: number }): Verdict {
  const s = e.status;
  if (s === undefined || s >= 500 || s === 408 || s === 409 || s === 429) return { fel: "esuat", motiv: e.error };
  if (s >= 400) return { fel: "refuzat", motiv: `${s}: ${e.error}` };
  return { fel: "esuat", motiv: e.error };
}

/**
 * Cat tine arenda pusa de `email_marketing_revendica`, in milisecunde: `now() + interval '5 minutes'`.
 * ⚠ Trebuie sa ramana mai mare decat `maxDuration` al cronului, altfel o rulare lenta si urmatoarea
 * ar trimite acelasi rand amandoua.
 */
export const ARENDA_MS = 5 * 60_000;

export async function revendica(limita: number): Promise<RandDeTrimis[]> {
  /* ⚠ Numele argumentului (`limita`) trebuie sa fie exact: PostgREST alege functia dupa el. */
  const { data, error } = await createAdminClient().rpc("email_marketing_revendica", { limita });
  if (error) {
    await logError({ action: "email.coada.revendica", message: error.message, severity: "error" });
    return [];
  }
  return (data ?? []) as unknown as RandDeTrimis[];
}

/** Randul s-a incheiat: trimis, sau sarit cu motivul lui. */
export async function marcheazaIncheiat(id: number, rezultat: string): Promise<void> {
  try {
    await createAdminClient()
      .from("email_marketing_coada")
      .update({ trimis_la: new Date().toISOString(), rezultat: rezultat.slice(0, 500), ultima_eroare: null })
      .eq("id", id)
      .throwOnError();
  } catch (e) {
    await logError({
      action: "email.coada.marcajPierdut",
      message: `nu s-a putut insemna randul trimis: ${e instanceof Error ? e.message : "eroare necunoscuta"}`,
      details: { rand: id },
      severity: "error",
    });
  }
}

/**
 * Dupa un esec: se programeaza urmatoarea incercare, sau se abandoneaza. `incercariDeAcum` e numarul
 * de DUPA esecul curent. Un refuz se cheama cu `abandonAcum`, ca sa nu mai astepte sase reluari inutile.
 */
export async function marcheazaEsuat(id: number, incercariDeAcum: number, eroare: string, abandonAcum = false): Promise<"reincercat" | "abandonat"> {
  const h = abandonAcum ? { fel: "abandoneaza" as const } : dupaEsec(incercariDeAcum);
  const comun = { incercari: incercariDeAcum, ultima_eroare: eroare.slice(0, 500) };
  try {
    await createAdminClient()
      .from("email_marketing_coada")
      .update(h.fel === "abandoneaza"
        ? { ...comun, abandonat_la: new Date().toISOString() }
        : { ...comun, next_retry_at: candSeReincearca(new Date(), h.pesteMinute) })
      .eq("id", id)
      .throwOnError();
  } catch (e) {
    await logError({
      action: "email.coada.marcajEsecPierdut",
      message: `nu s-a putut insemna esecul randului: ${e instanceof Error ? e.message : "eroare necunoscuta"}`,
      details: { rand: id, fel: h.fel },
      severity: "error",
    });
  }
  return h.fel === "abandoneaza" ? "abandonat" : "reincercat";
}
