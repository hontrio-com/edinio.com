"use client";

import Image from "next/image";
import { Package, Check, ArrowRight, Gift, Repeat } from "lucide-react";
import { formatPrice } from "@/lib/utils/format";
import { useAfisariOferte } from "@/lib/offers/use-afisari-oferte";
import type { LinieDeOferta } from "@/lib/offers/linii-acceptate";
import type { OfferProduct, ResolvedOffer } from "@/lib/offers/offer.types";

/**
 * Ofertele care se bifează în formularul de comandă: bump-ul, upgrade-ul,
 * „cumperi X primești Y" și cadoul. Toate patru adaugă un produs adevărat cu o
 * apăsare, iar prețul special e autoritar (se socotește pe server, în
 * `resolveCartOffers`); bifarea trimite id-ul ofertei, iar calea comenzii
 * repretuiește linia — prețul din browser e doar o previzualizare.
 *
 * Nu randează nimic când nu e nicio ofertă, deci checkout-ul rămâne neschimbat.
 *
 * ⚠⚠ AICI SE NUMĂRĂ ȘI AFIȘAREA, și e singurul loc din care se putea:
 * componenta asta e desenată de amândouă formularele de comandă (`OrderModal` și
 * `CheckoutForm`). Până la 22.09.2026 `order_bump` avea pe producție 0 afișări
 * și 29 de conversii: baliza exista, dar era legată doar la pagina de produs.
 *
 * ⚠ CE SE ARATĂ vine gata filtrat de formular (`ofertePeCareLePoateArata`), nu
 * se mai filtrează aici. Erau două filtre scrise de mână, câte unul în fiecare
 * formular; cu patru tipuri, dintre care unul scoate o linie din coș, cele două
 * copii s-ar fi despărțit — iar despărțirea se vede în bani.
 */

/** O ofertă gata de desenat: ce intră în comandă și, la schimb, ce iese. */
export interface OfertaDeAratat {
  oferta: ResolvedOffer;
  /** Linia care intră dacă e bifată. */
  linie: LinieDeOferta;
  /** `upgrade`: linia din coș pe care o înlocuiește. */
  schimba?: { nume: string; pretPeBucata: number };
}

export function OferteDinFormular({ businessId, oferte, color, acceptedIds, onToggle, onAlege }: {
  businessId: string;
  oferte: OfertaDeAratat[];
  color: string;
  acceptedIds: Set<string>;
  onToggle: (offer: ResolvedOffer, checked: boolean) => void;
  /** Cadoul la alegere: cumpărătorul a apăsat pe alt produs. */
  onAlege?: (offerId: string, productId: string) => void;
}) {
  // ⚠ ÎNAINTE de ieșirea pe `null`: un hook chemat după o ieșire scurtă e chemat
  // de un număr diferit de ori de la o randare la alta, și React cade.
  const gazda = useAfisariOferte(businessId, oferte.map((o) => o.oferta.id), true);
  if (oferte.length === 0) return null;

  return (
    <div ref={gazda} className="space-y-2">
      {oferte.map((x) => (
        <RandDeOferta key={x.oferta.id} x={x} color={color}
          checked={acceptedIds.has(x.oferta.id)}
          onToggle={(c) => onToggle(x.oferta, c)}
          onAlege={onAlege} />
      ))}
    </div>
  );
}

/**
 * ⚠ UN SINGUR RÂND PENTRU TOATE PATRU, cu bucăți care se aprind după tip.
 * Scrise ca patru componente, bifa, chenarul și felul în care se apasă ar fi
 * ajuns patru variante ale aceluiași lucru — iar cumpărătorul ar fi văzut patru
 * feluri de a bifa în același formular.
 */
function RandDeOferta({ x, color, checked, onToggle, onAlege }: {
  x: OfertaDeAratat;
  color: string;
  checked: boolean;
  onToggle: (checked: boolean) => void;
  onAlege?: (offerId: string, productId: string) => void;
}) {
  const { oferta: o, linie, schimba } = x;
  const p = linie.product;
  const areReducere = linie.pretIntreg > linie.pret;
  const gratuit = linie.pret <= 0;
  const laAlegere = o.reguli?.laAlegere === true && o.products.length > 1;

  /*
    ⚠ „+30 lei" NU e prețul produsului mare, ci DIFERENȚA față de ce iese din
    coș. Scris ca preț, oferta ar fi arătat mai scumpă decât e: cumpărătorul
    compară cu ce are deja, nu cu zero.
  */
  const diferenta = schimba ? Math.round((linie.pret - schimba.pretPeBucata) * 100) / 100 : null;

  /*
    ═══ ⚠⚠ PREȚUL COBOARĂ SUB NUME PE TELEFON ═══

    Măsurat într-un cadru de 390px: cardul are 253px, din care bifa, miniatura
    și distanțele iau 116. Cu prețul ținut în dreapta, numelui îi rămâneau 46 de
    pixeli — „Lumâna…”. Adică exact produsul pe care oferta îl vinde nu se putea
    citi.

    ⚠ ACELAȘI BLOC, DESENAT ÎN DOUĂ LOCURI, nu două forme scrise separat: una
    sub nume până la `sm`, una în dreapta de la `sm` în sus. Scrise separat,
    telefonul și desktopul ar fi putut ajunge să scrie prețuri diferite.
  */
  const pret = (
    <>
      {diferenta !== null ? (
        <>
          {/* ⚠ `whitespace-nowrap`: la 360px „+20 lei" se rupea in „+20" si „lei". */}
          <p className="text-sm font-bold whitespace-nowrap" style={{ color }}>
            {diferenta > 0 ? `+${formatPrice(diferenta)}` : diferenta < 0 ? formatPrice(diferenta) : "fără cost"}
          </p>
          <p className="min-w-0 text-xs text-muted-foreground">{formatPrice(linie.pret)} în loc de {formatPrice(schimba!.pretPeBucata)}</p>
        </>
      ) : (
        <>
          <p className="text-sm font-bold whitespace-nowrap" style={{ color }}>{gratuit ? "Gratuit" : formatPrice(linie.pret)}</p>
          {areReducere && <p className="whitespace-nowrap text-xs text-muted-foreground line-through">{formatPrice(linie.pretIntreg)}</p>}
        </>
      )}
    </>
  );

  return (
    <div className="rounded-xl border-2 border-dashed transition-all"
      style={checked
        ? { borderColor: color, backgroundColor: `${color}0d` }
        : { borderColor: "var(--color-border)", backgroundColor: "transparent" }}>
      <button type="button" onClick={() => onToggle(!checked)} className="w-full text-left p-3">
        <div className="flex items-center gap-3">
          <div className="w-5 h-5 rounded flex items-center justify-center border-2 flex-shrink-0 transition-colors"
            style={checked ? { borderColor: color, backgroundColor: color } : { borderColor: "var(--color-border)" }}>
            {checked && <Check size={12} className="text-white" strokeWidth={3} />}
          </div>

          <Miniatura product={p} />

          <div className="flex-1 min-w-0">
            <p className="text-[11px] font-bold uppercase tracking-wide truncate flex items-center gap-1" style={{ color }}>
              {o.type === "gift" && <Gift size={11} className="shrink-0" />}
              {o.type === "bogo" && <Repeat size={11} className="shrink-0" />}
              {o.title}
            </p>
            <p className="text-sm font-semibold text-foreground leading-tight truncate">
              {linie.bucati > 1 && <span className="text-muted-foreground">{linie.bucati} &times; </span>}
              {p.name}
            </p>
            {/* Rândul care spune REGULA, sub nume. Lipsește la bump, care n-are alta. */}
            {schimba && (
              <p className="mt-0.5 flex items-center gap-1 text-[11px] text-muted-foreground truncate">
                <span className="line-through">{schimba.nume}</span>
                <ArrowRight size={10} className="shrink-0" />
                <span>iese din comandă</span>
              </p>
            )}
            {o.reguli?.cumperi != null && (
              <p className="mt-0.5 text-[11px] text-muted-foreground">
                Ai cele {o.reguli.cumperi} bucăți cerute &mdash; primești {o.reguli.primesti ?? 1}
                {gratuit ? " gratis" : " la preț special"}.
              </p>
            )}
            {/* Prețul, pe telefon: sub nume, unde are loc. Vezi `pret`. */}
            <div className="mt-1 flex items-baseline gap-2 sm:hidden">{pret}</div>
          </div>

          {/* ⚠ La schimb se scrie DIFERENȚA, nu prețul: așa compară omul. */}
          <div className="hidden shrink-0 text-right sm:block">{pret}</div>
        </div>
      </button>

      {/*
        Cadoul la alegere: celelalte produse, ca să se poată schimba alegerea.

        ⚠ STĂ ÎN AFARA butonului de bifare, fiindcă un `<button>` în alt
        `<button>` e HTML nevalid, iar browserul îl rupe din DOM — atunci
        apăsarea pe un cadou ar fi bifat oferta, nu ar fi schimbat alegerea.
      */}
      {laAlegere && checked && onAlege && (
        <div className="px-3 pb-3 pt-0">
          <p className="mb-1.5 text-[11px] font-medium text-muted-foreground">Alege cadoul:</p>
          <div className="flex gap-2 overflow-x-auto pb-1">
            {o.products.map((g) => {
              const ales = g.id === p.id;
              return (
                <button key={g.id} type="button" onClick={() => onAlege(o.id, g.id)}
                  aria-pressed={ales}
                  className="shrink-0 w-[92px] rounded-lg border-2 p-1.5 text-left transition-all active:scale-[0.97]"
                  style={ales ? { borderColor: color } : { borderColor: "var(--color-border)" }}>
                  <div className="relative w-full aspect-square rounded-md overflow-hidden bg-muted/40 mb-1">
                    {g.imageUrl
                      ? <Image src={g.imageUrl} alt={g.name} fill sizes="92px" className="object-contain p-1" />
                      : <div className="w-full h-full flex items-center justify-center"><Package size={14} className="text-muted-foreground/50" /></div>}
                  </div>
                  <p className="text-[10px] leading-tight text-foreground line-clamp-2">{g.name}</p>
                </button>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}

function Miniatura({ product }: { product: OfferProduct }) {
  return (
    <div className="relative w-12 h-12 rounded-lg overflow-hidden border border-border bg-muted/40 shrink-0">
      {product.imageUrl
        ? <Image src={product.imageUrl} alt={product.name} fill sizes="48px" className="object-contain p-1" />
        : <div className="w-full h-full flex items-center justify-center"><Package size={16} className="text-muted-foreground/50" /></div>}
    </div>
  );
}
