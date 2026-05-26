import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { sendSms } from "@/lib/smso";

export async function POST(req: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Neautorizat" }, { status: 401 });

  const { api_key, sender_id, phone } = await req.json() as {
    api_key?: string;
    sender_id?: string;
    phone?: string;
  };

  if (!api_key?.trim()) return NextResponse.json({ error: "Cheia API lipseste." }, { status: 400 });
  if (!sender_id?.trim()) return NextResponse.json({ error: "Sender ID lipseste." }, { status: 400 });
  if (!phone?.trim()) return NextResponse.json({ error: "Numarul de telefon lipseste." }, { status: 400 });

  const result = await sendSms(api_key.trim(), {
    to: phone.trim(),
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
