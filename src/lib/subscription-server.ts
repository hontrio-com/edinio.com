import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";
import { getInactiveReason } from "@/lib/subscription";
import { CacheScurt } from "@/lib/utils/cache-scurt";

/* ═══════════════════════════════════════════════════════════════════════════
   CONTUL SUSPENDAT, VERIFICAT ACOLO UNDE SE CHELTUIE BANI
   ═══════════════════════════════════════════════════════════════════════════

   ⚠ DE CE NU ERA DE AJUNS BLOCAREA DIN LAYOUT.

   `getInactiveReason` era chemata in exact doua locuri, si amandoua sunt PAGINI:
   layout-ul de dashboard (care redirectioneaza spre /reactivare) si chiar pagina
   /reactivare. O redirectionare de pagina nu atinge insa nici actiunile de
   server, nici rutele /api, iar acolo se emit AWB-uri reale si se descarca
   etichete.

   Deci un magazin cu trialul expirat sau cu abonamentul neplatit nu putea
   deschide dashboard-ul, dar putea in continuare:
     - sa cheme actiunea de emitere dintr-o fila ramasa deschisa;
     - sa refoloseasca adresa etichetei din istoricul browserului.
   Coletele plecau, facturate prin integrarea platformei, pentru un cont care nu
   mai plateste.

   ⚠ SI DE CE AICI, NU IN PROXY. Poarta MFA sta in proxy fiindca isi citeste
   raspunsul din cookie, local, fara nicio cerere. Starea contului nu se poate
   sti fara doua citiri din baza; puse in proxy, ar fi cazut pe FIECARE cerere a
   platformei. Asa cad doar pe drumurile care chiar cheltuie.
*/

/**
 * Motivul pentru care contul magazinului nu mai are voie sa cheltuie, sau `null`.
 *
 * ⚠ CADE DESCHIS, spre deosebire de `poartaAwbPropriu`, care cade inchis.
 * Intrebarea de aici e „mai plateste omul?", iar raspunsul gresit pe partea
 * severa opreste un magazin platitor din a-si expedia comenzile, dintr-o eroare
 * de citire. Intrebarea celeilalte porti e „coletul e deja dus de altcineva?",
 * unde ghicitul gresit costa un al doilea transport. Riscurile nu sunt simetrice,
 * deci nici raspunsurile implicite nu sunt.
 */
/*
 * ⚠ CACHE SCURT, fiindca poarta asta sta pe DRUMUL FIECARUI AWB.
 *
 * Generarea in masa cheama actiunea de emitere o data pe comanda, iar fiecare
 * chemare ar fi facut doua citiri in plus: un lot de o suta de comenzi = doua
 * sute de interogari numai ca sa se afle de o suta de ori acelasi lucru despre
 * acelasi magazin.
 *
 * ⚠ COMPROMISUL, pe fata: raspunsul poate fi vechi de pana la treizeci de
 * secunde. Un magazin tocmai reactivat mai asteapta atat pana poate emite; unul
 * tocmai suspendat mai poate emite atat. Amandoua sunt acceptabile, poarta asta
 * apara o factura, nu un colet, si niciuna nu se apropie de costul a doua sute
 * de interogari pe lot.
 */
const contInactivCache = new CacheScurt<string | null>(30_000, 500);

export async function motivContInactiv(businessId: string): Promise<string | null> {
  const dinCache = contInactivCache.get(businessId);
  if (dinCache !== undefined) return dinCache;

  const admin = createAdminClient();

  const { data: biz, error: eBiz } = await admin
    .from("businesses")
    .select("user_id, suspended_until")
    .eq("id", businessId)
    .maybeSingle();
  if (eBiz || !biz?.user_id) return raspunde(businessId, null);

  const { data: profil, error: eProfil } = await admin
    .from("users_profile")
    .select("plan, plan_expires_at, role")
    .eq("id", biz.user_id)
    .maybeSingle();
  if (eProfil || !profil) return raspunde(businessId, null);

  /*
   * Adminii platformei sunt exceptati, ca in layout-ul de dashboard.
   *
   * ⚠ SI AICI E O SINGURA SURSA DE ROL, spre deosebire de restul platformei.
   * `layout.tsx:66`, `reactivare/page.tsx:29` si `admin-guard.ts:40` cer DOUA surse
   * (`esteAdminConfirmat`: claim-ul din JWT SI coloana), tocmai fiindca pana la migratia
   * din 04.08.2026 orice utilizator logat isi putea scrie `role='admin'` cu cheia anon.
   *
   * ⚠ DE CE A RAMAS ASA, HOTARARE DIN 13.09.2026, cu faptele masurate atunci:
   *   - gaura e inchisa azi de DOUA straturi din baza: `authenticated` n-are UPDATE pe
   *     coloana `role`, iar declansatorul `blocheaza_escaladare_users_profile` ridica
   *     42501 la orice schimbare de rol facuta de `anon` sau `authenticated`;
   *   - `motivContInactiv` primeste doar `businessId`, deci a doua sursa ar cere purtarea
   *     utilizatorului prin `poarta-awb.ts`, `poarta-eticheta.ts` si opt rute de eticheta;
   *   - iar exceptarea NU e teoretica: in productie exista un singur utilizator admin, cu
   *     un singur magazin, si planul lui e expirat. Scoasa, i s-ar opri pe loc emiterea.
   *
   * Deci nu se „repara" orbeste intr-un sens sau altul: ori se duce utilizatorul pana
   * aici si se cheama `esteAdminConfirmat`, ori se lasa asa, in cunostinta de cauza.
   */
  if (profil.role === "admin") return raspunde(businessId, null);

  const motiv = getInactiveReason({
    plan: profil.plan ?? "free",
    planExpiresAt: profil.plan_expires_at ?? null,
    suspendedUntils: [biz.suspended_until],
  });
  if (!motiv) return raspunde(businessId, null);

  return raspunde(businessId, motiv === "trial"
    ? "Perioada de probă a expirat, deci nu se mai pot emite expedieri. Reactivează abonamentul din Setări > Abonament."
    : "Abonamentul nu este activ, deci nu se mai pot emite expedieri. Reactivează-l din Setări > Abonament.");
}

/** Pastreaza raspunsul si il intoarce, ca fiecare iesire sa treaca prin cache. */
function raspunde(businessId: string, motiv: string | null): string | null {
  contInactivCache.set(businessId, motiv);
  return motiv;
}

/** Pentru probe si pentru reactivare imediata: uita ce s-a pastrat. */
export function uitaStareaContului(businessId?: string): void {
  if (businessId) contInactivCache.sterge(businessId);
  else contInactivCache.goleste();
}
