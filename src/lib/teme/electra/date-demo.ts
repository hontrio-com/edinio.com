import type { MenuItem } from "@/lib/pages/menu";
import type { SetDateDemo } from "@/lib/teme/tipuri";

/*
  Datele demo ale temei Electra (mobila moderna, etapa 24 din `docs/editor-magazin/PLAN.md`, lotul 7). Pozele
  generate cu ElevenLabs (manifestul `scripts/teme/imagini/electra.json`), in `public/teme/electra/`. Produse fara marca; textele
  si preturile sunt scrise aici. Cheile sunt stabile (din ele se face `external_id`).
*/

const poza = (cale: string) => `/teme/electra/${cale}.webp`;

export const MENIU_DEMO_ELECTRA: MenuItem[] = ["Living", "Dormitor", "Dining", "Birou", "Decorațiuni", "Iluminat"]
  .map((nume, i): MenuItem => ({ id: `demo_raion_${i}`, type: "category", label: nume, target: nume }));

export const DATE_DEMO_ELECTRA: SetDateDemo = {
  categorii: [
    { nume: "Living", imagine: poza("categorii/living"), copii: [] },
    { nume: "Dormitor", imagine: poza("categorii/dormitor"), copii: [] },
    { nume: "Dining", imagine: poza("categorii/dining"), copii: [] },
    { nume: "Birou", imagine: poza("categorii/birou"), copii: [] },
    { nume: "Decorațiuni", imagine: poza("categorii/decoratiuni"), copii: [] },
    { nume: "Iluminat", imagine: poza("categorii/iluminat"), copii: [] },
    { nume: "Exterior", imagine: poza("categorii/exterior"), copii: [] },
    { nume: "Copii", imagine: poza("categorii/copii"), copii: [] },
  ],
  produse: [
    { cheie: "perna-decorativa", nume: "Pernă decorativă din catifea, roz pudrat", categorie: "Decorațiuni", pret: 89, imagine: poza("produse/perna-decorativa"), descriere: "Catifea moale, umplutură din fibră, 45 x 45 cm." },
    { cheie: "fotoliu-scoica", nume: "Fotoliu scoică din catifea, roz", categorie: "Living", pret: 1290, pretVechi: 1590, imagine: poza("produse/fotoliu-scoica"), recomandat: true, descriere: "Spătar în formă de scoică, picioare aurii." },
    { cheie: "pat-tapitat", nume: "Pat tapițat 160 x 200 cm, bej", categorie: "Dormitor", pret: 2890, imagine: poza("produse/pat-tapitat"), recomandat: true, descriere: "Tăblie înaltă capitonată, ladă de depozitare." },
    { cheie: "masa-marmura", nume: "Masă de dining cu blat din marmură albă", categorie: "Dining", pret: 3490, pretVechi: 3990, imagine: poza("produse/masa-marmura"), recomandat: true, descriere: "Blat de 160 cm, bază din metal auriu." },
    { cheie: "scaun-birou", nume: "Scaun de birou ergonomic, alb", categorie: "Birou", pret: 990, imagine: poza("produse/scaun-birou"), descriere: "Spătar din plasă, suport lombar reglabil." },
    { cheie: "masuta-aurie", nume: "Măsuță auxiliară din metal auriu", categorie: "Decorațiuni", pret: 389, pretVechi: 449, imagine: poza("produse/masuta-aurie"), descriere: "Design în spirală, blat rotund din sticlă." },
    { cheie: "lampa-podea", nume: "Lampă de podea cu abajur textil", categorie: "Iluminat", pret: 459, imagine: poza("produse/lampa-podea"), recomandat: true, descriere: "Picior din alamă, abajur de in alb." },
    { cheie: "sezlong-gradina", nume: "Șezlong de grădină din ratan", categorie: "Exterior", pret: 1190, imagine: poza("produse/sezlong-gradina"), descriere: "Ratan sintetic rezistent, pernă inclusă." },
    { cheie: "patut-copii", nume: "Pătuț din lemn pentru copii, alb", categorie: "Copii", pret: 1290, pretVechi: 1490, imagine: poza("produse/patut-copii"), descriere: "Lemn de fag, bază reglabilă pe trei înălțimi." },
    { cheie: "canapea-3-locuri", nume: "Canapea cu trei locuri, catifea verde", categorie: "Living", pret: 3990, imagine: poza("produse/canapea-3-locuri"), recomandat: true, descriere: "Brațe rotunjite, perne cu puf, picioare din lemn." },
  ],
  bannere: [{ imagine: poza("poze/hero"), categorie: "Living" }],
  carduri: [],
  placi: [{ titlu: "Living", imagine: poza("categorii/living"), categorie: "Living" }, { titlu: "Dormitor", imagine: poza("categorii/dormitor"), categorie: "Dormitor" }, { titlu: "Dining", imagine: poza("categorii/dining"), categorie: "Dining" }, { titlu: "Iluminat", imagine: poza("categorii/iluminat"), categorie: "Iluminat" }],
  randuri: [
    { cheie: "noutati", titlu: "Piese noi", produse: ["fotoliu-scoica", "canapea-3-locuri", "masa-marmura", "pat-tapitat", "lampa-podea"] },
    { cheie: "detalii", titlu: "Detalii care schimbă camera", produse: ["masuta-aurie", "perna-decorativa", "scaun-birou", "sezlong-gradina", "patut-copii"] },
  ],
};
