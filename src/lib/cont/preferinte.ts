import { createAdminClient } from "@/lib/supabase/admin";

export type Preferinte = {
  primesteEmail: boolean;
  primesteSms: boolean;
  areEmail: boolean;
  areTelefon: boolean;
};

/**
 * Ce mesaje primeste omul de la magazinul asta.
 *
 * ⚠ Adevarul sta in `recovery_optout` si `sms_optout`, tabelele pe care le
 * citesc deja cronul de recuperare si campaniile de SMS. Nu se tine o a doua
 * evidenta in zona de cont: doua copii ale aceleiasi reguli s-ar fi despartit,
 * iar ecranul ar fi spus „dezabonat" unui om care primeste in continuare mesaje.
 */
export async function preferintele(businessId: string, contId: string): Promise<Preferinte> {
  const { data, error } = await createAdminClient().rpc("cont_preferinte", {
    p_business: businessId,
    p_cont: contId,
  });
  if (error) throw error;

  const r = (Array.isArray(data) ? data[0] : data) ?? null;
  return {
    /* ⚠ Presetarea cade pe „nu primeste": daca citirea n-a intors nimic, mai bine
       aratam un comutator stins decat sa promitem ceva ce nu stim. */
    primesteEmail: r?.primeste_email === true,
    primesteSms: r?.primeste_sms === true,
    areEmail: r?.are_email === true,
    areTelefon: r?.are_telefon === true,
  };
}
