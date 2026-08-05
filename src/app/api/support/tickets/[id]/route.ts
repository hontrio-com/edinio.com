import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getCachedUser } from "@/lib/supabase/cached-queries";
import { logError } from "@/lib/error-logger";

/*
 * Valorile acceptate de constrangerea CHECK din baza. Se verifica AICI, nu doar
 * acolo, din doua motive:
 *
 *  1. calea de eroare scrie acum in `error_logs` cu clientul de SISTEM (vezi mai
 *     jos). Ruta nu are niciun plafon, iar clientul o cheama de la sine la
 *     montare si la fiecare raspuns de agent, deci un plafon strans ar rupe
 *     fluxul normal. Fara validare, orice cont putea bucla `PATCH {status:"x"}`
 *     — sau un `id` care nu e UUID, sau `has_unread_reply:"da"` — si scrie randuri
 *     la nesfarsit in jurnalul platformei, cu text ales de el (Postgres pune
 *     valoarea primita in `invalid input syntax for type uuid: "..."`). Adica
 *     exact ce repara constatarea 13, redeschis pe alta usa.
 *  2. o intrare invalida e o greseala a APELANTULUI: 400 spune adevarul, 500 nu.
 *
 * Dupa filtrele astea singurele erori ramase sunt ale noastre (retea, RLS), deci
 * jurnalul nu mai poate fi umplut din exterior.
 */
const STATUSURI = new Set(["open", "in_progress", "resolved", "closed"]);
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const user = await getCachedUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  if (!UUID_RE.test(id)) return NextResponse.json({ error: "Tichet negasit" }, { status: 404 });

  // Corp ilizibil = nimic de actualizat, nu o exceptie nedusa pana la capat.
  const body = await req.json().catch(() => ({})) as { status?: unknown; has_unread_reply?: unknown };

  const actualizare: { status?: string; has_unread_reply?: boolean } = {};
  if (body.status !== undefined) {
    if (typeof body.status !== "string" || !STATUSURI.has(body.status)) {
      return NextResponse.json({ error: "Status invalid." }, { status: 400 });
    }
    actualizare.status = body.status;
  }
  if (body.has_unread_reply !== undefined) {
    if (typeof body.has_unread_reply !== "boolean") {
      return NextResponse.json({ error: "Valoare invalida pentru has_unread_reply." }, { status: 400 });
    }
    actualizare.has_unread_reply = body.has_unread_reply;
  }
  if (Object.keys(actualizare).length === 0) {
    return NextResponse.json({ error: "Nimic de actualizat." }, { status: 400 });
  }

  const supabase = await createClient();

  const { error } = await supabase
    .from("support_tickets")
    .update(actualizare)
    .eq("id", id)
    .eq("user_id", user.id);

  // `error.message` intorcea inapoi numele tabelului, al coloanei si al
  // constrangerii, venite direct de la Postgres. Mesaj fix catre client, detaliul
  // in jurnal — cum face restul aplicatiei. Aici ajung acum doar erorile NOASTRE:
  // ce se putea provoca din corpul cererii a fost oprit mai sus.
  if (error) {
    await logError({
      action: "support.patchTicket",
      message: error.message,
      details: { code: error.code, ticketId: id },
      userId: user.id,
    });
    return NextResponse.json({ error: "Eroare la salvare. Incearca din nou." }, { status: 500 });
  }

  return NextResponse.json({ success: true });
}
