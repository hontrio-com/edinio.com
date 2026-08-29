"use client";

import { useCallback, useEffect, useState, useTransition } from "react";
import { toast } from "sonner";
import { Activity, AlertTriangle, CheckCircle2, Loader2, Wallet } from "lucide-react";
import {
  getOlxPlatiNelamurite, getOlxSanatate, lamuresteOlxPlata, renuntaLaOlxPlata,
  type OlxSanatate,
} from "@/lib/actions/olx.actions";
/*
  ⚠ TIPUL VINE DIN MODULUL CU MIEZUL, nu din acțiuni: un modul `"use server"` n-are voie să
  exporte decât funcții asincrone, iar miezul lămuririi a trebuit oricum scos de acolo ca să-l poată
  chema și cronul, care n-are sesiune de om.
*/
import type { OlxPlataNelamurita } from "@/lib/olx/plati";
import { Button } from "@/components/ui/button";

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

  ═══ O CIFRĂ CALCULATĂ CARE NU SE VEDEA NICĂIERI (02.09.2026) ═══

  `platiNelamurite` se număra de o rundă întreagă și nu apărea în niciun ecran, iar `totBine` nu o
  socotea. Deci se putea ca o plată către OLX să atârne neconfirmată, iar panoul să spună liniștit
  „Sincronizarea OLX merge". Pe bani, tăcerea aia costă.

  ⚠ Și proba care păzea zona era verde degeaba: căuta șirul `platiNelamurite:` în SURSA acțiunilor,
  nu în componentă. Confirma că se SCRIE câmpul, nu că îl citește cineva.
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
  /*
    ⚠ O PLATĂ NECONFIRMATĂ E O PROBLEMĂ, nu o notă de subsol. Până acum `totBine` se uita doar la
    coadă, opriri, conflicte și reconectare — deci se aprindea verde peste bani despre care nu
    știam dacă au plecat.
  */
  const totBine = !intarziat && s.oprite === 0 && s.conflicte === 0
    && s.platiNelamurite === 0 && !s.cereReconectare;

  return (
    <div className="space-y-2">
      <p className="flex items-center gap-2 text-sm font-semibold text-foreground">
        {totBine
          ? <><CheckCircle2 className="h-4 w-4 text-success" /> Sincronizarea OLX merge</>
          : <><Activity className="h-4 w-4 text-warning" /> Sincronizarea OLX are nevoie de atenție</>}
      </p>
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-6">
        <Cifra eticheta="În coadă" valoare={String(s.inCoada)} />
        <Cifra
          eticheta="Cea mai veche"
          valoare={s.celMaiVechiMinute == null ? "—" : `${s.celMaiVechiMinute} min`}
          rau={intarziat}
        />
        <Cifra eticheta="Oprite" valoare={String(s.oprite)} rau={s.oprite > 0} />
        <Cifra eticheta="Conflicte" valoare={String(s.conflicte)} rau={s.conflicte > 0} />
        <Cifra eticheta="Respinse de OLX" valoare={String(s.respinse)} rau={s.respinse > 0} />
        <Cifra eticheta="Plăți de verificat" valoare={String(s.platiNelamurite)} rau={s.platiNelamurite > 0} />
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
      {s.platiNelamurite > 0 && <PlatiDeVerificat businessId={businessId} />}
    </div>
  );
}

/**
 * Plățile către OLX al căror rezultat n-a fost confirmat, și cele două ieșiri din ele.
 *
 * ⚠ ORDINEA BUTOANELOR E ORDINEA SIGURANȚEI. „Verifică la OLX" nu costă nimic și poate închide
 * cazul singură. „Deblochează" e a doua, e a omului, și spune limpede ce riscă: dacă plata intrase
 * totuși, următoarea apăsare o face a doua oară.
 *
 * ⚠ Nu există niciun buton „declar că n-a intrat" automat, și nici cronul nu deblochează. Fiecare
 * dovadă negativă pe care o putem obține de la OLX s-a dovedit nesigură: ruta de promovări întoarce
 * și intrările expirate, un `200` cu corp stricat se citește ca listă goală, iar pachetele nu se
 * pot lega de o cumpărare anume. Dovada pozitivă poate închide un caz; lipsa dovezii nu poate
 * deschide unul.
 */
function PlatiDeVerificat({ businessId }: { businessId: string }) {
  const [plati, setPlati] = useState<OlxPlataNelamurita[] | null>(null);
  const [eroare, setEroare] = useState<string | null>(null);
  const [lucreaza, startLucru] = useTransition();

  const reincarca = useCallback(() => {
    void getOlxPlatiNelamurite(businessId).then((r) => {
      if ("error" in r) { setEroare(r.error); return; }
      setEroare(null);
      setPlati(r.plati);
    });
  }, [businessId]);
  useEffect(reincarca, [reincarca]);

  if (eroare) return <p className="text-xs text-destructive">{eroare}</p>;
  if (!plati || plati.length === 0) return null;

  return (
    <div className="space-y-2 rounded-xl border border-destructive/40 bg-destructive/5 p-3">
      <p className="flex items-center gap-2 text-xs font-semibold text-destructive">
        <Wallet className="h-3.5 w-3.5" />
        {plati.length === 1 ? "O plată nu a fost confirmată" : `${plati.length} plăți nu au fost confirmate`}
      </p>
      <p className="text-[11px] text-muted-foreground">
        Am trimis cererea la OLX, dar răspunsul nu a ajuns. Până se lămurește, aceeași cumpărare nu
        se mai poate face din Edinio, tocmai ca să nu se plătească de două ori.
      </p>
      <ul className="space-y-2">
        {plati.map((p) => (
          <li key={p.id} className="flex flex-wrap items-center gap-2 border-t border-destructive/20 pt-2">
            <span className="flex-1 text-xs text-foreground">
              {p.descriere}
              <span className="ml-2 text-[11px] text-muted-foreground">
                {new Date(p.creatLa).toLocaleString("ro-RO")}
              </span>
              {p.ultimaEroare && (
                <span className="block text-[11px] text-muted-foreground">{p.ultimaEroare}</span>
              )}
            </span>
            <Button
              size="sm" variant="outline" disabled={lucreaza}
              onClick={() => startLucru(async () => {
                const r = await lamuresteOlxPlata(businessId, p.id);
                if ("error" in r) { toast.error(r.error); return; }
                if (r.stare === "intrat") toast.success(r.mesaj);
                else toast.info(r.mesaj);
                reincarca();
              })}
            >
              {lucreaza ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : "Verifică la OLX"}
            </Button>
            <Button
              size="sm" variant="ghost" disabled={lucreaza}
              onClick={() => {
                if (!window.confirm(
                  `Ai verificat pe olx.ro și „${p.descriere}" NU e acolo?\n\n`
                  + "Dacă plata a intrat totuși, următoarea apăsare o face a doua oară, cu bani.",
                )) return;
                startLucru(async () => {
                  const r = await renuntaLaOlxPlata(businessId, p.id);
                  if ("error" in r) { toast.error(r.error); return; }
                  toast.success(r.mesaj);
                  reincarca();
                });
              }}
            >
              Am verificat, deblochează
            </Button>
          </li>
        ))}
      </ul>
    </div>
  );
}
