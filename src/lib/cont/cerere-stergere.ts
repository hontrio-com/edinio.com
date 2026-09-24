import { createAdminClient } from "@/lib/supabase/admin";
import { parseNotificationsConfig, sendCerereDeStergere } from "@/lib/email";
import { logError } from "@/lib/error-logger";
import { contacteleMele } from "./date";
import { comenzileMele } from "./comenzi";
import type { MagazinDeCont } from "./magazinul-cererii";

/**
 * Cererea omului catre comerciant de a-i sterge si datele din comenzi.
 *
 * ⚠⚠ IN DOI PASI, si ordinea conteaza:
 *   1. `pregatesteCerereaDeStergere` se cheama INAINTEA stergerii contului: dupa
 *      ea, contactele si legaturile cu comenzile nu mai exista;
 *   2. `trimiteCerereaDeStergere` se cheama DUPA ce stergerea a reusit. Trimisa
 *      inainte, o stergere cazuta lasa comerciantul cu o cerere pentru un cont
 *      care exista inca, iar fiecare reincercare a omului mai trimitea una.
 *
 * ⚠ Cu NUMERELE comenzilor si cu legatura spre fiecare: o comanda legata din cont
 * (sau de comerciant) poate purta alt telefon sau alt email decat contul, deci
 * tocmai pe ea n-ar gasi-o cautand dupa contactele omului.
 * ⚠ Destinatarul e acelasi ca la comenzile noi: adresa de instiintari din Setari,
 * altfel emailul proprietarului.
 */
export type CerereDeStergere = {
  catre: string;
  business_name: string;
  emailuri: string[];
  telefoane: string[];
  comenzi: number;
  numere: { numar: string; id: string }[];
};

/** Citeste tot ce trebuie spus comerciantului. `null` daca n-are unde pleca sau n-a mers citirea. */
export async function pregatesteCerereaDeStergere(magazin: MagazinDeCont, contId: string): Promise<CerereDeStergere | null> {
  try {
    const admin = createAdminClient();
    const [contacte, comenzi, setari] = await Promise.all([
      contacteleMele(magazin.id, contId),
      /* 100 e plafonul din baza (`cont_comenzile_mele`); peste el, emailul spune cate mai sunt. */
      comenzileMele(magazin.id, contId, 100, 0),
      admin.from("store_settings").select("notifications_config").eq("business_id", magazin.id).maybeSingle(),
    ]);
    const cfg = parseNotificationsConfig((setari.data?.notifications_config as Record<string, unknown>) ?? {});
    let catre = (cfg.notification_email ?? "").trim();
    if (!catre) {
      const { data } = await admin.auth.admin.getUserById(magazin.user_id);
      catre = data?.user?.email ?? "";
    }
    if (!catre) return null;
    return {
      catre,
      business_name: magazin.store_name ?? magazin.business_name ?? "magazin",
      emailuri: contacte.filter((c) => c.fel === "email").map((c) => c.valoareBruta),
      telefoane: contacte.filter((c) => c.fel === "telefon").map((c) => c.valoareBruta),
      comenzi: comenzi.total,
      numere: comenzi.comenzi.map((c) => ({ numar: c.numar, id: c.orderId })),
    };
  } catch (e) {
    await logError({
      action: "cont/cerere-stergere",
      message: `cererea de stergere nu s-a putut pregati: ${String(e)}`,
      businessId: magazin.id,
      severity: "warning",
    });
    return null;
  }
}

/**
 * Trimite cererea pregatita. Intoarce daca a plecat; esecul nu strica stergerea
 * contului, care s-a facut deja, iar ecranul ii spune omului sa scrie el magazinului.
 */
export async function trimiteCerereaDeStergere(magazinId: string, c: CerereDeStergere | null): Promise<boolean> {
  if (!c) return false;
  try {
    const { catre, ...date } = c;
    return await sendCerereDeStergere(catre, { ...date, primitaLa: new Date().toISOString() });
  } catch (e) {
    await logError({
      action: "cont/cerere-stergere",
      message: `cererea de stergere nu a plecat: ${String(e)}`,
      businessId: magazinId,
      severity: "warning",
    });
    return false;
  }
}
