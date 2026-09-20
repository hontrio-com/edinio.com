import { crestere, type DateVanzari } from "@/lib/vanzari";
import { pluralRo } from "@/lib/utils/format";
import type { CarduriSecundare, DetaliuVanzari, RandSursa } from "@/lib/statistici";

/*
  ═══════════════════════════════════════════════════════════════════════════
  CELE CATEVA LUCRURI CARE MERITA SPUSE CU VORBE
  ═══════════════════════════════════════════════════════════════════════════

  ⚠ NIMIC AICI NU „INTERPRETEAZA". Fiecare concluzie e o regula scrisa, cu un
  prag scris, care se poate citi si contrazice. O propozitie generata de un
  model, care azi spune una si maine alta pe aceleasi cifre, n-ar fi de niciun
  folos intr-un panou unde omul ia hotarari cu bani.

  ⚠ FIECARE REGULA ARE UN PRAG DE VOLUM. Fara el, un magazin cu 3 sesiuni si 0
  comenzi ar fi primit „Instagram nu-ti aduce nicio comanda" - o concluzie
  trasa din nimic, care suna la fel de sigur ca una adevarata.

  ⚠ CEL MULT TREI. Zece observatii deodata nu sunt un sfat, sunt inca un tabel.
*/

export type Concluzie = {
  /** Ce regula a produs-o. Pentru `key` in React si pentru probe. */
  cheie: string;
  /** `rau` = pierzi bani acum; `bun` = merge bine; `info` = doar de stiut. */
  ton: "rau" | "bun" | "info";
  text: string;
};

/** Cat de tare cere fiecare regula sa fie vazuta. Mai mare = mai sus. */
const GREUTATE: Record<string, number> = {
  "canal-fara-comenzi": 90,
  "cosuri-parasite": 85,
  "anulari-multe": 80,
  "mobil-in-urma": 70,
  scadere: 60,
  "produs-purtator": 40,
  crestere: 30,
};

const NUME_SURSA: Record<string, string> = {
  direct: "Direct", google: "Google", facebook: "Facebook",
  instagram: "Instagram", tiktok: "TikTok", other: "alte surse",
};

function pr(x: number): string {
  return x.toLocaleString("ro-RO", { maximumFractionDigits: 2 });
}

export function concluzii({
  vanzari, detaliu, secundare, surse, palnie,
}: {
  vanzari: DateVanzari | null;
  detaliu: DetaliuVanzari;
  secundare: CarduriSecundare | null;
  surse: RandSursa[];
  palnie: { sesiuni: number; cu_cos: number; cu_comanda: number } | null;
}): Concluzie[] {
  const gasite: Concluzie[] = [];

  /* ── 1. Un canal aduce oameni si nicio comanda ───────────────────────── */
  const peSursa = new Map<string, { sesiuni: number; comenzi: number }>();
  for (const r of surse) {
    const c = peSursa.get(r.sursa) ?? { sesiuni: 0, comenzi: 0 };
    c.sesiuni += r.sesiuni;
    c.comenzi += r.sesiuni_cu_comanda;
    peSursa.set(r.sursa, c);
  }
  /* ⚠ Sortat pe nume, nu pe ordinea din raspuns: la doua surse la fel de
     mari, propozitia trebuie sa iasa aceeasi de fiecare data. */
  const seci = [...peSursa.entries()]
    .filter(([, c]) => c.sesiuni >= 50 && c.comenzi === 0)
    .sort((a, b) => b[1].sesiuni - a[1].sesiuni || a[0].localeCompare(b[0]));
  if (seci.length > 0) {
    const [sursa, c] = seci[0];
    gasite.push({
      cheie: "canal-fara-comenzi",
      ton: "rau",
      /* ⚠ „de" il cer ultimele doua cifre, nu marimea numarului: „52 de vizite",
         dar „103 vizite". Regula sta in `pluralRo`, nu se scrie a doua oara. */
      text: `Din ${NUME_SURSA[sursa] ?? sursa} au venit ${pluralRo(c.sesiuni, "vizita", "vizite")} `
        + "si nicio comanda. Uita-te pe ce pagina ajung oamenii de acolo.",
    });
  }

  /* ── 2. Cosuri care nu ajung comenzi ─────────────────────────────────── */
  if (palnie && palnie.cu_cos >= 20 && palnie.cu_comanda / palnie.cu_cos < 0.25) {
    gasite.push({
      cheie: "cosuri-parasite",
      ton: "rau",
      text: `Din ${pluralRo(palnie.cu_cos, "cos", "cosuri")}, `
        + `${palnie.cu_comanda === 1 ? "doar unul a ajuns" : `doar ${palnie.cu_comanda} au ajuns`} comanda. `
        + "Cel mai des se pierde la costul de transport aratat tarziu.",
    });
  }

  /* ── 3. Prea multe anulari ───────────────────────────────────────────── */
  if (secundare && secundare.comenzi_toate >= 20) {
    const rata = (secundare.anulate / secundare.comenzi_toate) * 100;
    if (rata >= 10) {
      gasite.push({
        cheie: "anulari-multe",
        ton: "rau",
        text: `${pr(rata)}% din comenzile intrate au fost anulate `
          + `(${secundare.anulate} din ${secundare.comenzi_toate}).`,
      });
    }
  }

  /* ── 4. Telefonul aduce traficul, desktopul vinde ────────────────────── */
  const peDispozitiv = new Map<string, { sesiuni: number; comenzi: number }>();
  for (const r of surse) {
    const c = peDispozitiv.get(r.dispozitiv) ?? { sesiuni: 0, comenzi: 0 };
    c.sesiuni += r.sesiuni;
    c.comenzi += r.sesiuni_cu_comanda;
    peDispozitiv.set(r.dispozitiv, c);
  }
  const mob = peDispozitiv.get("mobile");
  const desk = peDispozitiv.get("desktop");
  /* ⚠ Si pe telefon trebuie sa fie MACAR o comanda. Cu zero, raportul dintre
     rate e „de cate ori mai mult decat nimic", adica se aprinde ori de cate ori
     desktopul vinde cat de putin - si ar fi acoperit oricum de regula de mai
     sus, mai limpede scrisa. */
  if (mob && desk && mob.sesiuni >= 100 && desk.sesiuni >= 50
      && desk.comenzi > 0 && mob.comenzi > 0) {
    const cMob = (mob.comenzi / mob.sesiuni) * 100;
    const cDesk = (desk.comenzi / desk.sesiuni) * 100;
    if (cDesk >= cMob * 1.5) {
      const total = mob.sesiuni + desk.sesiuni;
      gasite.push({
        cheie: "mobil-in-urma",
        ton: "info",
        text: `Pe telefon cumpara ${pr(cMob)}% dintre vizite, pe calculator ${pr(cDesk)}%, `
          + `desi de pe telefon vine ${pr((mob.sesiuni / total) * 100)}% din trafic.`,
      });
    }
  }

  /* ── 5. Cum s-a miscat fata de perioada precedenta ───────────────────── */
  if (vanzari && vanzari.total_anterior.vanzari > 0 && vanzari.total.comenzi >= 10) {
    const pct = crestere(vanzari.total.vanzari, vanzari.total_anterior.vanzari);
    if (pct !== null && Math.abs(pct) >= 20) {
      gasite.push(pct > 0
        ? { cheie: "crestere", ton: "bun", text: `Vanzarile au crescut cu ${pr(pct)}% fata de perioada precedenta.` }
        : { cheie: "scadere", ton: "rau", text: `Vanzarile au scazut cu ${pr(Math.abs(pct))}% fata de perioada precedenta.` });
    }
  }

  /* ── 6. Un singur produs duce magazinul in spate ─────────────────────── */
  const totalLinii = detaliu.produse.reduce((s, p) => s + p.vanzari, 0);
  const varf = detaliu.produse[0];
  if (varf && totalLinii > 0 && varf.comenzi >= 3 && varf.vanzari / totalLinii >= 0.25) {
    gasite.push({
      cheie: "produs-purtator",
      ton: "info",
      text: `„${varf.nume}” aduce ${pr((varf.vanzari / totalLinii) * 100)}% din valoarea produselor vandute.`,
    });
  }

  return gasite
    .sort((a, b) => (GREUTATE[b.cheie] ?? 0) - (GREUTATE[a.cheie] ?? 0))
    .slice(0, 3);
}
