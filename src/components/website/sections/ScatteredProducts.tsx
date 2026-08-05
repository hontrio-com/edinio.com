import Image from "next/image";
import { PROBLEM_CHANNELS } from "@/lib/website/problem";

/**
 * Ilustrația din al doilea card: aceeași marfă, în trei locuri diferite.
 *
 * Trei panouri, câte unul pentru Facebook, Instagram și WhatsApp, fiecare cu
 * sigla lui sus și cu două produse dedesubt. Ideea se citește din compoziție, nu
 * din text: trei coloane egale, niciuna „principală", deci niciun loc în care să
 * fie totul.
 *
 * ═══ CE E DE ȘTIUT DACĂ SE UMBLĂ LA EA ═══
 *
 * 1. **Exact două produse pe canal.** Panourile sunt egale ca înălțime fiindcă au
 *    același număr de rânduri. Cu trei într-unul și două în altele, colțurile de
 *    jos nu se mai aliniază și cade tot desenul. Dacă chiar trebuie un număr
 *    variabil, panourile au nevoie de înălțime fixă și de tăiere.
 * 2. **Siglele se aliniază pe ÎNĂLȚIME, nu pe lățime.** WhatsApp are altă
 *    proporție decât celelalte două: cutia lui e 1173x1475, deci mai înaltă decât
 *    lată, pe când Facebook și Instagram sunt pătrate. Cu lățime fixă ar fi ieșit
 *    vizibil mai mare decât ele. Aceeași capcană ca la siglele de curieri.
 * 3. **Totul e ascuns de cititoarele de ecran** (`aria-hidden`). Ilustrația
 *    repetă exact ce scrie în descrierea cardului — „câteva sunt pe Facebook,
 *    altele pe Instagram, iar restul prin mesaje". Anunțate, cele șase poze și
 *    cele trei sigle ar fi însemnat aceeași informație spusă de două ori.
 *
 * Nicio animație aici, dinadins. Primul card are firul de mesaje care sosește; un
 * al doilea desen care se mișcă, imediat lângă el, s-ar bate cu primul.
 */

export function ScatteredProducts() {
  return (
    <div
      aria-hidden
      className="flex h-full w-full items-center justify-center px-3 sm:px-3.5"
    >
      <div className="grid w-full grid-cols-3 gap-2 sm:gap-2.5">
        {PROBLEM_CHANNELS.map((channel) => (
          <div
            key={channel.id}
            className="rounded-[10px] border border-hairline bg-white p-1.5"
            style={{
              boxShadow:
                "0 1px 1px rgba(10,10,10,0.03), 0 6px 14px -8px rgba(10,10,10,0.16)",
            }}
          >
            {/*
              Sigla stă liberă, fără casetă în jur. A avut una — un pătrat alb cu
              chenar, ca o filă de aplicație — și clientul a cerut-o scoasă. Fără
              ea, sigla are voie să fie mai mare: caseta ocupa 28px din care sigla
              folosea doar 16.
            */}
            <div className="mb-2 flex h-5 items-center justify-center">
              <Image
                src={channel.logo}
                alt=""
                width={20}
                height={20}
                unoptimized
                /* `h-*` fix, `w-auto` liber: vezi nota 2 de sus. */
                className="h-[18px] w-auto sm:h-5"
              />
            </div>

            <div className="space-y-1.5">
              {channel.products.map((product) => (
                <div
                  key={product}
                  className="relative aspect-square overflow-hidden rounded-[7px] bg-tint-2"
                >
                  <Image
                    src={product}
                    alt=""
                    fill
                    /*
                      Miniatura are vreo 86px pe desktop și scade la ~45px pe
                      tabletă, unde cardurile sunt cele mai înguste. Fișierele
                      sunt 400x400 și 3-6KB, deci `unoptimized` e alegerea bună:
                      loader-ul proiectului oricum lasă neatinse imaginile locale.
                    */
                    sizes="90px"
                    unoptimized
                    className="object-cover"
                  />
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
