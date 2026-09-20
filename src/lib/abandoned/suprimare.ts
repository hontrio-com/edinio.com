import { normalizePhone } from "@/lib/utils/phone";

/*
  ═══════════════════════════════════════════════════════════════════════════
  CONTACTELE CARE NU MAI PRIMESC NIMIC
  ═══════════════════════════════════════════════════════════════════════════

  ⚠ REGULA STA INTR-UN SINGUR LOC, si de-aia exista fisierul asta.

  Pana acum, lista de suprimari era citita NUMAI de cron. Trimiterea de mana din
  panou nu o atingea deloc, deci un om care ceruse sa nu mai fie contactat putea
  primi mesaje mai departe - apasate cu mana, din panou. Pe productie plecasera
  deja 34 de emailuri si 21 de SMS-uri catre clienti adevarati, deci gaura nu
  era teoretica.

  Doua cai de trimitere inseamna doua locuri unde se poate uita verificarea.
  Acum e una singura, iar amandoua o cheama.

  ⚠ NU E DOAR DEZABONAREA. Un numar gresit sau o reclamatie de spam inseamna tot
  „nu mai trimite", si tot aici se tin - `motiv` spune care, ca sa poata scrie
  ecranul de ce n-a plecat mesajul, in loc sa taca.
*/

export type MotivSuprimare =
  | "dezabonare"
  | "numar_invalid"
  | "email_respins"
  | "reclamatie_spam"
  | "nu_contacta";

/** Cum se scrie motivul pentru comerciant. */
export const ETICHETA_SUPRIMARE: Record<MotivSuprimare, string> = {
  dezabonare: "Dezabonat",
  numar_invalid: "Numar invalid",
  email_respins: "Email respins",
  reclamatie_spam: "Reclamatie spam",
  nu_contacta: "Nu mai contacta",
};

export interface RandSuprimare {
  email: string | null;
  phone: string | null;
  motiv: string;
}

/** Contactele unui cos, in forma in care se compara. */
export interface ContactCos {
  email?: string | null;
  phone?: string | null;
}

/**
 * Emailul, adus la forma in care se compara.
 *
 * ⚠ Litere mici si fara spatii la capete. Fara asta, „Ion@Mail.ro " ar fi trecut
 * pe langa un „ion@mail.ro" deja dezabonat.
 */
export function cheieEmail(email: string | null | undefined): string | null {
  const e = (email ?? "").trim().toLowerCase();
  return e ? e : null;
}

/**
 * Telefonul, adus la forma in care se compara.
 *
 * ⚠ Prin `normalizePhone`, acelasi lucru care se face si la trimitere: „0722 184
 * 305", „+40722184305" si „0722184305" sunt acelasi om. Comparate ca text brut,
 * dezabonarea salvata intr-o forma n-ar fi prins mesajul trimis catre alta.
 */
export function cheieTelefon(phone: string | null | undefined): string | null {
  const p = (phone ?? "").trim();
  if (!p) return null;
  return normalizePhone(p) || p;
}

/**
 * Cheile dupa care se cauta un contact in lista de suprimari.
 *
 * Se intorc amandoua, fiindca un cos poate avea si email, si telefon: daca
 * ORICARE din ele e suprimat, nu se trimite pe niciunul. Omul a cerut sa nu mai
 * fie contactat, nu „sa nu mai fie contactat pe email".
 */
export function cheileContactului(c: ContactCos): { email: string | null; telefon: string | null } {
  return { email: cheieEmail(c.email), telefon: cheieTelefon(c.phone) };
}

/**
 * Contactul asta e suprimat? Intoarce motivul, sau `null`.
 *
 * Functie pura: primeste randurile deja citite, ca sa poata fi folosita si de
 * cron (care le aduce in bloc, pentru sute de magazine) si de o trimitere
 * singura, si ca sa se poata proba fara baza de date.
 */
export function motivulSuprimarii(randuri: RandSuprimare[], c: ContactCos): string | null {
  const { email, telefon } = cheileContactului(c);
  for (const r of randuri) {
    if (email && cheieEmail(r.email) === email) return r.motiv;
    if (telefon && cheieTelefon(r.phone) === telefon) return r.motiv;
  }
  return null;
}

/** Ce i se scrie comerciantului cand mesajul nu pleaca. */
export function mesajContactSuprimat(motiv: string): string {
  const eticheta = ETICHETA_SUPRIMARE[motiv as MotivSuprimare] ?? "Suprimat";
  if (motiv === "dezabonare") {
    return "Clientul s-a dezabonat de la mesajele magazinului. Nu i se mai poate trimite nimic, "
      + "nici automat, nici de aici.";
  }
  if (motiv === "numar_invalid") return "Numarul clientului a fost respins de operator, deci nu se mai trimite.";
  if (motiv === "email_respins") return "Emailul clientului a fost respins, deci nu se mai trimite.";
  if (motiv === "reclamatie_spam") return "Clientul a raportat mesajele ca spam. Nu i se mai trimite nimic.";
  return `Contactul e marcat „${eticheta}", deci nu i se mai trimit mesaje.`;
}
