import { ImageIcon } from "lucide-react";
import {
  LATIMI_POZA_PRODUS,
  PRODUSE_MIGRARE,
  SIZES_POZA_PRODUS,
  type ProdusMigrare,
} from "@/lib/website/migrare";

/**
 * Panoul secțiunii „Produse": patru carduri de produs, pe un rând.
 *
 * ═══ CARDURILE SUNT CELE DE PE „OPTIMIZARE" ═══
 *
 * Cerut de client (14.08), și e chiar rețeta de acolo, nu una care seamănă cu ea:
 * chenar continuu de un fir, colț rotunjit, o ramă de 5px, iar înăuntrul ei caseta
 * ilustrației pe `bg-tint`, cu colțul ei mai mic. Sub casetă, text pe alb.
 *
 * Cei 5px sunt semnalmentul cardului, nu o spațiere oarecare: fac casetă în
 * casetă, adică imaginea arată așezată pe card, nu lipită în el.
 *
 * ⚠ DOUĂ LUCRURI SUNT ALTFEL, amândouă fiindcă aici e marfă, nu o ilustrație:
 *
 * 1. **Caseta e pătrată, nu 4:3.** Toate magazinele arată produsele în pătrat, și
 *    tot pătrate sunt și fotografiile de produs din depozit (500x500). Cu 4:3, o
 *    geacă sau un scaun — lucruri înalte — ar fi rămas cu gol pe laturi.
 * 2. **Sub casetă stau trei rânduri, nu două.** Acolo e titlu și descriere; aici
 *    e categoria, denumirea și prețul, adică fix ce scrie pe un card de magazin.
 *
 * ═══ TREI PE UN RÂND, DOUĂ PE TELEFON ═══
 *
 * Trei, nu patru, cerut de client: cu patru, panoul se întindea prea mult și
 * secțiunea se îngreuna. Rândul de trei ține caseta la fel de lată, dar cardurile
 * cresc de la 133 la 152px.
 *
 * ⚠ PE TELEFON SE VĂD DOAR DOUĂ, iar al treilea se ascunde sub `sm`. Trei pe un
 * rând într-o jumătate de 302px ies de 95px fiecare, adică o denumire de produs
 * tăiată după șapte litere. Iar două plus un al treilea rămas singur pe rândul de
 * dedesubt e chiar golul pe care îl evită numărul par.
 *
 * Se pierde un produs pe ecran mic. E o pierdere adevărată, dar mică: cele trei
 * carduri spun același lucru — „marfă de orice fel" — și îl spun și în doi.
 *
 * ⚠ DOUĂ OPRIRI DE LĂȚIME, amândouă măsurate:
 *   - 520px cât timp cardurile stau pe un rând sub `lg`. Fără ea, la 1023px —
 *     chiar sub pragul la care caseta se taie în două — ajungeau de 449px fiecare.
 *   - 340px sub `sm`, unde stau două câte două. Fără ea, pe un ecran de 639px poza
 *     sărea la 242px, adică mai mare decât ajunge vreodată pe desktop.
 */
export function PanouProduse() {
  return (
    <div className="mx-auto grid w-full max-w-[340px] grid-cols-2 gap-3 sm:max-w-[520px] sm:grid-cols-3 lg:max-w-none lg:gap-4">
      {PRODUSE_MIGRARE.map((produs, i) => (
        <CardProdus
          key={produs.id}
          produs={produs}
          /* Vezi nota de sus: al treilea pică pe telefon, ca să nu rămână singur
             pe un rând. Pe index, nu pe un câmp în date — e o hotărâre de
             așezare, nu o însușire a produsului. */
          ascunsPeTelefon={i === 2}
        />
      ))}
    </div>
  );
}

function CardProdus({
  produs,
  ascunsPeTelefon,
}: {
  produs: ProdusMigrare;
  ascunsPeTelefon?: boolean;
}) {
  return (
    <article
      className={`flex-col overflow-hidden rounded-[14px] border border-hairline bg-white ${
        ascunsPeTelefon ? "hidden sm:flex" : "flex"
      }`}
    >
      {/* Rama de 5px, ca pe „Optimizare". Vezi nota de sus. */}
      <div className="p-[5px]">
        <div className="relative aspect-square overflow-hidden rounded-[10px] bg-tint">
          <Poza produs={produs} />
        </div>
      </div>

      {/*
        Ordinea e cea din magazine, nu cea în care au fost cerute: categoria mică
        deasupra, denumirea, prețul jos și cel mai apăsat. Toate trei sunt acolo —
        doar așezate cum le așază un card de produs adevărat, fiindcă tocmai
        realismul e ce trebuie să iasă.
      */}
      <div className="px-3 pb-4 pt-2.5">
        <p className="truncate text-[10px] font-medium uppercase tracking-[0.08em] text-ink-3">
          {produs.categorie}
        </p>
        {/*
          Denumirea stă pe DOUĂ rânduri fixe, la toate cardurile: cu înălțime
          liberă, un produs cu nume scurt ar fi ridicat prețul cu un rând față de
          vecinul lui, iar cele patru prețuri n-ar mai fi fost pe aceeași linie.
          Într-o grilă, rândurile care nu se aliniază se văd înaintea oricărui text.
        */}
        <h3 className="mt-1 line-clamp-2 min-h-[2.6em] text-[13px] font-semibold leading-[1.3] tracking-[-0.02em] text-ink">
          {produs.nume}
        </h3>
        <p className="mt-1.5 text-[14px] font-bold tracking-[-0.02em] text-ink">
          {produs.pret}
        </p>
      </div>
    </article>
  );
}

function Poza({ produs }: { produs: ProdusMigrare }) {
  if (!produs.imagine) {
    /*
      Cât lipsește fișierul, se vede ce trebuie să arate poza și raportul cerut.
      Nu e o pagină neterminată lăsată să treacă: e chiar tiparul de la cardurile
      de pe pagina de start, ca secțiunea să fie gata înainte de fotografii și să
      se completeze fără să se atingă componenta.
    */
    return (
      <div className="absolute inset-0 flex flex-col items-center justify-center gap-1.5 px-2.5 text-center">
        <ImageIcon className="h-5 w-5 text-ink-3" strokeWidth={1.5} />
        <span className="text-[10.5px] font-medium leading-tight text-ink-2">
          {produs.descriere}
        </span>
        <span className="text-[10px] text-ink-3">1:1 pătrat</span>
      </div>
    );
  }

  return (
    /*
      `<img>` simplu, nu `next/image`, și e o decizie, nu o scăpare.

      Loader-ul proiectului lasă neatinse imaginile locale — prin el trece doar ce
      e pe R2 — deci `next/image` n-ar produce niciun `srcset` pentru ele și orice
      telefon ar descărca fișierul întreg. Socoteala mărimilor e în
      `lib/website/migrare.ts`.

      `width`/`height` rămân puse chiar dacă raportul e dat și de `aspect-square`:
      fără ele browserul nu știe raportul până nu vine fișierul, iar pe o rețea
      proastă layoutul sare.
    */
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={`${produs.imagine}-512.webp`}
      srcSet={LATIMI_POZA_PRODUS.map(
        (latime) => `${produs.imagine}-${latime}.webp ${latime}w`,
      ).join(", ")}
      sizes={SIZES_POZA_PRODUS}
      alt={produs.descriere}
      width={768}
      height={768}
      loading="lazy"
      decoding="async"
      /*
        `object-contain`, nu `cover`: pozele de produs vin decupate, cu produsul
        întreg în cadru. Tăiate ca să umple caseta, o geacă rămâne fără mâneci și
        un scaun fără picioare.
      */
      className="absolute inset-0 h-full w-full object-contain p-1.5"
    />
  );
}
