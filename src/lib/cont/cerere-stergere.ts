import { createAdminClient } from "@/lib/supabase/admin";
import { parseNotificationsConfig, sendCerereDeStergere } from "@/lib/email";
import { logError } from "@/lib/error-logger";
import { contacteleMele } from "./date";
import { comenzileMele } from "./comenzi";
import type { MagazinDeCont } from "./magazinul-cererii";

/**
 * Trimite comerciantului cererea omului de a-i sterge si datele din comenzi.
 *
 * ⚠ Se cheama INAINTEA stergerii contului: dupa ea, contactele si legaturile cu
 * comenzile nu mai exista, deci n-ar mai fi nimic de spus comerciantului.
 * ⚠ Cu NUMERELE comenzilor, nu doar cu contactele: o comanda legata din cont (sau
 * de comerciant) poate purta alt telefon sau alt email decat contul, iar dupa
 * stergere nimeni n-ar mai sti care erau.
 * ⚠ Destinatarul e acelasi ca la comenzile noi: adresa de instiintari din Setari,
 * altfel emailul proprietarului.
 * ⚠ Intoarce daca a plecat. Esecul nu opreste stergerea contului; ecranul ii
 * spune omului sa scrie el magazinului.
 */
export async function trimiteCerereaDeStergere(magazin: MagazinDeCont, contId: string): Promise<boolean> {
  try {
    const admin = createAdminClient();
    const [contacte, comenzi, setari] = await Promise.all([
      contacteleMele(magazin.id, contId),
      comenzileMele(magazin.id, contId, 200, 0),
      admin.from("store_settings").select("notifications_config").eq("business_id", magazin.id).maybeSingle(),
    ]);
    const cfg = parseNotificationsConfig((setari.data?.notifications_config as Record<string, unknown>) ?? {});
    let catre = (cfg.notification_email ?? "").trim();
    if (!catre) {
      const { data } = await admin.auth.admin.getUserById(magazin.user_id);
      catre = data?.user?.email ?? "";
    }
    if (!catre) return false;
    return await sendCerereDeStergere(catre, {
      business_name: magazin.store_name ?? magazin.business_name ?? "magazin",
      emailuri: contacte.filter((c) => c.fel === "email").map((c) => c.valoareBruta),
      telefoane: contacte.filter((c) => c.fel === "telefon").map((c) => c.valoareBruta),
      comenzi: comenzi.total,
      numere: comenzi.comenzi.map((c) => c.numar),
      primitaLa: new Date().toISOString(),
    });
  } catch (e) {
    await logError({
      action: "cont/cerere-stergere",
      message: `cererea de stergere nu a plecat: ${String(e)}`,
      businessId: magazin.id,
      severity: "warning",
    });
    return false;
  }
}
