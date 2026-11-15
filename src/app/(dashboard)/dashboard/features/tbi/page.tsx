import { createHash } from "node:crypto";
import { redirect } from "next/navigation";
import { getCachedUser, getCachedBusinessWithSettings } from "@/lib/supabase/cached-queries";
import { createAdminClient } from "@/lib/supabase/admin";
import { mascheazaConfig } from "@/lib/integrari/secrete";
import { citesteConfigTbi, tbiGata, type TbiConfig } from "@/lib/tbi/config";
import { amprentaCheii, citesteCheiaPrivata, citesteCheiaPublicaTbi } from "@/lib/tbi/cripto";
import TbiConfigClient, { type StareTbiPanou } from "@/components/dashboard/TbiConfigClient";

/**
 * Configurarea decriptata si cererile din ultimele 30 de zile. In afara componentei: ceasul
 * (`Date.now()`) nu are ce cauta in corpul unei componente, care trebuie sa fie pura.
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

/**
 * tbi bank: plata in rate. Fisa: `docs/plati/TBI.md`.
 *
 * ⚠ In browser pleaca configurarea MASCATA: parola si cheia privata vin goale, cu `_completate`.
 * Amprentele cheilor se socotesc AICI, pe server, din configurarea decriptata, si pleaca doar ele:
 * omul poate verifica ce a salvat fara ca vreo cheie privata sa coboare in pagina.
 */
export default async function TbiPage() {
  const user = await getCachedUser();
  if (!user) redirect("/login");
  const { business, settings } = await getCachedBusinessWithSettings(user.id);
  if (!business) redirect("/dashboard");

  const mascat = mascheazaConfig("tbi_config", settings?.tbi_config ?? null);
  const initial: (TbiConfig & { _completate?: Record<string, boolean> }) | null = mascat
    ? { ...citesteConfigTbi(mascat), _completate: mascat._completate }
    : null;

  /* Decriptat cu service role DUPA ce `getCachedBusinessWithSettings` a legat magazinul de om. */
  const { rand, cereri } = await citesteStareaTbi(business.id);
  const complet = citesteConfigTbi(rand?.tbi_config ?? null);
  let amprentaPublica: string | null = null;
  let amprentaPrivata: string | null = null;
  try { if (complet.cheie_publica_tbi) amprentaPublica = amprentaCheii(citesteCheiaPublicaTbi(complet.cheie_publica_tbi).cheie); } catch { amprentaPublica = null; }
  try { if (complet.cheie_privata) amprentaPrivata = amprentaCheii(citesteCheiaPrivata(complet.cheie_privata).cheie); } catch { amprentaPrivata = null; }

  const lista = cereri ?? [];
  const ultimaVeste = lista.map((c) => c.ultima_veste_la).filter((x): x is string => !!x).sort().pop() ?? null;
  const stare: StareTbiPanou = {
    gata: tbiGata(rand?.tbi_config ?? null),
    amprentaPublica,
    amprentaPrivata,
    ultimaVeste,
    ultimaCerere: lista[0]?.created_at ?? null,
    cereri30: lista.length,
    aprobate30: lista.filter((c) => c.stare === "aprobata").length,
    respinse30: lista.filter((c) => c.stare === "respinsa").length,
    deschise30: lista.filter((c) => c.stare === "trimisa" || c.stare === "in_analiza" || c.stare === "creata").length,
    ipDeAprobat: (process.env.TBI_PROXY_IP || "").trim() || null,
  };

  /*
   * ⚠ `key` = amprenta a ce e SALVAT: dupa fiecare salvare (`router.refresh()`), formularul porneste din nou din
   * configurarea scrisa de server. Fara ea, cheia publica rescrisa in forma canonica n-ar mai semana cu textul din
   * formular, iar „ai modificari nesalvate" ar ramane aprins dupa o salvare reusita.
   */
  const versiune = createHash("sha1").update(JSON.stringify([initial, amprentaPublica, amprentaPrivata])).digest("hex").slice(0, 12);
  return <TbiConfigClient key={versiune} businessId={business.id} initialConfig={initial} stare={stare} />;
}
