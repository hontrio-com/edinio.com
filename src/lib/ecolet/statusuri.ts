import type { OrderStatus } from "@/lib/orders/status";

/**
 * Statusul unei expedieri eColet → statusul comenzii.
 *
 * ═══ ⚠ CE STIM SI CE NU ═══
 *
 * Specificatia da forma („name": „new", „real_name": „Shipment data received"),
 * dar NU publica lista valorilor. `name` arata a cheie stabila, normalizata de
 * eColet peste toti curierii pe care ii agrega — ceea ce ar fi chiar avantajul
 * unui broker — dar nicaieri nu scrie care sunt.
 *
 * Deci se citeste ca la Pall-Ex: dupa cuvinte, cu implicitul „nu face nimic".
 * Se citesc AMANDOUA campurile, `name` si `real_name`: primul e cheia scurta, al
 * doilea e fraza in engleza, si oricare dintre ele poate purta intelesul.
 *
 * ═══ ⚠ IMPLICITUL E TACEREA ═══
 *
 *   - un status nerecunoscut NU misca comanda si NU o scoate din urmarire;
 *   - „livrat" cere in plus sa nu existe nicio negatie, fiindca „not delivered"
 *     si „delivery failed" contin amandoua cuvantul;
 *   - sfarsiturile proaste (retur, pierdut, refuzat) nu inchid comanda: anularea
 *     si rambursarea sunt decizii ale comerciantului.
 *
 * Vocabularul real al contului se vede in pagina de configurare, care cere
 * catalogul de servicii; pe statusuri insa nu exista niciun endpoint de
 * nomenclator, deci lista de mai jos ramane o presupunere pana la primele
 * expedieri reale. De aia orice nume necunoscut e lasat in pace, nu ghicit.
 */

/**
 * Cheia de comparatie: fara diacritice, fara majuscule, fara punctuatie.
 * Spatiile RAMAN — se cauta cuvinte in interiorul unei fraze.
 */
export function cheieStatus(nume: string | null | undefined): string {
  return (nume ?? "")
    .normalize("NFD")
    .replace(/\p{M}+/gu, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

/** Contine vreunul dintre cuvinte? Cheia se incadreaza cu spatii, pentru cuvinte intregi. */
function are(cheie: string, cuvinte: readonly string[]): boolean {
  const incadrata = ` ${cheie} `;
  return cuvinte.some((c) => incadrata.includes(c));
}

/**
 * ⚠ Cuvintele care RASTOARNA o livrare.
 *
 * „not delivered", „delivery failed", „nelivrat" contin toate radacina. Fara
 * lista asta, fiecare ar fi inchis comanda ca livrata — iar la o comanda cu plata
 * la livrare asta inseamna sa marcam incasati bani care nu s-au incasat.
 */
const NEGATII = [
  "not delivered", "undelivered", "non delivered", "nelivrat",
  "failed", "esuat", "esuata", "unsuccessful", "nereusit",
  "refuz", "refused", "rejected", "respins", "declined",
  "cancel", "anulat", "anulata", "retur", "return",
  "partial", "incomplet", "incomplete",
] as const;

/** Marfa a ajuns la DESTINATAR. Se cere actorul sau un cuvant fara ambiguitate. */
const LIVRAT = [
  "delivered", "livrat", "livrata",
  "predat destinatarului", "predata destinatarului",
  "receptionat de destinatar", "receptionata de destinatar",
  /* ⚠ „ pod " incadrat, nu radacina: „podul" ar fi prins altfel o livrare
     acolo unde nu e niciuna. */
  " pod ", "proof of delivery",
] as const;

/** Expedierea e in reteaua curierului. */
const IN_RETEA = [
  "in transit", "in tranzit", "transit", "tranzit",
  "picked", "pickup", "collected", "colectat", "colectata", "ridicat", "ridicata",
  "preluat", "preluata", "shipped", "expediat", "expediata",
  "hub", "depot", "depozit", "warehouse", "sorting", "sortare",
  "out for delivery", "in curs de livrare", "spre livrare", "in livrare",
  "loaded", "incarcat", "unloaded", "descarcat",
  "delivery attempt", "incercare de livrare",
  /* ⚠ „courier" singur a fost scos: e prea larg („courier notified",
     „courier assigned") si ar fi mutat comanda pe „expediata" pentru
     evenimente care nu inseamna ca marfa a plecat. Necunoscut e mai bine. */
  "in delivery",
] as const;

/**
 * Datele au intrat, dar marfa e INCA la comerciant.
 *
 * ⚠ „new" e chiar exemplul din specificatie („Shipment data received"), si e
 * exact starea asta: eColet stie de expediere, curierul n-a luat-o inca. Marcata
 * „expediat", comanda ar minti clientul.
 */
const LA_COMERCIANT = [
  " new ", "shipment data received", "data received", "inregistrat", "registered",
  "creat", "creata", "created", "pending", "awaiting pickup", "asteptare ridicare",
  "scheduled", "programat", "programata", "processing", "in procesare",
  "awb generated", "awb generat", "label", "eticheta",
] as const;

/** Evenimentele care cer o decizie OMENEASCA. */
const DE_SEMNALAT = [
  "retur", "return", "returned", "inapoi la expeditor", "return to sender",
  "refuz", "refused", "rejected", "respins", "declined",
  "damaged", "avariat", "avariata", "deteriorat", "distrus", "destroyed",
  "lost", "pierdut", "missing", "lipsa", "stolen", "furat",
  "failed", "esuat", "esuata", "unsuccessful", "nereusit",
  "not delivered", "undelivered", "nelivrat",
  "wrong address", "adresa gresita", "adresa incompleta",
  "on hold", "blocat", "blocata", "suspended",
  "rescheduled", "reprogramat", "delayed", "intarziat", "amanat",
  "claim", "reclamatie", "litigiu",
  "cancel", "anulat", "anulata",
  "customs", "vama",
] as const;

/** Marfa s-a intors la comerciant. */
const RETUR = ["retur", "returned", "return to sender", "inapoi la expeditor"] as const;

/** Sfarsituri dupa care nu mai are rost sa intrebam. */
const SFARSIT_PROST = [
  "retur", "returned", "return to sender",
  "lost", "pierdut", "destroyed", "distrus", "stolen", "furat",
  "cancelled", "canceled", "anulat", "anulata",
] as const;

export type Clasificare = "livrat" | "in_retea" | "la_comerciant" | "problema" | "necunoscut";

/**
 * Ce inseamna un status.
 *
 * ⚠ CLASIFICAREA SI SEMNALAREA SUNT LUCRURI DIFERITE: un status poate SI sa mute
 * comanda, SI sa ceara atentie („incercare de livrare esuata" inseamna si ca marfa
 * e in retea, si ca cineva trebuie sa sune destinatarul). `trebuieSemnalat` se
 * cheama PE LANGA asta, nu in locul ei.
 *
 * Ordinea: sfarsiturile proaste bat orice; livrarea cere absenta negatiilor;
 * „la comerciant" bate „in retea", fiindca „awaiting pickup" contine si „pickup".
 */
export function clasificaStatus(
  nume: string | null | undefined,
  numeReal?: string | null,
): Clasificare {
  /* Se citesc amandoua campurile: oricare poate purta intelesul. */
  const cheie = [cheieStatus(nume), cheieStatus(numeReal)].filter(Boolean).join(" ");
  if (!cheie) return "necunoscut";

  if (are(cheie, SFARSIT_PROST)) return "problema";
  if (are(cheie, LIVRAT) && !are(cheie, NEGATII)) return "livrat";
  if (are(cheie, LA_COMERCIANT)) return "la_comerciant";
  if (are(cheie, IN_RETEA)) return "in_retea";
  if (are(cheie, DE_SEMNALAT)) return "problema";
  return "necunoscut";
}

export function statusComandaDinNume(
  nume: string | null | undefined,
  numeReal?: string | null,
): OrderStatus | null {
  switch (clasificaStatus(nume, numeReal)) {
    case "livrat": return "delivered";
    case "la_comerciant": return "processing";
    case "in_retea": return "shipped";
    /* Sfarsiturile proaste au inteles, dar decizia e a comerciantului. */
    case "problema": return null;
    default: return null;
  }
}

/** Ordinea pe scara comenzii. Ce nu e aici nu se compara. */
const TREAPTA: Record<string, number> = {
  pending: 0, confirmed: 1, processing: 2, shipped: 3, delivered: 4,
};

/**
 * Ce status primeste comanda — sau `null` daca nu se schimba nimic.
 *
 * Nu se coboara niciodata (evenimentele pot sosi in alta ordine), si o comanda
 * anulata sau rambursata nu se misca de la un curier.
 */
export function statusUrmator(
  statusCurent: string,
  nume: string | null | undefined,
  numeReal?: string | null,
): OrderStatus | null {
  const tinta = statusComandaDinNume(nume, numeReal);
  if (!tinta) return null;
  if (statusCurent === "cancelled" || statusCurent === "refunded") return null;

  const acum = TREAPTA[statusCurent];
  const nou = TREAPTA[tinta];
  if (acum === undefined || nou === undefined) return tinta === statusCurent ? null : tinta;
  return nou > acum ? tinta : null;
}

export function trebuieSemnalat(nume: string | null | undefined, numeReal?: string | null): boolean {
  const cheie = [cheieStatus(nume), cheieStatus(numeReal)].filter(Boolean).join(" ");
  return cheie !== "" && are(cheie, DE_SEMNALAT);
}

export function esteRetur(nume: string | null | undefined, numeReal?: string | null): boolean {
  const cheie = [cheieStatus(nume), cheieStatus(numeReal)].filter(Boolean).join(" ");
  return cheie !== "" && are(cheie, RETUR);
}

/** Expedierea si-a incheiat drumul: nu mai are rost sa fie intrebata. */
export function eStareFinala(nume: string | null | undefined, numeReal?: string | null): boolean {
  const cheie = [cheieStatus(nume), cheieStatus(numeReal)].filter(Boolean).join(" ");
  if (!cheie) return false;
  if (are(cheie, SFARSIT_PROST)) return true;
  return are(cheie, LIVRAT) && !are(cheie, NEGATII);
}

/** Cum se explica unui om clasificarea. Se arata in pagina de configurare. */
export const EXPLICATIE_CLASIFICARE: Record<Clasificare, string> = {
  livrat: "Comanda se trece pe „Livrata”",
  in_retea: "Comanda se trece pe „Expediata”",
  la_comerciant: "Comanda ramane „In procesare” (marfa e inca la tine)",
  problema: "Comanda NU se misca, dar primesti o notificare",
  necunoscut: "Nerecunoscut — comanda nu se misca si nu se semnaleaza nimic",
};
