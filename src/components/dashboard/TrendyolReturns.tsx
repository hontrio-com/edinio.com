"use client";

import { useEffect, useState, useTransition } from "react";
import { Loader2, PackageCheck, RotateCcw } from "lucide-react";
import { toast } from "sonner";
import { dovadaCeruta, MOTIV_BLOCAT_24H } from "@/lib/trendyol/retur-forma";
import {
  hotarasteReturTrendyol, motiveRespingereTrendyol, repuneInStocTrendyol, retururiTrendyol,
  respingeReturTrendyolCuDovezi, type RandRetur,
} from "@/lib/actions/trendyol-retururi.actions";

/**
 * Retururile Trendyol.
 *
 * ═══ ⚠ DE CE EXISTA ECRANUL ═══
 *
 * Pana azi Edinio stia despre un retur un singur lucru: pachetul are statusul `Returned`. Nu
 * ce articol s-a intors, nu cate bucati, nu de ce, si nu daca cererea asteapta o hotarare.
 * Comerciantul afla din panoul LOR si decidea acolo.
 *
 * ═══ ⚠ DOUA APASARI, NU UNA ═══
 *
 * „Accept returul" inseamna ca banii se intorc. „Am primit marfa si e buna" inseamna ca
 * produsul se pune la loc pe raft. Sunt lucruri diferite, la momente diferite: marfa vine
 * desfacuta, incompleta, ori pur si simplu alta.
 *
 * Un singur buton care le face pe amandoua ar fi umflat stocul cu marfa nevandabila — si
 * exact asta am oprit cu o zi inainte, la trecerea automata pe „returnat".
 */

const STARI: Record<string, string> = {
  Created: "Nouă",
  WaitingInAction: "Așteaptă răspunsul tău",
  InAnalysis: "În analiză la Trendyol",
  Accepted: "Acceptată",
  Rejected: "Respinsă",
  Cancelled: "Anulată",
  Unresolved: "Nerezolvată",
};

export function TrendyolReturns({ businessId }: { businessId: string }) {
  const [retururi, setRetururi] = useState<RandRetur[] | null>(null);
  const [motive, setMotive] = useState<{ id: number; nume: string }[]>([]);
  const [doarDeHotarat, setDoarDeHotarat] = useState(true);
  /*
   * ⚠ BIFATELE SE TIN PE CERERE, NU LA GRAMADA (26.08.2026).
   *
   * Era o singura multime peste tot ecranul. Cu doua retururi deschise, „Acceptă" de la primul
   * trimitea si liniile bifate la al doilea — iar serverul le lua ca atare.
   *
   * ⚠ Serverul le verifica acum oricum (o actiune se poate chema si fara ecran), dar ecranul
   * n-are voie sa CEARA ceva gresit: altfel omul apasa si primeste un refuz pe care nu-l
   * intelege, in loc sa nu poata gresi.
   */
  const [alese, setAlese] = useState<Record<string, Set<string>>>({});
  /* ⚠ Si motivul, si explicatia: acelasi formular se randeaza pe fiecare card, iar o stare
     comuna trimitea la o cerere ce se scrisese pentru alta. */
  const [motivAles, setMotivAles] = useState<Record<string, string>>({});
  const [explicatie, setExplicatie] = useState<Record<string, string>>({});
  /*
   * ⚠ PE CERERE, NU LA GRAMADA (26.08.2026). Campul de fisiere se randeaza in FIECARE card de
   * retur, dar starea era una singura pentru tot ecranul: fisierele alese la un retur plecau la
   * respingerea altuia. Aceeasi greseala ca la bifate, facuta a doua oara in acelasi fisier.
   */
  const [dovezi, setDovezi] = useState<Record<string, File[]>>({});

  /* ⚠ Motivul e tinut ca sir in `<select>`; `dovadaCeruta` vrea numar, si `Number("")` e 0 —
     adica exact „niciun motiv ales", care nu cere nimic. */
  const ceruta = (claimId: string) => dovadaCeruta(Number(motivAles[claimId]) || null);

  /*
   * ⚠ „Bifează întâi liniile" e o apăsare IMPOSIBILĂ pe cererile pe care lista le ține anume.
   * Când nicio linie n-are stare citibilă, toate bifele sunt stinse — iar cererea apare totuși în
   * „Așteaptă răspunsul tău", fiindcă necunoscutul se arată, nu se ascunde. Omul ar fi căutat la
   * nesfârșit o bifă care nu se poate apăsa.
   *
   * ⚠ SCRISA O DATA, chemata din amândouă căile. Prima oară am pus-o doar în `respinge`, iar
   * `hotaraste` a rămas cu textul vechi — două căi care fac același lucru se despart la prima
   * reparație care le atinge pe rând.
   */
  function deCeNuSePoateBifa(claimId: string): string {
    const linii = retururi?.find((x) => x.claimId === claimId)?.linii ?? [];
    return linii.length > 0 && linii.every((l) => !l.sePoateHotari)
      ? "Nicio linie din returul ăsta nu mai poate primi un răspuns acum. Vezi motivul scris sub fiecare."
      : "Bifează întâi liniile din acest retur.";
  }
  const [seIncarca, incepe] = useTransition();

  function incarca(doar = doarDeHotarat) {
    incepe(async () => {
      const r = await retururiTrendyol(businessId, doar);
      if ("error" in r) { toast.error(r.error); return; }
      setRetururi(r.retururi);
    });
  }

  /* ⚠ Se incarca la schimbarea magazinului, nu la fiecare randare: `incarca` se recreeaza la
     fiecare trecere, iar pusa in lista de dependinte ar fi cerut retururile la nesfarsit. */
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { incarca(); }, [businessId]);

  function comuta(claimId: string, id: string) {
    setAlese((p) => {
      const n = new Set(p[claimId] ?? []);
      if (n.has(id)) n.delete(id); else n.add(id);
      return { ...p, [claimId]: n };
    });
  }

  /**
   * Respingerea, cu dovezi.
   *
   * ⚠ MERGE PRIN `FormData`: o actiune de server nu poate primi `File` printre argumente
   * serializate. De-aia respingerea are calea ei, iar acceptarea ramane pe cea obisnuita.
   */
  function respinge(claimId: string) {
    const ids = [...(alese[claimId] ?? [])];
    if (ids.length === 0) { toast.error(deCeNuSePoateBifa(claimId)); return; }
    const fd = new FormData();
    fd.set("claimId", claimId);
    fd.set("claimItemIds", ids.join(","));
    fd.set("motivId", motivAles[claimId] ?? "");
    fd.set("explicatie", explicatie[claimId] ?? "");
    for (const f of dovezi[claimId] ?? []) fd.append("dovezi", f);
    incepe(async () => {
      const r = await respingeReturTrendyolCuDovezi(businessId, fd);
      if ("error" in r) { toast.error(r.error); return; }
      /* ⚠ Pe LINII, ca la `hotaraste`: retururile lor sunt partiale. */
      toast.success(`${ids.length === 1 ? "Linia a fost respinsă" : `${ids.length} linii au fost respinse`}.`);
      setAlese((p) => ({ ...p, [claimId]: new Set() }));
      setExplicatie((p) => ({ ...p, [claimId]: "" }));
      setDovezi((p) => ({ ...p, [claimId]: [] }));
      incarca();
    });
  }

  function hotaraste(claimId: string, accepta: boolean) {
    const ids = [...(alese[claimId] ?? [])];
    /* ⚠ Aceeasi paza ca la `respinge`: vezi nota de acolo. Cand nicio linie nu se poate bifa,
       „Bifează întâi liniile" e o apasare imposibila. */
    if (ids.length === 0) { toast.error(deCeNuSePoateBifa(claimId)); return; }
    incepe(async () => {
      const r = await hotarasteReturTrendyol(businessId, {
        claimId, claimItemIds: ids, accepta,
        motivId: accepta ? undefined : Number(motivAles[claimId]) || undefined,
        explicatie: accepta ? undefined : explicatie[claimId],
      });
      if ("error" in r) { toast.error(r.error); return; }
      /*
        ⚠ HOTĂRÂREA E PE LINII, iar retururile Trendyol sunt PARȚIALE: omul poate accepta o bucată
        și respinge alta din aceeași cerere. „Returul a fost acceptat" spunea despre tot ce se
        întâmplase doar cu liniile bifate — iar dacă mai rămâneau linii nehotărâte, îl trimitea
        acasă crezând că a terminat.
      */
      const cate = ids.length;
      toast.success(accepta
        ? `${cate === 1 ? "Linia a fost acceptată" : `${cate} linii au fost acceptate`}.`
        : `${cate === 1 ? "Linia a fost respinsă" : `${cate} linii au fost respinse`}.`);
      setAlese((p) => ({ ...p, [claimId]: new Set() }));
      setExplicatie((p) => ({ ...p, [claimId]: "" }));
      incarca();
    });
  }

  function pune(claimItemId: string) {
    incepe(async () => {
      const r = await repuneInStocTrendyol(businessId, claimItemId);
      if ("error" in r) { toast.error(r.error); return; }
      toast.success(r.pus > 0 ? `${r.pus} buc. au intrat înapoi în stoc.` : "Era deja pusă înapoi.");
      incarca();
    });
  }

  /* ⚠ Motivele se cer ABIA cand omul vrea sa respinga: sunt o cerere catre ei, si n-are rost
     arsa pentru fiecare deschidere a ecranului. */
  function ceruMotivele() {
    if (motive.length > 0) return;
    incepe(async () => {
      const r = await motiveRespingereTrendyol(businessId);
      if ("error" in r) { toast.error(r.error); return; }
      setMotive(r.motive);
    });
  }

  return (
    <div className="rounded-xl border border-border bg-card p-4">
      <div className="flex items-center justify-between gap-3 mb-3">
        <h3 className="text-sm font-semibold text-foreground inline-flex items-center gap-2">
          <RotateCcw className="h-4 w-4" /> Retururi Trendyol
        </h3>
        <label className="flex items-center gap-1.5 text-xs text-muted-foreground cursor-pointer">
          <input
            type="checkbox"
            checked={doarDeHotarat}
            onChange={(e) => { setDoarDeHotarat(e.target.checked); incarca(e.target.checked); }}
          />
          Doar cele care așteaptă
        </label>
      </div>

      {seIncarca && !retururi && (
        <p className="text-xs text-muted-foreground inline-flex items-center gap-2">
          <Loader2 className="h-3.5 w-3.5 animate-spin" /> Se încarcă…
        </p>
      )}

      {retururi?.length === 0 && (
        <p className="text-sm text-muted-foreground">Niciun retur {doarDeHotarat ? "de rezolvat" : "înregistrat"}.</p>
      )}

      <div className="space-y-3">
        {(retururi ?? []).map((r) => (
          <div key={r.claimId} className="rounded-lg border border-border p-3">
            <div className="flex flex-wrap items-center justify-between gap-2 mb-2">
              <span className="text-sm font-medium text-foreground">
                {r.orderNumber ?? "Comandă necunoscută"}
              </span>
              <span className="text-[11px] rounded-full bg-muted px-2 py-0.5 text-muted-foreground">
                {STARI[r.status ?? ""] ?? r.status ?? "—"}
              </span>
            </div>

            {/*
              ═══ ⚠ „RESPINS" NU INSEAMNA „GATA" (26.08.2026) ═══

              Regula lor, verbatim: cu `dontShipBack: false`, comerciantul TREBUIE sa trimita
              coletul inapoi clientului, daca ei accepta respingerea. El apasa „Respinge",
              primeste 200, si crede ca a terminat — iar returul se intoarce impotriva lui.

              ⚠ Se arata NUMAI cand exista chiar un colet de retur-respins. `null` inseamna ca
              nu s-a creat niciunul, si nu are ce sa i se spuna: o alarma care suna si cand nu e
              nimic de facut inceteaza sa fie citita.
            */}
            {r.nuTrimiteInapoi === false && r.coletRespins && (
              <div className="mb-2 rounded-lg border border-amber-200 bg-amber-50 p-2.5 text-[11px] text-amber-900 dark:border-amber-900/40 dark:bg-amber-950/30 dark:text-amber-200">
                <p className="font-medium">Mai ai de trimis coletul înapoi clientului.</p>
                <p className="mt-0.5 leading-relaxed">
                  Dacă Trendyol acceptă respingerea, produsul se întoarce la client pe cheltuiala
                  ta. Coletul e deja pregătit de ei.
                </p>
                <p className="mt-1 font-mono">
                  {r.coletRespins.curier ?? "Curier"}
                  {r.coletRespins.awb ? ` · AWB ${r.coletRespins.awb}` : ""}
                  {r.coletRespins.pin ? ` · PIN ${r.coletRespins.pin}` : ""}
                </p>
                {r.coletRespins.link && (
                  <a
                    href={r.coletRespins.link} target="_blank" rel="noopener noreferrer"
                    className="mt-1 inline-block underline"
                  >
                    Urmărește coletul
                  </a>
                )}
              </div>
            )}
            {/*
              ⚠ `dontShipBack` vine pe COLETUL de retur-respins, care e la nivel de cerere — dar
              o cerere poate avea linii acceptate și linii respinse deodată. „Respins." spus
              despre tot îl contrazicea pe omul care tocmai acceptase o linie. Se spune doar ce
              știm sigur: că nu are nimic de expediat.
            */}
            {r.nuTrimiteInapoi === true && (
              <p className="mb-2 text-[11px] text-muted-foreground">
                Nu trebuie să trimiți nimic înapoi clientului.
              </p>
            )}
            {/*
              ⚠ FAPTELE, FĂRĂ INSTRUCȚIUNE. `replacementOutboundpackageinfo` apare în
              răspunsul-exemplu al lui `getClaims` cu AWB, curier și link — dar ghidul lor nu
              spune NICĂIERI ce are comerciantul de făcut la un retur de tip schimb. Deci i se
              arată ce vedem, și nu i se cere nimic: un „trimite un produs de schimb" greșit l-ar
              pune să dea marfă degeaba.

              ⚠ Tonul e neutru anume, nu de alarmă. Caseta de deasupra e chihlimbarie fiindcă
              acolo CHIAR are ceva de făcut; aici doar află.
            */}
            {r.coletInlocuire && (
              <div className="mb-2 rounded-lg border border-border bg-muted/40 p-2.5 text-[11px]">
                <p className="font-medium">Trendyol a creat un colet de înlocuire pentru returul ăsta.</p>
                <p className="mt-0.5 leading-relaxed text-muted-foreground">
                  E un retur de tip schimb. Îți arătăm coletul așa cum ni-l dau ei; dacă e ceva de
                  făcut, o vezi în panoul Trendyol.
                </p>
                <p className="mt-1 font-mono">
                  {r.coletInlocuire.curier ?? "Curier"}
                  {r.coletInlocuire.awb ? ` · AWB ${r.coletInlocuire.awb}` : ""}
                </p>
                {r.coletInlocuire.link && (
                  <a
                    href={r.coletInlocuire.link} target="_blank" rel="noopener noreferrer"
                    className="mt-1 inline-block underline"
                  >
                    Urmărește coletul
                  </a>
                )}
              </div>
            )}

            <ul className="space-y-1.5">
              {r.linii.map((l) => (
                <li key={l.claimItemId} className="flex flex-wrap items-start gap-2 text-xs">
                  {/*
                    ⚠ O linie care nu mai poate primi o hotărâre nu se poate nici bifa. Serverul
                    o oprește oricum, dar bifată aici ar fi blocat apăsarea pentru TOATE
                    celelalte: verificarea e pe toată lista, nu pe fiecare linie. Omul ar fi
                    primit „reîncarcă pagina" fără să înțeleagă care linie l-a oprit.
                  */}
                  <input
                    type="checkbox"
                    className="mt-0.5"
                    checked={alese[r.claimId]?.has(l.claimItemId) ?? false}
                    disabled={!l.sePoateHotari}
                    onChange={() => comuta(r.claimId, l.claimItemId)}
                    aria-label={`Alege ${l.numeProdus ?? l.barcode ?? "linia"}`}
                  />
                  <span className="min-w-0 flex-1">
                    <span className="text-foreground">{l.numeProdus ?? l.barcode ?? "Produs"}</span>
                    <span className="text-muted-foreground"> · {l.cantitate} buc.</span>
                    {l.motiv && <span className="text-muted-foreground"> · {l.motiv}</span>}
                    {l.notaClient && (
                      <span className="block text-muted-foreground">„{l.notaClient}”</span>
                    )}
                    {/*
                      ⚠ Se spune si DE CE nu se poate bifa, altfel o bifa stinsa arata a defect.
                      Si se spune ADEVĂRUL: „nu știm" nu e același lucru cu „s-a hotărât deja".
                      O linie a cărei stare n-am putut-o citi stă într-o cerere care apare anume
                      în lista „așteaptă răspunsul tău" — iar „nu mai așteaptă" ar fi contrazis
                      chiar lista în care se află.
                    */}
                    {/*
                      ⚠ „Se trimite" e o stare de sine statatoare, nu o lipsa. Fara ea, o linie cu
                      hotararea in zbor arata exact ca una pe care n-o poti bifa „fiindca nu mai
                      asteapta raspunsul tau" — un neadevar, si tocmai in clipa in care omul se
                      intreaba daca apasarea lui a contat.
                    */}
                    {l.seTrimite && (
                      <span className="block text-[11px] text-muted-foreground">
                        se trimite hotărârea la Trendyol; se confirmă la următoarea sincronizare
                      </span>
                    )}
                    {!l.sePoateHotari && !l.decizie && !l.seTrimite && (
                      <span className="block text-[11px] text-muted-foreground">
                        {l.stareNecunoscuta
                          ? "nu i-am putut citi starea de la Trendyol; se reîncearcă la fiecare sincronizare"
                          : l.deCeNuSeRepune === "abia-cerut"
                            ? "clientul abia a cerut returul; nu ai ce răspunde până nu ajunge la tine"
                            : "nu mai așteaptă un răspuns de la tine"}
                      </span>
                    )}
                    {l.decizie && (
                      <span className="block text-[11px] text-muted-foreground">
                        {l.decizie === "accepted" ? "Acceptat de tine" : "Respins de tine"}
                      </span>
                    )}
                  </span>
                  {/*
                    ⚠ A DOUA APASARE, si numai dupa ce omul a vazut marfa. Acceptarea returului
                    inseamna ca banii se intorc, nu ca produsul e bun de pus la loc pe raft.
                  */}
                  {l.repusInStoc ? (
                    <span className="text-[11px] text-emerald-700 dark:text-emerald-400 inline-flex items-center gap-1">
                      <PackageCheck className="h-3 w-3" /> pusă în stoc
                    </span>
                  ) : !l.sePoateRepune ? (
                    /*
                      ⚠ NU SE ARATA UN BUTON CARE VA FI REFUZAT. Serverul oprește oricum — acolo e
                      paza adevărată — dar aici se spune DE CE, ca omul să nu apese și să afle pe
                      urmă.

                      ⚠ PATRU MOTIVE, NU UNUL. Un singur „nu se poate" l-ar trimite să caute o
                      problemă care nu există — sau, mai rău, să aștepte ceva ce nu vine: pe
                      „Rejected" nu mai vine nimic, iar dacă marfa pleacă înapoi la client,
                      repunerea ar fi fost de-a dreptul greșită. Vezi `deCeNuSeRepune`.
                    */
                    <span className="text-[11px] text-muted-foreground">
                      {l.deCeNuSeRepune === "necunoscut"
                        ? "nu i-am putut confirma starea la Trendyol; se reîncearcă la fiecare sincronizare"
                        : l.deCeNuSeRepune === "abia-cerut"
                          ? "clientul abia a cerut returul; coletul n-a ajuns încă la tine"
                          : l.asteaptaConfirmarea
                            ? "am trimis acceptarea; așteptăm confirmarea Trendyol, apoi poți pune marfa înapoi"
                            : l.deCeNuSeRepune === "nehotarat"
                              ? "returul nu e încă hotărât; poți pune marfa înapoi după ce îl accepți"
                              : "returul nu s-a acceptat, deci nu punem marfa înapoi automat — dacă totuși o păstrezi, corectează stocul din fișa produsului"}
                    </span>
                  ) : (
                    <button
                      type="button"
                      onClick={() => pune(l.claimItemId)}
                      disabled={seIncarca}
                      className="rounded border border-border px-2 py-0.5 text-[11px] hover:bg-muted disabled:opacity-60"
                    >
                      Am primit marfa și e bună
                    </button>
                  )}
                </li>
              ))}
            </ul>

            <div className="mt-2 flex flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={() => hotaraste(r.claimId, true)}
                disabled={seIncarca}
                className="rounded-lg bg-primary px-3 py-1 text-xs text-primary-foreground hover:opacity-90 disabled:opacity-60"
              >
                Acceptă returul
              </button>
              <button
                type="button"
                onClick={() => { ceruMotivele(); }}
                disabled={seIncarca}
                className="rounded-lg border border-border px-3 py-1 text-xs hover:bg-muted disabled:opacity-60"
              >
                Respinge…
              </button>
              {motive.length > 0 && (
                <>
                  <select
                    value={motivAles[r.claimId] ?? ""}
                    onChange={(e) => setMotivAles((p) => ({ ...p, [r.claimId]: e.target.value }))}
                    className="rounded border border-border bg-background px-2 py-1 text-xs"
                  >
                    <option value="">Alege motivul</option>
                    {motive.map((m) => <option key={m.id} value={m.id}>{m.nume}</option>)}
                  </select>
                  <input
                    value={explicatie[r.claimId] ?? ""}
                    onChange={(e) => setExplicatie((p) => ({ ...p, [r.claimId]: e.target.value }))}
                    placeholder="Scrie de ce respingi"
                    className="min-w-40 flex-1 rounded border border-border bg-background px-2 py-1 text-xs"
                  />
                  {/*
                    ⚠ DOVADA E CERUTĂ DE GHIDUL LOR, în afară de două motive — vezi nota lungă de
                    la `MOTIVE_FARA_DOVADA`. Ecranul o spune înainte de apăsare, iar serverul o
                    oprește oricum: butonul care se dezactivează e o curtoazie, nu o pază.
                  */}
                  <label className="flex w-full flex-col gap-0.5">
                    <input
                      type="file" multiple accept="application/pdf,image/jpeg,image/png"
                      onChange={(e) => setDovezi((p) => ({ ...p, [r.claimId]: [...(e.target.files ?? [])] }))}
                      className="text-[11px] file:mr-2 file:rounded file:border file:border-border file:bg-muted file:px-2 file:py-0.5 file:text-[11px]"
                    />
                    <span className="text-[11px] text-muted-foreground">
                      {ceruta(r.claimId)
                        ? "Trendyol cere o dovadă pentru motivul ales: poză cu marfa primită sau document. "
                        : "Poze cu marfa primită sau documente, dacă ai. "}
                      Cel mult 5 fișiere, PDF, JPEG sau PNG, până în 10 MB fiecare.
                      {(dovezi[r.claimId]?.length ?? 0) > 0 && ` Ai ales ${dovezi[r.claimId].length}.`}
                    </span>
                    {/*
                      ⚠ REGULA LOR, altfel refuzul vine de la ei cu un text care nu explică nimic:
                      motivul 1651 nu poate fi ales în primele 24 de ore de când returul a intrat
                      în „Așteaptă răspunsul tău". E chiar unul dintre cele două motive scutite de
                      dovadă, deci e cel spre care omul e împins să meargă.
                    */}
                    {Number(motivAles[r.claimId]) === MOTIV_BLOCAT_24H && (
                      <span className="text-[11px] text-amber-700">
                        Motivul ăsta nu poate fi folosit în primele 24 de ore de când returul
                        așteaptă răspunsul tău. Dacă respingerea e refuzată, mai încearcă mâine.
                      </span>
                    )}
                  </label>
                  <button
                    type="button"
                    onClick={() => respinge(r.claimId)}
                    disabled={
                      seIncarca || !motivAles[r.claimId] || !(explicatie[r.claimId] ?? "").trim()
                      || (alese[r.claimId]?.size ?? 0) === 0
                      || (ceruta(r.claimId) && (dovezi[r.claimId]?.length ?? 0) === 0)
                    }
                    className="rounded-lg border border-red-300 px-3 py-1 text-xs text-red-700 hover:bg-red-50 disabled:opacity-60"
                  >
                    Trimite respingerea
                  </button>
                </>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
