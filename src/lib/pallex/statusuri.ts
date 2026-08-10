import type { OrderStatus } from "@/lib/orders/status";

/**
 * Statusul unei partide Pall-Ex → statusul comenzii.
 *
 * ═══ ⚠ DE CE DUPA NUME, SI NU DUPA NUMAR ═══
 *
 * La GLS codurile sunt numerice si publicate (Appendix G): `5` inseamna livrat
 * oriunde in lume. La Pall-Ex NU exista nicio lista documentata. Specificatia
 * (OpenAPI 1.0.5) da doar endpointul `/consignment_status_types`, care intoarce
 * perechi `{id, name}`, si doua exemple razlete — `{"id": 12, "name": "In hub"}`
 * si un `status_type_id: 9` pe partida, fara sa spuna ce e 9.
 *
 * Numerele sunt deci ID-uri de RAND intr-un tabel al lor („Nexus status ID", cum
 * le zice specificatia), nu o nomenclatura stabila. Scris pe numere, fisierul
 * asta ar fi mutat comenzi pe baza unor cifre pe care nu le intelege nimeni — si
 * o comanda mutata gresit pe „livrata" se inchide, iese din urmarire si, la un
 * magazin cu facturare automata, produce si factura.
 *
 * Asa ca hotararea se ia dupa NUMELE adus de `/consignment_status_types`, iar
 * numarul se pastreaza pe comanda doar ca sa nu semnalam de doua ori acelasi
 * eveniment.
 *
 * ═══ ⚠ IMPLICITUL E „NU FACE NIMIC" ═══
 *
 * Potrivirea pe cuvinte e o presupunere, nu o certitudine — vocabularul poate fi
 * in romana sau in engleza (exemplul lor, „In hub", e in engleza pe o instalare
 * romaneasca), si se poate schimba fara sa aflam. De aceea:
 *
 *   - un nume nerecunoscut NU misca comanda si NU o scoate din urmarire;
 *   - „livrat" cere in plus sa nu existe nicio negatie in text, fiindca
 *     „nelivrat" si „livrare esuata" contin amandoua cuvantul;
 *   - sfarsiturile proaste (retur, avariat, pierdut) nu inchid comanda: anularea
 *     si rambursarea sunt decizii ale comerciantului.
 *
 * Numele reale se pot vedea oricand in pagina de configurare, care cere lista de
 * la Pall-Ex si arata cum e clasificat fiecare. Asa presupunerea de aici se poate
 * verifica FARA sa se expedieze nimic.
 */

/**
 * Cheia de comparatie: fara diacritice, fara majuscule, fara punctuatie.
 *
 * Se scot DOAR semnele diacritice (`\p{M}`), nu si literele — o clasa mai lata ar
 * manca „ș" cu totul in loc sa o faca „s". Spatiile RAMAN, spre deosebire de
 * `judete.ts`: aici se cauta cuvinte in interiorul unei fraze, iar lipite,
 * „in curs" si „incursiune" ar deveni acelasi lucru.
 */
export function cheieStatus(nume: string | null | undefined): string {
  return (nume ?? "")
    .normalize("NFD")
    .replace(/\p{M}+/gu, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

/**
 * Contine vreunul dintre cuvintele date?
 *
 * ⚠ Cheia se incadreaza cu spatii inainte de cautare, ca sa se poata scrie
 * cuvinte INTREGI acolo unde radacina singura ar prinde prea mult. „ new " e
 * exemplul: fara incadrare, un cuvant scris cu spatiu la inceput nu s-ar fi
 * potrivit niciodata cu un nume format dintr-un singur cuvant („New") — adica ar
 * fi fost o intrare moarta, si nimeni n-ar fi observat.
 */
function are(cheie: string, cuvinte: readonly string[]): boolean {
  const incadrata = ` ${cheie} `;
  return cuvinte.some((c) => incadrata.includes(c));
}

/**
 * ⚠ Cuvintele care RASTOARNA o livrare.
 *
 * „nelivrat", „livrare esuata", „livrare partiala" contin toate radacina
 * „livrat"/„livrare". Fara lista asta, fiecare dintre ele ar fi inchis comanda ca
 * livrata — iar la o comanda cu plata la livrare asta inseamna sa marcam incasati
 * bani care nu s-au incasat.
 *
 * Se verifica INAINTEA oricarei alte potriviri, si opreste doar „livrat": o
 * livrare esuata ramane un eveniment de semnalat, nu unul de ignorat.
 */
const NEGATII = [
  "nelivrat", "ne livrat", "nu s a livrat", "nu a fost livrat",
  "not delivered", "undelivered", "non delivered", "failed", "esuat", "esuata",
  "nereusit", "imposibil", "partial", "incomplet", "incomplete",
  "refuz", "refused", "respins", "rejected", "anulat", "anulata", "cancel",
  "retur", "return", "inapoi",
] as const;

/**
 * Marfa a ajuns la DESTINATAR.
 *
 * ⚠ Se cere ACTORUL, nu radacina, si asta a fost o greseala reala.
 *
 * Prima forma continea „predat" si „receptionat" goale. Intr-o retea hub &
 * spoke, tocmai alea sunt cuvintele evenimentelor din MIJLOCUL drumului:
 * „Predat la hub Bucuresti", „Receptionat in depozit", „Predat soferului",
 * „Descarcat si receptionat". Cum verificarea de livrare se face inaintea celei
 * de retea, toate noua ieseau „livrat" — comanda se inchidea, iesea din urmarire
 * si, la magazinele cu facturare automata, pleca si factura. Pentru o marfa care
 * abia intrase in primul depozit.
 *
 * Contradictia era chiar in fisier: „hub", „depozit", „descarcat" si „la sofer"
 * erau deja in lista de retea, deci autorul se astepta la asemenea nume — dar
 * ele nu ajungeau niciodata pana acolo.
 *
 * Formele cu si fara „a" final sunt amandoua: romana acorda participiul cu
 * subiectul („coletul predat" / „marfa predata").
 */
const LIVRAT = [
  "livrat", "livrata", "delivered",
  "predat destinatarului", "predata destinatarului",
  "predat clientului", "predata clientului",
  "predat catre destinatar", "predata catre destinatar",
  "predat catre client", "predata catre client",
  /* ⚠ Si formele cu prepozitia „la". Lipseau, iar lista de retea revendica
     „predat la …" in bloc: „Predat la destinatar" iesea „in retea" si comanda
     nu se mai inchidea NICIODATA. */
  "predat la destinatar", "predata la destinatar",
  "predat la client", "predata la client",
  "receptionat de destinatar", "receptionata de destinatar",
  "receptionat de client", "receptionata de client",
  "pod semnat",
] as const;

/** Partida e in reteaua Pall-Ex: ridicata, in hub, in distributie. */
const IN_RETEA = [
  "colectat", "colectata", "collected", "ridicat", "ridicata", "picked", "pickup",
  "preluat", "preluata", "expediat", "expediata", "shipped",
  "hub", "depozit", "depot", "tranzit", "transit", "in curs", "in tranzit",
  "sortare", "sorting", "incarcat", "loaded", "descarcat", "unloaded",
  "distributie", "distribution", "out for delivery", "in livrare", "spre livrare",
  "la sofer", "on vehicle", "incercare de livrare", "delivery attempt",
  /*
   * ⚠ Evenimentele din MIJLOCUL drumului, care contin „predat"/„receptionat".
   * Fara ele ar fi ramas „necunoscut" dupa ce radacinile goale au iesit din
   * lista de livrare — adica o partida in miscare care nu misca comanda.
   *
   * ⚠ SI CU DESTINATIA SCRISA, nu cu prepozitia goala. Prima forma avea „predat
   * la", care revendica TOT spatiul „predat la <oricine>" — inclusiv „predat la
   * destinatar". Cum reteaua se verifica DUPA livrare doar pentru numele care n-au
   * intrat in lista de livrare, o livrare scrisa cu „la" iesea „in retea": comanda
   * ramanea „expediata" pentru totdeauna, fara factura si fara sa iasa din
   * urmarire. Prepozitia goala nu spune nimic; destinatia spune tot.
   */
  "predat la hub", "predata la hub", "predat la depozit", "predata la depozit",
  "predat la terminal", "predata la terminal", "predat la agentie", "predata la agentie",
  "predat catre partener", "predata catre partener",
  "predat partenerului", "predata partenerului",
  "predat soferului", "predata soferului",
  "receptionat in", "receptionata in",
  "receptionat la hub", "receptionata la hub",
  "receptionat la depozit", "receptionata la depozit",
  "receptionat la terminal", "receptionata la terminal",
] as const;

/**
 * Datele au intrat, dar marfa e INCA la comerciant.
 *
 * ⚠ NU inseamna „expediat". O comanda mutata pe „expediata" aici ar minti
 * clientul — si, daca comerciantul trimite emailul de expediere, l-ar minti in
 * scris pentru o marfa care n-a plecat din depozit.
 */
const LA_COMERCIANT = [
  "nevalidat", "nevalidata", "unvalidated", "neconfirmat", "draft", "ciorna",
  "creat", "creata", "created", " nou ", " noua ", " new ", "inregistrat",
  "programat", "programata", "scheduled", "planificat", "planificata",
  "pending", "de colectat", "de ridicat", "to be collected",
  "asteptare colectare", "asteptare ridicare", "awaiting collection", "awaiting pickup",
  "borderou", "bordereau", "validat de client", "validated by client",
] as const;

/**
 * Evenimentele care cer o decizie OMENEASCA.
 *
 * Sunt lucrurile pe care altfel le afli dupa trei zile, de la client. Fiecare
 * cere ceva ce noi nu avem voie sa hotaram in locul comerciantului: reexpediere,
 * anulare, despagubire.
 */
const DE_SEMNALAT = [
  "retur", "return", "inapoi la expeditor", "return to sender",
  "refuz", "refused", "respins", "rejected",
  "avariat", "avariata", "deteriorat", "damaged", "distrus", "destroyed",
  "pierdut", "lost", "lipsa", "missing", "furat", "stolen",
  "esuat", "esuata", "failed", "nereusit", "imposibil",
  /* ⚠ Livrarile NEGATE intra si ele: fara randul asta, un „Nelivrat" iesea
     „necunoscut" — comanda nu se misca (corect) si nimeni nu afla (gresit). */
  "nelivrat", "not delivered", "undelivered", "non delivered",
  "adresa gresita", "wrong address", "adresa incompleta",
  "blocat", "blocata", "on hold", "asteptare la destinatar",
  "reprogramat", "rescheduled", "amanat", "delayed", "intarziat",
  "litigiu", "reclamatie", "claim", "discrepanta", "discrepancy",
  "anulat", "anulata", "cancel", "partial", "incomplet", "incomplete",
  "vama", "customs",
] as const;

/** Marfa s-a intors la comerciant. Cel mai important dintre toate evenimentele. */
const RETUR = ["retur", "return to sender", "returnat", "returnata", "inapoi la expeditor"] as const;

/**
 * Sfarsituri care NU inchid comanda, dar dupa care nu mai are rost sa intrebam.
 *
 * Livrarile ies oricum din raza cronului (comanda trece pe `delivered`, iar
 * interogarea sare peste comenzile incheiate). Aici raman cele care lasa comanda
 * „expediata" fiindca decizia e a comerciantului — fara steagul asta, cronul ar
 * intreba de ele pana la sfarsitul lumii.
 */
const SFARSIT_PROST = [
  "retur", "return to sender", "returnat", "returnata",
  "distrus", "destroyed", "pierdut", "lost", "furat", "stolen",
  "anulat", "anulata", "cancelled", "canceled",
] as const;

export type Clasificare = "livrat" | "in_retea" | "la_comerciant" | "problema" | "necunoscut";

/**
 * Ce inseamna, pe scurt, numele unui status.
 *
 * ⚠ CLASIFICAREA SI SEMNALAREA SUNT LUCRURI DIFERITE.
 *
 * Un status poate sa mute comanda SI sa ceara atentia comerciantului in acelasi
 * timp: „incercare de livrare esuata" inseamna si ca marfa e in retea (deci
 * comanda e expediata), si ca cineva trebuie sa sune destinatarul. Prima forma a
 * fisierului le amesteca — orice nume de semnalat iesea „problema", deci o
 * comanda al carei prim eveniment era o incercare esuata nu ajungea NICIODATA pe
 * „expediata". `trebuieSemnalat` e de aceea o functie separata, care se cheama
 * pe langa asta, nu in locul ei.
 *
 * Ordinea verificarilor nu e intamplatoare:
 *   1. sfarsiturile proaste bat orice: un retur nu se mai muta nicaieri;
 *   2. livrarea cere absenta oricarei negatii („nelivrat" contine „livrat");
 *   3. „la comerciant" bate „in retea", fiindca „programat pentru colectare"
 *      contine si „colectare" — si marfa aia inca n-a plecat din depozit;
 *   4. abia la urma, un nume care nu se aseaza nicaieri dar suna a problema.
 */
export function clasificaStatus(nume: string | null | undefined): Clasificare {
  const cheie = cheieStatus(nume);
  if (!cheie) return "necunoscut";

  if (are(cheie, SFARSIT_PROST)) return "problema";
  if (are(cheie, LIVRAT) && !are(cheie, NEGATII)) return "livrat";
  if (are(cheie, LA_COMERCIANT)) return "la_comerciant";
  if (are(cheie, IN_RETEA)) return "in_retea";
  if (are(cheie, DE_SEMNALAT)) return "problema";
  return "necunoscut";
}

/**
 * Statusul comenzii pentru un nume de status, fara sa tina cont de unde venim.
 *
 * `null` = „nu schimba nimic". Acopera doua situatii diferite, si amandoua merita
 * lasate in pace: nume pe care nu le cunoastem, si nume care descriu un sfarsit
 * prost, unde decizia e a comerciantului.
 */
export function statusComandaDinNume(nume: string | null | undefined): OrderStatus | null {
  switch (clasificaStatus(nume)) {
    case "livrat": return "delivered";
    case "la_comerciant": return "processing";
    case "in_retea": return "shipped";
    /*
     * Ramura scrisa explicit, nu lasata sa cada in `null` din intamplare: aici
     * sunt sfarsiturile PROASTE. Ele chiar au un inteles, dar decizia — anulare,
     * rambursare, reexpediere — e a comerciantului. `trebuieSemnalat` il anunta.
     */
    case "problema": return null;
    default: return null;
  }
}

/** Ordinea pe scara comenzii. Ce nu e aici nu se compara. */
const TREAPTA: Record<string, number> = {
  pending: 0,
  confirmed: 1,
  processing: 2,
  shipped: 3,
  delivered: 4,
};

/**
 * Ce status primeste comanda dupa un eveniment Pall-Ex — sau `null`.
 *
 * 1. **Nume nerecunoscut** → nimic.
 * 2. **Comanda incheiata** (`cancelled`, `refunded`) → nu se atinge. Un eveniment
 *    intarziat nu reinvie o comanda anulata sau rambursata.
 * 3. **Nu se coboara.** Statusurile pot sosi in alta ordine decat s-au produs: un
 *    „in hub" venit dupa „livrat" ar trage comanda inapoi.
 */
export function statusUrmator(
  statusCurent: string,
  nume: string | null | undefined,
): OrderStatus | null {
  const tinta = statusComandaDinNume(nume);
  if (!tinta) return null;
  if (statusCurent === "cancelled" || statusCurent === "refunded") return null;

  const acum = TREAPTA[statusCurent];
  const nou = TREAPTA[tinta];
  if (acum === undefined || nou === undefined) return tinta === statusCurent ? null : tinta;
  return nou > acum ? tinta : null;
}

export function trebuieSemnalat(nume: string | null | undefined): boolean {
  const cheie = cheieStatus(nume);
  return cheie !== "" && are(cheie, DE_SEMNALAT);
}

/** Marfa s-a intors la comerciant: vine inapoi, si nu s-a incasat nimic. */
export function esteRetur(nume: string | null | undefined): boolean {
  const cheie = cheieStatus(nume);
  return cheie !== "" && are(cheie, RETUR);
}

/** Partida si-a incheiat drumul: nu mai are rost sa fie intrebata. */
export function eStareFinala(nume: string | null | undefined): boolean {
  const cheie = cheieStatus(nume);
  if (!cheie) return false;
  if (are(cheie, SFARSIT_PROST)) return true;
  return are(cheie, LIVRAT) && !are(cheie, NEGATII);
}

// ─── Memoria de pe comanda ────────────────────────────────────────────────────

/**
 * ⚠ `orders.pallex_status_id` tine DOUA lucruri, si merita spus de ce.
 *
 * Primul e id-ul ultimului status prelucrat, ca sa nu semnalam de doua ori
 * acelasi eveniment. Al doilea e un semn ca am dat deja avertismentul „partida a
 * fost creata dar marfa n-a plecat" — iar acela are nevoie de memorie PROPRIE,
 * fiindca situatia lui e chiar aceea in care statusul NU se schimba: borderoul
 * nevalidat sta la fel zile intregi.
 *
 * Fara semn, cronul ar striga la fiecare doua ore, deci de douasprezece ori pe
 * zi. Un avertisment care se repeta la nesfarsit nu mai e citit de nimeni — nici
 * cand e adevarat.
 *
 * Forma e „<id>" sau „<id>+av". Nu s-a adaugat o coloana pentru ca lucrurile
 * astea doua se sting impreuna: cand statusul se schimba, memoria se rescrie cu
 * id-ul nou si fara semn, adica avertismentul redevine cu putinta daca partida se
 * intoarce cumva in acelasi impas.
 */
export const SEMN_AVERTIZAT = "+av";

export function citesteMemoria(brut: string | null | undefined): { id: string | null; avertizat: boolean } {
  const text = (brut ?? "").trim();
  if (!text) return { id: null, avertizat: false };
  const avertizat = text.endsWith(SEMN_AVERTIZAT);
  const id = (avertizat ? text.slice(0, -SEMN_AVERTIZAT.length) : text).trim();
  return { id: id || null, avertizat };
}

export function scrieMemoria(id: string | null | undefined, avertizat: boolean): string | null {
  const curat = (id ?? "").trim();
  if (!curat && !avertizat) return null;
  return `${curat}${avertizat ? SEMN_AVERTIZAT : ""}`;
}

/**
 * Cum se explica unui om clasificarea unui status.
 *
 * Se foloseste in pagina de configurare, langa lista adevarata adusa de la
 * Pall-Ex: acolo comerciantul vede numele reale ale instalarii lui si ce facem
 * noi cu fiecare. E singurul mod de a verifica presupunerile din fisierul asta
 * FARA sa se expedieze marfa.
 */
export const EXPLICATIE_CLASIFICARE: Record<Clasificare, string> = {
  livrat: "Comanda se trece pe „Livrata”",
  in_retea: "Comanda se trece pe „Expediata”",
  la_comerciant: "Comanda ramane „In procesare” (marfa e inca la tine)",
  problema: "Comanda NU se misca, dar primesti o notificare",
  necunoscut: "Nerecunoscut — comanda nu se misca si nu se semnaleaza nimic",
};
