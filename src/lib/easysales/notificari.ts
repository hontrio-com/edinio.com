import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/types/database.types";
import { logError } from "@/lib/error-logger";
import type { DepozitEasySales } from "./depozit";
import type { EasySalesConfig } from "./tipuri";

/**
 * Ce i se spune comerciantului: clopotelul din panou (`notifications`) SI jurnalul.
 *
 * ⚠ O SEMNALARE CARE NU AJUNGE LA OM NU E O SEMNALARE (memoria cu acelasi nume): cinci cronuri
 * de urmarire scriau numai in `error_logs`. Aici notificarea se scrie INTAI, iar jurnalul dupa.
 *
 * ⚠ Si a doua jumatate: o alarma care se repeta la fiecare trecere a cronului devine zgomot.
 * Evenimentele pe comanda se anunta la SCHIMBAREA starii legaturii (apelantii scriu starea cu
 * compare-and-set si anunta numai cand scrierea a prins). Alarmele de magazin (token, plafon,
 * website dezactivat) trec prin `anuntaRar`, cu marcajul in configurare.
 *
 * Nicio functie de aici nu arunca: o notificare picata nu opreste lucrul.
 */

type Admin = SupabaseClient<Database>;

export interface Anunt {
  titlu: string;
  mesaj: string;
  severitate?: "info" | "warning" | "error" | "critical";
  detalii?: Record<string, unknown>;
}

export async function anunta(admin: Admin, businessId: string, a: Anunt): Promise<void> {
  try {
    const { data } = await admin.from("businesses").select("user_id").eq("id", businessId).maybeSingle();
    const userId = (data as { user_id?: string | null } | null)?.user_id ?? null;
    if (userId) {
      const { error } = await admin.from("notifications").insert({
        user_id: userId, type: "easysales", title: a.titlu.slice(0, 200), message: a.mesaj.slice(0, 1000),
      });
      if (error) console.error("[easysales] notificarea nu s-a scris:", error.message);
    }
  } catch (e) {
    console.error("[easysales] notificarea a cazut:", (e as Error).message);
  }
  await logError({
    action: "easysales", message: `${a.titlu}: ${a.mesaj}`.slice(0, 1000),
    details: a.detalii, businessId, severity: a.severitate ?? "warning",
  });
}

/**
 * Ca `anunta`, dar cel mult o data la `intervalMs` pe cheie. Marcajul sta in `easysales_config.alarme`.
 *
 * ⚠ Harta se scrie INTREAGA (imbinarea lucreaza pe primul nivel): o cursa poate pierde un marcaj,
 * iar pretul e o notificare in plus, nu una pierduta.
 */
export async function anuntaRar(
  admin: Admin, dep: DepozitEasySales, businessId: string, cfg: EasySalesConfig,
  cheie: string, intervalMs: number, a: Anunt,
): Promise<boolean> {
  const ultima = cfg.alarme?.[cheie] ? Date.parse(cfg.alarme[cheie]) : 0;
  if (Number.isFinite(ultima) && Date.now() - ultima < intervalMs) return false;
  const alarme = { ...(cfg.alarme ?? {}), [cheie]: new Date().toISOString() };
  /* Marcajele mai vechi de o saptamana se arunca, ca harta sa nu creasca la nesfarsit. */
  for (const [k, v] of Object.entries(alarme)) {
    if (Date.now() - Date.parse(v) > 7 * 24 * 3600_000) delete alarme[k];
  }
  try {
    await dep.peticConfig(businessId, { alarme });
    cfg.alarme = alarme;
  } catch {
    /* Fara marcaj, tot se anunta: mai bine de doua ori decat niciodata. */
  }
  await anunta(admin, businessId, a);
  return true;
}
