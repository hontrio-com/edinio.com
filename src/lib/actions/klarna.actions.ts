"use server";

import { revalidatePath } from "next/cache";
import { pastreazaSecretele } from "@/lib/integrari/secrete";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { refundOrder, klarnaReady, toMinor, type KlarnaConfig } from "@/lib/klarna";
import { secretDinConfig } from "@/lib/integrari/secret-server";
import { cheieOperatie, cuRegistru } from "@/lib/operatii/registru";
import { eroareRefuz, verdictFurnizor } from "@/lib/operatii/eroare-furnizor";

export async function saveKlarnaConfig(
  businessId: string,
  config: KlarnaConfig,
): Promise<{ success: boolean; error?: string }> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { success: false, error: "Neautorizat" };

  const { data: biz } = await supabase
    .from("businesses")
    .select("id, slug")
    .eq("id", businessId)
    .eq("user_id", user.id)
    .single();
  if (!biz) return { success: false, error: "Acces interzis" };

  // Trim credentials: pasted keys often carry stray whitespace or a trailing
  // newline, which silently breaks the Basic auth header at checkout.
  const clean: KlarnaConfig = {
    ...config,
    username: config.username.trim(),
    password: config.password.trim(),
    title: config.title.trim(),
  };

  // Campurile secrete venite GOALE isi pastreaza valoarea salvata: formularul le
  // primeste mascate (vezi lib/integrari/secrete.ts), deci o salvare obisnuita
  // nu trebuie sa le stearga. Fara asta, mascarea ar distruge integrarea.
  // Configul vechi se citeste cu SERVICE ROLE: pe clientul comerciantului campurile
  // secrete sosesc ca siruri `enc.v1.…`, iar `pastreazaSecretele` le-ar „pastra" asa.
  // Proprietatea magazinului e dovedita mai sus. Vezi src/lib/integrari/secrete.ts.
  const { data: vechi } = await createAdminClient()
    .from("store_settings").select("klarna_config").eq("business_id", businessId).maybeSingle();
  const cleanFinal = pastreazaSecretele("klarna_config", clean, vechi?.klarna_config);

  const { error } = await supabase
    .from("store_settings")
    .update({ klarna_config: cleanFinal as never, updated_at: new Date().toISOString() })
    .eq("business_id", businessId);

  if (error) return { success: false, error: "Eroare la salvare" };

  revalidatePath("/dashboard/features/klarna");
  revalidatePath("/dashboard/features");
  revalidatePath("/dashboard/settings");
  if (biz.slug) revalidatePath(`/${biz.slug}`);
  return { success: true };
}

export async function disconnectKlarna(
  businessId: string,
): Promise<{ success: boolean; error?: string }> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { success: false, error: "Neautorizat" };

  const { data: biz } = await supabase
    .from("businesses")
    .select("id, slug")
    .eq("id", businessId)
    .eq("user_id", user.id)
    .single();
  if (!biz) return { success: false, error: "Acces interzis" };

  const { error } = await supabase
    .from("store_settings")
    .update({ klarna_config: null })
    .eq("business_id", businessId);

  if (error) return { success: false, error: "Eroare la stergere" };

  revalidatePath("/dashboard/features/klarna");
  revalidatePath("/dashboard/features");
  revalidatePath("/dashboard/settings");
  if (biz.slug) revalidatePath(`/${biz.slug}`);
  return { success: true };
}

/**
 * ═══ RAMBURSAREA BANILOR PRIN KLARNA (17.09.2026) ═══
 *
 * ⚠ `refundOrder` exista scrisa in `lib/klarna.ts` si NU O CHEMA NIMENI, exact ca la iPay. Cod mort
 * intr-o integrare care n-a rulat niciodata: o unealta despre care nimeni n-ar fi aflat ca e stricata.
 *
 * ⚠⚠ ACTIUNE SEPARATA, nu legata de selectorul de status: acolo „rambursat" e o eticheta pusa dupa
 * o rambursare facuta de mana in portalul lor. Legata, apasarea obisnuita ar trimite banii a doua oara.
 *
 * ⚠ SE POATE RAMBURSA DOAR CE E CAPTURAT. La Klarna banii se incaseaza prin `capture`, iar
 * `refund` lucreaza peste sumele capturate. De aceea se cere `payment_status === "paid"`: la noi
 * acela se scrie EXACT dupa un capture reusit.
 *
 * ⚠ SI STATUSUL NU SE SCRIE DE AICI, ca la iPay: adevarul despre bani il da
 * `GET /ordermanagement/v1/orders/{id}` prin `refunded_amount`, iar cronul il citeste si trece
 * comanda prin ACEEASI regula ca o rambursare facuta in portalul lor. Un singur drum catre „rambursat".
 */
export async function rambourseazaPrinKlarna(
  orderId: string,
): Promise<{ success: boolean; error?: string; mesaj?: string }> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { success: false, error: "Neautorizat" };

  const admin = createAdminClient();
  const { data: order } = await admin
    .from("orders")
    .select("id, business_id, order_number, payment_status, payment_method, total, klarna_order_id")
    .eq("id", orderId)
    .single();
  if (!order) return { success: false, error: "Comanda nu exista" };

  const { data: biz } = await supabase
    .from("businesses").select("id").eq("id", order.business_id).eq("user_id", user.id).single();
  if (!biz) return { success: false, error: "Acces interzis" };

  if (order.payment_method !== "klarna") {
    return { success: false, error: "Comanda nu a fost platita prin Klarna." };
  }
  if (order.payment_status === "refunded") {
    return { success: false, error: "Comanda e deja marcata rambursata." };
  }
  if (order.payment_status !== "paid") {
    return { success: false, error: "Nu se poate rambursa o comanda care nu e incasata." };
  }
  const klarnaOrderId = (order.klarna_order_id as string | null)?.trim();
  if (!klarnaOrderId) {
    return { success: false, error: "Comanda nu are un identificator de comanda Klarna, deci rambursarea trebuie facuta din portalul Klarna." };
  }

  const suma = Number(order.total);
  if (!Number.isFinite(suma) || suma <= 0) {
    return { success: false, error: "Totalul comenzii nu e o suma valida." };
  }

  const { data: st } = await admin
    .from("store_settings").select("klarna_config").eq("business_id", order.business_id).maybeSingle();
  const cfg = st?.klarna_config as KlarnaConfig | null;
  if (!klarnaReady(cfg)) return { success: false, error: "Klarna nu e configurat pentru acest magazin." };

  const parola = await secretDinConfig(order.business_id, "klarna_config", "password");
  const cheamaCu: KlarnaConfig = { ...cfg!, ...(parola ? { password: parola } : {}) };

  const r = await cuRegistru(
    admin,
    {
      businessId: order.business_id,
      orderId,
      fel: "rambursare",
      furnizor: "klarna",
      cheie: cheieOperatie("rambursare", "klarna", orderId),
    },
    async () => {
      const rod = await refundOrder(cheamaCu, klarnaOrderId, toMinor(suma));
      /* ⚠ Tacerea nu e incuviintare: un raspuns care nu e `ok` opreste totul. */
      if (!rod.ok) throw eroareRefuz(rod.error || "Klarna a refuzat rambursarea.");
      return { referinta: klarnaOrderId, detalii: { suma } as never, valoare: rod };
    },
    verdictFurnizor,
  );

  if (r.fel === "blocat" || r.fel === "eroare") return { success: false, error: r.mesaj };
  if (r.fel === "deja") {
    return { success: true, mesaj: "Rambursarea fusese deja trimisa la Klarna pentru aceasta comanda." };
  }

  revalidatePath(`/dashboard/orders/${orderId}`);
  return {
    success: true,
    mesaj: `Rambursarea de ${suma.toFixed(2)} lei a fost trimisa la Klarna. `
      + "Comanda se marcheaza rambursata dupa ce ei confirma, in cel mult 5 minute.",
  };
}
