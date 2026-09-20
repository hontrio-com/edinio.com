import { NextResponse, type NextRequest } from "next/server";
import { headers } from "next/headers";
import { clientIpFromHeaders } from "@/lib/utils/rate-limit";
import { seMasoaraVizita } from "@/lib/storefront/vizita-de-masurat";
import { esteProprietarulMagazinului } from "@/lib/analitice/proprietar";
import { scrieEvenimentAnalitic } from "@/lib/analitice/scrie";
import { createAdminClient } from "@/lib/supabase/admin";

/*
  ═══════════════════════════════════════════════════════════════════════════
  SINGURUL EVENIMENT DE PALNIE CARE NU SE POATE SCRIE DE PE SERVER
  ═══════════════════════════════════════════════════════════════════════════

  Vizita, vederea produsului si inceputul de checkout se scriu la randare, iar
  cumpararea la plasarea comenzii. „Adaugat in cos" se intampla insa numai in
  browser: cosul e stare de client, si nicio pagina nu se randeaza atunci.

  ⚠ CE NU SE PRIMESTE DE AICI. Numai `add_to_cart`. `purchase` scris din browser
  ar fi insemnat ca oricine isi poate desena rata de conversie pe care o vrea,
  iar `visit` ar fi ocolit regula care tine proprietarul si santinela afara.

  ⚠ Aceleasi trei excluderi ca la vizite (proprietar, gazda de test, santinela)
  si acelasi limitator pe adresa IP, din `scrieEvenimentAnalitic`: scrierea asta
  e publica, iar `site_analytics` e deja a cincea tabela ca marime.
*/

export async function POST(req: NextRequest) {
  let corp: { businessId?: unknown; fel?: unknown; productId?: unknown; path?: unknown };
  try {
    corp = await req.json();
  } catch {
    return NextResponse.json({ error: "corp nevalid" }, { status: 400 });
  }

  const businessId = typeof corp.businessId === "string" ? corp.businessId : "";
  if (!/^[0-9a-f-]{36}$/i.test(businessId)) {
    return NextResponse.json({ error: "magazin nevalid" }, { status: 400 });
  }
  if (corp.fel !== "add_to_cart") {
    return NextResponse.json({ error: "eveniment neacceptat" }, { status: 400 });
  }

  const anteturi = await headers();
  const ua = anteturi.get("user-agent");

  /* Magazinul trebuie sa existe; altfel oricine ar putea umple tabela cu
     id-uri inventate, iar cheia straina ar respinge randul abia la scriere. */
  const { data: magazin } = await createAdminClient()
    .from("businesses")
    .select("id, user_id")
    .eq("id", businessId)
    .maybeSingle();
  if (!magazin) return NextResponse.json({ error: "magazin necunoscut" }, { status: 404 });

  if (!seMasoaraVizita({
    esteProprietar: await esteProprietarulMagazinului(magazin.user_id),
    host: anteturi.get("host")?.split(":")[0] ?? "",
    userAgent: ua,
  })) {
    /* Nu e o eroare: pur si simplu nu se masoara. Browserul n-are ce face cu asta. */
    return NextResponse.json({ ok: true, masurat: false });
  }

  await scrieEvenimentAnalitic({
    businessId,
    fel: "add_to_cart",
    ip: clientIpFromHeaders(anteturi),
    userAgent: ua,
    device: /mobile/i.test(ua ?? "") ? "mobile" : /tablet/i.test(ua ?? "") ? "tablet" : "desktop",
    path: typeof corp.path === "string" ? corp.path.slice(0, 200) : null,
    productId: typeof corp.productId === "string" && /^[0-9a-f-]{36}$/i.test(corp.productId)
      ? corp.productId
      : null,
  });

  return NextResponse.json({ ok: true, masurat: true });
}
