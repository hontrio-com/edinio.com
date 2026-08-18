import { ImageIcon } from "lucide-react";
import {
  LATIMI_POZA_PRODUS,
  PRODUSE_MIGRARE,
  SIZES_POZA_PRODUS,
  type ProdusMigrare,
} from "@/lib/website/migrare";

/**
 * Panoul secțiunii „Produse": o placă mare cu patru carduri de produs înăuntru.
 *
 * ═══ DE CE PATRU, ȘI DE CE ÎN PĂTRAT ═══
 *
 * Patru intră fix într-o grilă de doi pe doi, la orice lățime — și pe telefon, și
 * pe desktop, fără ca ultimul rând să rămână pe jumătate gol. Cu trei sau cu
 * cinci, undeva pe scara de ecrane apare golul, și se vede.
 *
 * ═══ TREI STRATURI, TREI FUNDALURI ═══
 *
 * Placa mare e albă cu umbră (`placa`), fiindcă secțiunea e albă și fără umbră
 * n-ar exista. Înăuntru, cardurile stau pe alb, deosebite prin chenar de un fir —
 * ca într-o listă de administrare adevărată, unde cardurile nu au umbră fiecare.
 * Iar caseta pozei e `bg-tint-2`, adică o nuanță mai jos: acolo unde vine
 * fotografia, fundalul trebuie să fie deja diferit, altfel un produs decupat pe
 * alb plutește fără să se vadă unde începe poza.
 *
 * ═══ POZELE ═══
 *
 * Pătrate, în trei mărimi, cu `<img>` și `srcSet` scris de mână — nu `next/image`.
 * Socoteala mărimilor și motivul sunt în `lib/website/migrare.ts`; pe scurt,
 * loader-ul proiectului lasă neatinse imaginile locale, deci `next/image` n-ar
 * produce niciun `srcset` și fiecare telefon ar descărca fișierul întreg.
 *
 * ⚠ Cât `imagine` lipsește din date, se vede substituentul cu ce trebuie să arate
 * poza. Nu e o pagină neterminată lăsată să treacă: e chiar tiparul de la
 * cardurile de pe pagina de start, ca secțiunea să fie gata înainte de fotografii
 * și să se completeze fără să se atingă componenta.
 */
export function PanouProduse() {
  return (
    /*
      ⚠ `max-w-[560px] mx-auto` DOAR sub `lg`, și e o măsurătoare, nu o
      înfrumusețare. Fără el, la 1023px — chiar sub pragul la care secțiunea trece
      pe două coloane — placa ia toată lățimea paginii, iar cardurile ajung de
      455px fiecare: patru poze de produs cât un ecran de telefon, într-o
      ilustrație. Oprită la 560, caseta pozei nu trece de 254px nicăieri, iar de
      acolo ies și cele trei mărimi de fișier.
    */
    <div className="placa mx-auto max-w-[560px] rounded-[20px] p-4 sm:p-5 lg:max-w-none">
      <div className="grid grid-cols-2 gap-3">
        {PRODUSE_MIGRARE.map((produs) => (
          <CardProdus key={produs.id} produs={produs} />
        ))}
      </div>
    </div>
  );
}

function CardProdus({ produs }: { produs: ProdusMigrare }) {
  return (
    <article className="overflow-hidden rounded-[14px] border border-hairline bg-white">
      <Poza produs={produs} />

      {/*
        Ordinea e cea din magazine, nu cea în care au fost cerute: categoria mică
        deasupra, denumirea, prețul jos și cel mai apăsat. Toate trei sunt acolo —
        doar așezate cum le așază un card de produs adevărat, fiindcă tocmai
        realismul e ce trebuie să iasă.
      */}
      <div className="px-3 py-3 sm:px-3.5">
        <p className="truncate text-[11px] font-medium uppercase tracking-[0.08em] text-ink-3">
          {produs.categorie}
        </p>
        {/*
          Denumirea stă pe DOUĂ rânduri fixe, la toate cardurile: cu înălțime
          liberă, un produs cu nume scurt ar fi ridicat prețul cu un rând față de
          vecinul lui, iar cele patru prețuri n-ar mai fi fost pe aceeași linie.
          Într-o grilă, rândurile care nu se aliniază se văd înaintea oricărui text.
        */}
        <h3 className="mt-1 line-clamp-2 min-h-[2.6em] text-[13px] font-medium leading-[1.3] text-ink sm:text-[14px]">
          {produs.nume}
        </h3>
        <p className="mt-1.5 text-[15px] font-bold tracking-[-0.02em] text-ink sm:text-[16px]">
          {produs.pret}
        </p>
      </div>
    </article>
  );
}

function Poza({ produs }: { produs: ProdusMigrare }) {
  return (
    <div className="relative aspect-square border-b border-hairline bg-tint-2">
      {produs.imagine ? (
        /*
          `<img>` simplu, nu `next/image` — vezi nota de sus.

          `width`/`height` rămân puse chiar dacă raportul e dat și de
          `aspect-square`: fără ele browserul nu știe raportul până nu vine
          fișierul, iar pe o rețea proastă layoutul sare.
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
            `object-contain`, nu `cover`: pozele de produs vin decupate, cu
            produsul întreg în cadru. Tăiate ca să umple caseta, o geacă rămâne
            fără mâneci și un scaun fără picioare.
          */
          className="absolute inset-0 h-full w-full object-contain p-2"
        />
      ) : (
        <div className="absolute inset-0 flex flex-col items-center justify-center gap-1.5 px-3 text-center">
          <ImageIcon className="h-5 w-5 text-ink-3" strokeWidth={1.5} />
          <span className="text-[11px] font-medium leading-tight text-ink-2">
            {produs.descriere}
          </span>
          <span className="text-[10px] text-ink-3">1:1 pătrat</span>
        </div>
      )}
    </div>
  );
}
