import crypto from "node:crypto";
import { sendMfaOtpEmail } from "@/lib/email";
import { consumaLimita, reseteazaLimita, mesajLimita } from "@/lib/utils/limita-durabila";
import { rateLimit } from "@/lib/utils/rate-limit";
import { adaugaSesiune, type SesiuneConfirmata } from "./mfa";
import { uitaStareaMfa } from "./stare-mfa";

/**
 * Miezul fluxului MFA: generarea codului, verificarea lui si marcarea sesiunii
 * ca CONFIRMATA.
 *
 * DE CE E UN MODUL SEPARAT, si nu a ramas in `auth.actions.ts`: de cand pasii
 * care ruleaza cu sesiunea neconfirmata sunt rute /api (vezi
 * src/app/api/auth/mfa/*), acelasi cod e chemat din doua feluri de fisiere —
 * rute si actiuni de server. Un modul `"use server"` nu poate exporta decat
 * functii async si oricum ar transforma fiecare ajutor intern intr-un endpoint
 * public (vezi [[use-server-expune-fiecare-export]]). Aici sunt simple functii.
 */

/** Codul are 6 cifre (1.000.000 de combinatii): fara plafon se sparge prin forta bruta. */
const LIMITA_INCERCARI = { limita: 5, fereastra: 900, blocare: 900 } as const;
/** Fiecare retrimitere inseamna un email trimis. */
const LIMITA_TRIMITERI = { limita: 4, fereastra: 900, blocare: 900 } as const;

export function generateOtp(): { otp: string; otpHash: string; expiresAt: string } {
  const otp = crypto.randomInt(100000, 1000000).toString();
  const otpHash = crypto.createHash("sha256").update(otp).digest("hex");
  const expiresAt = new Date(Date.now() + 10 * 60 * 1000).toISOString();
  return { otp, otpHash, expiresAt };
}

export function verifyOtpHash(code: string, storedHash: string, expiresAt: string): boolean {
  if (new Date() > new Date(expiresAt)) return false;
  const hash = crypto.createHash("sha256").update(code).digest("hex");
  const a = Buffer.from(hash);
  const b = Buffer.from(storedHash);
  // `timingSafeEqual` ARUNCA daca lungimile difera. Un `mfa_otp` stricat sau
  // gol in baza transforma o verificare esuata intr-o eroare 500 neprinsa.
  if (a.length !== b.length) return false;
  return crypto.timingSafeEqual(a, b);
}

export interface CampuriMfa {
  mfa_otp?: string | null;
  mfa_otp_expires_at?: string | null;
  mfa_email_enabled?: boolean;
  mfa_confirmat_la?: string | null;
  mfa_sesiuni_confirmate?: SesiuneConfirmata[];
}

/**
 * Scrierile pe campurile MFA trec OBLIGATORIU prin service role.
 *
 * Toate sunt pe randul propriu al utilizatorului, deci pana la 04.08.2026 si le
 * putea scrie singur cu cheia anon din browser:
 *   update({ mfa_email_enabled: false })                   -> stinge MFA de tot
 *   update({ mfa_otp: sha256("123456"), expires: viitor }) -> isi alege codul
 *   update({ mfa_sesiuni_confirmate: [{s: <session_id-ul lui>, t: 0}] }) -> isi confirma singur
 * Coloanele sunt revocate pentru rolul `authenticated` si pazite de trigger
 * (migrations/2026-08-04-blindare-mfa.sql, 2026-08-05-poarta-mfa.sql).
 */
export async function scrieCampuriMfa(userId: string, campuri: CampuriMfa): Promise<void> {
  const { createAdminClient } = await import("@/lib/supabase/admin");
  const { error } = await createAdminClient()
    .from("users_profile")
    .update(campuri as never)
    .eq("id", userId);
  /*
   * Eroarea NU se inghite in tacere. Scrierile de aici decid daca omul intra sau
   * nu: daca `mfa_sesiuni_confirmate` nu se scrie, utilizatorul introduce codul
   * corect si tot nu ajunge in panou. Fara log, asta arata identic cu „cod
   * gresit" — genul de diagnostic care a costat deja o sesiune intreaga pe
   * 04.08.2026 (vezi [[postgrest-cache-granturi]]).
   */
  if (error) {
    console.error("[mfa] scrierea campurilor MFA a esuat", {
      userId,
      campuri: Object.keys(campuri),
      cod: error.code,
      mesaj: error.message,
    });
  }
}

/**
 * Citirea trece si ea prin service role: `mfa_otp` e hash-ul codului in curs, iar
 * cine il citeste sparge 6 cifre offline in mai putin de o secunda.
 */
export async function citesteCampuriMfa(userId: string): Promise<{
  mfa_email_enabled: boolean | null;
  mfa_otp: string | null;
  mfa_otp_expires_at: string | null;
  onboarding_completed?: boolean | null;
} | null> {
  const { createAdminClient } = await import("@/lib/supabase/admin");
  const { data, error } = await createAdminClient()
    .from("users_profile")
    .select("mfa_email_enabled, mfa_otp, mfa_otp_expires_at, onboarding_completed")
    .eq("id", userId)
    .single();

  /*
   * Eroarea NU se mai inghite. Varianta de dinainte facea `const { data } = ...`
   * si returna `data ?? null`; cand interogarea esua, apelantii vedeau
   * `profile === null` si raspundeau „Codul a expirat" — un mesaj complet fals.
   */
  if (error) {
    console.error("[mfa] citirea provocarii a esuat", { userId, cod: error.code, mesaj: error.message });
    return null;
  }
  return data ?? null;
}

export async function limitaIncercariMfa(userId: string): Promise<{ error: string } | null> {
  /*
    ═══ ⚠ PLASA DE DEDESUBT, PENTRU CAND CONTORUL DIN BAZA NU RASPUNDE ═══

    `consumaLimita` cade DESCHIS: la orice eroare de baza intoarce `permis: true`
    (vezi `esecTacut` in limita-durabila.ts). E o alegere buna aproape peste tot —
    o bază care clipeste n-are voie sa incuie oamenii afara din propriile conturi.

    ⚠ DAR AICI NU MAI RAMANEA NIMIC DEDESUBT. Plafonul durabil era SINGURUL de pe
    incercarile de MFA, adica pe un cod de sase cifre. Cat timp RPC-ul nu
    raspunde, ghicirea codului devine nelimitata — un milion de variante, fara
    nicio franare. In restul proiectului stratul din memorie sta sub cel durabil
    tocmai pentru asta; aici lipsea.

    ⚠ E O FRANA, NU O INCUIETOARE: memoria e pe instanta, deci limita adevarata e
    „30 x numarul de instante calde". Impotriva ghicirii unui OTP de sase cifre,
    diferenta dintre asta si nelimitat e toata diferenta.

    Pragul e larg dinadins (30/minut fata de 5/15 minute la cel durabil): pe
    drumul obisnuit nu se atinge NICIODATA, deci nu poate pedepsi un om care
    greseste codul de doua ori. Se aprinde numai cand celalalt a disparut.
  */
  if (!rateLimit(`mfa-memorie:${userId}`, 30, 60_000)) {
    return { error: "Prea multe incercari. Asteapta un minut si reia." };
  }

  const lim = await consumaLimita(
    `mfa:${userId}`,
    LIMITA_INCERCARI.limita,
    LIMITA_INCERCARI.fereastra,
    LIMITA_INCERCARI.blocare,
  );
  if (lim.permis) return null;
  return { error: mesajLimita(lim, "Prea multe coduri gresite. Incearca din nou mai tarziu.") };
}

/**
 * Genereaza si trimite un cod nou.
 *
 * CE NU FACE, dinadins: nu sterge confirmarile existente. Sesiunea care tocmai
 * cere codul nu e in lista oricum (e noua, si oricum nici nu a fost emisa), deci
 * stergerea nu ar apara nimic — dar ar arunca afara celelalte dispozitive ale
 * omului la fiecare autentificare, inclusiv la una incercata de un atacator care
 * are parola. Adica un refuz de serviciu oferit pe tava.
 */
export async function trimiteCodMfa(
  userId: string,
  email: string,
): Promise<{ error: string } | { success: true }> {
  /* Aceeasi plasa ca la incercari: fara ea, o baza muta ar lasa trimiterea de
     coduri nelimitata — adica bombardarea casutei omului cu emailuri de la noi. */
  if (!rateLimit(`mfa-trimite-memorie:${userId}`, 10, 60_000)) {
    return { error: "Prea multe coduri cerute. Asteapta un minut." };
  }

  const lim = await consumaLimita(
    `mfa-trimite:${userId}`,
    LIMITA_TRIMITERI.limita,
    LIMITA_TRIMITERI.fereastra,
    LIMITA_TRIMITERI.blocare,
  );
  if (!lim.permis) return { error: mesajLimita(lim, "Prea multe coduri cerute. Incearca mai tarziu.") };

  const { otp, otpHash, expiresAt } = generateOtp();
  await scrieCampuriMfa(userId, { mfa_otp: otpHash, mfa_otp_expires_at: expiresAt });
  /*
   * Un cod NOU incepe cu bugetul de incercari intreg.
   *
   * Contorul de incercari e pe utilizator, deci cineva care are parola putea sa
   * greseasca de 5 ori si sa blocheze 15 minute chiar contul victimei — care
   * primea codul corect pe email si nu-l mai putea folosi. Repetabil la
   * nesfarsit. Resetarea aici desface blocajul fara sa deschida forta bruta:
   * codurile noi sunt plafonate la 4 la 15 minute, deci maximul ramane 20 de
   * incercari pe sfert de ora, din 1.000.000 de combinatii.
   */
  await reseteazaLimita(`mfa:${userId}`);
  await sendMfaOtpEmail(email, otp);
  return { success: true };
}

/**
 * Verifica un cod introdus. NU atinge sesiunea — apelantul decide ce face dupa.
 *
 * Ordinea (plafon INAINTE de comparatie) e cea de dinainte si e intentionata:
 * altfel o incercare care esueaza din alt motiv nu ar consuma din buget.
 */
export async function verificaCodMfa(
  userId: string,
  cod: string,
): Promise<{ error: string } | { ok: true; onboardingFinalizat: boolean }> {
  const profil = await citesteCampuriMfa(userId);

  const depasit = await limitaIncercariMfa(userId);
  if (depasit) return depasit;

  if (!profil) return { error: "Nu am putut verifica codul. Incearca din nou in cateva secunde." };
  if (!profil.mfa_otp || !profil.mfa_otp_expires_at) {
    return { error: "Codul a expirat. Cere unul nou." };
  }
  if (!verifyOtpHash(cod.trim(), profil.mfa_otp, profil.mfa_otp_expires_at)) {
    return { error: "Cod incorect sau expirat." };
  }

  await reseteazaLimita(`mfa:${userId}`);
  return { ok: true, onboardingFinalizat: profil.onboarding_completed === true };
}

/**
 * Marcheaza sesiunea `idSesiune` drept trecuta de al doilea factor, si sterge
 * codul folosit.
 *
 * DE CE `session_id` SI NU DOAR O DATA: o data raspunde la „s-a confirmat
 * vreodata", nu la „s-a confirmat sesiunea asta". O confirmare veche de trei
 * luni ar valida o sesiune deschisa azi de cineva care are doar parola.
 *
 * DE CE CITIM INAINTE SA SCRIEM: lista tine mai multe sesiuni, ca telefonul sa
 * nu scoata laptopul din priza. Fereastra dintre citire si scriere poate pierde
 * o confirmare facuta EXACT in acelasi moment pe alt dispozitiv; consecinta e ca
 * acel dispozitiv mai cere o data codul, nu ca intra cineva nepoftit. Am ales
 * asta in loc de un RPC cu lock: pretul unei curse e o reintroducere de cod.
 */
export async function confirmaSesiuneaMfa(userId: string, idSesiune: string): Promise<void> {
  const { createAdminClient } = await import("@/lib/supabase/admin");
  const { data } = await createAdminClient()
    .from("users_profile")
    .select("mfa_sesiuni_confirmate")
    .eq("id", userId)
    .maybeSingle();

  await scrieCampuriMfa(userId, {
    mfa_otp: null,
    mfa_otp_expires_at: null,
    mfa_confirmat_la: new Date().toISOString(),
    mfa_sesiuni_confirmate: adaugaSesiune(
      (data as { mfa_sesiuni_confirmate?: unknown } | null)?.mfa_sesiuni_confirmate,
      idSesiune,
    ),
  });
  // Instanta care tocmai a scris nu trebuie sa mai raspunda din memorie cu
  // starea de dinainte.
  uitaStareaMfa(userId, idSesiune);
}

/** Adresa contului, pentru cand nu avem sesiune din care sa o citim. */
export async function emailUtilizator(userId: string): Promise<string | null> {
  const { createAdminClient } = await import("@/lib/supabase/admin");
  const { data, error } = await createAdminClient().auth.admin.getUserById(userId);
  if (error) {
    console.error("[mfa] citirea adresei de email a esuat", { userId, mesaj: error.message });
    return null;
  }
  return data.user?.email ?? null;
}
