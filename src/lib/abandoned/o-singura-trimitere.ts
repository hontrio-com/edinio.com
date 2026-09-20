import type { SupabaseClient } from "@supabase/supabase-js";

import type { Database } from "@/types/database.types";

/*
  ═══════════════════════════════════════════════════════════════════════════
  UN MESAJ DE RECUPERARE PLEACA O SINGURA DATA
  ═══════════════════════════════════════════════════════════════════════════

  ⚠ CE ERA. Trimiterea de mana nu avea nicio cheie: singurele porti din actiune
  erau fereastra de sase luni si cosul gol. Butonul e stins cat tine cererea,
  dar asta nu acopera o reincarcare, doua file deschise, doi oameni din aceeasi
  echipa, sau o cerere care a picat pe retea DUPA ce serverul trimisese deja.
  La SMS, al doilea mesaj se si plateste.

  Automatizarile erau deja aparate, si altfel: cronul ia pasul cu un
  compare-and-swap pe `automation_step` inainte sa trimita. Apararea de aici
  nu o inlocuieste, o dubleaza si o face vizibila intr-un jurnal.

  ⚠ CHEIA NU E „COS + CANAL". Ar fi insemnat un singur email pe cos, vreodata -
  iar comerciantul are voie sa trimita un al doilea mesaj peste o saptamana, cu
  alt text. Cheia e `cos + canal + cheia cererii`: o deschidere a ferestrei =
  o cheie. Aceeasi apasare retrimisa se loveste de randul existent; o apasare
  noua e o intentie noua si trece.

  ⚠ RANDUL SE SCRIE INAINTE DE TRIMITERE, ca revendicarea pasului din cron.
  Scris dupa, doua cereri paralele ar trece amandoua de verificare inainte ca
  vreuna sa apuce sa scrie.
*/

export interface CereRevendicare {
  businessId: string;
  cartId: string;
  canal: "email" | "sms";
  sursa: "manual" | "automatizare";
  cheie: string;
  pas?: number;
}

export type Revendicare =
  /** Nimeni n-a mai trimis cu cheia asta: se poate trimite. */
  | { fel: "liber" }
  /** Randul exista deja. `confirmat` spune daca mesajul chiar a plecat. */
  | { fel: "deja"; confirmat: boolean }
  /** Nu se stie: la indoiala, tacere. */
  | { fel: "eroare" };

/** Codul pe care il da Postgres cand se loveste de un index unic. */
const DUBLURA = "23505";

/**
 * Judecata, scoasa din drumul catre baza ca sa se poata proba singura.
 *
 * ⚠ Orice eroare care NU e dublura inseamna „nu stiu", si „nu stiu" inseamna
 * ca NU se trimite. Tratata ca „liber", o baza cazuta ar deschide exact usa pe
 * care tabela asta o inchide.
 */
export function citesteRaspunsul(cod: string | null | undefined): Revendicare {
  if (!cod) return { fel: "liber" };
  if (cod === DUBLURA) return { fel: "deja", confirmat: false };
  return { fel: "eroare" };
}

/** Ce i se spune comerciantului cand mesajul nu pleaca. */
export function mesajRevendicare(r: Revendicare): string | null {
  if (r.fel === "liber") return null;
  if (r.fel === "eroare") {
    return "Nu am putut verifica daca mesajul a mai fost trimis, deci nu s-a trimis nimic. "
      + "Incearca din nou.";
  }
  return r.confirmat
    ? "Mesajul asta a plecat deja catre client. Ca sa trimiti inca unul, inchide fereastra "
      + "si deschide-o din nou."
    : "Exista deja o incercare de trimitere cu aceeasi apasare, iar noi nu stim sigur daca "
      + "mesajul a plecat sau nu. Uita-te intai in contul de email sau SMS. Daca vrei sa "
      + "trimiti oricum, inchide fereastra si deschide-o din nou.";
}

type Client = SupabaseClient<Database>;

/**
 * Ia dreptul de a trimite mesajul asta. Se cheama INAINTE de trimitere.
 */
export async function revendicaTrimiterea(
  admin: Client, cerere: CereRevendicare,
): Promise<Revendicare> {
  const { error } = await admin.from("recovery_sends").insert({
    business_id: cerere.businessId,
    cart_id: cerere.cartId,
    canal: cerere.canal,
    sursa: cerere.sursa,
    cheie: cerere.cheie,
    pas: cerere.pas ?? null,
  } as never);

  const raspuns = citesteRaspunsul(error?.code);
  if (raspuns.fel !== "deja") return raspuns;

  /*
    ⚠ Randul exista, dar intrebarea comerciantului e alta: A PLECAT mesajul?
    Un rand neconfirmat inseamna „s-a incercat si nu stim", si i se spune asa,
    nu „a plecat deja".
  */
  const { data } = await admin
    .from("recovery_sends").select("confirmat")
    .eq("cart_id", cerere.cartId).eq("canal", cerere.canal).eq("cheie", cerere.cheie)
    .maybeSingle();
  return { fel: "deja", confirmat: (data as { confirmat?: boolean } | null)?.confirmat === true };
}

/** Se cheama DUPA ce mesajul chiar a plecat. */
export async function confirmaTrimiterea(
  admin: Client, cerere: Pick<CereRevendicare, "cartId" | "canal" | "cheie">,
): Promise<void> {
  await admin.from("recovery_sends").update({ confirmat: true } as never)
    .eq("cart_id", cerere.cartId).eq("canal", cerere.canal).eq("cheie", cerere.cheie);
}

/**
 * Cheia mesajului, ca sa poata intra in link.
 *
 * ⚠ `revendicaTrimiterea` nu o intoarce fiindca la prima scriere nu o cere
 * nimeni; linkul se face abia dupa. Se citeste inapoi cu aceeasi cheie de
 * cerere, deci nu poate nimeri alt rand.
 */
export async function idulMesajului(
  admin: Client, cerere: Pick<CereRevendicare, "cartId" | "canal" | "cheie">,
): Promise<string | null> {
  const { data } = await admin
    .from("recovery_sends").select("id")
    .eq("cart_id", cerere.cartId).eq("canal", cerere.canal).eq("cheie", cerere.cheie)
    .maybeSingle();
  return (data as { id?: string } | null)?.id ?? null;
}

/**
 * Linkul din mesaj a fost deschis.
 *
 * ⚠ SE SCRIE O SINGURA DATA, la primul click. Altfel „deschis_la" ar tot urca
 * la fiecare reincarcare a paginii, si fereastra de atribuire s-ar muta dupa
 * el - o comanda de acum trei saptamani ar redeveni „recuperata" fiindca omul
 * a mai deschis o data emailul.
 *
 * ⚠ Cand mesajul nu e cunoscut (linkurile plecate inainte de 21.09.2026 n-au
 * cheia in ele), se insemneaza cel mai recent mesaj trimis catre cosul asta:
 * e singurul care putea purta clickul.
 */
export async function insemneazaDeschiderea(
  admin: Client, cartId: string, mesajId?: string | null,
): Promise<void> {
  const acum = new Date().toISOString();
  if (mesajId) {
    await admin.from("recovery_sends").update({ deschis_la: acum } as never)
      .eq("id", mesajId).eq("cart_id", cartId).is("deschis_la", null);
    return;
  }
  const { data } = await admin
    .from("recovery_sends").select("id")
    .eq("cart_id", cartId).is("deschis_la", null)
    .order("trimis_la", { ascending: false }).limit(1).maybeSingle();
  const id = (data as { id?: string } | null)?.id;
  if (id) {
    await admin.from("recovery_sends").update({ deschis_la: acum } as never).eq("id", id);
  }
}
