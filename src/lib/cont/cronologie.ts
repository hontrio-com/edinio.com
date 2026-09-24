/**
 * Drumul unei comenzi, ca pasi, pentru cumparator.
 *
 * ⚠⚠ NU EXISTA ISTORIC AL STARILOR. `aplica_tranzitia_comenzii` scrie numai
 * `status`, `payment_status` si `updated_at`, iar `updated_at` il muta orice
 * scriere, inclusiv cronurile de urmarire. Deci singurele momente ADEVARATE sunt
 * plasarea (`created_at`) si, unde exista, emiterea AWB-ului (`*_awb_at`). Restul
 * pasilor se arata ca POZITIE, fara data. O ora pusa pe fiecare pas ar fi
 * inventata.
 *
 * ⚠ `cancelled` si `refunded` nu sunt trepte, sunt capete: se arata ca banda, cu
 * fraza lor, nu ca al saselea pas.
 */

export type StarePas = "facut" | "curent" | "urmeaza";

export type Pas = {
  cheie: "plasata" | "confirmata" | "pregatire" | "expediata" | "livrata";
  eticheta: string;
  stare: StarePas;
  /** ISO. Numai unde avem cu adevarat momentul. */
  la: string | null;
};

export type Cronologie = {
  pasi: Pas[];
  /** Comanda s-a oprit inainte de capat: anulata sau rambursata. */
  capat: { fel: "anulata" | "rambursata"; eticheta: string } | null;
  /** Ce se intampla acum si ce urmeaza, intr-o fraza. */
  fraza: string;
};

const POZITIE: Record<string, number> = {
  pending: 0,
  confirmed: 1,
  processing: 2,
  shipped: 3,
  delivered: 4,
};

export function cronologia(p: {
  stare: string;
  creataLa: string;
  awbEmisLa: string | null;
  /** La ridicarea personala pasii de la capat se numesc altfel. */
  ridicare: boolean;
}): Cronologie {
  const etichete: Record<Pas["cheie"], string> = {
    plasata: "Plasata",
    confirmata: "Confirmata",
    pregatire: "In pregatire",
    expediata: p.ridicare ? "Gata de ridicare" : "Expediata",
    livrata: p.ridicare ? "Ridicata" : "Livrata",
  };
  const chei: Pas["cheie"][] = ["plasata", "confirmata", "pregatire", "expediata", "livrata"];

  const capat =
    p.stare === "cancelled"
      ? { fel: "anulata" as const, eticheta: "Comanda a fost anulata" }
      : p.stare === "refunded"
        ? { fel: "rambursata" as const, eticheta: "Comanda a fost rambursata" }
        : null;

  /*
    ⚠ La o comanda oprita nu stim pana unde ajunsese: starea s-a suprascris.
    Singurul pas sigur e plasarea, deci restul raman „urmeaza", nu „facut".
  */
  const pozitie = capat ? 0 : (POZITIE[p.stare] ?? 0);

  const pasi: Pas[] = chei.map((cheie, i) => ({
    cheie,
    eticheta: etichete[cheie],
    stare: capat
      ? (i === 0 ? "facut" : "urmeaza")
      : i < pozitie ? "facut" : i === pozitie ? (i === chei.length - 1 ? "facut" : "curent") : "urmeaza",
    la: cheie === "plasata" ? p.creataLa : cheie === "expediata" && pozitie >= 3 && !capat ? p.awbEmisLa : null,
  }));

  const fraze: Record<string, string> = {
    pending: "Comanda a fost primita si urmeaza sa fie confirmata.",
    confirmed: "Comanda e confirmata. Magazinul o pregateste.",
    processing: p.ridicare
      ? "Magazinul pregateste comanda pentru ridicare."
      : "Magazinul pregateste coletul.",
    shipped: p.ridicare ? "Comanda este gata de ridicare de la magazin." : "Coletul e la curier, pe drum spre tine.",
    delivered: p.ridicare ? "Ai ridicat comanda." : "Comanda a fost livrata.",
    cancelled: "Comanda nu va mai fi livrata.",
    refunded: "Banii au fost returnati.",
  };

  return { pasi, capat, fraza: fraze[p.stare] ?? fraze.pending };
}
