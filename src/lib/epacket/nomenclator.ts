import {
  cautaLocalitatiEpacket, puncteEpacket, type CurierCuPuncte, type EpacketConfig, type LocalitateEpacket, type PunctEpacket,
} from "./client";

/**
 * Localitatile si punctele e-packet, cu un cache mic in memoria instantei.
 *
 * ⚠ Nomenclatoarele sunt ale LOR, aceleasi pentru orice cont (masurat: aceleasi id-uri cu orice
 * cheie), deci cheia cache-ului NU cuprinde contul. Si cu 60 de cereri pe minut pe cheie, un lot
 * de 50 de comenzi din aceleasi orase n-are voie sa intrebe de 50 de ori de Cluj-Napoca.
 *
 * ⚠ NU se tin minte nici caderile (aruncarea trece mai departe), nici listele GOALE: o lista goala
 * poate fi o localitate scrisa gresit, dar si un raspuns ciudat, iar tinut minte ar fi ascuns un
 * nomenclator bun ore intregi (lectia „cache-ul care tine minte lipsa").
 */

type Intrare<T> = { valoare: T; expira: number };

const LOCALITATI = new Map<string, Intrare<LocalitateEpacket[]>>();
const PUNCTE = new Map<string, Intrare<PunctEpacket[]>>();
const MAX_INTRARI = 2_000;
const TTL_LOCALITATI_MS = 12 * 3_600_000;
const TTL_PUNCTE_MS = 3_600_000;

function ia<T>(m: Map<string, Intrare<T>>, cheie: string): T | null {
  const i = m.get(cheie);
  if (!i) return null;
  if (i.expira < Date.now()) { m.delete(cheie); return null; }
  return i.valoare;
}

function pune<T>(m: Map<string, Intrare<T>>, cheie: string, valoare: T, ttl: number): void {
  if (m.size >= MAX_INTRARI) {
    const prima = m.keys().next().value;
    if (prima !== undefined) m.delete(prima);
  }
  m.set(cheie, { valoare, expira: Date.now() + ttl });
}

/** O cautare in nomenclatorul de localitati (prima pagina: 1.000 de randuri, destule pentru un nume). */
export async function cautaLocalitati(
  config: Pick<EpacketConfig, "api_key">,
  cauta: string,
  judet: string,
  asteptareMs?: number,
): Promise<LocalitateEpacket[]> {
  const cheie = `${judet.trim().toUpperCase()}|${cauta.trim().toLowerCase()}`;
  const din = ia(LOCALITATI, cheie);
  if (din) return din;
  const { localitati } = await cautaLocalitatiEpacket(config, { cauta, judet }, asteptareMs);
  if (localitati.length > 0) pune(LOCALITATI, cheie, localitati, TTL_LOCALITATI_MS);
  return localitati;
}

/** Punctele unui curier intr-o localitate. */
export async function puncteDinLocalitate(
  config: Pick<EpacketConfig, "api_key">,
  curier: CurierCuPuncte,
  localitateId: number,
  asteptareMs?: number,
): Promise<PunctEpacket[]> {
  const cheie = `${curier}|${localitateId}`;
  const din = ia(PUNCTE, cheie);
  if (din) return din;
  const puncte = await puncteEpacket(config, curier, localitateId, asteptareMs);
  if (puncte.length > 0) pune(PUNCTE, cheie, puncte, TTL_PUNCTE_MS);
  return puncte;
}

// ─── Id-ul punctului din checkout ─────────────────────────────────────────────

/**
 * Id-ul unui punct oferit in checkout: `<curier>:<id lor>` („SDY:79", „FCR:F1000142").
 *
 * ⚠ DE CE RETEAUA STA IN ID. Id-urile punctelor sunt ale fiecarui curier (Sameday „79", DPD
 * „909"), iar reteaua oferita se alege in configurare si se poate SCHIMBA intre comanda si AWB.
 * Fara ea in id, un locker Sameday ar fi plecat la emitere ca id DPD. Asa, comanda isi poarta
 * singura reteaua, fara camp nou pe ea si fara atingerea plasarii comenzii.
 */
export function idPunctCheckout(curier: CurierCuPuncte, id: string): string {
  return `${curier}:${id}`;
}

export function despartaIdPunct(v: unknown): { curier: CurierCuPuncte; id: string } | null {
  const m = /^(DPD|SDY|FCR|CGS):(.+)$/.exec(String(v ?? "").trim());
  return m && m[2].trim() ? { curier: m[1] as CurierCuPuncte, id: m[2].trim() } : null;
}
