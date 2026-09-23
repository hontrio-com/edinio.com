import { cookies } from "next/headers";
import { createAdminClient } from "@/lib/supabase/admin";
import { COOKIE_CONT, amprentaJetonului, jetonNou, optiuniCookie } from "./jeton";

export type SesiuneCont = { contId: string; nume: string; trebuieRotit: boolean };

/**
 * Cine e cumparatorul acestei cereri, pentru magazinul dat.
 *
 * ⚠⚠ IDENTITATEA NU VINE NICIODATA DIN CERERE. `contId` iese DOAR de aici, si
 * niciodata dintr-un `searchParams`, dintr-un corp sau dintr-un antet. O proba
 * cade daca vreun fisier de sub zona de cont paseaza altceva mai departe.
 *
 * ⚠ Se cheama cu clientul de SERVICIU, fiindca functiile `cont_*` sunt date
 * numai lui `service_role`: cumparatorul nu e `authenticated` in baza si nu
 * poate chema nimic singur.
 *
 * Intoarce `null` pentru orice fel de „nu e valabila" (lipsa, expirata, epoca
 * schimbata, cont sters, functie stinsa din Setari). Motivul adevarat ramane in
 * `privat.cont_sesiune.motiv_incheiere`, unde il vede numai cine are baza: un
 * mesaj deosebit pe ecran ar fi fost un oracol.
 */
export async function sesiuneCurenta(businessId: string): Promise<SesiuneCont | null> {
  const jeton = (await cookies()).get(COOKIE_CONT)?.value;
  if (!jeton) return null;

  const { data, error } = await createAdminClient().rpc("cont_sesiune_verifica", {
    p_business: businessId,
    p_jeton_hash: amprentaJetonului(jeton),
  });

  /*
    ⚠ O EROARE DE BAZA NU INSEAMNA „NU E LOGAT". Ar insemna ca o pana de o clipa
    deconecteaza pe toata lumea, iar cookie-ul ramane, deci omul ar vedea ecranul
    de intrare si apoi s-ar trezi logat, fara sa inteleaga nimic. Se arunca, si
    pagina raspunde „reveniti".
  */
  if (error) throw error;

  const r = Array.isArray(data) ? data[0] : data;
  if (!r) return null;
  return { contId: r.cont_id, nume: r.nume ?? "", trebuieRotit: r.trebuie_rotit === true };
}

/**
 * Deschide o sesiune si scrie cookie-ul.
 *
 * ⚠ Se poate chema NUMAI dintr-o ruta sau dintr-o actiune: o componenta de
 * server nu poate scrie cookie-uri, iar `src/lib/supabase/server.ts` arata ce se
 * intampla atunci, inghite eroarea in tacere.
 */
export async function deschideSesiune(businessId: string, contId: string, ip: string | null): Promise<void> {
  const { jeton, amprenta } = jetonNou();
  const { error } = await createAdminClient().rpc("cont_sesiune_creeaza", {
    p_business: businessId,
    p_cont: contId,
    p_jeton_hash: amprenta,
    p_ip: ip,
  });
  if (error) throw error;
  (await cookies()).set(COOKIE_CONT, jeton, optiuniCookie());
}

/**
 * Roteste jetonul. Se cheama dintr-o ruta, cand `trebuieRotit` e adevarat.
 *
 * ⚠ Marginea absoluta NU se misca la rotire, iar cookie-ul primeste `maxAge`
 * proaspat: browserul si baza raman lipite, dar sesiunea tot moare la 30 de zile.
 */
export async function roteste(businessId: string): Promise<boolean> {
  const cos = await cookies();
  const vechi = cos.get(COOKIE_CONT)?.value;
  if (!vechi) return false;

  const { jeton, amprenta } = jetonNou();
  const { data, error } = await createAdminClient().rpc("cont_sesiune_roteste", {
    p_business: businessId,
    p_jeton_vechi: amprentaJetonului(vechi),
    p_jeton_nou: amprenta,
  });
  if (error) throw error;
  const r = Array.isArray(data) ? data[0] : data;
  if (!r) return false;

  cos.set(COOKIE_CONT, jeton, optiuniCookie());
  return true;
}

/**
 * Iesirea din cont.
 *
 * ⚠ Cookie-ul se sterge chiar daca inchiderea in baza esueaza: altfel omul ar
 * apasa „Iesi", ar vedea o eroare si ar ramane logat.
 */
export async function inchideSesiune(businessId: string): Promise<void> {
  const cos = await cookies();
  const jeton = cos.get(COOKIE_CONT)?.value;
  cos.delete(COOKIE_CONT);
  if (!jeton) return;

  await createAdminClient()
    .rpc("cont_sesiune_incheie", { p_business: businessId, p_jeton_hash: amprentaJetonului(jeton) })
    .throwOnError()
    .then(
      () => undefined,
      () => undefined,
    );
}
