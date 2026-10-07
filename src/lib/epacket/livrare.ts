import { liniaAdresei, type AdresaLivrare } from "@/lib/orders/adresa";
import type { CurierCuPuncte } from "./client";
import { despartaIdPunct } from "./nomenclator";
import { eComandaDePunct, punctulAltuiCurier } from "@/lib/orders/punctul-altui-curier";

/**
 * Unde merge coletul e-packet al unei comenzi, citit din `shipping_address`.
 *
 * ═══ ⚠ PUNCTUL ALTUI CURIER (masurat in fereastra, 07.10.2026) ═══
 *
 * La livrarea in punct, checkoutul scrie in `address` adresa PUNCTULUI (vezi
 * `strada-lui-nu-se-pierde-la-punct.test.ts`), iar strada cumparatorului, cand a scris-o, in
 * `home_address`. O comanda facuta pentru un FANbox prin Curiera, deschisa in fereastra e-packet,
 * se pregatea ca livrare LA ADRESA, iar adresa era chiar a FANbox-ului: coletul pleca, taxat si
 * fara anulare prin API, la supermarketul cu dulapul, pe numele clientului.
 *
 * e-packet nu poate livra in punctul altui curier (id-urile lor sunt ale retelei lor). Deci:
 *   - punctul e-packet se livreaza in punct;
 *   - punctul altui curier se livreaza ACASA, din `home_address` (`city`/`county` sunt tot ale
 *     formularului, deci ale clientului), iar fereastra spune asta cu litere mari;
 *   - fara `home_address` nu se pune NIMIC in strada: omul o afla de la client.
 */
export type AdresaCuPunct = AdresaLivrare & {
  courier?: string;
  courier_label?: string;
  delivery_type?: string;
  locker_id?: string | number;
  locker_name?: string;
  home_address?: string;
  source?: string;
};

export type LivrareaComenzii =
  /** Livrare obisnuita la adresa: `linie` e strada cu numar, asa cum a scris-o clientul. */
  | { fel: "adresa"; linie: string }
  /** Punctul e-packet ales in checkout. */
  | { fel: "punct"; punct: { curier: CurierCuPuncte; id: string }; nume: string }
  /** Comanda e-packet de punct, dar id-ul nu e al lor (schimbat de mana, sau vechi). */
  | { fel: "punct_nevalid" }
  /** Punctul ALTUI curier: se livreaza acasa, din `linieAcasa` (sir gol = n-a scris-o). */
  | { fel: "punct_strain"; numePunct: string; curierPunct: string; linieAcasa: string };

export function livrareaComenzii(addr: AdresaCuPunct | null | undefined): LivrareaComenzii {
  const a = addr ?? {};
  const curier = (a.courier ?? "").toLowerCase().trim();
  /* ⚠ Si easybox-ul eMAG, care vine fara `delivery_type`, doar cu `locker_id` (`eComandaDePunct`). */
  if (!eComandaDePunct(a)) return { fel: "adresa", linie: liniaAdresei(a) };

  if (curier === "epacket") {
    const punct = despartaIdPunct(a.locker_id);
    if (!punct) return { fel: "punct_nevalid" };
    return { fel: "punct", punct, nume: (a.locker_name ?? "").toString().trim() || `Punctul ${punct.id}` };
  }

  /* Regula comuna tuturor ferestrelor de AWB. Nu poate intoarce `null` aici: punctul exista si
     nu e e-packet. */
  const strain = punctulAltuiCurier(a, (c) => c === "epacket")!;
  return { fel: "punct_strain", numePunct: strain.numePunct, curierPunct: strain.dePe, linieAcasa: strain.linieAcasa };
}
