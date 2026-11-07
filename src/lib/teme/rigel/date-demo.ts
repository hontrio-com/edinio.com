import type { MenuItem } from "@/lib/pages/menu";
import type { SetDateDemo } from "@/lib/teme/tipuri";

/*
  Datele demo ale temei Rigel (frumusete si cosmetice, etapa 24 din `docs/editor-magazin/PLAN.md`, lotul 3). Pozele
  generate cu ElevenLabs (manifestul `scripts/teme/imagini/rigel.json`), in `public/teme/rigel/`. Produse fara marca; textele
  si preturile sunt scrise aici. Cheile sunt stabile (din ele se face `external_id`).
*/

const poza = (cale: string) => `/teme/rigel/${cale}.webp`;

export const MENIU_DEMO_RIGEL: MenuItem[] = ["Parfumuri", "Ten", "Buze", "Farduri", "Seruri", "Accesorii"]
  .map((nume, i): MenuItem => ({ id: `demo_raion_${i}`, type: "category", label: nume, target: nume }));

export const DATE_DEMO_RIGEL: SetDateDemo = {
  categorii: [
    { nume: "Parfumuri", imagine: poza("categorii/parfumuri"), copii: [] },
    { nume: "Buze", imagine: poza("categorii/buze"), copii: [] },
    { nume: "Ten", imagine: poza("categorii/ten"), copii: [] },
    { nume: "Seruri", imagine: poza("categorii/seruri"), copii: [] },
    { nume: "Hidratare", imagine: poza("categorii/hidratare"), copii: [] },
    { nume: "Farduri", imagine: poza("categorii/farduri"), copii: [] },
    { nume: "Gene", imagine: poza("categorii/gene"), copii: [] },
    { nume: "Accesorii", imagine: poza("categorii/accesorii"), copii: [] },
  ],
  produse: [
    { cheie: "lac-unghii-roz", nume: "Lac de unghii, roz bujor", categorie: "Accesorii", pret: 39, imagine: poza("produse/lac-unghii-roz"), descriere: "Acoperire într-un strat, uscare rapidă, luciu de gel." },
    { cheie: "parfum-floral", nume: "Apă de parfum florală, 50 ml", categorie: "Parfumuri", pret: 329, pretVechi: 389, imagine: poza("produse/parfum-floral"), recomandat: true, descriere: "Note de bujor, trandafir și mosc alb. Proaspăt și luminos." },
    { cheie: "luciu-buze", nume: "Luciu de buze nud", categorie: "Buze", pret: 69, imagine: poza("produse/luciu-buze"), recomandat: true, descriere: "Textură nelipicioasă, cu ulei de jojoba." },
    { cheie: "pudra-compacta", nume: "Pudră compactă matifiantă", categorie: "Ten", pret: 89, imagine: poza("produse/pudra-compacta"), descriere: "Fixează machiajul și matifiază fără efect de mască." },
    { cheie: "ser-vitamina-c", nume: "Ser cu vitamina C 15%", categorie: "Seruri", pret: 149, pretVechi: 179, imagine: poza("produse/ser-vitamina-c"), recomandat: true, descriere: "Luminează tenul și uniformizează tonul în patru săptămâni." },
    { cheie: "masca-servetel", nume: "Mască șervețel hidratantă, set de 5", categorie: "Hidratare", pret: 59, imagine: poza("produse/masca-servetel"), descriere: "Cu acid hialuronic și extract de aloe." },
    { cheie: "apa-micelara", nume: "Apă micelară, 400 ml", categorie: "Hidratare", pret: 49, imagine: poza("produse/apa-micelara"), descriere: "Demachiază și curăță fără clătire." },
    { cheie: "tus-ochi", nume: "Tuș de ochi tip carioca, negru", categorie: "Gene", pret: 59, imagine: poza("produse/tus-ochi"), recomandat: true, descriere: "Vârf fin, linie precisă, rezistent la apă." },
    { cheie: "fard-obraz", nume: "Paletă de fard de obraz, 3 nuanțe roz", categorie: "Farduri", pret: 99, pretVechi: 119, imagine: poza("produse/fard-obraz"), descriere: "Pigmenți fini, ușor de estompat." },
    { cheie: "uscator-par", nume: "Uscător de păr ionic, 2000 W, roz", categorie: "Accesorii", pret: 299, imagine: poza("produse/uscator-par"), recomandat: true, descriere: "Trei trepte de temperatură, aer rece și difuzor." },
  ],
  bannere: [{ imagine: poza("bannere/parfumuri"), categorie: "Parfumuri" }, { imagine: poza("bannere/ingrijire"), categorie: "Seruri" }],
  carduri: [],
  placi: [{ titlu: "Parfumuri", imagine: poza("categorii/parfumuri"), categorie: "Parfumuri" }, { titlu: "Seruri", imagine: poza("categorii/seruri"), categorie: "Seruri" }, { titlu: "Buze", imagine: poza("categorii/buze"), categorie: "Buze" }, { titlu: "Farduri", imagine: poza("categorii/farduri"), categorie: "Farduri" }],
  randuri: [
    { cheie: "noutati", titlu: "Noutăți", produse: ["parfum-floral", "ser-vitamina-c", "luciu-buze", "tus-ochi", "uscator-par"] },
    { cheie: "oferte", titlu: "Oferte de sărbători", produse: ["fard-obraz", "pudra-compacta", "masca-servetel", "apa-micelara", "lac-unghii-roz"] },
  ],
};
