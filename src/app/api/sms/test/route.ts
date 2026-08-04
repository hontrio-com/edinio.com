import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { sendSms } from "@/lib/smso";
import { rateLimit, clientIp } from "@/lib/utils/rate-limit";
import { consumaLimita, mesajLimita } from "@/lib/utils/limita-durabila";

export async function POST(req: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Neautorizat" }, { status: 401 });

  /*
   * Ruta trimite un SMS REAL catre un numar ales de apelant, folosind o cheie
   * data tot de apelant. E necesar asa: utilizatorul isi testeaza integrarea
   * inainte de a o salva. Dar fara plafon devine o unealta de bombardare cu
   * SMS-uri (pe cheia lui, sau pe una furata) — cateva teste pe ora sunt
   * suficiente pentru scopul real.
   */
  if (!rateLimit(`sms-test:${clientIp(req)}`, 3, 60_000)) {
    return NextResponse.json({ error: "Prea multe incercari." }, { status: 429 });
  }
  const lim = await consumaLimita(`sms-test:${user.id}`, 5, 3600, 3600);
  if (!lim.permis) {
    return NextResponse.json(
      { error: mesajLimita(lim, "Ai trimis deja destule SMS-uri de test. Incearca peste o ora.") },
      { status: 429 },
    );
  }

  const { api_key, sender_id, phone } = await req.json() as {
    api_key?: string;
    sender_id?: string;
    phone?: string;
  };

  if (!api_key?.trim()) return NextResponse.json({ error: "Cheia API lipseste." }, { status: 400 });
  if (!sender_id?.trim()) return NextResponse.json({ error: "Sender ID lipseste." }, { status: 400 });
  if (!phone?.trim()) return NextResponse.json({ error: "Numarul de telefon lipseste." }, { status: 400 });

  const rawPhone = phone.trim();
  const normalizedPhone = rawPhone.startsWith("0")
    ? "+4" + rawPhone
    : rawPhone.startsWith("40")
    ? "+" + rawPhone
    : rawPhone;

  const result = await sendSms(api_key.trim(), {
    to: normalizedPhone,
    sender: sender_id.trim(),
    body: "Test SMS de la Edinio. Integrarea SMSO functioneaza corect!",
    type: "transactional",
    remove_special_chars: true,
  });

  if (!result.success) {
    return NextResponse.json({ error: result.error }, { status: 400 });
  }

  return NextResponse.json({
    success: true,
    responseToken: result.responseToken,
    transaction_cost: result.transaction_cost,
    to: phone.trim(),
  });
}
