"use server";

import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { rezumatulFeeduluiCompari } from "@/lib/compari/feed";
import { magazinulPentruCompari, produselePentruCompari } from "@/lib/compari/server";
import type { RezumatCompari } from "@/lib/compari/lasate-afara";

/*
 * Intrebarea pe care si-o pune pagina „Compari.ro” din panou: ce pleaca in feed si ce ramane afara.
 *
 * ⚠ Fisier cu "use server": FIECARE export devine un punct de intrare apelabil din browser, cu un simplu POST.
 * De aceea are o singura actiune, care isi verifica singura omul; regulile pure stau in `lib/compari/feed.ts`.
 *
 * ⚠ Se socoteste LA CERERE, din produse, cu aceleasi citiri ca ruta feedului (`lib/compari/server.ts`): un tabel
 * de „produse lipsa” ar fi fost un al doilea adevar, ramas in urma exact cand comerciantul repara ceva.
 */

/** Cate produse lasate afara se arata pe ecran. Numarul total se spune oricum. */
const MAX_EXEMPLE = 20;

export async function rezumatulFeeduluiCompariAlMeu(): Promise<RezumatCompari | { error: string }> {
  /*
   * ⚠ SI VERIFICAREA OMULUI E INAUNTRU. O actiune de server care arunca respinge promisiunea din browser, nu
   * intoarce `{ error }`: panoul ar ramane fara niciun raspuns, adica exact tacerea care se citeste „pleaca toate”.
   */
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return { error: "Neautorizat" };
    const { data: biz } = await supabase
      .from("businesses").select("id").eq("user_id", user.id)
      .order("created_at").limit(1).single();
    if (!biz) return { error: "Neautorizat" };

    /* ⚠ De aici se citeste cu cheia de serviciu: `biz.id`, luat cu clientul omului, e singura granita. */
    const admin = createAdminClient();
    const citit = await magazinulPentruCompari(admin, { id: biz.id });
    if (!citit) return { error: "Magazin negăsit" };
    const produse = await produselePentruCompari(admin, citit.id);
    return rezumatulFeeduluiCompari(citit.magazin, produse, MAX_EXEMPLE);
  } catch {
    return { error: "Nu am putut citi produsele." };
  }
}
