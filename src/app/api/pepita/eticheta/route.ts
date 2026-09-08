import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { rateLimit } from "@/lib/utils/rate-limit";
import { areEticheta, linkEticheta } from "@/lib/pepita/eticheta";
import { logError } from "@/lib/error-logger";

export const runtime = "nodejs";

/**
 * Eticheta de colet trimisa de Pepita, servita comerciantului care are comanda.
 *
 * ═══ ⚠ DE CE EXISTA RUTA ASTA ═══
 *
 * La Pepita Delivery coletul e dus de GLS-ul contractat de EI. Tocmai de aceea am inchis emiterea
 * de AWB propriu pe comenzile lor: ar fi a doua eticheta pe acelasi pachet. Dar atunci
 * comerciantul ramanea cu un colet pe care nu-l poate expedia si cu un buton care il refuza.
 * Eticheta LOR vine chiar in comanda (`package_label`), si asta e capatul celalalt al aceleiasi
 * hotarari.
 *
 * ═══ ⚠ PATRU PORTI, IN ORDINEA ASTA ═══
 *
 *   1. FORMA parametrilor, fara sa atinga baza.
 *   2. SESIUNE.
 *   3. PROPRIETATEA magazinului.
 *   4. Comanda sa fie CHIAR una venita de la Pepita, in magazinul acela.
 *
 * ⚠ A PATRA NU SE COPIAZA DE LA `/api/customization-file`. Acolo poarta e „cheia sa fie in
 * `orders.items`", si e buna acolo. Aici ar fi gresita: pe comenzile de marketplace adaugarea de
 * linii din panou e permisa, deci autorizatia ar atarna de un `jsonb` care se rescrie sub noi.
 * Legatura adevarata e randul din `pepita_comenzi`, care nu se schimba.
 *
 * ⚠ SI RASPUNSUL E O REDIRECTARE CATRE UN LINK SEMNAT DE 60 DE SECUNDE, nu octetii.
 * Servite prin functie, octetii ar trece prin plafonul de 4,5 MB al platformei — pe RASPUNS, nu
 * doar pe cerere. Iar raspunsul care poarta linkul e el insusi `no-store`: cache-uit undeva pe
 * drum, ar fi servit altcuiva cat timp linkul mai e valabil.
 */

/** Cate etichete pe minut, pe UTILIZATOR. Nu pe IP: un birou cu NAT comun ar fi taiat intreg. */
const PLAFON_PE_MINUT = 60;

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function refuz(status: number, mesaj: string): NextResponse {
  return NextResponse.json({ error: mesaj }, {
    status,
    headers: { "cache-control": "private, no-store" },
  });
}

export async function GET(req: NextRequest) {
  const businessId = req.nextUrl.searchParams.get("business") ?? "";
  const orderId = req.nextUrl.searchParams.get("comanda") ?? "";

  /* ⚠ Poarta 1, fara baza: o forma gresita nu merita nicio interogare. */
  if (!UUID.test(businessId) || !UUID.test(orderId)) return refuz(400, "Cerere nevalidă.");

  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return refuz(401, "Neautentificat.");

  if (!rateLimit(`pepita-eticheta:${user.id}`, PLAFON_PE_MINUT, 60_000)) {
    return refuz(429, "Prea multe cereri. Încearcă din nou peste un minut.");
  }

  /*
   * ⚠ Poarta 3, cu clientul OMULUI, nu cu cel de sistem: aici chiar vrem ca RLS sa lucreze pentru
   * noi. `user_id` se cere oricum explicit, ca poarta sa nu atarne doar de politici.
   */
  const { data: biz, error: eBiz } = await supabase
    .from("businesses").select("id").eq("id", businessId).eq("user_id", user.id).maybeSingle();
  if (eBiz) return refuz(503, "Nu s-a putut verifica magazinul. Încearcă din nou.");
  if (!biz) return refuz(404, "Comandă negăsită.");

  /*
   * ⚠ Poarta 4, cu clientul de SISTEM: `pepita_comenzi` n-are politica de citire pentru nimeni,
   * dinadins. Proprietatea tocmai s-a dovedit mai sus, iar filtrul pe magazin se scrie oricum aici
   * din nou — citind cu cheia de serviciu, el e singura izolare intre chiriasi.
   */
  const admin = createAdminClient();
  const { data: rand, error: eRand } = await admin
    .from("pepita_comenzi").select("id")
    .eq("business_id", businessId).eq("order_id", orderId).maybeSingle();
  if (eRand) return refuz(503, "Nu s-a putut verifica comanda. Încearcă din nou.");
  if (!rand) return refuz(404, "Comandă negăsită.");

  /*
   * ⚠ „NU E ACOLO" NU E ACELASI LUCRU CU „DEPOZITUL A CAZUT".
   *
   * Un 404 pe o pana de depozit l-ar face pe comerciant sa creada ca eticheta s-a pierdut si sa
   * ceara alta din panoul Pepita. Raspunsul cinstit la o pana e 503.
   */
  let exista: boolean;
  try {
    exista = await areEticheta(businessId, orderId);
  } catch (e) {
    await logError({
      action: "pepita/eticheta-servire",
      message: `depozitul n-a raspuns: ${e instanceof Error ? e.message : String(e)}`,
      details: { orderId }, businessId, severity: "error",
    });
    return refuz(503, "Depozitul de fișiere nu răspunde acum. Încearcă din nou.");
  }
  if (!exista) {
    return refuz(404, "Pepita nu a trimis etichetă pentru această comandă. Cere-o din panoul lor.");
  }

  const numar = req.nextUrl.searchParams.get("numar") ?? orderId.slice(0, 8);
  const link = await linkEticheta(businessId, orderId, numar);

  /* ⚠ `no-store` pe REDIRECTARE: raspunsul asta poarta un link semnat, valabil un minut. */
  return NextResponse.redirect(link, {
    status: 302,
    headers: { "cache-control": "private, no-store" },
  });
}
