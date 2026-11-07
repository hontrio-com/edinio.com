import type { MenuItem } from "@/lib/pages/menu";
import type { SetDateDemo } from "@/lib/teme/tipuri";

/*
  Datele demo ale temei Regulus (articole sportive si merchandise, etapa 24 din `docs/editor-magazin/PLAN.md`, lotul 6). Pozele
  generate cu ElevenLabs (manifestul `scripts/teme/imagini/regulus.json`), in `public/teme/regulus/`. Produse fara marca; textele
  si preturile sunt scrise aici. Cheile sunt stabile (din ele se face `external_id`).
*/

const poza = (cale: string) => `/teme/regulus/${cale}.webp`;

export const MENIU_DEMO_REGULUS: MenuItem[] = ["Noutăți", "Tricouri", "Hanorace", "Șepci", "Mingi", "Copii"]
  .map((nume, i): MenuItem => ({ id: `demo_raion_${i}`, type: "category", label: nume, target: nume }));

export const DATE_DEMO_REGULUS: SetDateDemo = {
  categorii: [
    { nume: "Noutăți", imagine: poza("categorii/noutati"), copii: [] },
    { nume: "Tricouri", imagine: poza("categorii/tricouri"), copii: [] },
    { nume: "Hanorace", imagine: poza("categorii/hanorace"), copii: [] },
    { nume: "Șepci", imagine: poza("categorii/sepci"), copii: [] },
    { nume: "Mingi", imagine: poza("categorii/mingi"), copii: [] },
    { nume: "Copii", imagine: poza("categorii/copii"), copii: [] },
    { nume: "Rucsacuri", imagine: poza("categorii/rucsacuri"), copii: [] },
    { nume: "Accesorii", imagine: poza("categorii/accesorii"), copii: [] },
  ],
  produse: [
    { cheie: "sosete-sport", nume: "Set 3 perechi de șosete sport", categorie: "Accesorii", pret: 49, imagine: poza("produse/sosete-sport"), descriere: "Bumbac pieptănat, talpă căptușită, dungi albastre." },
    { cheie: "tricou-albastru", nume: "Tricou din bumbac, albastru-cer", categorie: "Tricouri", pret: 99, pretVechi: 129, imagine: poza("produse/tricou-albastru"), recomandat: true, descriere: "Bumbac organic, croi relaxat, imprimeu cu stea pe piept." },
    { cheie: "hanorac-gri", nume: "Hanorac cu glugă, gri melanj", categorie: "Hanorace", pret: 229, imagine: poza("produse/hanorac-gri"), recomandat: true, descriere: "Interior pufos, buzunar cangur, șnur plat." },
    { cheie: "sapca-snapback", nume: "Șapcă snapback, vișinie", categorie: "Șepci", pret: 89, imagine: poza("produse/sapca-snapback"), recomandat: true, descriere: "Cozoroc drept, închidere reglabilă, broderie cu stea." },
    { cheie: "minge-fotbal-american", nume: "Minge de fotbal american, mărimea 9", categorie: "Mingi", pret: 119, pretVechi: 139, imagine: poza("produse/minge-fotbal-american"), recomandat: true, descriere: "Piele sintetică cu aderență bună, cusături în relief." },
    { cheie: "tricou-copii", nume: "Tricou pentru copii, alb", categorie: "Copii", pret: 69, imagine: poza("produse/tricou-copii"), descriere: "Bumbac moale, mărimi de la 4 la 14 ani." },
    { cheie: "rucsac-sport", nume: "Rucsac sport, 25 l, negru", categorie: "Rucsacuri", pret: 179, pretVechi: 209, imagine: poza("produse/rucsac-sport"), descriere: "Compartiment pentru laptop, buzunar pentru sticlă." },
    { cheie: "minge-baschet", nume: "Minge de baschet, mărimea 7", categorie: "Mingi", pret: 129, imagine: poza("produse/minge-baschet"), descriere: "Pentru interior și exterior, aderență bună." },
    { cheie: "fes-iarna", nume: "Fes tricotat cu pompon", categorie: "Noutăți", pret: 69, imagine: poza("produse/fes-iarna"), recomandat: true, descriere: "Acril moale, manșetă întoarsă, albastru și alb." },
    { cheie: "sticla-sport", nume: "Sticlă sport din oțel, 600 ml", categorie: "Accesorii", pret: 79, imagine: poza("produse/sticla-sport"), descriere: "Dublu perete, capac cu buton, ține rece 24 de ore." },
  ],
  bannere: [{ imagine: poza("poze/hero"), categorie: "Noutăți" }],
  carduri: [],
  placi: [],
  randuri: [
    { cheie: "noutati", titlu: "Colecția de sărbători", produse: ["fes-iarna", "hanorac-gri", "sapca-snapback", "minge-fotbal-american", "tricou-albastru"] },
    { cheie: "populare", titlu: "Cele mai iubite", produse: ["tricou-copii", "rucsac-sport", "minge-baschet", "sticla-sport", "sosete-sport"] },
  ],
};
