import { CARDURI_PERFORMANTA, PERFORMANTA } from "@/lib/website/optimizare";
import { SectionEyebrow } from "../SectionEyebrow";
import { PanouImagini } from "./PanouImagini";
import { PanouPageSpeed } from "./PanouPageSpeed";

/**
 * Secțiunea „Performanță" de pe pagina „Optimizare".
 *
 * Cardurile sunt cele de la „Problema" de pe pagina de start, cerute de client:
 * trei într-un rând, cu ilustrația sus și textul dedesubt.
 *
 * ⚠ Prima formă folosea cardurile LATE de la „Soluția" — cele care se strâng în
 * teanc la derulare. Clientul a lămurit că se referea la celelalte. Scris aici ca
 * să nu se ia din nou drumul greșit: „ca pe prima pagină" înseamnă cardurile de
 * la Problema.
 *
 * ═══ DESENUL CARDULUI ═══
 *
 * Colțurile sunt 16px afară și 11px înăuntru, cu 5px între ele. Ca două colțuri
 * concentrice să pară paralele, raza interioară trebuie să fie cea exterioară
 * minus distanța dintre ele; cu aceeași rază în amândouă părțile, cel din
 * interior arată prea rotund. Aceleași numere ca la „Problema" — dacă se schimbă
 * acolo, se schimbă și aici.
 *
 * ⚠ NEÎNCHEIATĂ: clientul a cerut TREI carduri. Sunt două; al treilea se adaugă
 * în `CARDURI_PERFORMANTA` când vine textul, plus ilustrația lui mai jos. Nu se
 * pun substituenți cu text inventat pe o pagină comercială.
 */
export function SectiunePerformanta() {
  return (
    <section id="performanta" className="bg-white">
      <div className="mx-auto max-w-[1200px] px-5 pt-20 pb-24 sm:px-6 lg:px-8 lg:pt-28 lg:pb-32">
        <div className="mx-auto max-w-[720px] text-center">
          <SectionEyebrow label={PERFORMANTA.eyebrow} />

          <h2 className="mt-6 text-[32px] font-bold leading-[1.08] tracking-[-0.03em] text-ink sm:text-[44px]">
            {PERFORMANTA.titlu}
          </h2>
          <p className="mt-5 text-[16px] leading-[1.6] text-ink-2 sm:text-[18px]">
            {PERFORMANTA.descriere}
          </p>
        </div>

        {/*
          ⚠ `sm:grid-cols-2 lg:grid-cols-3`, nu `md:grid-cols-3` ca la „Problema",
          si e o socoteala, nu un gust. Acolo ilustratia e o fotografie, care
          arata bine oricat de mica. Aici e un panou cu patru cadrane si patru
          etichete. La `md` cu trei coloane, cardul are 229px, deci ilustratia
          4:3 ramane cu 209x157 — iar patru cadrane cu etichete au nevoie de vreo
          150px inaltime doar ele. Cu doua coloane pana la `lg`, cardul are 352px
          la aceeasi latime de ecran, si incape.
        */}
        <div className="mt-14 grid gap-6 sm:grid-cols-2 lg:mt-20 lg:grid-cols-3 lg:gap-7">
          {CARDURI_PERFORMANTA.map((card) => (
            <article
              key={card.id}
              className="flex flex-col overflow-hidden rounded-[16px] border border-hairline bg-white"
            >
              <div className="p-[5px]">
                <div className="relative aspect-[4/3] overflow-hidden rounded-[11px] bg-tint">
                  {/*
                    Se alege pe `id`, nu se pune aceeași ilustrație la toate:
                    fiecare card are desenul lui, iar un panou pus aici fără
                    condiție le-ar fi arătat pe toate la fel.
                  */}
                  {card.id === "incarcare" ? <PanouPageSpeed /> : null}
                  {card.id === "imagini" ? <PanouImagini /> : null}
                </div>
              </div>

              {/*
                `px-4`, nu `px-5`, ca la „Problema": cei opt pixeli câștigați nu
                sunt cosmetici, ei fac diferența dintre un titlu pe un rând și unul
                pe două.
              */}
              <div className="px-4 pb-6 pt-4 sm:pb-7 sm:pt-5">
                <h3 className="text-[15px] font-semibold leading-[1.35] tracking-[-0.02em] text-ink">
                  {card.titlu}
                </h3>
                <p className="mt-2 text-[13.5px] leading-[1.55] text-ink-2">
                  {card.descriere}
                </p>
              </div>
            </article>
          ))}
        </div>
      </div>
    </section>
  );
}
