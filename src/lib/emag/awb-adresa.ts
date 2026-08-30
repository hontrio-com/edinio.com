/**
 * Adresa care pleacă pe AWB, construită din ce ne-au trimis ei.
 *
 * ═══ ⚠ DE CE EXISTĂ (audit 24.08.2026) ═══
 *
 * Butonul „Emite AWB" ar fi fost refuzat din prima apăsare, din două motive deodată, iar
 * `emag_awb` avea ZERO rânduri — deci nimeni n-ar fi aflat până la prima expediere
 * adevărată de după anunț.
 *
 * **1. `locality_id` lipsea cu totul.** Schema lor:
 * `AWBParticipant.required = ["name","contact","phone1","locality_id","street"]`.
 * Căutat în tot fișierul de acțiuni: `locality_id` apărea numai la citiri, în nicio
 * încărcătură de AWB. Scutirea prin `address_id` e numai pentru partea NOASTRĂ
 * (expeditorul la livrare, destinatarul la retur) — pentru client nu există.
 *
 * ⚠ Iar datele erau acolo: `raw.customer.shipping_locality_id` = „4" și „3" pe cele două
 * comenzi reale. Nu lipseau, doar nu le trimiteam.
 *
 * **2. `zipcode` pleca gol.** `cl.shipping_postal_code ?? ""` — dar `??` nu prinde șirul
 * gol, iar la ei chiar șirul gol vine: `""` pe amândouă comenzile. Schema cere
 * `minLength: 1`, deci câmpul e refuzat. Și `zipcode` NU e în `required`: nedat, e în
 * regulă; dat gol, strică cererea. Reparat doar `locality_id`, AWB-ul tot n-ar fi plecat.
 *
 * ═══ ⚠ DE CE SE VERIFICĂ AICI, ÎN LOC SĂ AFLĂM DE LA EI ═══
 *
 * Un refuz al lor pe o cerere de AWB vine ca text despre un câmp, nu despre ce are omul
 * de făcut. `poateAwbRetur` face deja lucrul ăsta pentru localitate — codul ȘTIA că
 * localitatea contează, și apoi n-o trimitea. Aici se închide cercul: se spune în
 * românește ce lipsește, înainte să se cheltuiască o cerere din cele 3 pe secundă.
 */

import type { EmagParticipantAwb } from "./types";
import { intregDeLaEi } from "./numere";

/** Lungimile minime din schema lor, `AWBParticipant`. */
const MINIM = { name: 3, contact: 1, phone1: 8, street: 3 } as const;

export interface AdresaDeLaEi {
  name?: unknown;
  contact?: unknown;
  phone1?: unknown;
  localityId?: unknown;
  street?: unknown;
  zipcode?: unknown;
}

export type RezultatAdresa =
  | { fel: "gata"; participant: EmagParticipantAwb }
  | { fel: "lipseste"; mesaj: string };

function text(v: unknown): string {
  return typeof v === "string" ? v.trim() : v == null ? "" : String(v).trim();
}

/**
 * Participantul pentru AWB, sau motivul în românește pentru care nu se poate.
 *
 * ⚠ Numele câmpurilor din mesaje sunt cele pe care le vede omul în comandă, nu cele din
 * API-ul lor. „locality_id" nu-i spune nimic; „localitatea" da.
 */
export function participantAwb(a: AdresaDeLaEi): RezultatAdresa {
  const nume = text(a.name);
  const contact = text(a.contact) || nume;
  const telefon = text(a.phone1);
  const strada = text(a.street);
  const localitate = intregDeLaEi(a.localityId);
  const codPostal = text(a.zipcode);

  const lipsuri: string[] = [];
  if (nume.length < MINIM.name) lipsuri.push("numele");
  if (contact.length < MINIM.contact) lipsuri.push("persoana de contact");
  /* ⚠ Numai cifrele se numără: ei trimit și spații și paranteze, iar lungimea din
     schema lor („8–11 digits") e despre cifre. Numărat pe textul brut, un „(021) 123
     4567" ar fi trecut de o verificare pe care el chiar o pică la ei. */
  if (telefon.replace(/\D/g, "").length < MINIM.phone1) lipsuri.push("telefonul");
  if (strada.length < MINIM.street) lipsuri.push("strada");
  if (localitate == null) lipsuri.push("localitatea");

  if (lipsuri.length > 0) {
    return {
      fel: "lipseste",
      mesaj: `Adresa clientului nu are ${lipsuri.join(", ")}. Emite AWB-ul din panoul eMAG.`,
    };
  }

  return {
    fel: "gata",
    participant: {
      name: nume,
      contact,
      phone1: telefon,
      street: strada,
      locality_id: localitate as number,
      /* ⚠ Dat NUMAI când există. `zipcode` nu e obligatoriu, dar are `minLength: 1`:
         trimis gol, e chiar el motivul refuzului. */
      ...(codPostal ? { zipcode: codPostal } : {}),
      legal_entity: 0,
    },
  };
}
