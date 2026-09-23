import { createAdminClient } from "@/lib/supabase/admin";
import { getStoreEmailSender } from "@/lib/email/sender";
import { sendCodCont } from "@/lib/email";
import { rateLimit } from "@/lib/utils/rate-limit";
import { consumaLimita } from "@/lib/utils/limita-durabila";
import { codNou, amprentaCodului } from "./jeton";
import type { MagazinDeCont } from "./magazinul-cererii";

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
 * Altfel formularul de intrare devine un oracol prin care oricine afla ce
 * emailuri si ce telefoane cunoaste magazinul, si e chiar tiparul pe care
 * `lookupReturnableOrder` il are azi si pe care nu-l copiem.
 */
export const MESAJ_UNIC = "Daca adresa e cunoscuta de magazin, codul a plecat. Verifica-ti casuta.";

/**
 * Cere un cod. Intoarce mereu acelasi mesaj catre om; `trimis` e numai pentru
 * jurnal si pentru probe, nu pentru ecran.
 */
export async function cereCod(
  magazin: MagazinDeCont,
  fel: FelContact,
  destinatieBruta: string,
  ip: string,
  scop: "intrare" | "adaugare-contact" = "intrare",
  contId: string | null = null,
): Promise<{ mesaj: string; trimis: boolean; motiv: string }> {
  /*
    ⚠ TREI PLASE, IN ORDINEA COSTULUI.
      1. `rateLimit` — in memorie, fara niciun cost, taie rafalele. ⚠ Starea e
         PER INSTANTA serverless, deci nu e o limita adevarata.
      2. `consumaLimita` — durabila, in Postgres. Cade DESCHIS la eroare de baza
         (`limita-durabila.ts:111-117`), de-aia nu poate fi singura.
      3. Plafonul din `cont_cere_cod`, scris in chiar instructiunea care
         insereaza. Acela nu poate cadea deschis: daca baza nu raspunde, nu se
         scrie nici codul.
  */
  if (!rateLimit(`contCod:ip:${ip}`, 10, 60_000)) {
    return { mesaj: MESAJ_UNIC, trimis: false, motiv: "rafala" };
  }
  const lim = await consumaLimita(`cont:cod:ip:${ip}`, 20, 3600, 900);
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
  });
  if (error) throw error;

  const r = Array.isArray(data) ? data[0] : data;
  if (!r?.ok) {
    return { mesaj: MESAJ_UNIC, trimis: false, motiv: r?.motiv ?? "necunoscut" };
  }

  /*
    ⚠ SMS-ul nu e pornit in valul 1, si asta se spune pe fata, nu se ascunde.
    Codul e deja scris in baza, deci nu se pierde nimic; doar nu are cum sa
    ajunga la om. Pe ecran, campul de telefon nici nu se arata cat timp
    magazinul nu are furnizor, deci drumul asta e o plasa, nu o cale obisnuita.
  */
  if (fel === "telefon") {
    return { mesaj: MESAJ_UNIC, trimis: false, motiv: "sms-neimplementat" };
  }

  const admin = createAdminClient();
  const sender = await getStoreEmailSender(admin, magazin.id);
  const rez = await sendCodCont(r.destinatie ?? destinatieBruta, {
    cod,
    minute: MINUTE_COD,
    numeMagazin: magazin.store_name ?? magazin.business_name ?? "magazin",
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
  scop: "intrare" | "adaugare-contact" = "intrare",
  contId: string | null = null,
): Promise<{ ok: boolean; contId: string | null; motiv: string }> {
  if (!rateLimit(`contVerif:ip:${ip}`, 20, 60_000)) {
    return { ok: false, contId: null, motiv: "rafala" };
  }
  const lim = await consumaLimita(`cont:verif:ip:${ip}`, 40, 3600, 900);
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
      return "Codul nu e bun. Mai incearca o data.";
    case "prea-multe-incercari":
      return "Prea multe incercari gresite pentru codul asta. Cere unul nou.";
    case "fara-cod":
      return "Codul a expirat sau a fost deja folosit. Cere unul nou.";
    case "contact-la-alt-cont":
      return "Contactul asta e deja legat de alt cont.";
    case "rafala":
    case "limita-ip":
      return "Prea multe incercari. Asteapta un minut si reia.";
    default:
      return "Nu am putut verifica codul. Incearca din nou.";
  }
}
