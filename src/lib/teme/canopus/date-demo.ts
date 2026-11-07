import type { MenuItem } from "@/lib/pages/menu";
import type { SetDateDemo } from "@/lib/teme/tipuri";

/*
  Datele demo ale temei Canopus (tastaturi mecanice si periferice gaming, etapa 24 din `docs/editor-magazin/PLAN.md`, lotul 5). Pozele
  generate cu ElevenLabs (manifestul `scripts/teme/imagini/canopus.json`), in `public/teme/canopus/`. Produse fara marca; textele
  si preturile sunt scrise aici. Cheile sunt stabile (din ele se face `external_id`).
*/

const poza = (cale: string) => `/teme/canopus/${cale}.webp`;

export const MENIU_DEMO_CANOPUS: MenuItem[] = ["Tastaturi", "Mouse", "Switch-uri", "Keycaps", "Căști", "Mousepad-uri"]
  .map((nume, i): MenuItem => ({ id: `demo_raion_${i}`, type: "category", label: nume, target: nume }));

export const DATE_DEMO_CANOPUS: SetDateDemo = {
  categorii: [
    { nume: "Tastaturi", imagine: poza("categorii/tastaturi"), copii: [] },
    { nume: "Mouse", imagine: poza("categorii/mouse"), copii: [] },
    { nume: "Switch-uri", imagine: poza("categorii/switchuri"), copii: [] },
    { nume: "Keycaps", imagine: poza("categorii/keycaps"), copii: [] },
    { nume: "Căști", imagine: poza("categorii/casti"), copii: [] },
    { nume: "Mousepad-uri", imagine: poza("categorii/mousepaduri"), copii: [] },
    { nume: "Cabluri custom", imagine: poza("categorii/cabluri"), copii: [] },
    { nume: "Accesorii", imagine: poza("categorii/accesorii"), copii: [] },
  ],
  produse: [
    { cheie: "keycap-artizan", nume: "Keycap artizanal din rășină, munte", categorie: "Accesorii", pret: 89, imagine: poza("produse/keycap-artizan"), descriere: "Turnat manual, profil OEM, pentru tasta Esc." },
    { cheie: "tastatura-75", nume: "Tastatură mecanică 75%, hot-swap, albă", categorie: "Tastaturi", pret: 369, pretVechi: 649, imagine: poza("produse/tastatura-75"), recomandat: true, descriere: "Montaj gasket, switch-uri magnetice, iluminare RGB pe fiecare tastă." },
    { cheie: "tastatura-65", nume: "Tastatură 65% din aluminiu, gri", categorie: "Tastaturi", pret: 549, imagine: poza("produse/tastatura-65"), recomandat: true, descriere: "Carcasă CNC, tri-mode wireless, baterie de 4000 mAh." },
    { cheie: "mouse-ultrausor", nume: "Mouse wireless ultraușor, 55 g", categorie: "Mouse", pret: 299, pretVechi: 349, imagine: poza("produse/mouse-ultrausor"), recomandat: true, descriere: "Senzor de 26000 DPI, polling 4 kHz." },
    { cheie: "switchuri-liniare", nume: "Switch-uri liniare lubrifiate, 70 buc.", categorie: "Switch-uri", pret: 139, imagine: poza("produse/switchuri-liniare"), descriere: "Forță de 45 g, cursă lină, lubrifiate din fabrică." },
    { cheie: "keycaps-pbt", nume: "Set keycaps PBT double-shot, 140 taste", categorie: "Keycaps", pret: 199, pretVechi: 239, imagine: poza("produse/keycaps-pbt"), recomandat: true, descriere: "Profil Cherry, legende care nu se șterg." },
    { cheie: "casti-wireless", nume: "Căști gaming wireless, 2,4 GHz", categorie: "Căști", pret: 449, imagine: poza("produse/casti-wireless"), descriere: "Latență mică, microfon detașabil, 50 de ore de autonomie." },
    { cheie: "mousepad-xxl", nume: "Mousepad XXL 90 x 40 cm, negru", categorie: "Mousepad-uri", pret: 89, imagine: poza("produse/mousepad-xxl"), descriere: "Margini cusute, bază din cauciuc antiderapant." },
    { cheie: "cablu-spiralat", nume: "Cablu USB-C spiralat cu conector aviator", categorie: "Cabluri custom", pret: 129, imagine: poza("produse/cablu-spiralat"), descriere: "Mufă detașabilă, 1,5 m, împletitură textilă." },
    { cheie: "tastatura-tkl", nume: "Tastatură TKL, switch-uri tactile, neagră", categorie: "Tastaturi", pret: 299, pretVechi: 379, imagine: poza("produse/tastatura-tkl"), descriere: "Fără bloc numeric, cablu detașabil, plăcuță din oțel." },
  ],
  bannere: [{ imagine: poza("poze/vitrina-75"), categorie: "Tastaturi" }],
  carduri: [],
  placi: [{ titlu: "Setup alb", imagine: poza("poze/placa-alb"), categorie: "Tastaturi" }, { titlu: "Setup RGB", imagine: poza("poze/placa-rgb"), categorie: "Mouse" }, { titlu: "Construiește-ți tastatura", imagine: poza("poze/placa-custom"), categorie: "Switch-uri" }, { titlu: "Birou minimalist", imagine: poza("poze/placa-birou"), categorie: "Mousepad-uri" }],
  randuri: [
    { cheie: "vandute", titlu: "Cele mai vândute", produse: ["tastatura-75", "mouse-ultrausor", "keycaps-pbt", "tastatura-65", "casti-wireless"] },
    { cheie: "custom", titlu: "Pentru tastatura ta", produse: ["switchuri-liniare", "keycap-artizan", "cablu-spiralat", "mousepad-xxl", "tastatura-tkl"] },
  ],
};

export const VITRINA_DEMO_CANOPUS = [
  { eticheta: "-43%", titlu: "Tastatură 75% hot-swap", text: "Switch-uri magnetice, rapid trigger.", imagine: poza("poze/vitrina-75"), categorie: "Tastaturi" },
  { eticheta: "-24%", titlu: "Seturi de keycaps", text: "PBT double-shot, culori noi.", imagine: poza("poze/vitrina-keycaps"), categorie: "Keycaps" },
  { eticheta: "Nou", titlu: "Mouse de 55 g", text: "Wireless, 4 kHz, fără fir.", imagine: poza("poze/vitrina-mouse"), categorie: "Mouse" },
  { eticheta: "-21%", titlu: "Tastaturi din aluminiu", text: "Carcasă CNC, sunet plin.", imagine: poza("poze/vitrina-aluminiu"), categorie: "Tastaturi" },
  { eticheta: "Hot", titlu: "Switch-uri lubrifiate", text: "Cursă lină din prima zi.", imagine: poza("poze/vitrina-switch"), categorie: "Switch-uri" },
] as const;
