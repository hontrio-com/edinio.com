"use client";

import { useState, useTransition } from "react";
import { createPortal } from "react-dom";
import { useRouter } from "next/navigation";
import { AlertCircle, Loader2, UserPlus, X } from "lucide-react";
import { toast } from "sonner";

import { useDialogAccesibil } from "../useDialogAccesibil";
import { CLIENT_GOL, MESAJUL_ADAUGARII, aIntrat, sePoateTrimite, type ClientNou } from "@/lib/customers/gestionare";
import { adaugaClient } from "@/lib/actions/customer-manage.actions";

/**
 * ═══════════════════════════════════════════════════════════════════════════
 * ADAUGAREA UNUI CLIENT DE MANA                                 (21.09.2026)
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * Pentru comenzi telefonice, magazin fizic si lead-uri — cele trei cazuri pe
 * care le-a numit el.
 *
 * ⚠ TELEFONUL SAU EMAILUL E OBLIGATORIU, si se spune pe fata sub campuri, nu
 * dupa apasare. Fara unul dintre ele, omul n-are cheie, deci nu s-ar lega de
 * comenzile lui de mai tarziu: ar ramane un nume singur intr-o lista.
 *
 * ⚠ CELE TREI FELURI DE „NU" NU SE TOPESC INTR-UNUL. Vezi `lib/customers/gestionare.ts`.
 */

export function AdaugaClient({ businessId }: { businessId: string }) {
  const [deschis, setDeschis] = useState(false);

  return (
    <>
      <button
        type="button"
        onClick={() => setDeschis(true)}
        className="inline-flex w-full items-center justify-center gap-2 rounded-xl bg-card px-3 py-2 text-sm font-semibold text-foreground ring-1 ring-foreground/10 transition-colors hover:bg-muted sm:w-auto"
      >
        {/*
          ⚠ Textul se vede SI PE TELEFON. Era ascuns sub `sm`, deci pe telefon
          butonul era o iconiță singură, lângă altă iconiță singură: măsurat,
          „Adaugă client" cere ~130px, iar jumătate de rând de 390px are 165.
          Nu era loc lipsă, era o presupunere.
        */}
        <UserPlus className="h-4 w-4" /> Adaugă client
      </button>
      {deschis && <Formular businessId={businessId} onClose={() => setDeschis(false)} />}
    </>
  );
}

function Camp({
  eticheta, valoare, pune, tip = "text", lat = false, ajutor,
}: {
  eticheta: string;
  valoare: string;
  pune: (v: string) => void;
  tip?: string;
  lat?: boolean;
  ajutor?: string;
}) {
  return (
    <div className={lat ? "sm:col-span-2" : undefined}>
      <label className="mb-1.5 block text-xs font-medium text-muted-foreground">{eticheta}</label>
      <input
        type={tip}
        value={valoare}
        onChange={(e) => pune(e.target.value)}
        className="w-full rounded-xl border border-border bg-surface px-3 py-2 text-sm text-foreground focus:border-primary focus:outline-none"
      />
      {ajutor && <p className="mt-1 text-[11px] text-muted-foreground">{ajutor}</p>}
    </div>
  );
}

function Formular({ businessId, onClose }: { businessId: string; onClose: () => void }) {
  const router = useRouter();
  const [c, setC] = useState<ClientNou>(CLIENT_GOL);
  const [trimite, startTrimitere] = useTransition();
  const [opreste, setOpreste] = useState("");

  const cutia = useDialogAccesibil(true, onClose);
  const gata = sePoateTrimite(c);

  function pune(cheie: keyof ClientNou) {
    return (v: string) => { setC((x) => ({ ...x, [cheie]: v })); setOpreste(""); };
  }

  function trimiteFormularul(e: React.FormEvent) {
    e.preventDefault();
    if (!gata) return;

    startTrimitere(async () => {
      let r: Awaited<ReturnType<typeof adaugaClient>>;
      try {
        r = await adaugaClient(businessId, c);
      } catch (err) {
        toast.error("Nu am primit răspuns: " + (err as Error).message);
        return;
      }
      if ("error" in r) { setOpreste(r.error); return; }

      /*
        ⚠ NUMAI „adaugat" INCHIDE FEREASTRA. Celelalte trei stari inseamna ca nu
        s-a scris nimic: inchisa oricum, comerciantul ar fi ramas cu un mesaj
        fugar si cu impresia ca s-a facut ceva.
      */
      if (!aIntrat(r.stare)) { setOpreste(MESAJUL_ADAUGARII[r.stare]); return; }

      toast.success(MESAJUL_ADAUGARII[r.stare]);
      onClose();
      router.refresh();
    });
  }

  return createPortal(
    <>
      <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm" onClick={onClose} />
      <div
        ref={cutia}
        role="dialog"
        aria-modal="true"
        aria-label="Adaugă un client"
        className="fixed left-1/2 top-1/2 z-50 max-h-[85vh] w-[min(34rem,calc(100vw-2rem))] -translate-x-1/2 -translate-y-1/2 overflow-y-auto rounded-2xl border border-border bg-card p-5 shadow-xl"
      >
        <div className="mb-4 flex items-start justify-between gap-3">
          <div>
            <h2 className="text-base font-semibold text-foreground">Adaugă un client</h2>
            <p className="text-xs text-muted-foreground">
              Pentru comenzi telefonice, vânzări în magazin sau contacte strânse de tine.
            </p>
          </div>
          <button type="button" onClick={onClose} aria-label="Închide" className="text-muted-foreground hover:text-foreground">
            <X className="h-4 w-4" />
          </button>
        </div>

        <form onSubmit={trimiteFormularul} className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <Camp eticheta="Nume" valoare={c.name} pune={pune("name")} lat />
          <Camp
            eticheta="Telefon" valoare={c.phone} pune={pune("phone")} tip="tel"
            ajutor="Telefonul sau emailul — măcar unul."
          />
          <Camp eticheta="Email" valoare={c.email} pune={pune("email")} tip="email" />
          <Camp eticheta="Adresă" valoare={c.address} pune={pune("address")} lat />
          <Camp eticheta="Oraș" valoare={c.city} pune={pune("city")} />
          <Camp eticheta="Județ" valoare={c.county} pune={pune("county")} />
          <Camp eticheta="Cod poștal" valoare={c.postcode} pune={pune("postcode")} />

          {opreste && (
            <p className="flex items-start gap-2 rounded-lg bg-destructive/10 p-3 text-sm text-destructive sm:col-span-2">
              <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" /> {opreste}
            </p>
          )}

          <div className="flex items-center justify-end gap-2 sm:col-span-2">
            <button
              type="button"
              onClick={onClose}
              className="rounded-xl px-3 py-2 text-sm font-medium text-muted-foreground transition-colors hover:text-foreground"
            >
              Renunță
            </button>
            <button
              type="submit"
              disabled={!gata || trimite}
              className="inline-flex items-center gap-2 rounded-xl bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground transition-opacity hover:opacity-90 disabled:opacity-50"
            >
              {trimite && <Loader2 className="h-4 w-4 animate-spin" />} Adaugă clientul
            </button>
          </div>
        </form>
      </div>
    </>,
    document.body,
  );
}
