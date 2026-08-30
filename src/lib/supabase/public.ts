import { createClient as creeazaClientSupabase } from "@supabase/supabase-js";
import type { Database } from "@/types/database.types";

/**
 * Clientul pentru citirile PUBLICE, fără cookie-uri.
 *
 * ⚠ DE CE NU `createClient()` DIN `./server.ts`.
 *
 * Acela citește cookie-urile prin `next/headers`. Asta are două urmări pe
 * paginile publice ale blogului:
 *
 * 1. **Ruta devine dinamică.** O pagină care atinge cookie-urile nu mai poate fi
 *    randată o dată și servită tuturor: Next o socotește la fiecare cerere.
 *    Pentru un blog — pagini care arată identic pentru toată lumea și trăiesc
 *    din a fi rapide — asta e exact ce nu vrem.
 *
 * 2. **Răspunsul depinde de cine întreabă.** Un admin logat trece prin
 *    `blog_posts_admin_all` și vede și ciornele. Citirile din `blog/citire.ts`
 *    își pun singure toate condițiile de vizibilitate, tocmai din cauza asta, dar
 *    aceea e o disciplină de ținut la fiecare interogare nouă. Aici nu mai e
 *    nimic de ținut: clientul n-are sesiune, deci întreabă mereu ca `anon`, deci
 *    regula din bază răspunde tuturor la fel.
 *
 * ⚠ CHEIA E CEA ANONIMĂ, ȘI E PUBLICĂ. Nu e o scăpare: ea e făcută să stea în
 * browser. Tot ce apără datele e RLS, care aici lasă să treacă doar articolele
 * publicate cu data trecută.
 *
 * ⚠ FĂRĂ SESIUNE PERSISTATĂ ȘI FĂRĂ REÎMPROSPĂTARE. Pe server nu există un loc
 * unde s-o pui, iar `autoRefreshToken` ar porni un cronometru în fiecare instanță
 * care nu se oprește niciodată.
 */
export function createPublicClient() {
  return creeazaClientSupabase<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
    },
  );
}
