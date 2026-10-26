"use client";

import { useCallback, useEffect, useState } from "react";
import { Loader2, RotateCcw } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { getDesignVersion, listDesignVersions } from "@/lib/actions/store-design.actions";
import { dataVersiunii, esteInMagazin, VERSIUNI_PASTRATE, type VersiuneInLista } from "@/lib/editor-magazin/versiuni";
import type { CiornaDesign } from "./useCiornaDesign";

/**
 * Istoricul publicarilor (etapa 7 din `docs/editor-magazin/PLAN.md`): „revino la ce era ieri”.
 *
 * Fiecare „Publică” lasa o versiune. „Readu în editor” o pune in CIORNA, nu in magazin: se vede in
 * previzualizare, Anuleaza o scoate, iar clientii o vad abia la „Publică”. Cu modificari nepublicate
 * in ciorna, intai o intrebare: versiunea le inlocuieste pe ecran.
 *
 * Se monteaza doar cat e deschisa, deci fiecare deschidere citeste lista din nou.
 */
type Lista = { versiuni: VersiuneInLista[]; publicatLa: string | null };

/** „Azi, 14:32” -> „azi, 14:32”, ca sa stea in mijlocul unei propozitii. */
const inPropozitie = (s: string) => (s.startsWith("Azi") || s.startsWith("Ieri") ? s[0].toLowerCase() + s.slice(1) : s);

export function IstoricVersiuni({ businessId, ciorna, ocupat, onInchide, onReadusa }: {
  businessId: string;
  ciorna: CiornaDesign;
  /** O imagine se urca inca: readusa acum, versiunea ar fi fost calcata de ea cand ajunge. */
  ocupat: boolean;
  onInchide: () => void;
  /** Dupa ce versiunea a intrat in ciorna: editorul se intoarce la arbore si arata previzualizarea. */
  onReadusa: () => void;
}) {
  const [lista, setLista] = useState<Lista | null>(null);
  const [eroare, setEroare] = useState<string | null>(null);
  /** Creste la „Încearcă din nou”. */
  const [incercare, setIncercare] = useState(0);
  /** Versiunea care asteapta raspunsul la intrebare (modificari nepublicate in ciorna). */
  const [intreb, setIntreb] = useState<string | null>(null);
  /** Versiunea care se aduce acum. */
  const [aduc, setAduc] = useState<string | null>(null);
  const [acum] = useState(() => new Date());

  useEffect(() => {
    let anulat = false;
    listDesignVersions(businessId)
      .then((r) => {
        if (anulat) return;
        if ("error" in r) setEroare(r.error);
        else setLista(r);
      })
      .catch(() => { if (!anulat) setEroare("Nu am primit răspuns de la server. Încearcă din nou."); });
    return () => { anulat = true; };
  }, [businessId, incercare]);

  const readu = useCallback(async (v: VersiuneInLista) => {
    setIntreb(null);
    setAduc(v.id);
    let r: Awaited<ReturnType<typeof getDesignVersion>>;
    try {
      r = await getDesignVersion(businessId, v.id);
    } catch {
      setAduc(null);
      toast.error("Nu am primit răspuns de la server. Încearcă din nou.");
      return;
    }
    setAduc(null);
    if ("error" in r) {
      toast.error(r.error);
      return;
    }
    ciorna.readuVersiunea(r);
    toast.success(
      `${v.origine === "inainte" ? "Ai readus cum era magazinul înainte de istoric" : `Ai readus versiunea din ${inPropozitie(dataVersiunii(v.la, new Date()))}`}. ` +
      "O vezi în previzualizare; clienții o văd abia după „Publică”.",
    );
    onReadusa();
  }, [businessId, ciorna, onReadusa]);

  const cere = (v: VersiuneInLista) => {
    if (ciorna.areModificari) setIntreb(v.id);
    else void readu(v);
  };

  return (
    <Dialog open onOpenChange={(deschis) => { if (!deschis && !aduc) onInchide(); }}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Istoricul publicărilor</DialogTitle>
          <DialogDescription>
            Fiecare „Publică” păstrează aici o versiune a magazinului. Una readusă intră în editor ca modificare
            nepublicată: o vezi în previzualizare, iar clienții o văd abia după „Publică”.
          </DialogDescription>
        </DialogHeader>

        {ocupat && (
          <p className="rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-800">
            Se încarcă o imagine. Poți readuce o versiune după ce se termină.
          </p>
        )}

        {eroare ? (
          <div className="py-4 text-center">
            <p className="text-sm text-muted-foreground">{eroare}</p>
            <Button size="sm" variant="outline" className="mt-3" onClick={() => { setEroare(null); setIncercare((n) => n + 1); }}>
              Încearcă din nou
            </Button>
          </div>
        ) : !lista ? (
          <div className="py-8 flex justify-center text-muted-foreground">
            <Loader2 className="h-5 w-5 animate-spin" aria-label="Se încarcă istoricul" />
          </div>
        ) : lista.versiuni.length === 0 ? (
          <p className="py-4 text-sm text-muted-foreground">
            Încă nu ai nicio versiune. De la următorul „Publică”, fiecare publicare rămâne aici și o poți readuce oricând.
          </p>
        ) : (
          <ul className="max-h-[55vh] overflow-y-auto -mx-1 px-1 divide-y divide-border">
            {lista.versiuni.map((v) => {
              const inMagazin = esteInMagazin(v.la, lista.publicatLa);
              // Versiunea din magazin, fara nimic nepublicat: e exact ce e deja in editor.
              const dejaPeEcran = inMagazin && !ciorna.areModificari;
              return (
                <li key={v.id} className="py-2.5">
                  <div className="flex items-center gap-3">
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-foreground">{dataVersiunii(v.la, acum)}</p>
                      <p className="text-xs text-muted-foreground">
                        {v.origine === "inainte" ? "Cum era magazinul înainte de istoric" : "Publicare"}
                      </p>
                    </div>
                    {inMagazin && (
                      <span className="shrink-0 rounded-full bg-primary/10 px-2 py-0.5 text-[11px] font-medium text-primary">În magazin acum</span>
                    )}
                    <Button size="sm" variant="outline" className="shrink-0"
                      disabled={ocupat || ciorna.publicaInCurs || aduc !== null || dejaPeEcran}
                      title={dejaPeEcran ? "E deja ce vezi în editor." : undefined}
                      onClick={() => cere(v)}>
                      {aduc === v.id ? <Loader2 className="animate-spin" /> : <RotateCcw />}
                      Readu în editor
                    </Button>
                  </div>
                  {intreb === v.id && (
                    <div className="mt-2 rounded-lg bg-amber-50 p-3 text-xs text-amber-900">
                      <p>Ai modificări nepublicate. Versiunea readusă le înlocuiește în editor; le recuperezi cu Anulează.</p>
                      <div className="mt-2 flex justify-end gap-2">
                        <Button size="sm" variant="outline" onClick={() => setIntreb(null)}>Rămân la ele</Button>
                        <Button size="sm" disabled={ocupat || ciorna.publicaInCurs || aduc !== null} onClick={() => void readu(v)}>
                          Readu versiunea
                        </Button>
                      </div>
                    </div>
                  )}
                </li>
              );
            })}
          </ul>
        )}

        <p className="text-[11px] leading-snug text-muted-foreground">
          Păstrăm ultimele {VERSIUNI_PASTRATE} de publicări. Nu intră în istoric paginile din „Pagini”, Setările și
          vizibilitatea magazinului. O imagine ștearsă între timp din Biblioteca Media nu se mai poate readuce.
        </p>
      </DialogContent>
    </Dialog>
  );
}
