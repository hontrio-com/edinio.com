"use client";

import { useEffect, useState } from "react";
import { AlertCircle, Loader2, Pencil, X } from "lucide-react";

import { formatPrice } from "@/lib/utils/format";
import { descriePerioada, ziuaClipei } from "@/lib/zi-romaneasca";
import { EtichetaStare } from "@/components/ui/eticheta-stare";
import { useDialogAccesibil } from "../useDialogAccesibil";
import { DESPRE_STAREA_OFERTEI, TONUL_STARII_OFERTA, toateMotiveleOfertei } from "@/lib/offers/stare";
import { ceOfera, rataDeAcceptare, scrieCifra, scrieRata, undeApare, type OfertaDinLista } from "@/lib/offers/lista";
import { getOfferTargets } from "@/lib/actions/offer.actions";
import { metaTip } from "./tipuri-ui";

/**
 * ═══════════════════════════════════════════════════════════════════════════
 * FIȘA UNEI OFERTE                                              (22.09.2026)
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * ⚠ SERTAR LATERAL, nu fereastră în mijloc — același tipar ca la Clienți,
 * Coșuri abandonate și Discounturi. Lista rămâne vizibilă, se trece repede de la
 * o ofertă la alta, și e mai multă înălțime. Pe telefon rămâne peste tot ecranul.
 *
 * ⚠⚠ AICI SE ARATĂ **TOATE** MOTIVELE pentru care o ofertă nu merge, nu doar
 * primul. În listă încape o singură etichetă, și ea spune ce ai de făcut întâi.
 * Dar cine reaprinde o ofertă oprită ȘI expirată trebuie să afle acum că mai are
 * un pas — nu după ce apasă comutatorul și nu se întâmplă nimic.
 *
 * ⚠⚠ ȘI AICI SE SPUNE CE ÎNSEAMNĂ CIFRELE. `impressions`, `conversions` și
 * `revenue_added` sunt contoare care doar cresc: nu scad când o comandă se
 * anulează, fiindcă `orders` nu păstrează nicio legătură către oferta folosită.
 * Netălmăcită, „29 acceptate” ar fi fost citită ca „29 de comenzi bune”.
 */
export function SertarOferta({
  oferta,
  businessId,
  onEditeaza,
  onClose,
}: {
  oferta: OfertaDinLista;
  businessId: string;
  onEditeaza: () => void;
  onClose: () => void;
}) {
  const [tinte, setTinte] = useState<Awaited<ReturnType<typeof getOfferTargets>> | null>(null);
  const [eroare, setEroare] = useState("");

  const cutia = useDialogAccesibil(true, onClose);
  const meta = metaTip(oferta.type);
  const motive = toateMotiveleOfertei(oferta);
  const rata = rataDeAcceptare(oferta.impressions, oferta.conversions);

  useEffect(() => {
    let anulat = false;
    void (async () => {
      let r: Awaited<ReturnType<typeof getOfferTargets>>;
      try {
        r = await getOfferTargets(businessId, oferta.id);
      } catch {
        /* ⚠ O CITIRE: nimic nu s-a schimbat, deci se poate reîncerca închizând
           și redeschizând fișa. Fără prindere, aruncarea ar înlocui tot panoul. */
        if (!anulat) setEroare("Nu am primit răspuns. Închide și deschide din nou fișa.");
        return;
      }
      if (anulat) return;
      if ("error" in r) { setEroare(r.error); return; }
      setTinte(r);
    })();
    return () => { anulat = true; };
  }, [businessId, oferta.id]);

  const Icon = meta.icon;

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-black/50 backdrop-blur-sm sm:items-stretch sm:justify-end"
      onClick={onClose}
    >
      <div
        ref={cutia}
        role="dialog"
        aria-modal="true"
        aria-label={`Oferta ${oferta.name}`}
        className="flex max-h-[92dvh] w-full flex-col overflow-hidden rounded-t-2xl border border-border bg-background shadow-2xl sm:h-full sm:max-h-none sm:w-[34rem] sm:rounded-none sm:rounded-l-2xl sm:border-y-0 sm:border-r-0"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex flex-shrink-0 items-start gap-3 border-b border-border px-5 py-4">
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2">
              <h2 className="truncate text-base font-bold text-foreground">{oferta.name}</h2>
              <EtichetaStare ton={TONUL_STARII_OFERTA[oferta.stare]} marime="mic">
                {DESPRE_STAREA_OFERTEI[oferta.stare].text}
              </EtichetaStare>
            </div>
            <p className="mt-0.5 flex items-center gap-1.5 text-xs text-muted-foreground">
              <Icon className="h-3 w-3 shrink-0" />
              {meta.eticheta}
            </p>
          </div>
          <button
            type="button"
            onClick={onEditeaza}
            aria-label={`Editează oferta ${oferta.name}`}
            className="rounded-lg p-1.5 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
          >
            <Pencil className="h-4 w-4" />
          </button>
          <button type="button" onClick={onClose} aria-label="Închide" className="text-muted-foreground hover:text-foreground">
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="flex-1 space-y-5 overflow-y-auto px-5 py-4">
          {/* ⚠⚠ TOATE MOTIVELE, nu doar primul. Vezi capul fișierului. */}
          {motive.length > 0 && (
            <div className="rounded-xl bg-muted/50 p-3.5">
              <p className="text-xs font-semibold text-foreground">
                {motive.length === 1 ? "De ce nu merge acum" : `De ce nu merge acum (${motive.length} motive)`}
              </p>
              <ul className="mt-1.5 space-y-1">
                {motive.map((m) => (
                  <li key={m} className="text-xs text-muted-foreground">
                    <span className="font-medium text-foreground">{DESPRE_STAREA_OFERTEI[m].text}:</span>{" "}
                    {DESPRE_STAREA_OFERTEI[m].explicatie}
                  </li>
                ))}
              </ul>
            </div>
          )}

          <div className="grid grid-cols-2 gap-3">
            <Cifra
              eticheta="Afișări"
              valoare={scrieCifra(oferta.impressions)}
              /*
                ⚠⚠ SE SPUNE DE CE CIFRA E MAI MICĂ DECÂT AR TREBUI PE OFERTELE
                VECHI. Până la 22.09.2026 baliza era legată doar la pagina de
                produs, deși un comentariu din cod susținea că numără pe toate
                trei suprafețele: `order_bump` avea pe producție 0 afișări și 29
                de acceptări. Cifra veche nu se poate reface, deci se spune.
              */
              dedesubt="De câte ori a ajuns pe un ecran, o dată pe vizită."
              title="Afișările de la checkout și din coș se numără de pe 22.09.2026; înainte se numărau doar cele de pe pagina produsului. Pe ofertele mai vechi, numărul ăsta e mai mic decât a fost în realitate."
            />
            <Cifra
              eticheta="Acceptate"
              valoare={scrieCifra(oferta.conversions)}
              dedesubt={rata === null ? "N-a fost văzută încă." : `${scrieRata(rata)} din cei care au văzut-o`}
              title="Se numără în clipa în care se plasează comanda. ⚠ NU scade dacă acea comandă se anulează mai târziu: nicăieri nu se păstrează care ofertă a fost pe care comandă."
            />
            <Cifra
              eticheta="Vânzări în plus"
              valoare={formatPrice(oferta.revenue_added)}
              dedesubt="Valoarea produselor luate din ofertă."
              title="Adunată în clipa comenzii, la fel ca acceptările. ⚠ NU scade dacă acea comandă se anulează."
            />
            <Cifra
              eticheta="Cât ține"
              valoare={oferta.starts_at || oferta.ends_at ? "Cu perioadă" : "Fără capăt"}
              dedesubt={descriePerioada(ziuaClipei(oferta.starts_at), ziuaClipei(oferta.ends_at))}
            />
          </div>

          <div>
            <h3 className="mb-2 text-sm font-semibold text-foreground">Unde apare și ce oferă</h3>

            {eroare && (
              <p className="flex items-start gap-2 rounded-lg bg-destructive/10 p-3 text-xs text-destructive">
                <AlertCircle className="mt-0.5 h-3.5 w-3.5 shrink-0" /> {eroare}
              </p>
            )}

            {!eroare && tinte === null && (
              <p className="flex items-center gap-2 py-4 text-xs text-muted-foreground">
                <Loader2 className="h-3.5 w-3.5 animate-spin" /> Caut produsele…
              </p>
            )}

            {tinte !== null && !("error" in tinte) && (
              <div className="space-y-3 rounded-xl bg-card p-3.5 ring-1 ring-foreground/10">
                <Lista
                  eticheta={`Apare la ${undeApare(oferta.trigger)}`}
                  /*
                    ⚠ „Toate produsele” n-are listă, și nici nu trebuie: ar fi
                    fost catalogul întreg turnat într-un sertar.
                  */
                  nume={oferta.trigger.scope === "all"
                    ? []
                    : oferta.trigger.scope === "categories" ? tinte.categorii : tinte.produseDeclansare}
                />
                <Lista
                  eticheta={oferta.type === "volume" ? `Ieftinește: ${ceOfera(oferta)}` : `Oferă ${ceOfera(oferta)}`}
                  nume={oferta.type === "volume" || oferta.config.autoByCategory ? [] : tinte.produseOferite}
                />
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

function Lista({ eticheta, nume }: { eticheta: string; nume: string[] }) {
  return (
    <div>
      <p className="text-[11px] text-muted-foreground">{eticheta}</p>
      {nume.length > 0 && (
        <div className="mt-1.5 flex flex-wrap gap-1.5">
          {/*
            ⚠ SE ARATĂ CEL MULT ZECE, și se spune câte mai sunt. O ofertă cu
            patruzeci de produse ar fi umplut sertarul cu etichete.
          */}
          {nume.slice(0, 10).map((n, i) => (
            <span key={`${n}-${i}`} className="rounded-lg bg-muted px-2 py-0.5 text-xs text-foreground">{n}</span>
          ))}
          {nume.length > 10 && (
            <span className="px-1 py-0.5 text-xs text-muted-foreground">și încă {nume.length - 10}</span>
          )}
        </div>
      )}
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
