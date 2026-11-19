import { cookies } from "next/headers";
import { createClient } from "@/lib/supabase/server";

/*
  E chiar comerciantul cel care se uita la propriul magazin?

  Vizitele lui nu intra in statistici (regula din `vizita-de-masurat.ts`), iar
  acum nici evenimentele de palnie: altfel, un comerciant care isi verifica
  produsele dimineata ar aparea ca zece oameni care s-au uitat si n-au cumparat.

  ⚠ INTAI SE CAUTA COOKIE-UL, SI ABIA APOI SE INTREABA SERVERUL DE AUTENTIFICARE.

  Aproape toti vizitatorii unui magazin sunt nelogati. Fara verificarea asta,
  fiecare deschidere de pagina de produs ar fi insemnat inca o cerere catre
  Supabase, pe drumul cel mai umblat al platformei, ca sa afle acelasi „nu" de
  fiecare data.

  ⚠ Cookie-ul se citeste doar ca SEMN ca ar putea exista cineva logat; cine e
  hotaraste tot `getUser()`. Un cookie stricat nu poate trece drept proprietar,
  fiindca raspunsul vine de la serverul de autentificare, nu din cookie.

  ⚠ NU SE CHEAMA DIN `after()`-UL UNEI PAGINI (19.11.2026). Acolo `cookies()`
  arunca („used `cookies()` inside `after()` while rendering”), `catch`-ul de mai
  jos preface caderea in „vizitator”, si proprietarul ajunge numarat fara niciun
  semn. Asa a stat pagina de produs de la aparitia palniei. Intr-o pagina,
  verdictul se afla in randare (utilizatorul e de obicei deja citit) si se da
  callbackului ca valoare. Locul potrivit pentru functia asta e o ruta de API sau
  o actiune de server, unde datele cererii se pot citi oricand.
  `dupa-raspuns-fara-cerere.test.ts` tine regula.
*/
export async function esteProprietarulMagazinului(businessUserId: string | null | undefined): Promise<boolean> {
  if (!businessUserId) return false;

  try {
    const toate = await cookies();
    const areCookieDeAutentificare = toate.getAll().some((c) => c.name.startsWith("sb-"));
    if (!areCookieDeAutentificare) return false;

    const supabase = await createClient();
    const { data } = await supabase.auth.getUser();
    return data.user?.id === businessUserId;
  } catch {
    /* La orice piedica: il socotim vizitator. O vizita in plus la statistici e
       mai putin rea decat o pagina de magazin care nu se mai randeaza. */
    return false;
  }
}
