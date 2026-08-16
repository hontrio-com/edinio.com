import { redirect } from "next/navigation";
import { mascheazaConfig } from "@/lib/integrari/secrete";
import { getCachedUser, getCachedBusinessWithSettings } from "@/lib/supabase/cached-queries";
import { SmartshipConfigClient } from "@/components/dashboard/SmartshipConfigClient";
import { IntegrationHeader } from "@/components/dashboard/IntegrationHeader";
import type { SmartshipConfig } from "@/lib/smartship/client";

export default async function SmartshipPage() {
  const user = await getCachedUser();
  if (!user) redirect("/login");

  const { business, settings } = await getCachedBusinessWithSettings(user.id);
  if (!business) redirect("/dashboard");

  /*
   * ⚠ `mascheazaConfig` inlocuieste cheia de API cu un substituent inainte sa
   * ajunga in browser. Restul configurarii pleaca intreaga, si asa trebuie:
   * IBAN-ul si adresa de ridicare nu sunt credentiale, iar comerciantul trebuie
   * sa le poata reciti ca sa le verifice.
   */
  const config = (mascheazaConfig("smartship_config", settings?.smartship_config) as SmartshipConfig | null) ?? null;

  /*
   * Curierii pe care magazinul ii are deja pornit pe cont propriu. Servesc doar
   * avertismentului de suprapunere: acelasi curier poate ajunge in checkout si
   * direct, si prin Innoship, si prin Packeta, si prin SmartShip.
   */
  const activ = (c: unknown, ...campuri: string[]) => {
    const o = (c ?? {}) as Record<string, unknown>;
    return !!o.enabled && campuri.every((k) => !!String(o[k] ?? "").trim());
  };
  const activiDirect = [
    activ(settings?.cargus_config, "username", "subscription_key") ? "cargus" : "",
    activ(settings?.dpd_config, "username", "client_id") ? "dpd" : "",
    activ(settings?.fan_courier_config, "username", "client_id") ? "fan-courier" : "",
    activ(settings?.sameday_config, "username") ? "sameday" : "",
    activ(settings?.gls_config, "username", "client_number") ? "gls" : "",
    activ(settings?.posta_config, "username", "cod_trimitere") ? "posta" : "",
    /* FedEx e integrare directa din 16.08.2026, iar SmartShip il revinde
       (`courier_id: 19`) — deci se poate suprapune, ca oricare dintre ceilalti sase. */
    activ(settings?.fedex_config, "client_id", "client_secret", "account_number") ? "fedex" : "",
    /* ⚠ La fel si UPS, din 16.08.2026. Randul din `DUPA_NUME` (smartship/suprapunere.ts)
       nu face nimic singur: lista de aici e cea care alimenteaza `suprapuneri()`, iar
       fara „ups" in ea avertismentul de suprapunere n-ar fi aparut NICIODATA. */
    activ(settings?.ups_config, "client_id", "client_secret", "account_number") ? "ups" : "",
  ].filter(Boolean);

  return (
    <div className="p-6 max-w-2xl">
      <IntegrationHeader
        id="smartship"
        description="Colete prin SmartShip.ro: un cont, mai multi curieri (Cargus, SameDay, DPD, FedEx, PTT Express) si un tarif negociat de ei. Poti emite si pe contractele tale de curierat, daca le ai legate acolo."
      />
      <SmartshipConfigClient businessId={business.id} initialConfig={config} activiDirect={activiDirect} />
    </div>
  );
}
