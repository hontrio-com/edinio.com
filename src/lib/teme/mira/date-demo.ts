import type { MenuItem } from "@/lib/pages/menu";
import type { SetDateDemo } from "@/lib/teme/tipuri";

/*
  Datele demo ale temei Mira (mobila si decoratiuni, etapa 24 din `docs/editor-magazin/PLAN.md`, lotul 7). Pozele
  generate cu ElevenLabs (manifestul `scripts/teme/imagini/mira.json`), in `public/teme/mira/`. Produse fara marca; textele
  si preturile sunt scrise aici. Cheile sunt stabile (din ele se face `external_id`).
*/

const poza = (cale: string) => `/teme/mira/${cale}.webp`;

export const MENIU_DEMO_MIRA: MenuItem[] = ["Scaune", "Comode", "Depozitare", "Mese", "Iluminat", "Oglinzi"]
  .map((nume, i): MenuItem => ({ id: `demo_raion_${i}`, type: "category", label: nume, target: nume }));

export const DATE_DEMO_MIRA: SetDateDemo = {
  categorii: [
    { nume: "Scaune", imagine: poza("categorii/scaune"), copii: [] },
    { nume: "Comode", imagine: poza("categorii/comode"), copii: [] },
    { nume: "Depozitare", imagine: poza("categorii/depozitare"), copii: [] },
    { nume: "Mese", imagine: poza("categorii/mese"), copii: [] },
    { nume: "Textile", imagine: poza("categorii/textile"), copii: [] },
    { nume: "Iluminat", imagine: poza("categorii/iluminat"), copii: [] },
    { nume: "Perdele", imagine: poza("produse/perdea-in"), copii: [] },
    { nume: "Oglinzi", imagine: poza("produse/oglinda-arcada"), copii: [] },
  ],
  produse: [
    { cheie: "vaza-ceramica", nume: "Vază din ceramică mată, 30 cm", categorie: "Textile", pret: 89, imagine: poza("produse/vaza-ceramica"), descriere: "Glazură mată în ton nisipiu, potrivită pentru flori uscate." },
    { cheie: "fotoliu-piele", nume: "Fotoliu din piele coniac cu cadru de lemn", categorie: "Scaune", pret: 1890, pretVechi: 2290, imagine: poza("produse/fotoliu-piele"), recomandat: true, descriere: "Piele naturală, cadru din stejar masiv, pernă de șezut groasă." },
    { cheie: "comoda-tv", nume: "Comodă TV din lemn de nuc, 180 cm", categorie: "Comode", pret: 2490, imagine: poza("produse/comoda-tv"), recomandat: true, descriere: "Patru uși cu închidere lentă, picioare metalice negre." },
    { cheie: "raft-modular", nume: "Raft modular deschis, cinci niveluri", categorie: "Depozitare", pret: 990, pretVechi: 1190, imagine: poza("produse/raft-modular"), descriere: "Lemn de frasin și metal negru, montaj simplu." },
    { cheie: "masa-rotunda", nume: "Masă rotundă de dining, 120 cm", categorie: "Mese", pret: 1690, imagine: poza("produse/masa-rotunda"), recomandat: true, descriere: "Blat din stejar uleiat, picior central sculptat." },
    { cheie: "covor-lana", nume: "Covor din lână țesut manual, 160 x 230 cm", categorie: "Textile", pret: 1290, pretVechi: 1490, imagine: poza("produse/covor-lana"), descriere: "Lână naturală, model geometric discret, ton crem." },
    { cheie: "lampa-pendul", nume: "Lampă suspendată din sticlă opal", categorie: "Iluminat", pret: 459, imagine: poza("produse/lampa-pendul"), recomandat: true, descriere: "Glob de sticlă opal de 25 cm, cablu textil negru." },
    { cheie: "perdea-in", nume: "Perdea din in, 140 x 260 cm", categorie: "Perdele", pret: 249, imagine: poza("produse/perdea-in"), descriere: "In natural spălat, cădere ușoară, prindere cu bride." },
    { cheie: "oglinda-arcada", nume: "Oglindă tip arcadă cu ramă neagră, 160 cm", categorie: "Oglinzi", pret: 790, pretVechi: 890, imagine: poza("produse/oglinda-arcada"), recomandat: true, descriere: "Ramă metalică subțire, se sprijină de perete." },
    { cheie: "scaun-dining", nume: "Scaun de dining tapițat, gri", categorie: "Scaune", pret: 549, imagine: poza("produse/scaun-dining"), descriere: "Țesătură texturată, picioare din lemn de fag." },
  ],
  bannere: [{ imagine: poza("poze/hero"), categorie: "Comode" }],
  carduri: [],
  placi: [{ titlu: "Scaune", imagine: poza("categorii/scaune"), categorie: "Scaune" }, { titlu: "Mese", imagine: poza("categorii/mese"), categorie: "Mese" }, { titlu: "Iluminat", imagine: poza("categorii/iluminat"), categorie: "Iluminat" }, { titlu: "Oglinzi", imagine: poza("produse/oglinda-arcada"), categorie: "Oglinzi" }],
  randuri: [
    { cheie: "noutati", titlu: "Noutăți în colecție", produse: ["fotoliu-piele", "comoda-tv", "masa-rotunda", "lampa-pendul", "oglinda-arcada"] },
    { cheie: "casa", titlu: "Detalii pentru casă", produse: ["raft-modular", "covor-lana", "perdea-in", "scaun-dining", "vaza-ceramica"] },
  ],
};
