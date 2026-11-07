import type { MenuItem } from "@/lib/pages/menu";
import type { SetDateDemo } from "@/lib/teme/tipuri";

/*
  Datele demo ale temei Deneb (ceasuri si bijuterii, etapa 24 din `docs/editor-magazin/PLAN.md`, lotul 5). Pozele
  generate cu ElevenLabs (manifestul `scripts/teme/imagini/deneb.json`), in `public/teme/deneb/`. Produse fara marca; textele
  si preturile sunt scrise aici. Cheile sunt stabile (din ele se face `external_id`).
*/

const poza = (cale: string) => `/teme/deneb/${cale}.webp`;

export const MENIU_DEMO_DENEB: MenuItem[] = ["Ceasuri bărbați", "Ceasuri damă", "Bijuterii", "Ochelari de soare", "Genți", "Parfumuri"]
  .map((nume, i): MenuItem => ({ id: `demo_raion_${i}`, type: "category", label: nume, target: nume }));

export const DATE_DEMO_DENEB: SetDateDemo = {
  categorii: [
    { nume: "Ceasuri bărbați", imagine: poza("categorii/ceasuri-barbati"), copii: [] },
    { nume: "Ceasuri damă", imagine: poza("categorii/ceasuri-dama"), copii: [] },
    { nume: "Bijuterii", imagine: poza("categorii/bijuterii"), copii: [] },
    { nume: "Ochelari de soare", imagine: poza("categorii/ochelari"), copii: [] },
    { nume: "Genți", imagine: poza("categorii/genti"), copii: [] },
    { nume: "Parfumuri", imagine: poza("categorii/parfumuri"), copii: [] },
    { nume: "Brățări", imagine: poza("categorii/bratari"), copii: [] },
    { nume: "Accesorii", imagine: poza("categorii/accesorii"), copii: [] },
  ],
  produse: [
    { cheie: "portofel-piele", nume: "Portofel din piele pentru bărbați, negru", categorie: "Accesorii", pret: 189, pretVechi: 229, imagine: poza("produse/portofel-piele"), descriere: "Piele naturală, opt compartimente pentru carduri și protecție RFID." },
    { cheie: "ceas-cronograf", nume: "Ceas cronograf pentru bărbați, oțel, cadran albastru", categorie: "Ceasuri bărbați", pret: 899, pretVechi: 1099, imagine: poza("produse/ceas-cronograf"), recomandat: true, descriere: "Mecanism quartz, sticlă safir, rezistent la apă 100 m." },
    { cheie: "ceas-auriu-dama", nume: "Ceas pentru damă, brățară milaneză aurie", categorie: "Ceasuri damă", pret: 649, imagine: poza("produse/ceas-auriu-dama"), recomandat: true, descriere: "Carcasă subțire de 32 mm, cadran sidefat." },
    { cheie: "colier-inima", nume: "Colier din argint cu pandantiv inimă", categorie: "Bijuterii", pret: 249, pretVechi: 299, imagine: poza("produse/colier-inima"), recomandat: true, descriere: "Argint 925 placat cu aur roz, lanț reglabil." },
    { cheie: "ochelari-aviator", nume: "Ochelari de soare aviator, lentile polarizate", categorie: "Ochelari de soare", pret: 329, imagine: poza("produse/ochelari-aviator"), descriere: "Ramă metalică aurie, protecție UV400." },
    { cheie: "geanta-crossbody", nume: "Geantă crossbody din piele, coniac", categorie: "Genți", pret: 459, pretVechi: 529, imagine: poza("produse/geanta-crossbody"), descriere: "Baretă reglabilă, închidere magnetică, două buzunare interioare." },
    { cheie: "parfum-oriental", nume: "Apă de parfum orientală, 100 ml", categorie: "Parfumuri", pret: 389, imagine: poza("produse/parfum-oriental"), recomandat: true, descriere: "Note de ambră, vanilie și lemn de santal." },
    { cheie: "bratara-zale", nume: "Brățară cu zale din oțel, argintie", categorie: "Brățări", pret: 179, imagine: poza("produse/bratara-zale"), descriere: "Oțel inoxidabil 316L, închidere cu siguranță." },
    { cheie: "ceas-sport", nume: "Ceas sport digital, negru", categorie: "Ceasuri bărbați", pret: 299, pretVechi: 349, imagine: poza("produse/ceas-sport"), descriere: "Cronometru, alarmă, iluminare și rezistență la apă 200 m." },
    { cheie: "cercei-perle", nume: "Cercei cu perle de cultură", categorie: "Bijuterii", pret: 199, imagine: poza("produse/cercei-perle"), recomandat: true, descriere: "Perle albe de 8 mm pe tijă din argint 925." },
  ],
  bannere: [{ imagine: poza("bannere/colectia"), categorie: "Ceasuri bărbați" }],
  carduri: [{ titlu: "Ochelari de soare", text: "Modele noi, la prețuri avantajoase.", imagine: poza("produse/ochelari-aviator"), categorie: "Ochelari de soare" }, { titlu: "Bijuterii elegante", text: "Argint, aur roz și perle.", imagine: poza("produse/colier-inima"), categorie: "Bijuterii" }],
  placi: [{ titlu: "Ceasuri pentru el", imagine: poza("categorii/ceasuri-barbati"), categorie: "Ceasuri bărbați" }, { titlu: "Ceasuri pentru ea", imagine: poza("categorii/ceasuri-dama"), categorie: "Ceasuri damă" }, { titlu: "Bijuterii", imagine: poza("categorii/bijuterii"), categorie: "Bijuterii" }, { titlu: "Parfumuri", imagine: poza("categorii/parfumuri"), categorie: "Parfumuri" }],
  randuri: [
    { cheie: "noutati", titlu: "Noutăți în colecție", produse: ["ceas-cronograf", "ceas-auriu-dama", "colier-inima", "parfum-oriental", "cercei-perle"] },
    { cheie: "cadouri", titlu: "Idei de cadouri", produse: ["ochelari-aviator", "geanta-crossbody", "bratara-zale", "ceas-sport", "portofel-piele"] },
  ],
};
