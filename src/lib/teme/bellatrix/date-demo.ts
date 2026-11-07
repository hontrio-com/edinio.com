import type { MenuItem } from "@/lib/pages/menu";
import type { SetDateDemo } from "@/lib/teme/tipuri";

/*
  Datele demo ale temei Bellatrix (drogherie, etapa 24 din `docs/editor-magazin/PLAN.md`, lotul 6). Pozele
  generate cu ElevenLabs (manifestul `scripts/teme/imagini/bellatrix.json`), in `public/teme/bellatrix/`. Produse fara marca; textele
  si preturile sunt scrise aici. Cheile sunt stabile (din ele se face `external_id`).
*/

const poza = (cale: string) => `/teme/bellatrix/${cale}.webp`;

export const MENIU_DEMO_BELLATRIX: MenuItem[] = ["Machiaj", "Îngrijire față", "Păr", "Sănătate", "Bebe", "Casă"]
  .map((nume, i): MenuItem => ({ id: `demo_raion_${i}`, type: "category", label: nume, target: nume }));

export const DATE_DEMO_BELLATRIX: SetDateDemo = {
  categorii: [
    { nume: "Machiaj", imagine: poza("categorii/machiaj"), copii: [] },
    { nume: "Îngrijire față", imagine: poza("categorii/ingrijire-fata"), copii: [] },
    { nume: "Păr", imagine: poza("categorii/par"), copii: [] },
    { nume: "Igienă orală", imagine: poza("categorii/igiena-orala"), copii: [] },
    { nume: "Sănătate", imagine: poza("categorii/sanatate"), copii: [] },
    { nume: "Bebe", imagine: poza("categorii/bebe"), copii: [] },
    { nume: "Casă", imagine: poza("categorii/casa"), copii: [] },
    { nume: "Animale", imagine: poza("categorii/animale"), copii: [] },
  ],
  produse: [
    { cheie: "hrana-pisici-plic", nume: "Hrană umedă pentru pisici, 12 plicuri", categorie: "Animale", pret: 39, imagine: poza("produse/hrana-pisici-plic"), descriere: "Bucăți fragede în sos, cu pui și curcan." },
    { cheie: "crema-hidratanta", nume: "Cremă hidratantă de zi, 50 ml", categorie: "Îngrijire față", pret: 29, pretVechi: 35, imagine: poza("produse/crema-hidratanta"), recomandat: true, descriere: "Cu acid hialuronic și SPF 15, pentru toate tipurile de ten." },
    { cheie: "sampon-reparator", nume: "Șampon reparator, 400 ml", categorie: "Păr", pret: 19, imagine: poza("produse/sampon-reparator"), recomandat: true, descriere: "Cu ulei de argan, pentru părul uscat și deteriorat." },
    { cheie: "pasta-dinti", nume: "Pastă de dinți albire blândă, 75 ml", categorie: "Igienă orală", pret: 12, pretVechi: 15, imagine: poza("produse/pasta-dinti"), descriere: "Protecție împotriva cariilor, respirație proaspătă." },
    { cheie: "vitamina-c", nume: "Vitamina C 1000 mg, 30 de tablete efervescente", categorie: "Sănătate", pret: 24, imagine: poza("produse/vitamina-c"), recomandat: true, descriere: "Cu zinc, gust de portocală." },
    { cheie: "scutece-4", nume: "Scutece mărimea 4, 46 bucăți", categorie: "Bebe", pret: 59, pretVechi: 69, imagine: poza("produse/scutece-4"), recomandat: true, descriere: "Absorbție până la 12 ore, bandă elastică moale." },
    { cheie: "detergent-gel", nume: "Detergent gel pentru rufe, 40 de spălări", categorie: "Casă", pret: 45, imagine: poza("produse/detergent-gel"), descriere: "Eficient de la 30 de grade, parfum de flori de bumbac." },
    { cheie: "fond-ten", nume: "Fond de ten cu acoperire medie, 30 ml", categorie: "Machiaj", pret: 39, imagine: poza("produse/fond-ten"), descriere: "Finisaj natural, rezistent 16 ore." },
    { cheie: "servetele-umede", nume: "Șervețele umede pentru bebeluși, 4 x 64", categorie: "Bebe", pret: 25, pretVechi: 29, imagine: poza("produse/servetele-umede"), descriere: "99% apă, fără parfum, testate dermatologic." },
    { cheie: "mascara-volum", nume: "Mascara pentru volum, neagră", categorie: "Machiaj", pret: 29, imagine: poza("produse/mascara-volum"), recomandat: true, descriere: "Perie curbată, nu se întărește, ușor de demachiat." },
  ],
  bannere: [{ imagine: poza("poze/hero"), categorie: "Îngrijire față" }],
  carduri: [],
  placi: [{ titlu: "Îngrijire față", imagine: poza("categorii/ingrijire-fata"), categorie: "Îngrijire față" }, { titlu: "Bebe", imagine: poza("categorii/bebe"), categorie: "Bebe" }, { titlu: "Sănătate", imagine: poza("categorii/sanatate"), categorie: "Sănătate" }, { titlu: "Casă", imagine: poza("categorii/casa"), categorie: "Casă" }],
  randuri: [
    { cheie: "recomandate", titlu: "Alegerile săptămânii", produse: ["crema-hidratanta", "sampon-reparator", "vitamina-c", "scutece-4", "mascara-volum"] },
    { cheie: "zilnic", titlu: "Pentru fiecare zi", produse: ["pasta-dinti", "detergent-gel", "fond-ten", "servetele-umede", "hrana-pisici-plic"] },
  ],
};
