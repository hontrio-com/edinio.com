import { livrareaEDusaDeMarketplace } from "./origin";

/* ═══════════════════════════════════════════════════════════════════════════
   CAND NU SE EMITE AWB PROPRIU, SI DE CE
   ═══════════════════════════════════════════════════════════════════════════

   ⚠ MODULUL ASTA E PUR SI E FOLOSIT DE AMANDOUA STRATURILE: ecranul comenzii il cheama ca sa
   nu arate butoane care oricum ar fi refuzate, iar `poarta-awb.ts` il cheama pe server ca sa
   refuze CU ADEVARAT. Despartite, ar fi doua adevaruri despre aceeasi comanda — si cel de pe
   ecran ar fi crezut.

   ⚠ SI DE ACEEA NU IMPORTA NIMIC DE PE SERVER. Un `createAdminClient` aici l-ar face
   neimportabil dintr-o componenta de client, iar ecranul ar ramane cu propria lui copie a
   regulii. Citirea din baza sta in `poarta-awb.ts`, singurul care are voie sa fie server.
*/

/**
 * Curierii care emit AWB din platforma, si coloana in care isi scriu numarul.
 *
 * ⚠ HARTA ASTA E CHEIA REGULII DE MAI JOS. Idempotenta din registru contine
 * FURNIZORUL in cheie, deci ea apara doar impotriva unui al doilea AWB la
 * ACELASI curier. Intre curieri nu apara nimic: aceeasi comanda putea primi un
 * AWB la Cargus si, imediat dupa, inca unul la FAN, doua colete reale, doua
 * transporturi platite, si rambursul cerut de doua ori la usa.
 *
 * ⚠ NU se scoate furnizorul din `cheieOperatie` ca „reparatie". Atunci al doilea
 * curier ar ADOPTA referinta primului si ar scrie-o in propria coloana: dintr-un
 * defect vizibil ar iesi unul tacut.
 *
 * `sameday_return_awb_number` lipseste dinadins: e eticheta de RETUR, care
 * traieste legitim alaturi de cea de livrare.
 */
export const COLOANA_AWB = {
  cargus: "cargus_awb_number",
  colete: "colete_awb_number",
  dhl: "dhl_awb_number",
  dpd: "dpd_awb_number",
  ecolet: "ecolet_awb_number",
  fancourier: "fan_courier_awb_number",
  fedex: "fedex_awb_number",
  gls: "gls_awb_number",
  innoship: "innoship_awb_number",
  /*
   * ⚠ `packeta_packet_id`, NU `packeta_external_tracking`.
   *
   * Emiterea (`packeta.actions.ts:417-422`) scrie `packeta_packet_id` si
   * `packeta_barcode`. `packeta_external_tracking` e numarul curierului FINAL si il
   * scrie abia cronul de urmarire, la statusul 6 („handed to carrier"), deci e null
   * din clipa emiterii pana cand coletul pleaca din depozitul lor, si ramane null
   * daca nu ajunge acolo niciodata. Cu el in harta, poarta nu vedea coletul tocmai
   * in fereastra in care al doilea AWB chiar se putea emite, si asta la singurul
   * furnizor care NU are anulare in API.
   */
  packeta: "packeta_packet_id",
  pallex: "pallex_awb_number",
  posta: "posta_awb_number",
  sameday: "sameday_awb_number",
  shipo: "shipo_awb_number",
  smartship: "smartship_awb_number",
  ups: "ups_awb_number",
  woot: "woot_awb_number",
} as const satisfies Record<string, string>;

export type CurierPropriu = keyof typeof COLOANA_AWB;

/**
 * Coloanele MARTOR: expedierea e pornita, dar numarul inca nu exista.
 *
 * ⚠ La eColet emiterea e ASINCRONA: `send-order` scrie doar `ecolet_order_to_send_id`
 * (`ecolet.actions.ts:616`), iar `ecolet_awb_number` vine mai tarziu (`:740`). Intre
 * ele, o comanda cu expediere REALA in curs arata goala pentru o harta care se uita
 * doar la AWB. eColet isi apara singur a doua expediere tot pe `to_send_id`
 * (`ecolet.actions.ts:403-409`); poarta dintre curieri trebuie sa vada acelasi lucru.
 *
 * Se goleste singura cand brokerul refuza (`:684`, cron `:211`) sau la anulare (`:851`),
 * deci nu creeaza nicio fundatura.
 */
export const COLOANE_MARTOR: Partial<Record<CurierPropriu, readonly string[]>> = {
  ecolet: ["ecolet_order_to_send_id"],
};

/** Toate coloanele pe care poarta trebuie sa le ceara, fara dubluri. */
export function coloanelePortii(): string[] {
  const toate = new Set<string>(Object.values(COLOANA_AWB));
  for (const martori of Object.values(COLOANE_MARTOR)) {
    for (const c of martori ?? []) toate.add(c);
  }
  return [...toate];
}

/** Adevarat cand celula chiar poarta ceva: `0` si sirul gol nu sunt colete. */
function areValoare(v: unknown): boolean {
  return v !== null && v !== undefined && String(v).trim() !== "";
}

/**
 * Ce colet viu are comanda la fiecare curier: numarul lui, sau martorul unei
 * expedieri pornite si neconfirmate inca.
 *
 * ⚠ `String(v)`: `ecolet_order_to_send_id` e `number` in baza, iar `awburi` e tipat
 * `string | null`.
 */
export function awburiDinRand(rand: Record<string, unknown>): Partial<Record<CurierPropriu, string | null>> {
  const iesire: Partial<Record<CurierPropriu, string | null>> = {};
  for (const [curier, coloana] of Object.entries(COLOANA_AWB) as [CurierPropriu, string][]) {
    const candidate = [coloana, ...(COLOANE_MARTOR[curier] ?? [])];
    const v = candidate.map((c) => rand[c]).find(areValoare);
    iesire[curier] = v === undefined ? null : String(v);
  }
  return iesire;
}

/**
 * Numarul dupa care CUMPARATORUL isi urmareste coletul.
 *
 * ⚠ ALTA INTREBARE DECAT A PORTII, si de aceea alta harta. Poarta intreaba „exista
 * deja un colet pe comanda asta?" si vrea identitatea care apare PRIMA. Emailul de
 * expediere intreaba „ce numar ii dau omului?" si vrea numarul cu care se cauta la
 * curierul care livreaza. La Packeta cele doua chiar difera: `packeta_packet_id` e
 * al lor, `packeta_external_tracking` e al transportatorului final. Unite intr-o
 * singura harta, cumparatorul ar fi primit id-ul intern al Packetei.
 */
const COLOANA_URMARIRE: Partial<Record<CurierPropriu, string>> = {
  packeta: "packeta_external_tracking",
  ecolet: "ecolet_awb_number",
};

export function numarDeUrmarire(rand: Record<string, unknown>): { curier: string; awb: string } | null {
  for (const curier of Object.keys(COLOANA_AWB) as CurierPropriu[]) {
    const coloane = [COLOANA_URMARIRE[curier], COLOANA_AWB[curier]].filter((c): c is string => !!c);
    const v = coloane.map((c) => rand[c]).find(areValoare);
    if (v !== undefined) return { curier: NUME_CURIER[curier], awb: String(v) };
  }
  return null;
}

/** Numele aratat omului: la refuz, si in notificarea de expediere. */
export const NUME_CURIER: Record<CurierPropriu, string> = {
  cargus: "Cargus", colete: "Colete Online", dhl: "DHL Express", dpd: "DPD",
  ecolet: "eColet", fancourier: "FAN Courier", fedex: "FedEx", gls: "GLS",
  innoship: "Innoship", packeta: "Packeta", pallex: "Pall-Ex", posta: "Poșta Română",
  sameday: "Sameday", shipo: "Shipo", smartship: "SmartShip", ups: "UPS", woot: "Woot",
};

/**
 * Starile in care un colet nu mai are ce cauta la curier.
 *
 * ⚠ `shipped` si `delivered` NU sunt aici: o comanda poate fi reexpediata
 * legitim (colet pierdut, retur reintors), iar un zid acolo ar opri o operatie
 * normala. `cancelled` si `refunded` insa nu au nicio citire buna.
 */
const STARI_FARA_TRANSPORT = new Set(["cancelled", "refunded"]);

export const MOTIV_COMANDA_INCHISA =
  "Comanda este anulată sau restituită, deci nu se mai expediază nimic pe ea. Dacă totuși "
  + "trebuie trimis un colet, schimbă întâi starea comenzii.";

/** Comanda, cat trebuie ca sa se poata hotari. */
export interface ComandaLaPoartaAwb {
  order_source: unknown;
  payment_status: string | null;
  /**
   * ⚠ CAMP OBLIGATORIU, DINADINS. Adaugat pe 09.09.2026, ca `tsc` sa enumere
   * fiecare apelant care nu-l trimitea: altfel poarta ar fi ramas fara el exact
   * acolo unde nimeni nu s-a uitat.
   */
  status: string | null;
  /** Numerele de AWB de pe comanda, pe curier. Vezi `COLOANA_AWB`. */
  awburi: Partial<Record<CurierPropriu, string | null>>;
}

export const MOTIV_DUS_DE_EI =
  "Coletul e dus de curierul contractat de Pepita, cu eticheta lor. Un AWB propriu ar însemna "
  + "a doua etichetă pe același pachet și un al doilea transport plătit, iar clientul ar putea "
  + "fi taxat de două ori. Dacă eticheta lor întârzie, cere-o din panoul Pepita.";

export const MOTIV_PLATA_NECONFIRMATA =
  "Plata acestei comenzi nu e confirmată, iar la ea nu se încasează nimic la livrare: banii "
  + "vin înainte, direct la tine. Verifică încasarea, marchează comanda ca plătită, și atunci "
  + "se poate emite AWB.";

/**
 * Modurile de plata Pepita la care banii TREBUIE sa fie deja veniti.
 *
 * ⚠ `cod` NU E AICI, dinadins: acolo curierul comerciantului chiar incaseaza la usa, deci o
 * comanda neplatita e starea normala, nu un semn de alarma.
 */
const PLATI_IN_AVANS = new Set(["transfer", "creditcard"]);

/**
 * De ce nu se poate emite AWB propriu pe comanda asta, sau `null` daca se poate.
 *
 * ═══ ⚠ DOUA REFUZURI, DIN DOUA MOTIVE CARE NU SE AMESTECA ═══
 *
 * 1. LIVRAREA E A LOR. La Pepita Delivery (orice `delivery_mod` care incepe cu `gls`) coletul
 *    pleaca prin GLS-ul contractat de ei, cu eticheta lor. Rambursul era aparat de mult —
 *    `rambursDeIncasat` intoarce zero — dar ETICHETA nu era, iar generarea in masa doar SAREA
 *    peste randurile astea. Pe ecranul comenzii butonul se putea inca apasa.
 *
 *    ⚠ Aici nu mai exista portita „daca eticheta lor n-a venit, macar sa poata expedia".
 *    A fost cantarita si scoasa: leacul unei etichete care nu vine e la Pepita, nu la al doilea
 *    curier. Un al doilea transport pe acelasi colet nu repara nimic, costa, si poate ajunge la
 *    client de doua ori.
 *
 * 2. BANII NU AU VENIT INCA. La `transfer` si `creditcard`, plata e in avans si nu trece prin
 *    curier: rambursul e zero. Deci un AWB emis cat timp plata nu e confirmata trimite marfa
 *    fara niciun ban si fara nicio incasare la usa.
 *
 *    ⚠ SI NU E UN ZID: comerciantul deschide extrasul, marcheaza comanda ca platita, si poarta
 *    se ridica. Verificarea ramane un gest ANUME, nu ceva sarit din grabă.
 */
export function deCeNuSePoateAwbPropriu(o: ComandaLaPoartaAwb, curier?: CurierPropriu): string | null {
  if (livrareaEDusaDeMarketplace(o.order_source)) return MOTIV_DUS_DE_EI;

  /*
   * ⚠ COMANDA INCHISA. `status` nu intra deloc in poarta pana pe 09.09.2026, deci
   * o comanda anulata sau restituita putea primi in continuare AWB, inclusiv din
   * generarea in masa, care trece peste tot ce i se da.
   */
  if (o.status && STARI_FARA_TRANSPORT.has(o.status)) return MOTIV_COMANDA_INCHISA;

  /*
   * ⚠ COLETUL E DEJA DUS DE ALT CURIER.
   *
   * Registrul apara doar per furnizor (cheia lui il contine), deci al doilea
   * curier trecea nestingherit. In lot se intampla determinist si secvential:
   * comenzi expediate deja primeau inca un colet real, cu rambursul recalculat.
   *
   * `curier` e optional doar ca sa poata intreba si ecranul „se poate, in
   * general?" fara sa numeasca unul; toate actiunile de emitere il trimit.
   */
  for (const [alt, numar] of Object.entries(o.awburi) as [CurierPropriu, string | null | undefined][]) {
    if (alt === curier || !numar) continue;
    /*
     * ⚠ MESAJUL SPUNE SI IESIREA, fiindca „anuleaza-l intai" trimite catre un buton care
     * la doisprezece curieri din saptesprezece poate raspunde doar „nu": pe un colet deja
     * preluat, anularea la curier cade, si coloana ramane pe comanda. Fara randul al
     * doilea, comanda parea fara nicio miscare de facut.
     */
    return `Comanda are deja AWB la ${NUME_CURIER[alt]} (${numar}). Anulează-l întâi: `
      + "două etichete pe același colet înseamnă două transporturi plătite și rambursul cerut de două ori. "
      + "Dacă acel curier refuză anularea, fiindcă a preluat deja coletul, folosește „Detașează AWB” "
      + "din fereastra de editare a comenzii.";
  }

  const src = o.order_source as { marketplace?: unknown; pepita_payment_mode?: unknown } | null;
  if (src?.marketplace !== "pepita") return null;

  const mod = typeof src.pepita_payment_mode === "string" ? src.pepita_payment_mode : null;
  if (!mod || !PLATI_IN_AVANS.has(mod)) return null;

  /*
   * ⚠ SE CITESTE `orders.payment_status`, NU steagul scris de ingest.
   *
   * Ala spune ce ne-au zis EI si nu se mai schimba niciodata — Pepita nu are drum inapoi, deci
   * o plata sosita maine n-ar avea cum sa ne ajunga. Coloana comenzii e singura pe care omul o
   * poate misca dupa ce s-a uitat in extras, deci ea e cea care ridica poarta.
   */
  return o.payment_status === "paid" ? null : MOTIV_PLATA_NECONFIRMATA;
}

/** Se poate emite AWB propriu pe comanda asta? Forma scurta, pentru ecrane. */
export function sePoateAwbPropriu(o: ComandaLaPoartaAwb, curier?: CurierPropriu): boolean {
  return deCeNuSePoateAwbPropriu(o, curier) === null;
}
