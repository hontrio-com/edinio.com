import { createAdminClient } from "@/lib/supabase/admin";
import { getStoreEmailSender } from "@/lib/email/sender";
import { sendCodCont } from "@/lib/email";
import { rateLimit } from "@/lib/utils/rate-limit";
import { consumaLimita } from "@/lib/utils/limita-durabila";
import { codNou, amprentaCodului } from "./jeton";
import type { MagazinDeCont } from "./magazinul-cererii";
import { cheieIp, ipPentruBaza } from "./cerere";

/** Cat traieste un cod. Acelasi numar ajunge si in baza, si in textul emailului. */
export const MINUTE_COD = 10;

export type FelContact = "email" | "telefon";

/**
 * ⚠⚠ UN SINGUR RASPUNS PENTRU TOATE CAZURILE.
 *
 * `cont_cere_cod` spune cinstit „blocat", „prea-multe", „buget-epuizat" sau
 * „contact-nevalid", fiindca serverul are nevoie de adevar ca sa scrie in jurnal
 * si sa nu trimita degeaba. Dar catre browser pleaca MEREU acelasi text,
 * inclusiv cand destinatia nu exista la magazinul asta.
 *
 * Altfel formularul devine un oracol prin care cineva afla ce emailuri au deja
 * cont la magazin, si e chiar tiparul pe care `lookupReturnableOrder` il are azi
 * si pe care nu-l copiem.
 *
 * ⚠ Textul vorbeste despre o adresa NOUA (din 24.09.2026 codul de aici e numai
 * pentru adaugarea unei adrese in cont). Cel vechi, „daca adresa e cunoscuta de
 * magazin", era scris pentru intrarea cu cod si nu mai avea sens.
 */
export const MESAJ_UNIC = "Daca adresa poate fi adaugata, ti-am trimis un cod pe email. Verifica si folderul Spam.";

/**
 * ⚠ Intrarea pe TELEFON nu e pornita inca: niciun drum de SMS nu e legat de
 * zona de cont. Se spune limpede, si NU prin `MESAJ_UNIC`: acolo textul spune
 * ca a plecat ceva, si n-ar fi adevarat.
 */
export const MESAJ_SMS_INCA_NU = "Autentificarea cu numarul de telefon nu este disponibila momentan. Foloseste adresa de email.";

/**
 * Cere un cod pentru o ADRESA NOUA adaugata din cont. Intoarce mereu acelasi mesaj
 * catre om; `trimis` e numai pentru jurnal si pentru probe, nu pentru ecran.
 *
 * ⚠⚠ Din 24.09.2026 intrarea NUMAI cu cod nu mai exista (intrarea e cu email si
 * parola, iar codurile de intrare, de cont nou si de resetare trec prin
 * `autentificare.ts`, legate de o provocare). `cont_cere_cod` refuza scopul vechi
 * `intrare`, iar tipul de aici nu-l mai poate cere.
 */
export async function cereCod(
  magazin: MagazinDeCont,
  fel: FelContact,
  destinatieBruta: string,
  ip: string,
  scop: "adaugare-contact",
  contId: string,
): Promise<{ mesaj: string; trimis: boolean; motiv: string }> {
  /*
    ⚠ TREI PLASE, IN ORDINEA COSTULUI.
      1. `rateLimit`, in memorie, fara niciun cost, taie rafalele. ⚠ Starea e
         PER INSTANTA serverless, deci nu e o limita adevarata.
      2. `consumaLimita`, durabila, in Postgres. Cade DESCHIS la eroare de baza
         (`limita-durabila.ts:111-117`), de-aia nu poate fi singura.
      3. Plafonul din `cont_cere_cod`, scris in chiar instructiunea care
         insereaza. Acela nu poate cadea deschis: daca baza nu raspunde, nu se
         scrie nici codul.
  */
  /*
    ⚠⚠ SMS-UL SE REFUZA INAINTE SA SE SCRIE CEVA.
    Prima scriere chema `cont_cere_cod` si abia DUPA aceea se oprea, cu
    comentariul „se spune pe fata". Nu se spunea: randul era deja scris in
    `cont_cod`, consuma bugetul zilnic de SMS, iar omul primea „codul a plecat,
    verifica-ti casuta" pentru un mesaj care nu plecase nicaieri. Acum nu se
    scrie nimic si raspunsul e cinstit.
  */
  if (fel === "telefon") {
    return { mesaj: MESAJ_SMS_INCA_NU, trimis: false, motiv: "sms-neimplementat" };
  }

  /* ⚠ `cheieIp`: un IPv6 se numara pe retea (/64), altfel fiecare adresa din ea avea plafonul ei. */
  if (!rateLimit(`contCod:ip:${cheieIp(ip)}`, 10, 60_000)) {
    return { mesaj: MESAJ_UNIC, trimis: false, motiv: "rafala" };
  }
  const lim = await consumaLimita(`cont:cod:ip:${cheieIp(ip)}`, 20, 3600, 900);
  if (!lim.permis) {
    return { mesaj: MESAJ_UNIC, trimis: false, motiv: "limita-ip" };
  }

  const { cod, amprenta } = codNou();

  const { data, error } = await createAdminClient().rpc("cont_cere_cod", {
    p_business: magazin.id,
    p_scop: scop,
    p_fel: fel,
    p_destinatie_bruta: destinatieBruta,
    p_cod_hash: amprenta,
    p_cont: contId,
    p_minute: MINUTE_COD,
    /* ⚠ IP-ul merge si in baza: plafonul de acolo e singurul care nu poate cadea
       deschis, iar unul cheiat numai pe destinatie se intoarce impotriva omului
       caruia ii apartine adresa. */
    p_ip: ipPentruBaza(ip),
  });
  if (error) throw error;

  const r = Array.isArray(data) ? data[0] : data;
  if (!r?.ok) {
    return { mesaj: MESAJ_UNIC, trimis: false, motiv: r?.motiv ?? "necunoscut" };
  }

  const admin = createAdminClient();
  const sender = await getStoreEmailSender(admin, magazin.id);
  const rez = await sendCodCont(r.destinatie ?? destinatieBruta, {
    cod,
    minute: MINUTE_COD,
    numeMagazin: magazin.store_name ?? magazin.business_name ?? "magazin",
    scop,
  }, sender);

  if ("error" in rez) {
    return { mesaj: MESAJ_UNIC, trimis: false, motiv: "email-esuat" };
  }
  return { mesaj: MESAJ_UNIC, trimis: true, motiv: "trimis" };
}

/**
 * Verifica un cod.
 *
 * ⚠ Comparatia se face IN BAZA, pe amprenta, iar contorul de incercari creste
 * tot acolo. In TypeScript nu ajunge niciodata amprenta pastrata, deci nu exista
 * nici macar ocazia unei comparatii cu `===`.
 */
export async function verificaCod(
  magazin: MagazinDeCont,
  fel: FelContact,
  destinatieBruta: string,
  cod: string,
  ip: string,
  scop: "adaugare-contact",
  contId: string,
): Promise<{ ok: boolean; contId: string | null; motiv: string }> {
  if (!rateLimit(`contVerif:ip:${cheieIp(ip)}`, 20, 60_000)) {
    return { ok: false, contId: null, motiv: "rafala" };
  }
  const lim = await consumaLimita(`cont:verif:ip:${cheieIp(ip)}`, 40, 3600, 900);
  if (!lim.permis) {
    return { ok: false, contId: null, motiv: "limita-ip" };
  }

  const { data, error } = await createAdminClient().rpc("cont_verifica_cod", {
    p_business: magazin.id,
    p_scop: scop,
    p_fel: fel,
    p_destinatie_bruta: destinatieBruta,
    p_cod_hash: amprentaCodului(cod),
    p_cont: contId,
  });
  if (error) throw error;

  const r = Array.isArray(data) ? data[0] : data;
  return { ok: r?.ok === true, contId: r?.cont_id ?? null, motiv: r?.motiv ?? "necunoscut" };
}

/**
 * Ce i se spune omului cand codul nu e bun.
 *
 * ⚠ „Gresit" si „expirat" se pot deosebi fara sa se scurga nimic: amandoua sunt
 * despre un cod pe care omul il are deja in mana, nu despre existenta lui.
 */
export function mesajulRefuzului(motiv: string): string {
  switch (motiv) {
    case "gresit":
      return "Codul este gresit. Incearca din nou.";
    case "prea-multe-incercari":
      return "Prea multe incercari gresite pentru acest cod. Cere unul nou.";
    case "fara-cod":
      return "Codul a expirat sau a fost deja folosit. Cere unul nou.";
    case "contact-la-alt-cont":
      return "Aceasta adresa este deja folosita de alt cont.";
    case "rafala":
    case "limita-ip":
      return "Prea multe incercari. Asteapta un minut si reia.";
    default:
      return "Nu am putut verifica codul. Incearca din nou.";
  }
}
