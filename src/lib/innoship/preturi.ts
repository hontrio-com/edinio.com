import type { InnoshipConfig, OfertaInnoship } from "./client";

/**
 * Ofertele Innoship → ce vede cumparatorul in checkout.
 *
 * ⚠ PUR: nu atinge reteaua. Aici stau chiar hotararile care se vad pe ecran —
 * care oferte se arata, in ce ordine, si cum se numesc — deci sunt si singurele
 * care se pot proba fara cont.
 */

/** O oferta gata de aratat, cu cheia ei compusa. */
export type OfertaAratata = {
  /** ⚠ Cele TREI parti ale cheii. Vezi `client.ts`. */
  courierId: number;
  serviceId: number;
  optionId: string | null;
  /** Numele curierului real („Cargus"), pentru eticheta. */
  courier: string;
  /** Numele serviciului („Standard"). */
  serviciu: string;
  /** Pretul CU TVA, in lei. */
  pret: number;
  zileLivrare: number | null;
};

/**
 * Pretul care ajunge la cumparator.
 *
 * ⚠ `rateTotalAmount` (cu TVA), nu `rateAmount`. Preturile din checkout-ul
 * nostru sunt toate cu TVA inclus, iar un transport afisat fara ar fi cu ~19% mai
 * mic decat cel incasat — exact clasa de defecte pe care auditul de preturi a
 * inchis-o in 40 de locuri.
 *
 * Cand totalul lipseste, se compune din net + TVA; abia in ultimul rand se ia
 * netul singur, si atunci se stie ca e o aproximatie.
 */
export function pretCuTva(o: OfertaInnoship): number | null {
  const total = Number(o.rateTotalAmount);
  if (Number.isFinite(total) && total > 0) return Math.round(total * 100) / 100;

  const net = Number(o.rateAmount);
  const tva = Number(o.rateVatAmount);
  if (Number.isFinite(net) && net > 0) {
    const suma = net + (Number.isFinite(tva) && tva > 0 ? tva : 0);
    return Math.round(suma * 100) / 100;
  }
  return null;
}

/**
 * Eticheta ofertei, asa cum o citeste cumparatorul.
 *
 * Curierul e informatia care conteaza pentru el („Cargus"), serviciul o
 * lamureste („Standard"). Amandoua lipsa, se cade pe un text neutru — un rand gol
 * in lista de livrare e mai rau decat unul generic.
 */
export function etichetaOferta(o: OfertaInnoship): string {
  const curier = (o.carrier ?? "").trim();
  const serviciu = (o.service ?? "").trim();
  const optiune = (o.optionName ?? "").trim();

  if (curier && serviciu) return `${curier} · ${serviciu}`;
  if (curier && optiune) return `${curier} · ${optiune}`;
  if (curier) return curier;
  if (serviciu) return serviciu;
  return "Livrare prin Innoship";
}

/**
 * Ofertele care se pot arata, filtrate si asezate.
 *
 * ⚠ FILTRUL PE CURIERI NU E O INLESNIRE, E O CONDITIE DE LIZIBILITATE.
 *
 * Innoship agrega ~230 de curieri. Un cont larg poate intoarce zeci de oferte
 * pentru aceeasi comanda, iar un checkout cu douazeci de randuri aproape identice
 * nu se citeste — cumparatorul alege primul sau pleaca. De aia comerciantul isi
 * alege curierii in configurare, iar lista goala inseamna „toti cei pe care ii da
 * contul", nu „niciunul".
 *
 * ⚠ Ordinea e dupa PRET, nu dupa `score`/`priority`. Innoship isi are clasarea lui
 * (dupa pret si performanta, cu ponderi contractuale), dar aia e o recomandare
 * pentru comerciant, nu pentru cumparator — iar checkout-ul nostru sorteaza peste
 * tot dupa pret. Doua reguli de sortare in acelasi ecran ar face lista de
 * neinteles.
 */
export function ofertePosibile(
  rates: OfertaInnoship[],
  config?: Pick<InnoshipConfig, "curieri_permisi">,
): OfertaAratata[] {
  const permisi = new Set((config?.curieri_permisi ?? []).filter((x) => Number.isInteger(x) && x > 0));

  const iesire: OfertaAratata[] = [];
  const vazute = new Set<string>();

  for (const o of rates ?? []) {
    const courierId = Number(o.carrierId);
    const serviceId = Number(o.serviceId);
    const pret = pretCuTva(o);

    /* Fara cele trei parti ale cheii, alegerea nu poate fi dusa pana la emitere. */
    if (!Number.isInteger(courierId) || courierId <= 0) continue;
    if (!Number.isInteger(serviceId) || serviceId <= 0) continue;
    if (pret === null) continue;
    if (permisi.size > 0 && !permisi.has(courierId)) continue;

    const optionId = (o.optionId ?? "").trim() || null;
    /* Aceeasi oferta de doua ori ar aparea de doua ori in checkout. */
    const cheie = `${courierId}::${serviceId}::${optionId ?? ""}`;
    if (vazute.has(cheie)) continue;
    vazute.add(cheie);

    const zile = Number(o.calculatedBusinessDays ?? o.deliveryDays);

    iesire.push({
      courierId,
      serviceId,
      optionId,
      courier: (o.carrier ?? "").trim(),
      serviciu: (o.service ?? o.optionName ?? "").trim(),
      pret,
      zileLivrare: Number.isFinite(zile) && zile > 0 ? Math.floor(zile) : null,
    });
  }

  return iesire.sort((a, b) => a.pret - b.pret);
}

/** Termenul de livrare, pentru randul din checkout. */
export function termenLivrare(o: OfertaAratata): string | undefined {
  if (o.zileLivrare === null) return undefined;
  return o.zileLivrare === 1 ? "1 zi lucratoare" : `${o.zileLivrare} zile lucratoare`;
}
