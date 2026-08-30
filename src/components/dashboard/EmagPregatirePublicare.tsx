"use client";

import { useEffect, useState, useTransition } from "react";
import { BLOC_PREGATIRE_PUBLICARE } from "@/lib/emag/etichete";
import { CheckCircle, Loader2 } from "lucide-react";
import { toast } from "sonner";
import {
  getEmagCoteTva, getEmagTimpiPregatire, salveazaSetariEmag,
} from "@/lib/actions/emag.actions";

/**
 * Cele două setări fără de care nu se poate publica nimic pe eMAG.
 *
 * ═══ ⚠ DE CE EXISTĂ ECRANUL ĂSTA ═══
 *
 * `ceLipsestePentruPublicare` spunea „Alege cota de TVA folosită pe eMAG, în setările
 * integrării" și „Alege în câte zile expediezi" — dar în setările integrării NU EXISTA
 * niciun câmp pentru niciuna. Zero rezultate pentru `vat_id` în toate ecranele eMAG.
 *
 * Deci comerciantul apăsa „Publică", primea un mesaj care îl trimitea undeva, se ducea
 * acolo, și nu găsea nimic. Un drum înfundat, iar publicarea rămânea blocată fără nicio
 * cale de ieșire.
 *
 * Acțiunile existau demult și erau bine scrise — `getEmagCoteTva` chiar întoarce cota
 * potrivită cu cea a magazinului. Nu le chema nimeni.
 *
 * ═══ ⚠ DE CE VALORILE VIN DE LA EI, NU DINTR-O LISTĂ DE-A NOASTRĂ ═══
 *
 * `vat_id` e un identificator din CONTUL comerciantului, nu o cotă. Un număr scris de
 * noi s-ar fi potrivit din întâmplare la unii și ar fi publicat ofertele altora cu TVA-ul
 * altcuiva — fără nicio eroare, fiindcă e un id valid. Se vinde așa, și se află la
 * contabilitate.
 *
 * La fel timpul de pregătire: eMAG acceptă doar valorile din lista lui.
 */

const CAMP = "w-full rounded-lg border border-border bg-background px-3 py-2 text-sm";

export function EmagPregatirePublicare({
  businessId, vatId, handlingTime,
}: {
  businessId: string;
  vatId: number | null;
  handlingTime: number | null;
}) {
  const [cote, setCote] = useState<{ vat_id: number; vat_rate?: number }[] | null>(null);
  const [sugerata, setSugerata] = useState<number | null>(null);
  const [timpi, setTimpi] = useState<{ value: number }[] | null>(null);
  const [alesTva, setAlesTva] = useState<string>(vatId != null ? String(vatId) : "");
  const [alesTimp, setAlesTimp] = useState<string>(handlingTime != null ? String(handlingTime) : "");
  const [seIncarca, setSeIncarca] = useState(true);
  const [seSalveaza, incepe] = useTransition();

  useEffect(() => {
    let viu = true;
    void (async () => {
      /* ⚠ Amândouă deodată: sunt două cereri din cele 3 pe secundă ale magazinului, iar
         una după alta ar fi ținut omul să se uite la două rotițe pe rând. */
      const [tva, tp] = await Promise.all([
        getEmagCoteTva(businessId),
        getEmagTimpiPregatire(businessId),
      ]);
      if (!viu) return;
      setSeIncarca(false);

      if ("error" in tva) toast.error(tva.error);
      else {
        setCote(tva.cote as { vat_id: number; vat_rate?: number }[]);
        setSugerata(tva.sugerata);
        /* ⚠ Sugestia se pune doar când omul n-a ales deja. Pusă peste alegerea lui, un
           magazin cu TVA special și-ar fi văzut setarea rescrisă la fiecare deschidere. */
        if (vatId == null && tva.sugerata != null) setAlesTva(String(tva.sugerata));
      }

      if ("error" in tp) toast.error(tp.error);
      else setTimpi(tp.valori as { value: number }[]);
    })();
    return () => { viu = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [businessId]);

  function salveaza() {
    incepe(async () => {
      const r = await salveazaSetariEmag(businessId, {
        ...(alesTva ? { vat_id: Number(alesTva) } : {}),
        ...(alesTimp ? { handling_time: Number(alesTimp) } : {}),
      });
      if ("error" in r) {
        toast.error(r.error);
        return;
      }
      toast.success("Salvat. Acum poți publica produse pe eMAG.");
    });
  }

  const gata = !!alesTva && !!alesTimp;

  return (
    <div className="mt-5 space-y-4 border-t border-border pt-5">
      <div>
        <h3 className="flex items-center gap-2 text-sm font-semibold">
          {BLOC_PREGATIRE_PUBLICARE}
          {gata && <CheckCircle className="h-4 w-4 text-primary" />}
        </h3>
        <p className="mt-1 max-w-prose text-xs text-muted-foreground">
          Amândouă vin din contul tău eMAG. Nu sunt liste scrise de noi.
        </p>
      </div>

      {seIncarca ? (
        <p className="flex items-center gap-2 text-sm text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" /> Se citesc din contul tău eMAG…
        </p>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2">
          <label className="block">
            <span className="mb-1 block text-sm font-medium">Cota de TVA</span>
            <select
              className={CAMP}
              value={alesTva}
              onChange={(e) => setAlesTva(e.target.value)}
              disabled={seSalveaza || !cote}
            >
              <option value="">Alege…</option>
              {(cote ?? []).map((c) => (
                <option key={c.vat_id} value={String(c.vat_id)}>
                  {c.vat_rate != null
                    /* ⚠ Ei o dau și în procente (21), și în fracții (0.21). Se arată
                       în procente, ca omul să recunoască ce alege. */
                    ? `${c.vat_rate < 1 ? Math.round(c.vat_rate * 100) : c.vat_rate}%`
                    : `Cota #${c.vat_id}`}
                  {c.vat_id === sugerata ? " (potrivită cu magazinul tău)" : ""}
                </option>
              ))}
            </select>
            {/* ⚠ Se spune de ce contează. Un id greșit nu dă eroare: oferta se publică,
                se vinde, și diferența se vede abia la contabilitate. */}
            <span className="mt-1 block text-xs text-muted-foreground">
              eMAG cere prețul fără TVA. O cotă greșită nu dă eroare, produsul se vinde așa.
            </span>
          </label>

          <label className="block">
            <span className="mb-1 block text-sm font-medium">În câte zile expediezi</span>
            <select
              className={CAMP}
              value={alesTimp}
              onChange={(e) => setAlesTimp(e.target.value)}
              disabled={seSalveaza || !timpi}
            >
              <option value="">Alege…</option>
              {/* ⚠ Se filtreaza si aici, desi `aduTimpiPregatire` normalizeaza deja. Forma
                  raspunsului lor NU e in schema (doar `ApiResponse`), iar un „undefined
                  zile" aratat in meniu blocheaza publicarea si arata a defect — s-a
                  intamplat pe 24.08.2026. Doua incuietori, nu una. */}
              {(timpi ?? []).filter((t) => Number.isFinite(t?.value)).map((t) => (
                <option key={t.value} value={String(t.value)}>
                  {t.value === 0 ? "În aceeași zi" : `${t.value} ${t.value === 1 ? "zi" : "zile"}`}
                </option>
              ))}
            </select>
            <span className="mt-1 block text-xs text-muted-foreground">
              Doar valorile pe care le acceptă eMAG. Întârzierea se numără la ei.
            </span>
          </label>
        </div>
      )}

      <button
        type="button"
        onClick={salveaza}
        disabled={seSalveaza || seIncarca || (!alesTva && !alesTimp)}
        className="inline-flex items-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm text-primary-foreground hover:opacity-90 disabled:opacity-60"
      >
        {seSalveaza && <Loader2 className="h-4 w-4 animate-spin" />}
        Salvează
      </button>
    </div>
  );
}
