"use server";

import { revalidatePath } from "next/cache";
import { pastreazaSecretele } from "@/lib/integrari/secrete";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { ipayRefund, ipayReady, toBani, type IPayConfig } from "@/lib/ipay";
import { secretDinConfig } from "@/lib/integrari/secret-server";
import { cheieOperatie, cuRegistru } from "@/lib/operatii/registru";
import { eroareRefuz, verdictFurnizor } from "@/lib/operatii/eroare-furnizor";

export async function saveIpayConfig(
  businessId: string,
  config: IPayConfig,
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

  // Campurile secrete venite GOALE isi pastreaza valoarea salvata: formularul le
  // primeste mascate (vezi lib/integrari/secrete.ts), deci o salvare obisnuita
  // nu trebuie sa le stearga. Fara asta, mascarea ar distruge integrarea.
  // Configul vechi se citeste cu SERVICE ROLE: pe clientul comerciantului campurile
  // secrete sosesc ca siruri `enc.v1.…`, iar `pastreazaSecretele` le-ar „pastra" asa.
  // Proprietatea magazinului e dovedita mai sus. Vezi src/lib/integrari/secrete.ts.
  const { data: vechi } = await createAdminClient()
    .from("store_settings").select("ipay_config").eq("business_id", businessId).maybeSingle();
  const configFinal = pastreazaSecretele("ipay_config", config, vechi?.ipay_config);

  const { error } = await supabase
    .from("store_settings")
    .update({ ipay_config: configFinal as never, updated_at: new Date().toISOString() })
    .eq("business_id", businessId);

  if (error) return { success: false, error: "Eroare la salvare" };

  revalidatePath("/dashboard/features/ipay");
  revalidatePath("/dashboard/features");
  revalidatePath("/dashboard/settings");
  if (biz.slug) revalidatePath(`/${biz.slug}`);
  return { success: true };
}

export async function disconnectIpay(
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
    .update({ ipay_config: null })
    .eq("business_id", businessId);

  if (error) return { success: false, error: "Eroare la stergere" };

  revalidatePath("/dashboard/features/ipay");
  revalidatePath("/dashboard/features");
  revalidatePath("/dashboard/settings");
  if (biz.slug) revalidatePath(`/${biz.slug}`);
  return { success: true };
}

/**
 * ═══ RAMBURSAREA BANILOR PRIN iPay, `refund.do` (17.09.2026) ═══
 *
 * ⚠ `ipayRefund` exista scrisa in `lib/ipay.ts` de multa vreme si NU O CHEMA NIMENI. Cod mort intr-o
 * integrare care n-a rulat niciodata: adica o unealta despre care nimeni n-ar fi aflat ca e stricata.
 * Vezi memoria `unealta-scrisa-anume-si-nechemata`.
 *
 * ⚠⚠ E O ACTIUNE SEPARATA, NU E LEGATA DE SELECTORUL DE STATUS, exact ca la Netopia. In panou
 * „rambursat" e o eticheta pe care comerciantul o pune DUPA ce a dat banii de mana din consola lor.
 * Legata de acel selector, apasarea obisnuita ar fi trimis banii a doua oara.
 *
 * ⚠ SE RAMBURSEAZA INTREG, o singura data. Cheia de registru e comanda, deci a doua apasare nu
 * cheama furnizorul. Partial ar cere o suma introdusa de om si o istorie a sumelor deja intoarse.
 *
 * ⚠ SI STATUSUL NU SE SCRIE DE AICI. La Netopia se scrie, fiindca ei incuviinteaza sincron. Aici
 * raspunsul lui `refund.do` spune doar ca a fost primit; adevarul despre bani il da
 * `getOrderStatusExtended.do`, iar cronul il citeste la fiecare 15 minute si trece comanda prin
 * ACEEASI regula ca o rambursare facuta din consola lor. Un singur drum catre „rambursat".
 */
export async function rambourseazaPrinIpay(
  orderId: string,
): Promise<{ success: boolean; error?: string; mesaj?: string }> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { success: false, error: "Neautorizat" };

  const admin = createAdminClient();
  const { data: order } = await admin
    .from("orders")
    .select("id, business_id, order_number, payment_status, payment_method, total, ipay_order_id")
    .eq("id", orderId)
    .single();
  if (!order) return { success: false, error: "Comanda nu exista" };

  /* Proprietatea magazinului, cu clientul UTILIZATORULUI: randul de mai sus a venit cu rol de
     serviciu, deci pana aici nu s-a dovedit nimic despre cine cheama. */
  const { data: biz } = await supabase
    .from("businesses").select("id").eq("id", order.business_id).eq("user_id", user.id).single();
  if (!biz) return { success: false, error: "Acces interzis" };

  if (order.payment_method !== "ipay") {
    return { success: false, error: "Comanda nu a fost platita prin iPay." };
  }
  if (order.payment_status === "refunded") {
    return { success: false, error: "Comanda e deja marcata rambursata." };
  }
  if (order.payment_status !== "paid") {
    return { success: false, error: "Nu se poate rambursa o comanda care nu e platita." };
  }
  /* ⚠ `refund.do` cere id-ul LOR de comanda. Fara el nu exista tinta. */
  const ipayOrderId = (order.ipay_order_id as string | null)?.trim();
  if (!ipayOrderId) {
    return { success: false, error: "Comanda nu are un identificator de tranzactie iPay, deci rambursarea trebuie facuta din consola iPay." };
  }

  const suma = Number(order.total);
  if (!Number.isFinite(suma) || suma <= 0) {
    return { success: false, error: "Totalul comenzii nu e o suma valida." };
  }

  const { data: st } = await admin
    .from("store_settings").select("ipay_config").eq("business_id", order.business_id).maybeSingle();
  const cfg = st?.ipay_config as IPayConfig | null;
  if (!ipayReady(cfg)) return { success: false, error: "iPay nu e configurat pentru acest magazin." };

  const parola = await secretDinConfig(order.business_id, "ipay_config", "password");
  if (!parola) return { success: false, error: "Parola iPay nu a putut fi citita." };
  const cheamaCu: IPayConfig = { ...cfg!, password: parola };

  const r = await cuRegistru(
    admin,
    {
      businessId: order.business_id,
      orderId,
      fel: "rambursare",
      furnizor: "ipay",
      /* Cheia poarta deja comanda, deci `tinta` ar fi aceeasi cu ea. */
      cheie: cheieOperatie("rambursare", "ipay", orderId),
    },
    async () => {
      const rod = await ipayRefund(cheamaCu, ipayOrderId, toBani(suma));
      /*
       * ⚠ `errorCode === "0"` E SINGURA INCUVIINTARE, si se cere EXPLICIT. La o operatie care muta
       * bani, tacerea nu inseamna „s-a facut": un corp fara cod citit ca succes ar fi marcat comanda
       * rambursata fara ca banii sa plece.
       */
      if (!rod.ok) {
        throw eroareRefuz(
          rod.errorMessage
            ? `iPay a refuzat rambursarea: ${rod.errorMessage} (cod ${rod.errorCode || "lipsa"})`
            : `iPay a refuzat rambursarea (cod ${rod.errorCode || "lipsa"}).`,
        );
      }
      return { referinta: ipayOrderId, detalii: { suma, actionCode: rod.actionCode ?? null } as never, valoare: rod };
    },
    verdictFurnizor,
  );

  if (r.fel === "blocat" || r.fel === "eroare") return { success: false, error: r.mesaj };
  if (r.fel === "deja") {
    return { success: true, mesaj: "Rambursarea fusese deja trimisa la iPay pentru aceasta comanda." };
  }

  revalidatePath(`/dashboard/orders/${orderId}`);
  return {
    success: true,
    mesaj: `Rambursarea de ${suma.toFixed(2)} lei a fost trimisa la iPay. `
      + "Comanda se marcheaza rambursata dupa ce ei confirma, in cel mult 15 minute.",
  };
}
