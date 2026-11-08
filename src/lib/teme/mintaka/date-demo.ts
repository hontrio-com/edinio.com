import type { MenuItem } from "@/lib/pages/menu";
import type { SetDateDemo } from "@/lib/teme/tipuri";

/*
  Datele demo ale temei Mintaka (moda, etapa 24 din `docs/editor-magazin/PLAN.md`, lotul 7). Pozele
  generate cu ElevenLabs (manifestul `scripts/teme/imagini/mintaka.json`), in `public/teme/mintaka/`. Produse fara marca; textele
  si preturile sunt scrise aici. Cheile sunt stabile (din ele se face `external_id`).
*/

const poza = (cale: string) => `/teme/mintaka/${cale}.webp`;

export const MENIU_DEMO_MINTAKA: MenuItem[] = ["Femei", "Bărbați", "Copii", "Încălțăminte", "Genți", "Accesorii"]
  .map((nume, i): MenuItem => ({ id: `demo_raion_${i}`, type: "category", label: nume, target: nume }));

export const DATE_DEMO_MINTAKA: SetDateDemo = {
  categorii: [
    { nume: "Femei", imagine: poza("categorii/femei"), copii: [] },
    { nume: "Bărbați", imagine: poza("categorii/barbati"), copii: [] },
    { nume: "Copii", imagine: poza("categorii/copii"), copii: [] },
    { nume: "Încălțăminte", imagine: poza("categorii/incaltaminte"), copii: [] },
    { nume: "Genți", imagine: poza("categorii/genti"), copii: [] },
    { nume: "Accesorii", imagine: poza("categorii/accesorii"), copii: [] },
    { nume: "Pulovere", imagine: poza("categorii/pulovere"), copii: [] },
    { nume: "Geci", imagine: poza("categorii/geci"), copii: [] },
  ],
  produse: [
    { cheie: "fular-lana", nume: "Fular din lână, carouri", categorie: "Accesorii", pret: 99, imagine: poza("produse/fular-lana"), descriere: "Lână moale, franjuri scurți, tonuri de bej și maro." },
    { cheie: "blazer-carouri", nume: "Blazer cu carouri, gri", categorie: "Femei", pret: 389, pretVechi: 459, imagine: poza("produse/blazer-carouri"), recomandat: true, descriere: "Croi drept, căptușit, nasturi cu două rânduri." },
    { cheie: "jacheta-denim", nume: "Jachetă din denim, albastru deschis", categorie: "Bărbați", pret: 299, imagine: poza("produse/jacheta-denim"), recomandat: true, descriere: "Bumbac rezistent, spălare vintage, buzunare cu clapă." },
    { cheie: "bluza-satin", nume: "Bluză din satin cu bretele, ivoire", categorie: "Femei", pret: 159, pretVechi: 189, imagine: poza("produse/bluza-satin"), recomandat: true, descriere: "Satin fluid, decolteu în V cu dantelă." },
    { cheie: "hanorac-copii", nume: "Hanorac pentru copii, galben muștar", categorie: "Copii", pret: 129, imagine: poza("produse/hanorac-copii"), descriere: "Bumbac pufos, glugă cu șnur, mărimi 4-12 ani." },
    { cheie: "mocasini-piele", nume: "Mocasini din piele, negri", categorie: "Încălțăminte", pret: 349, pretVechi: 399, imagine: poza("produse/mocasini-piele"), descriere: "Piele întoarsă, talpă de cauciuc flexibilă." },
    { cheie: "geanta-umar", nume: "Geantă de umăr din piele, bej", categorie: "Genți", pret: 289, imagine: poza("produse/geanta-umar"), recomandat: true, descriere: "Închidere cu fermoar, baretă reglabilă." },
    { cheie: "pulover-cablu", nume: "Pulover tricotat cu model torsadat, crem", categorie: "Pulovere", pret: 219, pretVechi: 259, imagine: poza("produse/pulover-cablu"), descriere: "Amestec de lână și bumbac, guler rotund." },
    { cheie: "geaca-puf", nume: "Geacă de puf scurtă, negru", categorie: "Geci", pret: 459, imagine: poza("produse/geaca-puf"), recomandat: true, descriere: "Umplutură ușoară, glugă detașabilă, buzunare cu fermoar." },
    { cheie: "ochelari-cat-eye", nume: "Ochelari de soare cat-eye, negri", categorie: "Accesorii", pret: 149, imagine: poza("produse/ochelari-cat-eye"), descriere: "Lentile cu protecție UV400, ramă din acetat." },
  ],
  bannere: [{ imagine: poza("poze/vitrina-toamna"), categorie: "Femei" }],
  carduri: [],
  placi: [{ titlu: "Pentru ea", imagine: poza("poze/placa-ea"), categorie: "Femei" }, { titlu: "Pentru el", imagine: poza("poze/placa-el"), categorie: "Bărbați" }, { titlu: "Pentru copii", imagine: poza("poze/placa-copii"), categorie: "Copii" }, { titlu: "Accesorii", imagine: poza("poze/placa-accesorii"), categorie: "Accesorii" }],
  randuri: [
    { cheie: "noutati", titlu: "Noutăți", produse: ["blazer-carouri", "jacheta-denim", "bluza-satin", "geaca-puf", "geanta-umar"] },
    { cheie: "populare", titlu: "Cele mai populare", produse: ["pulover-cablu", "mocasini-piele", "hanorac-copii", "ochelari-cat-eye", "fular-lana"] },
  ],
};

export const VITRINA_DEMO_MINTAKA = [
  { eticheta: "Nou", titlu: "Colecția de toamnă", text: "Denim, tricotaje și geci.", imagine: poza("poze/vitrina-toamna"), categorie: "Bărbați" },
  { eticheta: "-20%", titlu: "Ofertă exclusivă", text: "Bluze și fuste de sezon.", imagine: poza("poze/vitrina-oferta"), categorie: "Femei" },
  { eticheta: "", titlu: "Colecția de iarnă", text: "Blazere și paltoane elegante.", imagine: poza("poze/vitrina-iarna"), categorie: "Geci" },
] as const;
