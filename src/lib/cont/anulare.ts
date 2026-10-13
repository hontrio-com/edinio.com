import { createAdminClient } from "@/lib/supabase/admin";
import { getStoreEmailSender } from "@/lib/email/sender";
import { parseNotificationsConfig, sendComandaAnulataDeClient, sendOrderStatusToCustomer } from "@/lib/email";
import { dupaRaspuns } from "@/lib/marketplace/dupa-raspuns";
import { raporteazaRambursareaGa4 } from "@/lib/orders/ga4-comanda";
import type { MagazinDeCont } from "./magazinul-cererii";

const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL ?? "https://edinio.com";

/**
 * Adresa la care afla comerciantul ce se intampla in magazin: cea de instiintari
 * din Setari, altfel emailul proprietarului. `null` cand nu are niciuna.
 */
export async function adresaDeInstiintare(magazin: MagazinDeCont): Promise<string | null> {
  const admin = createAdminClient();
  const { data: setari } = await admin
    .from("store_settings").select("notifications_config").eq("business_id", magazin.id).maybeSingle();
  const cfg = parseNotificationsConfig((setari?.notifications_config as Record<string, unknown>) ?? {});
  const din = (cfg.notification_email ?? "").trim();
  if (din) return din;
  const { data } = await admin.auth.admin.getUserById(magazin.user_id);
  return data?.user?.email ?? null;
}

/**
 * Ce se intampla DUPA ce omul si-a anulat singur comanda din cont.
 *
 * ⚠⚠ Aceleasi urmari ca anularea din panou (`updateOrder`), fara de care
 * comerciantul putea expedia o comanda anulata: omul primeste emailul de stare,
 * COMERCIANTUL e anuntat, iar achizitia raportata la GA4 se intoarce. Stocul,
 * cuponul si coada de email marketing le face deja tranzitia din baza.
 *
 * Totul DUPA raspuns si fara sa poata strica anularea, care s-a facut deja.
 */
export function dupaAnulareaDinCont(magazin: MagazinDeCont, orderId: string): void {
  dupaRaspuns(() => raporteazaRambursareaGa4(orderId), "cont.anulare.ga4", magazin.id);

  dupaRaspuns(async () => {
    const admin = createAdminClient();
    const { data: o } = await admin
      .from("orders")
      .select("order_number, customer_name, customer_email, total")
      .eq("id", orderId)
      .eq("business_id", magazin.id)
      .maybeSingle();
    if (!o) return;
    const numeMagazin = magazin.store_name ?? magazin.business_name ?? "magazin";

    if (o.customer_email) {
      const sender = await getStoreEmailSender(admin, magazin.id);
      await sendOrderStatusToCustomer(o.customer_email, {
        order_number: o.order_number,
        customer_name: o.customer_name,
        total: Number(o.total),
        status: "cancelled",
        business_name: numeMagazin,
        store_url: magazin.custom_domain ? `https://${magazin.custom_domain}` : undefined,
      }, sender);
    }

    const catre = await adresaDeInstiintare(magazin);
    if (catre) {
      await sendComandaAnulataDeClient(catre, {
        business_name: numeMagazin,
        order_number: o.order_number,
        customer_name: o.customer_name,
        total: Number(o.total),
        link: `${SITE_URL}/dashboard/orders/${encodeURIComponent(orderId)}`,
      });
    }
  }, "cont.anulare.emailuri", magazin.id);
}

/**
 * Clientul a cerut anularea unei comenzi procesate in easySales (motivul `procesata-extern` din
 * `cont_anuleaza_comanda`). Comanda NU s-a anulat: factura si AWB-ul se fac acolo, deci anularea
 * o face comerciantul, din easySales sau cu „Anulează în easySales" din Edinio. Aici doar se
 * anunta, cel mult o data pe ora pe comanda (un client care apasa de zece ori nu da zece alarme).
 */
export function cerereaDeAnulareInEasySales(magazin: MagazinDeCont, orderId: string): void {
  dupaRaspuns(async () => {
    const { consumaLimita } = await import("@/lib/utils/limita-durabila");
    if (!(await consumaLimita(`cont-anulare-easysales:${orderId}`, 1, 3600)).permis) return;
    const admin = createAdminClient();
    const { data: o } = await admin.from("orders").select("order_number")
      .eq("id", orderId).eq("business_id", magazin.id).maybeSingle();
    if (!o) return;
    const { anunta } = await import("@/lib/easysales/notificari");
    await anunta(admin, magazin.id, {
      titlu: `Clientul cere anularea comenzii #${o.order_number}`,
      mesaj: "Comanda se procesează în easySales, deci n-am anulat-o din contul clientului. Anuleaz-o din easySales sau cu „Anulează în easySales” din pagina comenzii.",
      severitate: "warning", detalii: { orderId },
    });
  }, "cont.anulare.easysales", magazin.id);
}
