"use server";

import { revalidatePath } from "next/cache";
import { pastreazaSecretele } from "@/lib/integrari/secrete";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { sanitizeNetopiaBadge } from "@/lib/utils/sanitize-embed";
import { rambourseazaNetopia, type NetopiaConfig } from "@/lib/netopia";
import { secretDinConfig } from "@/lib/integrari/secret-server";
import { cheieOperatie, cuRegistru } from "@/lib/operatii/registru";
import { verdictFurnizor } from "@/lib/operatii/eroare-furnizor";
import { logError } from "@/lib/error-logger";

export async function saveNetopiaConfig(
  businessId: string,
  config: NetopiaConfig
): Promise<{ success: boolean; error?: string }> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { success: false, error: "Neautorizat" };

  const { data: biz } = await supabase
    .from("businesses")
    .select("id")
    .eq("id", businessId)
    .eq("user_id", user.id)
    .single();
  if (!biz) return { success: false, error: "Acces interzis" };

  // Trim credentials: pasted keys/signatures often carry stray whitespace or a
  // trailing newline, which silently breaks the Authorization header at checkout.
  const clean: NetopiaConfig = {
    ...config,
    pos_signature: config.pos_signature.trim(),
    api_key: config.api_key.trim(),
    title: config.title.trim(),
    // Strip to a safe Netopia-domain iframe; arbitrary pasted markup never reaches
    // the public footer.
    badge_html: sanitizeNetopiaBadge(config.badge_html),
  };

  // Campurile secrete venite GOALE isi pastreaza valoarea salvata: formularul le
  // primeste mascate (vezi lib/integrari/secrete.ts), deci o salvare obisnuita
  // nu trebuie sa le stearga. Fara asta, mascarea ar distruge integrarea.
  // Configul vechi se citeste cu SERVICE ROLE: pe clientul comerciantului campurile
  // secrete sosesc ca siruri `enc.v1.…`, iar `pastreazaSecretele` le-ar „pastra" asa.
  // Proprietatea magazinului e dovedita mai sus. Vezi src/lib/integrari/secrete.ts.
  const { data: vechi } = await createAdminClient()
    .from("store_settings").select("netopia_config").eq("business_id", businessId).maybeSingle();
  const cleanFinal = pastreazaSecretele("netopia_config", clean, vechi?.netopia_config);

  const { error } = await supabase
    .from("store_settings")
    .update({ netopia_config: cleanFinal as never, updated_at: new Date().toISOString() })
    .eq("business_id", businessId);

  if (error) return { success: false, error: "Eroare la salvare" };

  revalidatePath("/dashboard/features/netopia");
  revalidatePath("/dashboard/features");
  return { success: true };
}

export async function disconnectNetopia(
  businessId: string
): Promise<{ success: boolean; error?: string }> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { success: false, error: "Neautorizat" };

  const { data: biz } = await supabase
    .from("businesses")
    .select("id")
    .eq("id", businessId)
    .eq("user_id", user.id)
    .single();
  if (!biz) return { success: false, error: "Acces interzis" };

  const { error } = await supabase
    .from("store_settings")
    .update({ netopia_config: null })
    .eq("business_id", businessId);

  if (error) return { success: false, error: "Eroare la stergere" };

  revalidatePath("/dashboard/features/netopia");
  revalidatePath("/dashboard/features");
  return { success: true };
}

/**
 * Public: the Netopia visual-identity badge HTML for a store's footer. Returns ""
 * unless Netopia is enabled and a badge was configured. Reads via service role
 * (store_settings is not anon-readable) and returns ONLY the sanitized badge —
 * no credentials ever leave the server. Safe to call from the anonymous storefront.
 */
export async function getNetopiaBadge(businessId: string): Promise<string> {
  if (!businessId) return "";
  const admin = createAdminClient();
  const { data } = await admin
    .from("store_settings")
    .select("netopia_config")
    .eq("business_id", businessId)
    .single();
  const cfg = data?.netopia_config as NetopiaConfig | null;
  if (!cfg?.enabled) return "";
  // Sanitized at save; sanitize again defensively (cheap, server-side).
  return sanitizeNetopiaBadge(cfg.badge_html);
}

/**
 * ═══ RAMBURSAREA BANILOR PRIN NETOPIA (16.09.2026) ═══
 *
 * ⚠⚠ E O ACTIUNE SEPARATA, NU E LEGATA DE SELECTORUL DE STATUS, SI ASTA E HOTARAREA CENTRALA.
 *
 * Pana azi niciun procesator din platforma nu trimitea bani inapoi pe API: „rambursat" era doar o
 * eticheta pe care comerciantul o punea DUPA ce daduse banii de mana din panoul procesatorului.
 * Legata de acel selector, apasarea lui obisnuita ar fi trimis banii A DOUA OARA, in tacere, la
 * fiecare comanda deja rambursata manual.
 *
 * Deci butonul e nou, e numit pe fata, si selectorul vechi ramane exact ce era: o eticheta.
 *
 * ⚠ SE RAMBURSEAZA INTREG, o singura data. Cheia de registru e comanda, deci a doua apasare nu
 * cheama furnizorul. Rambursarea partiala ar cere o suma introdusa de om, deci si o istorie a
 * sumelor deja intoarse; pana exista aceea, un singur foc e singurul lucru pe care il putem apara.
 *
 * ⚠ STATUSUL SE SCRIE PRIN `aplica_tranzitia_comenzii`, ca la panou. Un `update` direct ar fi
 * lasat cuponul si stocul neatinse, deci „rambursat" ar fi insemnat doua lucruri diferite dupa
 * cum a fost apasat. Un cuvant, un inteles.
 */
export async function rambourseazaPrinNetopia(
  orderId: string,
): Promise<{ success: boolean; error?: string; mesaj?: string }> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { success: false, error: "Neautorizat" };

  const admin = createAdminClient();
  const { data: order } = await admin
    .from("orders")
    .select("id, business_id, order_number, status, payment_status, payment_method, total, netopia_ntp_id")
    .eq("id", orderId)
    .single();
  if (!order) return { success: false, error: "Comanda nu exista" };

  /* Proprietatea magazinului, cu clientul UTILIZATORULUI: randul de mai sus a venit cu rol de
     serviciu, deci pana aici nu s-a dovedit nimic despre cine cheama. */
  const { data: biz } = await supabase
    .from("businesses").select("id").eq("id", order.business_id).eq("user_id", user.id).single();
  if (!biz) return { success: false, error: "Acces interzis" };

  if (order.payment_method !== "netopia") {
    return { success: false, error: "Comanda nu a fost platita prin Netopia." };
  }
  if (order.payment_status === "refunded") {
    return { success: false, error: "Comanda e deja marcata rambursata." };
  }
  if (order.payment_status !== "paid") {
    return { success: false, error: "Nu se poate rambursa o comanda care nu e platita." };
  }
  /*
   * ⚠ FARA `ntpID` NU EXISTA TINTA. E singurul lucru dupa care ei cunosc tranzatia, si se scrie
   * pe comanda la pornirea platii. Masurat pe 16.09: ramane ACELASI pe toate reincercarile
   * aceleiasi comenzi, deci nu poate tinti o incercare veche si refuzata.
   */
  const ntpID = (order.netopia_ntp_id as string | null)?.trim();
  if (!ntpID) {
    return { success: false, error: "Comanda nu are un identificator de tranzactie Netopia, deci rambursarea trebuie facuta din panoul Netopia." };
  }

  const suma = Number(order.total);
  if (!Number.isFinite(suma) || suma <= 0) {
    return { success: false, error: "Totalul comenzii nu e o suma valida." };
  }

  const { data: st } = await admin
    .from("store_settings").select("netopia_config").eq("business_id", order.business_id).maybeSingle();
  const cfg = st?.netopia_config as NetopiaConfig | null;
  if (!cfg?.enabled || !cfg.api_key) {
    return { success: false, error: "Netopia nu e configurat pentru acest magazin." };
  }
  const apiKey = await secretDinConfig(order.business_id, "netopia_config", "api_key");
  if (!apiKey) return { success: false, error: "Cheia API Netopia nu a putut fi citita." };

  const r = await cuRegistru(
    admin,
    {
      businessId: order.business_id,
      orderId,
      fel: "rambursare",
      furnizor: "netopia",
      /* Cheia poarta deja comanda, deci `tinta` ar fi aceeasi cu ea. Se lasa nedata, ca la toti
         ceilalti furnizori. */
      cheie: cheieOperatie("rambursare", "netopia", orderId),
    },
    async () => {
      const rod = await rambourseazaNetopia({ ntpID, amount: suma }, apiKey, cfg.sandbox === true);
      return {
        referinta: rod.ntpID,
        detalii: { status: rod.status, mesaj: rod.mesaj, suma } as never,
        valoare: rod,
      };
    },
    verdictFurnizor,
  );

  if (r.fel === "blocat") return { success: false, error: r.mesaj };
  if (r.fel === "eroare") return { success: false, error: r.mesaj };
  if (r.fel === "deja") {
    return { success: true, mesaj: "Rambursarea fusese deja trimisa la Netopia pentru aceasta comanda." };
  }

  /*
   * ⚠ SE SCRIE SI DE AICI, desi IPN-ul lor aduce oricum statusul 8 si ar face-o el.
   *
   * Ei au INCUVIINTAT sincron (`code: "00"`), deci stim deja ce s-a intamplat, iar un IPN pierdut
   * ar fi lasat comanda „platita" cu banii plecati: cea mai urata stare cu putinta. Scrierea din
   * IPN ramane, si nu strica nimic: e aceeasi valoare.
   */
  const { data: t, error: eT } = await admin.rpc("aplica_tranzitia_comenzii", {
    p_order_id: orderId,
    p_status: order.status as string,
    p_payment_status: "refunded",
    p_business_id: order.business_id,
  });
  const rez = t as { gasit?: boolean } | null;
  if (eT || rez?.gasit !== true) {
    await logError({
      action: "netopia.rambursare",
      message: `Banii au fost rambursati la Netopia pentru comanda ${order.order_number ?? orderId}, dar comanda NU s-a putut marca rambursata: ${eT?.message ?? "tranzitia n-a raspuns valid"}`,
      details: { orderId, ntpID },
      businessId: order.business_id,
      severity: "critical",
    });
    return { success: true, mesaj: "Banii au fost trimisi inapoi, dar comanda nu s-a putut marca rambursata. Verifica statusul comenzii." };
  }

  revalidatePath(`/dashboard/orders/${orderId}`);
  return { success: true, mesaj: `Rambursarea de ${suma.toFixed(2)} lei a fost trimisa la Netopia.` };
}
