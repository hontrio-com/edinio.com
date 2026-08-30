"use server";

import { randomBytes } from "node:crypto";
import { headers } from "next/headers";
import { revalidatePath } from "next/cache";
import type { SupabaseClient } from "@supabase/supabase-js";
import { createAdminClient } from "@/lib/supabase/admin";
import { requireAdminApi } from "@/lib/admin-guard";
import { sendBlogSubscribeConfirmation } from "@/lib/email";
import { logError } from "@/lib/error-logger";
import { clientIpFromHeaders, rateLimit } from "@/lib/utils/rate-limit";
import { PLATFORM_ORIGIN } from "@/lib/seo";

/**
 * Abonarea la noutățile blogului.
 *
 * ⚠ CU CONFIRMARE, NU FĂRĂ. Fără ea, oricine poate scrie adresa altcuiva în
 * casetă, iar acela începe să primească emailuri pe care nu le-a cerut. E și
 * greșit, și ilegal: consimțământul trebuie să fie al persoanei și trebuie să se
 * poată dovedi. Rândurile fără `confirmed_at` NU sunt abonați și nu primesc
 * nimic.
 *
 * ⚠ NICIO REGULĂ DE `anon` PE TABELĂ. Tot ce e aici trece prin cheia de
 * serviciu, ca să se poată număra cererile. O regulă de INSERT pentru anon ar fi
 * fost o adresă deschisă de umplut, și mai rău, ar fi îngăduit încercarea
 * jetoanelor de confirmare la nesfârșit.
 */
function db(): SupabaseClient {
  return createAdminClient() as unknown as SupabaseClient;
}

export type RaspunsAbonare = { ok: true; mesaj: string } | { ok: false; eroare: string };

/**
 * E o adresă de email care are cum să existe?
 *
 * Verificarea e deliberat simplă. Una „completă" după RFC respinge adrese
 * valide și tot nu spune dacă cutia există; singura dovadă adevărată e emailul
 * de confirmare, care oricum se trimite.
 */
function emailPlauzibil(e: string): boolean {
  if (e.length < 6 || e.length > 254) return false;
  const p = e.split("@");
  return p.length === 2 && p[0].length > 0 && p[1].includes(".") && !/\s/.test(e);
}

export async function aboneazaLaBlog(emailBrut: string): Promise<RaspunsAbonare> {
  /*
    Plafonul e ÎNAINTE de orice altceva. Acțiunea trimite un email către o adresă
    aleasă de cel care apasă, deci fără limită oricine ne poate folosi domeniul
    ca să trimită mesaje nepoftite. Costul nu e în bani, e în livrabilitate:
    domeniul nostru ajunge în lista neagră, și atunci nu mai ajung nici emailurile
    de comandă ale comercianților.
  */
  const ip = clientIpFromHeaders(await headers());
  if (!rateLimit(`blogSubscribe:${ip}`, 3, 60_000)) {
    return { ok: false, eroare: "Ai încercat de câteva ori. Așteaptă un minut." };
  }

  const email = emailBrut.trim().toLowerCase();
  if (!emailPlauzibil(email)) {
    return { ok: false, eroare: "Adresa nu pare corectă. Verific-o și încearcă din nou." };
  }

  const client = db();
  const { data: existent } = await client
    .from("blog_subscribers").select("id, confirmed_at").eq("email", email).maybeSingle();

  /*
    ⚠ ACELAȘI RĂSPUNS PENTRU „EȘTI DEJA ABONAT" ȘI „TE-AM ÎNSCRIS ACUM".

    Un mesaj care spune „adresa e deja abonată" transformă caseta într-o unealtă
    de aflat cine e abonat: scrii adrese pe rând și citești răspunsul. Aici cele
    două drumuri arată identic din afară, iar cine chiar e abonat nu primește un
    al doilea email.
  */
  const MESAJ = "Gata. Ți-am trimis un email; apasă legătura din el ca să confirmi.";

  if (existent && (existent as { confirmed_at: string | null }).confirmed_at) {
    return { ok: true, mesaj: MESAJ };
  }

  const token = randomBytes(24).toString("base64url");
  const { error } = await client
    .from("blog_subscribers")
    .upsert({ email, token, source: "blog", unsubscribed_at: null }, { onConflict: "email" });

  if (error) {
    await logError({
      action: "aboneazaLaBlog",
      message: error.message ?? "eroare necunoscuta",
      severity: "error",
    });
    return { ok: false, eroare: "Nu am putut înregistra adresa acum. Încearcă mai târziu." };
  }

  /*
    ⚠ DACĂ EMAILUL NU PLEACĂ, ÎNSCRIEREA NU S-A ÎNTÂMPLAT. Rândul rămâne
    neconfirmat, deci inofensiv, dar omului i se spune adevărul. Un formular care
    zice „ți-am trimis" fără să fi trimis e mai rău decât unul care dă eroare:
    al doilea măcar îl face să încerce altfel.
  */
  try {
    await sendBlogSubscribeConfirmation(email, `${PLATFORM_ORIGIN}/blog/confirma?t=${token}`);
  } catch (err) {
    await logError({
      action: "aboneazaLaBlog.email",
      message: err instanceof Error ? err.message : "eroare necunoscuta",
      severity: "error",
    });
    return { ok: false, eroare: "Nu am putut trimite emailul de confirmare. Încearcă mai târziu." };
  }

  return { ok: true, mesaj: MESAJ };
}

/**
 * Confirmarea, din legătura primită pe email.
 *
 * ⚠ JETONUL SE STINGE. O legătură de confirmare n-are de ce să mai lucreze după
 * ce și-a făcut treaba: lăsată vie, ar fi putut reconfirma o adresă dezabonată
 * între timp, de către oricine ar mai fi avut emailul vechi.
 */
export async function confirmaAbonarea(token: string): Promise<boolean> {
  const t = (token ?? "").trim();
  if (t.length < 20) return false;

  const ip = clientIpFromHeaders(await headers());
  /* Plafon și aici: fără el, jetoanele se pot încerca la nesfârșit. */
  if (!rateLimit(`blogConfirm:${ip}`, 10, 60_000)) return false;

  const { data } = await db()
    .from("blog_subscribers")
    .update({ confirmed_at: new Date().toISOString(), confirmed_ip: ip, token: null })
    .eq("token", t)
    .select("id");

  return Array.isArray(data) && data.length > 0;
}

// ── Partea de admin ──────────────────────────────────────────────────────────

export type Abonat = {
  id: string;
  email: string;
  source: string | null;
  confirmed_at: string | null;
  created_at: string;
};

export async function listeazaAbonati(): Promise<Abonat[]> {
  if (!(await requireAdminApi())) return [];
  const { data } = await db()
    .from("blog_subscribers")
    .select("id, email, source, confirmed_at, created_at")
    .is("unsubscribed_at", null)
    .order("created_at", { ascending: false })
    .limit(1000);
  return (data ?? []) as unknown as Abonat[];
}

export async function stergeAbonat(id: string): Promise<{ error: string } | { success: true }> {
  if (!(await requireAdminApi())) return { error: "Neautorizat" };
  const { error } = await db().from("blog_subscribers").delete().eq("id", id);
  if (error) return { error: "Nu s-a putut sterge." };
  revalidatePath("/admin/blog/abonati");
  return { success: true };
}
