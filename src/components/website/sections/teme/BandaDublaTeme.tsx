import "@/app/teme-animat.css";
import { OprireInAfaraEcranului } from "@/components/website/OprireInAfaraEcranului";
import { adresaTigla } from "@/lib/website/teme-banda";

/**
 * Banda dubla din hero-ul paginii „/teme” (16.11.2026; aleasa de el dintre cinci variante): doua randuri de ferestre cu
 * teme, care curg incet in sensuri opuse, sub text, stinse pe margini. Desenul si de ce e facut asa:
 * `app/teme-animat.css`.
 *
 * Decor: `aria-hidden`, fara legaturi (cardurile de dedesubt le au pe toate). Imaginile cu `fetchPriority="low"`: textul
 * hero-ului e cel care trebuie sa apara primul.
 */
export function BandaDublaTeme({ randuri }: { randuri: readonly (readonly string[])[] }) {
  return (
    <div aria-hidden="true" className="banda-teme">
      <OprireInAfaraEcranului />
      {randuri.map((rand, r) => (
        <div key={r} className="banda-teme__rand" data-sens={r % 2 === 0 ? "stanga" : "dreapta"}>
          {/* De doua ori: bucla se muta jumatate din rand (vezi foaia de stil). */}
          {[...rand, ...rand].map((cheie, i) => (
            <figure key={`${cheie}-${i}`} className="banda-teme__card">
              <div className="banda-teme__bara">
                <span className="banda-teme__puncte" />
                <span className="banda-teme__adresa">{cheie}.edinio.com</span>
              </div>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={adresaTigla(cheie)} width={440} height={550} alt="" decoding="async" fetchPriority="low" />
            </figure>
          ))}
        </div>
      ))}
    </div>
  );
}
