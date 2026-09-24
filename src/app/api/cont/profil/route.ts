import { NextRequest, NextResponse } from "next/server";
import { magazinulCereriiDeCont, magazinulEOprit } from "@/lib/cont/magazinul-cererii";
import { sesiuneCurenta } from "@/lib/cont/sesiune";
import { sesiuneExpirata, vineDePeMagazin } from "@/lib/cont/cerere";
import { curataProfilul, greseliProfil } from "@/lib/cont/profil-reguli";
import { createAdminClient } from "@/lib/supabase/admin";
import { logError } from "@/lib/error-logger";

/**
 * Salveaza profilul: numele, telefonul si adresa de livrare.
 *
 * ⚠ Aceleasi reguli ca formularul (`greseliProfil`), iar baza le mai verifica o
 * data (`cont_profil_salveaza`). Greselile se intorc pe camp, ca ecranul sa le
 * puna langa campul lor.
 */
export async function POST(req: NextRequest) {
  if (!vineDePeMagazin(req)) return new NextResponse("Forbidden", { status: 403 });

  const magazin = await magazinulCereriiDeCont(req.headers.get("host")).catch(() => null);
  if (!magazin) return new NextResponse("Not found", { status: 404 });
  if (await magazinulEOprit(magazin)) return new NextResponse("Not found", { status: 404 });

  const s = await sesiuneCurenta(magazin.id).catch(() => null);
  if (!s) return sesiuneExpirata();

  const p = curataProfilul(await req.json().catch(() => null));
  const greseli = greseliProfil(p);
  if (Object.keys(greseli).length > 0) {
    return NextResponse.json({ eroare: "Verifica campurile marcate.", greseli }, { status: 400 });
  }

  const { data, error } = await createAdminClient().rpc("cont_profil_salveaza", {
    p_business: magazin.id,
    p_cont: s.contId,
    p_nume: p.nume,
    p_telefon: p.telefon || null,
    p_judet: p.judet || null,
    p_localitate: p.localitate || null,
    p_adresa: p.adresa || null,
    p_cod_postal: p.codPostal || null,
  });
  if (error || data !== "salvat") {
    if (data === "negasit") return sesiuneExpirata();
    if (data === "nume-lipsa") return NextResponse.json({ eroare: "Verifica campurile marcate.", greseli: { nume: "Scrie numele tau." } }, { status: 400 });
    if (data === "telefon-nevalid") return NextResponse.json({ eroare: "Verifica campurile marcate.", greseli: { telefon: "Numarul de telefon nu pare corect." } }, { status: 400 });
    await logError({
      action: "cont/profil",
      message: `salvarea profilului a esuat: ${error?.message ?? String(data)}`,
      businessId: magazin.id,
      severity: "error",
    });
    return NextResponse.json({ eroare: "Nu am putut salva. Incearca din nou." }, { status: 500 });
  }
  return NextResponse.json({ ok: true }, { status: 200 });
}
