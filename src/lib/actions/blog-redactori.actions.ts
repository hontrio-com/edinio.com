"use server";

import { revalidatePath } from "next/cache";
import type { SupabaseClient } from "@supabase/supabase-js";
import { createAdminClient } from "@/lib/supabase/admin";
import { requireAdminApi } from "@/lib/admin-guard";

/**
 * Cine are voie în redacția blogului.
 *
 * ⚠ TOT CE E AICI CERE ADMIN, nu redactor. Un redactor care și-ar putea face
 * colegi ar putea la fel de bine să-și facă și un al doilea cont: rolul care dă
 * puteri nu se împarte de cel care le are deja pe cele mici.
 *
 * ⚠ NU SE ATINGE DE `admin`, NICIODATĂ. Toate scrierile de mai jos filtrează
 * după rolul actual, iar cel de admin nu e printre cele acceptate. Fără asta, o
 * apăsare greșită pe ecranul de redactori ar fi putut coborî un administrator la
 * `user` — adică platforma ar fi rămas fără nimeni care să publice, și fără
 * nimeni care să repare.
 */
function db(): SupabaseClient {
  return createAdminClient() as unknown as SupabaseClient;
}

export type Redactor = {
  id: string;
  full_name: string | null;
  email: string | null;
  role: string;
};

/**
 * ⚠ PRINTR-O FUNCTIE DIN BAZA, nu prin `users_profile`.
 *
 * Tabela aceea NU tine adresa de email — ea sta in `auth.users`, la care
 * PostgREST nu ajunge. Prima scriere cerea `select("email")` de la
 * `users_profile` si ar fi picat la rulare; typecheck-ul n-avea ce sa vada,
 * fiindca clientul e fara tipuri. Gasit intreband schema, nu citind codul.
 */
export async function listeazaRedactori(): Promise<Redactor[]> {
  if (!(await requireAdminApi())) return [];
  const { data } = await db().rpc("redactorii_blogului");
  return (data ?? []) as unknown as Redactor[];
}

type Raspuns = { error: string } | { success: true };

/**
 * Face redactor pe cineva, după adresa de email.
 *
 * ⚠ DUPĂ EMAIL, NU DUPĂ ID. Adminul care dă dreptul are în mână adresa
 * colegului, nu identificatorul lui din baza de date. O casetă care ar fi cerut
 * un uuid ar fi însemnat o plimbare prin altă listă la fiecare adăugare.
 */
export async function faRedactor(emailBrut: string): Promise<Raspuns> {
  if (!(await requireAdminApi())) return { error: "Neautorizat" };
  const email = emailBrut.trim().toLowerCase();
  if (!email) return { error: "Scrie o adresă de email." };

  const client = db();
  const { data } = await client.rpc("cont_dupa_email", { p_email: email });
  const om = Array.isArray(data) ? data[0] : null;

  if (!om) return { error: "Nu există niciun cont cu adresa aceasta." };
  const rolAcum = (om as { rol: string }).rol;
  if (rolAcum === "admin") return { error: "Persoana e deja administrator, deci poate face tot." };
  if (rolAcum === "editor") return { error: "Persoana e deja redactor." };

  /*
    ⚠ DREPTUL DE A SCRIE PE BLOG STĂ ÎN ACEEAȘI COLOANĂ CU ROLUL PE PLATFORMĂ.

    `users_profile.role` ține un singur lucru, iar el poate fi
    `user | admin | moderator | editor`. Deci „îl fac redactor" înseamnă, la
    propriu, „îi șterg rolul de acum". Pentru un `user` e inofensiv. Pentru un
    MODERATOR nu: îl scoatem din moderare ca să-l punem pe blog, iar
    `scoateRedactor` l-ar coborî apoi la `user` — deci rolul lui adevărat s-ar
    pierde de tot, în două apăsări care par nevinovate.

    Reparația curată e ca dreptul de blog să nu mai stea în coloana aceea (o
    tabelă `blog_editors`, sau drepturi separate). Până atunci, ușa se închide
    aici și se spune de ce — un refuz limpede e mai bun decât o pierdere tăcută.
  */
  if (rolAcum === "moderator") {
    return {
      error:
        "Persoana e moderator, iar dreptul de redactor s-ar scrie peste rolul acela și l-ar șterge. " +
        "Deocamdată un cont nu poate fi și moderator, și redactor.",
    };
  }

  const { data: atinse, error } = await client
    .from("users_profile")
    .update({ role: "editor" })
    .eq("id", (om as { id: string }).id)
    /* ⚠ Filtrul se repetă în scriere, nu doar în citirea de mai sus: între cele
       două, cineva ar fi putut deveni admin. Fără el, cursa aceea l-ar fi
       coborât la redactor. */
    .eq("role", rolAcum)
    .select("id");

  if (error) return { error: "Nu s-a putut schimba rolul." };

  /*
    ⚠ „Fără eroare" NU înseamnă „s-a schimbat ceva".

    Dacă între citire și scriere rolul s-a schimbat (altcineva l-a făcut admin,
    sau tot redactor), filtrul de mai sus nu potrivește niciun rând: PostgREST
    răspunde cu succes și zero rânduri. Ecranul ar fi spus „Gata, e redactor"
    despre cineva care nu e.
  */
  if (!Array.isArray(atinse) || atinse.length !== 1) {
    return { error: "Rolul s-a schimbat între timp. Reîncarcă pagina și încearcă din nou." };
  }
  revalidatePath("/admin/blog/redactori");
  return { success: true };
}

/**
 * Scoate dreptul de redactor.
 *
 * ⚠ FILTRUL `eq("role", "editor")` E PAZA, nu o optimizare. Fără el, un id de
 * administrator trimis de aici l-ar fi coborât la `user`. Așa, o astfel de
 * cerere nu atinge niciun rând.
 */
export async function scoateRedactor(id: string): Promise<Raspuns> {
  if (!(await requireAdminApi())) return { error: "Neautorizat" };
  /*
    `.eq("role", "editor")` e și paza: nu coboară un admin din greșeală, dacă
    ecranul e vechi. Iar de la reparația din `faRedactor` încoace, un redactor nu
    mai poate fi un fost moderator — deci „înapoi la `user`" e acum adevărat.
  */
  const { data: atinse, error } = await db()
    .from("users_profile")
    .update({ role: "user" })
    .eq("id", id)
    .eq("role", "editor")
    .select("id");

  if (error) return { error: "Nu s-a putut schimba rolul." };
  if (!Array.isArray(atinse) || atinse.length !== 1) {
    return { error: "Persoana nu mai e redactor. Reîncarcă pagina." };
  }
  revalidatePath("/admin/blog/redactori");
  return { success: true };
}
