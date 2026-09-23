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
  const { data, error } = await createAdminClient().rpc("cont_sesiune_creeaza", {
    p_business: businessId,
    p_cont: contId,
    p_jeton_hash: amprenta,
    p_ip: ip,
  });
  if (error) throw error;

  /*
    ⚠⚠ `error` NU E DE AJUNS. `cont_sesiune_creeaza` iese cu ZERO randuri, fara
    nicio eroare, cand contul nu exista, e sters, sau e al altui magazin. Prima
    scriere se uita doar la `error` si scria cookie-ul oricum: omul ar fi plecat
    cu un jeton care nu deschide nimic, iar ecranul l-ar fi trimis la nesfarsit
    inapoi la intrare, fara sa spuna de ce.
  */
  const r = Array.isArray(data) ? data[0] : data;
  if (!r?.sesiune_id) throw new Error("cont_sesiune_creeaza nu a creat nicio sesiune");

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
 * Sterge cookie-ul, orice s-ar intampla mai departe.
 *
 * ⚠⚠ E DESPARTITA DE INCHIDEREA DIN BAZA, si asta e miezul.
 * Prima scriere inchidea cookie-ul numai daca gasea magazinul. Dar magazinul se
 * cauta dupa gazda, si cautarea poate sa nu gaseasca nimic: magazin nepublicat,
 * domeniu tocmai schimbat, baza cazuta. Atunci omul apasa „Iesi", pagina se
 * reincarca, si el e tot logat, fara nicio cale sa iasa. Cookie-ul se sterge
 * INTOTDEAUNA; inchiderea randului din baza e ce se poate face pe deasupra.
 */
export async function stergeCookieContului(): Promise<void> {
  (await cookies()).delete(COOKIE_CONT);
}

/**
 * Iesirea din cont: inchide randul din baza SI sterge cookie-ul.
 */
export async function inchideSesiune(businessId: string): Promise<void> {
  const cos = await cookies();
  const jeton = cos.get(COOKIE_CONT)?.value;
  cos.delete(COOKIE_CONT);
  if (!jeton) return;

  /* ⚠ Esecul nu se ridica mai sus: cookie-ul e deja sters, deci omul a iesit.
     Randul ramas deschis moare oricum la expirare si la curatenie. */
  const { error } = await createAdminClient().rpc("cont_sesiune_incheie", {
    p_business: businessId,
    p_jeton_hash: amprentaJetonului(jeton),
  });
  if (error) {
    console.error("[cont] inchiderea sesiunii in baza a esuat", error.message);
  }
}
