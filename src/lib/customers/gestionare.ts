/**
 * ═══════════════════════════════════════════════════════════════════════════
 * ADAUGAREA DE MANA SI STERGEREA UNUI CONTACT: CE SE SPUNE  (21.09.2026)
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * Regulile stau in baza (`customer_add_manual`, `customer_delete_contact`),
 * fiindca acolo se naste cheia clientului si acolo trebuie sa stea paza
 * stergerii. Aici sta doar ce CITESTE omul.
 *
 * ⚠ SI NU E UN AMANUNT. Cele patru stari se deosebesc intre ele tocmai prin ce
 * are comerciantul de facut mai departe; topite intr-un „nu s-a putut", l-ar
 * trimite sa caute singur care din patru.
 */

/** Starile pe care le intoarce `customer_add_manual`. */
export const STARI_ADAUGARE = ["adaugat", "fara-contact", "exista", "are-comenzi"] as const;
export type StareAdaugare = (typeof STARI_ADAUGARE)[number];

export function stareAdaugareValida(v: unknown): StareAdaugare | null {
  return (STARI_ADAUGARE as readonly unknown[]).includes(v) ? (v as StareAdaugare) : null;
}

/**
 * ⚠ FIECARE MESAJ SPUNE SI CE URMEAZA, nu doar ce s-a intamplat.
 *
 * ⚠⚠ „exista" si „are-comenzi" NU sunt acelasi lucru, si de-aia au mesaje
 * deosebite. La „exista" omul se uita la un contact pe care il poate sterge sau
 * edita. La „are-comenzi" se uita la un CUMPARATOR, care nu se sterge niciodata
 * si care e oricum deja in lista. Sub acelasi text („clientul exista deja"), al
 * doilea l-ar trimite sa caute in „Contacte importate" un rand care nu e acolo.
 */
export const MESAJUL_ADAUGARII: Record<StareAdaugare, string> = {
  adaugat: "Clientul a fost adăugat.",
  "fara-contact":
    "Pune măcar un telefon sau un email: fără unul dintre ele, clientul nu se poate lega "
    + "de comenzile lui de mai târziu.",
  exista:
    "Ai deja un contact cu telefonul sau emailul ăsta. Caută-l în listă și completează-l acolo, "
    + "ca să nu ajungă același om de două ori.",
  "are-comenzi":
    "Omul ăsta a comandat deja la tine, deci e în listă cu tot istoricul lui. "
    + "Caută-l după telefon sau email ca să-i vezi fișa.",
};

/** A intrat chiar un rand nou? */
export function aIntrat(stare: StareAdaugare): boolean {
  return stare === "adaugat";
}

/**
 * Se poate sterge contactul asta?
 *
 * ⚠⚠ NUMAI UN CONTACT FARA NICIO COMANDA. Un cumparator are in spate facturi,
 * AWB-uri si bani incasati; sters, ar ramane comenzi fara nume si facturi care
 * arata catre nimeni.
 *
 * ⚠ Si nici n-ar folosi la nimic: lista se face din comenzi UNITE cu contactele,
 * deci un cumparator ar aparea mai departe — doar ca fara adresa si fara codul
 * postal din `customers`. Singurul rezultat al stergerii ar fi o pierdere.
 *
 * ⚠ Regula asta e scrisa si in SQL, in chiar instructiunea care sterge. Aici e
 * pentru ECRAN (sa nu se arate un buton care oricum ar fi refuzat); acolo e
 * pentru adevar. Vezi `gestionarea-clientilor.test.ts`.
 */
export function sePoateSterge(client: { orderCount: number }): boolean {
  return client.orderCount === 0;
}

/** De ce nu se poate, cand nu se poate. Se arata pe butonul stins. */
export const DE_CE_NU_SE_STERGE =
  "Clientul ăsta are comenzi. Comenzile, facturile și AWB-urile lui rămân, "
  + "deci nici el nu se șterge.";

/** Ce scrie in fereastra de confirmare a stergerii. */
export function intrebareaStergerii(nume: string): string {
  return (
    `Ștergi contactul „${nume}”?\n\n`
    + "E un contact fără nicio comandă, adus prin import sau adăugat de mână. "
    + "Se șterge doar el, și nu se poate aduce înapoi."
  );
}

/**
 * Ce se trimite la adaugare.
 *
 * ⚠ Numai numele si cele doua feluri de contact sunt cerute pe ecran; restul
 * completeaza adresa si sunt de folos abia la o comanda telefonica.
 */
export interface ClientNou {
  name: string;
  email: string;
  phone: string;
  address: string;
  city: string;
  county: string;
  postcode: string;
}

export const CLIENT_GOL: ClientNou = {
  name: "", email: "", phone: "", address: "", city: "", county: "", postcode: "",
};

/**
 * Se poate apasa butonul?
 *
 * ⚠ Aceeasi conditie ca „fara-contact" din baza, dar pusa INAINTE: un formular
 * care se trimite si se intoarce cu o eroare previzibila il face pe om sa creada
 * ca a gresit altceva. Baza ramane cea care hotaraste — asta e doar politete.
 */
export function sePoateTrimite(c: ClientNou): boolean {
  return c.phone.trim() !== "" || c.email.trim() !== "";
}
