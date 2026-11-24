"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { logError } from "@/lib/error-logger";
import {
  SECRETUL_FURNIZORULUI, SUPORT_GOL, aspectDin, contPublic, curata, dateDin, esteFurnizor, kidZendeskValid,
  regiuneIntercomValida, secretValid,
  type ConturiSuport, type FurnizorSuport, type SuportConfig,
} from "@/lib/suport/config";
import { numeleFurnizorului, scoateIdentificatorii } from "@/lib/suport/furnizori";
import { citesteSuportDinBaza } from "@/lib/suport/server";
import { verificaIdentificatorul } from "@/lib/suport/verifica";

/*
  Actiunile paginilor de chat (Tidio, tawk.to, Intercom, Zendesk).

  ⚠ "use server": FIECARE export de aici e o actiune care se poate chema din browser. Nimic altceva nu se
  exporta (vezi „use server expune fiecare export”). Fiecare incepe cu `requireOwned`.

  ⚠ CITIREA CU CHEIA DE SERVICIU, SCRIEREA CU CLIENTUL OMULUI. Citita cu clientul lui, configurarea vine
  cu secretele cifrate (`enc.v1.…`), iar scrisa inapoi asa ar fi fost cifrata a doua oara. Scrierea trece
  prin vederea `store_settings`, care cripteaza secretele si pe care RLS o margineste la magazinul lui.

  ⚠ VEDEREA NU PAZESTE SECRETELE (masurat la theMarketer, 18.11.2026): coloana se scrie INTREAGA, deci
  fiecare scriere duce secretele citite decriptat; ce lipseste din obiect se pierde. De aceea stergerea
  unui secret e chiar lipsa lui din obiectul scris, iar orice alta scriere porneste de la ce s-a citit.

  ⚠ O CITIRE CAZUTA NU SCRIE NIMIC: tratata ca „nimic salvat”, ar fi sters cheile celorlalti furnizori.
*/

type Supa = Awaited<ReturnType<typeof createClient>>;

async function requireOwned(businessId: string): Promise<{ supabase: Supa } | { error: string }> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: "Neautorizat" };
  const { data: biz } = await supabase
    .from("businesses").select("id").eq("id", businessId).eq("user_id", user.id).maybeSingle();
  if (!biz) return { error: "Magazin negăsit" };
  return { supabase };
}

async function citesteSigur(businessId: string): Promise<{ config: SuportConfig | null } | { error: string }> {
  try {
    return { config: await citesteSuportDinBaza(businessId) };
  } catch (e) {
    await logError({ action: "suport.citire", message: e instanceof Error ? e.message : "citire", businessId, severity: "error" });
    return { error: "Setările chatului nu s-au putut citi. Încearcă din nou." };
  }
}

async function scrie(supabase: Supa, businessId: string, next: SuportConfig): Promise<boolean> {
  const { data } = await supabase.from("store_settings").select("business_id").eq("business_id", businessId).maybeSingle();
  const { error } = data?.business_id
    ? await supabase.from("store_settings").update({ suport_config: next as never }).eq("business_id", businessId)
    : await supabase.from("store_settings").insert({ business_id: businessId, suport_config: next as never });
  if (error) await logError({ action: "suport.scriere", message: error.message, businessId, severity: "error" });
  return !error;
}

function revalideaza() {
  for (const f of ["tidio", "tawkto", "intercom", "zendesk"]) revalidatePath(`/dashboard/features/${f}`);
  revalidatePath("/dashboard/features");
}

export type CampSuport = "cheie" | "secret" | "kid" | null;
export type RaspunsSuport =
  | { ok: true; avertisment?: string }
  | { error: string; camp?: CampSuport };

export type IntrareSuport = {
  /** Ce a lipit omul la identificator: valoarea, codul de instalare intreg sau o adresa. Gol = ramane cel salvat. */
  lipit?: string;
  /** Intercom: regiunea spatiului. */
  regiune?: string;
  /** Zendesk: id-ul cheii de semnare (nu e secret). */
  kid?: string;
  /** Secretul de semnare. Gol = ramane cel salvat. */
  secret?: string;
  /** Comutatorul din antet: chatul acestui furnizor e in magazin. */
  activ?: boolean;
  aspect?: unknown;
  date?: unknown;
};

/** Felia de `conturi` a furnizorului, din ce a lipit omul peste ce era salvat. */
function contulCerut(
  furnizor: FurnizorSuport,
  intrare: IntrareSuport,
  salvat: ConturiSuport,
): { conturi: ConturiSuport } | { error: string; camp: CampSuport } {
  const conturi: ConturiSuport = { ...salvat };
  const lipit = curata(intrare.lipit);

  if (lipit) {
    const gasit = scoateIdentificatorii(furnizor, lipit);
    if (!gasit) {
      return {
        error: `Nu am găsit un identificator ${numeleFurnizorului(furnizor)} în ce ai lipit. Lipește valoarea sau tot codul de instalare.`,
        camp: "cheie",
      };
    }
    if (furnizor === "tidio") conturi.tidio = gasit as ConturiSuport["tidio"];
    else if (furnizor === "tawkto") conturi.tawkto = gasit as ConturiSuport["tawkto"];
    else if (furnizor === "intercom") conturi.intercom = { ...(salvat.intercom ?? {}), ...(gasit as ConturiSuport["intercom"]) };
    else conturi.zendesk = { ...(salvat.zendesk ?? {}), ...(gasit as ConturiSuport["zendesk"]) };
  }

  if (furnizor === "intercom" && intrare.regiune !== undefined) {
    if (!regiuneIntercomValida(intrare.regiune)) return { error: "Alege regiunea spațiului Intercom.", camp: "cheie" };
    conturi.intercom = { ...(conturi.intercom ?? {}), regiune: intrare.regiune };
  }

  if (furnizor === "zendesk" && intrare.kid !== undefined) {
    const kid = curata(intrare.kid);
    if (kid && !kidZendeskValid(kid)) return { error: "Key ID-ul Zendesk are caractere nepermise. Copiază-l din nou.", camp: "kid" };
    conturi.zendesk = { ...(conturi.zendesk ?? {}), kid };
  }

  if (!contPublic(furnizor, conturi)) {
    return { error: `Completează identificatorul ${numeleFurnizorului(furnizor)}.`, camp: "cheie" };
  }
  return { conturi };
}

/**
 * „Verifică”: scoate identificatorul din ce a lipit omul si intreaba furnizorul daca exista. Nu salveaza nimic.
 */
export async function verificaSuport(
  businessId: string,
  furnizor: string,
  intrare: Pick<IntrareSuport, "lipit" | "regiune">,
): Promise<RaspunsSuport> {
  const owned = await requireOwned(businessId);
  if ("error" in owned) return owned;
  if (!esteFurnizor(furnizor)) return { error: "Furnizor necunoscut." };
  const citit = await citesteSigur(businessId);
  if ("error" in citit) return citit;

  const cerut = contulCerut(furnizor, intrare, citit.config?.conturi ?? {});
  if ("error" in cerut) return cerut;
  const cont = contPublic(furnizor, cerut.conturi);
  if (!cont) return { error: `Completează identificatorul ${numeleFurnizorului(furnizor)}.`, camp: "cheie" };

  const r = await verificaIdentificatorul(cont);
  if (r.stare === "buna") return { ok: true };
  if (r.stare === "gresita") return { error: r.mesaj, camp: "cheie" };
  return { ok: true, avertisment: r.mesaj };
}

/**
 * Salveaza pagina unui furnizor: identificatorul, secretul de semnare, cum apare butonul, ce date pleaca si
 * daca chatul lui e in magazin. Un identificator pe care furnizorul nu il cunoaste nu se salveaza.
 *
 * ⚠ UN SINGUR FURNIZOR PORNIT. `activ: true` il face pe acesta cel ales; cel de dinainte ramane
 * configurat, dar iese din magazin. `activ: false` opreste chatul numai daca acesta era cel ales.
 */
export async function salveazaSuport(businessId: string, furnizor: string, intrare: IntrareSuport): Promise<RaspunsSuport> {
  const owned = await requireOwned(businessId);
  if ("error" in owned) return owned;
  if (!esteFurnizor(furnizor)) return { error: "Furnizor necunoscut." };
  const citit = await citesteSigur(businessId);
  if ("error" in citit) return citit;
  const salvata: SuportConfig = citit.config ?? { ...SUPORT_GOL, conturi: {} };

  const cerut = contulCerut(furnizor, intrare, salvata.conturi);
  if ("error" in cerut) return cerut;
  const cont = contPublic(furnizor, cerut.conturi);
  if (!cont) return { error: `Completează identificatorul ${numeleFurnizorului(furnizor)}.`, camp: "cheie" };

  /* Secretul: scris acum, sau cel salvat. Tidio nu are. */
  const campSecret = SECRETUL_FURNIZORULUI[furnizor];
  const secretNou = curata(intrare.secret);
  if (secretNou && !campSecret) return { error: `${numeleFurnizorului(furnizor)} nu folosește o cheie secretă.`, camp: "secret" };
  if (secretNou && !secretValid(secretNou)) return { error: "Cheia secretă pare incompletă. Copiaz-o din nou, fără spații.", camp: "secret" };
  const secret = secretNou || (campSecret ? curata(salvata[campSecret]) : "");

  const aspect = intrare.aspect === undefined ? salvata.aspect : aspectDin(intrare.aspect);
  const date = intrare.date === undefined ? salvata.date : dateDin(intrare.date);

  /* Identitatea clientului nu se poate porni fara ce o semneaza: comutatorul ar promite ce nu se intampla. */
  if (date.identitate && campSecret) {
    if (!secret) return { error: "Ca să trimiți numele și emailul clientului, pune întâi cheia secretă de semnare.", camp: "secret" };
    if (furnizor === "zendesk" && !kidZendeskValid(cerut.conturi.zendesk?.kid)) {
      return { error: "Ca să trimiți numele și emailul clientului, pune și Key ID-ul cheii de semnare.", camp: "kid" };
    }
  }

  /* Intrebat numai cand identificatorul s-a schimbat sau n-a fost verificat niciodata: o salvare de comutator
     nu are de ce sa astepte un furnizor. */
  const acelasiCont = JSON.stringify(contPublic(furnizor, salvata.conturi)) === JSON.stringify(cont);
  let avertisment: string | undefined;
  let verificatLa = salvata.verificat_la?.[furnizor];
  if (!acelasiCont || !verificatLa) {
    const r = await verificaIdentificatorul(cont);
    if (r.stare === "gresita") return { error: r.mesaj, camp: "cheie" };
    if (r.stare === "buna") verificatLa = new Date().toISOString();
    else { avertisment = r.mesaj; verificatLa = undefined; }
  }

  const vreaActiv = intrare.activ === undefined ? (salvata.activ && salvata.furnizor === furnizor) : intrare.activ === true;
  const alesAltul = salvata.furnizor !== null && salvata.furnizor !== furnizor;
  const next: SuportConfig = {
    ...salvata,
    conturi: cerut.conturi,
    aspect,
    date,
    /* Pornit aici: acesta devine cel ales. Oprit aici: chatul iese numai daca acesta era cel ales. */
    furnizor: vreaActiv ? furnizor : salvata.furnizor,
    activ: vreaActiv ? true : (alesAltul ? salvata.activ : false),
    verificat_la: { ...(salvata.verificat_la ?? {}) },
  };
  if (verificatLa) next.verificat_la![furnizor] = verificatLa;
  else delete next.verificat_la![furnizor];
  if (campSecret) {
    if (secret) next[campSecret] = secret;
    else delete next[campSecret];
  }

  if (!(await scrie(owned.supabase, businessId, next))) return { error: "Eroare la salvare. Încearcă din nou." };
  revalideaza();
  return avertisment ? { ok: true, avertisment } : { ok: true };
}

/**
 * Deconecteaza un furnizor: ii sterge identificatorul si secretul. Daca era cel pornit, chatul iese din
 * magazin. Ceilalti furnizori raman cum erau.
 */
export async function deconecteazaSuport(businessId: string, furnizor: string): Promise<RaspunsSuport> {
  const owned = await requireOwned(businessId);
  if ("error" in owned) return owned;
  if (!esteFurnizor(furnizor)) return { error: "Furnizor necunoscut." };
  const citit = await citesteSigur(businessId);
  if ("error" in citit) return citit;
  const salvata = citit.config;
  if (!salvata) return { ok: true };

  const conturi: ConturiSuport = { ...salvata.conturi };
  delete conturi[furnizor];
  const eraAles = salvata.furnizor === furnizor;
  const next: SuportConfig = {
    ...salvata,
    conturi,
    furnizor: eraAles ? null : salvata.furnizor,
    activ: eraAles ? false : salvata.activ,
    verificat_la: { ...(salvata.verificat_la ?? {}) },
  };
  delete next.verificat_la![furnizor];
  /* ⚠ Secretul se sterge prin LIPSA lui din obiectul scris: coloana se scrie intreaga. */
  const campSecret = SECRETUL_FURNIZORULUI[furnizor];
  if (campSecret) delete next[campSecret];

  if (!(await scrie(owned.supabase, businessId, next))) return { error: "Eroare la salvare. Încearcă din nou." };
  revalideaza();
  return { ok: true };
}
