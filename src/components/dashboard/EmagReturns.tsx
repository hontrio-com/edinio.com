"use client";

import { useEffect, useState, useTransition } from "react";
import { Loader2, PackageOpen, RefreshCw, Truck } from "lucide-react";
import { toast } from "sonner";
import {
  emiteAwbReturEmag, listaRetururiEmag, schimbaReturEmag, type RandReturEcran,
} from "@/lib/actions/emag.actions";

/**
 * Retururile de pe eMAG.
 *
 * ═══ ⚠ BUTOANELE VIN DIN TABELUL LOR, NU DINTR-O LISTĂ SCRISĂ DE NOI ═══
 *
 * Documentația eMAG dă un tabel de treceri îngăduite și spune ceva ce se sare ușor:
 * „Some statuses were left out by design; these should not be used in any seller
 * implementation." Adică lista nu e completă cu toate numerele — e o listă albă.
 *
 * Arătate toate butoanele, comerciantul ar apăsa „Respinge" pe un retur nou, eMAG ar
 * refuza, iar mesajul lor n-ar spune „întâi confirmă-l" — ar spune ceva despre un
 * status invalid. Ecranul arată doar ce se poate face ACUM.
 *
 * ═══ ⚠ CE NU FACE ECRANUL ĂSTA ═══
 *
 * Nu pune marfa înapoi în stoc. Un retur „Primit" înseamnă că a ajuns coletul, nu că
 * produsul e bun de pus la loc pe raft: vine desfăcut, zgâriat, incomplet, sau pur și
 * simplu altul decât cel trimis. Pus automat, magazinul ar vinde a doua oară ceva ce
 * nu se mai poate vinde — iar al doilea cumpărător ar primi marfă stricată.
 *
 * Se spune limpede pe ecran, ca nimeni să nu aștepte altceva.
 */

export function EmagReturns({ businessId }: { businessId: string }) {
  const [randuri, setRanduri] = useState<RandReturEcran[] | null>(null);
  const [seIncarca, incepe] = useTransition();

  function incarca() {
    incepe(async () => {
      const r = await listaRetururiEmag(businessId);
      if ("error" in r) {
        toast.error(r.error);
        setRanduri([]);
        return;
      }
      setRanduri(r.randuri);
      /* ⚠ Trunchierea SE SPUNE. Un retur nevazut inseamna marfa care se intoarce fara ca
         cineva sa stie, si un client care asteapta banii. */
      if (r.atinsPlafonul) {
        toast.warning(
          `S-au adus cele mai noi ${r.atinsPlafonul} retururi. Ai mai multe; pe cele vechi ` +
          "le vezi în panoul eMAG.",
        );
      }
    });
  }

  useEffect(() => {
    incarca();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [businessId]);

  if (randuri === null) {
    return (
      <div className="rounded-xl border border-border bg-card p-5">
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" /> Se citesc retururile…
        </div>
      </div>
    );
  }

  /* Un magazin fără retururi n-are nevoie de o carte goală pe ecran. */
  if (randuri.length === 0) return null;

  return (
    <div className="rounded-xl border border-border bg-card p-5">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h3 className="flex items-center gap-2 text-sm font-semibold">
            <PackageOpen className="h-4 w-4" /> Retururi eMAG
          </h3>
          <p className="mt-1 max-w-prose text-xs text-muted-foreground">
            Marfa întoarsă <strong>nu intră singură înapoi în stoc</strong>. O adaugi tu,
            după ce te uiți la ea.
          </p>
        </div>
        <button
          type="button"
          onClick={incarca}
          disabled={seIncarca}
          className="inline-flex shrink-0 items-center gap-2 rounded-lg border border-border px-3 py-2 text-sm hover:bg-muted disabled:opacity-60"
        >
          {seIncarca ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
          Reîmprospătează
        </button>
      </div>

      <ul className="mt-4 divide-y divide-border">
        {randuri.map((r) => (
          <RandRetur key={r.emagRmaId} businessId={businessId} rand={r} laSchimbare={incarca} />
        ))}
      </ul>
    </div>
  );
}

function RandRetur({
  businessId, rand, laSchimbare,
}: {
  businessId: string;
  rand: RandReturEcran;
  laSchimbare: () => void;
}) {
  const [seLucreaza, incepe] = useTransition();

  function treci(inStare: number, eticheta: string) {
    incepe(async () => {
      const r = await schimbaReturEmag(businessId, rand.emagRmaId, inStare);
      if ("error" in r) {
        toast.error(r.error);
        return;
      }
      toast.success(`Returul a trecut în „${eticheta}".`);
      laSchimbare();
    });
  }

  /*
   * ⚠ CONFIRMARE ÎNAINTE, ȘI NU DINTR-UN EXCES DE PRUDENȚĂ.
   *
   * Un AWB emis cheamă curierul și se plătește. Butoanele de stare de alături sunt
   * reversibile prin tabelul lor de treceri; ăsta nu e — banii au plecat.
   */
  function cheamaCurierul() {
    if (!window.confirm(
      "Chem curierul să ridice marfa de la client?\n\n"
      + "Transportul se plătește, iar AWB-ul nu se poate anula de aici.",
    )) return;

    incepe(async () => {
      const r = await emiteAwbReturEmag(businessId, rand.emagRmaId);
      if ("error" in r) {
        toast.error(r.error);
        return;
      }
      toast.success(r.deja
        ? "AWB-ul era deja emis."
        : r.numar
          ? `Curierul a fost chemat. AWB ${r.numar}.`
          : "Curierul a fost chemat.");
      laSchimbare();
    });
  }

  const bucati = rand.produse.reduce((s, p) => s + p.cantitate, 0);

  return (
    <li className="py-3">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-sm font-medium">Retur #{rand.emagRmaId}</span>
            <span className="rounded-full bg-muted px-2 py-0.5 text-xs text-muted-foreground">
              {rand.stareEticheta}
            </span>
          </div>
          <p className="mt-0.5 text-xs text-muted-foreground">
            {rand.emagOrderId ? `Comanda eMAG #${rand.emagOrderId}` : "Fără comandă legată"}
            {bucati > 0 ? ` · ${bucati} ${bucati === 1 ? "bucată" : "bucăți"}` : ""}
            {rand.tipEticheta ? ` · ${rand.tipEticheta}` : ""}
          </p>

          {/* ⚠ Ce urmează, în cuvinte. La voucher NU se întorc bani — iar un ecran care
              ar fi scris „rambursare" l-ar fi pus pe om să caute un IBAN inexistent. */}
          {rand.ceUrmeaza && (
            <p className="mt-1 text-xs font-medium">{rand.ceUrmeaza}</p>
          )}

          {/* ⚠ Motivul se scrie doar când e o VESTE, nu la fiecare rând. „Confirmă
              întâi returul" e deja evident din butoanele de alături; „ridicarea o face
              curierul eMAG" nu e evident de nicăieri, și e chiar ce vrea omul să știe. */}
          {!rand.ridicare.sePoate && rand.ridicare.motiv && rand.stare === 3 && (
            <p className="mt-1 text-xs text-muted-foreground">{rand.ridicare.motiv}</p>
          )}

          {/*
            ⚠ MOTIVUL SE ARATĂ CA NUMĂR, ȘI SE SPUNE DE CE.
            eMAG publică denumirile motivelor doar în fișiere separate, pe țară
            (`return_reasons_RO.xlsx`). N-avem lista, deci n-o inventăm — dar textul
            liber scris de client, care e partea folositoare, se arată întreg.
          */}
          {(rand.observatii || rand.motiv != null) && (
            <p className="mt-1 text-xs text-muted-foreground">
              {rand.observatii ? <span>„{rand.observatii}”</span> : null}
              {rand.motiv != null && (
                <span className="ml-1 opacity-70">(motiv eMAG #{rand.motiv})</span>
              )}
            </p>
          )}

          {/*
            ⚠ Contul se aprinde de la „ei ne-au trimis un IBAN", nu de la tipul returului.
            Un tip necunoscut ar fi ascuns un cont pe care ei chiar ni l-au dat, iar
            comerciantul ar fi avut de întors bani și ecranul ar fi tăcut.
          */}
          {rand.cont && (
            <p className="mt-1.5 rounded-lg border border-border bg-background p-2 text-xs">
              <span className="block text-muted-foreground">Banii se întorc în contul:</span>
              <span className="font-mono">{rand.cont.iban}</span>
              {rand.cont.banca && <span className="text-muted-foreground"> · {rand.cont.banca}</span>}
              {rand.cont.beneficiar && <span className="block text-muted-foreground">{rand.cont.beneficiar}</span>}
            </p>
          )}
          {rand.produse.length > 0 && (
            <ul className="mt-1.5 space-y-0.5">
              {rand.produse.slice(0, 4).map((p, i) => (
                <li key={i} className="text-xs text-muted-foreground">
                  {p.cantitate} × {p.nume}
                  {p.observatii && <span className="block pl-4 opacity-80">„{p.observatii}”</span>}
                </li>
              ))}
              {rand.produse.length > 4 && (
                <li className="text-xs text-muted-foreground">și încă {rand.produse.length - 4}</li>
              )}
            </ul>
          )}
        </div>

        <div className="flex shrink-0 flex-wrap items-center gap-1.5">
          {/* ⚠ Numai trecerile pe care documentația lor le îngăduie din starea de
              ACUM. Un buton în plus n-ar fi făcut nimic la ei, dar ar fi întors o
              eroare în engleză pe care omul n-are cum s-o lege de rândul acțiunii. */}
          {/*
            ⚠ BUTONUL APARE DOAR CÂND CHIAR SE POATE, iar când nu, se spune DE CE.
            `pickup_method` din retur: 1 = vine curierul eMAG · 2 = curierul tău ·
            3 = trimite clientul. La 1 și la 3, transportul e deja rezolvat — un AWB
            emis de noi ar fi un al doilea curier, plătit, trimis după un colet care nu
            mai e acolo. Butonul arătat unde nu trebuie nu greșește un ecran, greșește
            o factură.
          */}
          {rand.ridicare.sePoate && (
            <button
              type="button"
              onClick={cheamaCurierul}
              disabled={seLucreaza}
              className="inline-flex items-center gap-1.5 rounded-lg border border-border px-2.5 py-1.5 text-xs hover:bg-muted disabled:opacity-60"
            >
              {seLucreaza ? <Loader2 className="h-3 w-3 animate-spin" /> : <Truck className="h-3 w-3" />}
              Cheamă curierul
            </button>
          )}

          {rand.treceri.length === 0 && !rand.ridicare.sePoate ? (
            <span className="text-xs text-muted-foreground">Nimic de făcut</span>
          ) : (
            rand.treceri.map((t) => (
              <button
                key={t.stare}
                type="button"
                onClick={() => treci(t.stare, t.eticheta)}
                disabled={seLucreaza}
                className="inline-flex items-center gap-1.5 rounded-lg border border-border px-2.5 py-1.5 text-xs hover:bg-muted disabled:opacity-60"
              >
                {seLucreaza && <Loader2 className="h-3 w-3 animate-spin" />}
                {t.eticheta}
              </button>
            ))
          )}
        </div>
      </div>
    </li>
  );
}
