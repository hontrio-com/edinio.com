"use client";

import { useEffect, useState } from "react";
import { AlertCircle, Loader2, Pencil, X } from "lucide-react";

import { formatDate, formatPrice } from "@/lib/utils/format";
import { orderStatus } from "@/lib/orders/status";
import { EtichetaStare } from "@/components/ui/eticheta-stare";
import { useDialogAccesibil } from "../useDialogAccesibil";
import {
  DESPRE_STARE, DE_CE_DOUA_CIFRE, TONUL_STARII, stareaCodului, toateMotivele, utilizarile,
} from "@/lib/discounts/stare";
import { getDiscountOrders, type ComandaCuCod } from "@/lib/actions/discount.actions";
import type { CodDinLista } from "@/lib/discounts/lista";

/* ⚠ Randul vine din `discounts_page` si isi poarta si cifrele. Vezi `lista.ts`. */
type Discount = CodDinLista;

/**
 * ═══════════════════════════════════════════════════════════════════════════
 * FIȘA UNUI COD                                                 (21.09.2026)
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * ⚠ SERTAR LATERAL, nu fereastră în mijloc — același tipar ca la Clienți și la
 * Coșuri abandonate. Lista rămâne vizibilă, se trece repede de la un cod la
 * altul, și e mai multă înălțime. Pe telefon rămâne peste tot ecranul.
 *
 * ⚠⚠ AICI SE ARATĂ **TOATE** MOTIVELE pentru care un cod nu merge, nu doar
 * primul. În listă încape o singură etichetă, și ea spune ce ai de făcut întâi.
 * Dar cine reaprinde un cod oprit ȘI expirat trebuie să afle acum că mai are un
 * pas — nu după ce apasă comutatorul și nu se întâmplă nimic.
 */

export function SertarCod({
  cod,
  businessId,
  onEditeaza,
  onClose,
}: {
  cod: Discount;
  businessId: string;
  onEditeaza: () => void;
  onClose: () => void;
}) {
  const [comenzi, setComenzi] = useState<ComandaCuCod[] | null>(null);
  const [maiSunt, setMaiSunt] = useState(false);
  const [eroare, setEroare] = useState("");

  const cutia = useDialogAccesibil(true, onClose);
  const stare = stareaCodului(cod);
  const motive = toateMotivele(cod);
  const cifre = cod.cifre;
  const u = utilizarile(cod, cifre.comenziTotal);

  useEffect(() => {
    let anulat = false;
    void (async () => {
      let r: Awaited<ReturnType<typeof getDiscountOrders>>;
      try {
        r = await getDiscountOrders(businessId, cod.id);
      } catch {
        /* ⚠ O CITIRE: nimic nu s-a schimbat, deci se poate reîncerca închizând
           și redeschizând fișa. Fără prindere, aruncarea ar înlocui tot panoul. */
        if (!anulat) setEroare("Nu am primit răspuns. Închide și deschide din nou fișa.");
        return;
      }
      if (anulat) return;
      if ("error" in r) { setEroare(r.error); return; }
      setComenzi(r.comenzi);
      setMaiSunt(r.maiSunt);
    })();
    return () => { anulat = true; };
  }, [businessId, cod.id]);

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-black/50 backdrop-blur-sm sm:items-stretch sm:justify-end"
      onClick={onClose}
    >
      <div
        ref={cutia}
        role="dialog"
        aria-modal="true"
        aria-label={`Codul ${cod.code}`}
        className="flex max-h-[92dvh] w-full flex-col overflow-hidden rounded-t-2xl border border-border bg-background shadow-2xl sm:h-full sm:max-h-none sm:w-[34rem] sm:rounded-none sm:rounded-l-2xl sm:border-y-0 sm:border-r-0"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex flex-shrink-0 items-start gap-3 border-b border-border px-5 py-4">
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2">
              <h2 className="truncate font-mono text-base font-bold tracking-wider text-foreground">{cod.code}</h2>
              <EtichetaStare ton={TONUL_STARII[stare]} marime="mic">
                {DESPRE_STARE[stare].text}
              </EtichetaStare>
            </div>
            <p className="mt-0.5 text-xs text-muted-foreground">
              {cod.type === "percent" && `${cod.value}% reducere`}
              {cod.type === "fixed" && `${cod.value} lei reducere`}
              {cod.type === "free_shipping" && "Transport gratuit"}
              {cod.min_order_amount ? ` · de la ${formatPrice(Number(cod.min_order_amount))}` : ""}
              {/*
                ⚠ Limita pe OM, nu pe campanie. Cifra „Utilizări" de mai jos e a
                campaniei; fără rândul ăsta, cele două s-ar citi ca una singură.
              */}
              {cod.per_customer_limit !== null
                ? ` · ${cod.per_customer_limit === 1 ? "o dată per client" : `de ${cod.per_customer_limit} ori per client`}`
                : ""}
            </p>
          </div>
          <button
            type="button"
            onClick={onEditeaza}
            aria-label={`Editează codul ${cod.code}`}
            className="rounded-lg p-1.5 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
          >
            <Pencil className="h-4 w-4" />
          </button>
          <button type="button" onClick={onClose} aria-label="Închide" className="text-muted-foreground hover:text-foreground">
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="flex-1 space-y-5 overflow-y-auto px-5 py-4">
          {/*
            ⚠⚠ TOATE MOTIVELE, nu doar primul. Vezi capul fișierului.
          */}
          {motive.length > 0 && (
            <div className="rounded-xl bg-muted/50 p-3.5">
              <p className="text-xs font-semibold text-foreground">
                {motive.length === 1 ? "De ce nu merge acum" : `De ce nu merge acum (${motive.length} motive)`}
              </p>
              <ul className="mt-1.5 space-y-1">
                {motive.map((m) => (
                  <li key={m} className="text-xs text-muted-foreground">
                    <span className="font-medium text-foreground">{DESPRE_STARE[m].text}:</span>{" "}
                    {DESPRE_STARE[m].explicatie}
                  </li>
                ))}
              </ul>
            </div>
          )}

          <div className="grid grid-cols-2 gap-3">
            <Cifra
              eticheta="Utilizări"
              valoare={u.principal}
              dedesubt={u.langa ? `${u.langa} · cu tot cu anulate` : null}
              title={u.langa ? DE_CE_DOUA_CIFRE : undefined}
            />
            <Cifra
              eticheta="Cât a costat"
              valoare={formatPrice(cifre.baniDati ?? 0)}
              /*
                ⚠⚠ ZERO LA TRANSPORT GRATUIT NU E UN DEFECT, și se spune pe față:
                economia stă în `shipping_cost`, care ajunge 0 și nu păstrează
                nicăieri cât ar fi fost. Se poate spune CÂTE comenzi, nu CÂȚI lei.
              */
              dedesubt={cod.type === "free_shipping"
                ? `Transport oferit la ${cifre.comenziCuTransportOferit ?? 0} ${(cifre.comenziCuTransportOferit ?? 0) === 1 ? "comandă" : "comenzi"} — cât ar fi costat nu se păstrează nicăieri`
                : null}
              /*
                ⚠ A DOUA JUMĂTATE A ADEVĂRULUI, în tooltip ca să nu îngroape
                cifra: dacă un coș trecea oricum de pragul tău de transport
                gratuit, codul n-a adăugat nimic. Nu se poate afla din comandă,
                fiindcă nicăieri nu se păstrează cât ar fi costat transportul.
              */
              title={cod.type === "free_shipping"
                ? "Se numără comenzile pe care codul ăsta a fost folosit și transportul a ieșit zero. Dacă un coș trecea oricum de pragul tău de transport gratuit, codul n-a adăugat nimic — iar cât ar fi costat transportul nu se păstrează nicăieri, deci în lei nu se poate spune."
                : undefined}
            />
            <Cifra eticheta="Vânzări aduse" valoare={formatPrice(cifre.vanzari ?? 0)} dedesubt={null} />
            <Cifra
              eticheta="Comenzi căzute"
              valoare={String(cifre.comenziCazute ?? 0)}
              dedesubt={(cifre.comenziCazute ?? 0) > 0 ? "Anulate sau rambursate. Utilizarea s-a dat înapoi." : null}
            />
          </div>

          <div>
            <h3 className="mb-2 text-sm font-semibold text-foreground">Comenzile pe care s-a folosit</h3>

            {eroare && (
              <p className="flex items-start gap-2 rounded-lg bg-destructive/10 p-3 text-xs text-destructive">
                <AlertCircle className="mt-0.5 h-3.5 w-3.5 shrink-0" /> {eroare}
              </p>
            )}

            {!eroare && comenzi === null && (
              <p className="flex items-center gap-2 py-4 text-xs text-muted-foreground">
                <Loader2 className="h-3.5 w-3.5 animate-spin" /> Adun comenzile…
              </p>
            )}

            {comenzi !== null && comenzi.length === 0 && (
              <p className="py-4 text-xs text-muted-foreground">
                Codul n-a fost folosit încă pe nicio comandă.
              </p>
            )}

            {comenzi !== null && comenzi.length > 0 && (
              <>
                <ul className="divide-y divide-border rounded-xl bg-card ring-1 ring-foreground/10">
                  {comenzi.map((o) => (
                    <li key={o.id} className="flex items-center gap-3 px-3.5 py-2.5">
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-medium text-foreground">
                          {o.order_number}
                          <span className="ml-1.5 font-normal text-muted-foreground">{o.customer_name}</span>
                        </p>
                        <p className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
                          {formatDate(new Date(o.created_at))}
                          {/*
                            ⚠ Starea cu vocabularul panoului, nu cu cheia din bază:
                            „delivered" nu înseamnă nimic pentru comerciant.
                          */}
                          · {orderStatus(o.status).label}
                        </p>
                      </div>
                      <div className="flex-shrink-0 text-right">
                        <p className="text-sm font-semibold tabular-nums text-foreground">{formatPrice(o.total)}</p>
                        {o.discount_amount > 0 && (
                          <p className="text-[11px] tabular-nums text-muted-foreground">
                            −{formatPrice(o.discount_amount)}
                          </p>
                        )}
                        {o.discount_amount === 0 && cod.type === "free_shipping" && o.shipping_cost === 0 && (
                          <p className="text-[11px] text-muted-foreground">transport oferit</p>
                        )}
                      </div>
                    </li>
                  ))}
                </ul>
                {/*
                  ⚠ SE SPUNE CÂND LISTA E TĂIATĂ. O listă care se oprește la 50
                  fără să spună nimic îl lasă pe comerciant să creadă că atâtea
                  sunt — exact felul de tăcere pe care o vânez peste tot.
                */}
                {maiSunt && (
                  <p className="mt-2 text-[11px] text-muted-foreground">
                    Se arată cele mai noi 50 de comenzi. Mai sunt și altele.
                  </p>
                )}
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

function Cifra({
  eticheta, valoare, dedesubt, title,
}: {
  eticheta: string;
  valoare: string;
  dedesubt: string | null;
  title?: string;
}) {
  return (
    <div className="rounded-xl bg-card p-3.5 ring-1 ring-foreground/10" title={title}>
      <p className="text-[11px] text-muted-foreground">{eticheta}</p>
      <p className="mt-0.5 text-lg font-bold tabular-nums text-foreground">{valoare}</p>
      {dedesubt && <p className="mt-1 text-[11px] text-muted-foreground">{dedesubt}</p>}
    </div>
  );
}
