import { curierAdresa, type CurierCuPuncte, type EpacketConfig, type LocalitateEpacket, type PunctEpacket } from "./client";
import { despartaAdresa } from "./adresa";
import { coleteEgale, despartaNumele, type DateAwbEpacket } from "./expediere";
import { rezolvaLocalitatea } from "./localitati";
import { codPostalPentru } from "./puncte";
import { livrareaComenzii, type AdresaCuPunct } from "./livrare";

/**
 * Datele unui AWB e-packet in GENERAREA IN MASA, compuse dupa aceleasi reguli ca fereastra.
 *
 * ═══ ⚠ IN LOT NU SE GHICESTE, SI NU SE ASTEAPTA LA NESFARSIT ═══
 *
 * Fereastra arata omului ce nu s-a putut stabili si il lasa sa aleaga. Lotul n-are pe cine
 * intreba, deci o comanda cu localitatea, numarul, numele sau codul postal nelamurite NU se
 * emite: iese cu motivul, ca omul s-o faca din fereastra. Un AWB e-packet e TAXAT si nu se
 * anuleaza prin API: o adresa ghicita ar costa un colet platit trimis aiurea.
 *
 * ⚠ Pregatirea are un TERMEN al ei (`TERMEN_PREGATIRE_MS`), iar fiecare citire unul scurt
 * (`ASTEPTARE_LOT_MS`): bugetul lotului (`bulk-orders.actions.ts`) se socoteste dupa cel mai
 * lung drum al unei comenzi, iar aici drumul e pregatire + emitere. Vezi `DRUM_LOT_MS`.
 */

/** Termenul unei citiri de pregatire in lot (localitate, puncte). Masurat: sub o secunda. */
export const ASTEPTARE_LOT_MS = 6_000;
/** Dupa atat, nu mai porneste nicio citire noua: comanda iese cu motivul ei. */
export const TERMEN_PREGATIRE_MS = 18_000;
/**
 * Cel mai lung drum al unei comenzi e-packet in lot: pregatirea (ultima citire porneste cel
 * tarziu la `TERMEN_PREGATIRE_MS` si dureaza cel mult `ASTEPTARE_LOT_MS`) plus emiterea
 * (`ASTEPTARE_EMITERE_MS`, 45 s, din `client.ts`). Il citeste `lotul-se-opreste-la-timp.test.ts`.
 */
export const ASTEPTARE_DRUM_LOT_MS = 69_000;

export type ComandaLot = {
  customer_name: string | null;
  customer_phone: string | null;
  customer_email: string | null;
  total: number | null;
  shipping_address: unknown;
  items: unknown;
};

export type CautariLot = {
  cauta: (q: string, judet: string, asteptareMs: number) => Promise<LocalitateEpacket[]>;
  puncte: (curier: CurierCuPuncte, localitateId: number, asteptareMs: number) => Promise<PunctEpacket[]>;
  /** Ceasul, injectat ca proba sa poata depasi termenul fara sa astepte. */
  acum?: () => number;
};

type AdresaLot = AdresaCuPunct & {
  city?: string; county?: string; postal_code?: string; postalCode?: string;
};

export async function dateEpacketPentruLot(
  config: EpacketConfig,
  o: ComandaLot,
  greutateKg: number,
  ramburs: number,
  c: CautariLot,
): Promise<{ date: DateAwbEpacket } | { motiv: string }> {
  const ceas = c.acum ?? Date.now;
  const start = ceas();
  const maiAvemTimp = () => ceas() - start < TERMEN_PREGATIRE_MS;
  const addr = (o.shipping_address ?? {}) as AdresaLot;

  const { prenume, nume } = despartaNumele(o.customer_name);
  if (!nume) return { motiv: "numele clientului nu se poate desparti in prenume si nume de cate 3-25 litere: emite din fereastra" };
  const email = (o.customer_email ?? "").trim() || (config.expeditor?.email ?? "").trim();

  const livrare = livrareaComenzii(addr);
  if (livrare.fel === "punct_nevalid") {
    return { motiv: "punctul de ridicare de pe comanda nu e unul e-packet: emite din fereastra" };
  }
  /*
   * ⚠ Punctul ALTUI curier: in lot NU se trimite acasa nici cand exista `home_address`. Clientul a
   * platit livrarea la punct; schimbarea o hotaraste omul, in fereastra, cu avertismentul in fata.
   */
  if (livrare.fel === "punct_strain") {
    return { motiv: `clientul a ales ${livrare.numePunct} (${livrare.curierPunct}), punct in care e-packet nu livreaza: emite din fereastra, la adresa lui` };
  }
  const punct = livrare.fel === "punct" ? livrare.punct : null;

  const dim = config.dimensiuni_implicite ?? { lungime: 30, latime: 20, inaltime: 10 };
  const items = Array.isArray(o.items) ? (o.items as { name?: string }[]) : [];
  const continut = items.map((i) => i?.name).filter(Boolean).join(", ").slice(0, 50) || (config.continut_implicit ?? "");
  const baza = {
    tipColet: "parcel" as const,
    colete: coleteEgale(greutateKg, 1, dim),
    continut,
    ramburs,
    asigurare: config.asigurare ? (Number(o.total) || 0) : null,
  };

  if (punct) {
    return {
      date: {
        ...baza,
        curier: punct.curier,
        tip: "D2L",
        punctId: punct.id,
        destinatar: { prenume, nume, telefon: o.customer_phone ?? "", email },
        deschidere: false,
      },
    };
  }

  const linie = livrare.fel === "adresa" ? livrare.linie : "";
  const adresa = despartaAdresa(linie);
  if (!adresa.strada) return { motiv: "adresa n-are strada: emite din fereastra" };
  if (!adresa.numar) return { motiv: "adresa n-are numar (sau scrie-l FN in fereastra, daca nu are)" };

  /* ⚠ Cel mult DOUA cautari de localitate in lot (de obicei e una). */
  let cautari = 0;
  let loc;
  try {
    loc = await rezolvaLocalitatea({ oras: addr.city, judet: addr.county, strada: linie }, async (q, j) => {
      if (++cautari > 2 || !maiAvemTimp()) throw new Error("localitatea nu s-a potrivit dintr-o cautare");
      return c.cauta(q, j, ASTEPTARE_LOT_MS);
    });
  } catch (e) {
    return { motiv: `localitatea nu s-a putut stabili automat (${(e as Error).message}): alege-o din fereastra` };
  }
  if (loc.fel !== "gasita") return { motiv: `${loc.motiv}: alege localitatea din fereastra` };

  /* Codul postal: al comenzii, apoi din punctele DPD ale localitatii, apoi Sameday. */
  const scris = String(addr.postal_code ?? addr.postalCode ?? "") || adresa.codPostal;
  let cod = codPostalPentru({ dinComanda: scris });
  for (const curier of ["DPD", "SDY"] as const) {
    if (cod || !maiAvemTimp()) break;
    const p = await c.puncte(curier, loc.localitate.id, ASTEPTARE_LOT_MS).catch(() => null);
    cod = curier === "DPD" ? codPostalPentru({ puncteDpd: p }) : codPostalPentru({ alte: p });
  }
  if (!cod) return { motiv: "codul postal nu e pe comanda si nu s-a putut afla din localitate: scrie-l in fereastra" };

  const curier = curierAdresa(config);
  return {
    date: {
      ...baza,
      curier,
      tip: "D2D",
      destinatar: {
        prenume, nume, telefon: o.customer_phone ?? "", email,
        localitateId: loc.localitate.id, codPostal: cod.cod,
        strada: adresa.strada, numar: adresa.numar, bloc: adresa.bloc, scara: adresa.scara,
        etaj: adresa.etaj, apartament: adresa.apartament,
      },
      /* Deschiderea: cum a cerut-o omul, dar numai unde merge (DPD cu ramburs; nu la FAN). */
      deschidere: config.deschidere_colet === true && curier !== "FCR" && (curier !== "DPD" || ramburs > 0),
    },
  };
}
