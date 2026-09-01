"use server";

import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { logError } from "@/lib/error-logger";
import {
  deblocheazaOperatie, operatiiAtarnate, refuzuriPeComanda,
  type OperatieAtarnata, type RefuzOperatie,
} from "@/lib/operatii/registru";

/*
 * ⚠ Fisier "use server": FIECARE export de aici e un endpoint HTTP apelabil cu
 * orice argumente, printr-un POST direct (manifestul global de actiuni). De aceea
 * ambele functii isi verifica ele insele omul si magazinul, si niciuna nu se
 * bazeaza pe faptul ca apelantul a facut-o.
 */

async function detineMagazinul(businessId: string): Promise<boolean> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return false;
  const { data } = await supabase
    .from("businesses").select("id").eq("id", businessId).eq("user_id", user.id).maybeSingle();
  return !!data;
}

/** Ce a ramas atarnat pe o comanda. Lista goala e cazul normal si nu se afiseaza. */
export async function operatiiAtarnateAction(
  businessId: string,
  orderId: string,
): Promise<OperatieAtarnata[]> {
  if (!(await detineMagazinul(businessId))) return [];
  return operatiiAtarnate(createAdminClient(), businessId, orderId);
}

/**
 * Refuzurile dovedite ale furnizorilor pe comanda asta.
 *
 * ⚠ NU E ACELASI LUCRU CU `operatiiAtarnateAction`, si nu se cuvine unite. Aia
 * arata operatii care POATE au reusit la furnizor si de aceea blocheaza butonul.
 * Asta arata refuzuri despre care se stie sigur ca n-au facut nimic: nu blocheaza
 * nimic, nu cer nicio hotarare, doar trebuie vazute.
 *
 * Fara ea, un refuz traia doar in toastul de la apasare — si pe calea automata
 * nici atat. Vezi `refuzuriPeComanda`.
 */
export async function refuzuriPeComandaAction(
  businessId: string,
  orderId: string,
): Promise<RefuzOperatie[]> {
  if (!(await detineMagazinul(businessId))) return [];
  return refuzuriPeComanda(createAdminClient(), businessId, orderId);
}

/**
 * „Am verificat la furnizor, operatia nu exista acolo. Da-mi voie sa reincerc."
 *
 * ═══ DE CE EXISTA BUTONUL ASTA ═══
 *
 * O operatie ramasa `in_curs` sau `necunoscut` NU expira singura, si asta e
 * deliberat: daca procesul a murit intre apel si scriere, furnizorul cel mai
 * probabil A FACUT operatia, iar o expirare automata ar reface-o — adica exact
 * duplicatul pe care il inchidem.
 *
 * Deci deblocarea nu poate veni decat de la un OM care s-a uitat in contul
 * furnizorului. Butonul nu „repara" nimic, transfera o decizie: comerciantul spune
 * ce a vazut acolo, si de aceea motivul lui se scrie in jurnalul de audit.
 *
 * Un registru care poate bloca fara sa poata debloca ar fi mai rau decat lipsa lui.
 */
export async function deblocheazaOperatieAction(
  businessId: string,
  operatieId: string,
  motiv: string,
): Promise<{ ok: true; stabilizata: boolean } | { ok: false; mesaj: string }> {
  if (!(await detineMagazinul(businessId))) {
    return { ok: false, mesaj: "Neautorizat" };
  }

  const explicatie = motiv.trim().slice(0, 300);
  if (explicatie.length < 3) {
    return { ok: false, mesaj: "Scrie pe scurt ce ai verificat la furnizor." };
  }

  const admin = createAdminClient();

  /*
   * Comanda si cheia se citesc INAINTE de deblocare, cat randul mai e cel vechi.
   * Fara ele, urma din jurnal ar spune „cineva a deblocat operatia
   * 7f3a-…" si n-ar raspunde la singura intrebare care conteaza mai tarziu: PE CE
   * COMANDA, si ce anume.
   */
  const netipat = admin as unknown as import("@supabase/supabase-js").SupabaseClient;
  const { data: inainte } = await netipat
    .from("operatii_externe")
    .select("order_id, order_number, fel, furnizor, cheie, referinta_externa")
    .eq("id", operatieId)
    .eq("business_id", businessId)
    .maybeSingle();

  const r = await deblocheazaOperatie(admin, businessId, operatieId, explicatie);
  if (!r.ok) return r;

  /*
   * Urma se scrie DUPA, si numai la reusita: o intrare pentru ceva ce nu s-a
   * intamplat e mai rea decat lipsa ei.
   *
   * `logError`, nu `logAudit`: acela scrie in `admin_audit_log`, cu `admin_id`, si
   * e pentru administratorii PLATFORMEI. Aici decizia e a comerciantului, si
   * trebuie sa iasa in `/admin/logs`, langa celelalte semnale despre operatiile
   * externe. `warning`, nu `error`: e o actiune legitima, dar una despre care vrem
   * sa aflam daca se repeta — o comanda deblocata de trei ori inseamna ca ceva mai
   * adanc e stricat.
   */
  const ctx = (inainte ?? {}) as {
    order_id?: string | null; order_number?: string | null;
    fel?: string; furnizor?: string; cheie?: string; referinta_externa?: string | null;
  };

  await logError({
    action: "operatie_externa.deblocata",
    message: r.stabilizata
      ? `Deblocare ceruta pe o operatie care se incheiase deja singura (${ctx.fel ?? "?"} ${ctx.furnizor ?? "?"}, comanda ${ctx.order_number ?? "?"}). Nu s-a schimbat nimic. Motiv dat: ${explicatie}`
      : `Comerciantul a deblocat ${ctx.fel ?? "o operatie"} ${ctx.furnizor ?? ""} pe comanda ${ctx.order_number ?? "?"}: ${explicatie}`,
    details: {
      operatieId,
      orderId: ctx.order_id ?? null,
      orderNumber: ctx.order_number ?? null,
      fel: ctx.fel ?? null,
      furnizor: ctx.furnizor ?? null,
      cheie: ctx.cheie ?? null,
      referintaExterna: ctx.referinta_externa ?? null,
      stabilizata: r.stabilizata,
    },
    businessId,
    severity: "warning",
  });

  return { ok: true, stabilizata: r.stabilizata };
}
