/*
 * Curierii Edinio care pot duce o comanda About You — O SINGURA SURSA.
 *
 * Erau doua liste care trebuiau sa se tina in pas: `COURIER_FIELDS` din sync.ts
 * (de unde se citeste AWB-ul) si o lista scrisa de mana in
 * `AboutYouCarrierMapping.tsx` (unde comerciantul face maparea). Lipsa unei
 * intrari din a doua nu da NICIO eroare: expedierea cade pe „Mapează curierul la
 * un carrier About You în setări" — un mesaj care trimite omul catre un control
 * care nu exista pe ecran. S-a intamplat de sase ori, si comentariul de avertizare
 * din fiecare fisier n-a fost de ajuns. Acum lista e una.
 *
 * `cod` e codul intern de curier; `camp` e coloana din `orders` care tine AWB-ul.
 *
 * ⚠ ORDINEA CONTEAZA. `shipOrderNow` ia PRIMUL camp nevid, deci un curier nou pus
 * in fata ar fura precedenta unui AWB emis anterior cu altul. Adaugarile merg la
 * FINAL.
 */
export interface CurierAboutYou {
  cod: string;
  eticheta: string;
  camp: string;
}

export const CURIERI_ABOUTYOU: CurierAboutYou[] = [
  { cod: "cargus", eticheta: "Cargus", camp: "cargus_awb_number" },
  { cod: "sameday", eticheta: "Sameday", camp: "sameday_awb_number" },
  { cod: "fan-courier", eticheta: "FAN Courier", camp: "fan_courier_awb_number" },
  { cod: "dpd", eticheta: "DPD", camp: "dpd_awb_number" },
  { cod: "colete", eticheta: "Colete Online", camp: "colete_awb_number" },
  { cod: "woot", eticheta: "Woot", camp: "woot_awb_number" },
  { cod: "gls", eticheta: "GLS", camp: "gls_awb_number" },
  { cod: "pallex", eticheta: "Pall-Ex", camp: "pallex_awb_number" },
  { cod: "ecolet", eticheta: "eColet", camp: "ecolet_awb_number" },
  { cod: "posta", eticheta: "Poșta Română", camp: "posta_awb_number" },
  { cod: "packeta", eticheta: "Packeta", camp: "packeta_packet_id" },
  { cod: "innoship", eticheta: "Innoship", camp: "innoship_awb_number" },
  { cod: "smartship", eticheta: "SmartShip", camp: "smartship_awb_number" },
  { cod: "shipo", eticheta: "Shipo", camp: "shipo_awb_number" },
  { cod: "fedex", eticheta: "FedEx", camp: "fedex_awb_number" },
  { cod: "ups", eticheta: "UPS", camp: "ups_awb_number" },
  { cod: "dhl", eticheta: "DHL Express", camp: "dhl_awb_number" },
];

/** Coloanele de AWB, pentru verificarea de derivă din teste. */
export const CAMPURI_AWB_ABOUTYOU = CURIERI_ABOUTYOU.map((c) => c.camp);

/*
 * `select`-ul lui `shipOrderNow`, ca SIR LITERAL.
 *
 * Construit cu `join()`, PostgREST nu-l mai poate tipiza: are nevoie de un tip
 * literal ca sa deduca forma randului, iar un sir calculat il degradeaza la
 * `string` si toata interogarea devine `ParserError`. Deci literalul rămâne — dar
 * un test verifica ca acopera fiecare coloana din `CURIERI_ABOUTYOU`, ca sa nu mai
 * poata devia in tacere. Ce nu se selecteaza nu ajunge in rand, iar expedierea ar
 * ieși cu „skipped": un succes raportat pentru o comanda ramasa neexpediata.
 */
export const SELECT_AWB_ABOUTYOU =
  /* ⚠ `sameday_return_awb_number` e AWB-ul de RETUR, si e altceva decat cel de tur: e singurul
     curier din lista care are unul azi. Vezi `return_tracking_key` din `shipOrderNow` — fara el
     in selectie, campul iesea mereu `undefined` si rezerva se aplica pe tacute chiar si acolo
     unde exista un document adevarat. */
  "id, tracking_number, cargus_awb_number, sameday_awb_number, sameday_return_awb_number, fan_courier_awb_number, dpd_awb_number, colete_awb_number, woot_awb_number, gls_awb_number, pallex_awb_number, ecolet_awb_number, posta_awb_number, packeta_packet_id, innoship_awb_number, smartship_awb_number, shipo_awb_number, fedex_awb_number, ups_awb_number, dhl_awb_number";
