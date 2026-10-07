import { normalizeazaStatus } from "./statusuri";

/**
 * Dezlegarea unui AWB e-packet de pe comanda („Detaseaza AWB"), scoasa aici ca sa poata fi
 * probata: fisierul de actiuni e „use server".
 *
 * ═══ E-PACKET NU ARE ANULARE PRIN API ═══
 *
 * „Anularea unui AWB nu este disponibila prin API: contactati-ne." Deci Edinio nu anuleaza nimic:
 * citeste STAREA, scoate numarul de pe comanda (altfel ea ramane inghetata: nu se mai poate edita
 * si nu primeste alt curier) si spune cinstit ce ramane viu la ei. Aceeasi forma ca DHL si Packeta.
 *
 * ⚠ AWB-ul e-packet a fost TAXAT din credit la emitere. Un colet nepreluat, scos de pe comanda si
 * neanulat la ei, ramane platit. Mesajul trimite omul la ei, cu datele lor de contact.
 */

/** Contactul lor, din subsolul documentatiei (07.10.2026). */
export const CONTACT_EPACKET = "contact@e-packet.ro sau 0371 236 562 (L-V 09:00-17:00)";

export type CitireaStarii =
  /** Nu exista cheie cu care sa se citeasca (integrare deconectata). */
  | { fel: "fara_config" }
  /** `not_found`: AWB-ul nu e in contul cheii de acum. */
  | { fel: "negasit" }
  | { fel: "stare"; status: string; eticheta: string }
  /** Citirea a picat (retea, 5xx, cheie respinsa). */
  | { fel: "eroare"; mesaj: string };

export type HotarareaDezlegarii = {
  /** Coletul nu mai exista la ei (anulat), deci se poate emite altul fara grija. */
  anulatLaCurier: boolean;
  /** Ce i se spune omului despre e-packet. */
  despreCurier: string;
};

/**
 * Ce i se spune omului cand AWB-ul iese de pe comanda. ⚠ Dezlegarea se face MEREU: pastrata
 * numai cand „stim sigur", comanda ar ramane blocata pe un numar pe care nimeni din Edinio nu-l
 * poate anula. Ce se schimba e doar adevarul spus omului.
 */
export function hotarareaDezlegarii(awb: string, c: CitireaStarii): HotarareaDezlegarii {
  const cere = `Cere anularea la e-packet (${CONTACT_EPACKET}), ca sa nu ramana platit si sa nu plece.`;
  switch (c.fel) {
    case "fara_config":
      return {
        anulatLaCurier: false,
        despreCurier: `Integrarea e-packet nu mai are cheie API, deci starea AWB-ului ${awb} nu s-a putut verifica: poate fi inca viu la ei. ${cere}`,
      };
    case "negasit":
      return {
        anulatLaCurier: false,
        /* ⚠ Relativ la CHEIA de acum: o cheie de test nu vede AWB-urile live, si invers. */
        despreCurier: `AWB-ul ${awb} nu apare in contul e-packet al cheii salvate acum (alt cont, sau test fata de live). Daca a fost emis cu alta cheie, verifica-l acolo. ${cere}`,
      };
    case "eroare":
      return {
        anulatLaCurier: false,
        despreCurier: `Starea AWB-ului ${awb} nu s-a putut citi de la e-packet (${c.mesaj}). ${cere}`,
      };
    case "stare": {
      if (normalizeazaStatus(c.status) === "anulat") {
        return { anulatLaCurier: true, despreCurier: `AWB-ul ${awb} e anulat la e-packet.` };
      }
      return {
        anulatLaCurier: false,
        despreCurier: `AWB-ul ${awb} e inca viu la e-packet (${c.eticheta || c.status}), iar API-ul lor nu are anulare. ${cere}`,
      };
    }
  }
}
