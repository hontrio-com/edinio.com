import { createBrowserClient } from "@supabase/ssr";
import type { Database } from "@/types/database.types";
import { COOKIE_SESIUNE } from "./cookie-sesiune";

export function createClient() {
  return createBrowserClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    // Aceleasi optiuni in toate cele patru locuri unde se face un client; vezi
    // ./cookie-sesiune.ts pentru ce erau inainte si de ce s-au schimbat.
    { cookieOptions: COOKIE_SESIUNE },
  );
}
