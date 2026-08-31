"use client";

import { useEffect, useState } from "react";
import { toast } from "sonner";
import { History, Loader2, RotateCcw, X } from "lucide-react";
import {
  listeazaVersiuni,
  revinoLaVersiune,
  type VersiuneInLista,
  type VersiuneRestaurata,
} from "@/lib/actions/blog.actions";

/**
 * Istoricul unui articol, cu revenire.
 *
 * Versiunile se scriau de la bun început, la fiecare salvare, dar nu le citea
 * nimeni: datele erau acolo și inaccesibile. Panoul ăsta le arată.
 *
 * ⚠ REVENIREA ADUCE DOAR TITLUL ȘI TEXTUL. Adresa web, starea, data publicării,
 * etichetele și câmpurile de SEO rămân cele de acum. Motivul stă în
 * `revinoLaVersiune`: o versiune veche a unui articol PUBLICAT i-ar fi adus
 * înapoi și adresa veche, iar aceea e deja în Google. Revenirea la un text nu
 * trebuie să mute pagina.
 *
 * ⚠ NU SE PIERDE NIMIC. Revenirea trece prin aceeași cale ca o salvare, deci
 * starea de ACUM se scrie ea însăși ca versiune înainte să fie înlocuită. Cine
 * revine din greșeală poate reveni înapoi.
 */
export function AdminBlogVersiuni({
  idArticol,
  versiuneaAcum,
  nesalvat,
  deschis,
  inchide,
  dupaRevenire,
}: {
  idArticol: string;
  /**
   * Versiunea de la care pleacă cel care se uită la istoric.
   *
   * ⚠ Se trimite la revenire. Fără ea, revenirea scria peste o salvare făcută de
   * altcineva între deschiderea istoricului și apăsare — adică exact fereastra
   * pe care blocajul optimist există ca s-o închidă.
   */
  versiuneaAcum: () => number | null;
  /**
   * Are omul modificări nesalvate pe ecran?
   *
   * ⚠ REVENIREA PESTE ELE LE PIERDE ÎN TĂCERE. Ea scrie doar titlul și textul —
   * ceea ce e corect. Dar editorul, la întoarcere, punea `nesalvat = false` și
   * ștergea copia locală. Deci un SEO, un slug sau niște etichete schimbate și
   * nesalvate rămâneau pe ecran, arătând ca salvate, peste o bază care nu le are.
   * Omul pleacă și le pierde, fără niciun avertisment.
   *
   * Serverul nu poate repara asta: baza nu știe ce e doar în React.
   */
  nesalvat: boolean;
  deschis: boolean;
  inchide: () => void;
  /**
   * Ce a scris revenirea, ca editorul să-și pună starea din el.
   *
   * ⚠ NU E DOAR UN SEMNAL. `router.refresh()` singur nu ajungea: aduce datele noi
   * de la server, dar nu atinge `useState` din client — deci formularul rămânea
   * cu textul de dinainte și cu numărul de versiune vechi.
   */
  dupaRevenire: (restaurat: VersiuneRestaurata) => void;
}) {
  const [versiuni, setVersiuni] = useState<VersiuneInLista[] | null>(null);
  const [revine, setRevine] = useState<string | null>(null);

  useEffect(() => {
    if (!deschis) return;
    let anulat = false;
    /* Se cere abia la deschidere: un articol cu cincizeci de versiuni n-are de
       ce să fie citit la fiecare intrare în editor. */
    /*
      ⚠ SE PRINDE ARUNCAREA, ANUME.

      De la 31.08.2026 `listeazaVersiuni` ARUNCĂ dacă baza a răspuns cu eroare, în
      loc să întoarcă o listă goală — fiindcă o listă goală aici spunea „articolul
      n-are nicio versiune", iar omul închidea panoul liniștit, convins că n-are la
      ce să se întoarcă.

      Fără `catch` aici, aruncarea ar deveni o respingere neprinsă: panoul ar
      rămâne gol la fel, doar cu o eroare în consolă pe care n-o vede nimeni.
    */
    listeazaVersiuni(idArticol)
      .then((v) => { if (!anulat) setVersiuni(v); })
      .catch(() => {
        if (anulat) return;
        toast.error("Nu am putut încărca istoricul acum. Închide panoul și încearcă din nou.");
      });
    return () => { anulat = true; };
  }, [deschis, idArticol]);

  if (!deschis) return null;

  async function adu(v: VersiuneInLista) {
    const cand = new Date(v.created_at).toLocaleString("ro-RO", {
      day: "numeric", month: "long", hour: "2-digit", minute: "2-digit",
    });
    if (!window.confirm(
      `Aduci înapoi textul de la ${cand}?\n\nCe e acum se păstrează ca versiune, deci poți reveni și de acolo. Adresa web, starea și câmpurile de SEO rămân neatinse.`,
    )) return;

    /*
      ⚠ SE OPREȘTE AICI, NU LA DESCHIDEREA PANOULUI.

      Auditul cerea blocarea istoricului cât timp e ceva nesalvat. Am ales altfel:
      CITITUL istoricului e inofensiv și uneori chiar lucrul de care ai nevoie ca
      să te hotărăști. Ce nu e inofensiv e APĂSAREA.
    */
    if (nesalvat) {
      toast.error(
        "Ai modificări nesalvate. Salvează-le întâi — revenirea la o versiune ar " +
          "lăsa pe ecran câmpuri care nu sunt în bază, iar tu le-ai crede salvate.",
        { duration: 12_000 },
      );
      return;
    }

    setRevine(v.id);
    const res = await revinoLaVersiune(idArticol, v.id, versiuneaAcum());
    setRevine(null);
    if ("error" in res) { toast.error(res.error, { duration: 12_000 }); return; }
    toast.success("Versiunea a fost adusă înapoi.");
    dupaRevenire(res.date);
    inchide();
  }

  return (
    <div className="fixed inset-0 z-50 flex justify-end bg-black/40" onClick={inchide}>
      <aside
        className="h-full w-full max-w-md overflow-y-auto bg-white shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="sticky top-0 flex items-center justify-between border-b border-zinc-200 bg-white px-5 py-4">
          <span className="inline-flex items-center gap-2 text-sm font-semibold text-zinc-900">
            <History className="h-4 w-4" /> Istoricul articolului
          </span>
          <button type="button" onClick={inchide} className="p-1.5 rounded-lg text-zinc-500 hover:bg-zinc-100">
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="p-5">
          {versiuni === null ? (
            <p className="flex items-center gap-2 text-sm text-zinc-500">
              <Loader2 className="h-4 w-4 animate-spin" /> Se încarcă…
            </p>
          ) : versiuni.length === 0 ? (
            <div className="rounded-xl border border-dashed border-zinc-300 p-6 text-center">
              <p className="text-sm text-zinc-600">Nicio versiune încă.</p>
              <p className="mt-1 text-xs text-zinc-500">
                Se scrie câte una la fiecare salvare a articolului, cu textul de dinainte.
              </p>
            </div>
          ) : (
            <>
              <p className="mb-4 text-xs text-zinc-500">
                Se păstrează ultimele 50. Fiecare rând e textul de DINAINTEA acelei salvări.
              </p>
              <ul className="space-y-2">
                {versiuni.map((v) => (
                  <li key={v.id} className="flex items-center gap-3 rounded-xl border border-zinc-200 p-3">
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium text-zinc-900">
                        {v.title || "fără titlu"}
                      </p>
                      <p className="text-xs text-zinc-500">
                        {new Date(v.created_at).toLocaleString("ro-RO", {
                          day: "numeric", month: "short", hour: "2-digit", minute: "2-digit",
                        })}
                        {" · "}
                        {v.marime.toLocaleString("ro-RO")} caractere
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={() => adu(v)}
                      disabled={revine !== null}
                      className="inline-flex shrink-0 items-center gap-1.5 rounded-lg border border-zinc-300 px-2.5 py-1.5 text-xs font-medium text-zinc-700 hover:bg-zinc-50 disabled:opacity-50"
                    >
                      {revine === v.id ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RotateCcw className="h-3.5 w-3.5" />}
                      Adu înapoi
                    </button>
                  </li>
                ))}
              </ul>
            </>
          )}
        </div>
      </aside>
    </div>
  );
}
