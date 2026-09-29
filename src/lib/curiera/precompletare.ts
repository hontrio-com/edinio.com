/**
 * Adresa de ridicare propusa la prima conectare, din ce stie deja Edinio despre magazin.
 *
 * Cerut de el pe 29.09.2026, dupa prima conectare in productie: cheia merge, dar pasul 2
 * pornea gol, desi magazinul isi completase deja numele, telefonul si adresa in Setari.
 *
 * ⚠ De la Curiera NU vine nicio adresa. `test_connection` intoarce doar numele contului si
 * al firmei, iar `list_addresses` a intors o lista GOALA pe contul de test (masurat pe
 * 29.09.2026). Forma unui rand din ea nu e deci cunoscuta, asa ca nu se citeste: o potrivire
 * scrisa pe ghicite ar pune pe AWB adresa altcuiva.
 *
 * Precedenta e cea a casei (`adresaPublica`, aceeasi ca la emiterea GLS, Posta si Pall-Ex):
 * magazinul bate firma, camp cu camp.
 */

import { adresaPublica, type IdentitateBusiness } from "@/lib/storefront/identitate-publica";
import { potrivesteJudet } from "@/lib/ro/judete";
import type { ExpeditorCuriera } from "./client";

export type FirmaPentruRidicare = IdentitateBusiness & {
  store_name?: string | null;
  business_name?: string | null;
};

export type ExpeditorPropus = {
  nume: string;
  telefon: string;
  email: string;
  adresa: string;
  oras: string;
  judet: string;
};

const GOL: ExpeditorPropus = { nume: "", telefon: "", email: "", adresa: "", oras: "", judet: "" };

function curat(v: string | null | undefined): string {
  return (v ?? "").trim();
}

/** A salvat omul macar un camp al adresei de ridicare? Atunci nu se propune nimic peste. */
export function areExpeditorSalvat(expeditor: ExpeditorCuriera | null | undefined): boolean {
  if (!expeditor) return false;
  return Object.values(expeditor).some((v) => typeof v === "string" && v.trim() !== "");
}

/**
 * Campurile de propus, fiecare gol cand magazinul nu-l are. Nimic inventat.
 *
 * ⚠ Judetul se potriveste pe lista formularului (`potrivesteJudet`). Un text care nu seamana
 * cu niciun judet ramane GOL, nu se copiaza: in `<select>` ar aparea ca optiune straina, iar
 * un judet gresit trimite coletul in alta parte.
 */
export function expeditorDinMagazin(firma: FirmaPentruRidicare | null | undefined): ExpeditorPropus {
  if (!firma) return GOL;
  const adresa = adresaPublica(firma);
  return {
    nume: curat(firma.store_name) || curat(firma.business_name),
    telefon: curat(firma.phone),
    email: curat(firma.email),
    adresa: adresa.strada,
    oras: adresa.oras,
    judet: potrivesteJudet(adresa.judet) ?? "",
  };
}

/** Macar un camp propus: altfel nota „am precompletat" ar minti. */
export function aPropusCeva(p: ExpeditorPropus | null | undefined): boolean {
  return !!p && Object.values(p).some((v) => v !== "");
}
