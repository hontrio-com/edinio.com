import Link from "next/link";
import {
  Building2, CreditCard, ExternalLink, Lock, MessageSquareText, Package, ReceiptText, Route, Truck, Undo2, UserRound,
} from "lucide-react";
import type { DetaliuComanda, LinieComanda } from "@/lib/cont/comenzi";
import type { RandDeBaniDinCont } from "@/lib/cont/banii-comenzii";
import type { RandDetaliu } from "@/lib/cont/detalii-checkout";
import { cronologia } from "@/lib/cont/cronologie";
import { livrarea } from "@/lib/cont/livrare";
import { numeleMetodei, stareaPlatii } from "@/lib/cont/plata";
import { formatDate, formatPhoneDisplay, formatPrice, pluralRo, unitarSeInchide } from "@/lib/utils/format";
import { AnuleazaComanda } from "../AnuleazaComanda";
import { CopiazaText } from "../CopiazaText";
import { AjutorMagazin, type ContactMagazin } from "../ui/CadruCont";
import { BlocDocument } from "./BlocDocument";
import { EtichetaStareCont, ListaDate, Mesaj, Miniatura, PasiComanda, RandDate, Sectiune } from "../ui/piese";
import { BUTON_PRIMAR, BUTON_SECUNDAR, FOCUS, STIL_PRIMAR } from "../ui/clase";

/**
 * O comanda, cu toate detaliile.
 *
 * ⚠ Vederea REDUSA (comanda legata doar pe numarul ei) arata numar, data, stare,
 * linii si total. Poarta e in BAZA, care intoarce NULL pe restul; ecranul doar nu
 * deseneaza carduri goale.
 */

function fisiere(n: number): string {
  return n === 1 ? "1 fisier incarcat" : `${pluralRo(n, "fisier", "fisiere")} incarcate`;
}

function Linie({ l }: { l: LinieComanda }) {
  const total = l.pret * l.cantitate;
  const gratuit = total === 0 && !l.extra;
  const legatura = l.slug && !l.extra ? `/product/${l.slug}` : null;
  const poza = <Miniatura imagine={l.imagine} nume={l.nume} />;

  return (
    <li className="flex gap-3 py-4 first:pt-0 last:pb-0 sm:gap-4">
      {legatura ? (
        <Link href={legatura} className={`shrink-0 rounded-[var(--st-radius-sm)] ${FOCUS}`} tabIndex={-1} aria-hidden="true">
          {poza}
        </Link>
      ) : poza}

      <div className="min-w-0 flex-1">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            {legatura ? (
              <Link href={legatura} className={`rounded-sm text-sm font-semibold leading-snug text-[var(--st-text)] hover:underline ${FOCUS}`}>
                {l.nume}
              </Link>
            ) : (
              <p className="text-sm font-semibold leading-snug text-[var(--st-text)]">{l.nume}</p>
            )}
            <p className="mt-1 text-xs text-[var(--st-muted)]">
              {l.extra ? "Optiune adaugata la comanda" : `Cantitate: ${l.cantitate}`}
              {/* ⚠ Pretul pe bucata se arata NUMAI cand, inmultit, da chiar totalul de langa el. */}
              {!l.extra && l.cantitate > 1 && unitarSeInchide(l.pret, l.cantitate) && <> · {formatPrice(l.pret)} / buc.</>}
            </p>
          </div>
          <p className="shrink-0 text-sm font-semibold tabular-nums text-[var(--st-text)]">
            {gratuit ? "Gratuit" : formatPrice(total)}
          </p>
        </div>

        {l.personalizare && l.personalizare.length > 0 && (
          <dl className="mt-3 space-y-1 rounded-[var(--st-radius-sm)] bg-[var(--st-primary-soft)] px-3 py-2.5 text-xs">
            {l.personalizare.map((p, i) => (
              <div key={i} className="flex flex-wrap gap-x-1.5">
                <dt className="text-[var(--st-muted)]">{p.eticheta}:</dt>
                <dd className="min-w-0 break-words font-medium text-[var(--st-text)]">
                  {p.valoare ?? (p.fisiere ? fisiere(p.fisiere) : "")}
                </dd>
              </div>
            ))}
          </dl>
        )}

        {l.defalcare && l.defalcare.length > 0 && (
          <details className="group mt-2 text-xs">
            <summary className={`cursor-pointer select-none rounded-sm font-medium text-[var(--st-muted)] hover:text-[var(--st-text)] ${FOCUS}`}>
              Cum s-a calculat pretul
            </summary>
            <ul className="mt-2 space-y-1">
              {l.defalcare.map((d, i) => (
                <li key={i} className="flex items-baseline justify-between gap-3">
                  <span className="min-w-0 text-[var(--st-muted)]">
                    {d.eticheta}
                    {d.detaliu && <span className="opacity-80"> ({d.detaliu})</span>}
                  </span>
                  {d.suma !== null && <span className="shrink-0 tabular-nums text-[var(--st-text)]">{formatPrice(d.suma)}</span>}
                </li>
              ))}
            </ul>
          </details>
        )}
      </div>
    </li>
  );
}

export function EcranComanda({
  c,
  bani,
  detalii,
  contact,
  numeMagazin,
  adresaMagazin,
}: {
  c: DetaliuComanda;
  bani: RandDeBaniDinCont[];
  detalii: RandDetaliu[];
  contact: ContactMagazin;
  numeMagazin: string;
  adresaMagazin: string | null;
}) {
  const redusa = c.vedere === "redusa";
  const livrare = livrarea(c.livrare);
  const cron = cronologia({ stare: c.stare, creataLa: c.creataLa, awbEmisLa: c.awbEmisLa, ridicare: livrare?.fel === "ridicare" });
  const plata = stareaPlatii({ stare: c.stare, incasata: c.incasata, metoda: c.metodaPlata, starePlata: c.starePlata });
  const metoda = numeleMetodei(c.metodaPlata);
  const marfa = c.linii.filter((l) => !l.extra).reduce((s, l) => s + l.cantitate, 0);
  const poateReturna = !redusa && (c.stare === "shipped" || c.stare === "delivered");

  return (
    <>
      <Sectiune titlu="Stadiul comenzii" icon={Route}>
        <PasiComanda c={cron} />
      </Sectiune>

      {redusa && (
        /*
          ⚠ Vederea REDUSA e starea comenzilor revendicate cu numarul comenzii
          plus un contact. Numerele de comanda sunt secventiale la aproape toate
          magazinele, deci usa aceea e un oracol: pana cand un contact DE PE
          comanda e verificat printr-un cod, adresa, factura si AWB-ul nu se arata.
        */
        <Mesaj>
          <span className="inline-flex items-center gap-1.5 font-semibold"><Lock className="h-3.5 w-3.5" aria-hidden="true" />Comanda arata putin.</span>{" "}
          A fost legata de cont doar pe numarul ei. Adresa de livrare, factura si urmarirea coletului se deschid dupa ce
          confirmi, printr-un cod, un contact de pe comanda.
        </Mesaj>
      )}

      <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_22rem] xl:items-start">
        <div className="min-w-0 space-y-5">
          <Sectiune titlu="Produse" descriere={pluralRo(marfa, "produs", "produse")} icon={Package}>
            <ul className="divide-y divide-[var(--st-border)]">
              {c.linii.map((l, i) => (
                <Linie key={i} l={l} />
              ))}
            </ul>
          </Sectiune>

          {!redusa && livrare && (
            <Sectiune titlu="Livrare" descriere={livrare.titlu} icon={Truck}>
              <ListaDate>
                {livrare.metoda && <RandDate eticheta="Metoda aleasa">{livrare.metoda}</RandDate>}
                {livrare.fel === "punct" && livrare.punct && <RandDate eticheta="Punct de ridicare">{livrare.punct}</RandDate>}
                {livrare.adresa.length > 0 && (
                  <RandDate eticheta={livrare.fel === "punct" ? "Adresa punctului" : "Adresa"}>
                    {livrare.adresa.map((r, i) => <span key={i} className="block">{r}</span>)}
                  </RandDate>
                )}
                {livrare.fel === "ridicare" && (
                  <RandDate eticheta="Ridici de la">{adresaMagazin ?? numeMagazin}</RandDate>
                )}
                {(livrare.destinatar.nume || livrare.destinatar.telefon) && (
                  <RandDate eticheta={livrare.fel === "ridicare" ? "Ridica" : "Destinatar"}>
                    {livrare.destinatar.nume && <span className="block">{livrare.destinatar.nume}</span>}
                    {livrare.destinatar.telefon && (
                      <span className="block font-normal text-[var(--st-muted)]">{formatPhoneDisplay(livrare.destinatar.telefon)}</span>
                    )}
                  </RandDate>
                )}
                {c.awb ? (
                  <>
                    {c.numeCurier && <RandDate eticheta="Curier">{c.numeCurier}</RandDate>}
                    <RandDate eticheta="Numar AWB">
                      <span className="inline-flex flex-wrap items-center gap-x-2">
                        <span className="tabular-nums">{c.awb}</span>
                        <CopiazaText text={c.awb} eticheta="Copiaza numarul AWB" />
                      </span>
                    </RandDate>
                    {c.awbEmisLa && <RandDate eticheta="Predat curierului">{formatDate(c.awbEmisLa)}</RandDate>}
                  </>
                ) : !cron.capat && c.stare !== "delivered" ? (
                  <RandDate eticheta="Urmarire">
                    <span className="font-normal text-[var(--st-muted)]">Numarul de urmarire apare aici cand coletul pleaca.</span>
                  </RandDate>
                ) : null}
              </ListaDate>
              {c.urmarire && (
                <a href={c.urmarire} target="_blank" rel="noopener noreferrer" className={`${BUTON_PRIMAR} mt-5`} style={STIL_PRIMAR}>
                  Urmareste coletul
                  <ExternalLink className="h-4 w-4" aria-hidden="true" />
                </a>
              )}
            </Sectiune>
          )}

          {!redusa && detalii.length > 0 && (
            <Sectiune titlu="Mentiuni la comanda" icon={MessageSquareText}>
              <ListaDate>
                {detalii.map((d, i) => (
                  <RandDate key={i} eticheta={d.eticheta}>
                    <span className="whitespace-pre-line">{d.valoare}</span>
                  </RandDate>
                ))}
              </ListaDate>
            </Sectiune>
          )}
        </div>

        <div className="min-w-0 space-y-5">
          <Sectiune titlu="Sumar plata" icon={CreditCard}>
            <div className="space-y-1">
              {bani.map((r) => (
                <div key={r.eticheta} className="flex items-baseline justify-between gap-4 py-1 text-sm">
                  <span className="text-[var(--st-muted)]">{r.eticheta}</span>
                  <span className="text-right font-medium tabular-nums text-[var(--st-text)]">{r.valoare}</span>
                </div>
              ))}
            </div>
            <div className="mt-3 flex items-baseline justify-between gap-4 border-t border-[var(--st-border)] pt-3">
              <span className="text-sm font-semibold text-[var(--st-text)]">Total</span>
              <span className="text-lg font-bold tabular-nums text-[var(--st-text)]">{formatPrice(c.total)}</span>
            </div>
            {c.economieOferte !== null && c.economieOferte > 0 && (
              <p className="mt-2 text-xs text-[var(--st-muted)]">
                Ai economisit {formatPrice(c.economieOferte)} din oferte, deja scazuti din preturi.
              </p>
            )}
            <div className="mt-4 flex flex-wrap items-center justify-between gap-2 rounded-[var(--st-radius-sm)] border border-[var(--st-border)] px-3 py-2.5">
              <span className="text-sm text-[var(--st-text)]">{metoda ?? "Plata"}</span>
              <EtichetaStareCont ton={plata.ton}>{plata.text}</EtichetaStareCont>
            </div>
          </Sectiune>

          {!redusa && (
            <Sectiune titlu="Factura" icon={ReceiptText}>
              {c.factura ? (
                <BlocDocument doc={c.factura} orderId={c.orderId} emailMagazin={contact.email} />
              ) : (
                <p className="text-sm leading-relaxed text-[var(--st-muted)]">
                  {cron.capat
                    ? "Pentru aceasta comanda nu exista o factura emisa."
                    : "Factura apare aici dupa ce magazinul o emite. Primesti si un email."}
                </p>
              )}
            </Sectiune>
          )}

          {!redusa && (c.firma || livrare) && (
            <Sectiune titlu="Date de facturare" icon={c.firma ? Building2 : UserRound}>
              {c.firma ? (
                <ListaDate>
                  <RandDate eticheta="Firma">{c.firma.denumire}</RandDate>
                  {c.firma.cui && (
                    <RandDate eticheta="CUI">
                      {c.firma.platitorTva && !/^ro/i.test(c.firma.cui) ? `RO${c.firma.cui}` : c.firma.cui}
                    </RandDate>
                  )}
                  {c.firma.regCom && <RandDate eticheta="Reg. com.">{c.firma.regCom}</RandDate>}
                  {(c.firma.adresa || c.firma.oras) && (
                    <RandDate eticheta="Sediu">
                      {[c.firma.adresa, c.firma.oras, c.firma.judet].filter(Boolean).join(", ")}
                    </RandDate>
                  )}
                </ListaDate>
              ) : livrare ? (
                <ListaDate>
                  <RandDate eticheta="Persoana fizica">{livrare.destinatar.nume ?? "-"}</RandDate>
                  {livrare.destinatar.email && <RandDate eticheta="Email">{livrare.destinatar.email}</RandDate>}
                  {livrare.destinatar.telefon && <RandDate eticheta="Telefon">{formatPhoneDisplay(livrare.destinatar.telefon)}</RandDate>}
                </ListaDate>
              ) : null}
            </Sectiune>
          )}

          {!redusa && (c.stare === "pending" || poateReturna) && (
            <Sectiune titlu="Actiuni" icon={Undo2}>
              <div className="space-y-4">
                {c.stare === "pending" && (
                  <div className="space-y-2">
                    <p className="text-sm leading-relaxed text-[var(--st-muted)]">
                      Comanda n-a intrat inca in lucru, deci o poti anula de aici.
                    </p>
                    {/* ⚠ Butonul apare numai la `pending`, dar apararea e in baza, nu aici. */}
                    <AnuleazaComanda orderId={c.orderId} />
                  </div>
                )}
                {poateReturna && (
                  <div className="space-y-2">
                    <p className="text-sm leading-relaxed text-[var(--st-muted)]">
                      Ai dreptul sa te retragi din contract in cel putin 14 zile de la primirea produselor.
                    </p>
                    <Link href={`/retur?order=${encodeURIComponent(c.numar)}`} className={BUTON_SECUNDAR}>
                      <Undo2 className="h-4 w-4" aria-hidden="true" />
                      Retrage-te din contract
                    </Link>
                  </div>
                )}
              </div>
            </Sectiune>
          )}

          <AjutorMagazin contact={contact} numeMagazin={numeMagazin} subiect={`Comanda ${c.numar}`} />
        </div>
      </div>
    </>
  );
}
