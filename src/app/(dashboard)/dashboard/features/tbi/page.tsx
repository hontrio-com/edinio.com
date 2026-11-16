import { createHash } from "node:crypto";
import { redirect } from "next/navigation";
import { getCachedUser, getCachedBusinessWithSettings } from "@/lib/supabase/cached-queries";
import { createAdminClient } from "@/lib/supabase/admin";
import { mascheazaConfig } from "@/lib/integrari/secrete";
import { citesteConfigTbi, tbiGata, type TbiConfig } from "@/lib/tbi/config";
import TbiConfigClient, { type StareTbiPanou } from "@/components/dashboard/TbiConfigClient";

/**
 * Pagina tbi bank din Integrari. Secretele nu coboara in pagina: formularul primeste configurarea
 * MASCATA (`mascheazaConfig`), iar ce e salvat se vede doar ca „salvată”.
 *
 * Produsele de finantare (GetCalculations) NU se cer aici: o banca lenta ar fi tinut toata pagina pe
 * loc. Le cere formularul, dupa montare.
 */

async function citesteStareaTbi(businessId: string) {
  const admin = createAdminClient();
  const deLa = new Date(Date.now() - 30 * 86_400_000).toISOString();
  const [{ data: rand }, { data: cereri }] = await Promise.all([
    admin.from("store_settings").select("tbi_config").eq("business_id", businessId).maybeSingle(),
    admin.from("tbi_cereri")
      .select("stare, created_at, ultima_veste_la")
      .eq("business_id", businessId)
      .gte("created_at", deLa)
      .order("created_at", { ascending: false })
      .limit(1000),
  ]);
  return { rand, cereri };
}

export default async function TbiPage() {
  const user = await getCachedUser();
  if (!user) redirect("/login");
  const { business, settings } = await getCachedBusinessWithSettings(user.id);
  if (!business) redirect("/dashboard");

  const mascat = mascheazaConfig("tbi_config", settings?.tbi_config ?? null);
  const initial: (TbiConfig & { _completate?: Record<string, boolean> }) | null = mascat
    ? { ...citesteConfigTbi(mascat), _completate: mascat._completate }
    : null;

  const { rand, cereri } = await citesteStareaTbi(business.id);
  const lista = cereri ?? [];
  const ultimaVeste = lista.map((c) => c.ultima_veste_la).filter((x): x is string => !!x).sort().pop() ?? null;
  const stare: StareTbiPanou = {
    gata: tbiGata(rand?.tbi_config ?? null),
    ultimaVeste,
    ultimaCerere: lista[0]?.created_at ?? null,
    cereri30: lista.length,
    aprobate30: lista.filter((c) => c.stare === "aprobata").length,
    respinse30: lista.filter((c) => c.stare === "respinsa").length,
    deschise30: lista.filter((c) => c.stare === "trimisa" || c.stare === "in_analiza" || c.stare === "creata").length,
  };

  /* Montare noua cand se schimba ce e salvat: formularul isi reia starea de baza. */
  const versiune = createHash("sha1").update(JSON.stringify(initial)).digest("hex").slice(0, 12);
  return <TbiConfigClient key={versiune} businessId={business.id} initialConfig={initial} stare={stare} />;
}
