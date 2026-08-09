/*
 * FARA "use server" AICI, INTENTIONAT. Nu-l readauga.
 *
 * Intr-un modul "use server", FIECARE export devine un endpoint HTTP. `logError`
 * ajunsese astfel in manifestul de build ca Server Action inregistrata pe 13
 * rute, dintre care doua sunt PAGINI PUBLICE de magazin (`/[slug]` si
 * `/[slug]/product/[productSlug]`) — lantul e page.tsx -> storefront/product-data
 * -> store.actions ("use server") -> error-logger.
 *
 * Consecinta: orice vizitator anonim putea trimite un POST cu antetul
 * `Next-Action` si scrie in `error_logs` cu clientul de SISTEM (service role,
 * deci ocolind RLS), alegand singur `userId`, `businessId` si `severity`. Adica:
 * jurnalul de erori al platformei se putea umple si falsifica din exterior, cu
 * incidente puse in carca oricarui magazin.
 *
 * Modulul e folosit EXCLUSIV ca functie obisnuita, din 33 de fisiere care ruleaza
 * toate pe server (26 de actions, 3 rute API, 4 module de biblioteca). Niciunul
 * nu e componenta de client, si nicaieri nu e folosita ca VALOARE (nu apare in
 * `<form action={...}>` sau `useActionState`), deci scoaterea directivei nu
 * schimba nimic pentru apelanti.
 */

import { createAdminClient } from "@/lib/supabase/admin";
import type { Json } from "@/types/database.types";

interface LogErrorParams {
  action: string;
  message: string;
  details?: Record<string, unknown>;
  userId?: string;
  userEmail?: string;
  businessId?: string;
  severity?: "info" | "warning" | "error" | "critical";
}

/**
 * Log an error to the error_logs table (fire-and-forget).
 *
 * Client de SISTEM, nu cel de cerere. Politica tabelului e `TO authenticated`,
 * deci pe caile publice — comenzi, cotatii, cosuri abandonate, adica exact acolo
 * unde se intampla banii — insertul era refuzat de RLS. `supabase-js` nu arunca:
 * pune eroarea in `error`, iar `catch`-ul de mai jos nu prindea nimic. Rezultatul
 * a fost un jurnal care parea gol si care a fost citit ca dovada ca nu s-a
 * intamplat nimic: zero intrari nu insemnau zero incidente, ci zero scrieri.
 *
 * Volumul ramane marginit de plafonul de incercari pe IP al fiecarui endpoint
 * public (10/minut), acelasi rationament ca la `jurnalizeazaOfertele`.
 */
/** Cat se scrie dintr-un camp de text. Peste atat nu mai afli nimic in plus. */
const MAX_MESAJ = 500;
/** Cat ocupa `details` serializat. 8 MB e limita de corp a unei cereri. */
const MAX_DETALII = 4000;

export async function logError(params: LogErrorParams) {
  try {
    const supabase = createAdminClient();
    /*
     * Se TAIE inainte de scriere.
     *
     * De cand insertul chiar reuseste (client de sistem), `message` si `details`
     * vin uneori direct de pe cai publice anonime — de exemplu lista de id-uri
     * dintr-un cos, care nu e plafonata nicaieri. Fara taiere, o singura cerere
     * poate scrie un rand de cateva megaocteti, iar plafonul pe IP e o harta in
     * memorie, deci per instanta.
     */
    const detalii = JSON.stringify(params.details ?? {});
    const { error } = await supabase.from("error_logs").insert({
      action: String(params.action).slice(0, 120),
      message: String(params.message ?? "").slice(0, MAX_MESAJ),
      details: (detalii.length > MAX_DETALII
        ? { taiat: true, marime: detalii.length, inceput: detalii.slice(0, MAX_DETALII) }
        : (params.details ?? {})) as Record<string, Json>,
      user_id: params.userId ?? null,
      user_email: params.userEmail ?? null,
      business_id: params.businessId ?? null,
      severity: params.severity ?? "error",
    });

    /*
     * ⚠ JURNALUL CARE NU STIE CA N-A SCRIS.
     *
     * `try/catch` de aici parea sa acopere totul. Nu acoperea nimic: clientul
     * Supabase NU ARUNCA la eroare de SQL — intoarce `{ error }`. Deci un insert
     * respins (constrangere, drepturi, conexiune) trecea prin `catch` fara sa-l
     * atinga, iar functia se incheia linistita.
     *
     * Adica exact jurnalul pe care se sprijina toate „acum se vede" din platforma
     * putea sa nu scrie nimic si sa nu spuna nimanui. Ironia e completa: unealta
     * facuta impotriva esecurilor tacute esua tacut.
     *
     * `console.error` e ultima treapta care mai exista cand baza nu raspunde: nu
     * se vede in `/admin/logs`, dar se vede in logurile Vercel. Mai departe de
     * atat n-avem unde cobori — si tocmai de asta nu se ARUNCA: o eroare aici ar
     * rupe calea de eroare a apelantului, adica ar strica ce incerca sa raporteze.
     */
    if (error) {
      console.error(`[error-logger] jurnalul NU s-a scris (${params.action}):`, error.message);
    }
  } catch (e) {
    // Ramane pentru ce chiar arunca: client neconfigurat, retea cazuta la nivel
    // de fetch. Logarea n-are voie sa rupa aplicatia, dar are voie sa tipe.
    console.error("[error-logger] exceptie la jurnalizare:", e instanceof Error ? e.message : e);
  }
}
