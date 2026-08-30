import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import type { SupabaseClient } from "@supabase/supabase-js";
import { requireAdminApi } from "@/lib/admin-guard";
import { deblocheazaOperatie } from "@/lib/operatii/registru";
import { logError } from "@/lib/error-logger";

/**
 * Operatiile externe atarnate, peste TOATE magazinele.
 *
 * ═══ DE CE EXISTA ═══
 *
 * Panoul din pagina comenzii (`OperatiiAtarnate`) o arata comerciantului — dar
 * numai daca acesta deschide chiar acea comanda. Adica se vede doar daca stii deja
 * unde sa te uiti, ceea ce e exact pe dos fata de ce trebuie: o operatie atarnata
 * inseamna ca un AWB platit sau un document fiscal S-AR PUTEA sa existe la furnizor
 * fara ca noi sa stim.
 *
 * ⚠ Citirea se face cu SERVICE ROLE fiindca `operatii_externe` are RLS pornit FARA
 * nicio politica (tiparul „tare", ca la `rate_limits`): nimeni cu cheia anon sau
 * authenticated nu ajunge la tabel. De aceea `requireAdminApi()` de mai jos e
 * SINGURA paza, si trebuie sa fie prima instructiune.
 */
export async function GET(req: NextRequest) {
  if (!(await requireAdminApi())) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { searchParams } = new URL(req.url);
  const page = Math.max(1, parseInt(searchParams.get("page") ?? "1", 10));
  // Implicit se arata DOAR ce blocheaza. `toate=1` arata si istoricul (reusit,
  // esuat, anulat), pentru diagnostic.
  const toate = searchParams.get("toate") === "1";
  const limit = 50;
  const offset = (page - 1) * limit;

  // `operatii_externe` nu e in tipurile generate (se scrie doar prin RPC), deci
  // clientul se ingusteaza AICI, la un singur apel, in loc sa se stinga verificarea
  // pe tot fisierul.
  const admin = createAdminClient() as unknown as SupabaseClient;
  let query = admin
    .from("operatii_externe")
    .select(
      "id, business_id, order_id, order_number, fel, furnizor, stare, cheie, referinta_externa, incercari, ultima_eroare, creat_la, actualizat_la",
      { count: "exact" },
    )
    .order("creat_la", { ascending: false })
    .range(offset, offset + limit - 1);

  if (!toate) query = query.in("stare", ["in_curs", "necunoscut"]);

  const { data, error, count } = await query;

  /*
   * `error` intors ca 503, nu inghitit.
   *
   * O citire picata ar da lista goala, iar lista goala inseamna „nu e nimic
   * atarnat" — adica exact raspunsul linistitor la momentul cel mai prost. Aceeasi
   * greseala care a tinut sitemapul gol doua saptamani.
   */
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 503 });
  }

  return NextResponse.json({ operatii: data ?? [], total: count ?? 0, page, limit });
}

/**
 * Deblocheaza o operatie atarnata, de ORICE fel.
 *
 * ⚠ FARA RUTA ASTA, JUMATATE DIN OPERATII ERAU DE NEDEBLOCAT.
 *
 * Supapa comerciantului (`OperatiiAtarnate` -> `operatiiAtarnate`) filtreaza pe
 * `order_id`, deci nu poate ajunge NICIODATA la randurile care n-au comanda:
 * facturarea de platforma (abonamente, domenii) si ridicarile de la curier. Un
 * singur timeout acolo bloca cheia definitiv, iar santinela ar fi tipat la fiecare
 * doua ore fara ca cineva sa poata face ceva.
 *
 * Aici se poate ajunge la orice rand, fiindca administratorul platformei e singurul
 * care le vede pe toate. Motivul e OBLIGATORIU si se scrie in jurnal: deblocarea nu
 * repara nimic, transfera o decizie — cineva spune ca a verificat la furnizor.
 */
export async function POST(req: NextRequest) {
  if (!(await requireAdminApi())) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { id, motiv } = (await req.json()) as { id?: string; motiv?: string };
  const explicatie = (motiv ?? "").trim().slice(0, 300);
  if (!id) return NextResponse.json({ error: "Lipseste id-ul operatiei" }, { status: 400 });
  if (explicatie.length < 3) {
    return NextResponse.json({ error: "Scrie pe scurt ce ai verificat la furnizor." }, { status: 400 });
  }

  const admin = createAdminClient();
  const netipat = admin as unknown as SupabaseClient;

  // Se citeste INAINTE, cat randul mai e cel vechi: dupa deblocare, `business_id` si
  // cheia sunt tot ce leaga urma din jurnal de ce s-a intamplat.
  const { data: inainte } = await netipat
    .from("operatii_externe")
    .select("business_id, order_id, order_number, fel, furnizor, cheie, stare, referinta_externa")
    .eq("id", id)
    .maybeSingle();

  if (!inainte) return NextResponse.json({ error: "Operatia nu a fost gasita" }, { status: 404 });

  const ctx = inainte as {
    business_id: string | null; order_id: string | null; order_number: string | null;
    fel: string; furnizor: string; cheie: string; stare: string; referinta_externa: string | null;
  };

  const r = await deblocheazaOperatie(admin, ctx.business_id, id, explicatie);
  if (!r.ok) return NextResponse.json({ error: r.mesaj }, { status: 503 });

  await logError({
    action: "operatie_externa.deblocata_de_admin",
    message: r.stabilizata
      ? `Deblocare ceruta din /admin pe o operatie care se incheiase deja singura (${ctx.fel} ${ctx.furnizor}). Nu s-a schimbat nimic. Motiv: ${explicatie}`
      : `Administratorul a deblocat ${ctx.fel} ${ctx.furnizor}${ctx.order_number ? ` pe comanda ${ctx.order_number}` : " (operatie de platforma)"}: ${explicatie}`,
    details: {
      operatieId: id, orderId: ctx.order_id, orderNumber: ctx.order_number,
      fel: ctx.fel, furnizor: ctx.furnizor, cheie: ctx.cheie,
      stareInainte: ctx.stare, referintaExterna: ctx.referinta_externa,
      stabilizata: r.stabilizata,
    },
    businessId: ctx.business_id ?? undefined,
    severity: "warning",
  });

  return NextResponse.json({ ok: true, stabilizata: r.stabilizata });
}
