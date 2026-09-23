import Link from "next/link";
import { ArrowRight, Package, PackageSearch, ReceiptText, Truck, Undo2, type LucideIcon } from "lucide-react";
import type { ComandaDinCont } from "@/lib/cont/comenzi";
import type { RezumatCont } from "@/lib/cont/rezumat";
import { cronologia } from "@/lib/cont/cronologie";
import { orderStatus } from "@/lib/orders/status";
import { formatDate, formatPrice } from "@/lib/utils/format";
import { CardComanda } from "./CardComanda";
import { EtichetaStareCont, Mesaj, Miniatura, PasiComanda, Sectiune, StareGoala } from "../ui/piese";
import { BUTON_PRIMAR, BUTON_SECUNDAR, CARD, FOCUS, LEGATURA, STIL_PRIMAR, TITLU } from "../ui/clase";

/**
 * Pagina de start a contului.
 *
 * ⚠ Construita in jurul COMENZII: jumatate din oamenii care intra in cont vin sa
 * vada unde e coletul (Baymard), deci comanda in curs sta sus, cu pasii ei.
 * ⚠ Fara reclame si fara recomandari: nu avem de unde sti ce i-ar placea omului,
 * iar un card de vanzare intr-un ecran de cont se citeste ca o intruziune.
 */

function Placa({ href, icon: Icon, numar, eticheta }: { href: string; icon: LucideIcon; numar: number; eticheta: string }) {
  return (
    <Link href={href} className={`${CARD} group flex items-center gap-3 p-4 transition-colors hover:border-[var(--st-muted)] ${FOCUS}`}>
      <span className="grid h-10 w-10 shrink-0 place-items-center rounded-[var(--st-radius-sm)] bg-[var(--st-primary-soft)]">
        <Icon className="h-5 w-5 text-[var(--st-text)]" strokeWidth={1.7} aria-hidden="true" />
      </span>
      <span className="min-w-0">
        <span className="block text-xl font-semibold leading-none tabular-nums text-[var(--st-text)]">{numar}</span>
        <span className="mt-1 block truncate text-xs font-medium text-[var(--st-muted)]">{eticheta}</span>
      </span>
    </Link>
  );
}

export function EcranAcasa({
  rezumat,
  recente,
  inCurs,
}: {
  rezumat: RezumatCont;
  recente: ComandaDinCont[];
  inCurs: ComandaDinCont | null;
}) {
  if (rezumat.comenzi === 0) {
    return (
      <>
        <StareGoala
          icon={PackageSearch}
          titlu="Inca nu ai comenzi in contul asta"
          actiune={<Link href="/" className={BUTON_PRIMAR} style={STIL_PRIMAR}>Mergi la magazin</Link>}
        >
          Comenzile se leaga singure de adresa de email cu care ai intrat. Daca ai comandat cu alta adresa, adaug-o in{" "}
          <Link href="/cont/date" className={LEGATURA}>Datele mele</Link> si le vei vedea aici.
        </StareGoala>
      </>
    );
  }

  const st = inCurs ? orderStatus(inCurs.stare) : null;
  const pasi = inCurs ? cronologia({ stare: inCurs.stare, creataLa: inCurs.creataLa, awbEmisLa: null, ridicare: false }) : null;

  return (
    <>
      <div className="grid grid-cols-2 gap-3 xl:grid-cols-4">
        <Placa href="/cont/comenzi" icon={Package} numar={rezumat.comenzi} eticheta="Comenzi" />
        <Placa href="/cont/comenzi" icon={Truck} numar={rezumat.inCurs} eticheta="In curs" />
        <Placa href="/cont/facturi" icon={ReceiptText} numar={rezumat.facturi} eticheta="Facturi" />
        <Placa href="/cont/retururi" icon={Undo2} numar={rezumat.retururi} eticheta="Retururi" />
      </div>

      {inCurs && st && pasi && (
        <section className={`${CARD} p-5 sm:p-6`} aria-labelledby="in-curs-titlu">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div className="min-w-0">
              <p className="text-[11px] font-semibold uppercase tracking-widest text-[var(--st-muted)]">Comanda in curs</p>
              <h2 id="in-curs-titlu" className="mt-1 text-lg font-semibold tabular-nums text-[var(--st-text)]" style={TITLU}>
                Comanda {inCurs.numar}
              </h2>
              <p className="mt-0.5 text-sm text-[var(--st-muted)]">
                Plasata pe {formatDate(inCurs.creataLa)} · {formatPrice(inCurs.total)}
              </p>
            </div>
            <EtichetaStareCont ton={st.ton}>{st.label}</EtichetaStareCont>
          </div>

          <div className="mt-5 flex items-center gap-2">
            {inCurs.miniaturi.map((m, i) => (
              <Miniatura key={i} imagine={m.imagine} nume={m.nume} marime="sm" />
            ))}
          </div>

          <div className="mt-6">
            <PasiComanda c={pasi} />
          </div>

          <div className="mt-5">
            <Link href={`/cont/comenzi/${inCurs.orderId}`} className={BUTON_PRIMAR} style={STIL_PRIMAR}>
              Vezi comanda
              <ArrowRight className="h-4 w-4" aria-hidden="true" />
            </Link>
          </div>
        </section>
      )}

      <Sectiune
        titlu="Comenzi recente"
        icon={Package}
        actiune={
          rezumat.comenzi > recente.length ? (
            <Link href="/cont/comenzi" className={`${BUTON_SECUNDAR} min-h-9 px-3`}>Vezi toate</Link>
          ) : undefined
        }
      >
        <div className="space-y-3">
          {recente.map((c) => (
            <CardComanda key={c.orderId} c={c} />
          ))}
        </div>
      </Sectiune>

      <Mesaj>
        <span className="font-semibold">Nu vezi o comanda?</span> Comenzile se leaga singure de adresele de email
        confirmate in cont. Daca ai comandat cu alta adresa, adaug-o in{" "}
        <Link href="/cont/date" className={LEGATURA}>Datele mele</Link>.
      </Mesaj>
    </>
  );
}
