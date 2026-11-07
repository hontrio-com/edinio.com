import type { MenuItem } from "@/lib/pages/menu";
import type { SetDateDemo } from "@/lib/teme/tipuri";

/*
  Datele demo ale temei Terra (gadgeturi, etapa 24 din `docs/editor-magazin/PLAN.md`). Pozele generate cu ElevenLabs
  (manifestul `scripts/teme/imagini/terra.json`), in `public/teme/terra/`. Produse fara marca; textele si preturile
  sunt scrise aici.
*/

const poza = (cale: string) => `/teme/terra/${cale}.webp`;

export const MENIU_DEMO_TERRA: MenuItem[] = [
  ...["Audio", "Camere și drone", "Telefoane", "Smart home", "Tablete"]
    .map((nume, i): MenuItem => ({ id: `demo_raion_${i}`, type: "category", label: nume, target: nume })),
];

export const DATE_DEMO_TERRA: SetDateDemo = {
  categorii: [
    { nume: "Audio", imagine: poza("categorii/audio"), copii: [] },
    { nume: "Camere și drone", imagine: poza("categorii/camere-si-drone"), copii: [] },
    { nume: "Telefoane", imagine: poza("categorii/telefoane"), copii: [] },
    { nume: "Computere", imagine: poza("categorii/computere"), copii: [] },
    { nume: "Smart home", imagine: poza("categorii/smart-home"), copii: [] },
    { nume: "Tablete", imagine: poza("categorii/tablete"), copii: [] },
    { nume: "Ceasuri inteligente", imagine: poza("categorii/ceasuri-inteligente"), copii: [] },
    { nume: "Accesorii", imagine: poza("categorii/accesorii"), copii: [] },
  ],
  produse: [
    { cheie: "casti-over-ear", nume: "Căști over-ear wireless, anulare zgomot, 40 h", categorie: "Audio", pret: 1099, pretVechi: 1299, imagine: poza("produse/casti-over-ear"), recomandat: true, descriere: "Sunet detaliat, anulare adaptivă a zgomotului și 40 de ore de autonomie." },
    { cheie: "casti-true-wireless", nume: "Căști true wireless cu carcasă de încărcare", categorie: "Audio", pret: 499, imagine: poza("produse/casti-true-wireless"), recomandat: true, descriere: "Se conectează instant, rezistă la transpirație și au 24 de ore cu carcasa." },
    { cheie: "boxa-inteligenta", nume: "Boxă inteligentă cu asistent vocal", categorie: "Audio", pret: 389, imagine: poza("produse/boxa-inteligenta"), descriere: "Controlează luminile, pune muzică și îți spune vremea, doar cu vocea." },
    { cheie: "drona-4k", nume: "Dronă pliabilă cu cameră 4K, 34 min de zbor", categorie: "Camere și drone", pret: 3299, pretVechi: 3699, imagine: poza("produse/drona-4k"), recomandat: true, descriere: "Sub 250 g, gimbal pe trei axe, zbor de 34 de minute și întoarcere automată acasă." },
    { cheie: "camera-wifi", nume: "Cameră de supraveghere Wi-Fi interior, 2K", categorie: "Camere și drone", pret: 199, imagine: poza("produse/camera-wifi"), descriere: "Vedere nocturnă, detecție de mișcare și notificări pe telefon." },
    { cheie: "camera-sport", nume: "Cameră sport 5K, rezistentă la apă", categorie: "Camere și drone", pret: 1599, imagine: poza("produse/camera-sport"), descriere: "Stabilizare video avansată și carcasă rezistentă la apă până la 10 metri." },
    { cheie: "telefon-65", nume: "Telefon 6,5\", 256 GB, cameră 108 MP", categorie: "Telefoane", pret: 2499, imagine: poza("produse/telefon-65"), recomandat: true, descriere: "Ecran fluid de 120 Hz, cameră de 108 MP și încărcare rapidă." },
    { cheie: "telefon-pliabil", nume: "Telefon pliabil, ecran interior 7,6\"", categorie: "Telefoane", pret: 7499, pretVechi: 8199, imagine: poza("produse/telefon-pliabil"), descriere: "Un telefon care se deschide într-o tabletă. Multitasking pe trei ferestre." },
    { cheie: "laptop-13", nume: "Laptop 13\" ultraportabil, 16 GB RAM, 512 GB", categorie: "Computere", pret: 4899, imagine: poza("produse/laptop-13"), descriere: "Sub 1,3 kg, ecran de înaltă rezoluție și autonomie de 15 ore." },
    { cheie: "monitor-27", nume: "Monitor 27\" QHD, 165 Hz, IPS", categorie: "Computere", pret: 1299, pretVechi: 1499, imagine: poza("produse/monitor-27"), descriere: "Rezoluție QHD, 165 Hz și culori precise pentru lucru și jocuri." },
    { cheie: "termostat-inteligent", nume: "Termostat inteligent Wi-Fi", categorie: "Smart home", pret: 899, imagine: poza("produse/termostat-inteligent"), recomandat: true, descriere: "Învață programul casei și reduce consumul la încălzire." },
    { cheie: "sonerie-video", nume: "Sonerie video Wi-Fi cu vedere nocturnă", categorie: "Smart home", pret: 449, imagine: poza("produse/sonerie-video"), descriere: "Vezi și vorbești cu cine sună la ușă, de oriunde, din telefon." },
    { cheie: "bec-inteligent", nume: "Bec inteligent LED E27, alb reglabil", categorie: "Smart home", pret: 69, imagine: poza("produse/bec-inteligent"), descriere: "Alb cald sau rece, intensitate reglabilă și programe din aplicație." },
    { cheie: "tableta-10", nume: "Tabletă 10\", 64 GB, Wi-Fi, argintiu", categorie: "Tablete", pret: 999, imagine: poza("produse/tableta-10"), descriere: "Ecran de 10 inci, difuzoare stereo și baterie pentru o zi întreagă." },
    { cheie: "tableta-stylus", nume: "Tabletă 12\" cu stylus inclus, 256 GB", categorie: "Tablete", pret: 3199, pretVechi: 3599, imagine: poza("produse/tableta-stylus"), descriere: "Stylus cu presiune, pentru notițe și desen, inclus în cutie." },
    { cheie: "smartwatch-sport", nume: "Ceas inteligent sport cu GPS dual", categorie: "Ceasuri inteligente", pret: 1149, imagine: poza("produse/smartwatch-sport"), recomandat: true, descriere: "GPS dual, hărți offline și până la 14 zile de autonomie." },
    { cheie: "casca-vr", nume: "Cască de realitate virtuală, 128 GB", categorie: "Accesorii", pret: 2199, imagine: poza("produse/casca-vr"), descriere: "Realitate virtuală și mixtă, fără cabluri, cu două controllere." },
    { cheie: "incarcator-wireless", nume: "Încărcător wireless rapid, 15 W", categorie: "Accesorii", pret: 129, imagine: poza("produse/incarcator-wireless"), descriere: "Pui telefonul pe el și se încarcă. Compatibil cu orice telefon cu Qi." },
    { cheie: "baterie-externa", nume: "Baterie externă 20000 mAh, USB-C, 65 W", categorie: "Accesorii", pret: 249, imagine: poza("produse/baterie-externa"), descriere: "Încarcă și un laptop. Două porturi USB-C și unul USB-A." },
  ],
  bannere: [{ imagine: poza("poze/mozaic"), categorie: "Audio" }],
  carduri: [],
  placi: [],
  randuri: [
    { cheie: "noutati", titlu: "Noutăți", produse: ["drona-4k", "casti-over-ear", "telefon-65", "termostat-inteligent", "smartwatch-sport"] },
    { cheie: "cele-mai-vandute", titlu: "Cele mai vândute", produse: ["casti-true-wireless", "camera-wifi", "monitor-27", "tableta-stylus", "baterie-externa"] },
  ],
};

/** Placile mozaicului din bannerul temei (cu datele demo): o fotografie mare, o placa colorata, doua deschise. */
export const MOZAIC_DEMO_TERRA = [
  { titlu: "Sunet care te ia cu tine", text: "Căști over-ear cu anulare activă a zgomotului.", imagine: poza("poze/mozaic"), categorie: "Audio", fond: "inchis" },
  { titlu: "Drona 4K", text: "Sub 250 g, 34 de minute de zbor.", imagine: poza("produse/drona-4k"), categorie: "Camere și drone", fond: "principala" },
  { titlu: "Casa inteligentă", text: "Termostate, sonerii și becuri conectate.", imagine: poza("produse/termostat-inteligent"), categorie: "Smart home", fond: "deschis" },
  { titlu: "Realitate virtuală", text: "Până la 20% reducere.", imagine: poza("produse/casca-vr"), categorie: "Accesorii", fond: "deschis" },
] as const;
