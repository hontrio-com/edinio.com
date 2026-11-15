import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { rateLimit, clientIp } from "@/lib/utils/rate-limit";
import { consumaLimita } from "@/lib/utils/limita-durabila";
import { pornesteCerereaTbi } from "@/lib/tbi/server";

/**
 * Porneste plata in rate prin tbi bank: trimite cererea de finantare si intoarce adresa paginii
 * tbi, catre care formularul trimite clientul. Comanda e deja scrisa (neplatita) de formular.
 *
 * Raspunsul are aceeasi forma ca la ceilalti procesatori (`{ redirectUrl }` sau `{ error }`),
 * deci checkoutul il trateaza la fel. Regulile stau in `lib/tbi/server.ts`.
 *
 * ⚠ tbi NU intoarce clientul la noi: nu exista adresa de intoarcere in API-ul lor. Ce se intampla
 * dupa aflam numai din vestile trimise la `back_ref` (`/api/tbi/notificare/<jeton>`).
 */

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function POST(request: NextRequest) {
  /* Aceeasi galeata pe IP ca la ceilalti procesatori: ruta e publica, fara sesiune. */
  if (!rateLimit(`pay-start:${clientIp(request)}`, 10, 60_000)) {
    return NextResponse.json(
      { error: "Prea multe incercari de plata. Te rugam asteapta un minut si incearca din nou." },
      { status: 429 },
    );
  }

  let corp: { orderId?: unknown; businessId?: unknown };
  try {
    corp = (await request.json()) as typeof corp;
  } catch {
    return NextResponse.json({ error: "Cerere invalida." }, { status: 400 });
  }
  const orderId = typeof corp.orderId === "string" ? corp.orderId : "";
  const businessId = typeof corp.businessId === "string" ? corp.businessId : "";
  if (!UUID.test(orderId) || !UUID.test(businessId)) {
    return NextResponse.json({ error: "Cerere invalida." }, { status: 400 });
  }

  const admin = createAdminClient();

  /*
   * ⚠ Plafonul DURABIL se consuma abia dupa ce stim ca exista comanda, ca tabela de limite sa nu
   * se umple cu chei inventate. Pe COMANDA, nu pe magazin: altfel un strain ar putea opri plata
   * tuturor cumparatorilor. Zece pe ora, nu cinci ca la carduri: aici o reincercare in jumatatea
   * de ora primeste ACEEASI cerere (vezi `pornesteCerereaTbi`), deci nu costa nimic la banca.
   */
  const { data: exista, error: eExista } = await admin
    .from("orders").select("id").eq("id", orderId).eq("business_id", businessId).maybeSingle();
  if (eExista) {
    return NextResponse.json({ error: "Nu am putut pregati cererea de finantare. Reincearca peste cateva momente." }, { status: 503 });
  }
  if (!exista) return NextResponse.json({ error: "Comanda nu a fost gasita." }, { status: 404 });
  if (!(await consumaLimita(`pay-start:${orderId}`, 10, 3600)).permis) {
    return NextResponse.json(
      { error: "Ai incercat de prea multe ori sa pornesti plata pentru aceasta comanda. Incearca din nou peste o ora sau scrie magazinului." },
      { status: 429 },
    );
  }

  const r = await pornesteCerereaTbi(admin, { orderId, businessId });
  if (r.ok) return NextResponse.json({ redirectUrl: r.adresa });
  return NextResponse.json({ error: r.mesaj }, { status: r.status });
}
