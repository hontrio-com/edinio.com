import type { MenuItem } from "@/lib/pages/menu";
import type { SetDateDemo } from "@/lib/teme/tipuri";

/*
  Datele demo ale temei Saturn (ATV-uri si motociclete, etapa 24 din `docs/editor-magazin/PLAN.md`, lotul 2). Pozele
  generate cu ElevenLabs (manifestul `scripts/teme/imagini/saturn.json`), in `public/teme/saturn/`. Produse fara marca; textele
  si preturile sunt scrise aici. Cheile sunt stabile (din ele se face `external_id`).
*/

const poza = (cale: string) => `/teme/saturn/${cale}.webp`;

export const MENIU_DEMO_SATURN: MenuItem[] = ["ATV-uri", "SSV-uri", "Motociclete", "Scutere", "Căști", "Echipamente"]
  .map((nume, i): MenuItem => ({ id: `demo_raion_${i}`, type: "category", label: nume, target: nume }));

export const DATE_DEMO_SATURN: SetDateDemo = {
  categorii: [
    { nume: "ATV-uri", imagine: poza("categorii/atv"), copii: [] },
    { nume: "SSV-uri", imagine: poza("categorii/ssv"), copii: [] },
    { nume: "Motociclete", imagine: poza("categorii/motociclete"), copii: [] },
    { nume: "Scutere", imagine: poza("categorii/scutere"), copii: [] },
    { nume: "Căști", imagine: poza("categorii/casti"), copii: [] },
    { nume: "Echipamente", imagine: poza("categorii/echipamente"), copii: [] },
    { nume: "Încălțăminte moto", imagine: poza("categorii/incaltaminte"), copii: [] },
    { nume: "Accesorii", imagine: poza("categorii/accesorii"), copii: [] },
  ],
  produse: [
    { cheie: "manusi-moto", nume: "Mănuși moto din textil, cu protecții", categorie: "Echipamente", pret: 249, pretVechi: 299, imagine: poza("produse/manusi-moto"), descriere: "Protecții la încheieturi, compatibile cu ecranul tactil." },
    { cheie: "atv-utilitar-570", nume: "ATV utilitar 570 cc, 4x4, verde camuflaj", categorie: "ATV-uri", pret: 32900, pretVechi: 35900, imagine: poza("produse/atv-utilitar-570"), recomandat: true, descriere: "Tracțiune 4x4 cuplabilă, troliu pregătit și portbagaje față-spate. Omologat pentru drum." },
    { cheie: "atv-sport-450", nume: "ATV sport 450 cc, portocaliu", categorie: "ATV-uri", pret: 27500, imagine: poza("produse/atv-sport-450"), recomandat: true, descriere: "Ușor și agil, cu suspensii reglabile, pentru trasee și dune." },
    { cheie: "ssv-1000", nume: "SSV 1000 cc, 4 locuri, cu cușcă de protecție", categorie: "SSV-uri", pret: 79900, pretVechi: 84900, imagine: poza("produse/ssv-1000"), recomandat: true, descriere: "Patru locuri, cușcă omologată, tracțiune integrală și 80 CP." },
    { cheie: "moto-naked-700", nume: "Motocicletă naked 700 cc, portocaliu-negru", categorie: "Motociclete", pret: 38900, imagine: poza("produse/moto-naked-700"), recomandat: true, descriere: "Motor bicilindru, ABS cu două canale, moduri de condus." },
    { cheie: "scuter-125", nume: "Scuter 125 cc, alb, ABS", categorie: "Scutere", pret: 11900, pretVechi: 12900, imagine: poza("produse/scuter-125"), descriere: "Consum mic, portbagaj sub șa pentru o cască și pornire fără cheie." },
    { cheie: "casca-modulara", nume: "Cască moto modulară, gri mat", categorie: "Căști", pret: 1290, imagine: poza("produse/casca-modulara"), descriere: "Bărbie rabatabilă, viziera solară integrată și interior detașabil." },
    { cheie: "geaca-piele-moto", nume: "Geacă moto din piele cu protecții", categorie: "Echipamente", pret: 1890, pretVechi: 2190, imagine: poza("produse/geaca-piele-moto"), descriere: "Piele de 1,2 mm, protecții la umeri și coate, căptușeală termică." },
    { cheie: "casca-motocross", nume: "Cască motocross, portocaliu-negru", categorie: "Căști", pret: 890, imagine: poza("produse/casca-motocross"), recomandat: true, descriere: "Carcasă ușoară, ventilație generoasă și cozoroc reglabil." },
    { cheie: "topcase-moto", nume: "Topcase moto 45 l, negru", categorie: "Accesorii", pret: 690, imagine: poza("produse/topcase-moto"), descriere: "Încape o cască integrală, cu încuietoare și placă de montaj." },
  ],
  bannere: [{ imagine: poza("poze/hero"), categorie: "ATV-uri" }],
  carduri: [],
  placi: [],
  randuri: [
    { cheie: "noi", titlu: "Modele noi", produse: ["ssv-1000", "atv-utilitar-570", "moto-naked-700", "atv-sport-450", "casca-motocross"] },
    { cheie: "echipamente", titlu: "Echipamente și accesorii", produse: ["geaca-piele-moto", "casca-modulara", "manusi-moto", "topcase-moto", "scuter-125"] },
  ],
};
