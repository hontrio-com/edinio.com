"use client";

import { useRef, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { AlertTriangle, CheckCircle2, Link2, Loader2, Search } from "lucide-react";

import {
  cautaComandaDeLegat, leagaComandaDeCont, type ComandaDeLegat,
} from "@/lib/actions/conturi-panou.actions";
import { formatDate, formatPhoneDisplay, formatPrice } from "@/lib/utils/format";

/**
 * Leaga o comanda de cont, de mana: pentru clientul care a comandat de pe alta
 * adresa (a sotiei, a firmei) si vrea sa-si vada comanda in cont.
 *
 * ⚠⚠ IN DOI PASI: intai se CAUTA si se arata comanda (cine a comandat, pe ce
 * email si ce telefon), abia apoi se leaga. Un numar tastat gresit ar fi pus
 * adresa si factura altui om in contul asta, iar clientul le-ar fi vazut.
 * Cand emailul si telefonul comenzii nu sunt ale contului, se spune apasat.
 */
export function LeagaComanda({ businessId, contId }: { businessId: string; contId: string }) {
  const router = useRouter();
  const [lucreaza, start] = useTransition();
  const [deschis, setDeschis] = useState(false);
  const [numar, setNumar] = useState("");
  const numarCurent = useRef("");
  const [gasita, setGasita] = useState<ComandaDeLegat | null>(null);
  const [cautata, setCautata] = useState<string | null>(null);

  function cauta() {
    const n = numar.trim();
    if (!n) return;
    start(async () => {
      let r: Awaited<ReturnType<typeof cautaComandaDeLegat>>;
      try {
        r = await cautaComandaDeLegat(businessId, contId, n);
      } catch {
        toast.error("Nu am primit răspuns. Încearcă din nou.");
        return;
      }
      if ("error" in r) {
        toast.error(r.error);
        return;
      }
      /* Un raspuns venit dupa ce omul a schimbat numarul nu mai e al campului. */
      if (numarCurent.current !== n) return;
      setGasita(r.comanda);
      setCautata(n);
    });
  }

  function leaga(c: ComandaDeLegat) {
    start(async () => {
      let r: Awaited<ReturnType<typeof leagaComandaDeCont>>;
      try {
        r = await leagaComandaDeCont(businessId, contId, c.orderId);
      } catch {
        toast.error("Nu am primit răspuns de la server. Reîncarcă pagina și uită-te la comenzile contului înainte să reiei.");
        return;
      }
      if ("error" in r) {
        toast.error(r.error, { duration: 9000 });
        return;
      }
      toast.success(r.mesaj);
      setDeschis(false);
      setNumar("");
      setGasita(null);
      setCautata(null);
      router.refresh();
    });
  }

  if (!deschis) {
    return (
      <button
        type="button"
        onClick={() => setDeschis(true)}
        className="mt-3 inline-flex items-center gap-1.5 text-xs font-semibold text-primary hover:underline"
      >
        <Link2 className="h-3.5 w-3.5" /> Leagă o comandă de cont
      </button>
    );
  }

  const blocata = gasita && (gasita.marketplace || (gasita.legataDe !== null));

  return (
    <div className="mt-3 rounded-lg bg-muted/50 p-3">
      <p className="text-xs text-muted-foreground">
        Pentru o comandă făcută de client de pe altă adresă, pe care vrea s-o vadă în cont. O vezi întâi, apoi o legi.
      </p>
      <form
        className="mt-2 flex gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          cauta();
        }}
      >
        <input
          value={numar}
          onChange={(e) => {
            setNumar(e.target.value);
            numarCurent.current = e.target.value.trim();
            setGasita(null);
            setCautata(null);
          }}
          placeholder="Numărul comenzii, de ex. 1350"
          aria-label="Numărul comenzii"
          className="min-w-0 flex-1 rounded-lg border border-border bg-surface px-2.5 py-1.5 text-sm text-foreground placeholder:text-muted-foreground focus:border-primary focus:outline-none"
        />
        <button
          type="submit"
          disabled={lucreaza || !numar.trim()}
          className="inline-flex items-center gap-1.5 rounded-lg border border-border bg-surface px-3 py-1.5 text-xs font-semibold text-foreground hover:bg-muted disabled:opacity-50"
        >
          {lucreaza ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Search className="h-3.5 w-3.5" />} Caută
        </button>
      </form>

      {cautata !== null && gasita === null && (
        <p className="mt-2 text-xs text-foreground">Nu am găsit comanda {cautata} în magazinul tău.</p>
      )}

      {gasita && (
        <div className="mt-3 rounded-lg bg-card p-3 ring-1 ring-foreground/10">
          <p className="text-sm font-semibold text-foreground">
            {gasita.numar} · {formatPrice(gasita.total)}
            <span className="ml-1.5 text-xs font-normal text-muted-foreground">{formatDate(gasita.creataLa)}</span>
          </p>
          <p className="mt-0.5 text-xs text-muted-foreground">
            {gasita.numeClient ?? "fără nume"}
            {gasita.emailClient && ` · ${gasita.emailClient}`}
            {gasita.telefonClient && ` · ${formatPhoneDisplay(gasita.telefonClient)}`}
          </p>

          {gasita.marketplace ? (
            <p className="mt-2 text-xs text-foreground">
              E o comandă venită de pe un marketplace. Acelea nu se leagă de conturile magazinului.
            </p>
          ) : gasita.legataDe === contId ? (
            <p className="mt-2 text-xs text-foreground">Este deja în acest cont.</p>
          ) : gasita.legataDe ? (
            <p className="mt-2 text-xs text-foreground">
              E deja legată de{" "}
              <Link href={`/dashboard/customers/conturi/${gasita.legataDe}`} className="font-semibold underline">
                alt cont
              </Link>
              .
            </p>
          ) : gasita.sePotriveste ? (
            <p className="mt-2 flex items-center gap-1.5 text-xs text-foreground">
              <CheckCircle2 className="h-3.5 w-3.5 text-success" /> Emailul sau telefonul comenzii e al contului.
            </p>
          ) : (
            <p className="mt-2 flex items-start gap-1.5 text-xs text-foreground">
              <AlertTriangle className="mt-0.5 h-3.5 w-3.5 flex-shrink-0 text-warning" />
              Emailul și telefonul comenzii NU sunt ale contului. Leag-o numai dacă ești sigur că e a acestui client:
              el va vedea în cont adresa, plata și factura ei.
            </p>
          )}

          {!blocata && (
            <div className="mt-2.5 flex gap-2">
              <button
                type="button"
                onClick={() => leaga(gasita)}
                disabled={lucreaza}
                className="inline-flex items-center gap-1.5 rounded-lg bg-primary px-3 py-1.5 text-xs font-semibold text-white hover:opacity-90 disabled:opacity-50"
              >
                {lucreaza && <Loader2 className="h-3.5 w-3.5 animate-spin" />} Leagă de cont
              </button>
            </div>
          )}
        </div>
      )}

      <button
        type="button"
        onClick={() => {
          setDeschis(false);
          setNumar("");
          setGasita(null);
          setCautata(null);
        }}
        className="mt-2 text-xs font-semibold text-muted-foreground hover:text-foreground"
      >
        Închide
      </button>
    </div>
  );
}
