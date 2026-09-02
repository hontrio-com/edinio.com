import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { idSesiuneCurenta } from "@/lib/auth/stare-mfa";
import { confirmaSesiuneaMfa } from "@/lib/auth/flux-mfa";
import { ePrimaAutentificare, idConversieCont } from "@/lib/edinio-marketing/cont-nou";
import { puneLaCoada } from "@/lib/edinio-marketing/server/coada-conversii";
import { destinatiiActive } from "@/lib/edinio-marketing/server/destinatii-active";
import { consimtamantulCererii, martoriiCererii } from "@/lib/edinio-marketing/server/consimtamant-server";

/**
 * Aterizarea din linkurile trimise pe email: confirmarea contului, resetarea
 * parolei, linkul magic folosit de impersonare.
 *
 * DE CE MARCHEAZA SESIUNEA CA TRECUTA DE AL DOILEA FACTOR (05.08.2026): ca sa
 * ajunga aici, omul a deschis un link primit pe adresa contului. Asta ESTE
 * factorul al doilea — exact acelasi lucru pe care il dovedeste codul din 6
 * cifre, care se trimite tot pe email. Fara marcaj, cine isi reseteaza parola ar
 * primi o sesiune pe care poarta o refuza, si nu ar mai putea nici sa-si puna
 * parola noua: linkul de recuperare e singura lui cale de intrare, iar codul MFA
 * cere o autentificare pe care tocmai nu o poate face.
 */
export async function GET(request: NextRequest) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get("code");
  const tokenHash = searchParams.get("token_hash");
  const type = searchParams.get("type");
  const next = searchParams.get("next");

  const supabase = await createClient();
  let authenticated = false;

  // PKCE flow (normal login/register)
  if (code) {
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    authenticated = !error;
  }
  // OTP/magic link flow (admin impersonation)
  else if (tokenHash && type) {
    const { error } = await supabase.auth.verifyOtp({
      token_hash: tokenHash,
      type: type as "magiclink" | "email",
    });
    authenticated = !error;
  }

  if (authenticated) {
    const { data: { user: utilizator } } = await supabase.auth.getUser();
    const idSesiune = utilizator ? await idSesiuneCurenta(supabase) : null;
    if (utilizator && idSesiune) await confirmaSesiuneaMfa(utilizator.id, idSesiune);

    // Password reset flow: redirect straight to /reset-password with active session
    if (next === "/reset-password") {
      return NextResponse.redirect(`${origin}/reset-password`);
    }

    const user = utilizator;
    if (user) {
      const { data: profile } = await supabase
        .from("users_profile")
        .select("onboarding_completed")
        .eq("id", user.id)
        .single();

      if (!profile?.onboarding_completed) {
        const plan = searchParams.get("plan");
        const res = NextResponse.redirect(`${origin}/onboarding/details`);
        res.cookies.delete("onboarding_done");
        if (plan && ["basic", "premium", "ultra"].includes(plan)) {
          res.cookies.set("preselected_plan", plan, { httpOnly: false, path: "/", maxAge: 600, sameSite: "lax" });
        }

        /*
          ═══ ⚠ CONTUL NOU FACUT PRIN GOOGLE SE NUMARA AICI, SI NICAIERI ALTUNDEVA ═══

          Calea cu email si parola isi scrie jetonul in `register()`. Inscrierea
          prin Google nu trece pe acolo deloc — ea ajunge fix aici.

          MASURAT IN BAZA pe 01.09.2026: 28 din 168 de conturi sunt prin Google.
          Deci aproape una din sase inscrieri lipsea din GA4, din Meta si din
          TikTok, iar rata de conversie raportata era cu vreo 15% mai mica decat
          adevarul. Nimic nu cadea si nimeni n-avea de unde sti.

          ⚠ SI NU LA FIECARE TRECERE PE AICI. Ruta asta e si aterizarea pentru
          confirmarea contului, pentru resetarea parolei si pentru linkul de
          impersonare. Cine si-a facut cont acum trei saptamani si n-a terminat
          onboardingul intra pe aceeasi ramura la FIECARE autentificare — numarat
          asa, un singur om ar fi zeci de conturi noi.

          `ePrimaAutentificare` cere ca intrarea sa fie chiar nasterea contului.
          Vezi acolo de unde vine fereastra si ce se intampla daca e gresita.
        */
        if (ePrimaAutentificare(user)) {
          /*
            ⚠ ORIGINEA CALATORESTE IN JETON, nu ca prop in layout.

            Layoutul scria `origine="register"` pentru toata lumea. Corect cat
            timp singura cale era emailul; MINCINOS din clipa in care se numara si
            Google — si tocmai despartirea aia e ce am masurat (28 din 168).

            Serverul stie adevarul, deci el il spune. Lista e inchisa: ce nu
            recunoastem devine `altul`, nu un text de la furnizor.
          */
          const furnizor = user.app_metadata?.provider;
          const origine = furnizor === "google" ? "google" : furnizor === "email" ? "email" : "altul";
          const consim = await consimtamantulCererii();
          const consimMarketing = consim?.marketing === true;
          const idConversie = idConversieCont(user.id);
          if (consimMarketing) {
          /*
            ⚠ SI JETONUL DE MASURARE ATARNA DE ACORD. `edinio_signup` e citit
            EXCLUSIV de `UrmaPalnie`, ca sa traga evenimentul de inscriere — deci
            nu e „strict necesar", e o urmarire, si intra sub aceeasi regula ca
            pixelii. Scris neconditionat, bannerul ar fi fost pe jumatate teatru.
          */
            res.cookies.set("edinio_signup", `${idConversie}.${origine}`, {
              maxAge: 300,
              path: "/",
              sameSite: "lax",
              secure: process.env.NODE_ENV === "production",
            });
          }

          /*
            ═══ ⚠ SI DE PE SERVER, CU ACELASI `event_id` ═══

            Jetonul de mai sus il face pe BROWSER sa trage `sign_up`. Atat a fost
            de ajuns cat timp masuram doar in GA4 — dar catre Meta si TikTok
            browserul se pierde la fiecare blocant de reclame, iar inscrierile
            prin Google sunt 28 din 168 (masurat pe 01.09.2026).

            Calea cu email pune la coada in `register()`. Asta e perechea ei
            pentru Google, si poarta ACELASI id — deci furnizorii unesc cele doua
            drumuri si numara O inscriere, nu doua.
          */
          await puneLaCoada(
            { name: "sign_up", signup_origin: origine, event_id: idConversie },
            {
              ctx: {
                ip: request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? null,
                userAgent: request.headers.get("user-agent"),
              },
              amprentaOmului: consim?.vid ?? user.id,
              /*
                ⚠ MARTORII LASATI DE PIXELI. `_fbc` poarta id-ul clicului pe
                reclama — legatura directa dintre inscriere si campania platita.
                Nicio hotarare legala noua: exista numai daca pixelul a rulat,
                adica numai dupa acord.
              */
              martori: await martoriiCererii(),
            },
            destinatiiActive(),
            { fel: "cookie", stare: consim },
          );
        }
        return res;
      }
      const dashRes = NextResponse.redirect(`${origin}/dashboard`);
      dashRes.cookies.set("onboarding_done", "1", { httpOnly: true, path: "/", maxAge: 60 * 60 * 24 * 30, sameSite: "lax", secure: process.env.NODE_ENV === "production" });
      return dashRes;
    }
  }

  return NextResponse.redirect(`${origin}/login?error=auth`);
}
