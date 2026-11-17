"use client";

import { useState, useTransition, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Download, FileCheck, FlaskConical, Loader2, RefreshCw, RotateCcw, XCircle } from "lucide-react";
import { descarcaPdfDeLaCasa } from "./descarcaPdf";

/**
 * Fila unei case de facturare „cu cheie” in pagina comenzii: Facturis, Factureaza.ro, easybill.
 *
 * ═══ CE AU IN COMUN ═══
 *
 * La emitere intorc id-ul documentului (CHEIA), iar seria si numarul se citesc dupa. Cheia pe comanda
 * spune ca documentul EXISTA, chiar daca numarul nu s-a citit inca: atunci fila arata „Citește
 * numărul”, o citire pura. PDF-ul vine numai prin API, cu cheile contului, deci prin ruta noastra.
 * Actiunile lor intorc aceeasi forma (`RezultatCasa`).
 *
 * Un singur loc pentru toate trei: scrisa de mana pentru fiecare casa, fila s-ar fi despartit la prima
 * schimbare (un mesaj, o garda, a doua apasare la stornare).
 *
 * ⚠ Mesajul de cadere nu invita la reincercare oarba: un raspuns pierdut nu spune daca s-a emis.
 * ⚠ Stornarea e un act fiscal ireversibil: cere a doua apasare, cu ce se intampla scris pe fata.
 */

/** Ce intorc actiunile caselor cu cheie, toate la fel. */
export type RezultatCasa = { number: string; series: string; avertisment?: string } | { error: string };

export interface DocumentPeComanda {
  cheie: string | null | undefined;
  serie: string | null | undefined;
  numar: string | null | undefined;
}

/** „SERIE NR”, sau gol cat timp numarul nu s-a citit. */
export function numarDocument(d: DocumentPeComanda): string {
  return [d.serie, d.numar].map((x) => (x ?? "").trim()).filter(Boolean).join(" ");
}

type Actiune = "invoice" | "storno" | "refresh";

export function FilaCaseiCuCheie({
  casa,
  ruta,
  orderId,
  factura,
  storno,
  deTest = false,
  modTest = false,
  emite,
  citeste,
  storneaza,
  stornareInAfara,
}: {
  /** Numele casei, asa cum il vede omul („Facturis”, „Factureaza.ro”, „easybill”). */
  casa: string;
  /** Ruta noastra de PDF, `/api/<casa>/pdf`. */
  ruta: string;
  orderId: string;
  factura: DocumentPeComanda;
  storno: DocumentPeComanda;
  /** Documentele de pe comanda sunt din modul de test al casei: nu sunt fiscale, si se spune pe fata. */
  deTest?: boolean;
  /** Integrarea e ACUM in modul de test (altfel, un document de test se inlocuieste cu unul real). */
  modTest?: boolean;
  emite: () => Promise<RezultatCasa>;
  citeste: () => Promise<RezultatCasa>;
  /** Stornarea din Edinio. Lipsa = casa n-o are in API; atunci `stornareInAfara` spune ce se face. */
  storneaza?: () => Promise<RezultatCasa>;
  stornareInAfara?: ReactNode;
}) {
  const router = useRouter();
  const [ocupat, porneste] = useTransition();
  const [actiune, setActiune] = useState<Actiune | null>(null);
  const [pdf, setPdf] = useState<"invoice" | "storno" | null>(null);
  const [confirmStorno, setConfirmStorno] = useState(false);

  function fa(ce: Actiune) {
    const cheama = ce === "invoice" ? emite : ce === "storno" ? storneaza : citeste;
    if (!cheama) return;
    setActiune(ce);
    /* La stornare, caseta de confirmare RAMANE deschisa cat lucreaza: rotita ei e singurul semn ca
       actul fiscal e in curs. Se inchide la final (in `finally`). */
    if (ce !== "storno") setConfirmStorno(false);
    porneste(async () => {
      let rezultat: RezultatCasa;
      try {
        rezultat = await cheama();
      } catch {
        if (ce === "refresh") {
          toast.error("Nu am primit răspuns de la server. Încearcă din nou.");
          return;
        }
        toast.error(
          `Nu am primit răspuns de la server, deci nu știm dacă ${ce === "invoice" ? "factura" : "stornarea"} s-a emis în ${casa}. Verifică în contul ${casa} înainte să încerci din nou.`,
          { duration: 12000 },
        );
        router.refresh();
        return;
      } finally {
        setActiune(null);
        setConfirmStorno(false);
      }
      if ("error" in rezultat) {
        toast.error(rezultat.error, { duration: 10000 });
        return;
      }
      const nr = numarDocument({ cheie: null, serie: rezultat.series, numar: rezultat.number });
      if (ce === "refresh") {
        /* O citire cu avertisment (de pilda factura anulata in contul casei) nu e o veste buna:
           numai avertismentul, fara bifa verde. */
        if (rezultat.avertisment) toast.warning(rezultat.avertisment, { duration: 15000 });
        else toast.success(nr ? `Numărul din ${casa}: ${nr}.` : `${casa} n-a dat încă numărul documentului.`);
      } else {
        const doc = ce === "invoice" ? `Factura ${casa}` : `Stornarea ${casa}`;
        toast.success(nr ? `${doc} ${nr} a fost emisă.` : `${doc} a fost emisă.`);
        if (rezultat.avertisment) toast.warning(rezultat.avertisment, { duration: 15000 });
      }
      router.refresh();
    });
  }

  async function descarca(tip: "invoice" | "storno") {
    setPdf(tip);
    try {
      await descarcaPdfDeLaCasa(ruta, casa, orderId, tip);
    } finally {
      setPdf(null);
    }
  }

  const nrFactura = numarDocument(factura);
  const nrStorno = numarDocument(storno);
  const lipsesteNumarul = (!!factura.cheie && !factura.numar) || (!!storno.cheie && !storno.numar);
  const roteste = (ce: Actiune) => ocupat && actiune === ce;

  const butonPdf = (tip: "invoice" | "storno", eticheta: string) => (
    <button type="button" onClick={() => descarca(tip)} disabled={pdf !== null}
      className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-lg border border-border bg-muted/40 hover:bg-muted transition-colors disabled:opacity-50">
      {pdf === tip ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Download className="h-3.5 w-3.5" />}
      {eticheta}
    </button>
  );
  const citesteNumarul = lipsesteNumarul ? (
    <button type="button" onClick={() => fa("refresh")} disabled={ocupat}
      className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-lg border border-border bg-muted/40 hover:bg-muted transition-colors disabled:opacity-50">
      {roteste("refresh") ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="h-3.5 w-3.5" />}
      Citește numărul
    </button>
  ) : null;
  const butonEmitere = (text: string) => (
    <button type="button" onClick={() => fa("invoice")} disabled={ocupat}
      className="inline-flex items-center gap-2.5 px-4 py-2.5 text-sm font-semibold rounded-xl border border-border bg-muted/40 hover:bg-muted transition-colors disabled:opacity-50">
      {roteste("invoice") ? <Loader2 className="h-4 w-4 animate-spin" /> : <FileCheck className="h-4 w-4" />}
      {roteste("invoice") ? "Se emite..." : text}
    </button>
  );
  const eticheteTest = deTest ? (
    <span className="inline-flex items-center gap-1 rounded-full bg-warning/10 px-2 py-0.5 text-[10px] font-semibold text-warning">
      <FlaskConical className="h-3 w-3" />
      Document de test, nu e fiscal
    </span>
  ) : null;
  const notaModTest = modTest ? (
    <p className="text-xs text-muted-foreground">{casa} e în modul de test: documentele emise de aici nu sunt fiscale.</p>
  ) : null;

  if (storno.cheie) {
    return (
      <div className="space-y-2">
        <div className="flex flex-wrap items-center gap-2">
          <XCircle className="h-4 w-4 text-destructive flex-shrink-0" />
          <p className="text-sm font-mono font-bold text-destructive">Storno {nrStorno || "(numărul nu s-a citit încă)"}</p>
          {eticheteTest}
        </div>
        {nrFactura && <p className="text-xs text-muted-foreground">Stornează factura <span className="font-mono">{nrFactura}</span>.</p>}
        <div className="flex flex-wrap items-center gap-2">
          {butonPdf("storno", "PDF stornare")}
          {factura.cheie && butonPdf("invoice", "PDF factură")}
          {citesteNumarul}
        </div>
        {/* Dupa storno comanda e din nou facturabila: factura noua o mentioneaza pe cea stornata. */}
        {butonEmitere("Emite factură nouă")}
        {notaModTest}
      </div>
    );
  }

  /* Un document de TEST, iar integrarea e acum pe contul real: nu e fiscal, deci comanda se poate
     factura de-adevaratelea. Stornarea lui n-are sens (si n-ar trece: alt cont). */
  if (factura.cheie && deTest && !modTest) {
    return (
      <div className="space-y-2">
        <div className="flex flex-wrap items-center gap-2">
          <FlaskConical className="h-4 w-4 text-warning flex-shrink-0" />
          <p className="text-sm font-mono font-bold text-foreground">Document de test {nrFactura}</p>
        </div>
        <p className="text-xs text-muted-foreground">
          A fost emis cât {casa} era în modul de test și nu e o factură fiscală. Acum e legat contul real: emite factura comenzii.
        </p>
        {butonEmitere("Emite factura")}
      </div>
    );
  }

  if (factura.cheie) {
    return (
      <div className="space-y-2">
        <div className="flex flex-wrap items-center gap-2">
          <FileCheck className="h-4 w-4 text-success flex-shrink-0" />
          <p className="text-sm font-mono font-bold text-foreground">Factura {nrFactura || "(numărul nu s-a citit încă)"}</p>
          {eticheteTest}
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {butonPdf("invoice", "PDF")}
          {citesteNumarul}
        </div>
        {!storneaza ? stornareInAfara : confirmStorno ? (
          <div className="space-y-2 rounded-lg border border-destructive/30 p-3">
            <p className="text-xs text-foreground">Se emite în {casa} o factură cu cantitățile cu minus, care anulează factura {nrFactura || "comenzii"}. Nu se poate retrage.</p>
            <div className="flex flex-wrap gap-2">
              <button type="button" onClick={() => fa("storno")} disabled={ocupat}
                className="inline-flex items-center gap-2 px-3 py-1.5 text-xs font-semibold rounded-lg bg-destructive text-white hover:bg-destructive/90 transition-colors disabled:opacity-50">
                {roteste("storno") ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RotateCcw className="h-3.5 w-3.5" />}
                Da, stornează
              </button>
              <button type="button" onClick={() => setConfirmStorno(false)} disabled={ocupat}
                className="px-3 py-1.5 text-xs font-semibold rounded-lg border border-border hover:bg-muted transition-colors disabled:opacity-50">
                Renunță
              </button>
            </div>
          </div>
        ) : (
          <button type="button" onClick={() => setConfirmStorno(true)} disabled={ocupat}
            className="flex items-center gap-2 px-4 py-2 text-sm font-semibold rounded-lg border border-destructive/20 text-destructive hover:bg-destructive/10 transition-colors disabled:opacity-50">
            <RotateCcw className="h-4 w-4" />
            Emite storno
          </button>
        )}
        {notaModTest}
      </div>
    );
  }

  return (
    <div className="space-y-2">
      {butonEmitere("Generează factura")}
      {notaModTest}
    </div>
  );
}
