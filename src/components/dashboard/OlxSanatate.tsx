"use client";

import { useEffect, useState } from "react";
import { Activity, AlertTriangle, CheckCircle2 } from "lucide-react";
import { getOlxSanatate, type OlxSanatate } from "@/lib/actions/olx.actions";

/*
  ⚠ TĂCEREA ARATĂ EXACT CA FUNCȚIONAREA (01.09.2026)

  Toate reparațiile ultimelor runde au același capăt: când ceva nu merge, se scrie undeva — în
  `last_error`, în `abandonat_la`, într-un conflict, în jurnal. Dar nimic nu ADUNA. Ecranul arăta
  la fel și când totul merge, și când coada n-a mai fost atinsă de trei ore.

  ⚠ CEA MAI IMPORTANTĂ CIFRĂ E VECHIMEA CELEI MAI VECHI LUCRĂRI. Numărul din coadă nu spune nimic
  singur: treizeci de lucrări puse acum o clipă sunt sănătate curată, iar UNA singură de acum două
  ore înseamnă că ceva s-a oprit.

  ⚠ Și pragurile sunt scrise pe față, nu ascunse în culori. „15 minute" e o alegere, nu un adevăr:
  cronul pornește din minut în minut, iar o lucrare care așteaptă un sfert de oră a trecut deja
  prin toată scara de reîncercări.
*/

/** Peste atâtea minute, cea mai veche lucrare din coadă nu mai e o întârziere, e o problemă. */
const PRAG_MINUTE = 15;

function Cifra({ eticheta, valoare, rau }: { eticheta: string; valoare: string; rau?: boolean }) {
  return (
    <div className="rounded-xl border border-border bg-card px-3 py-2">
      <p className="text-[11px] text-muted-foreground">{eticheta}</p>
      <p className={`text-sm font-semibold tabular-nums ${rau ? "text-destructive" : "text-foreground"}`}>
        {valoare}
      </p>
    </div>
  );
}

export default function OlxSanatatePanel({ businessId }: { businessId: string }) {
  const [s, setS] = useState<OlxSanatate | null>(null);
  const [eroare, setEroare] = useState<string | null>(null);

  useEffect(() => {
    let anulat = false;
    const cere = () => {
      void getOlxSanatate(businessId).then((r) => {
        if (anulat) return;
        if ("error" in r) { setEroare(r.error); return; }
        setEroare(null);
        setS(r);
      });
    };
    cere();
    const t = setInterval(cere, 60_000);
    return () => { anulat = true; clearInterval(t); };
  }, [businessId]);

  /*
    ⚠ O citire picată NU se arată ca „totul e în regulă". Un panou care liniștește tocmai când n-a
    putut întreba e mai rău decât unul care lipsește.
  */
  if (eroare) {
    return (
      <p className="flex items-center gap-2 text-xs text-destructive">
        <AlertTriangle className="h-3.5 w-3.5" /> {eroare}
      </p>
    );
  }
  if (!s) return null;

  const intarziat = s.celMaiVechiMinute != null && s.celMaiVechiMinute > PRAG_MINUTE;
  const totBine = !intarziat && s.oprite === 0 && s.conflicte === 0 && !s.cereReconectare;

  return (
    <div className="space-y-2">
      <p className="flex items-center gap-2 text-sm font-semibold text-foreground">
        {totBine
          ? <><CheckCircle2 className="h-4 w-4 text-success" /> Sincronizarea OLX merge</>
          : <><Activity className="h-4 w-4 text-warning" /> Sincronizarea OLX are nevoie de atenție</>}
      </p>
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-5">
        <Cifra eticheta="În coadă" valoare={String(s.inCoada)} />
        <Cifra
          eticheta="Cea mai veche"
          valoare={s.celMaiVechiMinute == null ? "—" : `${s.celMaiVechiMinute} min`}
          rau={intarziat}
        />
        <Cifra eticheta="Oprite" valoare={String(s.oprite)} rau={s.oprite > 0} />
        <Cifra eticheta="Conflicte" valoare={String(s.conflicte)} rau={s.conflicte > 0} />
        <Cifra eticheta="Respinse de OLX" valoare={String(s.respinse)} rau={s.respinse > 0} />
      </div>
      {intarziat && (
        <p className="text-xs text-destructive">
          O lucrare așteaptă de {s.celMaiVechiMinute} de minute. Cronul pornește din minut în minut,
          deci ceva o oprește — verifică dacă sesiunea OLX mai e validă.
        </p>
      )}
      {s.cereReconectare && (
        <p className="text-xs text-destructive">
          Sesiunea OLX a expirat. Până la reconectare nu pleacă nimic, iar lucrările se adună.
        </p>
      )}
    </div>
  );
}
