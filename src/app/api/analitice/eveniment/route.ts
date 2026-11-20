import { NextResponse, type NextRequest } from "next/server";
import { headers } from "next/headers";
import { clientIpFromHeaders } from "@/lib/utils/rate-limit";
import { eCerereDeActiune, seMasoaraVizita } from "@/lib/storefront/vizita-de-masurat";
import { esteProprietarulMagazinului } from "@/lib/analitice/proprietar";
import { scrieEvenimentAnalitic } from "@/lib/analitice/scrie";
import { FELURI_DIN_BROWSER, type FelDinBrowser } from "@/lib/analitice/semnal";
import { createAdminClient } from "@/lib/supabase/admin";

/*
  ═══════════════════════════════════════════════════════════════════════════
  EVENIMENTELE DE PALNIE CARE NU SE POT SCRIE DE PE SERVER
  ═══════════════════════════════════════════════════════════════════════════

  Vizita si vederea produsului se scriu la randare, iar cumpararea la plasarea
  comenzii. „Adaugat in cos" se intampla insa numai in browser: cosul e stare de
  client, si nicio pagina nu se randeaza atunci. La fel „a inceput comanda" pe
  magazinele cu formularul in FEREASTRA (20.11.2026): pe cele cu pagina de comanda
  il scrie serverul la randarea ei, pe celelalte nu se randeaza nimic, deci
  „Checkout-uri incepute" statea pe 0.

  ⚠ CE NU SE PRIMESTE DE AICI. Numai felurile din `FELURI_DIN_BROWSER` (lista sta
  langa cel care le trimite, `semnal.ts`). `purchase` scris din browser ar fi
  insemnat ca oricine isi poate desena rata de conversie pe care o vrea, iar
  `visit` ar fi ocolit regula care tine proprietarul si santinela afara.

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
  if (!(FELURI_DIN_BROWSER as readonly unknown[]).includes(corp.fel)) {
    return NextResponse.json({ error: "eveniment neacceptat" }, { status: 400 });
  }
  const fel = corp.fel as FelDinBrowser;

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
    // O cerere a browserului catre ruta, niciodata o actiune de server.
    dinActiune: eCerereDeActiune(anteturi),
  })) {
    /* Nu e o eroare: pur si simplu nu se masoara. Browserul n-are ce face cu asta. */
    return NextResponse.json({ ok: true, masurat: false });
  }

  await scrieEvenimentAnalitic({
    businessId,
    fel,
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
