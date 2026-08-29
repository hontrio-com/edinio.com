"use client";

import { useState, useTransition } from "react";
import { toast } from "sonner";
import { Loader2, ExternalLink, Search, Link2, X, AlertTriangle, Check } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Callout } from "@/components/ui/callout";
import { cn } from "@/lib/utils/cn";
import { ignoraAnuntOlx,
  scaneazaAnunturileOlx, conecteazaAnuntOlx,
  type OlxScanare, type OlxAnuntStrain,
} from "@/lib/actions/olx-import.actions";

/*
  ⚠ PENTRU CINE FOLOSEA OLX ÎNAINTE SĂ NE CUNOASCĂ (etapa 16)

  Reconcilierea adoptă singură anunțurile care poartă `external_id` = produsul Edinio. Anunțurile
  făcute de el, cu mâna, înainte de Edinio, nu au așa ceva. Fără ecranul ăsta, singura ieșire era
  să publice din nou din Edinio, adică să ajungă cu DOUĂ anunțuri vii pentru același produs: unul
  cu istoricul, mesajele și promovarea plătită, altul nou și gol.

  ⚠ Aici nu se scrie nimic la OLX, nici la scanare, nici la conectare: doar citim de la ei și
  scriem un rând la noi. Și nu se conectează nimic singur, nici măcar potrivirile pe cod: o
  pereche greșită leagă prețul unui produs de anunțul altuia, iar greșeala se vede abia când
  cumpărătorul plătește altceva decât credea.
*/

/*
  ⚠ Etichetele de mai jos sunt o copie mică, dinadins, a celor din `OlxClient`. Importate de acolo
  ar face un ciclu între două componente de client (`OlxClient` -> `OlxImport` -> `OlxClient`), iar
  un ciclu care merge azi în dezvoltare nu e o garanție pentru build. Ce nu e în hartă se arată așa
  cum ni l-au spus ei, nu ascuns.
*/
const ETICHETE: Record<string, string> = {
  active: "Activ",
  new: "În moderare",
  unconfirmed: "În moderare",
  unpaid: "Neplătit",
  limited: "Limită atinsă",
  removed_by_user: "Dezactivat",
  outdated: "Expirat",
  moderated: "Respins",
  blocked: "Blocat",
  disabled: "Dezactivat de OLX",
  removed_by_moderator: "Șters de OLX",
};

const VII = new Set(["active", "limited", "new", "unconfirmed", "unpaid"]);

/*
  ⚠ În română, „de” se pune după numerele care se termină în 20 sau mai mult: 2 anunțuri, 19
  anunțuri, dar 20 DE anunțuri și 101 anunțuri. Scris fix („N de anunțuri”), textul iese greșit
  tocmai la numerele mici, care sunt cele mai des întâlnite la un cont proaspăt conectat.
*/
function anunturi(n: number): string {
  if (n === 1) return "1 anunț";
  return n % 100 >= 1 && n % 100 <= 19 ? `${n} anunțuri` : `${n} de anunțuri`;
}

function StareaLor({ status }: { status: string }) {
  return (
    <span className={cn(
      "inline-flex shrink-0 items-center rounded-full px-2 py-0.5 text-[10px] font-semibold",
      VII.has(status) ? "bg-success/10 text-success" : "bg-muted text-muted-foreground",
    )}>
      {ETICHETE[status] ?? status}
    </span>
  );
}

export function OlxImport({ businessId, onImportat }: { businessId: string; onImportat: () => void }) {
  const [scanare, setScanare] = useState<OlxScanare | null>(null);
  const [randuri, setRanduri] = useState<OlxAnuntStrain[]>([]);
  const [conectate, setConectate] = useState(0);
  const [cauta, startCautare] = useTransition();
  const [lucreaza, startLucru] = useTransition();

  const scaneaza = () => startCautare(async () => {
    const r = await scaneazaAnunturileOlx(businessId);
    if ("error" in r) { toast.error(r.error); return; }
    setScanare(r);
    setRanduri(r.anunturi);
    setConectate(0);
  });

  const scoate = (advertId: number) => setRanduri((v) => v.filter((x) => x.advertId !== advertId));

  return (
    <section className="rounded-2xl border border-border bg-card p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h3 className="text-sm font-bold text-foreground">Anunțuri existente pe OLX</h3>
          <p className="mt-1 max-w-2xl text-xs leading-relaxed text-muted-foreground">
            Dacă aveai anunțuri pe OLX înainte de Edinio, le poți lega de produsele tale în loc să
            le publici din nou. Un anunț legat își păstrează vechimea, vizualizările, mesajele și
            promovările, iar de aici încolo prețul și stocul i se actualizează singure.
          </p>
        </div>
        <Button variant="outline" size="sm" onClick={scaneaza} disabled={cauta}>
          {cauta ? <Loader2 className="animate-spin" /> : <Search />}
          {scanare ? "Scanează din nou" : "Caută anunțuri existente"}
        </Button>
      </div>

      {cauta && (
        <p className="mt-4 flex items-center gap-2 text-xs text-muted-foreground">
          <Loader2 className="h-3 w-3 animate-spin" /> Se citește contul tău de OLX. Poate dura până la un minut.
        </p>
      )}

      {scanare && !cauta && (
        <div className="mt-4 space-y-3">
          <p className="text-sm font-semibold text-foreground">
            {scanare.totalStraine === 0
              ? "Nu am găsit anunțuri de importat."
              : `Am găsit ${anunturi(scanare.totalStraine)} ${scanare.totalStraine === 1 ? "existent" : "existente"} în contul tău OLX.`}{" "}
            <span className="font-normal text-muted-foreground">
              Am citit {anunturi(scanare.totalCitite)} în total; restul sunt deja legate de produsele tale.
            </span>
          </p>

          {/*
            ⚠ Plafonul e al nostru, nu al lor, și se SPUNE. Un „am găsit N" peste un cont cu de
            patru ori mai multe anunțuri e un număr adevărat despre o treabă pe jumătate făcută,
            iar omul ar crede că restul nu există și le-ar publica din nou.
          */}
          {scanare.taiat && (
            <Callout variant="warning" icon={AlertTriangle}>
              Am oprit scanarea după {anunturi(scanare.totalCitite)}. Dacă ai mai multe în cont,
              leagă-le pe acestea și apasă din nou pe „Scanează din nou”.
            </Callout>
          )}
          {/* ⚠ Se compară cu fotografia scanării, nu cu lista de pe ecran: aceasta scade la fiecare
              „Ignoră”, iar mesajul ar începe să apară fără să se fi tăiat nimic. */}
          {scanare.totalStraine > scanare.anunturi.length && (
            <p className="text-xs text-muted-foreground">
              Se arată primele {scanare.anunturi.length}, cele cu produs propus fiind primele din listă.
            </p>
          )}
          {scanare.produseCandidate === 0 && scanare.totalStraine > 0 && (
            <Callout variant="neutral" icon={AlertTriangle}>
              Toate produsele tale au deja un anunț legat, deci nu avem ce să îți propunem. Anunțurile
              de mai jos rămân ale tale pe OLX, neatinse.
            </Callout>
          )}

          {randuri.length > 0 && (
            <>
              <p className="text-xs text-muted-foreground">
                Verifică fiecare pereche înainte să apeși. Potrivirea după titlu e o presupunere:
                „Tricou negru” și „Tricou negru XL” arată aproape la fel.
              </p>
              <ul className="space-y-2">
                {randuri.map((a) => (
                  <Rand
                    key={a.advertId}
                    anunt={a}
                    ocupat={lucreaza}
                    onIgnora={() => {
                      /*
                        ⚠ Se scoate din listă ACUM, dar se și ține minte. Fără partea a doua, un
                        comerciant cu optzeci și patru de anunțuri vechi respinge șaizeci și le
                        vede pe toate din nou la scanarea următoare — iar a doua oară nu le mai
                        citește una câte una, le sare pe toate, și atunci nici pe cele care chiar
                        erau ale lui.

                        ⚠ Scoaterea nu așteaptă răspunsul: alegerea e a lui, iar dacă scrierea
                        pică, anunțul reapare la scanarea următoare — adică exact purtarea de
                        dinainte, nu una mai proastă.
                      */
                      scoate(a.advertId);
                      void ignoraAnuntOlx(businessId, a.advertId).then((r) => {
                        if ("error" in r) toast.error(r.error);
                      });
                    }}
                    onConecteaza={() => startLucru(async () => {
                      if (!a.propunere) return;
                      const r = await conecteazaAnuntOlx(businessId, a.advertId, a.propunere.productId);
                      if ("error" in r) { toast.error(r.error); return; }
                      toast.success(`„${a.propunere.numeProdus}” e legat de anunțul ${a.advertId}.`);
                      scoate(a.advertId);
                      setConectate((n) => n + 1);
                      onImportat();
                    })}
                  />
                ))}
              </ul>
              {/*
                ⚠ Textul spune exact ce face butonul — și acum chiar ține minte, în
                `olx_config.import_ignorate`. Cât timp n-a ținut, textul o spunea; acum spune
                cealaltă jumătate, la fel de limpede: nu se schimbă nimic pe OLX.
              */}
              <p className="text-[11px] text-muted-foreground">
                „Ignoră” ține minte alegerea: anunțul nu mai apare la scanările următoare. Nu se
                schimbă nimic pe OLX — anunțul rămâne exact cum e.
              </p>
            </>
          )}

          {randuri.length === 0 && conectate > 0 && (
            <p className="flex items-center gap-1.5 text-xs text-success">
              <Check className="h-3.5 w-3.5" /> Gata. {conectate === 1 ? "Un anunț legat" : `${conectate} anunțuri legate`} de produsele tale.
            </p>
          )}
        </div>
      )}
    </section>
  );
}

function Rand({ anunt, ocupat, onConecteaza, onIgnora }: {
  anunt: OlxAnuntStrain; ocupat: boolean; onConecteaza: () => void; onIgnora: () => void;
}) {
  const p = anunt.propunere;
  return (
    <li className="rounded-xl border border-border p-3">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <a
              href={anunt.url ?? `https://www.olx.ro/d/oferta/${anunt.advertId}`}
              target="_blank"
              rel="noreferrer"
              className="flex min-w-0 items-center gap-1 text-sm font-semibold text-foreground underline-offset-2 hover:underline"
            >
              <span className="truncate">{anunt.titlu || `Anunț ${anunt.advertId}`}</span>
              <ExternalLink className="h-3 w-3 shrink-0" />
            </a>
            <StareaLor status={anunt.status} />
          </div>
          <p className="mt-0.5 text-[11px] text-muted-foreground">
            Anunț {anunt.advertId}
            {anunt.pret != null && <> · {anunt.pret} {anunt.moneda ?? "RON"}</>}
            {/* Un `external_id` străin explică de ce anunțul e aici deși pare deja legat. */}
            {anunt.externalId && <> · marcat cu un cod care nu e din magazinul tău</>}
          </p>
        </div>
        <div className="flex shrink-0 items-center gap-1.5">
          {p && (
            <Button size="sm" disabled={ocupat} onClick={onConecteaza}>
              {ocupat ? <Loader2 className="h-3 w-3 animate-spin" /> : <Link2 className="h-3 w-3" />} Conectează
            </Button>
          )}
          <Button size="sm" variant="ghost" disabled={ocupat} onClick={onIgnora}>
            <X className="h-3 w-3" /> Ignoră
          </Button>
        </div>
      </div>

      {p ? (
        <div className="mt-2 rounded-lg bg-muted/50 px-2.5 py-2">
          <p className="text-xs font-medium text-foreground">
            Produsul propus: {p.numeProdus}
            {p.sku && <span className="font-normal text-muted-foreground"> (cod {p.sku})</span>}
          </p>
          <p className="mt-0.5 text-[11px] text-muted-foreground">De ce: {p.deCe}.</p>
        </div>
      ) : (
        <p className="mt-2 text-[11px] text-muted-foreground">{anunt.fara}</p>
      )}
    </li>
  );
}

export default OlxImport;
