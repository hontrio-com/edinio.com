import { redirect } from "next/navigation";
import { mascheazaConfig } from "@/lib/integrari/secrete";
import { getCachedUser, getCachedBusinessWithSettings } from "@/lib/supabase/cached-queries";
import { createAdminClient } from "@/lib/supabase/admin";
import { TheMarketerClient } from "@/components/dashboard/TheMarketerClient";
import { SECRETE_THEMARKETER, type TheMarketerConfig } from "@/lib/themarketer/config";
import { citesteConfig } from "@/lib/themarketer/server";
import { datePanou } from "@/lib/themarketer/panou";
import { STATUSURI_TRIMISE } from "@/lib/themarketer/comanda";
import { PLATFORM_ORIGIN } from "@/lib/seo";

/*
 * Pagina theMarketer. Configurarea pleaca spre browser MASCATA: cheia REST si cheia adreselor goale, cu
 * `_completate`. Adresele de lipit in theMarketer le calculeaza serverul (`datePanou`).
 *
 * ⚠ MASCATA DE DOUA ORI, dinadins (ca la easybill): `mascheazaConfig` stie doar campurile din
 * `CAMPURI_SECRETE`; al doilea strat goleste oricum campurile din `SECRETE_THEMARKETER`.
 *
 * ⚠ Configurarea se citeste cu cheia de serviciu: magazinul e al omului (`getCachedBusinessWithSettings`
 * cauta dupa `user_id`), iar adresele cer cheia adreselor in clar.
 */
function mascata(brut: TheMarketerConfig | null): TheMarketerConfig | null {
  const m = mascheazaConfig("themarketer_config", brut);
  if (!m || !brut) return null;
  const sursa = brut as unknown as Record<string, unknown>;
  const completate: Record<string, boolean> = { ...(m._completate ?? {}) };
  const iesire: Record<string, unknown> = { ...m };
  for (const camp of SECRETE_THEMARKETER) {
    const v = sursa[camp];
    completate[camp] = typeof v === "string" ? v.length > 0 : v != null;
    iesire[camp] = "";
  }
  return { ...iesire, _completate: completate } as unknown as TheMarketerConfig;
}

export default async function TheMarketerPage() {
  const user = await getCachedUser();
  if (!user) redirect("/login");
  const { business } = await getCachedBusinessWithSettings(user.id);
  if (!business) redirect("/dashboard");

  let brut: TheMarketerConfig | null = null;
  let eroareCitire = false;
  try {
    brut = await citesteConfig(business.id);
  } catch {
    eroareCitire = true;
  }
  const [date, { data: biz }] = await Promise.all([
    datePanou(business.id, brut),
    createAdminClient().from("businesses").select("custom_domain").eq("id", business.id).maybeSingle(),
  ]);

  const domeniu = ((biz as { custom_domain?: string | null } | null)?.custom_domain ?? "").trim().toLowerCase();

  return (
    <TheMarketerClient
      businessId={business.id}
      initialConfig={mascata(brut)}
      date={date}
      statusuri={[...STATUSURI_TRIMISE]}
      domeniuPropriu={!!domeniu}
      /*
        ⚠ theMarketer da scriptul NUMAI pe domeniile contului (masurat: 403 in afara lor), deci omul trebuie
        sa stie exact ce domeniu sa treaca acolo. `custom_domain` e pastrat canonic (fara www: proxy-ul muta
        `www.` pe el); fara domeniu propriu, magazinul sta pe gazda platformei.
      */
      gazdaMagazinului={domeniu || new URL(PLATFORM_ORIGIN).host}
      eroareCitire={eroareCitire}
    />
  );
}
